export { VERSION } from "./utils/version.js";
export { createLogger, bootstrapLogger } from "./utils/logger.js";
export type { RelayLogger } from "./utils/logger.js";

export { applyModelRouter, routingHeaders } from "./router/index.js";
export type { Tier, ClassificationResult } from "./router/index.js";

export { createProxy } from "./proxy/index.js";
export type { ProxyServer } from "./proxy/index.js";

export { createCache, normalizeRequest } from "./cache/index.js";
export type { ICache, CacheResult, NormalizedRequest } from "./cache/index.js";

export { createOptimizer } from "./optimizer/index.js";
export type { OptimizerPipeline } from "./optimizer/index.js";

export { createMemoryEngine, createEmbedder } from "./memory/index.js";
export type { MemoryEngine } from "./memory/index.js";

export {
  createMiddlewareRegistry,
  createMetricsMiddleware,
  createLoggerMiddleware,
} from "./middleware/index.js";
export type {
  RelayMiddleware,
  RelayRequest,
  RelayResponse,
  MiddlewareRegistry,
} from "./middleware/types.js";

export { initDatabase, getCacheStats, purgeExpiredCache } from "./storage/sqlite.js";
export type { DB } from "./storage/sqlite.js";

export { loadConfig, validateConfig, DEFAULT_CONFIG } from "./config/index.js";
export type { Config } from "./config/schema.js";

export { resolveSecret, resolveConfigSecrets } from "./secrets/index.js";

export { createAuthResolver, checkRpmLimit } from "./auth/index.js";
export type { AuthResolver, TokenIdentity } from "./auth/index.js";

export { getStats, purgeOldLogs } from "./storage/sqlite.js";
export type { StatsPeriod, PeriodStats, RoutingSwitch } from "./storage/sqlite.js";

export {
  listTokens, upsertToken, updateToken, revokeToken, getUserSummary,
} from "./storage/tokens.js";
export type { TokenRecord, CreateTokenInput, UpdateTokenInput } from "./storage/tokens.js";
