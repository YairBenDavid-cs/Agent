import { Types } from 'mongoose';
import {
  PreferenceEvent,
  PreferenceEventSource,
  PreferenceTag,
  PreferenceTarget,
} from '../domain/preference-event.model';
import {
  PreferenceEventDoc,
  PreferenceTagClass,
  PreferenceTargetClass,
} from './preference-event.schema';

/** Lean doc as returned by Mongo reads — carries the generated `_id`. */
export type PreferenceEventLean = PreferenceEventDoc & { _id: Types.ObjectId };

/* ── legacy source migration ───────────────────────────────────── */

/**
 * Map a (possibly legacy) persisted source onto the v4 taxonomy:
 *   - `assistant` → `chat` (same semantics, renamed).
 *   - `revision`  → `chat` (the heavyweight before/after audit is dropped; the
 *      learned signal collapses to a conversation-captured preference).
 * Live sources pass through unchanged.
 *
 * Applied inside `toDomain` (Phase 6): the revision mechanism is gone, so any
 * persisted `revision`/`assistant` row collapses to `chat` on read. A one-off
 * backfill rewrites the stored values durably (migration §11); until then this
 * keeps historical rows readable under the v4 taxonomy.
 */
export const normalizeLegacySource = (
  source: string,
): PreferenceEventSource =>
  source === 'assistant' || source === 'revision'
    ? 'chat'
    : (source as PreferenceEventSource);

/* ── tag ───────────────────────────────────────────────────────── */

const tagToPersistence = (t: PreferenceTag): PreferenceTagClass => ({
  type: t.type,
  value: t.value,
  polarity: t.polarity,
  confidence: t.confidence,
});

const tagToDomain = (t: PreferenceTagClass): PreferenceTag => ({
  type: t.type,
  value: t.value ?? null,
  polarity: t.polarity,
  confidence: t.confidence,
});

/* ── target ────────────────────────────────────────────────────── */

const targetToPersistence = (t: PreferenceTarget): PreferenceTargetClass => ({
  planned_session_id: t.plannedSessionId,
  exercise_id: t.exerciseId,
  run_type: t.runType,
});

const targetToDomain = (t: PreferenceTargetClass): PreferenceTarget => ({
  plannedSessionId: t.planned_session_id ?? null,
  exerciseId: t.exercise_id ?? null,
  runType: t.run_type ?? null,
});

/* ── root ──────────────────────────────────────────────────────── */

export const toPersistence = (e: PreferenceEvent): PreferenceEventDoc => ({
  user_id: e.userId,
  event_date: e.eventDate,
  source: e.source,
  batch_id: e.batchId,
  discipline: e.discipline,
  scope: e.scope,
  durability: e.durability,
  expires_at: e.expiresAt,
  target: e.target ? targetToPersistence(e.target) : null,
  tag: tagToPersistence(e.tag),
  raw_text: e.rawText,
  applied_to_projection: e.appliedToProjection,
  consumed_at: e.consumedAt,
  taxonomy_version: e.taxonomyVersion,
});

export const toDomain = (doc: PreferenceEventLean): PreferenceEvent => ({
  id: doc._id?.toString() ?? null,
  userId: doc.user_id,
  eventDate: doc.event_date,
  source: normalizeLegacySource(doc.source),
  batchId: doc.batch_id ?? null,
  discipline: doc.discipline ?? null,
  scope: doc.scope,
  durability: doc.durability,
  expiresAt: doc.expires_at ?? null,
  target: doc.target ? targetToDomain(doc.target) : null,
  tag: tagToDomain(doc.tag),
  rawText: doc.raw_text ?? '',
  appliedToProjection: doc.applied_to_projection ?? false,
  consumedAt: doc.consumed_at ?? null,
  taxonomyVersion: doc.taxonomy_version,
});
