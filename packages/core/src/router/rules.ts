import type { Config } from "../config/schema.js";

export type Tier = "simple" | "standard" | "complex";

/**
 * Evaluates static keyword rules against the last user message.
 * Rules are checked in order — first match wins.
 *
 *   1. Explicit x-proxiq-tier header (handled upstream)
 *   2. Keyword rules (this function)
 *   3. Haiku classifier (if mode = "auto")
 */
export function applyRules(
  lastUserMessage: string,
  rules: Config["routing"]["rules"]
): Tier | null {
  const lower = lastUserMessage.toLowerCase();

  for (const rule of rules) {
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        return rule.tier;
      }
    }
  }

  return null;
}
