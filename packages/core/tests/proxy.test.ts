import { describe, expect, it } from "bun:test";
import { DEFAULT_CONFIG } from "../src/config/defaults.js";
import { resolveProvider } from "../src/proxy/providers.js";
import { buildForwardHeaders } from "../src/proxy/router.js";

describe("resolveProvider", () => {
  it("uses x-proxiq-provider header first", () => {
    expect(resolveProvider("groq", "", "", DEFAULT_CONFIG)).toBe("groq");
  });

  it("auto-detects anthropic from sk-ant- prefix", () => {
    expect(
      resolveProvider(undefined, "", "sk-ant-abc123", DEFAULT_CONFIG)
    ).toBe("anthropic");
  });

  it("auto-detects groq from gsk_ prefix", () => {
    expect(resolveProvider(undefined, "", "gsk_test", DEFAULT_CONFIG)).toBe(
      "groq"
    );
  });

  it("falls back to config default", () => {
    expect(resolveProvider(undefined, "", "", DEFAULT_CONFIG)).toBe(
      "anthropic"
    );
  });
});

describe("buildForwardHeaders", () => {
  it("converts Bearer to x-api-key for anthropic", () => {
    const headers = buildForwardHeaders(
      { authorization: "Bearer sk-ant-abc" },
      "anthropic"
    );
    expect(headers["x-api-key"]).toBe("sk-ant-abc");
    expect(headers.authorization).toBeUndefined();
  });

  it("keeps Authorization for non-anthropic providers", () => {
    const headers = buildForwardHeaders(
      { authorization: "Bearer sk-openai-abc" },
      "openai"
    );
    expect(headers.authorization).toBe("Bearer sk-openai-abc");
    expect(headers["x-api-key"]).toBeUndefined();
  });

  it("strips x-proxiq-* control headers", () => {
    const headers = buildForwardHeaders(
      {
        "x-proxiq-provider": "anthropic",
        "x-proxiq-session-id": "sess-123",
        "content-type": "application/json",
      },
      "anthropic"
    );
    expect(headers["x-proxiq-provider"]).toBeUndefined();
    expect(headers["x-proxiq-session-id"]).toBeUndefined();
    expect(headers["content-type"]).toBe("application/json");
  });
});
