---
layout: default
title: Supported Providers
nav_order: 4
---

# Supported Providers
{: .no_toc }

Route to any provider using the `x-proxiq-provider` request header. Zero code changes required.
{: .fs-6 .fw-300 }

---

## Provider table

| Provider | Header value | Wire format |
|---|---|---|
| Anthropic | `anthropic` | Anthropic Messages API |
| OpenAI | `openai` | OpenAI Chat Completions |
| Azure OpenAI | `azure-openai` | OpenAI-compatible |
| Groq | `groq` | OpenAI-compatible |
| Perplexity | `perplexity` | OpenAI-compatible |
| Mistral | `mistral` | OpenAI-compatible |
| Together AI | `together` | OpenAI-compatible |
| Fireworks AI | `fireworks` | OpenAI-compatible |
| DeepInfra | `deepinfra` | OpenAI-compatible |
| Anyscale | `anyscale` | OpenAI-compatible |
| Ollama (local) | `ollama` | OpenAI-compatible |
| LM Studio | `lmstudio` | OpenAI-compatible |
| Google Gemini | `gemini` | Gemini API |
| Custom / vLLM | `custom` | Configurable |

---

## Usage examples

### Anthropic

```bash
curl http://127.0.0.1:3099/v1/messages \
  -H "x-proxiq-provider: anthropic" \
  -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-3-5-haiku-20241022","max_tokens":100,"messages":[{"role":"user","content":"Hello!"}]}'
```

### OpenAI

```bash
curl http://127.0.0.1:3099/v1/chat/completions \
  -H "x-proxiq-provider: openai" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hello!"}]}'
```

### Groq

```bash
curl http://127.0.0.1:3099/v1/chat/completions \
  -H "x-proxiq-provider: groq" \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"llama-3.3-70b-versatile","messages":[{"role":"user","content":"Hello!"}]}'
```

### Ollama (local, no auth)

```bash
curl http://127.0.0.1:3099/v1/chat/completions \
  -H "x-proxiq-provider: ollama" \
  -H "Content-Type: application/json" \
  -d '{"model":"llama3.2","messages":[{"role":"user","content":"Hello!"}]}'
```

### Azure OpenAI

Configure resource name and API version in `.proxiq.json`:

```json
{
  "providers": {
    "default": "azure-openai",
    "azureOpenai": {
      "resourceName": "my-azure-resource",
      "apiVersion": "2024-02-01"
    }
  }
}
```

Then pass your Azure key:

```bash
curl http://127.0.0.1:3099/v1/chat/completions \
  -H "x-proxiq-provider: azure-openai" \
  -H "Authorization: Bearer $AZURE_OPENAI_KEY" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello!"}]}'
```

### Custom / private endpoint (vLLM, etc.)

```json
{
  "providers": {
    "custom": {
      "baseUrl": "https://my-private-llm.internal/v1",
      "format": "openai-compatible"
    }
  }
}
```

```bash
curl http://127.0.0.1:3099/v1/chat/completions \
  -H "x-proxiq-provider: custom" \
  -d '{"model":"my-model","messages":[{"role":"user","content":"Hello!"}]}'
```
