#!/usr/bin/env node
// Creates the Jamii Air project board and one GitHub issue per story in a backlog file.
//
// Usage (from the repo root, after `gh auth login` and `gh auth refresh -s project`):
//   node docs/backlog/create-github-issues.mjs docs/backlog/phase-1-database-E0-E1.md --dry-run
//   node docs/backlog/create-github-issues.mjs docs/backlog/phase-1-database-E0-E1.md
//
// Safe to re-run: labels are upserted, the milestone and board are reused, and a story
// whose issue title already exists is skipped.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const OWNER = 'baraka-machumu';
const REPO = `${OWNER}/jamii-air`;
const PROJECT_TITLE = 'Jamii Air';
const MILESTONE = 'Phase 1 — Database design';

const LABELS = {
  db: ['0E8A16', 'Database layer (backend/prisma)'],
  api: ['1D76DB', 'Backend API layer'],
  mobile: ['5319E7', 'Mobile app'],
  admin: ['B60205', 'Admin portal'],
  security: ['D93F0B', 'Security requirement or check'],
  ci: ['FBCA04', 'CI / tooling'],
  E0: ['C5DEF5', 'Epic E0 — Foundation'],
  E1: ['C5DEF5', 'Epic E1 — Accounts & access'],
  E2: ['C5DEF5', 'Epic E2 — Profiles & social graph'],
  E3: ['C5DEF5', 'Epic E3 — Content'],
  E4: ['C5DEF5', 'Epic E4 — Feed & engagement'],
  E5: ['C5DEF5', 'Epic E5 — Notifications'],
  E6: ['C5DEF5', 'Epic E6 — Safety & moderation'],
  E7: ['C5DEF5', 'Epic E7 — Data & insight'],
  E8: ['C5DEF5', 'Epic E8 — Quality & hardening'],
};

const [file, ...flags] = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');
if (!file) {
  console.error('Usage: node create-github-issues.mjs <backlog.md> [--dry-run]');
  process.exit(1);
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8' }).trim();
}

// Each "### <ID> — <title>" section is one story; "**Labels:** a, b · ..." gives its labels.
function parseStories(markdown) {
  return markdown
    .split(/^### /m)
    .slice(1)
    .map((section) => {
      const [heading, ...rest] = section.split('\n');
      const body = rest.join('\n').split(/^---$/m)[0].replace(/^## .*$/gm, '').trim();
      const labelLine = body.match(/\*\*Labels:\*\*\s*([^·\n]+)/);
      const labels = labelLine ? labelLine[1].split(',').map((l) => l.trim()).filter(Boolean) : [];
      return { title: heading.trim(), labels, body };
    });
}

const stories = parseStories(readFileSync(file, 'utf8'));
console.log(`${stories.length} stories in ${file}`);

if (dryRun) {
  for (const s of stories) console.log(`- ${s.title}  [${s.labels.join(', ')}]`);
  process.exit(0);
}

// Labels
for (const [name, [color, description]] of Object.entries(LABELS)) {
  gh(['label', 'create', name, '--repo', REPO, '--color', color, '--description', description, '--force']);
}

// Milestone
const milestones = JSON.parse(gh(['api', `repos/${REPO}/milestones?state=all&per_page=100`]));
if (!milestones.some((m) => m.title === MILESTONE)) {
  gh(['api', `repos/${REPO}/milestones`, '-f', `title=${MILESTONE}`]);
  console.log(`Created milestone "${MILESTONE}"`);
}

// Project board
const projects = JSON.parse(gh(['project', 'list', '--owner', OWNER, '--format', 'json'])).projects;
let project = projects.find((p) => p.title === PROJECT_TITLE);
if (!project) {
  project = JSON.parse(gh(['project', 'create', '--owner', OWNER, '--title', PROJECT_TITLE, '--format', 'json']));
  gh(['project', 'link', String(project.number), '--owner', OWNER, '--repo', REPO]);
  console.log(`Created project "${PROJECT_TITLE}" (#${project.number})`);
}

// Issues
const existing = new Set(
  JSON.parse(gh(['issue', 'list', '--repo', REPO, '--state', 'all', '--limit', '500', '--json', 'title'])).map((i) => i.title),
);
for (const s of stories) {
  if (existing.has(s.title)) {
    console.log(`skip (exists): ${s.title}`);
    continue;
  }
  const args = ['issue', 'create', '--repo', REPO, '--title', s.title, '--body', s.body, '--milestone', MILESTONE];
  for (const l of s.labels) args.push('--label', l);
  const url = gh(args);
  gh(['project', 'item-add', String(project.number), '--owner', OWNER, '--url', url]);
  console.log(`created: ${s.title}  ${url}`);
}

console.log(`\nDone. Board: https://github.com/users/${OWNER}/projects/${project.number}`);
