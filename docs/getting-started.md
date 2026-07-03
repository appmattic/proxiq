---
layout: default
title: Getting Started
nav_order: 2
---

# Getting Started
{: .no_toc }

Prove proxiq is saving tokens in your own environment in under 5 minutes.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Step 1 — Install

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

**Build from source**

```bash
git clone https://github.com/appmattic/proxiq
cd proxiq
bun install
bun run build   # → ./proxiq binary
```

---

## Step 2 — Start the proxy

```bash
proxiq start
```

By default, proxiq listens on `http://127.0.0.1:3099`. Use `--port` to change.

---

## Step 3 — Send a request (cache miss)

```bash
curl -i http://127.0.0.1:3099/v1/messages \
  -H "x-proxiq-provider: anthropic" \
  -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-3-5-haiku-20241022","max_tokens":120,"messages":[{"role":"user","content":"Summarize semantic caching in 5 bullets."}]}'
```

Look for `x-proxiq-from-cache: false` in the response headers — this is a live call to Anthropic.

---

## Step 4 — Send the same request again (cache hit)

Run the exact same command a second time.

This time you should see:

```
x-proxiq-from-cache: true
x-proxiq-cache-source: exact
```

The response was served from SQLite instantly — **zero tokens charged to Anthropic**.

---

## Step 5 — Check your savings

```bash
proxiq stats
```

or via HTTP:

```bash
curl http://127.0.0.1:3099/proxiq/metrics
```

You should see `cacheHits`, `hitRate`, `savedInputTokens`, and `savedOutputTokens` increasing.

---

## Tips for bigger savings

- **Longer prompts** save more — system prompts and tool definitions are prime cache targets.
- **Repeated workflows** accumulate fast — classification, summarization, and translation tasks commonly re-use the same prompts.
- **Enable semantic cache** to catch near-identical prompts (e.g. minor rephrasing):

```json
{
  "cache": {
    "semantic": { "enabled": true, "similarityThreshold": 0.94 }
  }
}
```

{: .tip }
Use `proxiq stats --since 7d` to see savings over a full week of usage.
