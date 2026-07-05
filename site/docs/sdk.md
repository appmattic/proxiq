---
layout: default
title: SDK Integration
nav_order: 6
---

# SDK Integration
{: .no_toc }

Drop-in helper that routes Anthropic and OpenAI SDK clients through Proxiq with a single line change. All security policies, DLP, caching, and routing apply automatically.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Install

```bash
bun add @proxiq/sdk
# or
npm install @proxiq/sdk
```

---

## Anthropic

```typescript
import { relay } from '@proxiq/sdk';
import Anthropic from '@anthropic-ai/sdk';

// One line — all calls now route through Proxiq
const client = relay(new Anthropic());

const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

---

## OpenAI

```typescript
import { relay } from '@proxiq/sdk';
import OpenAI from 'openai';

const client = relay(new OpenAI());

const response = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

---

## Custom proxy URL

```typescript
import { relay } from '@proxiq/sdk';
import Anthropic from '@anthropic-ai/sdk';

// Point at a remote Proxiq instance
const client = relay(new Anthropic(), { url: 'https://proxiq.yourcompany.com' });
```

Or via environment variable — no code changes needed:

```bash
export PROXIQ_URL=https://proxiq.yourcompany.com
```

---

## Pass a token

If your Proxiq instance has `auth.required: true`, include the token in your SDK client:

```typescript
import { relay } from '@proxiq/sdk';
import Anthropic from '@anthropic-ai/sdk';

const client = relay(new Anthropic({ apiKey: process.env.PROXIQ_TOKEN }));
```

The token is passed as the Bearer header — Proxiq resolves the upstream API key from the token record automatically. Your app never needs to hold the upstream API key directly.

---

## Helper functions

```typescript
import { getProxiqBaseUrl, isProxiqEnabled } from '@proxiq/sdk';

// Returns PROXIQ_URL env var or http://127.0.0.1:3099
const baseUrl = getProxiqBaseUrl();

// Returns false when PROXIQ_ENABLED=false
const enabled = isProxiqEnabled();
```

---

## Bypass in test environments

```bash
export PROXIQ_ENABLED=false
```

When `false`, `relay(client)` returns the original client unchanged — no proxy routing, no DLP, no caching. Useful in CI or unit tests where you want direct API calls.

---

## What happens to each request

When your app calls the relayed client, Proxiq:

1. Resolves your token and loads the assigned security policy
2. Scans message content against DLP patterns (block / redact / log)
3. Checks the exact cache — returns instantly if matched
4. Checks the semantic cache — returns if cosine similarity ≥ 0.94
5. Routes to the appropriate model tier (if routing enabled)
6. Forwards to the upstream provider
7. Logs the request and any security events
8. Returns the response (with output filter applied if configured)

Your application code sees a standard Anthropic or OpenAI SDK response — nothing changes from the client's perspective.
