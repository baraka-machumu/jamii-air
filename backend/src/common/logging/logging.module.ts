// JSON logs with pino (TRD OB-01, SE-07). Every request gets an id: the caller's X-Request-Id
// when it is a sane token, else a new UUID; it is echoed in the X-Request-Id response header
// (API-06) and in every error body. Secrets and personal data are redacted.
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfig } from '../../config/app-config.js';

const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** SE-07: never log these. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.token',
  '*.refreshToken',
  '*.accessToken',
  '*.email',
  '*.dateOfBirth',
  '*.totp',
  '*.code',
];

export function requestIdOf(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.logLevel,
          genReqId: requestIdOf,
          redact: { paths: REDACT_PATHS, censor: '[redacted]' },
          customProps: (req: IncomingMessage) => ({ userId: (req as { user?: { id?: string } }).user?.id }),
          autoLogging: { ignore: (req: IncomingMessage) => req.url?.endsWith('/health/live') ?? false },
          serializers: {
            req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
            res: (res: { statusCode: number }) => ({ status: res.statusCode }),
          },
          // Human-readable only in a local terminal; containers and CI log JSON (pino-pretty is a dev dependency).
          transport: config.nodeEnv === 'development' && process.stdout.isTTY
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        },
      }),
    }),
  ],
})
export class LoggingModule {}
