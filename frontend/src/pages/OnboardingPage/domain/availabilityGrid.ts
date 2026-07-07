// Bridges the visual availability heatmap (hourly cells, Mon–Sun) and the
// AvailabilitySlot[] the API expects. The grid is the source of truth in the UI;
// contiguous painted cells collapse into merged start/end windows on change.
import type { AvailabilitySlot, WeekDay } from './types';

/** First hour shown in the grid (05:00). */
export const HOUR_START = 5;
/** One cell per hour from 05:00 up to 23:00 → 18 cells. */
export const SLOT_COUNT = 18;

export interface GridDay {
  key: WeekDay;
  short: string;
}

export const WEEK_DAYS: GridDay[] = [
  { key: 'mon', short: 'Mon' },
  { key: 'tue', short: 'Tue' },
  { key: 'wed', short: 'Wed' },
  { key: 'thu', short: 'Thu' },
  { key: 'fri', short: 'Fri' },
  { key: 'sat', short: 'Sat' },
  { key: 'sun', short: 'Sun' },
];

/** Painted cells per day, keyed by weekday. Cell index i covers hour HOUR_START+i. */
export type GridState = Record<WeekDay, Set<number>>;

function emptyGrid(): GridState {
  return {
    mon: new Set(),
    tue: new Set(),
    wed: new Set(),
    thu: new Set(),
    fri: new Set(),
    sat: new Set(),
    sun: new Set(),
  };
}

function hourOf(time: string): number {
  const [h] = time.split(':');
  return Number(h);
}

/** "07:00" for hour 7. */
function toTime(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/** Expand slots into the set of painted hourly cells per day. */
export function slotsToGrid(slots: AvailabilitySlot[]): GridState {
  const grid = emptyGrid();
  for (const slot of slots) {
    const start = hourOf(slot.startTime);
    const end = hourOf(slot.endTime);
    for (let h = start; h < end; h += 1) {
      const index = h - HOUR_START;
      if (index >= 0 && index < SLOT_COUNT) {
        grid[slot.day].add(index);
      }
    }
  }
  return grid;
}

/** Collapse contiguous cells per day into merged AvailabilitySlot windows. */
export function gridToSlots(grid: GridState): AvailabilitySlot[] {
  const slots: AvailabilitySlot[] = [];
  for (const { key } of WEEK_DAYS) {
    const cells = [...grid[key]].sort((a, b) => a - b);
    let runStart: number | null = null;
    let prev: number | null = null;
    const flush = (endExclusive: number): void => {
      if (runStart !== null) {
        slots.push({
          day: key,
          startTime: toTime(HOUR_START + runStart),
          endTime: toTime(HOUR_START + endExclusive),
        });
      }
    };
    for (const cell of cells) {
      if (runStart === null) {
        runStart = cell;
      } else if (prev !== null && cell !== prev + 1) {
        flush(prev + 1);
        runStart = cell;
      }
      prev = cell;
    }
    if (prev !== null) {
      flush(prev + 1);
    }
  }
  return slots;
}

/** Toggle a single cell and return the updated slots. */
export function toggleCell(
  slots: AvailabilitySlot[],
  day: WeekDay,
  cell: number,
  paint: boolean,
): AvailabilitySlot[] {
  const grid = slotsToGrid(slots);
  if (paint) {
    grid[day].add(cell);
  } else {
    grid[day].delete(cell);
  }
  return gridToSlots(grid);
}

/** Short scale label, e.g. 5 → "5a", 13 → "1p", 12 → "12p". */
export function shortHour(hour: number): string {
  const period = hour < 12 ? 'a' : 'p';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}${period}`;
}

/** Long time label, e.g. "6:00 AM". */
export function longHour(hour: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${period}`;
}

/** Human range for a slot, e.g. "6:00 AM – 8:00 AM". */
export function slotRangeLabel(slot: AvailabilitySlot): string {
  return `${longHour(hourOf(slot.startTime))} – ${longHour(hourOf(slot.endTime))}`;
}

/** Total painted hours across the week. */
export function totalHours(slots: AvailabilitySlot[]): number {
  const grid = slotsToGrid(slots);
  return WEEK_DAYS.reduce((sum, { key }) => sum + grid[key].size, 0);
}

/** Distinct days with at least one painted cell. */
export function activeDayCount(slots: AvailabilitySlot[]): number {
  const grid = slotsToGrid(slots);
  return WEEK_DAYS.filter(({ key }) => grid[key].size > 0).length;
}
