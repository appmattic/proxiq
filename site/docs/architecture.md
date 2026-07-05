---
layout: default
title: Architecture
nav_order: 10
---

# Architecture
{: .no_toc }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Overview

Proxiq is a self-hosted LLM gateway. Every AI request passes through a pipeline of authentication, security enforcement, caching, and optimization before reaching any upstream provider. Security runs first — a blocked request never reaches any LLM.

```
Developer / App / Claude Code / Internal Tool
                    │
                    ▼
     ┌──────────────────────────────────────┐
     │   Proxiq Gateway  (Fastify :3099)    │
     │                                      │
     │  1.  Auth & token resolution         │
     │  2.  Security policy lookup          │
     │  3.  DLP scan (block/redact/log)  ◄──┼── PII never reaches LLM if blocked
     │  4.  Prompt injection guard          │
     │  5.  System prompt lock injection    │
     │  6.  Exact cache lookup (SHA-256)    │
     │  7.  Semantic cache (MiniLM)         │
     │  8.  Memory context injection        │
     │  9.  Intent router (tier selection)  │
     │  10. Optimizer (prompt cache)        │
     │  11. Forward to upstream provider    │
     │  12. Output filter (PII redaction)   │
     │  13. Cache write + memory record     │
     │  14. Audit log + security events     │
     └──────────────────────────────────────┘
                    │
                    ▼
     Anthropic / OpenAI / Azure / Groq / ...
```

---

## Packages

| Package | npm name | Purpose |
|---|---|---|
| `packages/core` | `@proxiq/core` | Gateway, cache, policy engine, optimizer, router, admin API |
| `packages/cli` | `proxiq` | CLI binary — wraps core, manages process lifecycle |
| `packages/sdk` | `@proxiq/sdk` | Drop-in `relay()` wrapper for Anthropic/OpenAI SDK clients |
| `packages/mcp` | `@proxiq/mcp` | MCP server for Claude Desktop / Claude Code integration |

---

## Request flow

```
POST /v1/messages  (or /v1/chat/completions)
  │
  ├─ resolveProvider()        ← x-proxiq-provider → config.default → key prefix auto-detect
  ├─ resolveToken()           ← Bearer token → label, rpmLimit, allowedModels, policyName
  ├─ checkRpmLimit()          ← sliding window per token
  │
  ├─ loadPolicy()             ← DB-stored policy → .proxiq.json fallback
  │
  ├─ scanDLP()                ← regex patterns against message content
  │   ├─ action=block    → 400 PolicyViolation, log security event  ✗ STOP
  │   ├─ action=redact   → sanitize messages, log event, CONTINUE
  │   └─ action=log      → log event, CONTINUE
  │
  ├─ checkPromptGuard()       ← injection pattern detection
  │   └─ score > threshold   → 400 InjectionBlocked, log event  ✗ STOP
  │
  ├─ injectSystemPromptLock() ← prepend/append policy instructions
  │
  ├─ cache.exact.get()        ← SHA-256 lookup in SQLite
  │   └─ HIT → return immediately (zero LLM cost)
  │
  ├─ cache.semantic.get()     ← MiniLM cosine similarity search
  │   └─ HIT (≥0.94) → return semantically matched response
  │
  ├─ memory.inject()          ← prepend past session turns (if enabled)
  ├─ applyModelRouter()       ← keyword rules → Haiku classifier → tier
  ├─ optimizer.optimize()     ← inject cache_control + context compression
  │
  ├─ fetch(upstreamUrl)       ← actual LLM call
  │
  ├─ applyOutputFilter()      ← redact PII from response (if policy enabled)
  ├─ cache.exact.set()
  ├─ memory.record()
  └─ logRequest()             ← request_log + security_events tables
```

---

## Storage

All data lives in a single SQLite file (default: `.proxiq/cache.db`). WAL mode enabled for concurrent reads.

| Table | Purpose |
|---|---|
| `cache_entries` | Exact-match cache keyed by SHA-256 request hash |
| `request_log` | Per-request metrics: tokens, latency, cost, cache source |
| `memory_store` | Session memory turns with optional embedding blobs |
| `tokens` | API token records: label, hash, RPM limit, allowed models, policy |
| `policies` | Named security policies created via dashboard or API |
| `security_events` | DLP blocks, redactions, injection attempts, policy actions |

---

## Security policy engine

Policies are loaded per-request. DB-stored policies (dashboard-created) take precedence over `.proxiq.json` config policies, enabling runtime changes without restarts.

```typescript
// Policy resolution order
const storedPolicy = policyName ? getStoredPolicy(db, policyName) : null;
const policy = storedPolicy?.config ?? config.policies?.[policyName] ?? null;
```

For `redact` action, a mutable copy of the request body is sanitized before forwarding — the original is never modified.

---

## Admin API

All dashboard functionality is available as a REST API at `/proxiq/admin/*`, protected by session auth.

| Endpoint | Purpose |
|---|---|
| `GET /proxiq/admin/tokens` | List tokens with usage stats |
| `POST /proxiq/admin/tokens` | Create a token |
| `PATCH /proxiq/admin/tokens/:label` | Update token (RPM, models, policy) |
| `DELETE /proxiq/admin/tokens/:label` | Revoke a token |
| `GET /proxiq/admin/policies` | List stored policies |
| `POST /proxiq/admin/policies` | Create a policy |
| `PUT /proxiq/admin/policies/:name` | Update a policy |
| `DELETE /proxiq/admin/policies/:name` | Delete a policy |
| `GET /proxiq/admin/stats` | Request metrics and cost stats |
| `GET /proxiq/admin/security-events` | Security event audit log |

---

## Key design decisions

### Single binary distribution

The CLI package bundles all of `@proxiq/core` into a single file via `bun build`. Release binaries (from GitHub Releases) use `--compile` to embed the Bun runtime — fully self-contained, no install step, no Node.js required. Development builds (`bun run build`) produce a bytecode bundle that requires Bun in PATH to run. Runs on Linux (x64/arm64) and macOS (Intel and Apple Silicon).

### Two cache layers

1. **Exact cache (SQLite)** — zero compute overhead. SHA-256 of the normalized request. Hits serve the stored response immediately.
2. **Semantic cache (MiniLM)** — embedding-based nearest-neighbor lookup. Only activated on an exact miss. Configurable similarity threshold (default: 0.94).

### Security runs before cost optimization

DLP and prompt guard execute at steps 3–4, before the cache check (steps 6–7) and long before the LLM call (step 11). A blocked request consumes no cache storage and costs nothing.

### No credentials at rest

API keys pass through request headers in memory only. Never written to SQLite, never logged by default.

### Policy changes take effect immediately

Policies stored in the dashboard DB are resolved at request time. No restart required to update or create policies.
