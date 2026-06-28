import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { RunType } from '../../../training/domain/training-profile.model';
import {
  EventDiscipline,
  PreferenceDurability,
  PreferenceEventSource,
  PreferenceScope,
  PreferenceTagType,
  TagConfidence,
  TagPolarity,
} from '../../domain/preference-event.model';

const SOURCES: PreferenceEventSource[] = [
  'revision',
  'outcome',
  'assistant',
  'session_flush',
];
const DISCIPLINES: EventDiscipline[] = ['running', 'strength'];
const SCOPES: PreferenceScope[] = ['global', 'session', 'exercise'];
const DURABILITIES: PreferenceDurability[] = ['standing', 'one_off'];
const POLARITIES: TagPolarity[] = [
  'avoid',
  'prefer',
  'increase',
  'decrease',
  'neutral',
];
const CONFIDENCES: TagConfidence[] = ['explicit', 'inferred'];
const TAG_TYPES: PreferenceTagType[] = [
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
  'equipment_removed',
  'equipment_added',
  'time_window_blocked',
  'time_window_preferred',
  'diversity_request',
  'volume_bias',
  'intensity_bias',
  'modality_pref',
  'exercise_override',
  'injury',
  'session_duration',
  'sessions_per_week',
  'weekly_km',
  'run_type_pref',
  'split_preference',
  'exercises_per_session',
  'default_sets',
  'default_reps',
  'muscle_group_pref',
  'exercise_prescription',
  'experience_level',
  'primary_goal',
  'other',
];
const RUN_TYPES: RunType[] = [
  'easy',
  'tempo',
  'fartlek',
  'intervals',
  'long',
  'recovery',
];

/** The structured tag extracted at write time. */
export class PreferenceTagDto {
  @IsIn(TAG_TYPES) type!: PreferenceTagType;
  // Polymorphic: string | number | null — validated structurally, not by type.
  @IsOptional() value?: string | number | null;
  @IsIn(POLARITIES) polarity!: TagPolarity;
  @IsIn(CONFIDENCES) confidence!: TagConfidence;
}

/** What the event is about. */
export class PreferenceTargetDto {
  @IsOptional() @IsString() plannedSessionId?: string | null;
  @IsOptional() @IsString() exerciseId?: string | null;
  @IsOptional() @IsIn(RUN_TYPES) runType?: RunType | null;
}

/**
 * Append one event to the semantic log. The producer (revision flow, outcome
 * hook, assistant tool, session flush) supplies an already-tagged event; this
 * layer never re-parses prose.
 */
export class AppendPreferenceEventDto {
  @IsString() eventDate!: string; // YYYY-MM-DD

  @IsIn(SOURCES) source!: PreferenceEventSource;

  @IsOptional() @IsString() batchId?: string | null;

  @IsOptional() @IsIn(DISCIPLINES) discipline?: EventDiscipline | null;

  @IsIn(SCOPES) scope!: PreferenceScope;

  @IsIn(DURABILITIES) durability!: PreferenceDurability;

  @IsOptional() @IsString() expiresAt?: string | null;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PreferenceTargetDto)
  target?: PreferenceTargetDto | null;

  @IsObject()
  @ValidateNested()
  @Type(() => PreferenceTagDto)
  tag!: PreferenceTagDto;

  @IsOptional() @IsString() rawText?: string;

  @IsOptional() @IsBoolean() appliedToProjection?: boolean;
}
