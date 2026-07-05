import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import type { DB } from "../storage/sqlite.js";
import type { Config } from "../config/schema.js";
import type { RelayLogger } from "../utils/logger.js";

export interface NormalizedRequest {
  provider: string;
  model: string;
  messages: unknown[];
  system?: string;
  hash: string;
}

export interface CacheResult {
  body: unknown;
  source: "exact" | "semantic";
  inputTokens: number;
  outputTokens: number;
}

export interface ICache {
  get(req: NormalizedRequest): Promise<CacheResult | null>;
  set(req: NormalizedRequest, response: unknown, inputTokens: number, outputTokens: number): Promise<void>;
}

export function normalizeRequest(
  body: Record<string, unknown>,
  provider: string
): NormalizedRequest {
  const model = (body["model"] as string) ?? "unknown";
  const messages = (body["messages"] as unknown[]) ?? [];
  const system = body["system"] as string | undefined;

  const hashInput = JSON.stringify({ provider, model, messages, system });
  const hash = createHash("sha256").update(hashInput).digest("hex");

  return { provider, model, messages, system, hash };
}

export function createCache(
  config: Config,
  db: DB,
  _embedder: { embed(text: string): Promise<number[]> } | null,
  logger: RelayLogger
): ICache {
  const getStmt = db.prepare(
    "SELECT response_body, input_tokens, output_tokens FROM cache_entries WHERE request_hash = ? AND (expires_at IS NULL OR expires_at > ?)"
  );
  const insertStmt = db.prepare(
    "INSERT OR REPLACE INTO cache_entries (id, request_hash, response_body, provider, model, input_tokens, output_tokens, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );

  return {
    async get(req: NormalizedRequest): Promise<CacheResult | null> {
      if (!config.cache.enabled || !config.cache.exact.enabled) return null;

      const now = Math.floor(Date.now() / 1000);
      const row = getStmt.get(req.hash, now) as {
        response_body: string;
        input_tokens: number;
        output_tokens: number;
      } | undefined;

      if (!row) return null;

      logger.debug({ hash: req.hash }, "[cache] exact hit");
      return {
        body: JSON.parse(row.response_body),
        source: "exact",
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
      };
    },

    async set(req: NormalizedRequest, response: unknown, inputTokens: number, outputTokens: number): Promise<void> {
      if (!config.cache.enabled || !config.cache.exact.enabled) return;

      const now = Math.floor(Date.now() / 1000);
      const ttl = config.cache.exact.ttlSeconds;
      const expiresAt = ttl > 0 ? now + ttl : null;

      insertStmt.run(
        randomUUID(),
        req.hash,
        JSON.stringify(response),
        req.provider,
        req.model,
        inputTokens,
        outputTokens,
        now,
        expiresAt
      );
    },
  };
}
