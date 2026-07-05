import { applyRules } from "./rules.js";
import { classifyWithHaiku } from "./classifier.js";
import type { Config } from "../config/schema.js";

// Parameters that must be stripped per model family.
// Claude Code sends `output_config: { effort: "high" }` for extended thinking — Haiku doesn't support it.
// "effort" (top-level) is also stripped universally as a safety net.
const UNIVERSAL_UNSUPPORTED = new Set(["effort"]);
const HAIKU_UNSUPPORTED = new Set(["effort", "thinking", "budget_tokens", "betas", "output_config", "context_management"]);

function sanitizeBody(body: Record<string, unknown>, model?: string): Record<string, unknown> {
  const isHaiku = model?.includes("haiku") ?? false;
  const unsupported = isHaiku ? HAIKU_UNSUPPORTED : UNIVERSAL_UNSUPPORTED;

  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!unsupported.has(k)) cleaned[k] = v;
  }
  return cleaned;
}

export type Tier = "simple" | "standard" | "complex";

export interface ClassificationResult {
  tier: Tier;
  method: "header" | "rule" | "classifier" | "default";
  model: string;
}

export interface RouterOutput {
  body: Record<string, unknown>;
  result: ClassificationResult;
}

/**
 * Apply intent-based model routing.
 *
 * If routing.mode is "off" and no x-proxiq-tier header is present,
 * passes body through unchanged.
 *
 * @param tierOverride Value of x-proxiq-tier request header, or null
 */
export async function applyModelRouter(
  body: Record<string, unknown>,
  config: Config,
  tierOverride: string | null
): Promise<RouterOutput> {
  if (config.routing.mode === "off" && !tierOverride) {
    const model = (body["model"] as string) ?? config.routing.tiers.standard;
    return { body: sanitizeBody(body, model), result: { tier: "standard", method: "default", model } };
  }

  // 1. Explicit header override
  if (tierOverride && ["simple", "standard", "complex"].includes(tierOverride)) {
    const tier = tierOverride as Tier;
    const model = config.routing.tiers[tier];
    return {
      body: sanitizeBody({ ...body, model }, model),
      result: { tier, method: "header", model },
    };
  }

  // Extract last user message for rule/classifier evaluation
  const messages = (body["messages"] as Array<{ role: string; content: unknown }>) ?? [];
  const lastUser = messages.filter((m) => m.role === "user").at(-1);
  const lastUserText =
    typeof lastUser?.content === "string"
      ? lastUser.content
      : JSON.stringify(lastUser?.content ?? "");

  // 2. Keyword rules
  const ruleTier = applyRules(lastUserText, config.routing.rules);
  if (ruleTier) {
    const model = config.routing.tiers[ruleTier];
    return {
      body: sanitizeBody({ ...body, model }, model),
      result: { tier: ruleTier, method: "rule", model },
    };
  }

  // 3. Haiku classifier (auto mode only)
  if (config.routing.mode === "auto") {
    const apiKey = config.routing.classifierApiKey ?? "";
    if (apiKey) {
      const classifiedTier = await classifyWithHaiku(lastUserText, apiKey);
      const model = config.routing.tiers[classifiedTier];
      return {
        body: sanitizeBody({ ...body, model }, model),
        result: { tier: classifiedTier, method: "classifier", model },
      };
    }
  }

  const defaultModel = (body["model"] as string) ?? config.routing.tiers.standard;
  return { body: sanitizeBody(body, defaultModel), result: { tier: "standard", method: "default", model: defaultModel } };
}

export function routingHeaders(result: ClassificationResult): Record<string, string> {
  return {
    "x-proxiq-routed-tier": result.tier,
    "x-proxiq-routed-model": result.model,
    "x-proxiq-routed-method": result.method,
  };
}
