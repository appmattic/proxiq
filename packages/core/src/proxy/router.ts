const PROXIQ_HEADERS = new Set([
  "x-proxiq-provider",
  "x-proxiq-session-id",
  "x-proxiq-tier",
  "x-proxiq-request-id",
]);

/**
 * Build headers to forward to the upstream provider.
 * - Strips all x-proxiq-* control headers
 * - For Anthropic: converts Authorization: Bearer → x-api-key
 * - Falls back to configKey if no auth header is present in the request
 */
export function buildForwardHeaders(
  incoming: Record<string, string>,
  provider: string,
  configKey?: string
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(incoming)) {
    const lower = key.toLowerCase();
    if (PROXIQ_HEADERS.has(lower)) continue;
    if (lower === "host" || lower === "content-length") continue;
    // When a resolved key is available, strip the client's auth — it may be a
    // Proxiq token that should never reach the upstream provider.
    if (configKey && (lower === "x-api-key" || lower === "authorization"))
      continue;
    result[lower] = value;
  }

  if (configKey) {
    // Inject the resolved upstream key (global config key or per-user override)
    if (provider === "anthropic") {
      result["x-api-key"] = configKey;
    } else {
      result.authorization = `Bearer ${configKey}`;
    }
  } else {
    // No configured key — pass through whatever the client sent, converting
    // Authorization: Bearer → x-api-key for Anthropic
    if (
      provider === "anthropic" &&
      result.authorization &&
      !result["x-api-key"]
    ) {
      const match = result.authorization.match(/^Bearer\s+(.+)$/i);
      if (match) {
        result["x-api-key"] = match[1]!;
        delete result.authorization;
      }
    }
  }

  // Inject required Anthropic headers if missing
  if (provider === "anthropic") {
    if (!result["anthropic-version"]) {
      result["anthropic-version"] = "2023-06-01";
    }
  }

  return result;
}
