# Jamii Air

A photo-sharing social app for East Africa. One repository with three apps:

```
jamii-air/
├── backend/   NestJS API + worker + database procedures
├── mobile/    Expo / React Native app (iOS + Android)
├── admin/     React + Vite admin portal
└── docs/      Requirements, design and implementation plan
```

The apps share no code. They talk only over the HTTP API (`/api/v1`). `mobile/` and `admin/` generate their API types from the backend's OpenAPI spec.

## Getting started

```bash
cd backend
npm install
npm run start:dev
```

```bash
cd mobile
npm install
npx expo start
```

See [docs/00-README.md](docs/00-README.md) for the document set and [docs/06-implementation-plan.md](docs/06-implementation-plan.md) for the roadmap.
