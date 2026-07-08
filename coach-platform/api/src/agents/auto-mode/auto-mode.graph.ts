import { Inject, Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { END, START, StateGraph } from '@langchain/langgraph';
import { toUtcInstant } from '../../common/util/scheduling';
import { PlannedSession } from '../../planned-sessions/domain/planned-session.model';
import {
  PLANNED_SESSION_REPOSITORY,
  PlannedSessionRepositoryPort,
} from '../../planned-sessions/domain/planned-session.repository.port';
import {
  UpsertSessionContentResult,
} from '../../planned-sessions/application/commands/upsert-session-content.command';
import {
  UpsertSessionScheduleCommand,
} from '../../planned-sessions/application/commands/upsert-session-schedule.command';
import {
  PROGRAM_REPOSITORY,
  ProgramRepositoryPort,
} from '../../program/domain/program.repository.port';
import { SlotCandidate } from '../build/slot-proposer';
import { ApprovalService } from '../approval/approval.service';
import { CalendarSyncService } from '../approval/calendar-sync.service';
import { CoachService } from '../coach/coach.service';
import { ReadinessBand } from '../coach/coach.guardrails';
import {
  checkTargetsSwing,
  checkWeekOverWeekVolume,
  conservativeTargets,
  isWorseReadiness,
  totalNativeVolume,
} from './auto-mode.guardrails';
import { PlannerService } from '../planner/planner.service';
import { RecoveryService } from '../recovery/recovery.service';
import { AgenticLoopResult } from '../shared/llm/agentic-loop.runtime';
import { AutoModeDiff, AutoModeTraceEntry } from './domain/auto-mode-run.model';
import {
  AutoModeGraphState,
  AutoModeState,
  SessionChange,
  SessionEditRequest,
} from './auto-mode.state';

function mkTrace(node: string, summary: string): AutoModeTraceEntry {
  return { node, at: new Date().toISOString(), summary };
}

function hasViolations(state: AutoModeGraphState): 'abort' | 'ok' {
  return state.guardrailViolations.length > 0 ? 'abort' : 'ok';
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Structural subset of a planned session used for before/after diff display. */
function contentSnapshot(s: PlannedSession) {
  return {
    title: s.title,
    estDurationMin: s.estDurationMin,
    intensityLabel: s.intensityLabel,
    running: s.running,
    strength: s.strength,
  };
}

/**
 * The autonomous auto-mode control-flow graph. Each node is a thin adapter
 * over an existing agent-tier service (Coach / Recovery / Planner / Approval)
 * — the LLM tool-calling itself stays inside those services' own
 * `AgenticLoopRuntime` harness; this graph only decides WHICH agent to call
 * next, WHAT to feed it, and WHEN a result is safe to persist.
 *
 * Debate (Coach ⇄ Recovery, bounded at 2 rounds, safety-biased on
 * disagreement) is implemented as a plain loop inside the relevant node
 * rather than as extra graph edges — the graph's job is routing across agent
 * boundaries, not modelling every internal retry.
 */
@Injectable()
export class AutoModeGraph {
  constructor(
    private readonly coach: CoachService,
    private readonly recovery: RecoveryService,
    private readonly planner: PlannerService,
    private readonly approval: ApprovalService,
    private readonly calendarSync: CalendarSyncService,
    private readonly commandBus: CommandBus,
    @Inject(PROGRAM_REPOSITORY)
    private readonly programs: ProgramRepositoryPort,
    @Inject(PLANNED_SESSION_REPOSITORY)
    private readonly plannedSessions: PlannedSessionRepositoryPort,
  ) {}

  private readonly compiled = this.buildGraph();

  async run(initial: AutoModeGraphState): Promise<AutoModeGraphState> {
    return this.compiled.invoke(initial) as Promise<AutoModeGraphState>;
  }

  private buildGraph() {
    return new StateGraph(AutoModeState)
      .addNode('targets', (s) => this.targetsNode(s))
      .addNode('debateNewWeek', (s) => this.debateNewWeekNode(s))
      .addNode('weekGuardrail', (s) => this.weekGuardrailNode(s))
      .addNode('planner', (s) => this.plannerNode(s))
      .addNode('commitNewWeek', (s) => this.commitNewWeekNode(s))
      .addNode('guardEditable', (s) => this.guardEditableNode(s))
      .addNode('debateTargetsEdit', (s) => this.debateTargetsEditNode(s))
      .addNode('commitTargetsEdit', (s) => this.commitTargetsEditNode(s))
      .addNode('debateSessionEdit', (s) => this.debateSessionEditNode(s))
      .addNode('commitSessionEdit', (s) => this.commitSessionEditNode(s))
      .addNode('scheduleSession', (s) => this.scheduleSessionNode(s))
      .addNode('commitScheduleEdit', (s) => this.commitScheduleEditNode(s))
      .addNode('abort', (s) => this.abortNode(s))
      .addConditionalEdges(START, (s) => s.scenario, {
        new_week: 'targets',
        weekly_targets_edit: 'guardEditable',
        session_edit: 'debateSessionEdit',
        session_time_edit: 'scheduleSession',
      })
      .addConditionalEdges('targets', hasViolations, { abort: 'abort', ok: 'debateNewWeek' })
      .addConditionalEdges('debateNewWeek', hasViolations, { abort: 'abort', ok: 'weekGuardrail' })
      .addConditionalEdges('weekGuardrail', hasViolations, { abort: 'abort', ok: 'planner' })
      .addConditionalEdges('planner', hasViolations, { abort: 'abort', ok: 'commitNewWeek' })
      .addEdge('commitNewWeek', END)
      .addConditionalEdges('guardEditable', hasViolations, { abort: 'abort', ok: 'debateTargetsEdit' })
      .addConditionalEdges('debateTargetsEdit', hasViolations, { abort: 'abort', ok: 'commitTargetsEdit' })
      .addEdge('commitTargetsEdit', END)
      .addConditionalEdges('debateSessionEdit', hasViolations, { abort: 'abort', ok: 'commitSessionEdit' })
      .addEdge('commitSessionEdit', END)
      .addConditionalEdges('scheduleSession', hasViolations, { abort: 'abort', ok: 'commitScheduleEdit' })
      .addEdge('commitScheduleEdit', END)
      .addEdge('abort', END)
      .compile();
  }

  // ── new_week ──────────────────────────────────────────────────────────

  private async targetsNode(state: AutoModeGraphState): Promise<Partial<AutoModeGraphState>> {
    const result = await this.coach.generateWeeklyTargets(state.userId, state.runId, state.discipline, {
      weekIndex: state.weekIndex,
      timezone: state.timezone,
    });
    if (!result.terminalResult) {
      return {
        guardrailViolations: ['Coach could not settle weekly targets autonomously within its iteration cap.'],
        trace: [mkTrace('coach', 'Weekly-targets generation did not resolve within the bounded loop.')],
      };
    }
    return { trace: [mkTrace('coach', `Locked week ${state.weekIndex} targets.`)] };
  }

  private async debateNewWeekNode(state: AutoModeGraphState): Promise<Partial<AutoModeGraphState>> {
    const trace: AutoModeTraceEntry[] = [];

    const verdict1 = await this.recovery.assessReadiness(state.userId, state.runId, {
      weekWindow: state.weekWindow,
    });
    if (!verdict1.terminalResult) {
      return {
        guardrailViolations: ['Recovery Guru could not produce a readiness verdict.'],
        trace: [mkTrace('recovery', 'Readiness assessment exhausted its loop without a verdict.')],
      };
    }
    let readiness: ReadinessBand = verdict1.terminalResult.readiness;
    trace.push(
      mkTrace('recovery', `Round 1 readiness: ${readiness.toUpperCase()} — ${verdict1.terminalResult.rationale}`),
    );

    let genResult = await this.coach.generateWeek(state.userId, state.runId, state.discipline, {
      weekIndex: state.weekIndex,
      timezone: state.timezone,
      readiness,
    });
    if (!genResult.terminalResult) {
      return {
        guardrailViolations: ['Coach could not generate the week within its bounded loop.'],
        trace: [...trace, mkTrace('coach', 'Week generation exhausted its loop.')],
      };
    }
    trace.push(mkTrace('coach', `Drafted week ${state.weekIndex} sessions at ${readiness.toUpperCase()} readiness.`));

    let finalVerdict = verdict1.terminalResult;
    const verdict2 = await this.recovery.assessReadiness(state.userId, state.runId, {
      weekWindow: state.weekWindow,
    });
    if (verdict2.terminalResult) {
      trace.push(
        mkTrace(
          'recovery',
          `Round 2 readiness: ${verdict2.terminalResult.readiness.toUpperCase()} — ${verdict2.terminalResult.rationale}`,
        ),
      );
      if (isWorseReadiness(verdict2.terminalResult.readiness, readiness)) {
        readiness = verdict2.terminalResult.readiness;
        finalVerdict = verdict2.terminalResult;
        genResult = await this.coach.generateWeek(state.userId, state.runId, state.discipline, {
          weekIndex: state.weekIndex,
          timezone: state.timezone,
          readiness,
        });
        if (!genResult.terminalResult) {
          return {
            guardrailViolations: [
              'Coach could not regenerate the week within its bounded loop after Recovery disagreed.',
            ],
            trace: [...trace, mkTrace('coach', 'Conservative week regeneration exhausted its loop.')],
          };
        }
        trace.push(
          mkTrace(
            'coach',
            `Regenerated week ${state.weekIndex} at the more conservative ${readiness.toUpperCase()} band (debate round 2, safety-biased).`,
          ),
        );
      } else {
        finalVerdict = verdict2.terminalResult;
      }
    }

    return { recoveryVerdict: finalVerdict, readinessBand: readiness, trace };
  }

  private async weekGuardrailNode(state: AutoModeGraphState): Promise<Partial<AutoModeGraphState>> {
    const [program, weekSessions, priorWeekSessions] = await Promise.all([
      this.programs.findById(state.userId, state.programId),
      this.plannedSessions.findByWeek(state.userId, state.programId, state.weekIndex),
      this.plannedSessions.findByWeek(state.userId, state.programId, state.weekIndex - 1),
    ]);
    const week = program?.weeks.find((w) => w.weekIndex === state.weekIndex);
    const isDeload = week?.theme === 'deload' || week?.theme === 'taper';
    const proposedVolume = totalNativeVolume(weekSessions);
    const priorVolume = totalNativeVolume(priorWeekSessions);
    const violations = checkWeekOverWeekVolume(priorVolume, proposedVolume, isDeload);
    const targets = week?.weeklyTargets ?? null;

    return {
      guardrailViolations: violations,
      diff: targets
        ? {
            weeklyTargets: {
              before: null,
              after: { sessionCount: targets.sessionCount, totalVolume: targets.totalVolume, keyGoals: targets.keyGoals },
            },
          }
        : {},
      trace: [
        mkTrace(
          'guardrail',
          violations.length > 0
            ? `Guardrail violation: ${violations.join(' ')}`
            : `Week-over-week volume check passed (${proposedVolume.toFixed(1)} vs prior ${priorVolume.toFixed(1)}).`,
        ),
      ],
    };
  }

  private async plannerNode(state: AutoModeGraphState): Promise<Partial<AutoModeGraphState>> {
    const result = await this.planner.placeWeek(state.userId, state.runId, {
      weekWindow: state.weekWindow,
      timezone: state.timezone,
    });
    if (!result.terminalResult) {
      return {
        guardrailViolations: ['Planner could not place all sessions within its bounded loop.'],
        trace: [mkTrace('planner', 'Placement exhausted its loop.')],
      };
    }
    const r = result.terminalResult;
    return {
      trace: [
        mkTrace(
          'planner',
          `Placed ${r.placedCount} session(s)${r.unplaceable.length > 0 ? `; ${r.unplaceable.length} unplaceable` : ''}.`,
        ),
      ],
    };
  }

  private async commitNewWeekNode(state: AutoModeGraphState): Promise<Partial<AutoModeGraphState>> {
    const result = await this.approval.approveWeek(state.userId, state.programId, state.weekIndex);
    const sessions = await this.plannedSessions.findByWeek(state.userId, state.programId, state.weekIndex);
    return {
      status: 'committed',
      diff: {
        sessions: sessions.map((s) => ({
          sessionId: s.id ?? '',
          before: null,
          after: { title: s.title, type: s.type, scheduledDate: s.scheduledDate, startTime: s.startTime },
        })),
      },
      trace: [
        mkTrace(
          'commit',
          `Committed ${result.committed} session(s); calendar synced ${result.calendar.synced}/${
            result.calendar.synced + result.calendar.failed
          }.`,
        ),
      ],
    };
  }

  // ── weekly_targets_edit ───────────────────────────────────────────────

  private async guardEditableNode(state: AutoModeGraphState): Promise<Partial<AutoModeGraphState>> {
    const program = await this.programs.findById(state.userId, state.programId);
    const week = program?.weeks.find((w) => w.weekIndex === state.weekIndex);
    // A missing/legacy weekState behaves like 'open': nothing locked yet.
    // Both 'targets_locked' and 'locked' weeks have revisable targets —
    // `reviseWeeklyTargets` works in place on either (see
    // program.repository.port.ts) — so only 'open' blocks the edit.
    const weekState = week?.weekState ?? 'open';
    if (!week || weekState === 'open') {
      return {
        guardrailViolations: [
          "This week's plan targets haven't been locked in yet, so there's nothing to revise — " +
            'finish setting up the week first.',
        ],
        trace: [
          mkTrace(
            'guardrail',
            `Week ${state.weekIndex} weekState is '${week?.weekState ?? 'missing'}' — a targets edit needs targets_locked or locked.`,
          ),
        ],
      };
    }
    const previous = week.weeklyTargets;
    if (!previous) {
      return {
        guardrailViolations: [`Week ${state.weekIndex} has no locked targets to revise.`],
        trace: [mkTrace('guardrail', 'No weeklyTargets on the week.')],
      };
    }
    const req = state.weeklyTargetsEditRequest;
    const proposed = {
      sessionCount: req?.sessionCount ?? previous.sessionCount,
      totalVolume: req?.totalVolume ?? previous.totalVolume,
    };
    const violations = checkTargetsSwing({
      previous: { sessionCount: previous.sessionCount, totalVolume: previous.totalVolume },
      proposed,
    });
    return {
      guardrailViolations: violations,
      diff: {
        weeklyTargets: {
          before: { sessionCount: previous.sessionCount, totalVolume: previous.totalVolume, keyGoals: previous.keyGoals },
          after: null,
        },
      },
      trace: [
        mkTrace(
          'guardrail',
          violations.length > 0
            ? `Guardrail violation: ${violations.join(' ')}`
            : 'Targets swing within autonomous bounds.',
        ),
      ],
    };
  }

  private async debateTargetsEditNode(state: AutoModeGraphState): Promise<Partial<AutoModeGraphState>> {
    const req = state.weeklyTargetsEditRequest;
    if (!req) {
      return {
        guardrailViolations: [
          "I couldn't tell what you wanted this week's targets changed to, so I stopped rather than guess.",
        ],
        trace: [mkTrace('guardrail', 'weekly_targets_edit reached the debate node without a weeklyTargetsEditRequest — aborting.')],
      };
    }
    const program = await this.programs.findById(state.userId, state.programId);
    const week = program?.weeks.find((w) => w.weekIndex === state.weekIndex);
    const previous = week?.weeklyTargets;
    if (!week || !previous) {
      return {
        guardrailViolations: [`Week ${state.weekIndex} targets disappeared mid-run.`],
        trace: [mkTrace('guardrail', 'Week/targets missing at debate time.')],
      };
    }
    let proposed = {
      sessionCount: req.sessionCount ?? previous.sessionCount,
      totalVolume: req.totalVolume ?? previous.totalVolume,
      keyGoals: req.keyGoals ?? previous.keyGoals,
    };

    const trace: AutoModeTraceEntry[] = [];
    let verdict = await this.recovery.assessReadiness(state.userId, state.runId, { weekWindow: state.weekWindow });
    if (!verdict.terminalResult) {
      return {
        guardrailViolations: ['Recovery Guru could not produce a readiness verdict.'],
        trace: [mkTrace('recovery', 'Readiness assessment exhausted its loop.')],
      };
    }
    let readiness: ReadinessBand = verdict.terminalResult.readiness;
    trace.push(mkTrace('recovery', `Round 1 readiness: ${readiness.toUpperCase()} — ${verdict.terminalResult.rationale}`));

    let round = 1;
    let sessionChanges: SessionChange[] = [];
    let writesPerformed = false;

    while (true) {
      await this.coach.reviseWeeklyTargets(
        state.userId,
        state.programId,
        state.weekIndex,
        proposed,
        'direct_target_change',
        req.reason,
      );
      writesPerformed = true;
      trace.push(
        mkTrace('coach', `Revised week ${state.weekIndex} targets to ${proposed.sessionCount} sessions / ${proposed.totalVolume} volume.`),
      );

      const genResult = await this.coach.generateWeek(state.userId, state.runId, state.discipline, {
        weekIndex: state.weekIndex,
        timezone: state.timezone,
        readiness,
      });
      if (genResult.terminalResult) {
        trace.push(mkTrace('coach', 'Realigned any still-tentative sessions to the new targets.'));
      }

      const cascade = await this.cascadeCommittedSessions(state, proposed, readiness);
      trace.push(...cascade.trace);
      sessionChanges = cascade.sessionChanges;
      writesPerformed = writesPerformed || cascade.wrote;

      if (cascade.violations.length === 0) {
        if (round >= 2) {
          break;
        }
        const verdict2 = await this.recovery.assessReadiness(state.userId, state.runId, {
          weekWindow: state.weekWindow,
        });
        if (verdict2.terminalResult) {
          trace.push(
            mkTrace(
              'recovery',
              `Round 2 readiness: ${verdict2.terminalResult.readiness.toUpperCase()} — ${verdict2.terminalResult.rationale}`,
            ),
          );
          const isIncrease = proposed.totalVolume > previous.totalVolume;
          if (isIncrease && isWorseReadiness(verdict2.terminalResult.readiness, readiness)) {
            readiness = verdict2.terminalResult.readiness;
            verdict = verdict2;
            proposed = conservativeTargets(
              { sessionCount: previous.sessionCount, totalVolume: previous.totalVolume },
              proposed,
            );
            round += 1;
            trace.push(
              mkTrace(
                'debate',
                `Recovery disagreed post-change; retrying at the conservative midpoint (${proposed.sessionCount} sessions / ${proposed.totalVolume} volume).`,
              ),
            );
            continue;
          }
          verdict = verdict2;
        }
        break;
      }

      if (round >= 2) {
        return {
          writesPerformed,
          guardrailViolations: [cascade.violations.join(' ')],
          trace: [...trace, mkTrace('abort', 'Could not reconcile the targets edit with existing committed sessions after 2 rounds.')],
        };
      }
      proposed = conservativeTargets(
        { sessionCount: previous.sessionCount, totalVolume: previous.totalVolume },
        proposed,
      );
      round += 1;
      trace.push(
        mkTrace(
          'debate',
          `Committed-session cascade breached targets; retrying at the conservative midpoint (${proposed.sessionCount} sessions / ${proposed.totalVolume} volume).`,
        ),
      );
    }

    return {
      writesPerformed,
      recoveryVerdict: verdict.terminalResult ?? null,
      readinessBand: readiness,
      sessionChanges,
      diff: {
        weeklyTargets: {
          before: { sessionCount: previous.sessionCount, totalVolume: previous.totalVolume, keyGoals: previous.keyGoals },
          after: proposed,
        },
      },
      trace,
    };
  }

  private async cascadeCommittedSessions(
    state: AutoModeGraphState,
    targets: { sessionCount: number; totalVolume: number; keyGoals: string[] },
    readiness: ReadinessBand,
  ): Promise<{
    violations: string[];
    sessionChanges: SessionChange[];
    trace: AutoModeTraceEntry[];
    /** True when at least one committed session was actually rewritten. */
    wrote: boolean;
  }> {
    const weekSessions = await this.plannedSessions.findByWeek(state.userId, state.programId, state.weekIndex);
    const committed = weekSessions.filter((s) => s.planState === 'committed');
    const violations: string[] = [];
    const sessionChanges: SessionChange[] = [];
    const trace: AutoModeTraceEntry[] = [];
    let wrote = false;

    for (const session of committed) {
      if (!session.id) {
        continue;
      }
      const before = contentSnapshot(session);
      const description =
        `Rebalance this session so the week fits the revised weekly targets ` +
        `(${targets.sessionCount} sessions, ${targets.totalVolume} total volume). Reason for the ` +
        `change: ${state.weeklyTargetsEditRequest?.reason ?? 'weekly targets revised'}. Readiness: ${readiness}.`;
      const result = await this.coach.reviseSessionContent(state.userId, state.runId, state.discipline, {
        programId: state.programId,
        weekIndex: state.weekIndex,
        timezone: state.timezone,
        plannedSessionId: session.id,
        requestedChangeDescription: description,
      });
      if (!result.terminalResult) {
        violations.push(`Could not rebalance committed session "${session.title}" (${session.id}) to fit the new targets.`);
        trace.push(mkTrace('coach', `Rebalance of "${session.title}" exhausted its loop.`));
        continue;
      }
      wrote = true;
      await this.resyncIfCommitted(state.userId, session.id);
      const after = await this.plannedSessions.findById(state.userId, session.id);
      sessionChanges.push({
        sessionId: session.id,
        before,
        after: after ? contentSnapshot(after) : null,
      });
      trace.push(mkTrace('coach', `Rebalanced "${session.title}" to fit the revised targets.`));
    }

    return { violations, sessionChanges, trace, wrote };
  }

  private async commitTargetsEditNode(state: AutoModeGraphState): Promise<Partial<AutoModeGraphState>> {
    return {
      status: 'committed',
      diff: { sessions: state.sessionChanges },
      trace: [mkTrace('commit', `Weekly targets revised and ${state.sessionChanges.length} committed session(s) rebalanced.`)],
    };
  }

  // ── session_edit ──────────────────────────────────────────────────────

  private async debateSessionEditNode(state: AutoModeGraphState): Promise<Partial<AutoModeGraphState>> {
    const req = state.sessionEditRequest;
    if (!req) {
      return {
        guardrailViolations: [
          "I couldn't tell which session this change targets, so I stopped rather than guess.",
        ],
        trace: [mkTrace('guardrail', 'session_edit reached the debate node without a sessionEditRequest — aborting.')],
      };
    }
    const before = await this.plannedSessions.findById(state.userId, req.plannedSessionId);
    if (!before) {
      return {
        guardrailViolations: [`Planned session ${req.plannedSessionId} not found.`],
        trace: [mkTrace('guardrail', 'Session not found.')],
      };
    }
    const beforeSnapshot = contentSnapshot(before);
    const trace: AutoModeTraceEntry[] = [];
    let wrote = false;

    let result = await this.coach.reviseSessionContent(state.userId, state.runId, state.discipline, {
      programId: state.programId,
      weekIndex: state.weekIndex,
      timezone: state.timezone,
      plannedSessionId: req.plannedSessionId,
      requestedChangeDescription: req.requestedChangeDescription,
    });
    wrote = wrote || result.terminalResult != null;
    trace.push(
      mkTrace(
        'coach',
        result.terminalResult
          ? 'Applied the requested session edit.'
          : 'The edit did not fit the locked weekly targets within the bounded loop.',
      ),
    );

    let extraDiff: AutoModeDiff = {};

    if (!result.terminalResult) {
      const verdict = await this.recovery.assessReadiness(state.userId, state.runId, { weekWindow: state.weekWindow });
      if (!verdict.terminalResult) {
        return {
          guardrailViolations: ['Recovery Guru could not produce a readiness verdict for the escalation.'],
          trace: [...trace, mkTrace('recovery', 'Readiness assessment exhausted its loop.')],
        };
      }
      trace.push(
        mkTrace(
          'recovery',
          `Escalation readiness: ${verdict.terminalResult.readiness.toUpperCase()} — ${verdict.terminalResult.rationale}`,
        ),
      );

      const program = await this.programs.findById(state.userId, state.programId);
      const week = program?.weeks.find((w) => w.weekIndex === state.weekIndex);
      const targets = week?.weeklyTargets;

      if (verdict.terminalResult.readiness === 'green' && targets) {
        const bumped = {
          sessionCount: targets.sessionCount,
          totalVolume: Math.round(targets.totalVolume * 1.1 * 10) / 10,
          keyGoals: targets.keyGoals,
        };
        const swingViolations = checkTargetsSwing({
          previous: { sessionCount: targets.sessionCount, totalVolume: targets.totalVolume },
          proposed: bumped,
        });
        if (swingViolations.length === 0) {
          await this.coach.reviseWeeklyTargets(
            state.userId,
            state.programId,
            state.weekIndex,
            bumped,
            'session_edit',
            `Autonomous session-edit escalation: readiness green, bumping volume budget to fit "${req.requestedChangeDescription}".`,
          );
          wrote = true;
          trace.push(mkTrace('coach', `Bumped weekly volume budget to ${bumped.totalVolume} to accommodate the edit.`));
          extraDiff = {
            weeklyTargets: {
              before: { sessionCount: targets.sessionCount, totalVolume: targets.totalVolume, keyGoals: targets.keyGoals },
              after: bumped,
            },
          };
          result = await this.coach.reviseSessionContent(state.userId, state.runId, state.discipline, {
            programId: state.programId,
            weekIndex: state.weekIndex,
            timezone: state.timezone,
            plannedSessionId: req.plannedSessionId,
            requestedChangeDescription: req.requestedChangeDescription,
          });
          wrote = wrote || result.terminalResult != null;
          trace.push(
            mkTrace('coach', result.terminalResult ? 'Applied the edit under the bumped target.' : 'Edit still did not fit after bumping the target.'),
          );
        }
      }

      if (!result.terminalResult) {
        result = await this.coach.reviseSessionContent(state.userId, state.runId, state.discipline, {
          programId: state.programId,
          weekIndex: state.weekIndex,
          timezone: state.timezone,
          plannedSessionId: req.plannedSessionId,
          requestedChangeDescription: `${req.requestedChangeDescription} Constraint: you MUST stay within the current locked weekly targets — moderate the request rather than breach them.`,
        });
        wrote = wrote || result.terminalResult != null;
        trace.push(
          mkTrace(
            'coach',
            result.terminalResult
              ? 'Applied a moderated edit that stays within the existing targets.'
              : 'Could not reconcile the edit with the existing targets.',
          ),
        );
      }

      if (!result.terminalResult) {
        return {
          // The bump write may already have landed even though the edit failed.
          writesPerformed: wrote,
          guardrailViolations: ['Could not reconcile the session edit with the weekly targets after escalation.'],
          trace: [...trace, mkTrace('abort', 'Session edit unresolved after 2 rounds.')],
        };
      }
    }

    return this.finishSessionEdit(state, req, beforeSnapshot, result, extraDiff, trace);
  }

  private async finishSessionEdit(
    state: AutoModeGraphState,
    req: SessionEditRequest,
    beforeSnapshot: unknown,
    _result: AgenticLoopResult<UpsertSessionContentResult>,
    extraDiff: AutoModeDiff,
    trace: AutoModeTraceEntry[],
  ): Promise<Partial<AutoModeGraphState>> {
    await this.resyncIfCommitted(state.userId, req.plannedSessionId);
    const after = await this.plannedSessions.findById(state.userId, req.plannedSessionId);
    const afterSnapshot = after ? contentSnapshot(after) : null;
    const change: SessionChange = { sessionId: req.plannedSessionId, before: beforeSnapshot, after: afterSnapshot };
    return {
      // finishSessionEdit is only reached after a successful content revise.
      writesPerformed: true,
      sessionChanges: [change],
      diff: { ...extraDiff, sessions: [change] },
      trace,
    };
  }

  private async commitSessionEditNode(_state: AutoModeGraphState): Promise<Partial<AutoModeGraphState>> {
    return { status: 'committed', trace: [mkTrace('commit', 'Session edit committed.')] };
  }

  // ── session_time_edit ─────────────────────────────────────────────────

  private async scheduleSessionNode(state: AutoModeGraphState): Promise<Partial<AutoModeGraphState>> {
    const req = state.sessionTimeEditRequest;
    if (!req) {
      return {
        guardrailViolations: [
          "I couldn't tell which session you wanted to move, so I stopped rather than guess.",
        ],
        trace: [mkTrace('guardrail', 'session_time_edit reached the schedule node without a sessionTimeEditRequest — aborting.')],
      };
    }
    const before = await this.plannedSessions.findById(state.userId, req.plannedSessionId);
    if (!before) {
      return {
        guardrailViolations: [`Planned session ${req.plannedSessionId} not found.`],
        trace: [mkTrace('guardrail', 'Session not found.')],
      };
    }
    const beforeSchedule = { date: before.scheduledDate, startTime: before.startTime };
    const trace: AutoModeTraceEntry[] = [];

    let slot: SlotCandidate | null = null;
    if (req.requestedDate && req.requestedStartTime) {
      const startTime = req.requestedStartTime;
      const endTime = addMinutes(startTime, before.estDurationMin);
      const scheduledStartUtc = toUtcInstant(req.requestedDate, startTime, state.timezone);
      const candidate: SlotCandidate = { scheduledDate: req.requestedDate, startTime, endTime, scheduledStartUtc };
      const violations = await this.planner.validateSlot(
        state.userId,
        { weekWindow: state.weekWindow, timezone: state.timezone },
        candidate,
      );
      if (violations.length === 0) {
        slot = candidate;
        trace.push(mkTrace('planner', `Validated the requested slot ${slot.scheduledDate} ${slot.startTime}.`));
      }
    }

    if (!slot) {
      const candidates = await this.planner.proposeSlotsForSession(state.userId, {
        weekWindow: state.weekWindow,
        timezone: state.timezone,
        durationMin: before.estDurationMin,
        preferredDate: req.requestedDate ?? before.scheduledDate,
        limit: 1,
      });
      slot = candidates[0] ?? null;
      trace.push(
        mkTrace(
          'planner',
          slot
            ? `Requested slot unavailable; auto-picked ${slot.scheduledDate} ${slot.startTime}.`
            : 'No requested slot given/available; auto-pick found no free slot.',
        ),
      );
    }

    if (!slot) {
      return {
        guardrailViolations: [`No clash-free slot found for session ${req.plannedSessionId} in week ${state.weekIndex}.`],
        trace,
      };
    }

    await this.commandBus.execute(
      new UpsertSessionScheduleCommand(state.userId, req.plannedSessionId, {
        scheduledDate: slot.scheduledDate,
        startTime: slot.startTime,
        endTime: slot.endTime,
        timezone: state.timezone,
        scheduledStartUtc: slot.scheduledStartUtc,
      }),
    );
    await this.resyncIfCommitted(state.userId, req.plannedSessionId);
    trace.push(mkTrace('commit', `Rescheduled to ${slot.scheduledDate} ${slot.startTime}.`));

    return {
      writesPerformed: true,
      diff: {
        schedule: [
          {
            sessionId: req.plannedSessionId,
            before: beforeSchedule,
            after: { date: slot.scheduledDate, startTime: slot.startTime },
          },
        ],
      },
      trace,
    };
  }

  private async commitScheduleEditNode(_state: AutoModeGraphState): Promise<Partial<AutoModeGraphState>> {
    return { status: 'committed', trace: [mkTrace('commit', 'Schedule edit committed.')] };
  }

  // ── shared ────────────────────────────────────────────────────────────

  private async abortNode(state: AutoModeGraphState): Promise<Partial<AutoModeGraphState>> {
    const reason = state.guardrailViolations.join(' ') || 'Aborted.';
    return { status: 'aborted', abortReason: reason, trace: [mkTrace('abort', reason)] };
  }

  private async resyncIfCommitted(userId: string, plannedSessionId: string): Promise<void> {
    const session = await this.plannedSessions.findById(userId, plannedSessionId);
    if (!session || session.planState !== 'committed' || !session.id) {
      return;
    }
    await this.calendarSync.syncWeek(userId, [
      {
        id: session.id,
        title: session.title,
        running: session.running,
        strength: session.strength,
        scheduledStartUtc: session.scheduledStartUtc,
        estDurationMin: session.estDurationMin,
        timezone: session.timezone,
        calendarSync: session.calendarSync,
      },
    ]);
  }
}
