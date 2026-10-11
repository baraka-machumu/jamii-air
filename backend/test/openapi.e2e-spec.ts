// Plan task 2.14: the OpenAPI spec is complete enough to generate the mobile and admin clients
// from: every operation has a summary, a typed success response (202 / 204 have no body), and
// declares bearer auth unless it is a public auth or health route.
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { createApp, openApiDocument } from './support.js';

const PUBLIC = /^\/api\/v1\/(health\/|auth\/(register|login|refresh|password\/(forgot|reset))|admin\/auth\/(login|totp\/|refresh))/;

describe('OpenAPI spec (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('documents every operation fully', async () => {
    const doc = await openApiDocument(app);
    const problems: string[] = [];
    let operations = 0;
    for (const [path, ops] of Object.entries(doc.paths)) {
      for (const [method, raw] of Object.entries(ops)) {
        const op = raw as { summary?: string; security?: unknown[]; responses?: Record<string, { content?: Record<string, { schema?: unknown }> }> };
        const name = `${method.toUpperCase()} ${path}`;
        operations++;
        if (!op.summary) problems.push(`${name}: no summary`);
        const success = Object.entries(op.responses ?? {}).filter(([code]) => code.startsWith('2'));
        if (success.length === 0) problems.push(`${name}: no success response`);
        for (const [code, res] of success) {
          if (code !== '202' && code !== '204' && !res.content?.['application/json']?.schema) problems.push(`${name}: ${code} has no schema`);
        }
        if (!PUBLIC.test(path) && !op.security?.length) problems.push(`${name}: no bearer auth declared`);
      }
    }
    expect(problems).toEqual([]);
    expect(operations).toBeGreaterThanOrEqual(65);
  });

  it('keeps the share-link pages out of the API spec', async () => {
    const doc = await openApiDocument(app);
    expect(Object.keys(doc.paths).every((p) => p.startsWith('/api/v1/'))).toBe(true);
  });
});
