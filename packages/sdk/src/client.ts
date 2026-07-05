const DEFAULT_PROXIQ_URL = "http://127.0.0.1:3099";

export function getProxiqBaseUrl(): string {
  return process.env.PROXIQ_URL ?? DEFAULT_PROXIQ_URL;
}

export function isProxiqEnabled(): boolean {
  return process.env.PROXIQ_ENABLED !== "false";
}

/**
 * Wraps an Anthropic or OpenAI SDK client to redirect all requests through Proxiq.
 * Set PROXIQ_ENABLED=false to bypass (useful in test environments).
 *
 * @example
 * import { relay } from '@proxiq/sdk';
 * import Anthropic from '@anthropic-ai/sdk';
 * const client = relay(new Anthropic()); // all calls route through Proxiq
 */
export function relay<T extends object>(client: T): T {
  if (!isProxiqEnabled()) return client;
  (client as Record<string, unknown>).baseURL = getProxiqBaseUrl();
  return client;
}
