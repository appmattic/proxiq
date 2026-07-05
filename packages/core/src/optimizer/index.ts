import type { Config } from "../config/schema.js";
import type { RelayLogger } from "../utils/logger.js";
import { compressContext } from "./compressor.js";
import { injectPromptCache } from "./prompt-cache.js";

export interface OptimizerPipeline {
  optimize(
    body: Record<string, unknown>,
    config: Config,
    provider: string,
    authHeader: string
  ): Promise<{ body: Record<string, unknown>; compressed: boolean }>;
}

export function createOptimizer(logger: RelayLogger): OptimizerPipeline {
  return {
    async optimize(body, config, provider, authHeader) {
      let result = { ...body };
      let compressed = false;

      // Anthropic prompt cache injection
      if (config.optimizer.promptCache.enabled && provider === "anthropic") {
        result = injectPromptCache(result);
      }

      // Context compression (all providers)
      if (config.optimizer.compression.enabled) {
        const messages = result.messages as
          | Array<{ role: string; content: unknown }>
          | undefined;
        if (messages && messages.length > 0) {
          const { messages: compressedMessages, compressed: wasCompressed } =
            await compressContext(messages, config, authHeader, logger);
          result.messages = compressedMessages;
          compressed = wasCompressed;
        }
      }

      return { body: result, compressed };
    },
  };
}
