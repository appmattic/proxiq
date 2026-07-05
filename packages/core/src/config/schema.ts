import { z } from "zod";

export const ProviderFormatSchema = z.enum(["openai-compatible", "anthropic", "gemini"]);

// ── Policy schema ─────────────────────────────────────────────────────────────

const DlpPatternSchema = z.enum([
  "credit_card", "ssn", "iban", "api_key", "email", "phone", "passport",
]);

const PolicySchema = z.object({
  /** Display name shown in the dashboard */
  name: z.string().optional(),
  dlp: z.object({
    enabled: z.boolean().default(true),
    /** Built-in PII pattern names to scan for */
    detect: z.array(DlpPatternSchema).default([]),
    /** Custom regex patterns */
    customPatterns: z.array(z.object({
      name: z.string(),
      regex: z.string(),
    })).default([]),
    /** block = reject request; redact = replace matches; log = allow but record */
    action: z.enum(["block", "redact", "log"]).default("block"),
  }).default({}),
  promptGuard: z.object({
    enabled: z.boolean().default(true),
    /** Confidence threshold 0–1 to block (default 0.75) */
    blockThreshold: z.number().min(0).max(1).default(0.75),
  }).default({}),
  systemPromptLock: z.object({
    /** Injected before the user's system prompt — cannot be overridden by clients */
    prepend: z.string().optional(),
    /** Appended after the user's system prompt */
    append: z.string().optional(),
  }).optional(),
  outputFilter: z.object({
    enabled: z.boolean().default(false),
    /** Redact PII patterns from the model response before returning to client */
    redactPII: z.boolean().default(false),
  }).default({}),
  /** Restrict which LLM providers this policy allows (empty = all) */
  allowedProviders: z.array(z.string()).optional(),
  logging: z.object({
    storeContent: z.boolean().default(true),
    retentionDays: z.number().int().min(0).default(90),
  }).default({}),
});
export type ProviderFormat = z.infer<typeof ProviderFormatSchema>;

export const ProviderNameSchema = z.enum([
  "anthropic", "openai", "azure-openai", "perplexity", "groq", "mistral",
  "together", "fireworks", "deepinfra", "anyscale", "ollama", "lmstudio",
  "gemini", "custom",
]);
export type ProviderName = z.infer<typeof ProviderNameSchema>;

export const ConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3099),
  host: z.string().default("127.0.0.1"),

  providers: z.object({
    default: z.string().default("anthropic"),
    keys: z.record(z.string(), z.string()).default({}),
    azureOpenai: z.object({
      resourceName: z.string().optional(),
      apiVersion: z.string().default("2024-02-01"),
    }).optional(),
    custom: z.object({
      baseUrl: z.string().url().optional(),
      format: ProviderFormatSchema.default("openai-compatible"),
    }).optional(),
  }).default({}),

  cache: z.object({
    enabled: z.boolean().default(true),
    exact: z.object({
      enabled: z.boolean().default(true),
      ttlSeconds: z.number().int().min(0).default(86400),
    }).default({}),
    semantic: z.object({
      enabled: z.boolean().default(false),
      similarityThreshold: z.number().min(0.8).max(1).default(0.94),
      dryRun: z.boolean().default(false),
    }).default({}),
    storagePath: z.string().default(".proxiq/cache.db"),
  }).default({}),

  optimizer: z.object({
    promptCache: z.object({
      enabled: z.boolean().default(true),
    }).default({}),
    compression: z.object({
      enabled: z.boolean().default(false),
      triggerTokens: z.number().int().min(1000).default(6000),
      retainTurns: z.number().int().min(1).default(4),
    }).default({}),
  }).default({}),

  memory: z.object({
    enabled: z.boolean().default(false),
    sessionTtlSeconds: z.number().int().min(60).default(7200),
    topK: z.number().int().min(1).max(20).default(5),
  }).default({}),

  logging: z.object({
    level: z.enum(["silent", "error", "warn", "info", "debug"]).default("info"),
    includePrompts: z.boolean().default(false),
    format: z.enum(["json", "pretty"]).default("pretty"),
  }).default({}),

  routing: z.object({
    mode: z.enum(["auto", "rules", "off"]).default("off"),
    tiers: z.object({
      simple:   z.string().default("claude-haiku-4-5-20251001"),
      standard: z.string().default("claude-sonnet-4-6"),
      complex:  z.string().default("claude-opus-4-8"),
    }).default({}),
    rules: z.array(z.object({
      keywords: z.array(z.string()).min(1),
      tier: z.enum(["simple", "standard", "complex"]),
    })).default([
      {
        keywords: ["research", "architect", "in depth", "comprehensive",
                   "think carefully", "be thorough", "step by step",
                   "design system", "explain everything"],
        tier: "complex",
      },
      {
        keywords: ["what is", "define ", "translate", "fix this",
                   "when did", "who is", "how many", "convert ",
                   "correct this", "spell check"],
        tier: "simple",
      },
    ]),
    classifierApiKey: z.string().optional(),
  }).default({}),

  auth: z.object({
    /** When true, every /v1 request must carry a valid Proxiq token. */
    required: z.boolean().default(false),
    tokens: z.array(z.object({
      /** The token value — use "env:VAR_NAME" to avoid plaintext secrets in config. */
      token: z.string(),
      /** Human-readable label used in logs and stats (e.g. "alice", "ci-bot"). */
      label: z.string(),
      /** Per-user upstream key override. Falls back to providers.keys if omitted. */
      upstreamKey: z.string().optional(),
      /** Optional model allowlist. If set, requests for other models are rejected. */
      allowedModels: z.array(z.string()).optional(),
      /** Max requests per minute for this token (0 = unlimited). */
      rpmLimit: z.number().int().min(0).default(0),
    })).default([]),
  }).default({}),

  retention: z.object({
    /** Purge request_log rows older than N days (0 = keep forever). */
    logsDays: z.number().int().min(0).default(90),
    /** Purge cache entries older than N days (0 = use cache TTL only). */
    cacheDays: z.number().int().min(0).default(0),
    /**
     * When false, memory store is disabled and no conversation turns are persisted.
     * Use false for sensitive environments where prompt content must never be stored.
     */
    contentLogging: z.boolean().default(true),
  }).default({}),

  cloud: z.object({
    enabled: z.boolean().default(false),
    controlPlaneUrl: z.string().url().optional(),
    apiKey: z.string().optional(),
  }).default({}),

  /**
   * Named security policies. Assign a policy to a token via the dashboard or API.
   * Example: "banking-strict", "marketing-open"
   */
  policies: z.record(z.string(), PolicySchema).default({}),

  dashboard: z.object({
    /**
     * When set, the /proxiq/dashboard admin view and /proxiq/admin/* API
     * require this token as Authorization: Bearer or x-admin-token header.
     * Use "env:VAR_NAME". If omitted, admin routes are open (dev mode only).
     */
    adminToken: z.string().optional(),
    /**
     * Secret used to sign JWT session cookies for the dashboard.
     * Use "env:VAR_NAME". Defaults to a random value (sessions reset on restart).
     */
    sessionSecret: z.string().optional(),
    /**
     * Username for the local admin login form (default: "admin").
     * Pair with adminPassword to enable username+password sign-in.
     */
    adminUsername: z.string().default("admin"),
    /**
     * Password for the local admin login form.
     * Use "env:PROXIQ_ADMIN_PASSWORD". If omitted, local login is disabled.
     */
    adminPassword: z.string().optional(),
    /**
     * Email addresses that receive the "admin" role when signing in via SSO.
     * Anyone not on this list signs in as a regular user and sees only their
     * own token and usage stats.
     * e.g. ["alice@company.com", "bob@company.com"]
     */
    adminEmails: z.array(z.string()).default([]),
    /** SSO configuration — enable one or more providers for employee login. */
    sso: z.object({
      enabled: z.boolean().default(false),
      /**
       * Base URL of this Proxiq instance, used to build callback URLs.
       * e.g. "https://proxiq.company.com"
       */
      baseUrl: z.string().optional(),
      /** RPM limit applied to tokens auto-provisioned via SSO (0 = unlimited). */
      defaultRpmLimit: z.number().int().min(0).default(0),

      /** Google OAuth2 / Workspace SSO */
      google: z.object({
        enabled: z.boolean().default(false),
        clientId: z.string().optional(),
        clientSecret: z.string().optional(),
        /** Restrict sign-in to a specific Google Workspace domain (e.g. "company.com"). */
        allowedDomain: z.string().optional(),
      }).default({}),

      /** Microsoft Entra ID (Azure AD) OAuth2 */
      microsoft: z.object({
        enabled: z.boolean().default(false),
        clientId: z.string().optional(),
        clientSecret: z.string().optional(),
        /** Tenant ID — use "common" to allow any MS account, or your specific tenant GUID. */
        tenantId: z.string().default("common"),
      }).default({}),

      /** GitHub OAuth2 — great for dev-team deployments */
      github: z.object({
        enabled: z.boolean().default(false),
        clientId: z.string().optional(),
        clientSecret: z.string().optional(),
        /** Restrict sign-in to members of a specific GitHub org. */
        allowedOrg: z.string().optional(),
      }).default({}),

      /**
       * Generic OIDC — covers Keycloak, Okta, Auth0, OneLogin, PingFederate,
       * Dex, and any other OIDC-compliant IdP.
       * Proxiq auto-discovers endpoints from {issuerUrl}/.well-known/openid-configuration.
       */
      oidc: z.object({
        enabled: z.boolean().default(false),
        /** Display name on the login button (e.g. "Okta", "Keycloak", "Auth0"). */
        providerName: z.string().default("SSO"),
        /**
         * OIDC issuer base URL.
         *  Keycloak:  https://keycloak.company.com/realms/your-realm
         *  Okta:      https://company.okta.com/oauth2/default
         *  Auth0:     https://company.auth0.com
         *  OneLogin:  https://company.onelogin.com/oidc/2
         */
        issuerUrl: z.string().optional(),
        clientId: z.string().optional(),
        clientSecret: z.string().optional(),
        /** Restrict sign-in to users with a specific email domain. */
        allowedDomain: z.string().optional(),
        /** Extra OAuth2 scopes (space-separated). "openid email profile" always included. */
        extraScopes: z.string().optional(),
      }).default({}),

      /** SAML 2.0 — for Okta SAML, Ping, OneLogin, and custom enterprise IdPs */
      saml: z.object({
        enabled: z.boolean().default(false),
        /** Display name on the login button (e.g. "Okta", "Azure SAML"). */
        providerName: z.string().default("SSO"),
        /** IdP SSO URL from the IdP's SAML metadata (SingleSignOnService location). */
        entryPoint: z.string().optional(),
        /** SP entity ID — must match what you register in the IdP. */
        issuer: z.string().default("proxiq"),
        /** IdP signing certificate (PEM, without -----BEGIN CERTIFICATE----- headers). */
        cert: z.string().optional(),
        /**
         * SAML attribute containing the user's email.
         * Defaults to NameID. Common: "email" or the full claim URI.
         */
        emailAttribute: z.string().default("nameID"),
      }).default({}),
    }).default({}),
  }).default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
