export { scanDLP, redactDLP } from "./dlp.js";
export { detectInjection } from "./prompt-guard.js";
export { PolicyError } from "./types.js";
export type { Policy, DlpResult, GuardResult } from "./types.js";

import type { SystemPromptLockConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Text extraction — pulls all user-visible text from a request body
// Handles Anthropic (system + messages) and OpenAI-compatible formats.
// ---------------------------------------------------------------------------

export function extractRequestText(body: Record<string, unknown>): string {
  const parts: string[] = [];

  // Anthropic: top-level system field
  if (typeof body.system === "string") parts.push(body.system);

  // Messages array (Anthropic + OpenAI)
  const messages = body.messages;
  if (Array.isArray(messages)) {
    for (const msg of messages as Array<{ role?: string; content?: unknown }>) {
      if (typeof msg.content === "string") {
        parts.push(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content as Array<{
          type?: string;
          text?: string;
        }>) {
          if (block.type === "text" && block.text) parts.push(block.text);
        }
      }
    }
  }

  // Legacy completions prompt field
  if (typeof body.prompt === "string") parts.push(body.prompt);

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// System prompt lock — injects the org-mandated system prompt
// Prepend before user system prompt; append after.
// Works with both Anthropic and OpenAI-compatible request formats.
// ---------------------------------------------------------------------------

export function injectSystemPrompt(
  body: Record<string, unknown>,
  lock: SystemPromptLockConfig,
  provider: string
): Record<string, unknown> {
  const { prepend, append } = lock;
  if (!prepend && !append) return body;

  if (provider === "anthropic") {
    // Anthropic: top-level "system" string
    const existing = typeof body.system === "string" ? body.system : "";
    const parts = [prepend, existing, append].filter(Boolean);
    return { ...body, system: parts.join("\n\n") };
  }

  // OpenAI / compatible: system role message at index 0
  const rawMessages = body.messages;
  if (!Array.isArray(rawMessages)) return body;

  const messages = [...rawMessages] as Array<{ role: string; content: string }>;
  const sysIdx = messages.findIndex((m) => m.role === "system");
  const existingContent = sysIdx >= 0 ? (messages[sysIdx]?.content ?? "") : "";
  const combined = [prepend, existingContent, append]
    .filter(Boolean)
    .join("\n\n");
  const sysMsg = { role: "system", content: combined };

  if (sysIdx >= 0) {
    messages[sysIdx] = sysMsg;
  } else {
    messages.unshift(sysMsg);
  }
  return { ...body, messages };
}
