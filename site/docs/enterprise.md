---
layout: default
title: Enterprise & Security
nav_order: 3
---

# Enterprise & Security
{: .no_toc }

Proxiq gives security teams real controls over how their organization uses AI — DLP, policy enforcement, SSO, audit trails, and cost governance — all self-hosted in your infrastructure.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## The problem Proxiq solves

Your teams are already using Claude, GPT, and other AI tools. You have no visibility into what's being sent, no way to enforce compliance rules, and no audit trail if something goes wrong.

Proxiq is the single point of control that lets you govern all LLM traffic without slowing teams down — deployed in your infrastructure, with your data never leaving your network.

---

## Data Loss Prevention (DLP)

Proxiq scans every outbound message against configurable PII patterns **before** the request reaches any LLM.

**Detected patterns:**

| Pattern | Description |
|---|---|
| `credit_card` | Credit card numbers (Luhn-validated) |
| `ssn` | Social Security Numbers |
| `iban` | International Bank Account Numbers |
| `api_key` | API keys and secrets |
| `email` | Email addresses |
| `phone` | Phone numbers |
| `passport` | Passport numbers |

**DLP actions (per policy):**

| Action | Behaviour |
|---|---|
| `block` | Return HTTP 400 — message never leaves your network |
| `redact` | Replace PII with `[REDACTED]`, forward sanitized message, log event |
| `log` | Allow the request, record the violation for audit review |

---

## Prompt Injection Guard

Detects attempts to override system instructions or extract confidential context. Configurable sensitivity — `0.5` blocks suspicious requests, `0.9` blocks only obvious attacks. Blocked attempts are logged as `injection_blocked` security events.

---

## System Prompt Lock

Inject compliance instructions before or after every user-supplied system prompt — and prevent any client from overriding them. Useful for:

- Regulatory language ("do not provide financial advice")
- Brand and tone requirements
- Confidentiality reminders

---

## Output Filter

Optionally redact PII from model responses before they're returned to the client. Protects against models inadvertently echoing sensitive data back to users.

---

## Security Policies

Policies are named profiles that bundle all of the above controls. Assign any policy to any user or API token. Multiple policies can coexist — each team gets exactly the right level of control.

**Built-in presets** (one-click in the dashboard):

| Preset | DLP | Action | Retention |
|---|---|---|---|
| Banking | All 7 patterns | block | 365 days |
| Healthcare | SSN, passport, email, phone | block | 365 days |
| Marketing | API key only | log | 30 days |
| Developer | API key only | log | 30 days |

Or build your own in the visual Policy Builder — no config file editing required. Policies created in the dashboard take effect immediately without a restart.

---

## Security Events Audit Log

Every DLP event, injection attempt, and policy action is logged to a searchable Security Events table in the dashboard:

- Timestamp, user, token label
- Policy applied
- Action taken (`dlp_blocked`, `dlp_redacted`, `dlp_logged`, `injection_blocked`)
- Detail (which patterns triggered)
- Configurable retention per policy

---

## Access Control

### SSO

Users sign in with their existing corporate identity — no separate accounts or password management. Supported providers:

| Provider | Protocol | Use when |
|---|---|---|
| **Microsoft Azure AD / Entra ID** | OAuth 2.0 / OIDC | Microsoft 365 org |
| **Google Workspace** | OAuth 2.0 / OIDC | Google org |
| **GitHub** | OAuth 2.0 | Dev-team deployments — restrict by org |
| **Any OIDC IdP** | OIDC | Okta, Auth0, Keycloak, OneLogin, Dex, PingFederate |
| **Any SAML 2.0 IdP** | SAML 2.0 | Okta SAML, Azure SAML, Ping, OneLogin, custom enterprise IdPs |

For each provider: register an app, add client credentials to your config via `env:` references, and set `dashboard.sso.baseUrl` to your Proxiq public URL. Proxiq builds the callback URLs automatically.

Admin roles are assigned per email address via `dashboard.adminEmails` — anyone not on the list signs in as a read-only user and sees only their own token and usage stats.

See the [Configuration](configuration#dashboard--sso) page for full config blocks per provider.

### Token-based API access

Each developer or team gets a unique token with independent controls:

- **RPM limits** — requests per minute cap per token
- **Model restrictions** — allow only specific models (e.g. no Opus for non-engineering teams)
- **Policy assignment** — bind a named security policy to a token
- **Instant revocation** — disable a token from the dashboard without touching client code

---

## Compliance posture

| Requirement | How Proxiq helps |
|---|---|
| No PII to third-party LLMs | DLP `block` action — request never leaves your network |
| Audit log for AI interactions | Every request logged: user, timestamp, model, policy outcome |
| Data residency | Self-hosted — data never leaves your infrastructure |
| Configurable retention | Per-policy retention days |
| Access control | SSO + token auth with model and provider restrictions |
| Consistent compliance language | System prompt lock on every request |
| Secret management | API keys via `env:` or `file:` references — never stored in plaintext |

---

## What Proxiq stores vs. never stores

**Stored** (in your local SQLite):
- Request hashes (SHA-256) for cache lookup — not raw prompts
- Request metadata: tokens, latency, model, cost estimate
- Security events: policy name, action, violation type
- User and token records

**Never stored:**
- Raw API keys (memory only — never written to disk)
- Raw prompt content (unless `logging.includePrompts: true`, off by default)

---

## Deployment

Proxiq runs anywhere — a single process with a SQLite database, no external dependencies.

- **VPS / bare metal** — systemd service
- **Docker** — single container
- **AWS** — CloudFormation template included
- **Azure** — ARM template included

See [Deployment](deployment) for full instructions.

---

## Commercial licensing & managed deployment

Proxiq is open-source under AGPL-3.0. Self-hosting for internal use is always free.

APPMATTIC offers commercial licensing for organizations that need:

- Removal of AGPL copyleft requirements
- Managed deployment inside your AWS, Azure, or GCP account
- SLA, priority support, and custom integrations
- Policy design and onboarding workshops

[Email APPMATTIC](mailto:build@appmattic.com){: .btn .btn-primary }

We respond within one business day.

---

*Built by [APPMATTIC](https://appmattic.com)*
