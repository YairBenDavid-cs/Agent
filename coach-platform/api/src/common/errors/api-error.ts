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
  AUTH_INVALID_CREDENTIALS = 'AUTH.INVALID_CREDENTIALS',
  AUTH_TOKEN_INVALID = 'AUTH.TOKEN_INVALID',
  AUTH_EMAIL_TAKEN = 'AUTH.EMAIL_TAKEN',
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

  /** A request the caller may not make in the current state (400). */
  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_FAILED,
      message,
      details,
    );
  }

  /** Single generic auth failure — never reveals which factor was wrong. */
  static invalidCredentials(): ApiError {
    return new ApiError(
      HttpStatus.UNAUTHORIZED,
      ErrorCode.AUTH_INVALID_CREDENTIALS,
      'Invalid email or password.',
    );
  }

  static tokenInvalid(message = 'Invalid or expired token.'): ApiError {
    return new ApiError(
      HttpStatus.UNAUTHORIZED,
      ErrorCode.AUTH_TOKEN_INVALID,
      message,
    );
  }

  static emailTaken(): ApiError {
    return new ApiError(
      HttpStatus.CONFLICT,
      ErrorCode.AUTH_EMAIL_TAKEN,
      'A user with this email already exists.',
    );
  }
}
