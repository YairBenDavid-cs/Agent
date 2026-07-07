// Helpers for the month / day / year date-of-birth dropdowns. The draft stores
// the composed value as an ISO "YYYY-MM-DD" string; these split and rejoin it.

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Minimum sign-up age — the youngest selectable birth year. */
const MIN_AGE = 13;
/** Oldest selectable birth year. */
const EARLIEST_YEAR = 1940;

export interface DobParts {
  year: number | null;
  month: number | null; // 1-12
  day: number | null; // 1-31
}

export function parseDob(value: string): DobParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    return { year: null, month: null, day: null };
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Compose parts into "YYYY-MM-DD", or "" until all three are chosen. */
export function composeDob(parts: DobParts): string {
  const { year, month, day } = parts;
  if (year === null || month === null || day === null) {
    return '';
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function daysInMonth(year: number | null, month: number | null): number {
  if (month === null) {
    return 31;
  }
  // Day 0 of the next month is the last day of this month; year defaults to a
  // leap year so February shows 29 until a year is chosen.
  return new Date(year ?? 2000, month, 0).getDate();
}

/** Selectable birth years, newest first. */
export function birthYears(currentYear: number): number[] {
  const newest = currentYear - MIN_AGE;
  const years: number[] = [];
  for (let y = newest; y >= EARLIEST_YEAR; y -= 1) {
    years.push(y);
  }
  return years;
}

/** Whole years between the birth date and now, or null if incomplete. */
export function ageFrom(parts: DobParts, now: Date): number | null {
  const { year, month, day } = parts;
  if (year === null || month === null || day === null) {
    return null;
  }
  let age = now.getFullYear() - year;
  const monthDelta = now.getMonth() + 1 - month;
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < day)) {
    age -= 1;
  }
  return age;
}
