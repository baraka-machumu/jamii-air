import { Global, Module } from '@nestjs/common';
import { ProcedureRunner } from './procedure-runner.js';
import { SystemProcedures } from './system.procedures.js';

/** Typed stored-procedure wrappers (TRD §6.5). Services call these, never SQL strings. */
@Global()
@Module({
  providers: [ProcedureRunner, SystemProcedures],
  exports: [ProcedureRunner, SystemProcedures],
})
export class DbProceduresModule {}
