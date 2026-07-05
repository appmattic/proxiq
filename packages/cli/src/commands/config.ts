import { writeFileSync, readFileSync, existsSync } from "node:fs";
import type { Command } from "commander";
import { loadConfig, validateConfig } from "@proxiq/core";

const DEFAULT_CONFIG_PATH = ".proxiq.json";

const EXAMPLE_CONFIG = {
  port: 3099,
  host: "127.0.0.1",
  providers: { default: "anthropic" },
  cache: {
    enabled: true,
    exact: { enabled: true, ttlSeconds: 86400 },
    semantic: { enabled: false, similarityThreshold: 0.94 },
    storagePath: ".proxiq/cache.db",
  },
  optimizer: {
    promptCache: { enabled: true },
    compression: { enabled: false },
  },
  routing: {
    mode: "off",
    classifierApiKey: "env:ANTHROPIC_API_KEY",
  },
  logging: { level: "info", format: "pretty" },
  cloud: { enabled: false },
};

export function registerConfig(program: Command): void {
  const configCmd = program.command("config").description("Manage Proxiq configuration");

  configCmd
    .command("init")
    .description(`Create a default ${DEFAULT_CONFIG_PATH}`)
    .option("-o, --out <path>", "Output path", DEFAULT_CONFIG_PATH)
    .action((opts: { out: string }) => {
      if (existsSync(opts.out)) {
        console.error(`${opts.out} already exists. Delete it first or specify a different path.`);
        process.exit(1);
      }
      writeFileSync(opts.out, JSON.stringify(EXAMPLE_CONFIG, null, 2) + "\n", "utf-8");
      console.log(`Created ${opts.out}`);
    });

  configCmd
    .command("validate")
    .description("Validate the current config file")
    .option("-c, --config <path>", "Config path", DEFAULT_CONFIG_PATH)
    .action((opts: { config: string }) => {
      try {
        const raw = JSON.parse(readFileSync(opts.config, "utf-8"));
        validateConfig(raw);
        console.log(`✓ ${opts.config} is valid.`);
      } catch (err) {
        console.error(`✗ ${(err as Error).message}`);
        process.exit(1);
      }
    });

  configCmd
    .command("show")
    .description("Print the resolved configuration")
    .option("-c, --config <path>", "Config path")
    .action(async (opts: { config?: string }) => {
      try {
        const config = await loadConfig(opts.config);
        // Redact secrets before printing
        const safe = JSON.parse(JSON.stringify(config));
        if (safe.routing?.classifierApiKey) safe.routing.classifierApiKey = "[redacted]";
        if (safe.cloud?.apiKey) safe.cloud.apiKey = "[redacted]";
        console.log(JSON.stringify(safe, null, 2));
      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });
}
