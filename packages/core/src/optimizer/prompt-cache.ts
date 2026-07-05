/**
 * Injects Anthropic prompt cache_control breakpoints.
 * Adds ephemeral cache_control at the system message and tools boundary,
 * which reduces repeated-prefix costs by ~78% on Anthropic models.
 */
export function injectPromptCache(
  body: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...body };

  // Inject on system message
  if (typeof result.system === "string") {
    result.system = [
      {
        type: "text",
        text: result.system,
        cache_control: { type: "ephemeral" },
      },
    ];
  } else if (Array.isArray(result.system)) {
    const sys = result.system as Array<Record<string, unknown>>;
    if (sys.length > 0) {
      const last = { ...sys[sys.length - 1] };
      last.cache_control = { type: "ephemeral" };
      result.system = [...sys.slice(0, -1), last];
    }
  }

  // Inject on tools boundary
  if (Array.isArray(result.tools) && (result.tools as unknown[]).length > 0) {
    const tools = result.tools as Array<Record<string, unknown>>;
    const last = { ...tools[tools.length - 1] };
    last.cache_control = { type: "ephemeral" };
    result.tools = [...tools.slice(0, -1), last];
  }

  return result;
}
