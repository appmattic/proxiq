import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type DB = Database;

// ---------------------------------------------------------------------------
// Model pricing — per 1M tokens [inputUsd, outputUsd]
// Ordered most-specific first; first match wins.
// ---------------------------------------------------------------------------
const PRICING: Array<{ pattern: RegExp; input: number; output: number }> = [
  // Anthropic
  { pattern: /claude-opus-4/i, input: 15, output: 75 },
  { pattern: /claude-sonnet-4/i, input: 3, output: 15 },
  { pattern: /claude-haiku-4/i, input: 0.8, output: 4 },
  { pattern: /claude-fable-5/i, input: 20, output: 100 },
  { pattern: /claude-sonnet-5/i, input: 3, output: 15 },
  { pattern: /claude-opus-3-5/i, input: 15, output: 75 },
  { pattern: /claude-sonnet-3-5/i, input: 3, output: 15 },
  { pattern: /claude-haiku-3-5/i, input: 0.8, output: 4 },
  // OpenAI
  { pattern: /gpt-4o-mini/i, input: 0.15, output: 0.6 },
  { pattern: /gpt-4o|gpt-4\.1/i, input: 2.5, output: 10 },
  { pattern: /gpt-4-turbo/i, input: 10, output: 30 },
  { pattern: /gpt-3\.5/i, input: 0.5, output: 1.5 },
  // Google
  { pattern: /gemini.*flash/i, input: 0.075, output: 0.3 },
  { pattern: /gemini.*pro/i, input: 1.25, output: 5 },
  // Meta / Llama (typical hosted rates)
  { pattern: /llama.*70b|llama.*3\.3/i, input: 0.59, output: 0.79 },
  { pattern: /llama.*8b/i, input: 0.05, output: 0.08 },
  // Mistral
  { pattern: /mistral-large/i, input: 2, output: 6 },
  { pattern: /mistral-small/i, input: 0.1, output: 0.3 },
  // Fallback — treat as mid-tier
  { pattern: /.*/, input: 3, output: 15 },
];

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const p = PRICING.find((r) => r.pattern.test(model)) ?? {
    input: 3,
    output: 15,
  };
  return (
    (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output
  );
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export function initDatabase(storagePath: string): DB {
  mkdirSync(dirname(storagePath), { recursive: true });

  const db = new Database(storagePath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS cache_entries (
      id TEXT PRIMARY KEY,
      request_hash TEXT UNIQUE NOT NULL,
      response_body TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      expires_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_cache_hash ON cache_entries(request_hash);
    CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache_entries(expires_at);

    CREATE TABLE IF NOT EXISTS request_log (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      from_cache INTEGER NOT NULL DEFAULT 0,
      cache_source TEXT,
      compressed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      -- routing
      original_model TEXT NOT NULL DEFAULT '',
      routed_model TEXT NOT NULL DEFAULT '',
      routing_method TEXT NOT NULL DEFAULT 'default',
      routing_tier TEXT NOT NULL DEFAULT 'standard',
      -- economics
      cost_usd REAL NOT NULL DEFAULT 0,
      saved_usd REAL NOT NULL DEFAULT 0,
      -- identity
      user_label TEXT NOT NULL DEFAULT 'anonymous'
    );

    CREATE INDEX IF NOT EXISTS idx_log_created ON request_log(created_at);

    CREATE TABLE IF NOT EXISTS memory_store (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding BLOB,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memory_session ON memory_store(session_id);

    CREATE TABLE IF NOT EXISTS tokens (
      id          TEXT PRIMARY KEY,
      label       TEXT UNIQUE NOT NULL,
      token       TEXT UNIQUE NOT NULL,
      upstream_key TEXT,
      allowed_models TEXT,
      rpm_limit   INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      last_used_at INTEGER,
      revoked     INTEGER NOT NULL DEFAULT 0,
      created_by  TEXT NOT NULL DEFAULT 'config',
      policy_name TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tokens_token   ON tokens(token);
    CREATE INDEX IF NOT EXISTS idx_tokens_label   ON tokens(label);
    CREATE INDEX IF NOT EXISTS idx_tokens_revoked ON tokens(revoked);

    CREATE TABLE IF NOT EXISTS policy_log (
      id          TEXT PRIMARY KEY,
      created_at  INTEGER NOT NULL,
      user_label  TEXT NOT NULL,
      policy_name TEXT NOT NULL,
      action      TEXT NOT NULL,
      detail      TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_plog_created   ON policy_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_plog_user      ON policy_log(user_label);
    CREATE INDEX IF NOT EXISTS idx_plog_action    ON policy_log(action);

    CREATE TABLE IF NOT EXISTS policies (
      name        TEXT PRIMARY KEY,
      display_name TEXT,
      config      TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
  `);

  // Migrate existing DBs — add new columns if they don't exist yet
  const existingCols = new Set(
    (
      db.query("PRAGMA table_info(request_log)").all() as Array<{
        name: string;
      }>
    ).map((r) => r.name)
  );
  const migrations: string[] = [];
  if (!existingCols.has("original_model"))
    migrations.push(
      "ALTER TABLE request_log ADD COLUMN original_model TEXT NOT NULL DEFAULT ''"
    );
  if (!existingCols.has("routed_model"))
    migrations.push(
      "ALTER TABLE request_log ADD COLUMN routed_model TEXT NOT NULL DEFAULT ''"
    );
  if (!existingCols.has("routing_method"))
    migrations.push(
      "ALTER TABLE request_log ADD COLUMN routing_method TEXT NOT NULL DEFAULT 'default'"
    );
  if (!existingCols.has("routing_tier"))
    migrations.push(
      "ALTER TABLE request_log ADD COLUMN routing_tier TEXT NOT NULL DEFAULT 'standard'"
    );
  if (!existingCols.has("cost_usd"))
    migrations.push(
      "ALTER TABLE request_log ADD COLUMN cost_usd REAL NOT NULL DEFAULT 0"
    );
  if (!existingCols.has("saved_usd"))
    migrations.push(
      "ALTER TABLE request_log ADD COLUMN saved_usd REAL NOT NULL DEFAULT 0"
    );
  if (!existingCols.has("user_label"))
    migrations.push(
      "ALTER TABLE request_log ADD COLUMN user_label TEXT NOT NULL DEFAULT 'anonymous'"
    );
  for (const sql of migrations) db.exec(sql);

  // Migrate tokens table
  const tokenCols = new Set(
    (
      db.query("PRAGMA table_info(tokens)").all() as Array<{ name: string }>
    ).map((r) => r.name)
  );
  if (!tokenCols.has("policy_name"))
    db.exec("ALTER TABLE tokens ADD COLUMN policy_name TEXT");

  // Indexes for new columns — safe to run after migration
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_log_original_model ON request_log(original_model);
    CREATE INDEX IF NOT EXISTS idx_log_routed_model ON request_log(routed_model);
    CREATE INDEX IF NOT EXISTS idx_log_user_label ON request_log(user_label);
  `);

  return db;
}

// ---------------------------------------------------------------------------
// Cache stats (existing — kept for /proxiq/metrics)
// ---------------------------------------------------------------------------

export interface CacheStats {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgDurationMs: number;
}

export function getCacheStats(db: DB): CacheStats {
  const row = db
    .query(`
    SELECT
      COUNT(*) as total,
      SUM(from_cache) as hits,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      AVG(duration_ms) as avg_duration
    FROM request_log
  `)
    .get() as {
    total: number;
    hits: number;
    input_tokens: number;
    output_tokens: number;
    avg_duration: number;
  } | null;

  const total = row?.total ?? 0;
  const hits = row?.hits ?? 0;

  return {
    totalRequests: total,
    cacheHits: hits,
    cacheMisses: total - hits,
    hitRate: total > 0 ? hits / total : 0,
    totalInputTokens: row?.input_tokens ?? 0,
    totalOutputTokens: row?.output_tokens ?? 0,
    avgDurationMs: Math.round(row?.avg_duration ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Routing stats — new
// ---------------------------------------------------------------------------

export type StatsPeriod = "today" | "daily_avg" | "weekly" | "monthly";

export interface RoutingSwitch {
  from: string;
  to: string;
  count: number;
}

export interface PeriodStats {
  period: StatsPeriod;
  fromTs: number; // Unix seconds
  toTs: number;
  requests: {
    total: number;
    cached: number;
    streamed: number;
    byTier: { simple: number; standard: number; complex: number };
    byMethod: {
      classifier: number;
      rule: number;
      header: number;
      default: number;
      cache: number;
    };
  };
  models: {
    switches: RoutingSwitch[];
    used: Record<string, number>;
  };
  tokens: {
    totalInput: number;
    totalOutput: number;
  };
  cost: {
    actualUsd: number;
    wouldHaveCostUsd: number;
    savedUsd: number;
    savingsPct: number;
  };
}

/** Returns [fromTs, toTs] in Unix seconds for the given period */
function periodBounds(period: StatsPeriod): [number, number] {
  const now = Math.floor(Date.now() / 1000);
  const todayMidnight = now - (now % 86400); // approximate UTC midnight

  switch (period) {
    case "today":
      return [todayMidnight, now];
    case "weekly":
      return [now - 7 * 86400, now];
    case "monthly":
      return [now - 30 * 86400, now];
    case "daily_avg":
      return [now - 30 * 86400, now]; // same window, results divided
  }
}

export function getStats(
  db: DB,
  period: StatsPeriod,
  user?: string
): PeriodStats {
  const [fromTs, toTs] = periodBounds(period);
  const divisor = period === "daily_avg" ? 30 : 1;

  const userClause = user ? "AND user_label = ?" : "";
  const baseParams = user ? [fromTs, toTs, user] : [fromTs, toTs];

  const agg = db
    .query(`
    SELECT
      COUNT(*)                                            AS total,
      SUM(from_cache)                                    AS cached,
      SUM(CASE WHEN duration_ms = 0 THEN 1 ELSE 0 END)  AS streamed,
      SUM(CASE WHEN routing_tier = 'simple'   THEN 1 ELSE 0 END) AS tier_simple,
      SUM(CASE WHEN routing_tier = 'standard' THEN 1 ELSE 0 END) AS tier_standard,
      SUM(CASE WHEN routing_tier = 'complex'  THEN 1 ELSE 0 END) AS tier_complex,
      SUM(CASE WHEN routing_method = 'classifier' THEN 1 ELSE 0 END) AS m_classifier,
      SUM(CASE WHEN routing_method = 'rule'       THEN 1 ELSE 0 END) AS m_rule,
      SUM(CASE WHEN routing_method = 'header'     THEN 1 ELSE 0 END) AS m_header,
      SUM(CASE WHEN routing_method = 'default'    THEN 1 ELSE 0 END) AS m_default,
      SUM(CASE WHEN from_cache = 1                THEN 1 ELSE 0 END) AS m_cache,
      SUM(input_tokens)  AS total_input,
      SUM(output_tokens) AS total_output,
      SUM(cost_usd)      AS total_cost,
      SUM(saved_usd)     AS total_saved
    FROM request_log
    WHERE created_at >= ? AND created_at <= ? ${userClause}
  `)
    .get(...baseParams) as Record<string, number> | null;

  const r = agg ?? {};
  const div = (n: number) => Math.round(((n ?? 0) / divisor) * 100) / 100;

  // Model usage breakdown
  const modelRows = db
    .query(`
    SELECT routed_model AS model, COUNT(*) AS cnt
    FROM request_log
    WHERE created_at >= ? AND created_at <= ? ${userClause} AND routed_model != ''
    GROUP BY routed_model
  `)
    .all(...baseParams) as Array<{ model: string; cnt: number }>;

  const used: Record<string, number> = {};
  for (const row of modelRows) used[row.model] = Math.round(row.cnt / divisor);

  // Routing switches (where original != routed)
  const switchRows = db
    .query(`
    SELECT original_model AS src, routed_model AS dst, COUNT(*) AS cnt
    FROM request_log
    WHERE created_at >= ? AND created_at <= ? ${userClause}
      AND original_model != ''
      AND routed_model != ''
      AND original_model != routed_model
    GROUP BY original_model, routed_model
    ORDER BY cnt DESC
    LIMIT 20
  `)
    .all(...baseParams) as Array<{ src: string; dst: string; cnt: number }>;

  const switches: RoutingSwitch[] = switchRows.map((row) => ({
    from: row.src,
    to: row.dst,
    count: Math.round(row.cnt / divisor),
  }));

  const actualUsd = div(r.total_cost ?? 0);
  const savedUsd = div(r.total_saved ?? 0);
  const wouldHaveCost = Math.round((actualUsd + savedUsd) * 100) / 100;
  const savingsPct =
    wouldHaveCost > 0 ? Math.round((savedUsd / wouldHaveCost) * 1000) / 10 : 0;

  return {
    period,
    fromTs,
    toTs,
    requests: {
      total: div(r.total ?? 0),
      cached: div(r.cached ?? 0),
      streamed: div(r.streamed ?? 0),
      byTier: {
        simple: div(r.tier_simple ?? 0),
        standard: div(r.tier_standard ?? 0),
        complex: div(r.tier_complex ?? 0),
      },
      byMethod: {
        classifier: div(r.m_classifier ?? 0),
        rule: div(r.m_rule ?? 0),
        header: div(r.m_header ?? 0),
        default: div(r.m_default ?? 0),
        cache: div(r.m_cache ?? 0),
      },
    },
    models: { switches, used },
    tokens: {
      totalInput: div(r.total_input ?? 0),
      totalOutput: div(r.total_output ?? 0),
    },
    cost: {
      actualUsd,
      wouldHaveCostUsd: wouldHaveCost,
      savedUsd,
      savingsPct,
    },
  };
}

// ---------------------------------------------------------------------------
// Policy event logging
// ---------------------------------------------------------------------------

export function logPolicyEvent(
  db: DB,
  userLabel: string,
  policyName: string,
  action: string,
  detail?: Record<string, unknown>
): void {
  try {
    db.run(
      "INSERT INTO policy_log (id, created_at, user_label, policy_name, action, detail) VALUES (?,?,?,?,?,?)",
      randomUUID(),
      Math.floor(Date.now() / 1000),
      userLabel,
      policyName,
      action,
      detail ? JSON.stringify(detail) : null
    );
  } catch {
    // Never let logging errors break the request path
  }
}

export interface PolicyEvent {
  id: string;
  createdAt: number;
  userLabel: string;
  policyName: string;
  action: string;
  detail: Record<string, unknown> | null;
}

export function getRecentPolicyEvents(db: DB, limit = 100): PolicyEvent[] {
  const rows = db
    .query(
      "SELECT id, created_at, user_label, policy_name, action, detail FROM policy_log ORDER BY created_at DESC LIMIT ?"
    )
    .all(limit) as Array<{
    id: string;
    created_at: number;
    user_label: string;
    policy_name: string;
    action: string;
    detail: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    userLabel: r.user_label,
    policyName: r.policy_name,
    action: r.action,
    detail: r.detail ? (JSON.parse(r.detail) as Record<string, unknown>) : null,
  }));
}

// ---------------------------------------------------------------------------
// Policy CRUD (runtime-editable policies stored in DB)
// ---------------------------------------------------------------------------

export interface StoredPolicy {
  name: string;
  displayName: string | null;
  config: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export function listStoredPolicies(db: DB): StoredPolicy[] {
  const rows = db
    .query("SELECT * FROM policies ORDER BY name ASC")
    .all() as Array<{
    name: string;
    display_name: string | null;
    config: string;
    created_at: number;
    updated_at: number;
  }>;
  return rows.map((r) => ({
    name: r.name,
    displayName: r.display_name,
    config: JSON.parse(r.config) as Record<string, unknown>,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function getStoredPolicy(db: DB, name: string): StoredPolicy | null {
  const r = db.query("SELECT * FROM policies WHERE name = ?").get(name) as {
    name: string;
    display_name: string | null;
    config: string;
    created_at: number;
    updated_at: number;
  } | null;
  if (!r) return null;
  return {
    name: r.name,
    displayName: r.display_name,
    config: JSON.parse(r.config) as Record<string, unknown>,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function upsertStoredPolicy(
  db: DB,
  name: string,
  displayName: string | null,
  config: Record<string, unknown>
): StoredPolicy {
  const now = Math.floor(Date.now() / 1000);
  const existing = getStoredPolicy(db, name);
  if (existing) {
    db.run(
      "UPDATE policies SET display_name = ?, config = ?, updated_at = ? WHERE name = ?",
      displayName,
      JSON.stringify(config),
      now,
      name
    );
  } else {
    db.run(
      "INSERT INTO policies (name, display_name, config, created_at, updated_at) VALUES (?,?,?,?,?)",
      name,
      displayName,
      JSON.stringify(config),
      now,
      now
    );
  }
  return getStoredPolicy(db, name)!;
}

export function deleteStoredPolicy(db: DB, name: string): boolean {
  return db.run("DELETE FROM policies WHERE name = ?", name).changes > 0;
}

export function purgeExpiredCache(db: DB): number {
  const now = Math.floor(Date.now() / 1000);
  return db.run(
    "DELETE FROM cache_entries WHERE expires_at IS NOT NULL AND expires_at < ?",
    now
  ).changes;
}

/** Purge request_log rows older than `days` days. 0 = no-op. */
export function purgeOldLogs(db: DB, days: number): number {
  if (days <= 0) return 0;
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  return db.run("DELETE FROM request_log WHERE created_at < ?", cutoff).changes;
}
