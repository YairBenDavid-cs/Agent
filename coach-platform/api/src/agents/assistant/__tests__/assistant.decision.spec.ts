import { Pipeline } from '../../orchestrator/pipeline.types';
import { AssistantTurn, CapturedSignal } from '../assistant.contracts';
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
    ...overrides,
  };
}

function turn(overrides: Partial<AssistantTurn> = {}): AssistantTurn {
  return {
    lane: 'black',
    reply: 'ok',
    captured: [],
    clarifyingQuestion: null,
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
});
