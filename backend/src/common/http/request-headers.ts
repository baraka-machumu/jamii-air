// Optional request headers read by handlers. Nest's @Headers('x') makes Swagger publish `x` as a
// REQUIRED parameter, which generated clients then demand (found by the mobile client in task 3.2).
// These custom decorators are invisible to Swagger; document the header with @ApiHeader where a
// client should know about it (Idempotency-Key), and not at all where it is automatic (User-Agent).
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

function header(name: string) {
  return createParamDecorator((_data: unknown, ctx: ExecutionContext): string | undefined => {
    const value = ctx.switchToHttp().getRequest<Request>().headers[name];
    return Array.isArray(value) ? value[0] : value;
  });
}

/** The client's User-Agent (recorded with sessions), if any. */
export const UserAgent = header('user-agent');

/** The Idempotency-Key header (TRD API-08), if any. */
export const IdempotencyKey = header('idempotency-key');
