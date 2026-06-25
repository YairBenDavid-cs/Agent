import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Stable, machine-readable error codes (UPPER_SNAKE_CASE, namespaced by domain).
 * Clients branch on `code`; human `message` may change freely.
 */
export enum ErrorCode {
  VALIDATION_FAILED = 'COMMON.VALIDATION_FAILED',
  NOT_FOUND = 'COMMON.NOT_FOUND',
  INTERNAL = 'COMMON.INTERNAL',
  INTEGRATION_NOT_FOUND = 'INTEGRATIONS.NOT_FOUND',
  GARMIN_AUTH_FAILED = 'INTEGRATIONS.GARMIN_AUTH_FAILED',
  FETCHER_UNAVAILABLE = 'INGESTION.FETCHER_UNAVAILABLE',
}

/** Shape returned to clients for every failure. Backward-compatible contract. */
export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Domain/application errors carry an HTTP status + stable code + human message.
 * Handlers throw this; the global filter renders the envelope. Never hand-craft
 * error responses elsewhere.
 */
export class ApiError extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }

  static notFound(message: string, details?: unknown): ApiError {
    return new ApiError(
      HttpStatus.NOT_FOUND,
      ErrorCode.NOT_FOUND,
      message,
      details,
    );
  }
}
