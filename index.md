---
layout: home
title: Home
nav_order: 1
---

# proxiq

**LLM context optimization proxy.** Sits between your app and any LLM API. Reduces token costs 65–85% via semantic caching, context compression, and intelligent prompt cache placement.

```
App → proxiq (:3099) → Anthropic / OpenAI / Groq / Ollama / ...
```

Works with every provider. Zero code changes required — just point your SDK at `http://127.0.0.1:3099`.

---

## Install

**macOS / Linux**

```bash
curl -fsSL https://get.proxiq.io/install.sh | sh
```

**Windows (PowerShell)**

```powershell
irm https://get.proxiq.io/install.ps1 | iex
```

**Docker**

```bash
docker run -p 3099:3099 ghcr.io/appmattic/proxiq
```

---

## Start saving in 60 seconds

```bash
# 1. Start the proxy
proxiq start

# 2. Route requests through it
curl http://127.0.0.1:3099/v1/messages \
  -H "x-proxiq-provider: anthropic" \
  -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-3-5-haiku-20241022","max_tokens":100,"messages":[{"role":"user","content":"Hello!"}]}'

# 3. Check your savings
proxiq stats
```

---

## What proxiq does

| Optimization | How | Typical saving |
|---|---|---|
| **Exact cache** | SHA-256 match on identical requests → SQLite hit | 100% of repeated tokens |
| **Semantic cache** | MiniLM-L6-v2 embeddings, offline, configurable threshold | 60–90% on similar prompts |
| **Prompt cache** | Auto-injects Anthropic `cache_control` breakpoints | ~78% on repeated prefixes |
| **Compression** | Summarizes long conversations with cheapest model (opt-in) | 40–70% on long sessions |

---

## Browse the docs

- [Getting Started]({% link docs/getting-started.md %}) — prove value in 5 minutes
- [Configuration]({% link docs/configuration.md %}) — all config options explained
- [Supported Providers]({% link docs/providers.md %}) — Anthropic, OpenAI, Groq, Ollama, and more
- [SDK Integration]({% link docs/sdk.md %}) — drop-in wrapper for Anthropic/OpenAI clients
- [CLI Reference]({% link docs/cli.md %}) — all commands
- [Claude Connector]({% link docs/claude-connector.md %}) — Claude Code, Desktop, and Work setup
- [Deployment]({% link docs/deployment.md %}) — Docker, DigitalOcean, AWS, Azure
- [Architecture]({% link docs/architecture.md %}) — how it works under the hood

---

## Enterprise & Managed Service

Need proxiq enterprise-ready with SSO, RBAC, audit trails, or hosted in your own infrastructure?

[Email APPMATTIC →](mailto:build@appmattic.com){: .btn .btn-primary }
