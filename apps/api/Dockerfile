# syntax=docker/dockerfile:1

# Build context: the repository root.

FROM node:24-slim AS base
# Prisma's install script picks the schema engine by the OpenSSL it finds, and the engine's TLS
# uses the system's libraries and roots; the slim image ships neither.
RUN apt-get update \
  && apt-get install --yes --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  HUSKY=0
RUN corepack enable
WORKDIR /repo
# Manifests before sources: a commit that changes only code keeps the install layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/shared/package.json packages/shared/
COPY packages/typescript-config/package.json packages/typescript-config/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --store-dir /pnpm/store \
  --filter "@clientry/api..." --filter clientry
COPY . .
RUN pnpm exec turbo run build --filter=@clientry/api
# A self-contained tree: production dependencies only, @clientry/shared copied in, not linked.
# The lockfile and workspace file that deploy writes are of no use at runtime.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm --filter @clientry/api deploy --prod --store-dir /pnpm/store /prod/api \
  && rm /prod/api/pnpm-lock.yaml /prod/api/pnpm-workspace.yaml

FROM base AS runtime
LABEL org.opencontainers.image.source="https://github.com/Vladimir0087/clientry"
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /prod/api ./
USER node
EXPOSE 4000
# Last, so a new commit rebuilds only this layer.
ARG APP_VERSION=local
ENV APP_VERSION=$APP_VERSION
LABEL org.opencontainers.image.revision=$APP_VERSION
# exec makes Node PID 1, so it receives SIGTERM itself; a failed migration never starts the API.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
