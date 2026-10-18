# Jamii Air

A photo-sharing social app for East Africa. One repository with three apps:

```
jamii-air/
├── backend/   NestJS API + worker + database procedures
├── mobile/    Expo / React Native app (iOS + Android)
├── admin/     React + Vite admin portal
├── scripts/   Dev helpers (dev-phone.bat: run the stack for testing on a phone)
└── docs/      Requirements, design and implementation plan
```

The apps share no code. They talk only over the HTTP API (`/api/v1`). `mobile/` and `admin/` generate their API types from the backend's OpenAPI spec.

## Getting started

```bash
cd backend
npm install
cp .env.example .env        # replace every change-me
npm run infra:up            # PostgreSQL, Redis, MinIO, Mailpit in Docker
npm run db:migrate && npm run db:generate
npm run start:dev           # API on http://localhost:3000 (docs: /api/v1/docs)
npm run build && node dist/worker.js                   # worker: media, push, maintenance (reads .env too)
```

Details, tests and scripts are in [backend/README.md](backend/README.md).

```bash
cd mobile
npm install
npx expo start              # details in mobile/README.md
```

Testing on a phone (Windows): double-click `scripts\dev-phone.bat`. It starts the API, worker and Expo dev server on the laptop's current Wi-Fi address; see [mobile/README.md](mobile/README.md).

See [docs/00-README.md](docs/00-README.md) for the document set and [docs/06-implementation-plan.md](docs/06-implementation-plan.md) for the roadmap and current status (Phases 1–2 built; Phase 3 mobile in progress: 3.1–3.8 built and checked on a phone, 3.9 engagement, 3.10 notifications and 3.11 safety built). Story tracking is in [docs/backlog/](docs/backlog/). The R1 scope change of 2026-10-16 — video posts, multi-photo carousels, comment replies and hashtags — is built across all layers and tracked in [docs/backlog/r1-scope-change.md](docs/backlog/r1-scope-change.md); it needs a new app build (expo-video) and a UAT redeploy (the image now carries ffmpeg).
