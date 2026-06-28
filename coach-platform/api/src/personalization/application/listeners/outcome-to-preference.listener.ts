import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ReasonCode } from '../../../planned-sessions/domain/planned-session.model';
import {
  OUTCOME_RECORDED,
  OutcomeRecordedEvent,
} from '../../../planned-sessions/application/events/outcome-recorded.event';
import {
  PreferenceDurability,
  TagPolarity,
  PreferenceTagType,
} from '../../domain/preference-event.model';
import { PreferenceItemDto } from '../dto/preference-item.dto';
import { PreferenceIngestionService } from '../services/preference-ingestion.service';

interface OutcomeMapping {
  type: PreferenceTagType;
  polarity: TagPolarity;
  durability: PreferenceDurability;
}

/**
 * How each adherence reason becomes a preference signal. Outcome-derived events
 * are always `inferred` (deduced from behaviour) — a single skip is below the
 * promotion threshold, so it only matters once a pattern repeats. Contextual
 * reasons (weather/travel/...) are `one_off`: logged for the near term, never
 * distilled into the projection.
 */
const OUTCOME_MAP: Record<ReasonCode, OutcomeMapping> = {
  disliked_time: { type: 'disliked_time', polarity: 'avoid', durability: 'standing' },
  disliked_exercise: {
    type: 'disliked_exercise',
    polarity: 'avoid',
    durability: 'standing',
  },
  volume_too_high: { type: 'volume_too_high', polarity: 'decrease', durability: 'standing' },
  volume_too_low: { type: 'volume_too_low', polarity: 'increase', durability: 'standing' },
  too_hard: { type: 'too_hard', polarity: 'decrease', durability: 'standing' },
  too_easy: { type: 'too_easy', polarity: 'increase', durability: 'standing' },
  no_motivation: { type: 'no_motivation', polarity: 'neutral', durability: 'one_off' },
  injury_or_illness: {
    type: 'injury_or_illness',
    polarity: 'neutral',
    durability: 'one_off',
  },
  time_constraint: { type: 'time_constraint', polarity: 'neutral', durability: 'one_off' },
  weather: { type: 'weather', polarity: 'neutral', durability: 'one_off' },
  travel: { type: 'travel', polarity: 'neutral', durability: 'one_off' },
  other: { type: 'other', polarity: 'neutral', durability: 'one_off' },
};

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const ONE_OFF_TTL_DAYS = 14;

@Injectable()
export class OutcomeToPreferenceListener {
  private readonly logger = new Logger(OutcomeToPreferenceListener.name);

  constructor(private readonly ingestion: PreferenceIngestionService) {}

  @OnEvent(OUTCOME_RECORDED)
  async handle(event: OutcomeRecordedEvent): Promise<void> {
    const item = this.toItem(event);
    if (!item) {
      return; // completed / no learnable reason
    }
    try {
      await this.ingestion.ingest(event.payload.userId, 'outcome', [item], false);
    } catch (err) {
      // Isolate: a learning failure must never break outcome recording.
      this.logger.error(
        `Outcome→preference failed for ${event.payload.userId}: ${String(err)}`,
      );
    }
  }

  private toItem(event: OutcomeRecordedEvent): PreferenceItemDto | null {
    const p = event.payload;
    if (!p.reasonCode) {
      return null;
    }
    const m = OUTCOME_MAP[p.reasonCode];

    // disliked_time carries the offending weekly window so it can distil.
    const value =
      p.reasonCode === 'disliked_time'
        ? `${this.weekday(p.scheduledDate)} ${hhmm(p.startTime)}-${hhmm(p.endTime)}`
        : null;

    return {
      eventDate: p.scheduledDate,
      discipline: p.discipline,
      scope: 'session',
      durability: m.durability,
      expiresAt:
        m.durability === 'one_off' ? addDaysIso(ONE_OFF_TTL_DAYS) : null,
      target: {
        plannedSessionId: p.plannedSessionId,
        exerciseId: null,
        runType: null,
      },
      tag: {
        type: m.type,
        value,
        polarity: m.polarity,
        confidence: 'inferred',
      },
      rawText: '',
    };
  }

  private weekday(yyyyMmDd: string): string {
    return WEEKDAYS[new Date(yyyyMmDd).getDay()] ?? '*';
  }
}

const hhmm = (t: string): string => t.slice(0, 5);

const addDaysIso = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
};
