/**
 * Read-side context bundles — the shapes the future agents consume.
 * Framework-free. Each is a per-agent SLICE of the memory layer, assembled by
 * the ContextBuilderService and carrying a `promptText` rendering so an agent
 * can drop it straight into an LLM prompt without re-walking the structure.
 */

import { HealthConstraint } from './health-constraint.model';
import { PrefEntry, TimeWindow } from './pref-entry.model';
import { EventDiscipline, PreferenceEvent } from './preference-event.model';
import { UserPreferences } from './user-preferences.model';

/**
 * Coach (generator) context — the full three-slice bundle:
 *   projection (what's true now) + active one-offs (near-term) + recent standing
 *   events (raw nuance) + health constraints (hard avoid set).
 */
export interface GenerationContext {
  userId: string;
  discipline: EventDiscipline;
  projection: UserPreferences | null;
  activeOneOffs: PreferenceEvent[];
  recentStandingEvents: PreferenceEvent[];
  healthConstraints: HealthConstraint[];
  promptText: string;
}

/**
 * Recovery Guru context — injury/limitation set plus the intensity dials and
 * recent fatigue/illness signals it reasons about.
 */
export interface RecoveryContext {
  userId: string;
  healthConstraints: HealthConstraint[];
  intensityBias: {
    running: PrefEntry<number> | null;
    strength: PrefEntry<number> | null;
  };
  recentSetbacks: PreferenceEvent[];
  promptText: string;
}

/**
 * Planner (scheduler) context — when the user will / won't train, merged across
 * disciplines (time windows are cross-cutting), plus near-term blockers.
 */
export interface SchedulingContext {
  userId: string;
  blockedTimeWindows: PrefEntry<TimeWindow>[];
  preferredTimeWindows: PrefEntry<TimeWindow>[];
  activeTimeOneOffs: PreferenceEvent[];
  promptText: string;
}
