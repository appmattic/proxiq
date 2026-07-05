import { ConfigSchema } from "./schema.js";
import type { Config } from "./schema.js";

export const DEFAULT_CONFIG: Config = ConfigSchema.parse({});
