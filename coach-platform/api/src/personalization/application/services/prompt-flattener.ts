/**
 * Pure, framework-free renderers that flatten the structured memory layer into
 * compact prompt text. The ContextBuilderService stitches the repo reads
 * together and calls these to produce the `promptText` each per-agent context
 * carries, so a future agent can drop the slice straight into an LLM prompt
 * without re-walking the structure.
 *
 * Rendering rules:
 *   - hard/explicit lines lead (the generator MUST obey); soft lines follow.
 *   - every line stays terse and self-describing; empty slices are omitted.
 *   - provenance/strength is implied by section, not dumped per line, to keep
 *     the prompt token-cheap.
 */

import { HealthConstraint } from '../../domain/health-constraint.model';
import {
  ExercisePrescription,
  PrefEntry,
  TimeWindow,
} from '../../domain/pref-entry.model';
import { PreferenceEvent } from '../../domain/preference-event.model';
import { UserPreferences } from '../../domain/user-preferences.model';

/** A labelled bucket of pref entries to render as a bullet group. */
interface ListSection<T> {
  label: string;
  entries: PrefEntry<T>[];
}

function strengthTag(entry: PrefEntry<unknown>): string {
  return entry.strength === 'hard' ? 'must' : 'prefer';
}

function renderTimeWindow(w: TimeWindow): string {
  return `${w.day} ${w.start}-${w.end}`;
}

function renderListEntry<T>(entry: PrefEntry<T>, render: (v: T) => string): string {
  const conf = entry.confirmed ? '' : entry.confidence === 'inferred' ? ' (inferred)' : '';
  return `  - [${strengthTag(entry)}] ${render(entry.value)} (×${entry.supportCount})${conf}`;
}

function renderListSection<T>(
  section: ListSection<T>,
  render: (v: T) => string,
): string[] {
  if (section.entries.length === 0) return [];
  return [
    `${section.label}:`,
    ...section.entries.map((e) => renderListEntry(e, render)),
  ];
}

function renderBias(label: string, entry: PrefEntry<number> | null): string[] {
  if (!entry) return [];
  const sign = entry.value >= 0 ? '+' : '';
  return [`${label}: ${sign}${entry.value.toFixed(2)} [${strengthTag(entry)}]`];
}

/** Render a latest-value-wins setpoint dial (e.g. "Weekly km: 40 [must]"). */
function renderSetpoint(
  label: string,
  entry: PrefEntry<string | number> | null,
): string[] {
  if (!entry) return [];
  const conf = entry.confirmed
    ? ''
    : entry.confidence === 'inferred'
      ? ' (inferred)'
      : '';
  return [`${label}: ${entry.value} [${strengthTag(entry)}]${conf}`];
}

function renderPrescription(entry: PrefEntry<ExercisePrescription>): string {
  const p = entry.value;
  const dials = [
    p.sets != null ? `${p.sets} sets` : null,
    p.reps != null ? `${p.reps} reps` : null,
    p.weightKg != null ? `${p.weightKg}kg` : null,
  ]
    .filter(Boolean)
    .join(' × ');
  return `  - [${strengthTag(entry)}] ${p.exerciseId}: ${dials || 'custom'}`;
}

/**
 * Flatten just the distilled projection into prompt lines. Used as the spine of
 * the generation context and reusable wherever only standing preferences matter.
 */
export function flattenProjectionToPrompt(
  projection: UserPreferences | null,
): string {
  if (!projection) {
    return 'No learned preferences yet for this discipline.';
  }

  const id = (v: string) => v;
  const lines: string[] = [`Learned preferences (${projection.discipline}):`];

  const sections: string[][] = [
    renderListSection({ label: 'Avoid exercises', entries: projection.avoidedExercises }, id),
    renderListSection({ label: 'Prefer exercises', entries: projection.preferredExercises }, id),
    renderListSection({ label: 'Blocked time windows', entries: projection.blockedTimeWindows }, renderTimeWindow),
    renderListSection({ label: 'Preferred time windows', entries: projection.preferredTimeWindows }, renderTimeWindow),
    renderListSection({ label: 'Removed equipment', entries: projection.removedEquipment }, id),
    renderListSection({ label: 'Added equipment', entries: projection.addedEquipment }, id),
    renderListSection({ label: 'Preferred modalities', entries: projection.preferredModalities }, id),
    renderListSection({ label: 'Preferred run types', entries: projection.preferredRunTypes }, id),
    renderListSection({ label: 'Avoid run types', entries: projection.avoidedRunTypes }, id),
    renderListSection({ label: 'Target muscle groups', entries: projection.targetMuscleGroups }, id),
  ];
  for (const section of sections) lines.push(...section);

  // Current settings (latest-value-wins dials) — answers "what is my X now".
  const dials = [
    ...renderSetpoint('Session duration (min)', projection.sessionDurationMin),
    ...renderSetpoint('Sessions per week', projection.sessionsPerWeek),
    ...renderSetpoint('Weekly km', projection.weeklyKm),
    ...renderSetpoint('Split', projection.splitPreference),
    ...renderSetpoint('Exercises per session', projection.exercisesPerSession),
    ...renderSetpoint('Default sets', projection.defaultSets),
    ...renderSetpoint('Default reps', projection.defaultReps),
    ...renderSetpoint('Experience level', projection.experienceLevel),
    ...renderSetpoint('Primary goal', projection.primaryGoal),
  ];
  if (dials.length > 0) {
    lines.push('Current settings:');
    for (const d of dials) lines.push(`  - ${d}`);
  }

  if (projection.exercisePrescriptions.length > 0) {
    lines.push('Per-exercise prescriptions:');
    for (const p of projection.exercisePrescriptions) {
      lines.push(renderPrescription(p));
    }
  }

  const biases = [
    ...renderBias('Volume bias', projection.volumeBias),
    ...renderBias('Intensity bias', projection.intensityBias),
    ...renderBias('Diversity bias', projection.diversityBias),
  ];
  if (biases.length > 0) {
    lines.push('Biases:');
    for (const b of biases) lines.push(`  - ${b}`);
  }

  if (lines.length === 1) {
    lines.push('  (none distilled yet)');
  }
  return lines.join('\n');
}

/** Render a hard health-constraint exclusion set. */
export function flattenHealthConstraints(
  constraints: HealthConstraint[],
): string {
  if (constraints.length === 0) return 'No active health constraints.';
  const lines = ['Health constraints (HARD — never violate):'];
  for (const c of constraints) {
    const muscles = c.affectedMuscles.join(', ') || '—';
    const patterns = c.affectedMovementPatterns.join(', ') || '—';
    lines.push(
      `  - [${c.severity}] ${c.label} (${c.type}); muscles: ${muscles}; patterns: ${patterns}; ${c.avoidExerciseIds.length} exercises excluded`,
    );
  }
  return lines.join('\n');
}

/** Render raw near-term/standing events as one-line signals. */
function renderEvent(e: PreferenceEvent): string {
  const value = e.tag.value === null ? '' : ` = ${e.tag.value}`;
  const note = e.rawText.trim() ? ` "${e.rawText.trim()}"` : '';
  const expiry = e.expiresAt ? `, expires ${e.expiresAt.slice(0, 10)}` : '';
  return `  - ${e.eventDate} ${e.tag.type}/${e.tag.polarity}${value}${note} [${e.tag.confidence}, ${e.source}${expiry}]`;
}

export function flattenEvents(label: string, events: PreferenceEvent[]): string {
  if (events.length === 0) return `${label}: none.`;
  return [`${label}:`, ...events.map(renderEvent)].join('\n');
}

/**
 * Compose the full generation-context prompt: projection spine + hard
 * constraints + active one-offs (near-term steering) + recent raw signal.
 */
export function flattenGenerationContext(parts: {
  discipline: string;
  projection: UserPreferences | null;
  activeOneOffs: PreferenceEvent[];
  recentStandingEvents: PreferenceEvent[];
  healthConstraints: HealthConstraint[];
}): string {
  return [
    `=== Generation context · ${parts.discipline} ===`,
    flattenHealthConstraints(parts.healthConstraints),
    '',
    flattenProjectionToPrompt(parts.projection),
    '',
    flattenEvents('Active one-offs (near-term, do not distil)', parts.activeOneOffs),
    '',
    flattenEvents('Recent standing signals (raw)', parts.recentStandingEvents),
  ].join('\n');
}

/** Compose the recovery-guru prompt: constraints + intensity dials + setbacks. */
export function flattenRecoveryContext(parts: {
  healthConstraints: HealthConstraint[];
  intensityBias: {
    running: PrefEntry<number> | null;
    strength: PrefEntry<number> | null;
  };
  recentSetbacks: PreferenceEvent[];
}): string {
  const dials: string[] = [
    ...renderBias('Running intensity bias', parts.intensityBias.running),
    ...renderBias('Strength intensity bias', parts.intensityBias.strength),
  ];
  return [
    '=== Recovery context ===',
    flattenHealthConstraints(parts.healthConstraints),
    '',
    dials.length > 0 ? ['Intensity dials:', ...dials.map((d) => `  - ${d}`)].join('\n') : 'Intensity dials: neutral.',
    '',
    flattenEvents('Recent fatigue/illness/injury signals', parts.recentSetbacks),
  ].join('\n');
}

/** Compose the planner prompt: blocked/preferred windows + active time one-offs. */
export function flattenSchedulingContext(parts: {
  blockedTimeWindows: PrefEntry<TimeWindow>[];
  preferredTimeWindows: PrefEntry<TimeWindow>[];
  activeTimeOneOffs: PreferenceEvent[];
}): string {
  const lines: string[] = ['=== Scheduling context ==='];
  lines.push(
    ...renderListSection(
      { label: 'Blocked time windows (HARD)', entries: parts.blockedTimeWindows },
      renderTimeWindow,
    ),
  );
  lines.push(
    ...renderListSection(
      { label: 'Preferred time windows', entries: parts.preferredTimeWindows },
      renderTimeWindow,
    ),
  );
  if (lines.length === 1) lines.push('No standing time-window preferences.');
  lines.push('');
  lines.push(flattenEvents('Active scheduling one-offs', parts.activeTimeOneOffs));
  return lines.join('\n');
}
