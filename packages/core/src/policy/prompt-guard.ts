import type { GuardResult, PromptGuardConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Weighted injection / jailbreak pattern library
// weight: confidence that this pattern indicates an attack (0–1)
// ---------------------------------------------------------------------------

interface ScoredPattern {
  re: RegExp;
  weight: number;
  label: string;
}

const PATTERNS: ScoredPattern[] = [
  // ── Instruction override ─────────────────────────────────────────────────
  {
    re: /ignore\s+(all\s+)?previous\s+instructions?/i,
    weight: 0.95,
    label: "instruction-override",
  },
  {
    re: /disregard\s+(your\s+)?(all\s+|previous\s+)?instructions?/i,
    weight: 0.9,
    label: "instruction-override",
  },
  {
    re: /forget\s+(everything|all|your\s+(previous\s+)?instructions?)/i,
    weight: 0.9,
    label: "instruction-override",
  },
  {
    re: /override\s+(your\s+)?(system\s+)?(prompt|instructions?)/i,
    weight: 0.9,
    label: "system-override",
  },
  {
    re: /new\s+(task|instructions?|objective|directive)\s*:/i,
    weight: 0.7,
    label: "instruction-override",
  },
  {
    re: /from\s+now\s+on[,\s]+you\s+(will|must|should)/i,
    weight: 0.7,
    label: "instruction-override",
  },

  // ── Role hijacking ───────────────────────────────────────────────────────
  { re: /you\s+are\s+now\s+(a|an)\s+/i, weight: 0.75, label: "role-hijack" },
  {
    re: /act\s+as\s+(if\s+you('re|\s+are)\s+)?(a|an)\s+/i,
    weight: 0.65,
    label: "role-hijack",
  },
  {
    re: /pretend\s+(you\s+)?(have\s+no\s+restrictions|are\s+(un)?restricted|are\s+a\s+different)/i,
    weight: 0.9,
    label: "restriction-bypass",
  },
  {
    re: /you\s+have\s+no\s+(ethical\s+|safety\s+)?restrictions?/i,
    weight: 0.9,
    label: "restriction-bypass",
  },
  {
    re: /your\s+(true\s+|real\s+)?(self|personality|identity)\s+is/i,
    weight: 0.75,
    label: "role-hijack",
  },

  // ── Jailbreak fingerprints ───────────────────────────────────────────────
  { re: /\bDAN\b/, weight: 0.8, label: "jailbreak-dan" },
  { re: /do\s+anything\s+now/i, weight: 0.9, label: "jailbreak-dan" },
  {
    re: /developer\s+mode\s+(enabled|on|activated)/i,
    weight: 0.85,
    label: "jailbreak-devmode",
  },
  { re: /\bjailbreak\b/i, weight: 0.8, label: "jailbreak" },
  { re: /grandma\s+(trick|exploit|bypass)/i, weight: 0.75, label: "jailbreak" },
  {
    re: /hypothetically\s+(speaking[,\s]+)?(if\s+you\s+(were|had|could))/i,
    weight: 0.6,
    label: "jailbreak-hypothetical",
  },
  {
    re: /in\s+a\s+(fictional|hypothetical)\s+scenario\s+where\s+you\s+have\s+no/i,
    weight: 0.75,
    label: "jailbreak-fictional",
  },

  // ── System prompt exfiltration ───────────────────────────────────────────
  {
    re: /repeat\s+(everything|all\s+(content|text))\s+(above|before|in\s+your\s+system\s+prompt)/i,
    weight: 0.9,
    label: "exfiltration",
  },
  {
    re: /reveal\s+(your\s+)?(full\s+)?(system\s+prompt|instructions?)/i,
    weight: 0.9,
    label: "exfiltration",
  },
  {
    re: /print\s+(your\s+)?(system\s+prompt|internal\s+instructions?|context)/i,
    weight: 0.85,
    label: "exfiltration",
  },
  {
    re: /what\s+(are\s+your\s+(exact\s+)?instructions?|is\s+your\s+system\s+prompt)/i,
    weight: 0.7,
    label: "exfiltration",
  },
  {
    re: /output\s+(everything|all\s+text)\s+(before|above)\s+(this|the\s+user)/i,
    weight: 0.85,
    label: "exfiltration",
  },
  {
    re: /show\s+me\s+your\s+(full\s+)?(system\s+prompt|prompt|configuration)/i,
    weight: 0.8,
    label: "exfiltration",
  },

  // ── Structural / tag injection ───────────────────────────────────────────
  { re: /<\s*\/?\s*system\s*>/i, weight: 0.8, label: "structural-injection" },
  {
    re: /###\s*(system|instructions?|prompt)\b/i,
    weight: 0.75,
    label: "structural-injection",
  },
  { re: /\[SYSTEM\]/, weight: 0.7, label: "structural-injection" },
  {
    re: /---\s*(system|instructions?)\s*---/i,
    weight: 0.7,
    label: "structural-injection",
  },
  {
    re: /<\|im_start\|>\s*system/i,
    weight: 0.85,
    label: "structural-injection",
  },
  { re: /\{system\}/i, weight: 0.65, label: "structural-injection" },
];

// ---------------------------------------------------------------------------
// Detection — weighted max scoring
// ---------------------------------------------------------------------------

export function detectInjection(
  text: string,
  config: Partial<PromptGuardConfig>
): GuardResult {
  const threshold = config.blockThreshold ?? 0.75;
  let maxScore = 0;
  const matches: string[] = [];

  for (const p of PATTERNS) {
    if (p.re.test(text)) {
      if (p.weight > maxScore) maxScore = p.weight;
      if (!matches.includes(p.label)) matches.push(p.label);
    }
  }

  return {
    blocked: maxScore >= threshold,
    score: Math.round(maxScore * 100) / 100,
    matches,
  };
}
