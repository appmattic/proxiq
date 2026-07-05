import { cosmiconfig } from "cosmiconfig";
import { TypeScriptLoader } from "cosmiconfig-typescript-loader";
import { ConfigSchema } from "./schema.js";
import type { Config } from "./schema.js";
import { resolveConfigSecrets } from "../secrets/index.js";

const MODULE_NAME = "proxiq";

export async function loadConfig(configPath?: string): Promise<Config> {
  const explorer = cosmiconfig(MODULE_NAME, {
    searchPlaces: [
      `${MODULE_NAME}.config.ts`,
      `${MODULE_NAME}.config.js`,
      `.${MODULE_NAME}.json`,
      `.${MODULE_NAME}.yaml`,
      `.${MODULE_NAME}.yml`,
      "package.json",
    ],
    loaders: { ".ts": TypeScriptLoader() },
  });

  let raw: unknown = {};

  if (configPath) {
    const result = await explorer.load(configPath);
    if (result) raw = result.config as unknown;
  } else {
    const result = await explorer.search();
    if (result) raw = result.config as unknown;
  }

  raw = applyEnvOverrides(raw as Record<string, unknown>);

  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid Proxiq configuration:\n${issues}`);
  }

  return resolveConfigSecrets(parsed.data);
}

export function validateConfig(raw: unknown): Config {
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid Proxiq configuration:\n${issues}`);
  }
  return parsed.data;
}

function applyEnvOverrides(raw: Record<string, unknown>): Record<string, unknown> {
  const overrides: Record<string, unknown> = { ...raw };

  if (process.env["PROXIQ_PORT"]) overrides["port"] = Number(process.env["PROXIQ_PORT"]);
  if (process.env["PROXIQ_HOST"]) overrides["host"] = process.env["PROXIQ_HOST"];

  if (process.env["PROXIQ_LOG_LEVEL"]) {
    overrides["logging"] = {
      ...(overrides["logging"] as Record<string, unknown> | undefined),
      level: process.env["PROXIQ_LOG_LEVEL"],
    };
  }

  if (process.env["PROXIQ_STORAGE_PATH"]) {
    overrides["cache"] = {
      ...(overrides["cache"] as Record<string, unknown> | undefined),
      storagePath: process.env["PROXIQ_STORAGE_PATH"],
    };
  }

  if (process.env["PROXIQ_DOCKER"] === "true" && !process.env["PROXIQ_HOST"]) {
    overrides["host"] = "0.0.0.0";
  }

  return overrides;
}
