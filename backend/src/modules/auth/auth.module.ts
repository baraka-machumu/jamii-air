import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ACCESS_AUDIENCE, JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import { UserStatusCache } from '../../common/auth/user-status.cache.js';
import { AppConfig } from '../../config/app-config.js';
import { PasswordHasher } from '../../infrastructure/crypto/password-hasher.js';
import { AuthController } from './auth.controller.js';
import { ACCESS_TTL_SECONDS, AuthService } from './auth.service.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.jwtAccessSecret,
        signOptions: { algorithm: 'HS256', expiresIn: ACCESS_TTL_SECONDS, audience: ACCESS_AUDIENCE, issuer: 'jamii-air' },
        verifyOptions: { algorithms: ['HS256'], issuer: 'jamii-air' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordHasher,
    UserStatusCache,
    // Every route requires a user access token unless marked @Public() (TRD §5.1).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [UserStatusCache, PasswordHasher],
})
export class AuthModule {}
