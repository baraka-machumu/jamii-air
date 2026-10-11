// Request / response shapes for /auth (TRD §5.1). Validation here is the first check (TRD §13.1);
// the stored procedures re-check the business rules (age ≥ 18, uniqueness, invite).
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsBoolean, IsEmail, IsIn, IsISO8601, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export const USERNAME_PATTERN = /^[A-Za-z0-9._]{3,30}$/;

export class RegisterDto {
  @ApiProperty({ example: 'amina@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'amina_shop', description: '3–30 letters, digits, "." or "_"' })
  @Matches(USERNAME_PATTERN, { message: 'username must be 3–30 letters, digits, "." or "_"' })
  username!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @Length(8, 128)
  password!: string;

  @ApiProperty({ example: '1999-05-14', description: 'YYYY-MM-DD; the user must be 18 or older' })
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateOfBirth!: string;

  @ApiPropertyOptional({ description: 'Required during the pilot (BR-AC-02)' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  inviteCode?: string;

  @ApiProperty({ description: 'Terms of Service and Privacy Policy accepted (BR-AC-06)' })
  @Equals(true)
  acceptTerms!: boolean;

  @ApiPropertyOptional({ enum: ['en', 'sw'] })
  @IsOptional()
  @IsIn(['en', 'sw'])
  locale?: 'en' | 'sw';
}

export class LoginDto {
  @ApiProperty({ description: 'Username or email' })
  @IsString()
  @Length(1, 254)
  identifier!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 128)
  password!: string;

  @ApiPropertyOptional({ description: 'Restore an account scheduled for deletion (BR-AC-08)' })
  @IsOptional()
  @IsBoolean()
  cancelDeletion?: boolean;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @Length(20, 200)
  refreshToken!: string;
}

export class LogoutDto extends RefreshDto {
  @ApiPropertyOptional({ description: 'This installation; its push token is removed' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  installationId?: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class ResetPasswordDto extends ForgotPasswordDto {
  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @Length(8, 128)
  newPassword!: string;
}

export class ChangePasswordDto {
  @ApiProperty() @IsString() @Length(1, 128) currentPassword!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @Length(8, 128)
  newPassword!: string;

  @ApiPropertyOptional({ description: 'This installation: its push registration is kept, every other one removed' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  installationId?: string;
}

export class SessionResponse {
  @ApiProperty({ description: 'JWT, 15 minutes; keep in memory' })
  accessToken!: string;

  @ApiProperty({ description: 'Opaque, 30 days, rotated on every refresh; keep in secure storage' })
  refreshToken!: string;

  @ApiProperty({ example: 900 })
  expiresIn!: number;

  @ApiProperty({ example: { id: '01a1…', username: 'amina_shop' } })
  user!: { id: string; username?: string };
}
