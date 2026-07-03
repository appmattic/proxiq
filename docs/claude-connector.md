---
layout: default
title: Claude Connector
nav_order: 7
---

# Claude Connector Setup
{: .no_toc }

Connect proxiq to Claude Code, Claude Desktop, and Claude for Work as an MCP server.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## What this enables

Once connected, the proxiq MCP server exposes these tools directly inside Claude:

| Tool | What it does |
|---|---|
| `proxiq_status` | Check if proxiq is running and get uptime |
| `proxiq_metrics` | View cache hit rate and token savings |
| `proxiq_completion` | Make a cached + routed completion through any provider |
| `proxiq_classify` | See which model tier a prompt would be routed to |
| `proxiq_set_tier` | Lock the session to a specific model tier |
| `proxiq_clear_cache` | Clear the exact cache |

---

## Step 1 — Start proxiq

```bash
proxiq start
```

---

## Step 2 — MCP server config block

Add this to your Claude MCP config file:

```json
{
  "mcpServers": {
    "proxiq": {
      "command": "bun",
      "args": ["packages/mcp/src/index.ts"],
      "env": {
        "PROXIQ_URL": "http://127.0.0.1:3099",
        "PROXIQ_API_KEY": "your_provider_api_key_here"
      }
    }
  }
}
```

You can copy this directly from `claude-mcp.json` in the proxiq repo root.

### What to put in `PROXIQ_API_KEY`

`PROXIQ_API_KEY` is the default upstream provider key used by the `proxiq_completion` tool.

- Using Anthropic → set it to your `sk-ant-...` key
- Using OpenAI → set it to your `sk-...` key
- Using another provider → set it to that provider's key
- Passing `api_key` in each tool call explicitly → leave it empty

---

## Step 3 — Where to put the config

### Claude Code

Add to `.claude/mcp.json` in your project root. Create the folder if it doesn't exist.

```bash
mkdir -p .claude
# Then paste the mcpServers block into .claude/mcp.json
```

### Claude Desktop

Add to `claude_desktop_config.json` at the path for your OS:

| OS | Path |
|---|---|
| **macOS** | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Windows** | `%APPDATA%\Claude\claude_desktop_config.json` |
| **Linux** | `~/.config/Claude/claude_desktop_config.json` |

If the file does not exist yet, create it with the full JSON structure:

```json
{
  "mcpServers": {
    "proxiq": {
      "command": "bun",
      "args": ["packages/mcp/src/index.ts"],
      "env": {
        "PROXIQ_URL": "http://127.0.0.1:3099",
        "PROXIQ_API_KEY": "your_key_here"
      }
    }
  }
}
```

### Claude for Work (Cowork)

Add the same `mcpServers` block through your workspace connector or admin settings panel. The connector definition is identical — only the delivery mechanism differs by your organisation's Cowork setup.

---

## Step 4 — Validate

After reloading Claude, run:

- `proxiq_status` — should show version, uptime, and cache hit rate
- `proxiq_metrics` — shows token savings so far
- `proxiq_completion` — try a completion routed through your provider

### Troubleshooting

If `proxiq_status` returns an error:

1. Confirm proxiq is running: `proxiq status` in a terminal
2. Confirm Bun is installed: `bun --version`
3. Confirm `PROXIQ_URL` points to the correct host and port
4. Check that the `args` path resolves to the MCP source file — use an absolute path if needed

---

## Claudex and additional providers

{: .note }
Claudex connector guidance and additional provider-specific MCP templates are coming soon.
