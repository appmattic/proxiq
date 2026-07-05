import { randomUUID } from "node:crypto";
import { randomBytes as _randomBytes } from "node:crypto";
import cors from "@fastify/cors";
import Fastify from "fastify";
import {
  registerAdminRoutes,
  registerDashboardRoutes,
} from "../admin/index.js";
import { type AuthResolver, checkRpmLimit } from "../auth/index.js";
import { registerSsoRoutes } from "../auth/sso.js";
import { normalizeRequest } from "../cache/index.js";
import type { ICache } from "../cache/index.js";
import type { Config } from "../config/schema.js";
import type { MemoryEngine } from "../memory/index.js";
import type {
  MiddlewareRegistry,
  RelayRequest,
  RelayResponse,
} from "../middleware/types.js";
import type { OptimizerPipeline } from "../optimizer/index.js";
import {
  PolicyError,
  detectInjection,
  extractRequestText,
  injectSystemPrompt,
  redactDLP,
  scanDLP,
} from "../policy/index.js";
import type { Policy } from "../policy/types.js";
import { applyModelRouter, routingHeaders } from "../router/index.js";
import { resolveSecret } from "../secrets/index.js";
import {
  estimateCost,
  getCacheStats,
  getStats,
  purgeExpiredCache,
} from "../storage/sqlite.js";
import type { StatsPeriod } from "../storage/sqlite.js";
import type { DB } from "../storage/sqlite.js";
import { getStoredPolicy, logPolicyEvent } from "../storage/sqlite.js";
import { getTokenByLabel } from "../storage/tokens.js";
import { VERSION } from "../utils/version.js";
import { buildProviderUrl, resolveProvider } from "./providers.js";
import { buildForwardHeaders } from "./router.js";

export interface ProxyServer {
  start(): Promise<string>;
  stop(): Promise<void>;
}

export type { ProxyServer as IProxyServer };

function toErrorShape(value: unknown): {
  statusCode?: number;
  message: string;
  name: string;
} {
  if (value instanceof Error) {
    const maybeStatus = value as Error & { statusCode?: number };
    return {
      statusCode: maybeStatus.statusCode,
      message: value.message,
      name: value.name,
    };
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as {
      statusCode?: number;
      message?: unknown;
      name?: unknown;
    };
    return {
      statusCode: obj.statusCode,
      message: typeof obj.message === "string" ? obj.message : "Unknown error",
      name: typeof obj.name === "string" ? obj.name : "Error",
    };
  }
  return { message: "Unknown error", name: "Error" };
}

/**
 * Parse Anthropic / OpenAI SSE chunks to extract token usage.
 * Returns { inputTokens, outputTokens } accumulated over the entire stream.
 */
function parseSSEUsage(
  raw: string,
  provider: string
): { inputTokens: number; outputTokens: number } {
  let inputTokens = 0;
  let outputTokens = 0;

  for (const line of raw.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const json = line.slice(5).trim();
    if (!json || json === "[DONE]") continue;
    try {
      const evt = JSON.parse(json) as Record<string, unknown>;

      if (provider === "anthropic") {
        // message_start carries input_tokens
        const msg = evt.message as Record<string, unknown> | undefined;
        const usage1 = (msg?.usage ?? evt.usage) as
          | Record<string, number>
          | undefined;
        if (usage1?.input_tokens) inputTokens = usage1.input_tokens;
        // message_delta carries output_tokens
        const usage2 = evt.usage as Record<string, number> | undefined;
        if (usage2?.output_tokens) outputTokens = usage2.output_tokens;
      } else {
        // OpenAI / compatible: usage is on final chunk
        const usage = evt.usage as Record<string, number> | undefined;
        if (usage?.prompt_tokens) inputTokens = usage.prompt_tokens;
        if (usage?.completion_tokens) outputTokens = usage.completion_tokens;
      }
    } catch {
      // skip malformed events
    }
  }

  return { inputTokens, outputTokens };
}

/**
 * Wraps an SSE ReadableStream. All bytes pass through unchanged.
 * On stream end, parses usage events and writes a metrics row to the DB.
 */
function wrapStreamingMetrics(
  body: ReadableStream<Uint8Array>,
  db: DB,
  logData: {
    requestId: string;
    provider: string;
    originalModel: string;
    routedModel: string;
    routingMethod: string;
    routingTier: string;
    userLabel: string;
    startMs: number;
  }
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let accumulated = "";

  const insert = db.prepare(`
    INSERT INTO request_log
      (id, request_id, provider, model, input_tokens, output_tokens,
       duration_ms, from_cache, cache_source, compressed, created_at,
       original_model, routed_model, routing_method, routing_tier,
       cost_usd, saved_usd, user_label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      accumulated += decoder.decode(chunk, { stream: true });
      controller.enqueue(chunk);
    },
    flush() {
      try {
        const { inputTokens, outputTokens } = parseSSEUsage(
          accumulated,
          logData.provider
        );
        const durationMs = Date.now() - logData.startMs;

        const actualCost = estimateCost(
          logData.routedModel,
          inputTokens,
          outputTokens
        );
        const originalCost =
          logData.originalModel !== logData.routedModel
            ? estimateCost(logData.originalModel, inputTokens, outputTokens)
            : actualCost;
        const savedUsd = Math.max(0, originalCost - actualCost);

        insert.run(
          randomUUID(),
          logData.requestId,
          logData.provider,
          logData.routedModel,
          inputTokens,
          outputTokens,
          durationMs,
          0, // from_cache
          null,
          0, // compressed
          Math.floor(Date.now() / 1000),
          logData.originalModel,
          logData.routedModel,
          logData.routingMethod,
          logData.routingTier,
          actualCost,
          savedUsd,
          logData.userLabel
        );
      } catch {
        // Never break the stream due to metrics error
      }
    },
  });

  return body.pipeThrough(transform);
}

export async function createProxy(
  config: Config,
  db: DB,
  cache: ICache,
  middlewareRegistry: MiddlewareRegistry,
  optimizer: OptimizerPipeline,
  memory: MemoryEngine,
  auth: AuthResolver
): Promise<ProxyServer> {
  const app = Fastify({ logger: false, trustProxy: true });

  app.register(cors, { origin: true });

  // ── Global fallback error handler ─────────────────────────────────────────
  // The dashboard routes register their own setErrorHandler (HTML pages).
  // This catches anything that slips through to the Fastify top-level:
  // malformed JSON, unknown routes, unhandled throws in proxy handlers, etc.
  app.setErrorHandler((err, req, reply) => {
    const parsed = toErrorShape(err);
    const status = parsed.statusCode ?? 500;
    console.error(
      `[proxiq] ${req.method} ${req.url} → ${status}: ${parsed.message}`
    );
    if (!reply.sent) {
      reply.status(status).send({
        error: parsed.name,
        message: parsed.message,
        statusCode: status,
      });
    }
  });
  // ─────────────────────────────────────────────────────────────────────────

  // ── Resolve admin token + session secret ──────────────────────────────────
  let resolvedAdminToken: string | undefined;
  if (config.dashboard.adminToken) {
    try {
      resolvedAdminToken =
        (await resolveSecret(
          config.dashboard.adminToken,
          "dashboard.adminToken"
        )) ?? undefined;
    } catch {
      console.warn(
        "[proxiq:dashboard] WARNING: adminToken could not be resolved — dashboard is open"
      );
    }
  }
  let sessionSecret = _randomBytes(32).toString("hex"); // ephemeral default
  if (config.dashboard.sessionSecret) {
    try {
      sessionSecret =
        (await resolveSecret(
          config.dashboard.sessionSecret,
          "dashboard.sessionSecret"
        )) ?? sessionSecret;
    } catch {
      console.warn(
        "[proxiq:dashboard] WARNING: sessionSecret unresolved — sessions reset on restart"
      );
    }
  }

  // ── Register SSO + admin + dashboard routes ────────────────────────────────
  await registerSsoRoutes(app, db, config, sessionSecret);
  registerAdminRoutes(app, db, config, resolvedAdminToken, sessionSecret);
  await registerDashboardRoutes(
    app,
    db,
    config,
    resolvedAdminToken,
    sessionSecret
  );
  // ──────────────────────────────────────────────────────────────────────────

  // Health endpoint
  app.get("/proxiq/health", async () => ({
    status: "ok",
    version: VERSION,
  }));

  // Metrics endpoint (cache-level stats, kept for backward compat)
  app.get("/proxiq/metrics", async () => {
    return getCacheStats(db);
  });

  // Routing + cost stats endpoint
  app.get("/proxiq/stats", async (request) => {
    const q = request.query as Record<string, string>;
    const period = (q.period ?? "today") as StatsPeriod;
    const valid: StatsPeriod[] = ["today", "daily_avg", "weekly", "monthly"];
    if (!valid.includes(period)) {
      return { error: `Invalid period. Use one of: ${valid.join(", ")}` };
    }
    const user = q.user ?? undefined;
    return getStats(db, period, user);
  });

  // Cache clear endpoint
  app.post("/proxiq/cache/clear", async () => {
    const cleared = purgeExpiredCache(db);
    db.run("DELETE FROM cache_entries");
    return { cleared };
  });

  // Main proxy route
  app.all("/v1/*", async (request, reply) => {
    const startMs = Date.now();
    const requestId =
      (request.headers["x-proxiq-request-id"] as string) ?? randomUUID();
    const sessionId =
      (request.headers["x-proxiq-session-id"] as string) ?? randomUUID();
    const tierOverride = (request.headers["x-proxiq-tier"] as string) ?? null;
    const providerHeader = request.headers["x-proxiq-provider"] as
      | string
      | undefined;
    const authHeader =
      (request.headers.authorization as string) ??
      (request.headers["x-api-key"]
        ? `Bearer ${request.headers["x-api-key"]}`
        : "");

    const rawBody = (request.body as Record<string, unknown>) ?? {};
    const bodyModel = (rawBody.model as string) ?? "";

    // ── Auth gate ────────────────────────────────────────────────────────────
    const bearerToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;
    const identity = bearerToken ? auth.resolve(bearerToken) : null;

    if (auth.required && !identity) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "A valid Proxiq token is required.",
      });
    }

    const userIdentity = identity ?? auth.anonymous;

    // Model allowlist check
    if (
      identity?.allowedModels &&
      identity.allowedModels.length > 0 &&
      bodyModel
    ) {
      const allowed = identity.allowedModels.some(
        (m) => bodyModel.includes(m) || m.includes(bodyModel)
      );
      if (!allowed) {
        return reply.status(403).send({
          error: "Forbidden",
          message: `Model "${bodyModel}" is not allowed for your token.`,
        });
      }
    }

    // RPM rate limit check
    if (!checkRpmLimit(userIdentity.label, userIdentity.rpmLimit)) {
      return reply.status(429).send({
        error: "Too Many Requests",
        message: `Rate limit exceeded for token "${userIdentity.label}".`,
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Policy enforcement ────────────────────────────────────────────────────
    const tokenRecord = identity
      ? getTokenByLabel(db, userIdentity.label)
      : null;
    const policyName = tokenRecord?.policyName ?? null;
    // DB-stored policies (created via builder) take precedence over config-file policies
    const storedPolicy = policyName ? getStoredPolicy(db, policyName) : null;
    const storedPolicyConfig = storedPolicy?.config as Policy | undefined;
    const configPolicy = policyName ? config.policies?.[policyName] : undefined;
    const policy: Policy | null = storedPolicyConfig ?? configPolicy ?? null;

    // bodyForRelay starts as rawBody; redact action may swap in a sanitised copy
    let bodyForRelay: Record<string, unknown> = rawBody;

    if (policy) {
      const requestText = extractRequestText(rawBody);

      // 1. DLP — scan for PII / sensitive data
      if (
        policy.dlp?.enabled !== false &&
        (policy.dlp?.detect ?? []).length > 0
      ) {
        const dlp = scanDLP(requestText, policy.dlp ?? {});
        if (dlp.violations.length > 0) {
          if (dlp.action === "block") {
            logPolicyEvent(db, userIdentity.label, policyName!, "dlp_blocked", {
              violations: dlp.violations,
            });
            return reply.status(400).send({
              error: "PolicyViolation",
              code: "DLP_BLOCKED",
              message:
                "Request blocked: contains sensitive data that is not allowed by your organization's policy.",
              violations: dlp.violations,
            });
          }
          if (dlp.action === "redact") {
            // Build a sanitised copy of the body with PII replaced in each message
            const dlpCfg = policy.dlp ?? {};
            const msgs = rawBody.messages;
            if (Array.isArray(msgs)) {
              bodyForRelay = {
                ...rawBody,
                messages: msgs.map((m: Record<string, unknown>) => {
                  if (typeof m.content === "string") {
                    return {
                      ...m,
                      content: redactDLP(m.content as string, dlpCfg),
                    };
                  }
                  return m;
                }),
              };
            }
            logPolicyEvent(
              db,
              userIdentity.label,
              policyName!,
              "dlp_redacted",
              { violations: dlp.violations }
            );
          } else if (dlp.action === "log") {
            logPolicyEvent(db, userIdentity.label, policyName!, "dlp_logged", {
              violations: dlp.violations,
            });
          }
        }
      }

      // 2. Prompt guard — detect injection / jailbreak attempts
      if (policy.promptGuard?.enabled !== false) {
        const guard = detectInjection(requestText, policy.promptGuard ?? {});
        if (guard.blocked) {
          logPolicyEvent(
            db,
            userIdentity.label,
            policyName!,
            "injection_blocked",
            { score: guard.score, matches: guard.matches }
          );
          return reply.status(400).send({
            error: "PolicyViolation",
            code: "PROMPT_INJECTION",
            message:
              "Request blocked: potential prompt injection or jailbreak attempt detected.",
            score: guard.score,
          });
        }
      }

      // 3. Provider allowlist
      if (policy.allowedProviders && policy.allowedProviders.length > 0) {
        const resolvedProvider = resolveProvider(
          providerHeader,
          bodyModel,
          authHeader,
          config
        );
        if (!policy.allowedProviders.includes(resolvedProvider)) {
          logPolicyEvent(
            db,
            userIdentity.label,
            policyName!,
            "provider_blocked",
            { provider: resolvedProvider }
          );
          return reply.status(403).send({
            error: "PolicyViolation",
            code: "PROVIDER_NOT_ALLOWED",
            message: `Provider "${resolvedProvider}" is not permitted by your organization's policy.`,
          });
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const provider = resolveProvider(
      providerHeader,
      bodyModel,
      authHeader,
      config
    );

    // Build RelayRequest
    const incomingHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(request.headers)) {
      if (typeof v === "string") incomingHeaders[k] = v;
    }

    const relayReq: RelayRequest = {
      id: requestId,
      sessionId,
      provider,
      model: bodyModel,
      body: bodyForRelay,
      headers: incomingHeaders,
      metadata: {},
      userLabel: userIdentity.label,
      upstreamKeyOverride: userIdentity.upstreamKey,
    };

    const middlewares = middlewareRegistry.getAll();

    // Run onRequest middleware
    let mutatedReq: RelayRequest = relayReq;
    for (const mw of middlewares) {
      if (!mw.onRequest) continue;
      const result = await mw.onRequest(mutatedReq);
      if ("content" in result && "fromCache" in result) {
        return reply.status(200).send((result as RelayResponse).content);
      }
      mutatedReq = result as RelayRequest;
    }

    // Check cache
    const normalizedReq = normalizeRequest(mutatedReq.body, provider);
    const cached = await cache.get(normalizedReq);

    if (cached) {
      const durationMs = Date.now() - startMs;
      const actualCost = estimateCost(
        bodyModel,
        cached.inputTokens,
        cached.outputTokens
      );
      const cacheRes: RelayResponse = {
        id: randomUUID(),
        requestId,
        provider,
        model: bodyModel,
        content: cached.body,
        inputTokens: cached.inputTokens,
        outputTokens: cached.outputTokens,
        fromCache: true,
        cacheSource: cached.source,
        compressed: false,
        durationMs,
        originalModel: bodyModel,
        routedModel: bodyModel,
        routingMethod: "cache",
        routingTier: "standard",
        costUsd: 0, // cache hit = zero cost
        savedUsd: actualCost, // would have cost this without cache
      };

      for (const mw of middlewares) {
        if (mw.onResponse) await mw.onResponse(cacheRes, mutatedReq);
      }

      return reply
        .header("x-proxiq-from-cache", "true")
        .header("x-proxiq-cache-source", cached.source)
        .header("x-proxiq-request-id", requestId)
        .send(cached.body);
    }

    // Memory injection
    let bodyToSend = await memory.inject(sessionId, mutatedReq.body);

    // Model routing
    const { body: routedBody, result: routingResult } = await applyModelRouter(
      bodyToSend,
      config,
      tierOverride
    );
    bodyToSend = routedBody;

    // Resolved model after routing
    const routedModel = (bodyToSend.model as string) ?? bodyModel;

    // System prompt lock — inject org-mandated prompt (cannot be overridden by client)
    if (
      policy?.systemPromptLock &&
      (policy.systemPromptLock.prepend || policy.systemPromptLock.append)
    ) {
      const resolvedProvider = resolveProvider(
        providerHeader,
        bodyModel,
        authHeader,
        config
      );
      bodyToSend = injectSystemPrompt(
        bodyToSend,
        policy.systemPromptLock,
        resolvedProvider
      ) as typeof bodyToSend;
      logPolicyEvent(
        db,
        userIdentity.label,
        policyName!,
        "system_prompt_injected",
        {}
      );
    }

    // Optimizer
    const { body: optimizedBody, compressed } = await optimizer.optimize(
      bodyToSend,
      config,
      provider,
      authHeader
    );

    // Forward to upstream
    const upstreamPath = request.url.replace(/^\/v1/, "/v1");
    const upstreamUrl = buildProviderUrl(provider, upstreamPath, config);
    const configKey =
      mutatedReq.upstreamKeyOverride ??
      config.providers.keys[provider] ??
      config.providers.keys.default;
    const forwardHeaders = buildForwardHeaders(
      incomingHeaders,
      provider,
      configKey
    );

    const isStreaming = optimizedBody.stream === true;

    const upstreamRes = await fetch(upstreamUrl, {
      method: request.method,
      headers: { ...forwardHeaders, "content-type": "application/json" },
      body: JSON.stringify(optimizedBody),
    });

    // Streaming response — pipe through metrics wrapper, no caching
    if (
      isStreaming ||
      upstreamRes.headers.get("content-type")?.includes("text/event-stream")
    ) {
      const rHeaders = routingHeaders(routingResult);
      for (const [k, v] of Object.entries(rHeaders)) reply.header(k, v);

      reply
        .status(upstreamRes.status)
        .header("content-type", "text/event-stream")
        .header("cache-control", "no-cache")
        .header("connection", "keep-alive")
        .header("x-proxiq-request-id", requestId)
        .header("x-proxiq-from-cache", "false");

      const wrappedBody = wrapStreamingMetrics(upstreamRes.body!, db, {
        requestId,
        provider,
        originalModel: bodyModel,
        routedModel,
        routingMethod: routingResult.method,
        routingTier: routingResult.tier,
        userLabel: mutatedReq.userLabel,
        startMs,
      });

      return reply.send(wrappedBody);
    }

    // Non-streaming — parse, cache, record metrics
    const upstreamBody = (await upstreamRes.json()) as Record<string, unknown>;
    const durationMs = Date.now() - startMs;

    // Extract token counts
    const usage = upstreamBody.usage as
      | {
          input_tokens?: number;
          output_tokens?: number;
          prompt_tokens?: number;
          completion_tokens?: number;
        }
      | undefined;
    const inputTokens = usage?.input_tokens ?? usage?.prompt_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? usage?.completion_tokens ?? 0;

    // Only cache successful responses
    if (upstreamRes.ok) {
      await cache.set(normalizedReq, upstreamBody, inputTokens, outputTokens);
    }

    // Record memory
    const messages =
      (optimizedBody.messages as Array<{
        role: string;
        content: unknown;
      }>) ?? [];
    const lastUser = messages.filter((m) => m.role === "user").at(-1);
    const lastUserText =
      typeof lastUser?.content === "string" ? lastUser.content : "";
    const assistantContent =
      (upstreamBody.content as Array<{ text: string }> | undefined)?.[0]
        ?.text ?? "";
    await memory.record(sessionId, lastUserText, assistantContent);

    // Cost calculation
    const actualCost = estimateCost(routedModel, inputTokens, outputTokens);
    const originalCost =
      bodyModel !== routedModel
        ? estimateCost(bodyModel, inputTokens, outputTokens)
        : actualCost;
    const savedUsd = Math.max(0, originalCost - actualCost);

    const relayRes: RelayResponse = {
      id: randomUUID(),
      requestId,
      provider,
      model: routedModel,
      content: upstreamBody,
      inputTokens,
      outputTokens,
      fromCache: false,
      compressed,
      durationMs,
      originalModel: bodyModel,
      routedModel,
      routingMethod: routingResult.method,
      routingTier: routingResult.tier,
      costUsd: actualCost,
      savedUsd,
    };

    let finalRes = relayRes;
    for (const mw of middlewares) {
      if (mw.onResponse) finalRes = await mw.onResponse(finalRes, mutatedReq);
    }

    const rHeaders = routingHeaders(routingResult);
    for (const [k, v] of Object.entries(rHeaders)) reply.header(k, v);

    return reply
      .status(upstreamRes.status)
      .header("x-proxiq-request-id", requestId)
      .header("x-proxiq-compressed", String(compressed))
      .send(upstreamBody);
  });

  return {
    async start(): Promise<string> {
      await app.listen({ port: config.port, host: config.host });
      return `http://${config.host}:${config.port}`;
    },
    async stop(): Promise<void> {
      await app.close();
    },
  };
}
