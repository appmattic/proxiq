/**
 * Proxiq browser snippet
 *
 * Intercepts fetch() calls to Anthropic/OpenAI and redirects them through
 * a local Proxiq instance. Load this script before your app code.
 *
 * Usage:
 *   window.__proxiqEnabled = true;           // enable (default: true)
 *   window.__proxiqUrl = 'http://127.0.0.1:3099'; // proxy URL
 *   window.__proxiqTier = 'simple';          // optional tier override
 */
(function () {
  const INTERCEPTED_ORIGINS = [
    "https://api.anthropic.com",
    "https://api.openai.com",
    "https://api.groq.com",
  ];

  const PROXIQ_URL =
    window.__proxiqUrl || "http://127.0.0.1:3099";

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    if (window.__proxiqEnabled === false) {
      return originalFetch(input, init);
    }

    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const shouldIntercept = INTERCEPTED_ORIGINS.some((o) => url.startsWith(o));

    if (!shouldIntercept) {
      return originalFetch(input, init);
    }

    // Detect provider from URL
    let provider = "anthropic";
    if (url.includes("openai.com")) provider = "openai";
    else if (url.includes("groq.com")) provider = "groq";

    // Rewrite URL to go through Proxiq
    const parsedUrl = new URL(url);
    const proxiedUrl = PROXIQ_URL + parsedUrl.pathname + parsedUrl.search;

    // Build new headers
    const headers = new Headers(init?.headers);
    headers.set("x-proxiq-provider", provider);
    if (window.__proxiqTier) {
      headers.set("x-proxiq-tier", window.__proxiqTier);
    }

    console.log(`[Proxiq] → ${provider} ${parsedUrl.pathname}`);

    const response = await originalFetch(proxiedUrl, { ...init, headers });

    const tier = response.headers.get("x-proxiq-routed-tier");
    const fromCache = response.headers.get("x-proxiq-from-cache");
    if (tier) console.log(`[Proxiq] routed tier=${tier} cache=${fromCache || "false"}`);

    return response;
  };

  console.log("[Proxiq] Browser intercept active →", PROXIQ_URL);
})();
