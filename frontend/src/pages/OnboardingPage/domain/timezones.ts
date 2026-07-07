// A curated list of common IANA time zones for the picker, plus display helpers.
// The draft holds the raw IANA id (auto-detected at first render); the picker
// lets the user override it. Local times are computed on demand via Intl.

export const TIME_ZONES: string[] = [
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Toronto',
  'America/Mexico_City',
  'America/Bogota',
  'America/Lima',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'Atlantic/Reykjavik',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Lisbon',
  'Europe/Madrid',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Rome',
  'Europe/Zurich',
  'Europe/Stockholm',
  'Europe/Warsaw',
  'Europe/Athens',
  'Europe/Istanbul',
  'Europe/Moscow',
  'Africa/Lagos',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Asia/Jerusalem',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Perth',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
];

/** "Europe/Paris" → "Europe · Paris"; "America/Argentina/Buenos_Aires" →
 *  "America · Buenos Aires". Underscores become spaces. */
export function prettyZone(zone: string): string {
  const parts = zone.split('/');
  if (parts.length === 1) {
    return zone;
  }
  const region = parts[0] ?? zone;
  const city = parts[parts.length - 1] ?? zone;
  return `${region} · ${city.replace(/_/g, ' ')}`;
}

/** Current wall-clock time in a zone, e.g. "9:41 AM". Falls back to "" on error. */
export function localTimeIn(zone: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: zone,
    }).format(now);
  } catch {
    return '';
  }
}

/** Ensure the auto-detected zone is offered even if it's not in the curated list. */
export function zonesWith(detected: string): string[] {
  if (detected && !TIME_ZONES.includes(detected)) {
    return [detected, ...TIME_ZONES];
  }
  return TIME_ZONES;
}
