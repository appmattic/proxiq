import type { Command } from "commander";
import {
  loadConfig,
  initDatabase,
  createCache,
  createOptimizer,
  createMemoryEngine,
  createMiddlewareRegistry,
  createMetricsMiddleware,
  createLoggerMiddleware,
  createProxy,
  createEmbedder,
  createAuthResolver,
  purgeExpiredCache,
  purgeOldLogs,
  VERSION,
} from "@proxiq/core";
import { createLogger } from "../utils/logger.js";
import { writePidFile, removePidFile } from "../utils/pid.js";

export function registerStart(program: Command): void {
  program
    .command("start")
    .description("Start the Proxiq gateway")
    .option("-p, --port <port>", "Port to listen on (overrides config)", parseInt)
    .option("-H, --host <host>", "Host to bind to (overrides config)")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --detach", "Run as background daemon (not yet implemented)")
    .action(async (opts: { port?: number; host?: string; config?: string; detach?: boolean }) => {
      if (opts.detach) {
        console.error("--detach is not yet implemented. Run with pm2, systemd, or Docker.");
        process.exit(1);
      }

      const config = await loadConfig(opts.config);
      if (opts.port) config.port = opts.port;
      if (opts.host) config.host = opts.host;

      const logger = createLogger(config);
      const db = initDatabase(config.cache.storagePath);

      const needsEmbedder = config.cache.semantic.enabled || config.memory.enabled;
      const embedder = needsEmbedder ? createEmbedder() : null;

      const cache = createCache(config, db, embedder, logger);
      const optimizer = createOptimizer(logger);
      const memory = createMemoryEngine(config, db, embedder, logger);

      const middlewareRegistry = createMiddlewareRegistry();
      middlewareRegistry.register(createMetricsMiddleware(db));
      middlewareRegistry.register(createLoggerMiddleware(logger, config.logging.includePrompts));

      const auth = await createAuthResolver(config, db);
      if (config.auth.required) {
        logger.info({ tokenCount: config.auth.tokens.length }, "[auth] required mode — tokens loaded");
      } else if (config.auth.tokens.length > 0) {
        logger.info({ tokenCount: config.auth.tokens.length }, "[auth] optional mode — tokens loaded");
      }

      const proxy = await createProxy(config, db, cache, middlewareRegistry, optimizer, memory, auth);
      const address = await proxy.start();

      printBanner(config, address);
      writePidFile();
      logger.info(`Proxiq v${VERSION} started on ${address}`);

      const shutdown = async (signal: string) => {
        logger.info({ signal }, "shutting down...");
        await proxy.stop();
        removePidFile();
        db.close();
        process.exit(0);
      };

      process.on("SIGINT", () => void shutdown("SIGINT"));
      process.on("SIGTERM", () => void shutdown("SIGTERM"));

      const PURGE_INTERVAL_MS = 60 * 60 * 1000;
      setInterval(() => {
        const deleted = purgeExpiredCache(db);
        if (deleted > 0) logger.debug({ deleted }, "[cache] purged expired entries");
        const sessionsPurged = memory.purgeExpired();
        if (sessionsPurged > 0) logger.debug({ sessionsPurged }, "[memory] purged expired sessions");
        const logsPurged = purgeOldLogs(db, config.retention.logsDays);
        if (logsPurged > 0) logger.debug({ logsPurged }, "[retention] purged old request logs");
      }, PURGE_INTERVAL_MS);
    });
}

function printBanner(config: import("@proxiq/core").Config, address: string): void {
  const cacheStatus = `exact=${config.cache.exact.enabled ? "enabled" : "disabled"} semantic=${config.cache.semantic.enabled ? "enabled" : "disabled"}`;
  const optimizerStatus = `prompt-cache=${config.optimizer.promptCache.enabled ? "enabled" : "disabled"} compression=${config.optimizer.compression.enabled ? "enabled" : "disabled"}`;

  console.log(`
Proxiq v${VERSION} — Intelligent LLM Gateway
  Listening on  ${address}
  Cache         ${cacheStatus}
  Optimizer     ${optimizerStatus}
  Dashboard     ${address.replace(/\/$/, "")}/proxiq/dashboard
  Admin API     ${address.replace(/\/$/, "")}/proxiq/admin/tokens
`);
}
