---
layout: default
title: Configuration
nav_order: 3
---

# Configuration
{: .no_toc }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

proxiq uses [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig) to find your config file. It searches from the current directory upward for:

- `proxiq.config.ts`
- `proxiq.config.js`
- `.proxiq.json`
- `.proxiq.yaml` / `.proxiq.yml`
- `proxiq` key in `package.json`

All fields are optional — proxiq ships with sensible defaults.

---

## Full reference

```json
{
  "port": 3099,
  "host": "127.0.0.1",

  "providers": {
    "default": "anthropic",
    "azureOpenai": {
      "resourceName": "my-resource",
      "apiVersion": "2024-02-01"
    },
    "custom": {
      "baseUrl": "https://my-private-llm.internal/v1",
      "format": "openai-compatible"
    }
  },

  "cache": {
    "enabled": true,
    "exact": {
      "enabled": true,
      "ttlSeconds": 86400
    },
    "semantic": {
      "enabled": false,
      "similarityThreshold": 0.94,
      "dryRun": false
    },
    "storagePath": ".proxiq/cache.db"
  },

  "optimizer": {
    "promptCache": { "enabled": true },
    "compression": {
      "enabled": false,
      "triggerTokens": 6000,
      "retainTurns": 4
    }
  },

  "memory": {
    "enabled": false,
    "sessionTtlSeconds": 7200,
    "topK": 5
  },

  "logging": {
    "level": "info",
    "includePrompts": false,
    "format": "pretty"
  }
}
```

---

## Key settings

### `providers.default`

Which provider to use when `x-proxiq-provider` header is absent. Built-in values: `anthropic`, `openai`, `azure-openai`, `perplexity`, `groq`, `mistral`, `together`, `fireworks`, `deepinfra`, `anyscale`, `ollama`, `lmstudio`, `gemini`, `custom`.

### `cache.semantic.enabled`

Disabled by default. Enabling triggers a one-time ~23 MB model download (MiniLM-L6-v2). Subsequent startups are instant (model is cached in `~/.cache/huggingface/`).

### `cache.semantic.similarityThreshold`

Cosine similarity required for a cache hit. Range `[0.8, 1.0]`. Default `0.94`.

- Higher = fewer hits, more accurate answers
- Lower = more hits, may serve slightly mismatched responses
- Use `dryRun: true` to audit what would have hit without serving cached responses

### `optimizer.compression.enabled`

Disabled by default. When enabled, proxiq calls the cheapest available model to summarize long conversations. Only compresses when the saving in future calls exceeds the summarization cost (heuristic: context window > 3000 tokens).

### `logging.includePrompts`

{: .warning }
Never enable in production. When `true`, full prompt content is written to logs.

---

## Environment variables

| Variable | Effect |
|---|---|
| `PROXIQ_PORT` | Override `port` |
| `PROXIQ_HOST` | Override `host` |
| `PROXIQ_LOG_LEVEL` | Override `logging.level` |
| `PROXIQ_STORAGE_PATH` | Override `cache.storagePath` |
| `PROXIQ_DOCKER` | When `"true"`, sets `host` to `0.0.0.0` |
| `PROXIQ_URL` | (SDK) Override proxy URL in client apps |
| `PROXIQ_ENABLED` | (SDK) Set to `"false"` to bypass proxy |

---

## Request headers

| Header | Effect |
|---|---|
| `x-proxiq-provider` | Force a specific provider (`groq`, `perplexity`, `ollama`, etc.) |
| `x-proxiq-session-id` | Tag request to a session for memory context injection |

---

## Response headers

| Header | Meaning |
|---|---|
| `x-proxiq-request-id` | UUID for this request |
| `x-proxiq-session-id` | Session ID (auto-generated if not provided) |
| `x-proxiq-from-cache` | `"true"` if served from cache |
| `x-proxiq-cache-source` | `"exact"` or `"semantic"` |
| `x-proxiq-compressed` | `"true"` if context compression was applied |
