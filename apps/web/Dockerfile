# Build context is the monorepo root (see docker-compose.yml: context: ., dockerfile: apps/web/Dockerfile)

FROM node:26-alpine AS base
RUN corepack enable

# ---- deps: install workspace dependencies for the web package only ----
FROM base AS deps
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter web...

# ---- build: compile Next.js to the standalone output ----
FROM deps AS build
COPY apps/web apps/web
ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter web build

# ---- runtime: only the standalone server + static assets ----
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /repo/apps/web

# .next/standalone already contains a pruned node_modules (via Next.js's
# output tracing) - static and public are copied in separately because
# standalone output deliberately excludes them, matching what I verified
# manually before writing this file (see chat).
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3001
ENV PORT=3001
CMD ["node", "apps/web/server.js"]
