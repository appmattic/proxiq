import type { DlpConfig, DlpResult } from "./types.js";

// ---------------------------------------------------------------------------
// Built-in PII patterns
// Each entry has a source string (no /g flag) used for both test and replace.
// ---------------------------------------------------------------------------
const BUILTIN_SOURCE: Record<string, string> = {
  credit_card: String.raw`\b(?:4[0-9]{12}(?:[0-9]{3})?|(?:5[1-5]|2(?:2[2-9]|[3-6][0-9]|7[01]))[0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})\b`,
  ssn:         String.raw`\b\d{3}[-. ]?\d{2}[-. ]?\d{4}\b`,
  iban:        String.raw`\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}(?:[A-Z0-9]{0,16})\b`,
  api_key:     String.raw`\b(?:sk-[a-zA-Z0-9]{20,}|sk-ant-(?:api\d{2}-)?[a-zA-Z0-9_\-]{20,}|proxiq_[a-f0-9]{16,}|ghp_[a-zA-Z0-9]{36}|xoxb-[0-9]+-[a-zA-Z0-9_\-]+)\b`,
  email:       String.raw`\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b`,
  phone:       String.raw`\b(?:\+?1[-. ]?)?\(?[0-9]{3}\)?[-. ]?[0-9]{3}[-. ]?[0-9]{4}\b`,
  passport:    String.raw`\b[A-Z]{1,2}[0-9]{6,9}\b`,
};

const REDACT_LABELS: Record<string, string> = {
  credit_card: "[CREDIT-CARD-REDACTED]",
  ssn:         "[SSN-REDACTED]",
  iban:        "[IBAN-REDACTED]",
  api_key:     "[API-KEY-REDACTED]",
  email:       "[EMAIL-REDACTED]",
  phone:       "[PHONE-REDACTED]",
  passport:    "[PASSPORT-REDACTED]",
};

// ---------------------------------------------------------------------------
// Scan — returns violations found in text
// ---------------------------------------------------------------------------

export function scanDLP(text: string, config: Partial<DlpConfig>): DlpResult {
  const detect = config.detect ?? [];
  const customPatterns = config.customPatterns ?? [];
  const action = config.action ?? "block";
  const violations: string[] = [];

  for (const name of detect) {
    const src = BUILTIN_SOURCE[name];
    if (!src) continue;
    if (new RegExp(src, "i").test(text)) violations.push(name);
  }

  for (const custom of customPatterns) {
    try {
      if (new RegExp(custom.regex).test(text)) violations.push(custom.name);
    } catch {
      // Invalid regex — skip silently
    }
  }

  return {
    blocked: violations.length > 0 && action === "block",
    violations,
    action,
  };
}

// ---------------------------------------------------------------------------
// Redact — replaces matches in-place (used when action = "redact")
// ---------------------------------------------------------------------------

export function redactDLP(text: string, config: Partial<DlpConfig>): string {
  const detect = config.detect ?? [];
  let result = text;

  for (const name of detect) {
    const src = BUILTIN_SOURCE[name];
    if (!src) continue;
    const label = REDACT_LABELS[name] ?? "[REDACTED]";
    result = result.replace(new RegExp(src, "gi"), label);
  }

  for (const custom of (config.customPatterns ?? [])) {
    try {
      result = result.replace(new RegExp(custom.regex, "g"), `[${custom.name.toUpperCase()}-REDACTED]`);
    } catch {
      // skip
    }
  }

  return result;
}
