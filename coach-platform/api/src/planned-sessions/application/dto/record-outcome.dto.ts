import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  PlannedStatus,
  ReasonCode,
} from '../../domain/planned-session.model';

const PLANNED_STATUSES: PlannedStatus[] = [
  'planned',
  'completed',
  'partially_completed',
  'skipped',
  'deviated',
];

const REASON_CODES: ReasonCode[] = [
  'disliked_time',
  'disliked_exercise',
  'volume_too_high',
  'volume_too_low',
  'too_hard',
  'too_easy',
  'no_motivation',
  'injury_or_illness',
  'time_constraint',
  'weather',
  'travel',
  'other',
];

/**
 * Set/replace a planned train's adherence outcome. Used by the matcher and by
 * the self-report path. Only structured signal here — verbatim free text and
 * durable preference learning go to the file-first memory (future), keyed by
 * the planned session id.
 */
export class RecordOutcomeDto {
  @IsIn(PLANNED_STATUSES)
  status!: PlannedStatus;

  @IsOptional() @IsIn(REASON_CODES) reasonCode?: ReasonCode;

  @IsOptional() @IsInt() @Min(1) @Max(10) perceivedEffort?: number;

  @IsOptional() @IsInt() @Min(1) @Max(5) enjoyment?: number;

  @IsOptional() @IsInt() matchedActivityId?: number;

  @IsOptional() @IsString() feedbackRef?: string;
}
