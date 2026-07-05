import { randomUUID } from "node:crypto";
import type { RelayMiddleware, RelayRequest, RelayResponse } from "../types.js";
import type { DB } from "../../storage/sqlite.js";

export function createMetricsMiddleware(db: DB): RelayMiddleware {
  const insert = db.prepare(`
    INSERT INTO request_log
      (id, request_id, provider, model, input_tokens, output_tokens,
       duration_ms, from_cache, cache_source, compressed, created_at,
       original_model, routed_model, routing_method, routing_tier,
       cost_usd, saved_usd, user_label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  return {
    name: "proxiq:metrics",
    priority: 10,

    async onResponse(res: RelayResponse, req: RelayRequest): Promise<RelayResponse> {
      try {
        insert.run(
          randomUUID(),
          req.id,
          res.provider,
          res.model,
          res.inputTokens,
          res.outputTokens,
          res.durationMs,
          res.fromCache ? 1 : 0,
          res.cacheSource ?? null,
          res.compressed ? 1 : 0,
          Math.floor(Date.now() / 1000),
          res.originalModel,
          res.routedModel,
          res.routingMethod,
          res.routingTier,
          res.costUsd,
          res.savedUsd,
          req.userLabel ?? "anonymous"
        );
      } catch {
        // Never fail a request due to metrics write error
      }
      return res;
    },
  };
}
