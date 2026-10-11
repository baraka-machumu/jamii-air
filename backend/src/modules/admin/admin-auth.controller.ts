// /api/v1/admin/auth (TRD §8.2). The refresh token lives only in an HttpOnly, Secure,
// SameSite=Strict cookie scoped to this path; refresh and logout also need `X-Admin-Client: 1`
// (a header a cross-site form cannot send).
import { Body, Controller, Headers, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AdminAuth, AdminPublic, type AuthAdmin, CurrentAdmin } from '../../common/admin-auth/admin-auth.js';
import { ApiError } from '../../common/errors/api-error.js';
import { API_PREFIX } from '../../app.setup.js';
import { AdminChangePasswordDto, AdminLoginDto, AdminLoginStep, AdminSessionResponse, AdminTotpDto } from './admin.dto.js';
import { ADMIN_ABSOLUTE_MS, AdminAuthService, type AdminSession } from './admin-auth.service.js';

export const ADMIN_REFRESH_COOKIE = 'ja_admin_rt';
const COOKIE_PATH = `/${API_PREFIX}/admin/auth`;
const FIFTEEN_MIN = 15 * 60_000;

@ApiTags('admin auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post('login')
  @AdminPublic()
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: FIFTEEN_MIN } }) // AP-07
  @ApiOperation({ summary: 'Step 1: email + password → TOTP challenge (or first-time enrollment)' })
  @ApiResponse({ status: 200, type: AdminLoginStep })
  login(@Body() dto: AdminLoginDto, @Headers('user-agent') ua?: string): Promise<AdminLoginStep> {
    return this.auth.login(dto.email, dto.password, ua ?? null);
  }

  @Post('totp/enroll')
  @AdminPublic()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: FIFTEEN_MIN } })
  @ApiOperation({ summary: 'Step 2 (first login): confirm the authenticator with a code → session' })
  @ApiResponse({ status: 200, type: AdminSessionResponse })
  async enroll(@Body() dto: AdminTotpDto, @Res({ passthrough: true }) res: Response, @Headers('user-agent') ua?: string) {
    return this.respond(res, await this.auth.enroll(dto.challengeToken, dto.code, ua ?? null));
  }

  @Post('totp/verify')
  @AdminPublic()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: FIFTEEN_MIN } })
  @ApiOperation({ summary: 'Step 2: 6-digit code → session' })
  @ApiResponse({ status: 200, type: AdminSessionResponse })
  async verify(@Body() dto: AdminTotpDto, @Res({ passthrough: true }) res: Response, @Headers('user-agent') ua?: string) {
    return this.respond(res, await this.auth.verify(dto.challengeToken, dto.code, ua ?? null));
  }

  @Post('refresh')
  @AdminPublic()
  @HttpCode(200)
  @Throttle({ default: { limit: 120, ttl: 3_600_000 } })
  @ApiHeader({ name: 'X-Admin-Client', required: true, description: '1' })
  @ApiOperation({ summary: 'Rotate the session cookie (extends the 30-minute idle timeout, never past 12 h)' })
  @ApiResponse({ status: 200, type: AdminSessionResponse })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    assertAdminClient(req);
    try {
      return this.respond(res, await this.auth.refresh(readCookie(req, ADMIN_REFRESH_COOKIE)));
    } catch (error) {
      clearCookie(res);
      throw error;
    }
  }

  @Post('logout')
  @AdminAuth()
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Admin-Client', required: true, description: '1' })
  @ApiOperation({ summary: 'End this session' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    assertAdminClient(req);
    await this.auth.logout(readCookie(req, ADMIN_REFRESH_COOKIE));
    clearCookie(res);
  }

  @Post('password')
  @AdminAuth()
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: FIFTEEN_MIN } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change your password (ends every session: sign in again)' })
  async changePassword(@CurrentAdmin() admin: AuthAdmin, @Body() dto: AdminChangePasswordDto, @Res({ passthrough: true }) res: Response) {
    await this.auth.changePassword(admin.id, admin.email, dto.currentPassword, dto.newPassword);
    clearCookie(res);
  }

  private respond(res: Response, session: AdminSession): AdminSessionResponse {
    res.cookie(ADMIN_REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true, secure: true, sameSite: 'strict', path: COOKIE_PATH, maxAge: ADMIN_ABSOLUTE_MS,
    });
    return { accessToken: session.accessToken, expiresIn: session.expiresIn, admin: session.admin };
  }
}

function assertAdminClient(req: Request): void {
  if (req.headers['x-admin-client'] !== '1') throw new ApiError(403, 'CSRF_CHECK_FAILED', 'Missing X-Admin-Client header.');
}

function clearCookie(res: Response): void {
  res.clearCookie(ADMIN_REFRESH_COOKIE, { httpOnly: true, secure: true, sameSite: 'strict', path: COOKIE_PATH });
}

/** Minimal Cookie header parsing (one cookie, no dependency). */
export function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}
