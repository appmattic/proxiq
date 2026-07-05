# ── Builder ───────────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy manifests first for better layer caching —
# dependencies only reinstall when these files change.
COPY package.json bun.lock tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/cli/package.json  packages/cli/
COPY packages/sdk/package.json  packages/sdk/
COPY packages/mcp/package.json  packages/mcp/

RUN bun install --frozen-lockfile

# Copy source after deps are cached
COPY packages/ packages/

RUN bun build packages/cli/src/index.ts \
      --outfile proxiq \
      --target bun \
      --minify \
  && chmod +x proxiq

# ── Runtime ───────────────────────────────────────────────────────────────────
# Keep the runtime image as small as possible — only the binary and Bun runtime.
# oven/bun:1-alpine does NOT include wget or curl; use bun's built-in fetch
# for the health check instead.
FROM oven/bun:1-alpine

WORKDIR /app

# Run as a non-root user
RUN addgroup -S proxiq && adduser -S proxiq -G proxiq

COPY --from=builder /app/proxiq ./proxiq
RUN chown proxiq:proxiq ./proxiq

# SQLite database and any runtime data live here
RUN mkdir -p /data/.proxiq && chown -R proxiq:proxiq /data

# PROXIQ_STORAGE_PATH overrides the default cache.storagePath from the config.
# PROXIQ_DOCKER=true sets host to 0.0.0.0 automatically (see config/loader.ts).
ENV PROXIQ_STORAGE_PATH=/data/.proxiq/cache.db
ENV PROXIQ_DOCKER=true

EXPOSE 3099

USER proxiq

# Health check via bun's built-in fetch — no wget/curl needed in the image.
# --start-period=30s gives Proxiq time to initialise its SQLite schema on first
# boot before the check fires. Increase to 120s if semantic caching is enabled
# (the MiniLM model downloads on first start).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD ["bun", "-e", "const r=await fetch('http://127.0.0.1:3099/proxiq/health');process.exit(r.ok?0:1)"]

# The binary shebang is #!/usr/bin/env bun — Bun is present in this image,
# so exec-form ENTRYPOINT works correctly without a shell wrapper.
ENTRYPOINT ["./proxiq", "start", "--host", "0.0.0.0"]
