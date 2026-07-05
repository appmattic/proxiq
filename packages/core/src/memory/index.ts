import type { Config } from "../config/schema.js";
import type { DB } from "../storage/sqlite.js";
import type { RelayLogger } from "../utils/logger.js";
import type { Embedder } from "./embedder.js";
import { createMemoryStore } from "./store.js";

export type { Embedder };
export { createEmbedder } from "./embedder.js";

export interface MemoryEngine {
  inject(
    sessionId: string,
    body: Record<string, unknown>
  ): Promise<Record<string, unknown>>;
  record(
    sessionId: string,
    userContent: string,
    assistantContent: string
  ): Promise<void>;
  purgeExpired(): number;
}

export function createMemoryEngine(
  config: Config,
  db: DB,
  embedder: Embedder | null,
  logger: RelayLogger
): MemoryEngine {
  const store = createMemoryStore(db);

  return {
    async inject(sessionId, body) {
      if (!config.memory.enabled || !sessionId) return body;

      const turns = store.recall(sessionId, config.memory.topK);
      if (turns.length === 0) return body;

      const contextMessages = turns
        .slice()
        .reverse()
        .map((t) => ({ role: t.role, content: t.content }));

      const messages = (body.messages as unknown[]) ?? [];
      const injected = [...contextMessages, ...messages];

      logger.debug(
        { sessionId, injectedTurns: turns.length },
        "[memory] injected context"
      );
      return { ...body, messages: injected };
    },

    async record(sessionId, userContent, assistantContent) {
      if (!config.memory.enabled || !sessionId) return;

      const userEmb = embedder
        ? await embedder.embed(userContent).catch(() => null)
        : null;
      const asstEmb = embedder
        ? await embedder.embed(assistantContent).catch(() => null)
        : null;

      store.addTurn(sessionId, "user", userContent, userEmb);
      store.addTurn(sessionId, "assistant", assistantContent, asstEmb);
    },

    purgeExpired() {
      const cutoff =
        Math.floor(Date.now() / 1000) - config.memory.sessionTtlSeconds;
      return store.purgeOlderThan(cutoff);
    },
  };
}
