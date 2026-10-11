// Minimum app version (TRD API-07, App Flow §3): the mobile app sends `X-App-Version`; below
// MIN_APP_VERSION the API answers 426 APP_VERSION_UNSUPPORTED and the app shows "Update required".
// Off while MIN_APP_VERSION is unset. Admin routes (a web portal) and requests without the header
// (health checks, tools) are not affected.
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppConfig } from '../../config/app-config.js';
import { IS_ADMIN_ROUTE } from '../admin-auth/admin-auth.js';
import { ApiError } from '../errors/api-error.js';

export const VERSION_PATTERN = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

/** -1 / 0 / 1 for dotted numeric versions ("1.10.0" > "1.9.3"). */
export function compareVersions(a: string, b: string): number {
  const [x, y] = [a.split('.').map(Number), b.split('.').map(Number)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

@Injectable()
export class AppVersionGuard implements CanActivate {
  constructor(
    private readonly config: AppConfig,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const min = this.config.minAppVersion;
    if (!min) return true;
    if (this.reflector.getAllAndOverride<boolean>(IS_ADMIN_ROUTE, [context.getHandler(), context.getClass()])) return true;

    const header = context.switchToHttp().getRequest<Request>().headers['x-app-version'];
    const version = typeof header === 'string' ? header.trim() : undefined;
    if (!version || !VERSION_PATTERN.test(version)) return true;
    if (compareVersions(version, min) < 0) {
      throw new ApiError(426, 'APP_VERSION_UNSUPPORTED', 'Please update Jamii Air to continue.', { minVersion: min });
    }
    return true;
  }
}
