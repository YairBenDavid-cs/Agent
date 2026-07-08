import { PendingCandidate } from '../../conversation/domain/conversation.model';
import { DistillationResult } from '../preference-distillation.contracts';
import { PreferenceDistillationService } from '../preference-distillation.service';

const TODAY = '2026-06-28';

function candidate(overrides: Partial<PendingCandidate> = {}): PendingCandidate {
  return {
    lane: 'black',
    tagType: 'run_type_pref',
    value: -30,
    polarity: 'decrease',
    durability: 'standing',
    scope: 'session',
    discipline: 'running',
    affectsCurrentWeek: true,
    target: null,
    rawText: 'lower the pace',
    rationale: 'Pace felt sustainable on the last two long runs.',
    capturedAt: '2026-06-28T10:00:00.000Z',
    ...overrides,
  };
}

/** A loop stub whose single `run` resolves to a fixed terminal result. */
function loopReturning(result: DistillationResult | null) {
  return {
    run: jest.fn(() =>
      Promise.resolve({
        terminalResult: result,
        terminalTool: result ? 'net_intent' : null,
        finalText: null,
        iterations: 1,
        exhausted: false,
      }),
    ),
  };
}

function service(loop: { run: jest.Mock }) {
  return new PreferenceDistillationService(loop as never);
}

describe('PreferenceDistillationService', () => {
  it('returns nothing and never calls the LLM for an empty buffer', async () => {
    const loop = loopReturning({ signals: [] });
    const items = await service(loop).distill({
      userId: 'u1',
      runId: 'r1',
      candidates: [],
      discipline: 'running',
      today: TODAY,
    });
    expect(items).toEqual([]);
    expect(loop.run).not.toHaveBeenCalled();
  });

  it('collapses the pace example to a single net −15s explicit item', async () => {
    // Buffer: lower 30s, then raise 15s — net intent is "lower 15s".
    const candidates = [
      candidate({ value: -30, polarity: 'decrease', rawText: 'lower pace 30s' }),
      candidate({ value: 15, polarity: 'increase', rawText: 'raise pace 15s' }),
    ];
    const loop = loopReturning({
      signals: [
        {
          lane: 'black',
          tagType: 'run_type_pref',
          value: -15,
          polarity: 'decrease',
          durability: 'standing',
          scope: 'session',
          discipline: 'running',
          affectsCurrentWeek: true,
          target: null,
          rawText: 'net: lower pace 15s',
          rationale: 'Pace felt sustainable on the last two long runs.',
        },
      ],
    });

    const items = await service(loop).distill({
      userId: 'u1',
      runId: 'r1',
      candidates,
      discipline: 'running',
      today: TODAY,
    });

    expect(items).toHaveLength(1);
    expect(items[0].tag.value).toBe(-15);
    expect(items[0].tag.confidence).toBe('explicit'); // black → hard
    expect(items[0].eventDate).toBe(TODAY);
  });

  it('maps a gray net signal to an inferred (soft) item', async () => {
    const loop = loopReturning({
      signals: [
        {
          lane: 'gray',
          tagType: 'modality_pref',
          value: 'kettlebell',
          polarity: 'prefer',
          durability: 'standing',
          scope: 'global',
          discipline: 'strength',
          affectsCurrentWeek: false,
          target: null,
          rationale: 'Athlete mentioned enjoying kettlebell work in strength sessions.',
        },
      ],
    });
    const items = await service(loop).distill({
      userId: 'u1',
      runId: 'r1',
      candidates: [candidate()],
      discipline: 'strength',
      today: TODAY,
    });
    expect(items[0].tag.confidence).toBe('inferred'); // gray → soft
  });

  it('returns nothing when distillation cancels everything out', async () => {
    const loop = loopReturning({ signals: [] });
    const items = await service(loop).distill({
      userId: 'u1',
      runId: 'r1',
      candidates: [
        candidate({ value: -30, polarity: 'decrease' }),
        candidate({ value: 30, polarity: 'increase' }),
      ],
      discipline: 'running',
      today: TODAY,
    });
    expect(items).toEqual([]);
  });

  it('falls back to the raw buffer (never loses intent) when the pass yields no result', async () => {
    const loop = loopReturning(null);
    const items = await service(loop).distill({
      userId: 'u1',
      runId: 'r1',
      candidates: [
        candidate({ lane: 'black', value: -30 }),
        candidate({ lane: 'gray', tagType: 'modality_pref', value: 'rower' }),
      ],
      discipline: 'running',
      today: TODAY,
    });
    expect(items).toHaveLength(2);
    expect(items[0].tag.confidence).toBe('explicit'); // black candidate
    expect(items[1].tag.confidence).toBe('inferred'); // gray candidate
  });

  it('stamps the call discipline onto a net signal that omits one', async () => {
    const loop = loopReturning({
      signals: [
        {
          lane: 'black',
          tagType: 'session_duration',
          value: 45,
          polarity: 'decrease',
          durability: 'standing',
          scope: 'global',
          discipline: null,
          affectsCurrentWeek: true,
          target: null,
          rationale: 'Sessions were running long relative to the block schedule.',
        },
      ],
    });
    const items = await service(loop).distill({
      userId: 'u1',
      runId: 'r1',
      candidates: [candidate()],
      discipline: 'strength',
      today: TODAY,
    });
    expect(items[0].discipline).toBe('strength');
  });
});
