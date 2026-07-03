---
layout: default
title: SDK Integration
nav_order: 5
---

# SDK Integration
{: .no_toc }

Drop-in helper that routes Anthropic and OpenAI SDK clients through proxiq with a single line change.
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
import { proxiq } from '@proxiq/sdk';
import Anthropic from '@anthropic-ai/sdk';

const client = proxiq(new Anthropic());

// All calls now route through proxiq — no other code changes needed
const response = await client.messages.create({
  model: 'claude-3-5-haiku-20241022',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

---

## OpenAI

```typescript
import { proxiq } from '@proxiq/sdk';
import OpenAI from 'openai';

const client = proxiq(new OpenAI());

const response = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

---

## Custom proxy URL

```typescript
import { proxiq } from '@proxiq/sdk';
import Anthropic from '@anthropic-ai/sdk';

// Override the proxy URL (useful for VPS/cloud deployments)
const client = proxiq(new Anthropic(), { url: 'https://proxy.yourcompany.com' });
```

Or via environment variable — no code changes needed:

```bash
export PROXIQ_URL=https://proxy.yourcompany.com
```

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

When set to `false`, `proxiq(client)` returns the original client unchanged — no proxy routing, no side effects. Useful in CI or unit tests.
