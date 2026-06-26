export const GARMIN_CONNECTED = 'garmin.connected';

/**
 * Emitted right after a user's Garmin credentials are stored. The ingestion
 * context listens for it and kicks off a fetch run, so connecting Garmin
 * immediately backfills the user's data and caches a fresh session — without
 * Integrations having to know anything about ingestion.
 */
export class GarminConnectedEvent {
  constructor(public readonly userId: string) {}
}
