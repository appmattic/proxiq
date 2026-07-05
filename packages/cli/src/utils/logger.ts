import { createLogger as coreCreateLogger } from "@proxiq/core";
import type { RelayLogger } from "@proxiq/core";
import type { Config } from "@proxiq/core";

export type { RelayLogger };

export function createLogger(config: Config): RelayLogger {
  return coreCreateLogger(config);
}
