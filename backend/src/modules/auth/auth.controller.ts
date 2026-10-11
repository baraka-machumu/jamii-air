// /api/v1/auth (TRD §5.1). Rate limits per client IP, as in the endpoint catalogue.
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthUser, CurrentUser, Public } from '../../common/auth/auth.decorators.js';
import {
  ChangePasswordDto, ForgotPasswordDto, LoginDto, LogoutDto, RefreshDto, RegisterDto, ResetPasswordDto, SessionResponse,
} from './auth.dto.js';
import { AuthService } from './auth.service.js';
import { UserAgent } from '../../common/http/request-headers.js';

const HOUR = 3_600_000;
const userAgentOf = (ua: string | undefined) => (ua ? ua.slice(0, 255) : null);

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: HOUR } })
  @ApiOperation({ summary: 'Create an account (18+, invite code during the pilot)' })
  @ApiResponse({ status: 201, type: SessionResponse })
  register(@Body() dto: RegisterDto, @UserAgent() ua?: string): Promise<SessionResponse> {
    return this.auth.register(dto, userAgentOf(ua));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  @ApiOperation({ summary: 'Log in with username or email' })
  @ApiResponse({ status: 200, type: SessionResponse })
  login(@Body() dto: LoginDto, @UserAgent() ua?: string): Promise<SessionResponse> {
    return this.auth.login(dto, userAgentOf(ua));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: HOUR } })
  @ApiOperation({ summary: 'Rotate the refresh token; a reused token ends the session family' })
  @ApiResponse({ status: 200, type: SessionResponse })
  refresh(@Body() dto: RefreshDto): Promise<SessionResponse> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: "End this device's session and remove its push token" })
  async logout(@Body() dto: LogoutDto): Promise<void> {
    await this.auth.logout(dto.refreshToken, dto.installationId ?? null);
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: HOUR } })
  @ApiOperation({ summary: 'Email a reset code (same answer whether or not the email exists)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.auth.forgotPassword(dto);
  }

  @Post('password/change')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: HOUR } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change your password (current one re-entered); signs out every other device' })
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto): Promise<void> {
    await this.auth.changePassword(user.id, user.sessionId, dto);
  }

  @Public()
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: HOUR } })
  @ApiOperation({ summary: 'Set a new password with the emailed code; ends every session' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(dto);
  }
}
