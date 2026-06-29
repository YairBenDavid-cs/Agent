import { UnauthorizedException } from '@nestjs/common';

/**
 * The fetch service rejected the request for auth reasons (bad/expired Garmin
 * credentials or session). Distinct from a transient/unreachable failure so the
 * orchestrator can mark the connection `auth_failed` (the user must re-enter
 * credentials) rather than `sync_failed` (retryable with the stored token).
 */
export class GarminAuthError extends UnauthorizedException {
  constructor(detail: string) {
    super({ code: 'GARMIN_AUTH_REJECTED', message: detail });
  }
}
