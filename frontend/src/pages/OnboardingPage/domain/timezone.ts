// Resolves the user's IANA time zone from the browser's Intl runtime. Falls back
// to "UTC" if the environment doesn't report one (older browsers, locked-down
// configs). The backend validates this against its own tz database.
export function detectTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz.trim() !== '' ? tz : 'UTC';
  } catch {
    return 'UTC';
  }
}
