---
layout: default
title: Claude Connector
nav_order: 8
---

# Claude Connector Setup
{: .no_toc }

Connect Proxiq to Claude Code, Claude Desktop, and Claude for Work as an MCP server. Gives Claude direct access to your gateway — stats, completions, cache, and routing — all from within the conversation.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## What this enables

Once connected, the Proxiq MCP server exposes these tools inside Claude:

| Tool | What it does |
|---|---|
| `proxiq_status` | Check if Proxiq is running — version, uptime, cache hit rate |
| `proxiq_metrics` | View token savings, request volume, cost breakdown |
| `proxiq_completion` | Make a cached, routed completion through any configured provider |
| `proxiq_classify` | See which model tier a prompt would be routed to (and why) |
| `proxiq_set_tier` | Lock the session to a specific model tier |
| `proxiq_clear_cache` | Clear the exact cache |

---

## Step 1 — Start Proxiq

```bash
proxiq start
```

Proxiq must be running before Claude can connect to the MCP server.

---

## Step 2 — MCP config block

Copy `claude-mcp.json.example` from the repo root, fill in your paths and token:

```json
{
  "mcpServers": {
    "proxiq": {
      "command": "/path/to/bun",
      "args": ["/path/to/proxiq/packages/mcp/dist/index.js"],
      "env": {
        "PROXIQ_URL": "http://127.0.0.1:3099",
        "PROXIQ_API_KEY": "your_proxiq_token_here"
      }
    }
  }
}
```

`PROXIQ_API_KEY` is the Bearer token issued by your Proxiq instance. If `auth.required` is `false` in your config, you can leave it empty.

---

## Step 3 — Where to place the config

### Claude Code

Add to `.claude/mcp.json` in your project root:

```bash
mkdir -p .claude
# paste the mcpServers block into .claude/mcp.json
```

### Claude Desktop

Add to `claude_desktop_config.json`:

| OS | Path |
|---|---|
| **macOS** | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Windows** | `%APPDATA%\Claude\claude_desktop_config.json` |
| **Linux** | `~/.config/Claude/claude_desktop_config.json` |

If the file does not exist, create it:

```json
{
  "mcpServers": {
    "proxiq": {
      "command": "/path/to/bun",
      "args": ["/path/to/proxiq/packages/mcp/dist/index.js"],
      "env": {
        "PROXIQ_URL": "http://127.0.0.1:3099",
        "PROXIQ_API_KEY": "your_proxiq_token_here"
      }
    }
  }
}
```

### Claude for Work (Cowork)

Add the same `mcpServers` block through your workspace connector settings. The connector definition is identical.

---

## Step 4 — Validate

After reloading Claude, run:

- `proxiq_status` — should return version, uptime, and cache hit rate
- `proxiq_metrics` — shows token savings so far
- `proxiq_classify` with a test prompt — shows which tier it would route to

### Troubleshooting

If `proxiq_status` returns an error:

1. Confirm Proxiq is running: `proxiq status` in your terminal
2. Confirm Bun is installed: `bun --version`
3. Check that `PROXIQ_URL` matches the host and port Proxiq is listening on
4. Use an absolute path for the `args` entry if relative paths aren't resolving
5. If `auth.required: true`, confirm your `PROXIQ_API_KEY` is a valid token from the dashboard
