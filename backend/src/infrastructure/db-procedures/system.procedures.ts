import { Injectable } from '@nestjs/common';
import { ping } from '../../generated/prisma/sql/ping.js';
import { ProcedureRunner } from './procedure-runner.js';

/** Typed wrappers for the system procedures. One wrapper per prisma/sql/ call file. */
@Injectable()
export class SystemProcedures {
  constructor(private readonly db: ProcedureRunner) {}

  async ping(viewerId: string): Promise<string> {
    const row = await this.db.one('fn_ping', ping(viewerId));
    return row.reply ?? '';
  }
}
