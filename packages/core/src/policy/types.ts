export type DlpPattern =
  | "credit_card"
  | "ssn"
  | "iban"
  | "api_key"
  | "email"
  | "phone"
  | "passport";

export interface CustomPattern {
  name: string;
  regex: string;
}

export interface DlpConfig {
  enabled: boolean;
  detect: DlpPattern[];
  customPatterns: CustomPattern[];
  action: "block" | "redact" | "log";
}

export interface PromptGuardConfig {
  enabled: boolean;
  blockThreshold: number; // 0–1, default 0.75
}

export interface SystemPromptLockConfig {
  prepend?: string;
  append?: string;
}

export interface OutputFilterConfig {
  enabled: boolean;
  redactPII: boolean;
}

export interface Policy {
  name?: string;
  dlp?: Partial<DlpConfig>;
  promptGuard?: Partial<PromptGuardConfig>;
  systemPromptLock?: SystemPromptLockConfig;
  outputFilter?: Partial<OutputFilterConfig>;
  allowedProviders?: string[];
  logging?: {
    storeContent?: boolean;
    retentionDays?: number;
  };
}

// ── Result types ─────────────────────────────────────────────────────────────

export interface DlpResult {
  blocked: boolean;
  violations: string[];
  action: "block" | "redact" | "log";
}

export interface GuardResult {
  blocked: boolean;
  score: number;
  matches: string[];
}

// ── Error ─────────────────────────────────────────────────────────────────────

export class PolicyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly detail?: Record<string, unknown>
  ) {
    super(message);
    this.name = "PolicyError";
  }
}
