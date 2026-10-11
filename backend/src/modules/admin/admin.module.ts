import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ADMIN_JWT, AdminJwtGuard } from '../../common/admin-auth/admin-auth.js';
import { AppConfig } from '../../config/app-config.js';
import { AuthModule } from '../auth/auth.module.js';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

/** Admin portal API (TRD §8, AR-09): same process as the app API, own auth, guards and key. */
@Module({
  imports: [AuthModule],
  controllers: [AdminAuthController, AdminController],
  providers: [
    { provide: ADMIN_JWT, inject: [AppConfig], useFactory: (config: AppConfig) => new JwtService({ secret: config.admin.jwtSecret }) },
    AdminJwtGuard,
    AdminAuthService,
    AdminService,
  ],
})
export class AdminModule {}
