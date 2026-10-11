// Global exception filter: every error leaves the API in the envelope of TRD API-05.
//   ApiError / JA<status> from a procedure → its status and code
//   Nest HttpException (validation, 404 route, …) → its status with a stable code
//   anything else → 500 INTERNAL_ERROR; details are logged with the request id, never returned (SR-07)
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiError, type ErrorBody, defaultMessage } from './api-error.js';
import { businessErrorOf, databaseErrorOf } from './db-error.js';

const STATUS_CODES: Record<number, string> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request & { id?: string }>();
    const res = http.getResponse<Response>();
    const error = this.toApiError(exception, req);

    const body: ErrorBody = {
      error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
      requestId: String(req.id ?? ''),
    };
    res.status(error.status).json(body);
  }

  private toApiError(exception: unknown, req: Request): ApiError {
    if (exception instanceof ApiError) return exception;

    const business = businessErrorOf(exception);
    if (business) return business;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status < 500 || status === HttpStatus.SERVICE_UNAVAILABLE) {
        const code = STATUS_CODES[status] ?? `HTTP_${status}`;
        const response = exception.getResponse();
        const messages = typeof response === 'object' && response && 'message' in response ? response.message : undefined;
        return new ApiError(status, code, defaultMessage(code),
          Array.isArray(messages) ? { fields: messages } : undefined);
      }
    }

    const db = databaseErrorOf(exception);
    this.logger.error(
      {
        err: exception,
        sqlState: db?.sqlState,
        // An unexpected unique violation means a procedure missed a check: a bug (TRD §6.4).
        bug: db?.sqlState === '23505' ? 'unexpected unique violation' : undefined,
        route: `${req.method} ${req.route?.path ?? req.path}`,
      },
      'Unhandled error',
    );
    return new ApiError(HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR');
  }
}
