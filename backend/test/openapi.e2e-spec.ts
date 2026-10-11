// Plan task 2.14: the OpenAPI spec is complete enough to generate the mobile and admin clients
// from: every operation has a summary, a typed success response (202 / 204 have no body), and
// declares bearer auth unless it is a public auth or health route.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('resolves every $ref (type generators reject a dangling one)', async () => {
    const doc = await openApiDocument(app);
    const refs = [...JSON.stringify(doc).matchAll(/"\$ref":"#\/components\/schemas\/([^"]+)"/g)].map((m) => m[1]!);
    const schemas = (doc as unknown as { components: { schemas: Record<string, unknown> } }).components.schemas;
    expect([...new Set(refs)].filter((name) => !schemas[name])).toEqual([]);
  });

  it('requires no header a client cannot be expected to send by hand (only X-Admin-Client)', async () => {
    const doc = await openApiDocument(app);
    const required = Object.entries(doc.paths).flatMap(([path, ops]) => Object.entries(ops).flatMap(([method, op]) =>
      ((op as { parameters?: { in: string; name: string; required?: boolean }[] }).parameters ?? [])
        .filter((p) => p.in === 'header' && p.required && p.name !== 'X-Admin-Client')
        .map((p) => `${method.toUpperCase()} ${path}: ${p.name}`)));
    expect(required).toEqual([]);
  });

  it('keeps the share-link pages out of the API spec', async () => {
    const doc = await openApiDocument(app);
    expect(Object.keys(doc.paths).every((p) => p.startsWith('/api/v1/'))).toBe(true);
  });

  // Plan task 2.15 "API e2e for every endpoint": a route added without a test fails here.
  it('has at least one e2e call for every operation', async () => {
    const doc = await openApiDocument(app);
    const dir = import.meta.dirname;
    const tests = readdirSync(dir).filter((f) => f.endsWith('.e2e-spec.ts')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const quote = '[\'"`]';
    // A call looks like `.post('/api/v1/posts/${id}/like'` or `a('post', '/api/v1/admin/…'`; path
    // parameters match any segment.
    const untested = Object.entries(doc.paths).flatMap(([path, ops]) => Object.keys(ops).filter((method) => {
      const route = path.split(/\{[^}]+\}/).map(escape).join('[^\'"`?/]+');
      return !new RegExp(`(\\.${method}\\(|${method}', )${quote}${route}(${quote}|\\?)`).test(tests);
    }).map((method) => `${method.toUpperCase()} ${path}`));
    expect(untested).toEqual([]);
  });
});
