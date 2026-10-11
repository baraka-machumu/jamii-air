# Jamii Air — Backend

NestJS API, media worker, Prisma schema and PostgreSQL stored procedures. See the [Technical Requirements](../docs/02-technical-requirements-document.md), the [Backend Schema](../docs/05-backend-schema-document.md) and the [Implementation Plan](../docs/06-implementation-plan.md).

## Local infrastructure

Requires Docker with Compose v2+.

```bash
cp .env.example .env      # then replace every `change-me` (letters and digits only)
npm run infra:up          # start and wait until healthy
```

| Service | Image | Host address |
|---|---|---|
| PostgreSQL 18 | `postgres:18.6-alpine` | `localhost:5432`, database `jamii_air` |
| Redis 7 | `redis:7.4-alpine` | `localhost:6379` (password) |
| MinIO | `pgsty/minio` (community build; upstream images are no longer published) | API `localhost:9000`, console `localhost:9001` |
| Mailpit | `axllent/mailpit` | SMTP `localhost:1025`, web UI <http://localhost:8025> |

All ports bind to `127.0.0.1`. Data lives in named volumes and survives `docker compose down`; `npm run infra:reset` deletes it and starts fresh.

On first start:

- [`docker/postgres/init/01-roles.sql`](docker/postgres/init/01-roles.sql) creates the roles `jamii_owner` (owns the database and schema, runs migrations) and `jamii_app` (runtime; may connect, nothing else until migrations grant it). The superuser `postgres` is for local administration only.
- `minio-init` creates the private, versioned bucket `jamii-air-media-local`, then exits.

The init script runs only when the Postgres volume is empty. After changing role passwords in `.env`, run `npm run infra:reset`.

`docker compose up -d` also works. `docker compose up -d --wait` returns exit code 1 because `minio-init` exits by design, so use `npm run infra:up` instead.

## Database

Prisma 7 with the `pg` driver adapter. The CLI connects as the owner role (`MIGRATION_DATABASE_URL`, see [prisma.config.ts](prisma.config.ts)); the API and worker connect as `jamii_app` (`DATABASE_URL`) and can only read granted columns and call `fn_*` procedures.

```bash
npm run db:migrate        # apply migrations (prisma migrate deploy)
npm run db:migrate:dev    # create a migration from schema changes (local only)
npm run db:generate       # generate the client into src/generated/prisma (git-ignored)
npm run db:status
```

- [prisma/schema.prisma](prisma/schema.prisma): tables and enums.
- [prisma/functions/](prisma/functions/): one file per stored procedure; the source of truth.
- [prisma/grants.sql](prisma/grants.sql): runtime-role grants. It's idempotent and gets appended to every migration that adds functions.

### Stored procedures

Each procedure is one file, `prisma/functions/<module>/<fn_name>.sql`, containing one `CREATE OR REPLACE FUNCTION` that follows Schema §6:
- `SET search_path = public, pg_temp` on every function
- `SECURITY DEFINER` on every `fn_*`
- errors raised as `JA<status>` SQLSTATEs
- `#variable_conflict use_column` in PL/pgSQL functions that return a table

Never edit a function in a migration. Edit the source file, then generate a migration:

```bash
npm run db:fn-migration -- <name>            # new migration <timestamp>_<name>
npm run db:fn-migration -- <name> --append   # add to the latest migration, if it is *_<name> and not applied yet
npm run db:migrate
```

The generator checks every source file against the conventions, then takes each file that is new or differs from its latest migrated version. It wraps each one in `-- @function <path>` … `-- @end-function` markers and adds the grants. With no changes, it generates nothing.

To put tables and their procedures in one migration, run `npx prisma migrate dev --create-only --name <name>`, then `npm run db:fn-migration -- <name> --append`.

Two cases need a hand-written migration:
- **Changing a function's signature or return type.** `CREATE OR REPLACE` cannot do this; add a `DROP FUNCTION` before the new definition.
- **Removing a function.** The generator warns about migrated functions whose source file is gone.

## API structure (Phase 2)

- `src/config/`: typed, validated environment (`AppConfig`). Boot fails on a bad value. It also refuses a `DATABASE_URL` that logs in as `jamii_owner` or `postgres` (SR-02).
- `src/infrastructure/prisma/`: Prisma Client on the `pg` adapter, connected as `jamii_app`.
- `src/infrastructure/db-procedures/`: typed wrappers, one per TypedSQL call file in `prisma/sql/`. Services call these, never SQL strings. After adding a call file, run `npm run db:generate` (`prisma generate --sql`). It needs the local database to be migrated.
- `src/common/errors/`: a global filter that wraps every error in `{ error: { code, message, details }, requestId }`. A procedure's `JA<status>` error becomes that status and code. Any other error becomes `500 INTERNAL_ERROR`, which is logged and never returned.
- `src/common/logging/`: pino JSON logs, a request id per request (`X-Request-Id`, the caller's or a new one), and redaction of secrets and personal data (SE-07).
- `src/common/pagination/`: opaque keyset cursors (`nextCursor`) and `limit` clamping.
- Routes live under `/api/v1`. Health checks are at `/api/v1/health/live` and `/api/v1/health/ready`. OpenAPI is at `/api/v1/docs` and `/api/v1/openapi.json` everywhere except production.

## Run

In containers, as on a server: one image runs the API (`node dist/main.js`) and the worker (`node dist/worker.js`). A one-shot `migrate` container runs `prisma migrate deploy` first.

```bash
npm run db:generate                          # the image needs the generated Prisma Client
docker compose --profile app up -d --build   # migrate, api (localhost:3000), worker
docker compose --profile app rm -sf api worker migrate   # stop them; the infrastructure keeps running
```

```bash
npm install
npm run start:dev
```

## Test

```bash
npm run test        # unit (includes the migration generator)
npm run test:db     # stored procedures and database security checks (needs Docker)
npm run test:e2e    # end-to-end
```

### Database tests

`npm run test:db` starts a throw-away PostgreSQL 18 with Testcontainers ([test/db/global-setup.ts](test/db/global-setup.ts)). The container uses the same roles script as local Docker. The setup applies every migration as `jamii_owner`, and the tests call procedures as `jamii_app`, the way the API will. [test/db/helpers.ts](test/db/helpers.ts) has helpers to create users, posts, avatars and admins, to assert a `JA` error code and message, and to run a test inside a rolled-back transaction.

What the suite covers:

- every procedure's behaviour, including concurrency (parallel registrations with one invite, parallel token rotation, parallel likes and follows)
- **authorization matrix** ([authz.db-spec.ts](test/db/authz.db-spec.ts)), which finds procedures in the catalogue:
  - every `fn_*` taking `p_viewer_id` rejects unknown, suspended and pending-deletion viewers
  - every `fn_admin_*` taking `p_admin_id` rejects unknown and disabled admins
  - the super-admin procedures also reject moderators
- blocked users are invisible to each other in every read
- **security checks** ([security.db-spec.ts](test/db/security.db-spec.ts)):
  - SR-01: `jamii_app` cannot write any table or read secret columns
  - SR-03: every function sets `search_path`
  - SR-04: no `EXECUTE` in function sources
- the drift check ([drift.db-spec.ts](test/db/drift.db-spec.ts))

### Drift check

```bash
npm run db:drift-check    # uses MIGRATION_DATABASE_URL
```

This checks that every `fn_*` and `fn__*` function in the database matches its file in `prisma/functions/`. It fails, and names the function, when:
- a file was edited without a migration
- a function has no source file
- a source file was never migrated

It runs each source's `CREATE OR REPLACE` inside a transaction that is always rolled back, and compares `pg_get_functiondef()` before and after. So it changes nothing.

### Performance check (Plan task 1.13)

```bash
npm run db:perf                    # 10k users, 1M posts in jamii_air_perf, then latency per procedure
npm run db:perf -- --measure-only  # measure the existing jamii_air_perf again
npm run db:perf -- --explain       # also print fn_get_home_feed's inner plan (auto_explain)
```

This uses the local Docker PostgreSQL. It drops and re-creates `jamii_air_perf`, and refuses to touch any database whose name does not end in `_perf`. The bulk seed is in [scripts/db/perf-seed.sql](scripts/db/perf-seed.sql). Calls run as `jamii_app`. The check fails when any measured procedure's P95 is 50 ms or more (TRD §14).

### CI

[`.github/workflows/db.yml`](../.github/workflows/db.yml) runs on every PR that touches the database. It runs:
- lint and type-check
- the generator unit tests
- `npm run test:db`
- `prisma migrate deploy` on a fresh Compose PostgreSQL 18
- `npm run db:drift-check`

Make the **Database** check required in `main`'s branch protection.
