import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';

/** The authenticated app user on a request (set by JwtAuthGuard). */
export interface AuthUser {
  id: string;
  /** Refresh-token family of this device's session (JWT `sid`). */
  sessionId: string;
}

export const IS_PUBLIC = 'isPublic';

/** Opt a route out of the global JwtAuthGuard (TRD §5.1 🔓 routes). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** `@CurrentUser() user: AuthUser` in a controller method. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
