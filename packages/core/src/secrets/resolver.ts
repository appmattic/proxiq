import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { Config } from "../config/schema.js";

/**
 * Secret reference prefixes supported in Phase 1 (zero external dependencies).
 *
 *   env:VAR_NAME       → process.env["VAR_NAME"]
 *   file:/abs/path     → contents of file at absolute path (trimmed)
 *   file:relative/path → contents of file relative to cwd (trimmed)
 *
 * Phase 2 (planned):
 *   azure-keyvault:https://vault.azure.net/secrets/name
 *   aws-secrets:arn:aws:secretsmanager:...
 *   vault:secret/data/path#field
 *   doppler:VAR_NAME
 *   op:vault/item/field
 */

const RAW_KEY_PATTERNS: RegExp[] = [
  /^sk-ant-/,              // Anthropic
  /^sk-[A-Za-z0-9]{20,}/, // OpenAI / OpenAI-compat
  /^gsk_/,                 // Groq
  /^AIzaSy/,               // Google
  /^xai-/,                 // xAI
  /^r8_/,                  // Replicate
  /^ft::/,                 // OpenAI fine-tune
];

function looksLikeRawKey(value: string): boolean {
  return RAW_KEY_PATTERNS.some((p) => p.test(value));
}

export async function resolveSecret(
  value: string | undefined,
  fieldPath = "config field"
): Promise<string | undefined> {
  if (value === undefined || value === "") return value;

  // env: prefix
  if (value.startsWith("env:")) {
    const varName = value.slice(4).trim();
    if (!varName) {
      throw new Error(
        `[secrets] ${fieldPath}: env: prefix requires a variable name (e.g. env:ANTHROPIC_API_KEY)`
      );
    }
    const resolved = process.env[varName];
    if (!resolved) {
      throw new Error(
        `[secrets] ${fieldPath}: environment variable "${varName}" is not set.\n` +
        `  Set it before starting Proxiq: export ${varName}=your-key`
      );
    }
    return resolved;
  }

  // file: prefix
  if (value.startsWith("file:")) {
    const rawPath = value.slice(5).trim();
    if (!rawPath) {
      throw new Error(
        `[secrets] ${fieldPath}: file: prefix requires a path (e.g. file:/run/secrets/api-key)`
      );
    }
    const resolvedPath = isAbsolute(rawPath) ? rawPath : join(process.cwd(), rawPath);
    try {
      return readFileSync(resolvedPath, "utf-8").trim();
    } catch (err) {
      throw new Error(
        `[secrets] ${fieldPath}: cannot read secret file "${resolvedPath}": ${(err as NodeJS.ErrnoException).message}`
      );
    }
  }

  // Phase 2 stubs
  const phase2Prefixes = ["azure-keyvault:", "aws-secrets:", "vault:", "doppler:", "op:"];
  for (const prefix of phase2Prefixes) {
    if (value.startsWith(prefix)) {
      throw new Error(
        `[secrets] ${fieldPath}: "${prefix}" secret provider is planned for Phase 2 and not yet available.\n` +
        `  Use env: or file: for now. See https://proxiq.io/docs/secrets`
      );
    }
  }

  // Warn on raw keys
  if (looksLikeRawKey(value)) {
    console.warn(
      `\n⚠️  Proxiq security warning: ${fieldPath} contains what looks like a raw API key.\n` +
      `   Storing secrets in config files is risky. Consider:\n` +
      `     env: reference  →  "${fieldPath}": "env:ANTHROPIC_API_KEY"\n` +
      `     file: reference →  "${fieldPath}": "file:/run/secrets/api-key"\n`
    );
  }

  return value;
}

export async function resolveConfigSecrets(config: Config): Promise<Config> {
  const [classifierApiKey, cloudApiKey] = await Promise.all([
    resolveSecret(config.routing.classifierApiKey, "routing.classifierApiKey"),
    resolveSecret(config.cloud.apiKey, "cloud.apiKey"),
  ]);

  // Resolve per-provider keys (e.g. env:ANTHROPIC_API_KEY)
  const resolvedKeys: Record<string, string> = {};
  for (const [provider, keyRef] of Object.entries(config.providers.keys)) {
    const resolved = await resolveSecret(keyRef, `providers.keys.${provider}`);
    if (resolved) resolvedKeys[provider] = resolved;
  }

  return {
    ...config,
    providers: { ...config.providers, keys: resolvedKeys },
    routing: { ...config.routing, classifierApiKey },
    cloud: { ...config.cloud, apiKey: cloudApiKey },
  };
}
