import pino from "pino";
import pretty from "pino-pretty";
import type { Config } from "../config/schema.js";

export type RelayLogger = pino.Logger;

export function createLogger(config: Config): RelayLogger {
  if (config.logging.format === "pretty") {
    const stream = pretty({ colorize: true, ignore: "pid,hostname" });
    return pino({ level: config.logging.level }, stream);
  }
  return pino({ level: config.logging.level });
}

export function bootstrapLogger(): RelayLogger {
  const stream = pretty({ colorize: true, ignore: "pid,hostname" });
  return pino({ level: "info" }, stream);
}
