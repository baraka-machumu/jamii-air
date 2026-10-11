// Admin authentication (TRD §8.2): access tokens with aud=admin signed with the admin key, a
// separate guard with role checks, and route decorators. The app's JwtAuthGuard skips admin routes
// and this guard rejects user tokens, so neither token works on the other side.
import {
  applyDecorators, type CanActivate, createParamDecorator, type ExecutionContext, Inject, Injectable, SetMetadata, UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AdminRole } from '../../infrastructure/db-procedures/admin-auth.procedures.js';
import { ApiError } from '../errors/api-error.js';

export const ADMIN_AUDIENCE = 'admin';
export const ADMIN_CHALLENGE_AUDIENCE = 'admin-challenge';
export const ADMIN_ISSUER = 'jamii-air';
/** JwtService configured with ADMIN_JWT_SECRET (provided by AdminModule). */
export const ADMIN_JWT = Symbol('ADMIN_JWT');

export const IS_ADMIN_ROUTE = 'isAdminRoute';
const ADMIN_ROLES = 'adminRoles';

export interface AdminAccessClaims {
  sub: string;
  role: AdminRole;
  /** Session family (admin_sessions.family_id). */
  sid: string;
  email: string;
}

export interface AuthAdmin {
  id: string;
  role: AdminRole;
  sessionId: string;
  email: string;
}

@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ADMIN_JWT) private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { admin?: AuthAdmin }>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new ApiError(401, 'UNAUTHORIZED');

    let claims: AdminAccessClaims;
    try {
      claims = await this.jwt.verifyAsync<AdminAccessClaims>(token, { audience: ADMIN_AUDIENCE, issuer: ADMIN_ISSUER, algorithms: ['HS256'] });
    } catch {
      throw new ApiError(401, 'TOKEN_INVALID', 'The access token is invalid or expired.');
    }

    // Role from the token (≤ 15 min old); every procedure re-checks role, status and lock (fn__assert_admin).
    const roles = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ADMIN_ROLES, [context.getHandler(), context.getClass()]);
    if (roles?.length && !roles.includes(claims.role)) throw new ApiError(403, 'ADMIN_FORBIDDEN');

    req.admin = { id: claims.sub, role: claims.role, sessionId: claims.sid, email: claims.email };
    return true;
  }
}

/** An admin route that needs an admin access token; no roles = any admin role. */
export const AdminAuth = (...roles: AdminRole[]) =>
  applyDecorators(SetMetadata(IS_ADMIN_ROUTE, true), SetMetadata(ADMIN_ROLES, roles), UseGuards(AdminJwtGuard));

/** An admin route without an access token (login steps, refresh by cookie). */
export const AdminPublic = () => SetMetadata(IS_ADMIN_ROUTE, true);

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthAdmin => ctx.switchToHttp().getRequest<{ admin: AuthAdmin }>().admin,
);
