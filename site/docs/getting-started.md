---
layout: default
title: Getting Started
nav_order: 2
---

# Getting Started
{: .no_toc }

Deploy Proxiq, enforce your first security policy, and cut LLM costs — in under 5 minutes.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Step 1 — Install

**macOS / Linux** — the setup script checks all prerequisites, installs Bun if needed, builds the binary, and creates a starter config:

```bash
git clone https://github.com/appmattic/proxiq
cd proxiq
bash setup.sh
```

**Docker** (all platforms, including Windows):

```bash
docker run -d -p 127.0.0.1:3099:3099 -v proxiq-data:/data ghcr.io/appmattic/proxiq
```

**Pre-built binary** (macOS / Linux, no build step required):

```bash
curl -fsSL https://get.proxiq.io/install.sh | sh
```

**Build from source manually** (requires [Bun](https://bun.sh))

```bash
git clone https://github.com/appmattic/proxiq
cd proxiq && bun install && bun run build
```

---

## Step 2 — Initialize config and start

```bash
proxiq config init   # creates .proxiq.json with defaults
proxiq start         # listens on http://127.0.0.1:3099
```

---

## Step 3 — Open the dashboard

```
http://127.0.0.1:3099/proxiq/dashboard
```

Sign in with your admin credentials (`dashboard.adminUsername` / `dashboard.adminPassword` in `.proxiq.json`), or configure SSO to use your existing Microsoft or Google identity.

From the dashboard you can:
- Issue and revoke API tokens per developer or team
- Create and assign security policies (DLP, prompt guard, system prompt lock)
- Monitor requests, cost, and cache savings in real time
- Review the security events audit log

---

## Step 4 — Send your first request

Point your existing app or `curl` at Proxiq instead of the LLM provider directly. Nothing else changes.

```bash
curl http://127.0.0.1:3099/v1/messages \
  -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-sonnet-4-6","max_tokens":256,"messages":[{"role":"user","content":"Hello!"}]}'
```

Check the response headers — `x-proxiq-request-id` confirms traffic is flowing through the gateway.

---

## Step 5 — Create your first security policy

In the dashboard, go to **Security Policies → New Policy**. Or add directly to `.proxiq.json`:

```json
{
  "policies": {
    "my-policy": {
      "dlp": {
        "enabled": true,
        "detect": ["credit_card", "ssn", "api_key", "email"],
        "action": "block"
      },
      "promptGuard": { "enabled": true, "blockThreshold": 0.75 },
      "logging": { "storeContent": true, "retentionDays": 90 }
    }
  },
  "auth": {
    "required": true,
    "tokens": [
      {
        "label": "my-team",
        "token": "env:PROXIQ_TOKEN_MY_TEAM",
        "rpmLimit": 60,
        "policyName": "my-policy"
      }
    ]
  }
}
```

Now try sending a message containing a credit card number — Proxiq blocks it before it reaches any LLM and logs a `dlp_blocked` event in the Security Events table.

---

## Step 6 — Check savings

```bash
proxiq stats
```

Or open the dashboard — the stat cards show requests, cost saved, cache hit rate, and tokens in/out, updated in real time.

---

## SDK integration (one line)

```typescript
import { relay } from '@proxiq/sdk';
import Anthropic from '@anthropic-ai/sdk';

// All calls now route through Proxiq — policies, DLP, caching applied automatically
const client = relay(new Anthropic());
```

Set `PROXIQ_ENABLED=false` to bypass Proxiq in test environments.

---

## Next steps

- [Configuration reference](configuration) — full `.proxiq.json` schema including auth, policies, SSO
- [Security & enterprise features](enterprise) — DLP, prompt guard, audit trails, compliance
- [Supported providers](providers) — Anthropic, OpenAI, Azure, Groq, Ollama, and more
- [Architecture](architecture) — how the security pipeline and cache layers work
