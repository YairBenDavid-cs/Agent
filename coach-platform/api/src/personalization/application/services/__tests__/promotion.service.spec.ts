import { PERSONALIZATION_CONFIG } from '../../../domain/personalization.config';
import { PromotionService } from '../promotion.service';
import { makeEvent } from './preference-event.factory';

const { decayDays } = PERSONALIZATION_CONFIG;
const NOW = new Date('2026-06-30T00:00:00.000Z');
const INFERRED_THRESHOLD = 3;

describe('PromotionService.buildEntry', () => {
  let svc: PromotionService;
  beforeEach(() => {
    svc = new PromotionService();
  });

  it('returns null for an empty event group', () => {
    expect(svc.buildEntry('x', [], INFERRED_THRESHOLD, NOW)).toBeNull();
  });

  it('materialises an explicit standing signal as hard immediately (N=1)', () => {
    const entry = svc.buildEntry(
      'barbell',
      [makeEvent({ tag: { confidence: 'explicit' } })],
      INFERRED_THRESHOLD,
      NOW,
    );
    expect(entry).not.toBeNull();
    expect(entry!.strength).toBe('hard');
    expect(entry!.confidence).toBe('explicit');
    expect(entry!.supportCount).toBe(1);
    expect(entry!.confirmed).toBe(false);
  });

  it('keeps an inferred signal below threshold as null (anomaly, not evidence)', () => {
    const events = [
      makeEvent({ eventDate: '2026-06-01' }),
      makeEvent({ eventDate: '2026-06-02' }),
    ];
    expect(svc.buildEntry('x', events, INFERRED_THRESHOLD, NOW)).toBeNull();
  });

  it('promotes an inferred signal at threshold to soft (never hard)', () => {
    const events = [
      makeEvent({ eventDate: '2026-06-01' }),
      makeEvent({ eventDate: '2026-06-02' }),
      makeEvent({ eventDate: '2026-06-03' }),
    ];
    const entry = svc.buildEntry('x', events, INFERRED_THRESHOLD, NOW);
    expect(entry).not.toBeNull();
    expect(entry!.strength).toBe('soft');
    expect(entry!.confidence).toBe('inferred');
    expect(entry!.supportCount).toBe(3);
  });

  it('drops an inferred entry whose last reinforcement is past the decay horizon', () => {
    const stale = '2026-01-01'; // ~180d before NOW > decayDays (90)
    const events = [
      makeEvent({ eventDate: stale }),
      makeEvent({ eventDate: stale }),
      makeEvent({ eventDate: stale }),
    ];
    expect(svc.buildEntry('x', events, INFERRED_THRESHOLD, NOW)).toBeNull();
  });

  it('never decays an explicit entry regardless of age', () => {
    const ancient = '2024-01-01';
    const entry = svc.buildEntry(
      'x',
      [makeEvent({ eventDate: ancient, tag: { confidence: 'explicit' } })],
      INFERRED_THRESHOLD,
      NOW,
    );
    expect(entry).not.toBeNull();
    expect(entry!.strength).toBe('hard');
  });

  it('marks confirmed when an inferred signal is later stated explicitly', () => {
    const events = [
      makeEvent({ eventDate: '2026-06-01', tag: { confidence: 'inferred' } }),
      makeEvent({ eventDate: '2026-06-10', tag: { confidence: 'explicit' } }),
    ];
    const entry = svc.buildEntry('x', events, INFERRED_THRESHOLD, NOW);
    expect(entry).not.toBeNull();
    expect(entry!.strength).toBe('hard'); // explicit present
    expect(entry!.confirmed).toBe(true);
  });

  it('derives firstSeen/lastReinforced from the date range and collects ids', () => {
    const events = [
      makeEvent({ id: 'a', eventDate: '2026-06-10' }),
      makeEvent({ id: 'b', eventDate: '2026-06-01' }),
      makeEvent({ id: 'c', eventDate: '2026-06-05', tag: { confidence: 'explicit' } }),
    ];
    const entry = svc.buildEntry('x', events, INFERRED_THRESHOLD, NOW);
    expect(entry).not.toBeNull();
    expect(entry!.firstSeen).toBe(new Date('2026-06-01').toISOString());
    expect(entry!.lastReinforced).toBe(new Date('2026-06-10').toISOString());
    expect(entry!.sourceEventIds.sort()).toEqual(['a', 'b', 'c']);
  });

  it('boundary: exactly decayDays old is still kept (not strictly greater)', () => {
    // lastReinforced exactly decayDays before NOW → daysBetween == decayDays,
    // which is NOT > decayDays, so it survives.
    const boundary = new Date(NOW.getTime() - decayDays * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const events = [
      makeEvent({ eventDate: boundary }),
      makeEvent({ eventDate: boundary }),
      makeEvent({ eventDate: boundary }),
    ];
    const entry = svc.buildEntry('x', events, INFERRED_THRESHOLD, NOW);
    expect(entry).not.toBeNull();
  });
});
