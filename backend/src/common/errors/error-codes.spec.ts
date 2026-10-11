// Every error code the API or a procedure can raise is published in ERROR_CODES (and so in the
// OpenAPI spec the apps translate from). Scans the sources rather than trusting memory.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ERROR_CODES } from './error-codes.js';

const ROOT = join(import.meta.dirname, '..', '..', '..');

function files(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'generated' ? [] : files(path, ext);
    return path.endsWith(ext) && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

const CODE = /'([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|[A-Z]{5,})'/g;

function raisedCodes(): Set<string> {
  const found = new Set<string>();
  // Procedures: RAISE … MESSAGE = 'CODE'.
  for (const file of files(join(ROOT, 'prisma', 'functions'), '.sql')) {
    for (const m of readFileSync(file, 'utf8').matchAll(/MESSAGE = '([A-Z_]+)'/g)) found.add(m[1]);
  }
  // API: new ApiError(status, 'CODE' …), `const code = cond ? 'A' : 'B'`, and the filter's status map.
  for (const file of files(join(ROOT, 'src'), '.ts')) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!/ApiError\(|const code =|^\s+\d{3}: '/.test(line)) continue;
      // Values compared against (`outcome === 'EXPIRED'`) are inputs, not raised codes.
      const raised = line.replace(/[!=]==\s*'[^']*'/g, '');
      for (const m of raised.matchAll(CODE)) found.add(m[1]);
    }
  }
  return found;
}

describe('ERROR_CODES', () => {
  it('lists every code the API and the procedures can raise', () => {
    const listed = new Set<string>(ERROR_CODES);
    const missing = [...raisedCodes()].filter((code) => !listed.has(code)).sort();
    expect(missing).toEqual([]);
  });

  it('has no duplicates', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});
