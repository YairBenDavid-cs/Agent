import { GarminAuth } from '../../integrations/domain/integration.model';
import { FetchResultDto } from './dto/fetch-result.dto';

export const GARMIN_FETCHER = Symbol('GARMIN_FETCHER');

export interface FetchInput {
  userId: string;
  /** Decrypted Garmin auth. Never logged, never persisted by the fetcher. */
  auth: GarminAuth;
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD inclusive
}

/**
 * Port to the stateless Python fetch service. Lives in the application layer
 * (not domain) because ingestion is a pure orchestration context with no domain
 * model of its own — its only "rules" are how it talks to the boundary.
 */
export interface FetcherPort {
  fetch(input: FetchInput): Promise<FetchResultDto>;
}
