import type { RelayMiddleware, RelayRequest, RelayResponse } from "../types.js";
import type { RelayLogger } from "../../utils/logger.js";

export function createLoggerMiddleware(
  logger: RelayLogger,
  includePrompts: boolean
): RelayMiddleware {
  return {
    name: "proxiq:logger",
    priority: 20,

    async onRequest(req: RelayRequest): Promise<RelayRequest> {
      const log: Record<string, unknown> = {
        requestId: req.id,
        provider: req.provider,
        model: req.model,
        sessionId: req.sessionId,
      };
      if (includePrompts) log["body"] = req.body;
      logger.info(log, "→ proxiq request");
      return req;
    },

    async onResponse(res: RelayResponse, req: RelayRequest): Promise<RelayResponse> {
      logger.info(
        {
          requestId: req.id,
          provider: res.provider,
          model: res.model,
          fromCache: res.fromCache,
          cacheSource: res.cacheSource,
          compressed: res.compressed,
          inputTokens: res.inputTokens,
          outputTokens: res.outputTokens,
          durationMs: res.durationMs,
        },
        "← proxiq response"
      );
      return res;
    },

    async onError(err: Error, req: RelayRequest): Promise<void> {
      logger.error({ requestId: req.id, err: err.message }, "proxiq error");
    },
  };
}
