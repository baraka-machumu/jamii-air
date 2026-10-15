#!/usr/bin/env node
// Copies the backend's OpenAPI spec into the portal and regenerates the TypeScript types
// (Plan 4.1, the same arrangement the mobile app uses):
//
//   cd backend && npm run openapi     # writes backend/openapi.json
//   cd admin   && npm run api:sync    # → src/api/openapi.json + src/api/schema.d.ts
//
// Both outputs are committed, so the portal builds without the backend; re-run after any API
// change. A renamed admin route or field then fails the type-check instead of the browser.
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ADMIN = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ADMIN, '..', 'backend', 'openapi.json');
const SPEC = join(ADMIN, 'src', 'api', 'openapi.json');
const TYPES = join(ADMIN, 'src', 'api', 'schema.d.ts');
const GENERATOR = 'openapi-typescript@7.13.0';

if (!existsSync(SOURCE)) {
  console.error(`No ${SOURCE}. Run \`npm run openapi\` in backend/ first.`);
  process.exit(1);
}
copyFileSync(SOURCE, SPEC);
execSync(`npx -y ${GENERATOR} "${SPEC}" -o "${TYPES}"`, { stdio: 'inherit' });
console.log('API spec and types updated: src/api/openapi.json, src/api/schema.d.ts');
