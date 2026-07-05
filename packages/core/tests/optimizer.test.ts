import { describe, it, expect } from "bun:test";
import { injectPromptCache } from "../src/optimizer/prompt-cache.js";

describe("injectPromptCache", () => {
  it("wraps string system in array with cache_control", () => {
    const result = injectPromptCache({ system: "You are a helpful assistant.", messages: [] });
    expect(Array.isArray(result["system"])).toBe(true);
    const sys = result["system"] as Array<{ cache_control: { type: string } }>;
    expect(sys[0]?.cache_control?.type).toBe("ephemeral");
  });

  it("adds cache_control to last tool", () => {
    const result = injectPromptCache({
      tools: [{ name: "search", description: "Search the web" }],
      messages: [],
    });
    const tools = result["tools"] as Array<{ cache_control?: { type: string } }>;
    expect(tools[tools.length - 1]?.cache_control?.type).toBe("ephemeral");
  });

  it("leaves non-anthropic body unchanged if system is absent", () => {
    const body = { model: "gpt-4o", messages: [{ role: "user", content: "hi" }] };
    const result = injectPromptCache(body);
    expect(result["system"]).toBeUndefined();
  });

  it("does not duplicate cache_control if already present", () => {
    const result = injectPromptCache({
      system: [{ type: "text", text: "hi", cache_control: { type: "ephemeral" } }],
      messages: [],
    });
    const sys = result["system"] as Array<{ cache_control: { type: string } }>;
    expect(sys).toHaveLength(1);
    expect(sys[0]?.cache_control?.type).toBe("ephemeral");
  });
});
