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

## Run

```bash
npm install
npm run start:dev
```

## Test

```bash
npm run test        # unit
npm run test:e2e    # end-to-end
```
