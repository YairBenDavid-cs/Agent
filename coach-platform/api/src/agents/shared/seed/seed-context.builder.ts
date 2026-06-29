import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GenerationContext } from '../../../personalization/domain/generation-context.model';
import { RecoveryContext } from '../../../personalization/domain/generation-context.model';
import { GetGenerationContextQuery } from '../../../personalization/application/queries/get-generation-context.query';
import { GetRecoveryContextQuery } from '../../../personalization/application/queries/get-recovery-context.query';
import { GetSchedulingContextQuery } from '../../../personalization/application/queries/get-scheduling-context.query';
import { SchedulingContext } from '../../../personalization/domain/generation-context.model';
import { TimeWindow } from '../../../personalization/domain/pref-entry.model';
import { GetTrainingProfileQuery } from '../../../training/application/queries/get-training-profile.query';
import {
  TrainingProfileResponse,
  TrainingProfileStatusResponse,
} from '../../../training/application/dto/training-profile.response';
import { detectColdStart } from './cold-start';
import {
  buildPreferenceWindows,
  PreferenceWindows,
  renderPreferenceWindows,
} from './preference-context';
import { EventDiscipline } from '../../../personalization/domain/preference-event.model';
import { GetActiveProgramQuery } from '../../../program/application/queries/get-active-program.query';
import { ActiveProgramResponse } from '../../../program/application/dto/program.response';
import { GetCalendarRangeQuery } from '../../../planned-sessions/application/queries/get-calendar-range.query';
import { PlannedSessionResponse } from '../../../planned-sessions/application/dto/planned-session.response';
import { FindSessionsQuery } from '../../../sessions/application/queries/find-sessions.query';
import {
  GetCurrentProfileQuery,
  GetPerformanceRangeQuery,
} from '../../../performance/application/queries/performance.queries';
import { GetRecoveryRangeQuery } from '../../../recovery/application/queries/get-recovery-range.query';

/** Inclusive day window helper — `back` days before today (UTC) → today. */
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ItemsEnvelope<T> {
  items: T[];
}

export interface CoachSeed {
  discipline: EventDiscipline;
  goal: {
    primaryGoal: string;
    note: string | null;
    horizonDate: string;
    weeksUntilGoal: number | null;
  } | null;
  programId: string | null;
  currentWeekIndex: number | null;
  skeletonWeeks: unknown[];
  plannedRecent: PlannedSessionResponse[];
  observedSessions: unknown[];
  performanceDaily: unknown[];
  performanceProfile: unknown;
  recoveryRollup: unknown[];
  /** Onboarding survey baseline — the cold-start fallback when history is thin. */
  onboarding: TrainingProfileResponse | null;
  /** True when there is no program / sessions / performance to seed from yet. */
  isColdStart: boolean;
  /**
   * Distilled preference signals split by confidence: explicit → near-term
   * guardrails for this week, inferred → long-term bias for future weeks.
   */
  preferenceWindows: PreferenceWindows;
  personalizationPrompt: string;
  /** The rendered, pre-seeded context message for the agentic loop. */
  seedMessage: string;
}

export interface RecoverySeed {
  today: unknown | null;
  trend7d: unknown[];
  observedLoad7d: unknown[];
  thisWeekOutcomes: PlannedSessionResponse[];
  planUnderReview: PlannedSessionResponse[];
  personalizationPrompt: string;
  seedMessage: string;
}

export interface PlannerSeed {
  weekWindow: { from: string; to: string };
  /** The tentative sessions to place (Coach's content + estDurationMin). */
  sessionsToPlace: PlannedSessionResponse[];
  /** Recurring weekly availability slots from the training profile. */
  availability: unknown[];
  /** HARD blocked windows — the pre-write validator refuses to place into these. */
  hardBlockedWindows: TimeWindow[];
  timezone: string | null;
  personalizationPrompt: string;
  seedMessage: string;
}

/**
 * Assembles the curated, pre-seeded context slice each specialist starts from,
 * so the common case needs ZERO read-tool calls. Lives in the agent tier (which
 * may depend on every bounded context) and composes purely through the CQRS
 * QueryBus — so personalization stays preference-only and uncoupled from the
 * performance/recovery/program modules.
 *
 * Numeric blocks are emitted as JSON (consumed programmatically); the qualitative
 * personalization slice is emitted as the existing flattened prose.
 */
@Injectable()
export class SeedContextBuilder {
  constructor(private readonly queryBus: QueryBus) {}

  /** Coach 8-block seed (goal, skeleton, planned, sessions, perf, profile, recovery, prefs). */
  async buildCoachSeed(
    userId: string,
    discipline: EventDiscipline,
  ): Promise<CoachSeed> {
    const [
      program,
      plannedRecent,
      sessions,
      performance,
      profile,
      recovery,
      generation,
      trainingProfile,
    ] = await Promise.all([
      this.queryBus.execute<GetActiveProgramQuery, ActiveProgramResponse>(
        new GetActiveProgramQuery(userId),
      ),
      this.queryBus.execute<GetCalendarRangeQuery, PlannedSessionResponse[]>(
        new GetCalendarRangeQuery(userId, isoDaysAgo(21), isoDaysAgo(-7)),
      ),
      this.queryBus.execute<FindSessionsQuery, ItemsEnvelope<unknown>>(
        new FindSessionsQuery(
          userId,
          isoDaysAgo(7),
          todayIso(),
          discipline,
          null,
          20,
        ),
      ),
      this.queryBus.execute<GetPerformanceRangeQuery, ItemsEnvelope<unknown>>(
        new GetPerformanceRangeQuery(userId, isoDaysAgo(28), todayIso(), null, 5),
      ),
      this.queryBus.execute(new GetCurrentProfileQuery(userId)),
      this.queryBus.execute<GetRecoveryRangeQuery, ItemsEnvelope<unknown>>(
        new GetRecoveryRangeQuery(userId, isoDaysAgo(7), todayIso(), null, 7),
      ),
      this.queryBus.execute<GetGenerationContextQuery, GenerationContext>(
        new GetGenerationContextQuery(userId, discipline),
      ),
      this.queryBus.execute<
        GetTrainingProfileQuery,
        TrainingProfileStatusResponse
      >(new GetTrainingProfileQuery(userId)),
    ]);

    const p = program.program;
    const isColdStart = detectColdStart({
      hasProgram: !!p,
      observedSessionCount: sessions.items.length,
      performanceCount: performance.items.length,
    });
    const goal = p
      ? {
          primaryGoal: p.goalSnapshot.primaryGoal,
          note: p.goalSnapshot.note ?? null,
          horizonDate: p.horizonDate,
          weeksUntilGoal: weeksUntil(p.horizonDate),
        }
      : null;

    const seed: CoachSeed = {
      discipline,
      goal,
      programId: p?.id ?? null,
      currentWeekIndex: p?.currentWeekIndex ?? null,
      skeletonWeeks: p?.weeks ?? [],
      plannedRecent,
      observedSessions: sessions.items,
      performanceDaily: performance.items,
      performanceProfile: profile,
      recoveryRollup: recovery.items,
      onboarding: trainingProfile.profile,
      isColdStart,
      // Distilled preference projection (replaces the revision windows): explicit
      // signals become near-term guardrails, inferred ones long-term bias. Drawn
      // from the near-term one-offs + recent standing events the context surfaces.
      preferenceWindows: buildPreferenceWindows([
        ...generation.activeOneOffs,
        ...generation.recentStandingEvents,
      ]),
      personalizationPrompt: generation.promptText,
      seedMessage: '',
    };
    seed.seedMessage = renderCoachSeed(seed);
    return seed;
  }

  /** Recovery Guru 9-block seed (today + trend + load + outcomes + plan + prefs). */
  async buildRecoverySeed(
    userId: string,
    weekWindow: { from: string; to: string },
  ): Promise<RecoverySeed> {
    const [recovery, sessions, week, recoveryCtx] = await Promise.all([
      this.queryBus.execute<GetRecoveryRangeQuery, ItemsEnvelope<unknown>>(
        new GetRecoveryRangeQuery(userId, isoDaysAgo(7), todayIso(), null, 7),
      ),
      this.queryBus.execute<FindSessionsQuery, ItemsEnvelope<unknown>>(
        new FindSessionsQuery(userId, isoDaysAgo(7), todayIso(), null, null, 20),
      ),
      this.queryBus.execute<GetCalendarRangeQuery, PlannedSessionResponse[]>(
        new GetCalendarRangeQuery(userId, weekWindow.from, weekWindow.to),
      ),
      this.queryBus.execute<GetRecoveryContextQuery, RecoveryContext>(
        new GetRecoveryContextQuery(userId),
      ),
    ]);

    const trend = recovery.items;
    const today = trend.length > 0 ? trend[trend.length - 1] : null;
    // Plan under review = sessions not yet completed in the target week.
    const planUnderReview = week.filter(
      (s) => s.outcome?.status === 'planned',
    );

    const seed: RecoverySeed = {
      today,
      trend7d: trend,
      observedLoad7d: sessions.items,
      thisWeekOutcomes: week,
      planUnderReview,
      personalizationPrompt: recoveryCtx.promptText,
      seedMessage: '',
    };
    seed.seedMessage = renderRecoverySeed(seed);
    return seed;
  }

  /** Planner seed: the week's tentative sessions to place + availability + windows. */
  async buildPlannerSeed(
    userId: string,
    weekWindow: { from: string; to: string },
    timezone: string | null,
  ): Promise<PlannerSeed> {
    const [week, profile, scheduling] = await Promise.all([
      this.queryBus.execute<GetCalendarRangeQuery, PlannedSessionResponse[]>(
        new GetCalendarRangeQuery(userId, weekWindow.from, weekWindow.to),
      ),
      this.queryBus.execute<
        GetTrainingProfileQuery,
        TrainingProfileStatusResponse
      >(new GetTrainingProfileQuery(userId)),
      this.queryBus.execute<GetSchedulingContextQuery, SchedulingContext>(
        new GetSchedulingContextQuery(userId),
      ),
    ]);

    // Place only sessions still tentative (not yet committed/locked).
    const sessionsToPlace = week.filter((s) => s.planState === 'tentative');

    const hardBlockedWindows = scheduling.blockedTimeWindows
      .filter((w) => w.strength === 'hard')
      .map((w) => w.value);

    const seed: PlannerSeed = {
      weekWindow,
      sessionsToPlace,
      availability: profile.profile?.availability ?? [],
      hardBlockedWindows,
      timezone,
      personalizationPrompt: scheduling.promptText,
      seedMessage: '',
    };
    seed.seedMessage = renderPlannerSeed(seed);
    return seed;
  }
}

function weeksUntil(horizonDate: string): number | null {
  const horizon = new Date(horizonDate).getTime();
  if (Number.isNaN(horizon)) return null;
  const diffMs = horizon - Date.now();
  return Math.max(0, Math.round(diffMs / (7 * 24 * 60 * 60 * 1000)));
}

function jsonBlock(label: string, value: unknown): string {
  return `### ${label}\n${JSON.stringify(value ?? null, null, 0)}`;
}

function renderCoachSeed(seed: CoachSeed): string {
  const coldStartNote = seed.isColdStart
    ? 'COLD START: no program/observed sessions/performance history yet. Lean on the onboarding baseline below; treat missing domain facts as unknown, not as zero.'
    : null;
  return [
    `== Coach seed · ${seed.discipline} ==`,
    coldStartNote,
    jsonBlock('Goal', seed.goal),
    jsonBlock('Onboarding baseline (survey)', seed.onboarding),
    jsonBlock('Program skeleton (weeks)', seed.skeletonWeeks),
    `Current week index: ${seed.currentWeekIndex ?? 'n/a'}`,
    jsonBlock('Planned sessions (current + last 2 weeks)', seed.plannedRecent),
    jsonBlock('Observed sessions (last 7 days)', seed.observedSessions),
    jsonBlock('Performance daily (latest)', seed.performanceDaily),
    jsonBlock('Performance profile (current)', seed.performanceProfile),
    jsonBlock('Recovery rollup (7 days)', seed.recoveryRollup),
    '### Personalization',
    seed.personalizationPrompt,
    renderPreferenceWindows(seed.preferenceWindows),
  ]
    .filter((line): line is string => line !== null)
    .join('\n\n');
}

function renderRecoverySeed(seed: RecoverySeed): string {
  return [
    '== Recovery Guru seed ==',
    jsonBlock("Today's recovery snapshot", seed.today),
    jsonBlock('Recovery trend (7 days)', seed.trend7d),
    jsonBlock('Observed session load (7 days)', seed.observedLoad7d),
    jsonBlock('This-week planned outcomes', seed.thisWeekOutcomes),
    jsonBlock('Plan under review (uncompleted this week)', seed.planUnderReview),
    '### Personalization (constraints / intensity dials / recent setbacks)',
    seed.personalizationPrompt,
  ].join('\n\n');
}

function renderPlannerSeed(seed: PlannerSeed): string {
  return [
    '== Planner seed ==',
    `Target week: ${seed.weekWindow.from} .. ${seed.weekWindow.to}`,
    `Timezone: ${seed.timezone ?? 'unknown'}`,
    jsonBlock('Sessions to place (content + estDurationMin)', seed.sessionsToPlace),
    jsonBlock('Recurring weekly availability', seed.availability),
    '### Scheduling preferences (blocked HARD + preferred + time one-offs)',
    seed.personalizationPrompt,
    'NOTE: fetch the live Google Calendar with list_calendar_events before placing — busy/free is real-time.',
  ].join('\n\n');
}
