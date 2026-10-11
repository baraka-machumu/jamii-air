import { Global, Module } from '@nestjs/common';
import { AppConfig, loadConfig } from './app-config.js';

/** Provides the validated AppConfig everywhere; loading fails fast at boot. */
@Global()
@Module({
  providers: [{ provide: AppConfig, useFactory: () => loadConfig() }],
  exports: [AppConfig],
})
export class ConfigModule {}
