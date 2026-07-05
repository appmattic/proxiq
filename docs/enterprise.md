# Proxiq for Enterprise

Proxiq is open-source and free to self-host. This page covers the security features, compliance controls, and commercial options that matter most to security-conscious organizations.

**Contact: [build@appmattic.com](mailto:build@appmattic.com)**

---

## The problem Proxiq solves

Your teams are already using Claude, GPT, and other AI tools. Some have API access. Some are using consumer apps. You have no visibility into what's being sent, no way to enforce compliance rules, and no audit trail if something goes wrong.

Proxiq is the single point of control — deployed in your infrastructure — that lets you govern all LLM traffic without slowing teams down.

---

## Security features (available today, open source)

### Data Loss Prevention (DLP)

Proxiq scans every outbound request against configurable PII patterns before the message reaches any LLM.

**Detected patterns:**
- Credit card numbers (Luhn-validated)
- Social Security Numbers (SSN)
- IBANs
- API keys and secrets
- Email addresses
- Phone numbers
- Passport numbers

**Actions per policy:**
- `block` — return HTTP 400, log the event, the message never leaves your network
- `redact` — replace PII with `[REDACTED]`, forward the sanitized message, log the event
- `log` — allow the request, record the violation for audit review

### Prompt Injection Guard

Detects attempts to override system instructions or extract confidential context. Configurable sensitivity threshold (0.3 = strict / 0.9 = only obvious attacks). Blocked attempts are logged as security events.

### System Prompt Lock

Inject compliance instructions before or after every user-supplied system prompt — and prevent any client from overriding them. Useful for:
- Regulatory compliance language ("do not provide financial advice")
- Brand and tone requirements
- Confidentiality reminders

### Output Filter

Optionally redact PII from model responses before they're returned to the client. Protects against models inadvertently echoing sensitive data.

### Security Policies — the control plane

Policies are named profiles that bundle all of the above controls. Assign any policy to any user or API token. Multiple policies can coexist — each team gets the right level of control.

Built-in presets:
- **Banking** — all PII patterns, block action, system prompt lock, output filter, Anthropic-only, 365-day retention
- **Healthcare** — SSN/passport/email/phone, block action, HIPAA-aligned system prompt, 365-day retention
- **Marketing** — API key detection only, log action, 30-day retention
- **Developer** — API key detection only, lenient thresholds, short retention

Or build your own in the visual policy builder — no config file editing required.

### Audit Trail — Security Events

Every DLP event, injection attempt, and policy action is logged to a searchable security events table in the dashboard:
- Timestamp, user, token
- Policy applied
- Action taken (`dlp_blocked`, `dlp_redacted`, `dlp_logged`, `injection_blocked`)
- Detail (which patterns triggered, violation content summary)
- Configurable retention per policy

---

## Access control

### SSO

Proxiq supports SSO via:
- **Microsoft Azure AD** — OAuth 2.0 / OIDC
- **Google Workspace** — OAuth 2.0 / OIDC

Users sign in with their existing corporate identity. No separate accounts or password management. Admin roles are assigned in the dashboard.

Setup takes under 5 minutes — register an app in Azure AD or Google Cloud Console, add the client ID, secret, and tenant ID to your config.

### Token-based API access

Each developer or team gets a unique API token with independent controls:
- **RPM limits** — requests per minute cap
- **Model restrictions** — only allow specific models (e.g. no Opus for non-engineering teams)
- **Policy assignment** — bind a security policy to a token
- **Revocation** — disable a token instantly from the dashboard without touching any client code

Tokens can be created and managed in the dashboard or via the admin API.

---

## Compliance posture

| Requirement | How Proxiq helps |
|---|---|
| No PII to third-party LLMs | DLP block action prevents sensitive data from leaving your network |
| Audit log for AI interactions | Every request logged with user, timestamp, model, and policy outcome |
| Data residency | Self-hosted — data never leaves your infrastructure |
| Retention controls | Per-policy configurable retention days |
| Access control | SSO + token-based auth with model and provider restrictions |
| Consistent compliance instructions | System prompt lock ensures every LLM call carries your compliance language |
| Secret management | API keys referenced via `env:` or `file:` — never stored in plaintext |

---

## Architecture for security teams

Proxiq is a single Fastify process with a SQLite database. Everything runs in your environment.

```
Developer / Claude Code / Internal Tool
              │
              ▼
    ┌─────────────────────┐
    │   Proxiq Gateway    │  ← your server, your network
    │                     │
    │  Auth (token/SSO)   │
    │  DLP scan           │  ← PII never reaches LLM if blocked
    │  Policy enforcement │
    │  Audit logging      │
    │  Cache              │
    │  Model router       │
    └─────────────────────┘
              │
              ▼
    LLM Provider API (Anthropic, OpenAI, etc.)
```

**What Proxiq stores:**
- Request hashes (SHA-256) for cache lookup — not raw prompts by default
- Request metadata (tokens, latency, model, cost estimate)
- Security events (policy name, action, violation type)
- User and token records

**What Proxiq never stores:**
- Raw API keys (passed through memory only)
- Raw prompt content (unless `logging.includePrompts: true`, off by default)

---

## Deployment options

### Self-hosted (recommended for most teams)

Run Proxiq on any Linux server, VM, or container in your existing infrastructure. Full control, no external dependencies.

- **VPS / bare metal** — systemd service, ~$5/month on any cloud VPS
- **Docker** — single container, `docker run ghcr.io/appmattic/proxiq`
- **Kubernetes** — deploy as a standard Deployment with a PVC for the SQLite volume
- **AWS** — CloudFormation template included (`deploy/aws/`)
- **Azure** — ARM template included (`deploy/azure/`)

### APPMATTIC-managed (commercial)

We deploy and operate Proxiq inside your AWS, Azure, or GCP account. Your data stays in your cloud. We handle:
- Initial deployment and TLS setup
- Version upgrades and security patches
- Database backups and migrations
- Monitoring and alerting

---

## Commercial licensing

Proxiq is licensed under AGPL-3.0. Self-hosting for internal use is always free.

A commercial license from APPMATTIC:
- Removes AGPL copyleft requirements (if you redistribute or offer Proxiq as a service)
- Includes a support SLA (response time guaranteed)
- Covers managed deployment and professional services
- Unlocks priority access to new features

---

## Professional services

- **Policy design** — we work with your security team to define the right policies for your industry and risk profile
- **Migration** — move existing teams from direct API calls to Proxiq with zero downtime
- **Custom integrations** — connect Proxiq to your SIEM, ITSM, or internal approval workflows
- **Onboarding** — half-day workshop for your engineering and security teams

---

## Get started

Email **[build@appmattic.com](mailto:build@appmattic.com)** with:

1. Your team size and which LLM providers you use
2. Your primary concern — compliance, cost, or both
3. Whether you want self-hosted or managed deployment

We'll respond within one business day.

---

*Proxiq is built and maintained by [APPMATTIC](https://appmattic.com)*
