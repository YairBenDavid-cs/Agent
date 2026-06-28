import { toCalendarEventInput } from '../calendar-event.builder';

describe('toCalendarEventInput', () => {
  const base = {
    id: 'sess-1',
    title: 'Tempo run',
    coachNotes: '20min at threshold',
    scheduledStartUtc: '2026-06-22T05:00:00.000Z',
    estDurationMin: 60,
    timezone: 'Europe/Berlin',
  };

  it('projects the session onto a tagged event with a derived end instant', () => {
    const input = toCalendarEventInput(base);
    expect(input).toEqual({
      summary: 'Tempo run',
      description: '20min at threshold',
      startUtc: '2026-06-22T05:00:00.000Z',
      endUtc: '2026-06-22T06:00:00.000Z',
      timezone: 'Europe/Berlin',
      plannedSessionId: 'sess-1',
    });
  });

  it('omits description when coachNotes is null', () => {
    const input = toCalendarEventInput({ ...base, coachNotes: null });
    expect(input.description).toBeUndefined();
  });

  it('derives end from start + estDurationMin', () => {
    const input = toCalendarEventInput({ ...base, estDurationMin: 30 });
    expect(input.endUtc).toBe('2026-06-22T05:30:00.000Z');
  });
});
