---
layout: home
title: Home
nav_order: 1
---

# Proxiq - Every AI call. Audited. Controlled. Compliant.
{: .fs-9 }

The self-hosted LLM gateway security teams demand and developers never notice.
{: .fs-6 .fw-300 }

[Get started in 5 minutes](docs/getting-started/){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[View on GitHub](https://github.com/appmattic/proxiq){: .btn .fs-5 .mb-4 .mb-md-0 }

<div style="margin-top: 1.5rem;">
  <a href="https://www.producthunt.com/products/proxiq?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-proxiq" target="_blank" rel="noopener noreferrer">
    <img alt="Proxiq - Self-hosted LLM gateway with DLP, SSO &amp; full audit trail | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1190045&theme=dark&t=1783414233518">
  </a>
</div>

---

```
Your Teams → Proxiq (:3099) → Anthropic / OpenAI / Azure / Groq / Ollama / ...
```

Self-hosted. Open source. No data leaves your infrastructure.

---

## Why teams deploy Proxiq

**For your security team:**

- Block or redact PII before it reaches any LLM — credit cards, SSNs, passports, API keys
- Detect and block prompt injection attacks with a configurable threshold
- Lock system prompts so no client can override your compliance instructions
- Per-user, per-team security policies — Banking, Healthcare, Marketing, or custom
- Full audit trail of every request, DLP event, and policy action
- SSO via Microsoft Azure AD, Google Workspace, GitHub, Okta, or any OIDC/SAML IdP

**For your developers:**

- Point existing code at `localhost:3099` instead of `api.anthropic.com` — nothing else changes
- Drop-in SDK wrapper: `relay(new Anthropic())` — one line
- 65–85% cost reduction via semantic caching, exact caching, and prompt cache injection
- Intelligent routing: cheapest capable model tier per request automatically

---

## Install

**macOS / Linux** — clone and run the setup script (checks all prerequisites, installs Bun if needed, builds and configures):

```bash
git clone https://github.com/appmattic/proxiq
cd proxiq
bash setup.sh
./proxiq start
```

**Docker** (all platforms including Windows):

```bash
docker run -d -p 127.0.0.1:3099:3099 -v proxiq-data:/data ghcr.io/appmattic/proxiq
```

Then open the dashboard:

```
http://127.0.0.1:3099/proxiq/dashboard
```

---

## Your first security policy

Create a named policy and assign it to any user or token. No app changes required.

```json
{
  "policies": {
    "banking-strict": {
      "dlp": {
        "enabled": true,
        "detect": ["credit_card", "ssn", "iban", "api_key", "email"],
        "action": "block"
      },
      "promptGuard": { "enabled": true, "blockThreshold": 0.5 },
      "systemPromptLock": {
        "prepend": "You are a compliant banking assistant."
      },
      "allowedProviders": ["anthropic"],
      "logging": { "storeContent": true, "retentionDays": 365 }
    }
  }
}
```

Or build policies visually in the dashboard — no config file editing needed.

---

## Cost optimization

| Feature | How | Typical saving |
|---|---|---|
| **Exact cache** | SHA-256 match → SQLite hit | 100% on repeated queries |
| **Semantic cache** | Local MiniLM embeddings, ≥0.94 cosine similarity | 40–70% on similar queries |
| **Prompt cache injection** | Auto-injects Anthropic `cache_control` breakpoints | ~78% on repeated prefixes |
| **Intent routing** | Routes each prompt to cheapest capable model tier | 30–60% on mixed workloads |

---

## SDK integration (one line)

```typescript
import { relay } from '@proxiq/sdk';
import Anthropic from '@anthropic-ai/sdk';

// All calls route through Proxiq — policies, DLP, caching applied automatically
const client = relay(new Anthropic());
```

---

## Browse the docs

- [Getting Started](docs/getting-started/) — install, first request, first security policy
- [Enterprise & Security](docs/enterprise/) — DLP, prompt guard, SSO, compliance
- [Configuration](docs/configuration/) — full `.proxiq.json` reference
- [Supported Providers](docs/providers/) — Anthropic, OpenAI, Azure, Groq, Ollama, and more
- [SDK Integration](docs/sdk/) — drop-in wrapper for Anthropic/OpenAI clients
- [CLI Reference](docs/cli/) — all commands
- [Claude Connector](docs/claude-connector/) — MCP setup for Claude Code and Claude Desktop
- [Deployment](docs/deployment/) — Docker, systemd, AWS, Azure
- [Architecture](docs/architecture/) — security pipeline and storage design

---

## Enterprise & commercial licensing

Proxiq is open-source under AGPL-3.0. Self-hosting for internal use is always free.

APPMATTIC offers commercial licensing, managed deployment, SLA support, and professional onboarding for regulated industries.

[Enterprise details](docs/enterprise/){: .btn .btn-primary .mr-2 }
[Email APPMATTIC](mailto:build@appmattic.com){: .btn }
