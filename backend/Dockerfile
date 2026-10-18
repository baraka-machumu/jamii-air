# Jamii Air API + worker image (Plan task 2.16, TRD DP-01).
#   docker build -t jamii-air-api .                    runtime image: node dist/main.js (API)
#                                                      or node dist/worker.js (worker)
#   docker build --target migrator -t jamii-air-migrate .   runs `prisma migrate deploy`
#
# The Prisma Client and its TypedSQL functions are generated against a migrated database, so run
# `npm run db:generate` before building (CI does); src/generated/ is part of the build context.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM deps AS build
COPY . .
RUN test -f src/generated/prisma/client.ts \
    || (echo "src/generated/prisma is missing: run 'npm run db:generate' before docker build" && exit 1)
RUN npm run build

# One-shot migration container: `docker run --rm -e MIGRATION_DATABASE_URL=… jamii-air-migrate`.
FROM build AS migrator
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
# ffmpeg and ffprobe: the worker transcodes video uploads with them (BR-CT-08,
# src/workers/media/video-pipeline.ts). The API never calls them, but one image serves both
# processes. Alpine's build is about 80 MB unpacked; set FFMPEG_PATH / FFPROBE_PATH to use another.
RUN apk add --no-cache ffmpeg
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/v1/health/live" > /dev/null || exit 1
CMD ["node", "dist/main.js"]
