# syntax=docker/dockerfile:1

# Build only. There is no Node process in production: Render serves this as a
# static site, and so do we. The WASM package is pre-built and committed under
# src-wasm/pkg/, so no Rust toolchain is needed here.
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# One dependency is a git spec -- "tinyllm": "github:mknashi/tinyllm" -- and the
# slim image ships no git client, so npm fails with an opaque
# "unknown git error" / ENOENT. The repo is public, so no credentials needed.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# package-lock.json is gitignored in this repo, so it is not in the clone
# Dokploy builds from. `npm install` is what Render's build command uses too.
# Committing the lockfile and switching to `npm ci` would make builds
# reproducible -- worth doing, but it is a repo-policy change.
COPY package.json ./
# npm resolves the github: shorthand to ssh://git@github.com/, which needs an
# ssh client and a key even though the repo is public. Rewrite it to https so
# the clone is anonymous.
RUN git config --global --add url."https://github.com/".insteadOf ssh://git@github.com/ \
 && git config --global --add url."https://github.com/".insteadOf git@github.com: \
 && npm install --no-audit --no-fund

COPY . .
RUN npm run build:web


FROM nginx:1.27-alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
