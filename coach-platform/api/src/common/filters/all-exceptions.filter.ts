import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ErrorCode, ErrorEnvelope } from '../errors/api-error';

/**
 * Single place that turns any thrown error into the public ErrorEnvelope.
 * No controller duplicates try/catch + response formatting.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    const { status, body } = this.normalize(exception);
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(exception);
    }
    response.status(status).json(body);
  }

  private normalize(exception: unknown): {
    status: number;
    body: ErrorEnvelope;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      return { status, body: { error: this.fromHttpPayload(payload) } };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        error: {
          code: ErrorCode.INTERNAL,
          message: 'An unexpected error occurred.',
        },
      },
    };
  }

  private fromHttpPayload(payload: string | object): ErrorEnvelope['error'] {
    if (typeof payload === 'string') {
      return { code: ErrorCode.INTERNAL, message: payload };
    }

    const record = payload as Record<string, unknown>;

    // ApiError already carries a stable code.
    if (typeof record.code === 'string') {
      return {
        code: record.code,
        message: String(record.message ?? ''),
        details: record.details,
      };
    }

    // Nest's built-in exceptions (e.g. ValidationPipe) expose `message`.
    return {
      code: ErrorCode.VALIDATION_FAILED,
      message: Array.isArray(record.message)
        ? 'Request validation failed.'
        : String(record.message ?? 'Request failed.'),
      details: Array.isArray(record.message) ? record.message : undefined,
    };
  }
}
