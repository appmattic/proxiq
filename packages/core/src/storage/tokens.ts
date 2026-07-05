import { randomUUID } from "node:crypto";
import type { DB } from "./sqlite.js";

export interface TokenRecord {
  id: string;
  label: string;
  token: string;
  upstreamKey?: string;
  allowedModels?: string[];
  rpmLimit: number;
  createdAt: number;
  lastUsedAt?: number;
  revoked: boolean;
  createdBy: string;
  policyName?: string;
}

type RawRow = {
  id: string;
  label: string;
  token: string;
  upstream_key: string | null;
  allowed_models: string | null;
  rpm_limit: number;
  created_at: number;
  last_used_at: number | null;
  revoked: number;
  created_by: string;
  policy_name: string | null;
};

function fromRow(row: RawRow): TokenRecord {
  return {
    id: row.id,
    label: row.label,
    token: row.token,
    upstreamKey: row.upstream_key ?? undefined,
    allowedModels: row.allowed_models
      ? (JSON.parse(row.allowed_models) as string[])
      : undefined,
    rpmLimit: row.rpm_limit,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at ?? undefined,
    revoked: row.revoked === 1,
    createdBy: row.created_by,
    policyName: row.policy_name ?? undefined,
  };
}

export function listTokens(db: DB, includeRevoked = false): TokenRecord[] {
  const rows = (
    includeRevoked
      ? db.query("SELECT * FROM tokens ORDER BY created_at DESC").all()
      : db
          .query(
            "SELECT * FROM tokens WHERE revoked = 0 ORDER BY created_at DESC"
          )
          .all()
  ) as RawRow[];
  return rows.map(fromRow);
}

export function getTokenByLabel(db: DB, label: string): TokenRecord | null {
  const row = db
    .query("SELECT * FROM tokens WHERE label = ?")
    .get(label) as RawRow | null;
  return row ? fromRow(row) : null;
}

export function getTokenByValue(db: DB, token: string): TokenRecord | null {
  const row = db
    .query("SELECT * FROM tokens WHERE token = ? AND revoked = 0")
    .get(token) as RawRow | null;
  return row ? fromRow(row) : null;
}

export interface CreateTokenInput {
  label: string;
  token: string;
  upstreamKey?: string;
  allowedModels?: string[];
  rpmLimit?: number;
  createdBy?: string;
  policyName?: string;
}

export function upsertToken(db: DB, input: CreateTokenInput): TokenRecord {
  const now = Math.floor(Date.now() / 1000);
  const existing = getTokenByLabel(db, input.label);

  if (existing) {
    db.run(
      `UPDATE tokens SET
        token = ?, upstream_key = ?, allowed_models = ?,
        rpm_limit = ?, revoked = 0, policy_name = ?
       WHERE label = ?`,
      input.token,
      input.upstreamKey ?? null,
      input.allowedModels ? JSON.stringify(input.allowedModels) : null,
      input.rpmLimit ?? 0,
      input.policyName ?? null,
      input.label
    );
    return getTokenByLabel(db, input.label)!;
  }

  const id = randomUUID();
  db.run(
    `INSERT INTO tokens (id, label, token, upstream_key, allowed_models, rpm_limit, created_at, created_by, policy_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.label,
    input.token,
    input.upstreamKey ?? null,
    input.allowedModels ? JSON.stringify(input.allowedModels) : null,
    input.rpmLimit ?? 0,
    now,
    input.createdBy ?? "api",
    input.policyName ?? null
  );
  return getTokenByLabel(db, input.label)!;
}

export interface UpdateTokenInput {
  upstreamKey?: string | null;
  allowedModels?: string[] | null;
  rpmLimit?: number;
  policyName?: string | null;
}

export function updateToken(
  db: DB,
  label: string,
  updates: UpdateTokenInput
): TokenRecord | null {
  const existing = getTokenByLabel(db, label);
  if (!existing) return null;

  const newUpstreamKey =
    "upstreamKey" in updates ? updates.upstreamKey : existing.upstreamKey;
  const newAllowedModels =
    "allowedModels" in updates ? updates.allowedModels : existing.allowedModels;
  const newRpmLimit = updates.rpmLimit ?? existing.rpmLimit;
  const newPolicyName =
    "policyName" in updates ? updates.policyName : existing.policyName;

  db.run(
    "UPDATE tokens SET upstream_key = ?, allowed_models = ?, rpm_limit = ?, policy_name = ? WHERE label = ?",
    newUpstreamKey ?? null,
    newAllowedModels ? JSON.stringify(newAllowedModels) : null,
    newRpmLimit,
    newPolicyName ?? null,
    label
  );
  return getTokenByLabel(db, label);
}

export function revokeToken(db: DB, label: string): boolean {
  const result = db.run("UPDATE tokens SET revoked = 1 WHERE label = ?", label);
  return result.changes > 0;
}

export function touchToken(db: DB, label: string): void {
  const now = Math.floor(Date.now() / 1000);
  db.run("UPDATE tokens SET last_used_at = ? WHERE label = ?", now, label);
}

/** Returns per-user summary: request counts + last seen from request_log */
export function getUserSummary(db: DB): Array<{
  label: string;
  token: string;
  rpmLimit: number;
  allowedModels: string[] | null;
  policyName: string | null;
  lastUsedAt?: number;
  revoked: boolean;
  requests: number;
  costUsd: number;
  savedUsd: number;
}> {
  const tokens = listTokens(db, true);
  const stats = db
    .query(`
    SELECT user_label, COUNT(*) as reqs, SUM(cost_usd) as cost, SUM(saved_usd) as saved
    FROM request_log GROUP BY user_label
  `)
    .all() as Array<{
    user_label: string;
    reqs: number;
    cost: number;
    saved: number;
  }>;

  const statsByLabel = new Map(stats.map((s) => [s.user_label, s]));

  return tokens.map((t) => {
    const s = statsByLabel.get(t.label);
    return {
      label: t.label,
      token: `${t.token.slice(0, 8)}••••••••`, // mask for safety
      rpmLimit: t.rpmLimit,
      allowedModels: t.allowedModels ?? null,
      policyName: t.policyName ?? null,
      lastUsedAt: t.lastUsedAt,
      revoked: t.revoked,
      requests: s?.reqs ?? 0,
      costUsd: s?.cost ?? 0,
      savedUsd: s?.saved ?? 0,
    };
  });
}
