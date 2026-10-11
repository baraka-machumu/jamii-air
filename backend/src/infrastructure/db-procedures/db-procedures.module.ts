import { Global, Module } from '@nestjs/common';
import { AuthProcedures } from './auth.procedures.js';
import { EngagementProcedures } from './engagement.procedures.js';
import { MediaProcedures } from './media.procedures.js';
import { PostsProcedures } from './posts.procedures.js';
import { ProcedureRunner } from './procedure-runner.js';
import { SystemProcedures } from './system.procedures.js';
import { UsersProcedures } from './users.procedures.js';

/** Typed stored-procedure wrappers (TRD §6.5). Services call these, never SQL strings. */
@Global()
@Module({
  providers: [ProcedureRunner, SystemProcedures, AuthProcedures, UsersProcedures, MediaProcedures, PostsProcedures, EngagementProcedures],
  exports: [ProcedureRunner, SystemProcedures, AuthProcedures, UsersProcedures, MediaProcedures, PostsProcedures, EngagementProcedures],
})
export class DbProceduresModule {}
