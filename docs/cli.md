---
layout: default
title: CLI Reference
nav_order: 6
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
proxiq status                      # Is it running? Uptime and hit rate
```

---

## Stats

```bash
proxiq stats                       # Full savings table (all time)
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
proxiq config show                 # Print the resolved config (with env overrides)
```

---

## Version

```bash
proxiq --version
proxiq -v
```
