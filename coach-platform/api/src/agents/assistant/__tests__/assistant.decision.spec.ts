import { Pipeline } from '../../orchestrator/pipeline.types';
import { AssistantTurn, CapturedSignal, WeekEdit } from '../assistant.contracts';
import { decideActions, selectPipeline } from '../assistant.decision';

const TODAY = '2026-06-28';

function signal(overrides: Partial<CapturedSignal> = {}): CapturedSignal {
  return {
    tagType: 'disliked_exercise',
    value: 'burpees',
    polarity: 'avoid',
    durability: 'standing',
    scope: 'exercise',
    discipline: 'strength',
    affectsCurrentWeek: true,
    rationale: 'Burpees aggravated a knee flare-up last week.',
    ...overrides,
  };
}

function turn(overrides: Partial<AssistantTurn> = {}): AssistantTurn {
  return {
    lane: 'black',
    reply: 'ok',
    captured: [],
    clarifyingQuestion: null,
    weekEdit: null,
    ...overrides,
  };
}

function weekEdit(overrides: Partial<WeekEdit> = {}): WeekEdit {
  return {
    weekIndex: 3,
    kind: 'session_content_edit',
    plannedSessionId: 'sess-1',
    plannedSessionIds: [],
    newDate: null,
    newStartTime: null,
    newSessionVolume: null,
    requestedChangeDescription: 'make Friday run 15km instead of 10km',
    newTargets: null,
    breachesLockedTargets: false,
    confirmed: true,
    rationale: 'athlete request',
    ...overrides,
  };
}

describe('assistant.decision', () => {
  it('white query: no writes, no pipeline, not awaiting', () => {
    const a = decideActions(turn({ lane: 'white', reply: 'Your HRV is up.' }), TODAY);
    expect(a.writes).toEqual([]);
    expect(a.pipeline).toBeNull();
    expect(a.awaitingConfirmation).toBe(false);
    expect(a.inferred).toBe(false);
  });

  it('black current-week content order: explicit write + CONTENT_REPLAN', () => {
    const a = decideActions(turn({ captured: [signal()] }), TODAY);
    expect(a.writes).toHaveLength(1);
    expect(a.writes[0].tag.confidence).toBe('explicit');
    expect(a.writes[0].eventDate).toBe(TODAY);
    expect(a.pipeline).toBe(Pipeline.CONTENT_REPLAN);
    expect(a.inferred).toBe(false);
  });

  it('black future-only standing pref: writes but does NOT fire', () => {
    const a = decideActions(
      turn({ captured: [signal({ affectsCurrentWeek: false })] }),
      TODAY,
    );
    expect(a.writes).toHaveLength(1);
    expect(a.pipeline).toBeNull();
  });

  it('black timing order routes to TIMING_REPLACE', () => {
    const a = decideActions(
      turn({ captured: [signal({ tagType: 'disliked_time', scope: 'global' })] }),
      TODAY,
    );
    expect(a.pipeline).toBe(Pipeline.TIMING_REPLACE);
  });

  it('safety tag fires SAFETY_REPLAN even when not flagged current-week', () => {
    const a = decideActions(
      turn({
        captured: [
          signal({ tagType: 'injury_or_illness', affectsCurrentWeek: false }),
        ],
      }),
      TODAY,
    );
    expect(a.pipeline).toBe(Pipeline.SAFETY_REPLAN);
  });

  // Regression for eval-harness Bug 1 (evals/harness/out/BUG-REPORT.md):
  // "I might be overtrained, back everything off" was classified white/gray
  // with no pipeline fired instead of hitting the safety gate.
  it('overreaching (systemic exhaustion) fires SAFETY_REPLAN like injury_or_illness', () => {
    const a = decideActions(
      turn({
        captured: [
          signal({ tagType: 'overreaching', affectsCurrentWeek: false }),
        ],
      }),
      TODAY,
    );
    expect(a.pipeline).toBe(Pipeline.SAFETY_REPLAN);
  });

  it('gray with a clarifying question awaits confirmation and writes nothing', () => {
    const a = decideActions(
      turn({
        lane: 'gray',
        reply: 'Do you want me to swap the burpees next Thursday?',
        clarifyingQuestion: 'Swap the burpees next Thursday?',
      }),
      TODAY,
    );
    expect(a.awaitingConfirmation).toBe(true);
    expect(a.writes).toEqual([]);
    expect(a.pipeline).toBeNull();
  });

  it('gray without confirmation demotes to inferred + batched, never fires', () => {
    const a = decideActions(
      turn({ lane: 'gray', captured: [signal()] }),
      TODAY,
    );
    expect(a.inferred).toBe(true);
    expect(a.writes).toHaveLength(1);
    expect(a.writes[0].tag.confidence).toBe('inferred');
    expect(a.pipeline).toBeNull();
  });

  describe('ask mode (read-only gate)', () => {
    it('white query is answered, never blocked', () => {
      const a = decideActions(
        turn({ lane: 'white', reply: 'Your HRV is up.' }),
        TODAY,
        'ask',
      );
      expect(a.writes).toEqual([]);
      expect(a.pipeline).toBeNull();
      expect(a.intentBlocked).toBe(false);
    });

    it('black order writes/fires nothing and flags intentBlocked', () => {
      const a = decideActions(turn({ captured: [signal()] }), TODAY, 'ask');
      expect(a.writes).toEqual([]);
      expect(a.pipeline).toBeNull();
      expect(a.inferred).toBe(false);
      expect(a.intentBlocked).toBe(true);
    });

    it('gray signal captures nothing and flags intentBlocked', () => {
      const a = decideActions(
        turn({ lane: 'gray', captured: [signal()] }),
        TODAY,
        'ask',
      );
      expect(a.writes).toEqual([]);
      expect(a.pipeline).toBeNull();
      expect(a.intentBlocked).toBe(true);
    });

    it('safety tag is still NOT auto-applied in ask mode', () => {
      const a = decideActions(
        turn({ captured: [signal({ tagType: 'injury_or_illness' })] }),
        TODAY,
        'ask',
      );
      expect(a.pipeline).toBeNull();
      expect(a.writes).toEqual([]);
      expect(a.intentBlocked).toBe(true);
    });
  });

  it('selectPipeline picks the strongest pipeline across multiple signals', () => {
    const p = selectPipeline([
      signal({ tagType: 'disliked_time' }), // TIMING_REPLACE
      signal({ tagType: 'primary_goal', scope: 'global' }), // PROGRAM_GENERATION
    ]);
    expect(p).toBe(Pipeline.PROGRAM_GENERATION);
  });

  it('selectPipeline returns null when no signal touches the current week', () => {
    const p = selectPipeline([signal({ affectsCurrentWeek: false })]);
    expect(p).toBeNull();
  });

  it('plan mode (default) never flags intentBlocked', () => {
    const a = decideActions(turn({ captured: [signal()] }), TODAY);
    expect(a.intentBlocked).toBe(false);
  });

  it('maps target through only when a target field is present', () => {
    const withTarget = decideActions(
      turn({ captured: [signal({ target: { exerciseId: 'ex-9' } })] }),
      TODAY,
    );
    expect(withTarget.writes[0].target).toEqual({
      plannedSessionId: null,
      exerciseId: 'ex-9',
      runType: null,
    });

    const noTarget = decideActions(turn({ captured: [signal()] }), TODAY);
    expect(noTarget.writes[0].target).toBeNull();
  });

  describe('week edit', () => {
    it('confirmed session_content_edit fires SESSION_CONTENT_REPLAN with the resolved weekIndex', () => {
      const a = decideActions(turn({ weekEdit: weekEdit() }), TODAY);
      expect(a.pipeline).toBe(Pipeline.SESSION_CONTENT_REPLAN);
      const expectedEdit = {
        plannedSessionId: 'sess-1',
        requestedChangeDescription: 'make Friday run 15km instead of 10km',
        revisedTargets: null,
      };
      expect(a.weekEditContext).toEqual({
        weekIndex: 3,
        sessionEdit: expectedEdit,
        sessionEdits: [expectedEdit],
      });
      expect(a.awaitingConfirmation).toBe(false);
      expect(a.writes).toEqual([]);
    });

    it('confirmed session_content_edit with a breach carries revisedTargets through', () => {
      const newTargets = { sessionCount: 5, totalVolume: 45, keyGoals: ['base'] };
      const a = decideActions(
        turn({
          weekEdit: weekEdit({ breachesLockedTargets: true, newTargets }),
        }),
        TODAY,
      );
      expect(a.pipeline).toBe(Pipeline.SESSION_CONTENT_REPLAN);
      expect(a.weekEditContext?.sessionEdit?.revisedTargets).toEqual(newTargets);
    });

    it('confirmed target_revision fires TARGET_REVISION_REPLAN with newTargets + reason', () => {
      const newTargets = { sessionCount: 4, totalVolume: 30, keyGoals: [] };
      const a = decideActions(
        turn({
          weekEdit: weekEdit({
            kind: 'target_revision',
            plannedSessionId: null,
            newTargets,
            rationale: 'lower volume this week',
          }),
        }),
        TODAY,
      );
      expect(a.pipeline).toBe(Pipeline.TARGET_REVISION_REPLAN);
      expect(a.weekEditContext).toEqual({
        weekIndex: 3,
        targetRevision: { newTargets, reason: 'lower volume this week' },
      });
    });

    it('unconfirmed week edit (breach pending go-ahead) writes and fires nothing, awaits confirmation', () => {
      const a = decideActions(
        turn({
          lane: 'gray',
          reply: 'That would put you over budget — want me to rebuild the week?',
          weekEdit: weekEdit({ confirmed: false, breachesLockedTargets: true }),
        }),
        TODAY,
      );
      expect(a.pipeline).toBeNull();
      expect(a.writes).toEqual([]);
      expect(a.awaitingConfirmation).toBe(true);
    });

    it('unconfirmed week edit on an otherwise-black turn still blocks firing and the cascading write', () => {
      const a = decideActions(
        turn({
          captured: [signal()],
          weekEdit: weekEdit({ confirmed: false, breachesLockedTargets: true }),
        }),
        TODAY,
      );
      expect(a.pipeline).toBeNull();
      expect(a.writes).toEqual([]);
      expect(a.awaitingConfirmation).toBe(true);
    });

    it('malformed confirmed edit (missing plannedSessionId) fails closed: fires nothing', () => {
      const a = decideActions(
        turn({ weekEdit: weekEdit({ plannedSessionId: null }) }),
        TODAY,
      );
      expect(a.pipeline).toBeNull();
      expect(a.weekEditContext).toBeNull();
    });

    it('malformed confirmed target_revision (missing newTargets) fails closed: fires nothing', () => {
      const a = decideActions(
        turn({
          weekEdit: weekEdit({
            kind: 'target_revision',
            plannedSessionId: null,
            newTargets: null,
          }),
        }),
        TODAY,
      );
      expect(a.pipeline).toBeNull();
      expect(a.weekEditContext).toBeNull();
    });

    it('a confirmed week edit outranks a weaker captured-signal pipeline in the same turn', () => {
      const a = decideActions(
        turn({
          captured: [signal({ tagType: 'disliked_time', scope: 'global' })], // TIMING_REPLACE
          weekEdit: weekEdit(), // SESSION_CONTENT_REPLAN, higher precedence
        }),
        TODAY,
      );
      expect(a.pipeline).toBe(Pipeline.SESSION_CONTENT_REPLAN);
      expect(a.weekEditContext?.weekIndex).toBe(3);
    });

    it('a safety signal still outranks a confirmed session-content week edit', () => {
      const a = decideActions(
        turn({
          captured: [signal({ tagType: 'injury_or_illness' })], // SAFETY_REPLAN
          weekEdit: weekEdit(), // SESSION_CONTENT_REPLAN, lower precedence
        }),
        TODAY,
      );
      expect(a.pipeline).toBe(Pipeline.SAFETY_REPLAN);
      expect(a.weekEditContext).toBeNull();
    });

    it('ask mode blocks a confirmed week edit and flags intentBlocked', () => {
      const a = decideActions(turn({ weekEdit: weekEdit() }), TODAY, 'ask');
      expect(a.pipeline).toBeNull();
      expect(a.weekEditContext).toBeNull();
      expect(a.writes).toEqual([]);
      expect(a.intentBlocked).toBe(true);
    });

    it('multi-session edit builds one SessionEditRequest per id (cascade on the first only)', () => {
      const newTargets = { sessionCount: 4, totalVolume: 50, keyGoals: [] };
      const a = decideActions(
        turn({
          weekEdit: weekEdit({
            plannedSessionId: 'sess-1',
            plannedSessionIds: ['sess-1', 'sess-2', 'sess-3'],
            breachesLockedTargets: true,
            newTargets,
          }),
        }),
        TODAY,
      );
      expect(a.pipeline).toBe(Pipeline.SESSION_CONTENT_REPLAN);
      const edits = a.weekEditContext?.sessionEdits ?? [];
      expect(edits.map((e) => e.plannedSessionId)).toEqual([
        'sess-1',
        'sess-2',
        'sess-3',
      ]);
      expect(edits[0].revisedTargets).toEqual(newTargets);
      expect(edits[1].revisedTargets).toBeNull();
      expect(edits[2].revisedTargets).toBeNull();
    });

    it('confirmed session_reschedule fires SESSION_RESCHEDULE with the move payload', () => {
      const a = decideActions(
        turn({
          weekEdit: weekEdit({
            kind: 'session_reschedule',
            newDate: '2026-07-04',
            newStartTime: '18:30',
          }),
        }),
        TODAY,
      );
      expect(a.pipeline).toBe(Pipeline.SESSION_RESCHEDULE);
      expect(a.weekEditContext).toEqual({
        weekIndex: 3,
        sessionReschedule: {
          plannedSessionId: 'sess-1',
          newDate: '2026-07-04',
          newStartTime: '18:30',
        },
      });
    });

    it('session_reschedule with neither newDate nor newStartTime fails closed', () => {
      const a = decideActions(
        turn({ weekEdit: weekEdit({ kind: 'session_reschedule' }) }),
        TODAY,
      );
      expect(a.pipeline).toBeNull();
      expect(a.weekEditContext).toBeNull();
    });
  });

  describe('deterministic breach verification (weekFacts)', () => {
    const facts = {
      lockedTotalVolume: 40,
      sessionVolumes: { 'sess-1': 10, 'sess-2': 12, 'sess-3': 18 },
    };

    it('blocks a confirmed edit the model called non-breaching when the math says breach', () => {
      // 15 km replacing 10 km → 45 vs 40 locked → 12.5% over the 10% tolerance.
      const a = decideActions(
        turn({ weekEdit: weekEdit({ newSessionVolume: 15 }) }),
        TODAY,
        'plan',
        facts,
      );
      expect(a.pipeline).toBeNull();
      expect(a.awaitingConfirmation).toBe(true);
      expect(a.reply).toContain('locked target');
    });

    it('lets a within-tolerance edit fire normally', () => {
      // 12 km replacing 10 km → 42 vs 40 → 5%, inside tolerance.
      const a = decideActions(
        turn({ weekEdit: weekEdit({ newSessionVolume: 12 }) }),
        TODAY,
        'plan',
        facts,
      );
      expect(a.pipeline).toBe(Pipeline.SESSION_CONTENT_REPLAN);
      expect(a.awaitingConfirmation).toBe(false);
    });

    it('does not intercept when the model flagged the breach AND carries newTargets (user confirmed cascade)', () => {
      const newTargets = { sessionCount: 3, totalVolume: 45, keyGoals: [] };
      const a = decideActions(
        turn({
          weekEdit: weekEdit({
            newSessionVolume: 15,
            breachesLockedTargets: true,
            newTargets,
          }),
        }),
        TODAY,
        'plan',
        facts,
      );
      expect(a.pipeline).toBe(Pipeline.SESSION_CONTENT_REPLAN);
      expect(a.weekEditContext?.sessionEdit?.revisedTargets).toEqual(newTargets);
    });

    it('skips verification when no weekFacts are available', () => {
      const a = decideActions(
        turn({ weekEdit: weekEdit({ newSessionVolume: 15 }) }),
        TODAY,
        'plan',
        null,
      );
      expect(a.pipeline).toBe(Pipeline.SESSION_CONTENT_REPLAN);
    });
  });
});
