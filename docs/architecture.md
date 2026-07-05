# Proxiq Architecture

## Overview

Proxiq is a self-hosted LLM gateway. Every AI request your teams make passes through a pipeline of authentication, policy enforcement, caching, and optimization before reaching any upstream provider.

```
Developer / App / Claude Code / Internal Tool
                    │
                    ▼
     ┌──────────────────────────────────────┐
     │     Proxiq Gateway  (Fastify :3099)  │
     │                                      │
     │  1.  Auth & token resolution         │
     │  2.  Security policy lookup          │
     │  3.  DLP scan (block/redact/log)     │
     │  4.  Prompt injection guard          │
     │  5.  System prompt lock injection    │
     │  6.  Exact cache lookup (SHA-256)    │
     │  7.  Semantic cache lookup (MiniLM)  │
     │  8.  Memory context injection        │
     │  9.  Intent router (tier selection)  │
     │  10. Optimizer (prompt cache + zip)  │
     │  11. Forward to upstream provider    │
     │  12. Output filter (PII redaction)   │
     │  13. Cache write + memory record     │
     │  14. Audit log + security events     │
     └──────────────────────────────────────┘
                    │
                    ▼
     Anthropic / OpenAI / Azure / Groq / ...
```

Security enforcement (steps 3–5) happens **before** any LLM call. A blocked request never leaves your network.

---

## Packages

| Package | npm name | Purpose |
|---|---|---|
| `packages/core` | `@proxiq/core` | Gateway server, cache, policy engine, optimizer, router, admin API |
| `packages/cli` | `proxiq` | CLI binary — wraps core, manages process lifecycle |
| `packages/sdk` | `@proxiq/sdk` | Drop-in `relay()` wrapper for Anthropic/OpenAI SDK clients |
| `packages/mcp` | `@proxiq/mcp` | MCP server for Claude Desktop / Claude Code integration |

---

## Request flow (detailed)

```
POST /v1/messages  (or /v1/chat/completions)
  │
  ├─ resolveProvider()       ← x-proxiq-provider header → config.default → key prefix auto-detect
  ├─ resolveToken()          ← Bearer token → token record (label, rpmLimit, allowedModels, policyName)
  ├─ checkRpmLimit()         ← sliding window counter per token
  │
  ├─ loadPolicy()            ← policyName → DB-stored policy → .proxiq.json fallback
  │
  ├─ scanDLP()               ← regex patterns against message content
  │   ├─ action=block   → 400 PolicyViolation, log security event, STOP
  │   ├─ action=redact  → sanitize messages, log security event, CONTINUE
  │   └─ action=log     → log security event, CONTINUE
  │
  ├─ checkPromptGuard()      ← injection pattern detection
  │   └─ score > threshold  → 400 InjectionBlocked, log security event, STOP
  │
  ├─ injectSystemPromptLock() ← prepend/append policy instructions
  │
  ├─ cache.exact.get()       ← SHA-256(provider + model + messages + system) → SQLite
  │   └─ HIT → return cached response immediately (zero LLM cost)
  │
  ├─ cache.semantic.get()    ← MiniLM embedding → cosine similarity search
  │   └─ HIT (≥0.94) → return semantically matched response
  │
  ├─ memory.inject()         ← prepend past session turns to messages (if enabled)
  ├─ applyModelRouter()      ← header override → keyword rules → Haiku classifier
  ├─ optimizer.optimize()    ← inject cache_control breakpoints + context compression
  ├─ buildForwardHeaders()   ← strip x-proxiq-* headers, Bearer→x-api-key (Anthropic)
  │
  ├─ fetch(upstreamUrl)      ← actual LLM call
  │
  ├─ applyOutputFilter()     ← redact PII from response body (if policy enabled)
  ├─ cache.exact.set()       ← store response in SQLite
  ├─ memory.record()         ← store turn in session memory
  └─ logRequest()            ← write to request_log + security_events tables
```

---

## Storage

All data lives in a single SQLite file (default: `.proxiq/cache.db`). WAL mode is enabled for concurrent reads.

| Table | Purpose |
|---|---|
| `cache_entries` | Exact-match cache keyed by SHA-256 request hash |
| `request_log` | Per-request metrics: tokens, latency, cost, cache source, model used |
| `memory_store` | Session memory turns with optional embedding blobs |
| `tokens` | API token records: label, hash, RPM limit, allowed models, policy name |
| `policies` | Named security policies created via the dashboard or API |
| `security_events` | DLP blocks, redactions, injection attempts, policy actions |

---

## Security policy engine

Policies are loaded per-request from the `policies` table (dashboard-created) with fallback to `config.policies` (`.proxiq.json`). DB-stored policies take precedence, enabling runtime changes without restarts.

```typescript
// Policy resolution order
const storedPolicy = policyName ? getStoredPolicy(db, policyName) : null;
const policy = storedPolicy?.config ?? config.policies?.[policyName] ?? null;
```

DLP patterns are evaluated via regex against all `messages[].content` fields. For `redact` action, a mutable copy of the request body is sanitized before forwarding — the original is never modified.

---

## Admin API

All dashboard functionality is exposed as a REST API at `/proxiq/admin/*`. Protected by session auth (SSO or admin token).

| Endpoint | Purpose |
|---|---|
| `GET /proxiq/admin/tokens` | List all tokens with usage stats |
| `POST /proxiq/admin/tokens` | Create a token |
| `PATCH /proxiq/admin/tokens/:label` | Update token (RPM, models, policy) |
| `DELETE /proxiq/admin/tokens/:label` | Revoke a token |
| `GET /proxiq/admin/tokens/:label` | Fetch current token state |
| `GET /proxiq/admin/policies` | List all stored policies |
| `POST /proxiq/admin/policies` | Create a policy |
| `PUT /proxiq/admin/policies/:name` | Update a policy |
| `DELETE /proxiq/admin/policies/:name` | Delete a policy |
| `GET /proxiq/admin/stats` | Request metrics, cost, cache stats |
| `GET /proxiq/admin/logs` | Request log with filtering |
| `GET /proxiq/admin/security-events` | Security event audit log |

---

## Middleware system

Proxiq has a priority-ordered middleware registry for extensibility:

| Priority range | Owner | Purpose |
|---|---|---|
| 10–20 | Built-in | Metrics collection, request/response logging |
| 50–90 | Enterprise plugins | Extended auth, token budgets, SIEM forwarding |
| 100+ | User plugins | Custom middleware |

Enterprise and custom middleware register via `middlewareRegistry.register()` without touching core code.

---

## Security model

- **API keys** — pass through request headers in memory only. Never written to SQLite, never logged.
- **Prompt content** — not stored by default. Enabled only via `logging.includePrompts: true`.
- **Config secrets** — resolved at startup from `env:VAR` or `file:/path` references. Raw key patterns in config trigger a warning.
- **Sessions** — HMAC-signed JWTs using a secret you control (`dashboard.sessionSecret`).
- **DLP** — executes before any upstream call. Blocked requests never leave your network.
