# Build context is the monorepo root (see docker-compose.yml: context: ., dockerfile: apps/api/Dockerfile)

FROM node:26-alpine AS base
RUN corepack enable

# ---- deps: install workspace dependencies for the api package only ----
FROM base AS deps
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter api...

# ---- build: compile TypeScript to dist ----
FROM deps AS build
COPY apps/api apps/api
RUN pnpm --filter api build

# ---- runtime: minimal image with only compiled output + prod deps ----
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /repo/apps/api

COPY --from=deps /repo/node_modules /repo/node_modules
COPY --from=deps /repo/apps/api/node_modules /repo/apps/api/node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY apps/api/package.json ./package.json

EXPOSE 3000

# Run pending migrations against the compiled data source, then start the app.
# Safe to re-run on every container start: TypeORM tracks applied migrations
# and no-ops when there's nothing pending (verified locally - see chat).
#
# The migration step overrides DATABASE_URL with MIGRATION_DATABASE_URL for
# that one command only - migrations run DDL (CREATE TABLE, CREATE POLICY)
# that the app's normal restricted app_runtime role deliberately can't do
# (see docs/ARCHITECTURE.md §20's RLS section). `node dist/main.js` then
# runs with the real DATABASE_URL from the container's environment,
# unmodified.
CMD ["sh", "-c", "DATABASE_URL=\"$MIGRATION_DATABASE_URL\" node_modules/.bin/typeorm migration:run -d dist/database/data-source.js && node dist/main.js"]
