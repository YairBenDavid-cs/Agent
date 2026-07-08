import { AutoModeExplanationBuilder } from '../auto-mode-explanation.builder';
import { AutoModeDiff, AutoModeRun, AutoModeScenario } from '../domain/auto-mode-run.model';

function run(overrides: Partial<AutoModeRun> = {}): AutoModeRun {
  return {
    id: 'run-1',
    userId: 'u1',
    programId: 'p1',
    weekIndex: 2,
    scenario: 'weekly_targets_edit',
    trigger: 'chat',
    conversationId: 'c1',
    status: 'committed',
    trace: [],
    beforeSnapshot: null,
    diff: null,
    failureReason: null,
    createdAt: '2026-07-08T09:00:00.000Z',
    startedAt: '2026-07-08T09:00:00.000Z',
    completedAt: '2026-07-08T09:01:00.000Z',
    ...overrides,
  };
}

describe('AutoModeExplanationBuilder', () => {
  let builder: AutoModeExplanationBuilder;

  beforeEach(() => {
    builder = new AutoModeExplanationBuilder();
  });

  describe('committed runs', () => {
    it('renders only the targets section when diff.weeklyTargets is the only populated slice', () => {
      const diff: AutoModeDiff = {
        weeklyTargets: {
          before: { sessionCount: 4, totalVolume: 40, keyGoals: ['a tempo'] },
          after: { sessionCount: 5, totalVolume: 45, keyGoals: ['a tempo', 'a long run'] },
        },
      };
      const message = builder.build(run({ scenario: 'weekly_targets_edit', diff }));

      expect(message).toContain('**Auto Mode revised this week’s targets**');
      expect(message).toContain('**Weekly targets:**');
      expect(message).toContain('- Sessions: 4 → 5');
      expect(message).toContain('- Volume: 40 → 45');
      expect(message).toContain('- Focus: a tempo, a long run');
      expect(message).not.toContain('Sessions changed');
      expect(message).not.toContain('Rescheduled');
    });

    it('renders only the sessions section when diff.sessions is the only populated slice', () => {
      const diff: AutoModeDiff = {
        sessions: [
          { sessionId: 's1', before: { title: 'Easy run' }, after: { title: 'Tempo run' } },
        ],
      };
      const message = builder.build(
        run({ scenario: 'session_edit', diff }),
      );

      expect(message).toContain('**Auto Mode edited a session**');
      expect(message).toContain('**Sessions changed (1):**');
      expect(message).toContain('- Tempo run');
      expect(message).not.toContain('Weekly targets');
      expect(message).not.toContain('Rescheduled');
    });

    it('renders only the schedule section when diff.schedule is the only populated slice', () => {
      const diff: AutoModeDiff = {
        schedule: [
          {
            sessionId: 's1',
            before: { date: '2026-07-08', startTime: '06:00' },
            after: { date: '2026-07-09', startTime: '07:00' },
          },
        ],
      };
      const message = builder.build(
        run({ scenario: 'session_time_edit', diff }),
      );

      expect(message).toContain('**Auto Mode rescheduled a session**');
      expect(message).toContain('**Rescheduled (1):**');
      expect(message).toContain('- 2026-07-08 06:00 → 2026-07-09 07:00');
      expect(message).not.toContain('Weekly targets');
      expect(message).not.toContain('Sessions changed');
    });

    it('renders the "no changes were needed" fallback for an empty diff', () => {
      const message = builder.build(run({ diff: {} }));

      expect(message).toContain('No changes were needed — everything already fit.');
    });

    it('also falls back to "no changes were needed" when diff is null', () => {
      const message = builder.build(run({ diff: null }));

      expect(message).toContain('No changes were needed — everything already fit.');
    });
  });

  describe('aborted / failed runs', () => {
    it('routes both "aborted" and "failed" statuses through buildAbort, including the failure reason', () => {
      const aborted = builder.build(
        run({ status: 'aborted', failureReason: 'volume swing exceeded the autonomous cap' }),
      );
      const failed = builder.build(
        run({ status: 'failed', failureReason: 'the graph crashed mid-commit' }),
      );

      for (const message of [aborted, failed]) {
        expect(message).toContain('— stopped, nothing changed**');
        expect(message).toContain(
          'Nothing on your program, calendar, or targets was touched. Let me know how you’d like to proceed — I can retry with tighter constraints, or you can make the change yourself in Plan mode.',
        );
      }
      expect(aborted).toContain('volume swing exceeded the autonomous cap');
      expect(failed).toContain('the graph crashed mid-commit');
    });

    it('falls back to "an unexpected error" when failureReason is null', () => {
      const message = builder.build(run({ status: 'failed', failureReason: null }));

      expect(message).toContain('an unexpected error');
    });
  });

  describe('renderTrace', () => {
    it('renders each trace entry as "  - _node_: summary"', () => {
      const message = builder.build(
        run({
          diff: {},
          trace: [
            { node: 'route', at: '2026-07-08T09:00:00.000Z', summary: 'Classified as weekly_targets_edit.' },
            { node: 'guardrail', at: '2026-07-08T09:00:05.000Z', summary: 'Within bounds; proceeding.' },
          ],
        }),
      );

      expect(message).toContain('**How I got there:**');
      expect(message).toContain('  - _route_: Classified as weekly_targets_edit.');
      expect(message).toContain('  - _guardrail_: Within bounds; proceeding.');
    });

    it('renders no "How I got there" section when trace is empty', () => {
      const message = builder.build(run({ diff: {}, trace: [] }));

      expect(message).not.toContain('How I got there');
    });
  });

  describe('SCENARIO_HEADLINE exhaustiveness', () => {
    const scenarios: AutoModeScenario[] = [
      'new_week',
      'weekly_targets_edit',
      'session_edit',
      'session_time_edit',
    ];

    it.each(scenarios)('produces a non-empty headline for scenario %s', (scenario) => {
      const message = builder.build(run({ scenario, diff: {} }));
      expect(message).toMatch(/^\*\*.+\*\*/);
    });
  });
});
