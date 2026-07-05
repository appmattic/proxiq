#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const PROXIQ_URL = process.env["PROXIQ_URL"] ?? "http://127.0.0.1:3099";
const PROXIQ_API_KEY = process.env["PROXIQ_API_KEY"] ?? "";

async function proxiqGet(path: string): Promise<unknown> {
  const res = await fetch(`${PROXIQ_URL}${path}`, {
    headers: PROXIQ_API_KEY ? { "x-api-key": PROXIQ_API_KEY } : {},
  });
  if (!res.ok) throw new Error(`Proxiq ${path} returned ${res.status}`);
  return res.json();
}

async function proxiqPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${PROXIQ_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(PROXIQ_API_KEY ? { "x-api-key": PROXIQ_API_KEY } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Proxiq ${path} returned ${res.status}: ${text}`);
  }
  return res.json();
}

const server = new McpServer({ name: "proxiq", version: "0.1.0" });

server.tool("proxiq_status", "Get Proxiq gateway health and status", {}, async () => {
  const data = await proxiqGet("/proxiq/health");
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("proxiq_metrics", "Get Proxiq cache metrics and token savings", {}, async () => {
  const data = await proxiqGet("/proxiq/metrics");
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool(
  "proxiq_completion",
  "Send an LLM completion request through Proxiq (supports all providers)",
  {
    provider: z.string().default("anthropic").describe("Provider: anthropic, openai, groq, etc."),
    model: z.string().describe("Model name"),
    messages: z.array(z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })).describe("Conversation messages"),
    max_tokens: z.number().int().default(1024).describe("Maximum tokens to generate"),
    system: z.string().optional().describe("System prompt (Anthropic only)"),
    api_key: z.string().optional().describe("API key for the provider"),
  },
  async (params) => {
    const { provider, model, messages, max_tokens, system, api_key } = params;

    const headers: Record<string, string> = {
      "x-proxiq-provider": provider,
    };

    if (api_key) {
      if (provider === "anthropic") {
        headers["x-api-key"] = api_key;
      } else {
        headers["authorization"] = `Bearer ${api_key}`;
      }
    }

    const body: Record<string, unknown> = { model, messages, max_tokens };
    if (system && provider === "anthropic") body["system"] = system;

    const endpoint = provider === "anthropic" ? "/v1/messages" : "/v1/chat/completions";

    const res = await fetch(`${PROXIQ_URL}${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "proxiq_classify",
  "Classify a prompt's complexity tier (simple / standard / complex)",
  {
    prompt: z.string().describe("The prompt to classify"),
    api_key: z.string().optional().describe("Anthropic API key for the classifier"),
  },
  async (params) => {
    const { prompt, api_key } = params;
    const headers: Record<string, string> = { "x-proxiq-provider": "anthropic" };
    if (api_key) headers["x-api-key"] = api_key;

    const body = {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 10,
      system: `Classify this prompt as: simple, standard, or complex. Reply with ONLY one word.`,
      messages: [{ role: "user", content: prompt.slice(0, 500) }],
    };

    const res = await fetch(`${PROXIQ_URL}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const data = await res.json() as { content?: Array<{ text: string }> };
    const tier = data.content?.[0]?.text?.trim().toLowerCase() ?? "standard";

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ tier, prompt: prompt.slice(0, 100) }, null, 2),
      }],
    };
  }
);

server.tool(
  "proxiq_set_tier",
  "Set the routing tier override for the next request",
  {
    tier: z.enum(["simple", "standard", "complex"]).describe("Routing tier to use"),
  },
  async (params) => {
    return {
      content: [{
        type: "text",
        text: `Tier set to "${params.tier}". Add header x-proxiq-tier: ${params.tier} to your next request to Proxiq.`,
      }],
    };
  }
);

server.tool(
  "proxiq_clear_cache",
  "Clear all Proxiq cache entries",
  {},
  async () => {
    const data = await proxiqPost("/proxiq/cache/clear", {});
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "proxiq_stats",
  "Get routing stats, model switches, and cost savings for a time period",
  {
    period: z.enum(["today", "daily_avg", "weekly", "monthly"])
      .default("today")
      .describe("Time period: today, daily_avg (30-day avg), weekly (last 7d), monthly (last 30d)"),
    user: z.string().optional()
      .describe("Filter stats by user label (e.g. 'alice'). Omit for all users."),
  },
  async (params) => {
    const qs = new URLSearchParams({ period: params.period });
    if (params.user) qs.set("user", params.user);
    const data = await proxiqGet(`/proxiq/stats?${qs.toString()}`);
    const d = data as Record<string, unknown>;
    const cost = d["cost"] as Record<string, number> | undefined;
    const req = d["requests"] as Record<string, unknown> | undefined;
    const models = d["models"] as { switches: Array<{from:string;to:string;count:number}>; used: Record<string,number> } | undefined;

    // Human-readable summary + raw JSON
    const lines: string[] = [
      `📊 Proxiq Stats — ${params.period}`,
      "",
      `Requests: ${(req?.["total"] ?? 0)} total | ${(req?.["cached"] ?? 0)} cached | ${(req?.["streamed"] ?? 0)} streamed`,
      `Routing: simple=${(req?.["byTier"] as Record<string,number>)?.["simple"] ?? 0} | standard=${(req?.["byTier"] as Record<string,number>)?.["standard"] ?? 0} | complex=${(req?.["byTier"] as Record<string,number>)?.["complex"] ?? 0}`,
      "",
    ];

    if (models?.switches?.length) {
      lines.push("Model switches (original → routed):");
      for (const s of models.switches) {
        lines.push(`  ${s.from} → ${s.to}  ×${s.count}`);
      }
      lines.push("");
    }

    if (cost) {
      lines.push(`Cost: $${cost["actualUsd"]?.toFixed(4)} actual | $${cost["wouldHaveCostUsd"]?.toFixed(4)} without routing`);
      lines.push(`Saved: $${cost["savedUsd"]?.toFixed(4)} (${cost["savingsPct"]}%)`);
    }

    lines.push("", "--- raw ---", JSON.stringify(data, null, 2));

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
