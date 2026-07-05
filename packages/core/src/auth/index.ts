import { resolveSecret } from "../secrets/index.js";
import { upsertToken, getTokenByValue, touchToken } from "../storage/tokens.js";
import type { DB } from "../storage/sqlite.js";
import type { Config } from "../config/schema.js";

export interface TokenIdentity {
  label: string;
  /** Resolved upstream API key (overrides global provider key if set). */
  upstreamKey?: string;
  allowedModels?: string[];
  rpmLimit: number;
}

export interface AuthResolver {
  /** Resolve a raw token string to an identity, or null if invalid. */
  resolve(token: string): TokenIdentity | null;
  /** Whether auth is required (unauthenticated requests rejected). */
  required: boolean;
  /** Identity used when auth is not required and no token is provided. */
  anonymous: TokenIdentity;
}

const ANONYMOUS: TokenIdentity = { label: "anonymous", rpmLimit: 0 };

const RPM_WINDOWS = new Map<string, { count: number; windowStart: number }>();

/** Check + increment RPM counter. Returns true if the request is allowed. */
export function checkRpmLimit(label: string, limit: number): boolean {
  if (limit === 0) return true;
  const now = Date.now();
  const window = RPM_WINDOWS.get(label) ?? { count: 0, windowStart: now };
  if (now - window.windowStart > 60_000) {
    window.count = 1;
    window.windowStart = now;
    RPM_WINDOWS.set(label, window);
    return true;
  }
  window.count++;
  RPM_WINDOWS.set(label, window);
  return window.count <= limit;
}

/**
 * Build an AuthResolver from config.
 *
 * - Seeds the tokens DB from config.auth.tokens[] (idempotent upsert).
 * - Resolves each token value (env: refs) eagerly at startup.
 * - resolve() does a live DB lookup so tokens added via the admin API
 *   are recognised immediately without restart.
 * - Calls touchToken() on each resolved request to update last_used_at.
 */
export async function createAuthResolver(config: Config, db: DB): Promise<AuthResolver> {
  // Seed from config — resolve env refs and upsert into DB
  for (const entry of config.auth.tokens) {
    let resolvedToken: string | undefined;
    try {
      resolvedToken = await resolveSecret(entry.token, `auth.tokens[${entry.label}].token`);
    } catch (err) {
      console.warn(`[proxiq:auth] WARNING: skipping token "${entry.label}" — ${(err as Error).message}`);
      continue;
    }
    if (!resolvedToken) {
      console.warn(`[proxiq:auth] WARNING: token for label "${entry.label}" is empty — skipping`);
      continue;
    }

    let resolvedKey: string | undefined;
    if (entry.upstreamKey) {
      try {
        resolvedKey = await resolveSecret(entry.upstreamKey, `auth.tokens[${entry.label}].upstreamKey`) ?? undefined;
      } catch (err) {
        console.warn(`[proxiq:auth] WARNING: upstreamKey for "${entry.label}" unresolved — using global key. ${(err as Error).message}`);
      }
    }

    upsertToken(db, {
      label: entry.label,
      token: resolvedToken,
      upstreamKey: resolvedKey,
      allowedModels: entry.allowedModels,
      rpmLimit: entry.rpmLimit,
      createdBy: "config",
    });
  }

  return {
    required: config.auth.required,
    anonymous: ANONYMOUS,

    resolve(token: string): TokenIdentity | null {
      // Live DB lookup — picks up tokens created via admin API without restart
      const record = getTokenByValue(db, token);
      if (!record) return null;

      // Fire-and-forget touch (non-blocking)
      try { touchToken(db, record.label); } catch { /* ignore */ }

      return {
        label: record.label,
        upstreamKey: record.upstreamKey,
        allowedModels: record.allowedModels,
        rpmLimit: record.rpmLimit,
      };
    },
  };
}
