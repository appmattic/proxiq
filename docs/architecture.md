---
layout: default
title: Architecture
nav_order: 9
---

# Architecture
{: .no_toc }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Overview

proxiq sits between your application and any LLM API. Every request passes through a middleware pipeline, two cache layers, and an optimizer before (optionally) reaching the upstream provider.

```
Application
    │
    ▼
┌──────────────────────────────────────────┐
│  proxiq proxy  (:3099)                   │
│                                          │
│  ┌──────────────────────────────────┐    │
│  │  Middleware pipeline (onRequest) │    │
│  │  10: metrics  20: logger         │    │
│  └──────────────────────────────────┘    │
│                  │                       │
│         ┌────────▼────────┐              │
│         │  Exact cache    │──hit──▶ ret  │
│         │  SQLite SHA-256 │              │
│         └────────┬────────┘              │
│                miss                      │
│         ┌────────▼────────┐              │
│         │ Semantic cache  │──hit──▶ ret  │
│         │ vectra + MiniLM │              │
│         └────────┬────────┘              │
│                miss                      │
│         ┌────────▼────────┐              │
│         │   Optimizer     │              │
│         │  1. Compress    │              │
│         │  2. PromptCache │              │
│         └────────┬────────┘              │
│                  │                       │
│         ┌────────▼────────┐              │
│         │  HTTP forward   │              │
│         └────────┬────────┘              │
│                  │                       │
│  ┌───────────────▼──────────────────┐    │
│  │  Middleware pipeline (onResponse) │    │
│  │  Store to cache • Record metrics  │    │
│  └───────────────────────────────────┘    │
└──────────────────────────────────────────┘
    │
    ▼
LLM Provider (Anthropic / OpenAI / Groq / ...)
```

---

## Packages

| Package | Role |
|---|---|
| `@proxiq/core` | Proxy server, cache, optimizer, memory, middleware system |
| `proxiq` (CLI) | Command-line interface — wraps core, manages daemon lifecycle |
| `@proxiq/sdk` | Drop-in helper to redirect Anthropic/OpenAI SDK clients |
| `@proxiq/mcp` | MCP server exposing proxiq tools to Claude clients |

---

## Key design decisions

### Single binary via Bun compile

All packages compile to one self-contained binary using `bun build --compile`. No Node.js runtime, no npm install, no native modules. Runs on Linux (x64/arm64) and macOS.

### Two cache layers

1. **Exact cache (SQLite)** — zero compute overhead. SHA-256 of the normalized request body. Hits serve the stored response immediately.
2. **Semantic cache (vectra + MiniLM)** — embedding-based nearest-neighbor lookup. Only activated on an exact miss. Configurable similarity threshold (default: 0.94).

### Provider format abstraction

Three wire formats cover all major LLM APIs:
- `openai-compatible` — `/v1/chat/completions` shape
- `anthropic` — Messages API shape with `cache_control` support
- `gemini` — Google Generative Language API shape

Optimizer features that are format-specific (e.g. Anthropic `cache_control`) are applied conditionally based on `providerFormat`, not provider name.

### No credentials at rest

API keys pass through request headers in memory only. proxiq never writes them to SQLite, never logs them, and never persists them across requests.

### Middleware pipeline as the extension boundary

Phase 1 ships with two built-in middlewares (metrics, logger). Enterprise features (SSO, RBAC, token budgets, audit logs) plug in as middleware without modifying Phase 1 code.

---

## Data flow

```
Request arrives
  → parseBody()
  → resolveProvider()       ← x-proxiq-provider | config.default | auto-detect
  → middlewareRegistry.execute()
  → cache.lookup()
    ├─ exact hit  → return cached
    └─ miss → semantic.lookup()
               ├─ hit  → return cached
               └─ miss → optimizer.process()
                          → fetch(upstreamUrl)
                          → cache.store()
                          → middlewareRegistry.executeResponse()
                          → send to client
```

---

## Storage schema

```sql
exact_cache        -- SHA-256 keyed response cache
metrics            -- per-request token accounting
sessions           -- session ID → embedding blobs
schema_migrations  -- version tracking
```

All tables live in a single SQLite file (default: `.proxiq/cache.db`).
