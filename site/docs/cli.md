---
layout: default
title: CLI Reference
nav_order: 7
---

# CLI Reference
{: .no_toc }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Start / stop

```bash
proxiq start                       # Start proxy in foreground (localhost:3099)
proxiq start --port 3099           # Custom port
proxiq start --host 0.0.0.0        # Bind to all interfaces (for servers)
proxiq start --config ./my.json    # Custom config file path
proxiq stop                        # Stop a background proxy process
proxiq status                      # Is it running? Version, uptime, cache hit rate
```

---

## Stats

```bash
proxiq stats                       # Full savings summary (all time)
proxiq stats --since 7d            # Last 7 days
proxiq stats --since 24h           # Last 24 hours
proxiq stats --json                # Machine-readable JSON output
```

---

## Cache

```bash
proxiq cache clear                 # Wipe the entire exact cache
proxiq cache inspect --hash <sha>  # Inspect a single cache entry by hash
proxiq cache export --out out.json # Export all cache entries to JSON
```

---

## Config

```bash
proxiq config init                 # Create .proxiq.json with defaults
proxiq config validate             # Validate your config file
proxiq config show                 # Print resolved config (secrets redacted)
```

---

## Version

```bash
proxiq --version
proxiq -v
```

---

## Dashboard

The admin dashboard is available at `http://localhost:3099/proxiq/dashboard` whenever Proxiq is running. All dashboard capabilities (token management, policy builder, security events, analytics) are also exposed via the admin REST API at `/proxiq/admin/*`.
