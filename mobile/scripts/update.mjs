#!/usr/bin/env node
// Publishes an EAS Update (JavaScript only, no new APK) to one channel, with the SAME environment
// the APKs on that channel were built with:
//
//   npm run update:preview -- --message "What changed"
//   npm run update:production -- --message "What changed"
//
// Why a script: `EXPO_PUBLIC_*` values are inlined into the bundle when it is exported. They live
// only in eas.json's build profiles, and `eas update` does not read those, so a bare
// `eas update --channel preview` shipped a bundle with no EXPO_PUBLIC_API_URL — every installed
// preview app would have stopped reaching the UAT API (found 2026-10-20). This copies the profile's
// `env` into the environment first, then checks the exported bundle actually contains the API URL.
// Without --message, the last commit's subject is used.
import { execSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE = join(dirname(fileURLToPath(import.meta.url)), '..');
const [profile, ...rest] = process.argv.slice(2);
const eas = JSON.parse(readFileSync(join(MOBILE, 'eas.json'), 'utf8'));
const build = eas.build?.[profile];
if (!build) {
  console.error(`Usage: node scripts/update.mjs <profile> [--message "…"]. Profiles: ${Object.keys(eas.build ?? {}).join(', ')}`);
  process.exit(1);
}

// A profile's env is its own plus whatever it `extends`, the nearer one winning, as EAS builds it.
function profileEnv(name, seen = new Set()) {
  const entry = eas.build[name];
  if (!entry || seen.has(name)) return {};
  seen.add(name);
  return { ...(entry.extends ? profileEnv(entry.extends, seen) : {}), ...entry.env };
}
const env = profileEnv(profile);

const args = [...rest];
if (!args.includes('--message')) {
  args.push('--message', execSync('git log -1 --format=%s', { cwd: MOBILE, encoding: 'utf8' }).trim());
}

console.log(`EAS Update → channel "${build.channel}" with ${Object.keys(env).join(', ') || 'no profile env'}`);
const result = spawnSync('npx', [
  'eas-cli@latest', 'update', '--channel', build.channel, '--environment', profile,
  '--platform', 'android', '--non-interactive', ...args,
], { cwd: MOBILE, stdio: 'inherit', shell: true, env: { ...process.env, ...env } });
if (result.status !== 0) process.exit(result.status ?? 1);

// The publish is done by now, so this cannot stop a bad bundle, only shout about it at once.
const apiUrl = env.EXPO_PUBLIC_API_URL;
if (apiUrl) {
  const dir = join(MOBILE, 'dist', '_expo', 'static', 'js', 'android');
  const bundle = readdirSync(dir).find((file) => file.startsWith('entry-') && file.endsWith('.hbc'));
  if (!bundle || !readFileSync(join(dir, bundle)).includes(apiUrl)) {
    console.error(`\nThe published bundle does NOT contain ${apiUrl}. Republish a working update now.`);
    process.exit(1);
  }
  console.log(`Checked: the bundle points at ${apiUrl}.`);
}
