import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { RunType } from '../../training/domain/training-profile.model';
import {
  EventDiscipline,
  PreferenceDurability,
  PreferenceEventSource,
  PreferenceScope,
  PreferenceTagType,
  TagConfidence,
  TagPolarity,
} from '../domain/preference-event.model';

export type PreferenceEventDocument = HydratedDocument<PreferenceEventDoc>;

// `chat`/`outcome`/`session_flush` are the live v4 sources. The legacy
// `revision`/`assistant` values stay in the write-enum ONLY so historical rows
// validate on lean reads; producers never emit them (mapped to `chat` on read
// via normalizeLegacySource, rewritten durably by the migration backfill).
const SOURCES = ['chat', 'outcome', 'session_flush', 'revision', 'assistant'];
const DISCIPLINES = ['running', 'strength'];
const SCOPES = ['global', 'session', 'exercise'];
const DURABILITIES = ['standing', 'one_off'];
const POLARITIES = ['avoid', 'prefer', 'increase', 'decrease', 'neutral'];
const CONFIDENCES = ['explicit', 'inferred'];
export const TAG_TYPES = [
  // reused reason codes (outcome-sourced)
  'disliked_time',
  'disliked_exercise',
  'volume_too_high',
  'volume_too_low',
  'too_hard',
  'too_easy',
  'no_motivation',
  'injury_or_illness',
  'overreaching',
  'time_constraint',
  'weather',
  'travel',
  // preference-specific
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
  // onboarding-settable setpoints (latest explicit value wins)
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
const RUN_TYPES = ['easy', 'tempo', 'fartlek', 'intervals', 'long', 'recovery'];

/* ── tag (structured extraction at write time) ─────────────────── */

@Schema({ _id: false })
export class PreferenceTagClass {
  @Prop({ type: String, required: true, enum: TAG_TYPES })
  type!: PreferenceTagType;
  // value is polymorphic: 'barbell', -0.1, 'mon 06:00-09:00', or null.
  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  value!: string | number | null;
  @Prop({ type: String, required: true, enum: POLARITIES })
  polarity!: TagPolarity;
  @Prop({ type: String, required: true, enum: CONFIDENCES })
  confidence!: TagConfidence;
}
const PreferenceTagSchema = SchemaFactory.createForClass(PreferenceTagClass);

/* ── target (what the event is about) ──────────────────────────── */

@Schema({ _id: false })
export class PreferenceTargetClass {
  @Prop({ type: String, default: null }) planned_session_id!: string | null;
  @Prop({ type: String, default: null }) exercise_id!: string | null;
  @Prop({ type: String, default: null, enum: [...RUN_TYPES, null] })
  run_type!: RunType | null;
}
const PreferenceTargetSchema =
  SchemaFactory.createForClass(PreferenceTargetClass);

/* ── root document ─────────────────────────────────────────────── */

@Schema({ collection: 'preference_events', timestamps: true })
export class PreferenceEventDoc {
  @Prop({ type: String, required: true }) user_id!: string;
  @Prop({ type: String, required: true }) event_date!: string;
  @Prop({ type: String, required: true, enum: SOURCES })
  source!: PreferenceEventSource;
  @Prop({ type: String, default: null }) batch_id!: string | null;
  @Prop({ type: String, default: null, enum: [...DISCIPLINES, null] })
  discipline!: EventDiscipline | null;
  @Prop({ type: String, required: true, enum: SCOPES })
  scope!: PreferenceScope;
  @Prop({ type: String, required: true, enum: DURABILITIES })
  durability!: PreferenceDurability;
  @Prop({ type: String, default: null }) expires_at!: string | null;
  @Prop({ type: PreferenceTargetSchema, default: null })
  target!: PreferenceTargetClass | null;
  @Prop({ type: PreferenceTagSchema, required: true })
  tag!: PreferenceTagClass;
  // Not `required`: Mongoose's String required-validator rejects empty strings,
  // and inferred/outcome-derived events legitimately have no verbatim text.
  @Prop({ type: String, default: '' }) raw_text!: string;
  @Prop({ type: String, default: null }) rationale!: string | null;
  @Prop({ type: Boolean, required: true, default: false })
  applied_to_projection!: boolean;
  @Prop({ type: String, default: null }) consumed_at!: string | null;
  @Prop({ type: Number, required: true }) taxonomy_version!: number;
}

export const PreferenceEventSchema =
  SchemaFactory.createForClass(PreferenceEventDoc);

// Primary timeline read: "last N standing events" and recency scans.
PreferenceEventSchema.index({ user_id: 1, event_date: -1 });
// Structured tag-type filter ("all equipment_removed events").
PreferenceEventSchema.index({ user_id: 1, 'tag.type': 1 });
// Per-discipline slice feeding the generation context.
PreferenceEventSchema.index({ user_id: 1, discipline: 1, event_date: -1 });
// Group + replay one batched submit (e.g. an action-point chat flush).
PreferenceEventSchema.index({ user_id: 1, batch_id: 1 }, { sparse: true });
