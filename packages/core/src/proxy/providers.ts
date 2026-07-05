import type { Config } from "../config/schema.js";

const PROVIDER_BASE_URLS: Record<string, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
  groq: "https://api.groq.com/openai",
  perplexity: "https://api.perplexity.ai",
  mistral: "https://api.mistral.ai",
  together: "https://api.together.xyz",
  fireworks: "https://api.fireworks.ai/inference",
  deepinfra: "https://api.deepinfra.com/v1/openai",
  anyscale: "https://api.endpoints.anyscale.com/v1",
  ollama: "http://127.0.0.1:11434",
  lmstudio: "http://127.0.0.1:1234",
  gemini: "https://generativelanguage.googleapis.com",
};

/**
 * Resolve the provider from:
 *   1. x-proxiq-provider request header
 *   2. Auto-detect from Authorization header prefix (sk-ant- → anthropic)
 *   3. Default from config
 *
 * @param headerProvider Value of the x-proxiq-provider header, if present
 */
export function resolveProvider(
  headerProvider: string | undefined,
  _bodyModel: string,
  authHeader: string,
  config: Config
): string {
  if (headerProvider && headerProvider in PROVIDER_BASE_URLS)
    return headerProvider;
  if (headerProvider === "custom") return "custom";

  // Auto-detect from key prefix
  if (authHeader.startsWith("sk-ant-")) return "anthropic";
  if (authHeader.startsWith("gsk_")) return "groq";

  return config.providers.default;
}

export function buildProviderUrl(
  provider: string,
  path: string,
  config: Config
): string {
  if (provider === "azure-openai") {
    const az = config.providers.azureOpenai;
    if (!az?.resourceName)
      throw new Error(
        "azure-openai requires providers.azureOpenai.resourceName"
      );
    const base = `https://${az.resourceName}.openai.azure.com/openai`;
    return `${base}${path}?api-version=${az.apiVersion}`;
  }

  if (provider === "custom") {
    const base = config.providers.custom?.baseUrl ?? "http://127.0.0.1:8080";
    return `${base}${path}`;
  }

  const base = PROVIDER_BASE_URLS[provider] ?? PROVIDER_BASE_URLS.anthropic!;
  return `${base}${path}`;
}
