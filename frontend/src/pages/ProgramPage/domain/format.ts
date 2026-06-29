import type {
  PlannedExercise,
  PlannedStatus,
  RunBlock,
  RunStep,
  SegmentKind,
  WeekTheme,
} from './types';

// Display helpers — keep all label/format logic out of the components.

export function formatDayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  // A malformed/empty date makes toLocaleDateString throw on WebKit
  // ("The string did not match the expected pattern"). Fall back to the raw
  // value so one bad field never crashes the whole page render.
  if (Number.isNaN(d.getTime())) {
    return isoDate;
  }
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export function formatTimeRange(start: string, end: string): string {
  return `${start}–${end}`;
}

const STATUS_LABEL: Record<PlannedStatus, string> = {
  planned: 'Planned',
  completed: 'Completed',
  partially_completed: 'Partial',
  skipped: 'Skipped',
  deviated: 'Deviated',
};

export function statusLabel(status: PlannedStatus): string {
  return STATUS_LABEL[status];
}

const THEME_LABEL: Record<WeekTheme, string> = {
  assessment: 'Assessment',
  base: 'Base',
  build: 'Build',
  peak: 'Peak',
  deload: 'Deload',
  taper: 'Taper',
};

export function themeLabel(theme: WeekTheme): string {
  return THEME_LABEL[theme];
}

/* ── Running blocks ─────────────────────────────────────────────── */

const BLOCK_KIND_LABEL: Record<SegmentKind, string> = {
  warmup: 'Warm-Up',
  work: 'Work',
  recovery: 'Recovery',
  cooldown: 'Cool-Down',
};

export function blockKindLabel(kind: SegmentKind): string {
  return BLOCK_KIND_LABEL[kind];
}

// Header text for a block: an interval set ("Repeat ×6") when it repeats,
// otherwise the explicit label or the kind fallback.
export function blockLabel(block: RunBlock): string {
  if (block.repeat > 1) return `Repeat ×${block.repeat}`;
  return block.label ?? blockKindLabel(block.kind);
}

// The primary measure of a step: "2km" / "400m" / "90s" / "5min".
export function formatStepMeasure(step: RunStep): string {
  if (step.distanceM !== null) {
    return step.distanceM >= 1000 ? `${step.distanceM / 1000}km` : `${step.distanceM}m`;
  }
  if (step.durationSec !== null) {
    return step.durationSec >= 60 && step.durationSec % 60 === 0
      ? `${step.durationSec / 60}min`
      : `${step.durationSec}s`;
  }
  return '';
}

export function stepBadge(step: RunStep): 'RUN' | 'REST' {
  return step.type === 'rest' ? 'REST' : 'RUN';
}

/* ── Strength exercises ─────────────────────────────────────────── */

// "6" for a single target, "6–8" for a range.
export function formatReps(ex: PlannedExercise): string {
  return ex.targetRepsMin === ex.targetRepsMax
    ? `${ex.targetRepsMin}`
    : `${ex.targetRepsMin}–${ex.targetRepsMax}`;
}

// Absolute load wins, then %1RM; "—" when the plan leaves load open (RIR-driven).
export function formatLoad(ex: PlannedExercise): string {
  if (ex.targetWeightKg !== null) return `${ex.targetWeightKg} kg`;
  if (ex.targetPct1rm !== null) return `${ex.targetPct1rm}% 1RM`;
  return '—';
}

// "3:00" for whole minutes, "90 s" otherwise; "—" when unset.
export function formatRest(restSec: number | null): string {
  if (restSec === null) return '—';
  if (restSec >= 60) {
    const min = Math.floor(restSec / 60);
    const sec = restSec % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
  }
  return `${restSec} s`;
}

export interface SupersetGroup {
  // null for standalone exercises; the shared label for a real superset.
  supersetGroup: string | null;
  exercises: PlannedExercise[];
}

// Order by `order`, then fold consecutive exercises that share a non-null
// `supersetGroup` into one group. Standalone exercises each become their own
// single-exercise group, preserving sequence.
export function groupSupersets(exercises: PlannedExercise[]): SupersetGroup[] {
  const ordered = [...exercises].sort((a, b) => a.order - b.order);
  const groups: SupersetGroup[] = [];
  for (const ex of ordered) {
    const last = groups[groups.length - 1];
    if (
      ex.supersetGroup !== null &&
      last !== undefined &&
      last.supersetGroup === ex.supersetGroup
    ) {
      last.exercises.push(ex);
    } else {
      groups.push({ supersetGroup: ex.supersetGroup, exercises: [ex] });
    }
  }
  return groups;
}
