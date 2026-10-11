#!/usr/bin/env node
// Copies the backend's OpenAPI spec into the app and regenerates the TypeScript types (Plan 3.2):
//
//   cd backend && npm run openapi      # writes backend/openapi.json
//   cd mobile  && npm run api:sync     # → src/api/openapi.json + src/api/schema.d.ts
//
// Both outputs are committed, so the app builds without the backend; re-run after any API change.
// The generator runs pinned through npx: it needs TypeScript 5 while the app uses TypeScript 6.
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(MOBILE, '..', 'backend', 'openapi.json');
const SPEC = join(MOBILE, 'src', 'api', 'openapi.json');
const TYPES = join(MOBILE, 'src', 'api', 'schema.d.ts');
const GENERATOR = 'openapi-typescript@7.13.0';

if (!existsSync(SOURCE)) {
  console.error(`No ${SOURCE}. Run \`npm run openapi\` in backend/ first.`);
  process.exit(1);
}
copyFileSync(SOURCE, SPEC);
execSync(`npx -y ${GENERATOR} "${SPEC}" -o "${TYPES}"`, { stdio: 'inherit' });
console.log('API spec and types updated: src/api/openapi.json, src/api/schema.d.ts');
