# UAT deployment (Plan task 2.16 / 4.7, UAT half)

The UAT stack runs on the **shared** host `41.59.227.223` (`UAT_SERVER_IP` in the repo-root `.env`),
alongside four unrelated projects. First deployed 2026-10-15.

| What | Where | Notes |
|---|---|---|
| API + share landing pages | `http://41.59.227.223:4011` | plain HTTP; OpenAPI at `/api/docs` (`NODE_ENV=uat`, so Swagger is on) |
| Admin portal | `https://41.59.227.223:4012` | **HTTPS, self-signed** — the browser warns once per session |
| Media (MinIO) | `http://41.59.227.223:4013` | public: phones PUT here and load `.webp` variants |
| Postgres | `127.0.0.1:5433` on the host | localhost only; reach it with an SSH tunnel |
| MinIO console | `127.0.0.1:4014` on the host | tunnel |
| Mailpit (password-reset codes) | `127.0.0.1:8026` on the host | tunnel; no real email provider yet (Plan 5.0) |

Host layout, all under `/home/jamii-air` (**not** `/`, see "Disk" below):

```
/home/jamii-air
├── docker-compose.yml      ← deploy/uat/docker-compose.uat.yml
├── .env                    ← generated secrets, host-only, never committed
├── portal/                 ← admin/dist (static bundle)
├── postgres-init/          ← backend/docker/postgres/init/01-roles.sql
├── nginx/portal.conf       ← deploy/uat/portal.conf
├── nginx/certs/            ← self-signed portal.crt / portal.key (valid to 2029-01-17)
└── data/{postgres,redis,minio,mailpit}
```

## Three things about this host that the stack has to work around

**1. Disk — `/` is 95% full.** The root filesystem is 50 GB with ~3 GB free and is shared with four
other projects; `/home` is 42 GB and nearly empty. So **all state bind-mounts to `/home/jamii-air/data`**
and nothing is left in Docker named volumes. Do not `docker build` on this host: it would put a
builder image and npm cache on `/`. Build locally and ship the image (below). The owner has asked
that we do **not** prune other projects' images or build cache, even though ~24 GB is reclaimable.

**2. libseccomp 2.3.1 (2016) — modern images get EPERM.** CentOS 7's libseccomp does not recognise
the syscalls current images use, so Docker's seccomp filter denies them. PostgreSQL 18 dies during
initdb with `could not write to file "postmaster.pid": Operation not permitted`. Every service
therefore sets `security_opt: [seccomp=unconfined]`. This is scoped to our containers; drop it on a
host with libseccomp ≥ 2.5.

**3. The portal must be HTTPS and same-origin with the API.** `admin/src/api/client.ts` calls
`window.location.origin`, and the admin refresh cookie is `httpOnly; Secure; SameSite=Strict`
([admin-auth.controller.ts](../../backend/src/modules/admin/admin-auth.controller.ts)). A browser
will not store a `Secure` cookie over plain HTTP, so on `http://…` every page reload would sign you
out. nginx therefore terminates TLS with a self-signed certificate and reverse-proxies `/api` to the
API. No backend code was changed for UAT.

## Deploy / redeploy

Run from the repo root. `$PW` is `UAT_SSH_PASSWORD` from the repo-root `.env`; `plink`/`pscp` ship
with PuTTY (no `sshpass` on Windows).

```bash
# 1. Build both artefacts locally (never on the host — see Disk)
cd backend && npm run db:generate && docker build -t jamii-air-api:uat . && cd ..
# Since the R1 scope change the image installs ffmpeg for video (+~80 MB). Same image, same
# steps: build here, never on the host.
cd admin   && npm run build && cd ..

# 2. Ship the API image (~870 MB, ~170 MB gzipped)
docker save jamii-air-api:uat | gzip -1 > /tmp/api-uat.tar.gz
pscp -pw "$PW" /tmp/api-uat.tar.gz root@41.59.227.223:/home/jamii-air/
plink -ssh -pw "$PW" root@41.59.227.223 \
  "cd /home/jamii-air && docker load -i api-uat.tar.gz && rm -f api-uat.tar.gz"

# 3. Ship the portal bundle and any changed config
pscp -pw "$PW" -r admin/dist/* root@41.59.227.223:/home/jamii-air/portal/
pscp -pw "$PW" deploy/uat/docker-compose.uat.yml root@41.59.227.223:/home/jamii-air/docker-compose.yml
pscp -pw "$PW" deploy/uat/portal.conf root@41.59.227.223:/home/jamii-air/nginx/portal.conf

# 4. Migrations run from here over a tunnel, so the heavy `migrator` image never reaches the host
plink -ssh -pw "$PW" -N -L 15433:127.0.0.1:5433 root@41.59.227.223 &
cd backend
MIGRATION_DATABASE_URL="postgresql://jamii_owner:<JAMII_OWNER_PASSWORD>@127.0.0.1:15433/jamii_air" \
  npx prisma migrate deploy
cd ..

# 5. Restart
plink -ssh -pw "$PW" root@41.59.227.223 \
  "cd /home/jamii-air && docker compose up -d && docker compose ps"
```

First install only, after the database is migrated:

```bash
# over the same tunnel, as the runtime role, exactly as the API connects
DATABASE_URL="postgresql://jamii_app:<JAMII_APP_PASSWORD>@127.0.0.1:15433/jamii_air" \
  npm run admin:bootstrap -- --email you@example.com --name "Your Name"
```

It prints a temporary password once. Sign in at `https://41.59.227.223:4012`, set up 2FA against
the QR code, change the password, then create invite codes under **Invites**.

## Smoke test (all run from a laptop, over the public internet)

```bash
curl    http://41.59.227.223:4011/api/v1/health/live     # {"status":"ok"}
curl    http://41.59.227.223:4011/api/v1/health/ready    # {"status":"ok"}
curl -k https://41.59.227.223:4012/api/v1/health/live     # portal's /api proxy
curl    http://41.59.227.223:4013/minio/health/live       # 200
```

Verified end to end on 2026-10-15: register with an invite code → log in → upload intent →
PUT the photo to the presigned URL → create post → worker published it (blurhash + 600×600 webp
variants) → feed → share landing page. The `.webp` variant is readable without auth (200) and the
original is **not** (403), which is the intended policy.

## Redeploying (done twice, 2026-10-15 and 2026-10-16)

Both halves were redeployed on 2026-10-16: the portal for its design pass, and the API because the
60-minute admin idle timeout is enforced server-side — shipping only the portal would have had it
warn at 55 minutes while the server still cut the session at 30.

Two things the second run showed, worth keeping:

- **Remove the superseded image.** `docker load` moves the `jamii-air-api:uat` tag and leaves the
  old image untagged, ~580 MB a time, on a root filesystem with about 3 GB free. The deploy now
  captures the old id first and removes it after the containers are up. That is our own image, not
  another project's, so it is inside what the owner asked for.
- **Clear stale portal assets.** Vite's filenames are content-hashed, so an upload adds files
  rather than replacing them. Delete the hashes `index.html` no longer references.

After a redeploy, check the running API rather than the repository:

```bash
curl -s http://41.59.227.223:4011/api/v1/openapi.json | grep -o "extends the [0-9]*-minute idle timeout"
```

It answers from the image that is actually running, so it catches a build that did not ship.

## Still open

- **No IP allowlist** on the portal or `/api/v1/admin/*` (spec'd in task 4.7); it waits for the
  office IPs in Plan 5.0. Mandatory 2FA is the only gate meanwhile.
- **Self-signed TLS** on the portal, and the API and media are **plain HTTP** — fine for the
  `preview` APK (`usesCleartextTraffic` is on for every non-production variant) but replace both
  with real certificates once the domain exists (Plan 5.0).
- **No real email provider**: Mailpit catches password-reset mail. Read codes at `127.0.0.1:8026`
  through a tunnel. **Testers cannot reset their own passwords, and no admin can reset one for
  them** — the admin API has suspend, reinstate and revoke-sessions, not a password reset. Anyone
  who forgets a password is locked out permanently. This is the one thing that has to change
  before real testers are invited; a free tier (Resend, Brevo) covers a ten-user pilot many times
  over.
- **Share links** are `http://41.59.227.223:4011/p/…`, so Android App Links cannot verify
  (that needs the https domain, task 3.9.f). `jamiiair://` deep links still work.
- **No backups** of `/home/jamii-air/data` (Plan 5.2) and no Sentry/PostHog (Plan 5.0).
- `/` on the host is at 95%. Watch it: if it fills, it takes the other four projects down with us.
