/**
 * Domain model for a preference event — the append-only "semantic log" layer.
 * Framework-free: no Nest, no Mongoose, no class-validator.
 *
 * Events are immutable: they record WHAT the user expressed/did and WHEN. The
 * user_preferences projection (Phase 2) is distilled from them and can always be
 * rebuilt by replaying the log (file-first principle, Mongo-native).
 *
 * Tagging happens at WRITE time (schema-on-write): the producer extracts a
 * structured `tag` while it still has full conversational context, so the
 * projection never re-parses prose. `rawText` is kept for audit and for
 * re-distillation if the taxonomy changes.
 */

import { RunType } from '../../training/domain/training-profile.model';

/** Where the event came from. */
export type PreferenceEventSource =
  | 'revision' // a card revision (incl. NotebookLM-style weekly batch)
  | 'outcome' // derived from a planned-session outcome (skip/deviation)
  | 'assistant' // captured autonomously mid-conversation
  | 'session_flush'; // the session-teardown flush step

export type EventDiscipline = 'running' | 'strength';

/** How broadly the preference applies. */
export type PreferenceScope = 'global' | 'session' | 'exercise';

/**
 * standing = a persistent rule -> distilled into the projection.
 * one_off  = a single occurrence ("skip today") -> never touches the projection;
 *            carries `expiresAt` and influences only near-term generation.
 */
export type PreferenceDurability = 'standing' | 'one_off';

export type TagPolarity =
  | 'avoid'
  | 'prefer'
  | 'increase'
  | 'decrease'
  | 'neutral';

export type TagConfidence = 'explicit' | 'inferred';

/**
 * Controlled tag vocabulary. Reuses the planned-session `reason_code` values
 * (for outcome-sourced events) plus preference-specific types. Extend here and
 * bump CURRENT_TAXONOMY_VERSION when changing.
 */
export type PreferenceTagType =
  // reused reason codes (outcome-sourced)
  | 'disliked_time'
  | 'disliked_exercise'
  | 'volume_too_high'
  | 'volume_too_low'
  | 'too_hard'
  | 'too_easy'
  | 'no_motivation'
  | 'injury_or_illness'
  | 'time_constraint'
  | 'weather'
  | 'travel'
  // preference-specific
  | 'equipment_removed'
  | 'equipment_added'
  | 'time_window_blocked'
  | 'time_window_preferred'
  | 'diversity_request'
  | 'volume_bias'
  | 'intensity_bias'
  | 'modality_pref'
  | 'exercise_override'
  | 'injury'
  // onboarding-settable setpoints (latest explicit value wins)
  | 'session_duration' // scheduling: minutes per session
  | 'sessions_per_week' // scheduling: training days per week
  | 'weekly_km' // running: target weekly volume
  | 'run_type_pref' // running: liked/avoided run types (list, by polarity)
  | 'split_preference' // strength: training split
  | 'exercises_per_session' // strength: movement count per session
  | 'default_sets' // strength: default sets per exercise
  | 'default_reps' // strength: default reps per exercise
  | 'muscle_group_pref' // strength: target muscle groups (list)
  | 'exercise_prescription' // strength: per-exercise sets/reps/weight override
  | 'experience_level' // training level (drives intensity/volume defaults)
  | 'primary_goal' // what the user is training for
  | 'other';

/** The structured extraction attached to the raw text at write time. */
export interface PreferenceTag {
  type: PreferenceTagType;
  value: string | number | null; // 'barbell', -0.1, 'mon 06:00-09:00', ...
  polarity: TagPolarity;
  confidence: TagConfidence;
}

/** What the event is about. `exerciseId` is always a canonical catalog id. */
export interface PreferenceTarget {
  plannedSessionId: string | null;
  exerciseId: string | null;
  runType: RunType | null;
}

export interface PreferenceEvent {
  /** Store-assigned id; null before insert. */
  id: string | null;
  userId: string;
  eventDate: string; // YYYY-MM-DD, user-local timeline anchor
  source: PreferenceEventSource;
  /** Groups events from one weekly-revision submit; null otherwise. */
  batchId: string | null;
  discipline: EventDiscipline | null; // null = cross-cutting (e.g. time prefs)
  scope: PreferenceScope;
  durability: PreferenceDurability;
  expiresAt: string | null; // ISO; one_off only
  target: PreferenceTarget | null;
  tag: PreferenceTag;
  rawText: string; // verbatim user phrasing (NOT indexed in Tier 1)
  /** false for one_off / narrative-only ('other') events. */
  appliedToProjection: boolean;
  taxonomyVersion: number;
}

/** Bump whenever the tag vocabulary changes; enables replay-based migration. */
export const CURRENT_TAXONOMY_VERSION = 2;
