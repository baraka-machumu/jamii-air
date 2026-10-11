import { Injectable, Logger } from '@nestjs/common';
import type { TypedSql } from '@prisma/client/runtime/client';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Runs one TypedSQL call to a stored procedure (TRD §6.5: one activity = one call = one
 * transaction). Logs the procedure name and its latency (OB-01, OB-03). Errors propagate
 * unchanged; the global filter maps `JA<status>` to API errors.
 */
@Injectable()
export class ProcedureRunner {
  private readonly logger = new Logger('Procedures');

  constructor(private readonly prisma: PrismaService) {}

  async rows<Params extends unknown[], Row>(procedure: string, query: TypedSql<Params, Row>): Promise<Row[]> {
    const started = performance.now();
    try {
      return await this.prisma.$queryRawTyped(query);
    } finally {
      this.logger.debug({ procedure, latencyMs: Math.round((performance.now() - started) * 10) / 10 }, 'procedure call');
    }
  }

  /** Exactly one row (procedures that return a single result row). */
  async one<Params extends unknown[], Row>(procedure: string, query: TypedSql<Params, Row>): Promise<Row> {
    const rows = await this.rows(procedure, query);
    if (rows.length !== 1) throw new Error(`${procedure} returned ${rows.length} rows, expected 1`);
    return rows[0];
  }
}
