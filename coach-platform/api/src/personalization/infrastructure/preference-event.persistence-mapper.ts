import { Types } from 'mongoose';
import {
  PreferenceEvent,
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
  taxonomy_version: e.taxonomyVersion,
});

export const toDomain = (doc: PreferenceEventLean): PreferenceEvent => ({
  id: doc._id?.toString() ?? null,
  userId: doc.user_id,
  eventDate: doc.event_date,
  source: doc.source,
  batchId: doc.batch_id ?? null,
  discipline: doc.discipline ?? null,
  scope: doc.scope,
  durability: doc.durability,
  expiresAt: doc.expires_at ?? null,
  target: doc.target ? targetToDomain(doc.target) : null,
  tag: tagToDomain(doc.tag),
  rawText: doc.raw_text ?? '',
  appliedToProjection: doc.applied_to_projection ?? false,
  taxonomyVersion: doc.taxonomy_version,
});
