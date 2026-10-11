import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_ADMIN_ROUTE } from '../admin-auth/admin-auth.js';
import { ApiError } from '../errors/api-error.js';
import { type AuthUser, IS_PUBLIC } from './auth.decorators.js';
import { UserStatusCache } from './user-status.cache.js';

export const ACCESS_AUDIENCE = 'app';

interface AccessClaims {
  sub: string;
  sid: string;
}

/**
 * Global guard for app routes (TRD §7): `Authorization: Bearer <access token>`, a JWT with
 * aud=app (admin tokens, aud=admin, are rejected here), and an ACTIVE account (AU-05).
 * Routes marked @Public() skip it; admin routes have their own guard (AdminJwtGuard).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly statuses: UserStatusCache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(IS_ADMIN_ROUTE, targets)) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new ApiError(401, 'UNAUTHORIZED');

    let claims: AccessClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessClaims>(token, { audience: ACCESS_AUDIENCE, algorithms: ['HS256'] });
    } catch {
      throw new ApiError(401, 'TOKEN_INVALID', 'The access token is invalid or expired.');
    }

    const status = await this.statuses.get(claims.sub);
    if (status === 'SUSPENDED') throw new ApiError(403, 'ACCOUNT_SUSPENDED');
    if (status !== 'ACTIVE') throw new ApiError(401, 'ACCOUNT_NOT_ACTIVE');

    req.user = { id: claims.sub, sessionId: claims.sid };
    return true;
  }
}
