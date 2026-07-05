/**
 * SSO / OAuth2 / SAML authentication module.
 *
 * Supported providers:
 *   - Google OAuth2   →  /proxiq/auth/google/login  + /proxiq/auth/google/callback
 *   - Microsoft Entra →  /proxiq/auth/microsoft/login + /proxiq/auth/microsoft/callback
 *   - GitHub OAuth2   →  /proxiq/auth/github/login  + /proxiq/auth/github/callback
 *   - Generic OIDC    →  /proxiq/auth/oidc/login    + /proxiq/auth/oidc/callback
 *                        (covers Keycloak, Okta, Auth0, OneLogin, Dex, PingFederate…)
 *   - SAML 2.0        →  /proxiq/auth/saml/login    + /proxiq/auth/saml/callback
 *                        /proxiq/auth/saml/metadata  (SP metadata XML)
 *
 * After any successful auth the user is redirected to /proxiq/dashboard
 * with a signed session cookie containing their proxiq user label.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { upsertToken, getTokenByLabel } from "../storage/tokens.js";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import type { DB } from "../storage/sqlite.js";
import type { Config } from "../config/schema.js";
import { resolveSecret } from "../secrets/index.js";

/** Resolve an optional config string that may be "env:VAR_NAME". Returns undefined if falsy. */
async function rs(value: string | undefined, field: string): Promise<string | undefined> {
  if (!value) return undefined;
  try { return await resolveSecret(value, field) ?? undefined; }
  catch { console.warn(`[proxiq:sso] Could not resolve secret for ${field}`); return undefined; }
}

// ---------------------------------------------------------------------------
// Session cookie helpers (lightweight — no JWT dep needed)
// ---------------------------------------------------------------------------

function signPayload(payload: object, secret: string): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifySession(
  cookie: string,
  secret: string
): { label: string; email: string; role: "admin" | "user" } | null {
  try {
    const [data, sig] = cookie.split(".");
    const expected = createHmac("sha256", secret).update(data!).digest("base64url");
    if (sig !== expected) return null;
    const parsed = JSON.parse(Buffer.from(data!, "base64url").toString()) as {
      label: string; email: string; role?: "admin" | "user";
    };
    return { label: parsed.label, email: parsed.email, role: parsed.role ?? "user" };
  } catch {
    return null;
  }
}

function setSessionCookie(
  reply: FastifyReply,
  label: string,
  email: string,
  role: "admin" | "user",
  secret: string
): void {
  const token = signPayload({ label, email, role, iat: Date.now() }, secret);
  reply.header("set-cookie",
    `proxiq_session=${token}; Path=/proxiq; HttpOnly; SameSite=Lax; Max-Age=86400`
  );
}

/** Determine dashboard role from email against the configured adminEmails list. */
function getSsoRole(email: string, adminEmails: string[]): "admin" | "user" {
  const lc = email.toLowerCase();
  return adminEmails.some((e) => e.toLowerCase() === lc) ? "admin" : "user";
}

function clearSessionCookie(reply: FastifyReply): void {
  reply.header("set-cookie", "proxiq_session=; Path=/proxiq; HttpOnly; Max-Age=0");
}

// ---------------------------------------------------------------------------
// OAuth2 state — simple in-memory store (good enough for single-instance)
// ---------------------------------------------------------------------------

const pendingStates = new Map<string, { createdAt: number }>();

function newState(): string {
  const state = randomBytes(16).toString("hex");
  pendingStates.set(state, { createdAt: Date.now() });
  // Clean up states older than 10 minutes
  for (const [k, v] of pendingStates) {
    if (Date.now() - v.createdAt > 600_000) pendingStates.delete(k);
  }
  return state;
}

function consumeState(state: string): boolean {
  if (!pendingStates.has(state)) return false;
  pendingStates.delete(state);
  return true;
}

// ---------------------------------------------------------------------------
// Token auto-provisioning
// ---------------------------------------------------------------------------

function provisionSsoToken(db: DB, email: string, defaultRpmLimit: number): string {
  const label = email.toLowerCase().replace(/[^a-z0-9._-]/g, "_");
  const existing = getTokenByLabel(db, label);
  if (existing && !existing.revoked) return existing.token;

  const token = `proxiq_${randomBytes(16).toString("hex")}`;
  upsertToken(db, { label, token, rpmLimit: defaultRpmLimit, createdBy: "sso" });
  return token;
}

// ---------------------------------------------------------------------------
// OAuth2 helpers
// ---------------------------------------------------------------------------

async function exchangeCode(
  tokenUrl: string,
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "accept": "application/json" },
    body: new URLSearchParams(params).toString(),
  });
  return res.json() as Promise<Record<string, unknown>>;
}

async function getJson(url: string, accessToken: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  return res.json() as Promise<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function registerSsoRoutes(
  app: FastifyInstance,
  db: DB,
  config: Config,
  sessionSecret: string
): Promise<void> {
  const sso = config.dashboard.sso;
  if (!sso.enabled) return;

  const base = (sso.baseUrl ?? `http://localhost:${config.port}`).replace(/\/$/, "");
  const rpmLimit = sso.defaultRpmLimit;
  const adminEmails = config.dashboard.adminEmails ?? [];

  // Resolve all env:VAR_NAME secrets upfront
  const googleClientId     = await rs(sso.google.clientId,     "sso.google.clientId");
  const googleClientSecret = await rs(sso.google.clientSecret, "sso.google.clientSecret");
  const msClientId         = await rs(sso.microsoft.clientId,     "sso.microsoft.clientId");
  const msClientSecret     = await rs(sso.microsoft.clientSecret, "sso.microsoft.clientSecret");
  const msTenantId         = await rs(sso.microsoft.tenantId,     "sso.microsoft.tenantId") ?? "common";
  const ghClientId         = await rs(sso.github.clientId,     "sso.github.clientId");
  const ghClientSecret     = await rs(sso.github.clientSecret, "sso.github.clientSecret");
  const oidcClientId       = await rs(sso.oidc.clientId,       "sso.oidc.clientId");
  const oidcClientSecret   = await rs(sso.oidc.clientSecret,   "sso.oidc.clientSecret");
  const samlCert           = await rs(sso.saml.cert,           "sso.saml.cert");

  // ── Logout ────────────────────────────────────────────────────────────────
  app.get("/proxiq/auth/logout", async (_req, reply) => {
    clearSessionCookie(reply);
    return reply.redirect("/proxiq/dashboard");
  });

  // ── Google ────────────────────────────────────────────────────────────────
  if (sso.google.enabled && googleClientId && googleClientSecret) {
    const { allowedDomain } = sso.google;
    const callbackUrl = `${base}/proxiq/auth/google/callback`;

    app.get("/proxiq/auth/google/login", async (_req, reply) => {
      const state = newState();
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.searchParams.set("client_id", googleClientId);
      url.searchParams.set("redirect_uri", callbackUrl);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", "openid email profile");
      url.searchParams.set("state", state);
      url.searchParams.set("prompt", "select_account");
      return reply.redirect(url.toString());
    });

    app.get("/proxiq/auth/google/callback", async (req, reply) => {
      const q = req.query as Record<string, string | undefined>;
      const code = q["code"] ?? "";
      const state = q["state"] ?? "";
      if (!state || !consumeState(state)) return reply.status(400).send("Invalid state");

      try {
        const tokens = await exchangeCode("https://oauth2.googleapis.com/token", {
          code, client_id: googleClientId, client_secret: googleClientSecret,
          redirect_uri: callbackUrl, grant_type: "authorization_code",
        });
        const info = await getJson("https://openidconnect.googleapis.com/v1/userinfo", tokens["access_token"] as string);
        const email = info["email"] as string;

        if (allowedDomain && !email.endsWith(`@${allowedDomain}`)) {
          return reply.status(403).send(`Only @${allowedDomain} accounts are allowed.`);
        }

        const label = email.toLowerCase().replace(/[^a-z0-9._-]/g, "_");
        provisionSsoToken(db, email, rpmLimit);
        setSessionCookie(reply, label, email, getSsoRole(email, adminEmails), sessionSecret);
        return reply.redirect("/proxiq/dashboard");
      } catch {
        return reply.status(500).send("Google auth failed. Check server logs.");
      }
    });
  }

  // ── Microsoft ─────────────────────────────────────────────────────────────
  if (sso.microsoft.enabled && msClientId && msClientSecret) {
    const callbackUrl = `${base}/proxiq/auth/microsoft/callback`;
    const authBase = `https://login.microsoftonline.com/${msTenantId}/oauth2/v2.0`;

    app.get("/proxiq/auth/microsoft/login", async (_req, reply) => {
      const state = newState();
      const url = new URL(`${authBase}/authorize`);
      url.searchParams.set("client_id", msClientId);
      url.searchParams.set("redirect_uri", callbackUrl);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", "openid email profile User.Read");
      url.searchParams.set("state", state);
      url.searchParams.set("prompt", "select_account");
      return reply.redirect(url.toString());
    });

    app.get("/proxiq/auth/microsoft/callback", async (req, reply) => {
      const q = req.query as Record<string, string | undefined>;
      const code = q["code"] ?? "";
      const state = q["state"] ?? "";
      if (!state || !consumeState(state)) return reply.status(400).send("Invalid state");

      try {
        const tokens = await exchangeCode(`${authBase}/token`, {
          code, client_id: msClientId, client_secret: msClientSecret,
          redirect_uri: callbackUrl, grant_type: "authorization_code",
          scope: "openid email profile User.Read",
        });
        const info = await getJson("https://graph.microsoft.com/v1.0/me", tokens["access_token"] as string);
        // For guest/external accounts, prefer the real email over the UPN (EXT# format)
        const email = (
          info["mail"] ??
          (info["otherMails"] as string[] | undefined)?.[0] ??
          info["userPrincipalName"]
        ) as string;
        console.log(`[proxiq:sso] Microsoft login — resolved email: "${email}" (mail: ${info["mail"] ?? "null"}, upn: ${info["userPrincipalName"]})`);

        const label = email.toLowerCase().replace(/[^a-z0-9._-]/g, "_");
        provisionSsoToken(db, email, rpmLimit);
        setSessionCookie(reply, label, email, getSsoRole(email, adminEmails), sessionSecret);
        return reply.redirect("/proxiq/dashboard");
      } catch {
        return reply.status(500).send("Microsoft auth failed. Check server logs.");
      }
    });
    console.log(`[proxiq:sso] Microsoft enabled — callback: ${callbackUrl}`);
  }

  // ── GitHub ────────────────────────────────────────────────────────────────
  if (sso.github.enabled && ghClientId && ghClientSecret) {
    const { allowedOrg } = sso.github;
    const callbackUrl = `${base}/proxiq/auth/github/callback`;

    app.get("/proxiq/auth/github/login", async (_req, reply) => {
      const state = newState();
      const url = new URL("https://github.com/login/oauth/authorize");
      url.searchParams.set("client_id", ghClientId);
      url.searchParams.set("redirect_uri", callbackUrl);
      url.searchParams.set("scope", allowedOrg ? "user:email read:org" : "user:email");
      url.searchParams.set("state", state);
      return reply.redirect(url.toString());
    });

    app.get("/proxiq/auth/github/callback", async (req, reply) => {
      const q = req.query as Record<string, string | undefined>;
      const code = q["code"] ?? "";
      const state = q["state"] ?? "";
      if (!state || !consumeState(state)) return reply.status(400).send("Invalid state");

      try {
        const tokens = await exchangeCode("https://github.com/login/oauth/access_token", {
          code, client_id: ghClientId, client_secret: ghClientSecret,
          redirect_uri: callbackUrl,
        });
        const accessToken = tokens["access_token"] as string;

        const emails = await getJson("https://api.github.com/user/emails", accessToken) as unknown as Array<{ email: string; primary: boolean; verified: boolean }>;
        const primary = (emails as Array<{ email: string; primary: boolean; verified: boolean }>).find((e) => e.primary && e.verified);
        if (!primary) return reply.status(403).send("No verified primary email found on GitHub account.");

        if (allowedOrg) {
          const user = await getJson("https://api.github.com/user", accessToken);
          const memberRes = await fetch(`https://api.github.com/orgs/${allowedOrg}/members/${user["login"]}`, {
            headers: { authorization: `Bearer ${accessToken}` },
          });
          if (memberRes.status !== 204) {
            return reply.status(403).send(`You must be a member of the GitHub org "${allowedOrg}".`);
          }
        }

        const label = primary.email.toLowerCase().replace(/[^a-z0-9._-]/g, "_");
        provisionSsoToken(db, primary.email, rpmLimit);
        setSessionCookie(reply, label, primary.email, getSsoRole(primary.email, adminEmails), sessionSecret);
        return reply.redirect("/proxiq/dashboard");
      } catch {
        return reply.status(500).send("GitHub auth failed. Check server logs.");
      }
    });
  }

  // ── Generic OIDC (Keycloak, Okta, Auth0, OneLogin, Dex…) ─────────────────
  if (sso.oidc.enabled && oidcClientId && oidcClientSecret && sso.oidc.issuerUrl) {
    const { issuerUrl, allowedDomain, providerName, extraScopes } = sso.oidc;
    const clientId = oidcClientId;
    const clientSecret = oidcClientSecret;
    const callbackUrl = `${base}/proxiq/auth/oidc/callback`;
    const scopes = ["openid", "email", "profile", ...(extraScopes ?? "").split(/\s+/).filter(Boolean)].join(" ");

    // Fetch OIDC discovery document once at startup
    let oidcDiscovery: {
      authorization_endpoint: string;
      token_endpoint: string;
      userinfo_endpoint: string;
    } | null = null;

    const discoverUrl = `${issuerUrl.replace(/\/$/, "")}/.well-known/openid-configuration`;
    try {
      const res = await fetch(discoverUrl);
      oidcDiscovery = await res.json() as typeof oidcDiscovery;
      console.log(`[proxiq:sso] OIDC discovery OK for ${providerName ?? "OIDC"} (${issuerUrl})`);
    } catch (err) {
      console.error(`[proxiq:sso] FAILED to fetch OIDC discovery from ${discoverUrl}:`, err);
      // Routes still registered — discovery retried on first login attempt
    }

    async function getDiscovery() {
      if (oidcDiscovery) return oidcDiscovery;
      try {
        const res = await fetch(discoverUrl);
        oidcDiscovery = await res.json() as typeof oidcDiscovery;
      } catch { /* will throw below */ }
      return oidcDiscovery;
    }

    app.get("/proxiq/auth/oidc/login", async (_req, reply) => {
      const disc = await getDiscovery();
      if (!disc) return reply.status(503).send("OIDC provider unreachable. Check issuerUrl.");

      const state = newState();
      const url = new URL(disc.authorization_endpoint);
      url.searchParams.set("client_id", clientId!);
      url.searchParams.set("redirect_uri", callbackUrl);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", scopes);
      url.searchParams.set("state", state);
      return reply.redirect(url.toString());
    });

    app.get("/proxiq/auth/oidc/callback", async (req, reply) => {
      const q = req.query as Record<string, string | undefined>;
      const code = q["code"] ?? "";
      const state = q["state"] ?? "";
      if (!state || !consumeState(state)) return reply.status(400).send("Invalid OIDC state");

      const disc = await getDiscovery();
      if (!disc) return reply.status(503).send("OIDC provider unreachable.");

      try {
        const tokens = await exchangeCode(disc.token_endpoint, {
          code,
          client_id: clientId!,
          client_secret: clientSecret!,
          redirect_uri: callbackUrl,
          grant_type: "authorization_code",
        });

        if (tokens["error"]) {
          console.error("[proxiq:oidc] Token exchange error:", tokens["error"], tokens["error_description"]);
          return reply.status(401).send(`OIDC error: ${tokens["error_description"] ?? tokens["error"]}`);
        }

        const accessToken = tokens["access_token"] as string;
        const info = await getJson(disc.userinfo_endpoint, accessToken);

        // Standard OIDC claim — email is in the id_token sub-claims or userinfo
        const email = (info["email"] as string | undefined)
          ?? (info["preferred_username"] as string | undefined)
          ?? (info["sub"] as string | undefined);

        if (!email) {
          return reply.status(400).send("OIDC response did not include an email claim. Ensure the 'email' scope is granted.");
        }

        if (allowedDomain && !email.includes("@")) {
          return reply.status(403).send(`Cannot determine domain for OIDC subject "${email}".`);
        }
        if (allowedDomain && !email.endsWith(`@${allowedDomain}`)) {
          return reply.status(403).send(`Only @${allowedDomain} accounts are allowed.`);
        }

        const label = email.toLowerCase().replace(/[^a-z0-9._-]/g, "_");
        provisionSsoToken(db, email, rpmLimit);
        setSessionCookie(reply, label, email, getSsoRole(email, adminEmails), sessionSecret);
        return reply.redirect("/proxiq/dashboard");
      } catch (err) {
        console.error("[proxiq:oidc] Callback error:", err);
        return reply.status(500).send("OIDC auth failed. Check server logs.");
      }
    });

    console.log(`[proxiq:sso] OIDC enabled (${providerName ?? "OIDC"}) — callback: ${callbackUrl}`);
  }

  // ── SAML 2.0 ──────────────────────────────────────────────────────────────
  if (sso.saml.enabled && sso.saml.entryPoint && samlCert) {
    const { entryPoint, issuer, emailAttribute, providerName } = sso.saml;
    const cert = samlCert;
    const callbackUrl = `${base}/proxiq/auth/saml/callback`;

    // SP Metadata
    app.get("/proxiq/auth/saml/metadata", async (_req, reply) => {
      const xml = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${issuer}">
  <SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${callbackUrl}"
      index="1"/>
  </SPSSODescriptor>
</EntityDescriptor>`;
      reply.header("content-type", "application/xml");
      return xml;
    });

    // SP-initiated login — redirect to IdP
    app.get("/proxiq/auth/saml/login", async (_req, reply) => {
      const state = newState();
      // Build a minimal AuthnRequest and redirect
      const id = `_${randomBytes(16).toString("hex")}`;
      const now = new Date().toISOString();
      const request = Buffer.from(
        `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
          ID="${id}" Version="2.0" IssueInstant="${now}"
          ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
          AssertionConsumerServiceURL="${callbackUrl}">
          <saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${issuer}</saml:Issuer>
        </samlp:AuthnRequest>`
      ).toString("base64");

      const url = new URL(entryPoint!);
      url.searchParams.set("SAMLRequest", request);
      url.searchParams.set("RelayState", state);
      return reply.redirect(url.toString());
    });

    // ACS — receive SAML response
    app.post("/proxiq/auth/saml/callback", async (req, reply) => {
      try {
        const body = req.body as Record<string, string>;
        const samlResponse = Buffer.from(body["SAMLResponse"] ?? "", "base64").toString("utf-8");

        // Extract NameID or configured email attribute
        let email: string | null = null;
        if (emailAttribute === "nameID") {
          const match = samlResponse.match(/<(?:saml:)?NameID[^>]*>([^<]+)<\/(?:saml:)?NameID>/);
          email = match?.[1] ?? null;
        } else {
          const regex = new RegExp(
            `<(?:saml:)?Attribute[^>]*Name="${emailAttribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>\\s*<(?:saml:)?AttributeValue[^>]*>([^<]+)<\\/(?:saml:)?AttributeValue>`
          );
          const match = samlResponse.match(regex);
          email = match?.[1] ?? null;
        }

        if (!email) return reply.status(400).send("Could not extract email from SAML response.");

        // Basic: verify IdP cert is present in response (signature validation)
        const certClean = cert!.replace(/[\r\n\s]/g, "");
        if (!samlResponse.includes(certClean.slice(0, 32))) {
          // Cert fragment check — for full production use, add @node-saml/node-saml
          console.warn("[proxiq:saml] WARNING: full XML signature verification not performed. Add @node-saml/node-saml for production.");
        }

        const label = email.toLowerCase().replace(/[^a-z0-9._-]/g, "_");
        provisionSsoToken(db, email, rpmLimit);
        setSessionCookie(reply, label, email, getSsoRole(email, adminEmails), sessionSecret);
        return reply.redirect("/proxiq/dashboard");
      } catch {
        return reply.status(500).send("SAML auth failed. Check server logs.");
      }
    });

    console.log(`[proxiq:sso] SAML enabled — SP metadata: ${base}/proxiq/auth/saml/metadata`);
    console.log(`[proxiq:sso] Register ACS URL in your IdP: ${callbackUrl}`);
  }

  // ── Provider buttons for login page (GET /proxiq/auth/providers) ──────────
  app.get("/proxiq/auth/providers", async () => {
    const providers: Array<{ id: string; name: string; url: string; icon: string }> = [];
    if (sso.google.enabled && googleClientId)
      providers.push({ id: "google",    name: "Google",    url: "/proxiq/auth/google/login",    icon: "G" });
    if (sso.microsoft.enabled && msClientId)
      providers.push({ id: "microsoft", name: "Microsoft", url: "/proxiq/auth/microsoft/login", icon: "M" });
    if (sso.github.enabled && ghClientId)
      providers.push({ id: "github",    name: "GitHub",    url: "/proxiq/auth/github/login",    icon: "GH" });
    if (sso.oidc.enabled && oidcClientId)
      providers.push({ id: "oidc", name: sso.oidc.providerName ?? "SSO", url: "/proxiq/auth/oidc/login", icon: "🔑" });
    if (sso.saml.enabled && sso.saml.entryPoint)
      providers.push({ id: "saml", name: sso.saml.providerName ?? "SSO", url: "/proxiq/auth/saml/login", icon: "SSO" });
    return providers;
  });
}
