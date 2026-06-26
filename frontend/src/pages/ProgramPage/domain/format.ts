import type {
  PlannedStatus,
  RunSegment,
  WeekTheme,
} from './types';

// Display helpers — keep all label/format logic out of the components.

export function formatDayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
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
  base: 'Base',
  build: 'Build',
  peak: 'Peak',
  deload: 'Deload',
  taper: 'Taper',
};

export function themeLabel(theme: WeekTheme): string {
  return THEME_LABEL[theme];
}

// "6 × 800m @ 4:45/km" style one-liner for a run segment.
export function formatSegment(seg: RunSegment): string {
  const amount =
    seg.distanceM !== null
      ? `${seg.distanceM >= 1000 ? `${seg.distanceM / 1000}km` : `${seg.distanceM}m`}`
      : seg.durationSec !== null
        ? `${seg.durationSec}s`
        : '';
  const head = seg.repeat > 1 ? `${seg.repeat} × ${amount}` : amount;
  const pace = seg.targetPace !== null ? ` @ ${seg.targetPace}` : '';
  const rest = seg.restSec !== null ? ` (${seg.restSec}s rest)` : '';
  return `${head}${pace}${rest}`.trim();
}

const SEGMENT_KIND_LABEL: Record<RunSegment['kind'], string> = {
  warmup: 'Warm-up',
  work: 'Work',
  recovery: 'Recovery',
  cooldown: 'Cool-down',
};

export function segmentKindLabel(kind: RunSegment['kind']): string {
  return SEGMENT_KIND_LABEL[kind];
}
