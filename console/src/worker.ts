type Fetcher = {
  fetch(request: Request): Promise<Response>;
};

export type Env = {
  AGENTID_GATEWAY?: Fetcher;
  AGENTID_GATEWAY_TOKEN?: string;
  ACCESS_AUD?: string;
  ACCESS_JWKS_URL?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_TENANT_CLAIM?: string;
  CONSOLE_ENABLE_MOCK_IDENTITY?: string;
  CONSOLE_ENVIRONMENT?: string;
  CONSOLE_MOCK_EMAIL?: string;
  CONSOLE_MOCK_SUBJECT?: string;
  CONSOLE_MOCK_TENANT_ID?: string;
  CONSOLE_STALE_AFTER_SECONDS?: string;
};

type ConsoleIdentity = {
  email?: string;
  issuer: string;
  subject: string;
  tenantId: string;
};

type GatewayRoute = {
  allowedQuery: ReadonlySet<string>;
  gatewayPath: string;
  tenantId: string;
};

type CachedJwks = {
  expiresAt: number;
  keys: Array<JsonWebKey & { alg?: string; kid?: string; use?: string }>;
};

class ConsoleError extends Error {
  readonly status: number;
  readonly code: string;
  readonly state: "unauthorized" | "forbidden" | "unavailable" | "error";

  constructor(
    status: number,
    code: string,
    message: string,
    state: "unauthorized" | "forbidden" | "unavailable" | "error" = "error",
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.state = state;
  }
}

const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const JWT_CLOCK_SKEW_SECONDS = 60;
const jwksCache = new Map<string, CachedJwks>();

const QUALITY_QUERY = new Set([
  "from",
  "to",
  "profile_key",
  "profile_version",
  "agent_id",
  "verdict",
  "constraint_compliance",
  "limit",
  "cursor",
]);
const PROFILE_QUERY = new Set(["limit", "cursor"]);
const CONTRACT_QUERY = new Set(["job_id", "intent_id", "profile_key", "profile_version", "limit", "cursor"]);
const AUDIT_QUERY = new Set([
  "type",
  "agent_id",
  "intent_id",
  "tool",
  "approval_id",
  "jit_grant_id",
  "limit",
  "cursor",
]);
const APPROVAL_QUERY = new Set(["status", "agent_id", "limit", "cursor"]);
const NO_QUERY = new Set<string>();

const SHELL_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>AgentPass Observability</title>
  <link rel="stylesheet" href="/assets/app.css">
  <script src="/assets/app.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to main content</a>
  <header class="topbar">
    <div>
      <p class="eyebrow">AgentPass</p>
      <h1>Intent observability</h1>
    </div>
    <div class="identity" aria-label="Authenticated context">
      <span data-tenant>Tenant loading…</span>
      <span data-subject>Identity loading…</span>
    </div>
  </header>
  <div class="layout">
    <nav class="section-nav" aria-label="Console sections">
      <a href="#overview" aria-current="page">Overview</a>
      <a href="#jobs">Jobs</a>
      <a href="#job-detail">Job detail</a>
      <a href="#exceptions">Exceptions</a>
    </nav>
    <main id="main" tabindex="-1">
      <section class="status-card" data-status-card data-state="loading" aria-live="polite" aria-atomic="true">
        <div class="status-dot" aria-hidden="true"></div>
        <div>
          <p class="eyebrow">Console connection</p>
          <h2 data-status-title>Authenticating console session</h2>
          <p data-status-detail>Verifying the tenant boundary and private gateway binding.</p>
        </div>
      </section>
      <section class="intro" aria-labelledby="foundation-title">
        <div>
          <p class="eyebrow">Secure foundation</p>
          <h2 id="foundation-title">One tenant. One evidence boundary.</h2>
          <p>The console reads immutable AgentPass evidence through a same-origin BFF. Gateway credentials remain server-side.</p>
        </div>
        <dl>
          <div><dt>Auth</dt><dd>Cloudflare Access</dd></div>
          <div><dt>Gateway</dt><dd>Service binding</dd></div>
          <div><dt>Mode</dt><dd>Read only</dd></div>
        </dl>
      </section>
      <div class="section-grid" aria-label="Planned observability views">
        <section id="overview" class="placeholder-card" tabindex="-1">
          <span class="card-index">01</span>
          <div><h2>Overview</h2><p>Profile-scoped outcomes, confidence, compliance, discipline, and data quality.</p></div>
          <span class="phase">Next slice</span>
        </section>
        <section id="jobs" class="placeholder-card" tabindex="-1">
          <span class="card-index">02</span>
          <div><h2>Jobs</h2><p>Finalized executions with preview history and an explicit freeze boundary.</p></div>
          <span class="phase">Planned</span>
        </section>
        <section id="job-detail" class="placeholder-card" tabindex="-1">
          <span class="card-index">03</span>
          <div><h2>Job detail</h2><p>Aligned decisions, execution receipts, observations, and immutable job evidence.</p></div>
          <span class="phase">Planned</span>
        </section>
        <section id="exceptions" class="placeholder-card" tabindex="-1">
          <span class="card-index">04</span>
          <div><h2>Exceptions</h2><p>Missing evidence, low confidence, denials, retries, replays, and late evidence.</p></div>
          <span class="phase">Planned</span>
        </section>
      </div>
    </main>
  </div>
  <footer>Authenticated and tenant-scoped. No gateway credential is stored in browser JavaScript.</footer>
</body>
</html>`;

const APP_CSS = `:root {
  color-scheme: light;
  --bg: #f2f0ea;
  --surface: #fbfaf6;
  --surface-strong: #ffffff;
  --ink: #16221d;
  --muted: #667069;
  --line: #d8d6cf;
  --green: #164f3c;
  --green-soft: #dce9df;
  --amber: #9d6818;
  --red: #a33831;
  --blue: #315d75;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--ink); line-height: 1.5; }
a { color: inherit; }
.skip-link { position: fixed; left: 12px; top: -80px; z-index: 100; padding: 10px 14px; background: var(--ink); color: white; border-radius: 4px; }
.skip-link:focus { top: 12px; }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 84px; padding: 16px 28px; border-bottom: 1px solid var(--line); background: rgba(251, 250, 246, 0.96); }
h1, h2, p { margin: 0; }
h1 { font-family: Georgia, "Times New Roman", serif; font-size: clamp(1.45rem, 2.5vw, 2rem); font-weight: 500; letter-spacing: -0.025em; }
h2 { font-size: 1rem; line-height: 1.3; }
.eyebrow { margin-bottom: 3px; color: var(--muted); font-size: 0.68rem; font-weight: 800; letter-spacing: 0.13em; text-transform: uppercase; }
.identity { display: grid; gap: 2px; text-align: right; color: var(--muted); font-size: 0.75rem; }
.identity [data-tenant] { color: var(--ink); font-weight: 800; }
.layout { display: grid; grid-template-columns: 190px minmax(0, 1fr); max-width: 1440px; margin: 0 auto; }
.section-nav { position: sticky; top: 0; align-self: start; display: grid; gap: 4px; padding: 28px 18px; }
.section-nav a { padding: 9px 11px; border-left: 2px solid transparent; color: var(--muted); font-size: 0.82rem; font-weight: 700; text-decoration: none; }
.section-nav a:hover, .section-nav a:focus-visible, .section-nav a[aria-current="page"] { border-color: var(--green); color: var(--ink); background: var(--green-soft); outline: none; }
main { min-width: 0; padding: 28px 28px 48px 0; }
.status-card { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 14px; align-items: center; margin-bottom: 16px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); }
.status-card p:last-child { color: var(--muted); font-size: 0.82rem; }
.status-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--blue); box-shadow: 0 0 0 5px color-mix(in srgb, var(--blue) 14%, transparent); }
.status-card[data-state="ready"] .status-dot { background: var(--green); box-shadow: 0 0 0 5px color-mix(in srgb, var(--green) 14%, transparent); }
.status-card[data-state="stale"] .status-dot { background: var(--amber); box-shadow: 0 0 0 5px color-mix(in srgb, var(--amber) 14%, transparent); }
.status-card[data-state="unauthorized"] .status-dot, .status-card[data-state="forbidden"] .status-dot, .status-card[data-state="unavailable"] .status-dot { background: var(--red); box-shadow: 0 0 0 5px color-mix(in srgb, var(--red) 14%, transparent); }
.intro { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(260px, 0.8fr); gap: 28px; padding: clamp(24px, 5vw, 56px); border: 1px solid var(--line); border-radius: 6px; background: var(--surface-strong); }
.intro h2 { max-width: 620px; margin-bottom: 12px; font-family: Georgia, "Times New Roman", serif; font-size: clamp(2rem, 5vw, 4.2rem); font-weight: 400; letter-spacing: -0.045em; }
.intro > div > p:last-child { max-width: 650px; color: var(--muted); font-size: 0.95rem; }
dl { display: grid; align-content: end; margin: 0; border-top: 1px solid var(--line); }
dl div { display: grid; grid-template-columns: 90px 1fr; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 0.78rem; }
dt { color: var(--muted); } dd { margin: 0; font-weight: 800; }
.section-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }
.placeholder-card { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 16px; align-items: start; min-height: 145px; padding: 20px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); }
.placeholder-card:target, .placeholder-card:focus-visible { outline: 3px solid color-mix(in srgb, var(--green) 35%, transparent); outline-offset: 2px; }
.placeholder-card h2 { margin: 2px 0 8px; font-size: 1.05rem; }
.placeholder-card p { color: var(--muted); font-size: 0.82rem; }
.card-index { color: var(--green); font-family: Georgia, "Times New Roman", serif; font-size: 1.25rem; }
.phase { padding: 4px 7px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: 0.65rem; font-weight: 800; text-transform: uppercase; white-space: nowrap; }
footer { padding: 16px 28px; border-top: 1px solid var(--line); color: var(--muted); text-align: center; font-size: 0.72rem; }
@media (max-width: 820px) {
  .topbar { align-items: flex-start; padding: 15px 18px; }
  .layout { display: block; }
  .section-nav { position: static; grid-template-columns: repeat(4, max-content); overflow-x: auto; padding: 10px 14px; border-bottom: 1px solid var(--line); }
  .section-nav a { border-left: 0; border-bottom: 2px solid transparent; }
  main { padding: 16px; }
  .intro { grid-template-columns: 1fr; padding: 28px 22px; }
  .section-grid { grid-template-columns: 1fr; }
}
@media (max-width: 520px) {
  .identity { max-width: 45%; }
  .placeholder-card { grid-template-columns: auto minmax(0, 1fr); }
  .phase { grid-column: 2; justify-self: start; }
}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
`;

const APP_JS = `(() => {
  const card = document.querySelector("[data-status-card]");
  const title = document.querySelector("[data-status-title]");
  const detail = document.querySelector("[data-status-detail]");
  const tenant = document.querySelector("[data-tenant]");
  const subject = document.querySelector("[data-subject]");
  const messages = {
    loading: ["Authenticating console session", "Verifying the tenant boundary and private gateway binding."],
    ready: ["Console foundation is ready", "Access identity and the private AgentPass gateway binding are healthy."],
    stale: ["Gateway data may be stale", "The console is connected, but the upstream freshness threshold has been exceeded."],
    unauthorized: ["Authentication required", "Sign in through the configured Cloudflare Access application."],
    forbidden: ["Tenant access denied", "The authenticated identity is not permitted to use this tenant console."],
    unavailable: ["Console data is unavailable", "The private AgentPass gateway cannot be reached. Try again or contact an operator."]
  };
  function setState(state, customDetail) {
    const message = messages[state] || messages.unavailable;
    card.dataset.state = state;
    title.textContent = message[0];
    detail.textContent = customDetail || message[1];
  }
  async function read(path) {
    const response = await fetch(path, { headers: { accept: "application/json" }, credentials: "same-origin" });
    let body = {};
    try { body = await response.json(); } catch { body = {}; }
    return { response, body };
  }
  function failureState(status) {
    if (status === 401) return "unauthorized";
    if (status === 403) return "forbidden";
    return "unavailable";
  }
  async function start() {
    setState("loading");
    try {
      const session = await read("/api/console/session");
      if (!session.response.ok) {
        setState(failureState(session.response.status), session.body.error && session.body.error.message);
        return;
      }
      tenant.textContent = "Tenant: " + session.body.tenant_id;
      subject.textContent = session.body.email || session.body.subject;
      const health = await read("/api/console/health");
      if (!health.response.ok) {
        setState(failureState(health.response.status), health.body.error && health.body.error.message);
        return;
      }
      setState(health.body.data_state === "stale" ? "stale" : "ready");
    } catch {
      setState("unavailable");
    }
  }
  start();
})();`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    let identity: ConsoleIdentity;
    try {
      identity = await authenticateConsoleRequest(request, env);
    } catch (error) {
      return problemResponse(request, asConsoleError(error));
    }

    try {
      if (request.method === "GET" && url.pathname === "/") {
        return htmlResponse(SHELL_HTML);
      }
      if (request.method === "GET" && url.pathname === "/assets/app.css") {
        return assetResponse(APP_CSS, "text/css; charset=utf-8");
      }
      if (request.method === "GET" && url.pathname === "/assets/app.js") {
        return assetResponse(APP_JS, "text/javascript; charset=utf-8");
      }
      if (request.method === "GET" && url.pathname === "/api/console/session") {
        return jsonResponse({
          authenticated: true,
          tenant_id: identity.tenantId,
          subject: identity.subject,
          ...(identity.email ? { email: identity.email } : {}),
        });
      }
      if (request.method === "GET" && url.pathname === "/api/console/health") {
        return await consoleHealth(identity, env);
      }
      if (url.pathname.startsWith("/api/console/tenants/")) {
        const route = parseGatewayRoute(url, identity);
        if (request.method !== "GET") {
          return problemResponse(request, new ConsoleError(405, "method_not_allowed", "Console gateway routes are read only."));
        }
        return await forwardGateway(request, url, route, env);
      }
      if (request.method !== "GET") {
        return problemResponse(request, new ConsoleError(405, "method_not_allowed", "Method not allowed."));
      }
      return problemResponse(request, new ConsoleError(404, "not_found", "Console route not found."));
    } catch (error) {
      return problemResponse(request, asConsoleError(error));
    }
  },
};

async function authenticateConsoleRequest(request: Request, env: Env): Promise<ConsoleIdentity> {
  const environment = consoleEnvironment(env);
  const mockEnabled = env.CONSOLE_ENABLE_MOCK_IDENTITY === "true";
  if (mockEnabled && environment !== "development") {
    throw new ConsoleError(
      500,
      "unsafe_mock_identity_configuration",
      "Mock console identity is only permitted in the development environment.",
      "unavailable",
    );
  }
  if (environment === "development" && mockEnabled) {
    const tenantId = validateTenantId(env.CONSOLE_MOCK_TENANT_ID, "mock tenant");
    const subject = requiredString(env.CONSOLE_MOCK_SUBJECT, "CONSOLE_MOCK_SUBJECT is required for mock identity");
    return {
      tenantId,
      subject,
      issuer: "agentpass:local-development",
      ...(env.CONSOLE_MOCK_EMAIL ? { email: env.CONSOLE_MOCK_EMAIL } : {}),
    };
  }

  const teamDomain = accessTeamDomain(env);
  const allowedAudiences = requiredString(env.ACCESS_AUD, "ACCESS_AUD is not configured")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (allowedAudiences.length === 0) {
    throw new ConsoleError(500, "access_configuration_invalid", "ACCESS_AUD is not configured.", "unavailable");
  }
  const token = request.headers.get("cf-access-jwt-assertion")?.trim() || "";
  if (!token) {
    throw new ConsoleError(401, "access_token_missing", "Cloudflare Access authentication is required.", "unauthorized");
  }

  const claims = await verifyAccessJwt(token, {
    audiences: allowedAudiences,
    issuer: teamDomain,
    jwksUrl: env.ACCESS_JWKS_URL?.trim() || `${teamDomain}/cdn-cgi/access/certs`,
  });
  const subject = typeof claims.sub === "string" && claims.sub.trim() ? claims.sub.trim() : "";
  if (!subject) {
    throw new ConsoleError(401, "access_subject_missing", "Cloudflare Access token subject is missing.", "unauthorized");
  }
  const tenantClaim = env.ACCESS_TENANT_CLAIM?.trim() || "custom.tenant_id";
  const tenantId = validateTenantId(readClaim(claims, tenantClaim), `Access claim ${tenantClaim}`);
  return {
    tenantId,
    subject,
    issuer: String(claims.iss),
    ...(typeof claims.email === "string" && claims.email ? { email: claims.email } : {}),
  };
}

async function verifyAccessJwt(
  token: string,
  options: { audiences: string[]; issuer: string; jwksUrl: string },
): Promise<Record<string, unknown>> {
  let parsed: ReturnType<typeof parseJwt>;
  try {
    parsed = parseJwt(token);
  } catch {
    throw new ConsoleError(401, "access_token_invalid", "Cloudflare Access token is invalid.", "unauthorized");
  }
  if (parsed.header.alg !== "RS256") {
    throw new ConsoleError(401, "access_token_algorithm_invalid", "Cloudflare Access token algorithm is not allowed.", "unauthorized");
  }
  const kid = typeof parsed.header.kid === "string" ? parsed.header.kid : "";
  if (!kid) {
    throw new ConsoleError(401, "access_token_kid_missing", "Cloudflare Access token key ID is missing.", "unauthorized");
  }
  let keys = await loadJwks(options.jwksUrl);
  let jwk = keys.find((candidate) => candidate.kid === kid && (!candidate.alg || candidate.alg === "RS256"));
  if (!jwk) {
    keys = await loadJwks(options.jwksUrl, true);
    jwk = keys.find((candidate) => candidate.kid === kid && (!candidate.alg || candidate.alg === "RS256"));
  }
  if (!jwk) {
    throw new ConsoleError(401, "access_signing_key_not_found", "Cloudflare Access signing key was not found.", "unauthorized");
  }

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    throw new ConsoleError(503, "access_signing_key_invalid", "Cloudflare Access signing keys are unavailable.", "unavailable");
  }
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(parsed.encodedSignature),
    new TextEncoder().encode(`${parsed.encodedHeader}.${parsed.encodedPayload}`),
  );
  if (!valid) {
    throw new ConsoleError(401, "access_signature_invalid", "Cloudflare Access token signature is invalid.", "unauthorized");
  }

  const claims = parsed.claims;
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== options.issuer) {
    throw new ConsoleError(401, "access_issuer_mismatch", "Cloudflare Access token issuer does not match.", "unauthorized");
  }
  if (!audienceMatches(claims.aud, options.audiences)) {
    throw new ConsoleError(401, "access_audience_mismatch", "Cloudflare Access token audience does not match.", "unauthorized");
  }
  if (claims.type !== "app") {
    throw new ConsoleError(401, "access_token_type_invalid", "Cloudflare Access application token is required.", "unauthorized");
  }
  if (typeof claims.exp !== "number" || claims.exp <= now - JWT_CLOCK_SKEW_SECONDS) {
    throw new ConsoleError(401, "access_token_expired", "Cloudflare Access token is expired.", "unauthorized");
  }
  if (typeof claims.nbf === "number" && claims.nbf > now + JWT_CLOCK_SKEW_SECONDS) {
    throw new ConsoleError(401, "access_token_not_active", "Cloudflare Access token is not active yet.", "unauthorized");
  }
  if (typeof claims.iat === "number" && claims.iat > now + JWT_CLOCK_SKEW_SECONDS) {
    throw new ConsoleError(401, "access_token_issued_in_future", "Cloudflare Access token issue time is invalid.", "unauthorized");
  }
  return claims;
}

async function loadJwks(jwksUrl: string, forceRefresh = false): Promise<CachedJwks["keys"]> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(jwksUrl);
  } catch {
    throw new ConsoleError(500, "access_jwks_url_invalid", "Cloudflare Access JWKS URL is invalid.", "unavailable");
  }
  if (parsedUrl.protocol !== "https:") {
    throw new ConsoleError(500, "access_jwks_url_invalid", "Cloudflare Access JWKS URL must use HTTPS.", "unavailable");
  }
  const cached = forceRefresh ? undefined : jwksCache.get(parsedUrl.href);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;

  let response: Response;
  try {
    response = await fetch(parsedUrl.href, { headers: { accept: "application/json" } });
  } catch {
    throw new ConsoleError(503, "access_jwks_unavailable", "Cloudflare Access signing keys are unavailable.", "unavailable");
  }
  if (!response.ok) {
    throw new ConsoleError(503, "access_jwks_unavailable", "Cloudflare Access signing keys are unavailable.", "unavailable");
  }
  let payload: { keys?: CachedJwks["keys"] };
  try {
    payload = await response.json() as { keys?: CachedJwks["keys"] };
  } catch {
    throw new ConsoleError(503, "access_jwks_invalid", "Cloudflare Access signing keys are invalid.", "unavailable");
  }
  const keys = Array.isArray(payload.keys) ? payload.keys : [];
  if (keys.length === 0) {
    throw new ConsoleError(503, "access_jwks_invalid", "Cloudflare Access signing keys are invalid.", "unavailable");
  }
  jwksCache.set(parsedUrl.href, { keys, expiresAt: Date.now() + JWKS_CACHE_TTL_MS });
  return keys;
}

function parseGatewayRoute(url: URL, identity: ConsoleIdentity): GatewayRoute {
  const rawParts = url.pathname.split("/").filter(Boolean);
  if (rawParts.length < 5 || rawParts[0] !== "api" || rawParts[1] !== "console" || rawParts[2] !== "tenants") {
    throw new ConsoleError(404, "gateway_route_not_found", "Console gateway route not found.");
  }
  const parts = rawParts.map(decodePathSegment);
  const routeTenant = validateTenantId(parts[3], "route tenant");
  if (routeTenant !== identity.tenantId) {
    throw new ConsoleError(403, "tenant_mismatch", "Authenticated tenant does not match the requested route.", "forbidden");
  }
  for (const forbidden of ["tenant", "tenant_id", "route_tenant_id"]) {
    if (url.searchParams.has(forbidden)) {
      throw new ConsoleError(400, "tenant_override_not_allowed", "Tenant selection is derived from Cloudflare Access.");
    }
  }

  const suffix = parts.slice(4);
  let allowedQuery: ReadonlySet<string>;
  if (sameSegments(suffix, ["health"])) {
    allowedQuery = NO_QUERY;
  } else if (sameSegments(suffix, ["intent-quality", "rollups"])) {
    allowedQuery = QUALITY_QUERY;
  } else if (suffix[0] === "intent-profiles" && (suffix.length === 1 || suffix.length === 2)) {
    allowedQuery = suffix.length === 1 ? PROFILE_QUERY : NO_QUERY;
  } else if (suffix[0] === "intent-contracts" && (suffix.length === 1 || suffix.length === 2)) {
    allowedQuery = suffix.length === 1 ? CONTRACT_QUERY : NO_QUERY;
  } else if (sameSegments(suffix, ["audit", "events"])) {
    allowedQuery = AUDIT_QUERY;
  } else if (suffix[0] === "approvals" && (suffix.length === 1 || suffix.length === 2)) {
    allowedQuery = suffix.length === 1 ? APPROVAL_QUERY : NO_QUERY;
  } else {
    throw new ConsoleError(404, "gateway_route_not_allowed", "Gateway route is not available to the console.");
  }
  for (const segment of suffix) validateResourceSegment(segment);
  for (const key of url.searchParams.keys()) {
    if (!allowedQuery.has(key)) {
      throw new ConsoleError(400, "query_parameter_not_allowed", `Query parameter is not allowed: ${key}`);
    }
  }
  return {
    tenantId: identity.tenantId,
    allowedQuery,
    gatewayPath: `/tenants/${encodeURIComponent(identity.tenantId)}/${suffix.map(encodeURIComponent).join("/")}`,
  };
}

async function forwardGateway(request: Request, url: URL, route: GatewayRoute, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    throw new ConsoleError(405, "method_not_allowed", "Console gateway routes are read only.");
  }
  const query = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (route.allowedQuery.has(key)) query.append(key, value);
  }
  return callGateway(route.gatewayPath, query, env);
}

async function consoleHealth(identity: ConsoleIdentity, env: Env): Promise<Response> {
  const response = await callGateway(
    `/tenants/${encodeURIComponent(identity.tenantId)}/health`,
    new URLSearchParams(),
    env,
  );
  if (!response.ok) return response;
  const dataState = response.headers.get("x-agentpass-console-data-state") || "unknown";
  return jsonResponse({
    ok: true,
    console: "ready",
    gateway: "ready",
    tenant_id: identity.tenantId,
    data_state: dataState,
    checked_at: new Date().toISOString(),
  }, 200, { "x-agentpass-console-data-state": dataState });
}

async function callGateway(path: string, query: URLSearchParams, env: Env): Promise<Response> {
  if (!env.AGENTID_GATEWAY) {
    throw new ConsoleError(503, "gateway_binding_unavailable", "AgentPass gateway is unavailable.", "unavailable");
  }
  if (consoleEnvironment(env) === "production" && !env.AGENTID_GATEWAY_TOKEN) {
    throw new ConsoleError(500, "gateway_credential_missing", "AgentPass gateway credential is not configured.", "unavailable");
  }
  const target = new URL(`https://agentpass-gateway.internal${path}`);
  target.search = query.toString();
  const headers = new Headers({
    accept: "application/json",
    "user-agent": "agentpass-observability-console/0.1",
  });
  if (env.AGENTID_GATEWAY_TOKEN) headers.set("authorization", `Bearer ${env.AGENTID_GATEWAY_TOKEN}`);

  let upstream: Response;
  try {
    upstream = await env.AGENTID_GATEWAY.fetch(new Request(target, { method: "GET", headers }));
  } catch {
    throw new ConsoleError(503, "gateway_unavailable", "AgentPass gateway is unavailable.", "unavailable");
  }
  if (upstream.status === 401 || upstream.status === 403) {
    throw new ConsoleError(502, "gateway_authorization_failed", "AgentPass gateway authorization failed.", "unavailable");
  }
  if (upstream.status >= 500) {
    throw new ConsoleError(503, "gateway_unavailable", "AgentPass gateway is unavailable.", "unavailable");
  }
  if (upstream.status !== 204 && upstream.status !== 304) {
    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new ConsoleError(502, "gateway_response_invalid", "AgentPass gateway returned an invalid response.", "unavailable");
    }
  }

  const dataState = upstreamDataState(upstream.headers, env);
  const headersOut = secureHeaders("application/json; charset=utf-8");
  for (const name of ["content-type", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headersOut.set(name, value);
  }
  headersOut.set("x-agentpass-console-data-state", dataState);
  return new Response(upstream.body, { status: upstream.status, headers: headersOut });
}

function upstreamDataState(headers: Headers, env: Env): "fresh" | "stale" | "unknown" {
  const generatedAt = headers.get("x-agentpass-generated-at") || headers.get("date");
  if (!generatedAt) return "unknown";
  const timestamp = Date.parse(generatedAt);
  if (!Number.isFinite(timestamp)) return "unknown";
  const configured = Number(env.CONSOLE_STALE_AFTER_SECONDS || "300");
  const staleAfterSeconds = Number.isFinite(configured) && configured > 0 ? Math.min(configured, 86_400) : 300;
  return Date.now() - timestamp > staleAfterSeconds * 1000 ? "stale" : "fresh";
}

function problemResponse(request: Request, error: ConsoleError): Response {
  if (requestAcceptsHtml(request)) {
    const title = error.status === 401
      ? "Authentication required"
      : error.status === 403
        ? "Tenant access denied"
        : "Console unavailable";
    const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body><main><h1>${title}</h1><p>${escapeHtml(error.message)}</p></main></body></html>`;
    return htmlResponse(body, error.status, "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  }
  return jsonResponse({
    error: { code: error.code, message: error.message },
    state: error.state,
  }, error.status, error.status === 405 ? { allow: "GET" } : undefined);
}

function htmlResponse(body: string, status = 200, csp?: string): Response {
  const headers = secureHeaders("text/html; charset=utf-8");
  headers.set(
    "content-security-policy",
    csp || "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
  return new Response(body, { status, headers });
}

function assetResponse(body: string, contentType: string): Response {
  return new Response(body, { headers: secureHeaders(contentType) });
}

function jsonResponse(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  const headers = secureHeaders("application/json; charset=utf-8");
  for (const [name, value] of Object.entries(extraHeaders || {})) headers.set(name, value);
  return new Response(JSON.stringify(body), { status, headers });
}

function secureHeaders(contentType: string): Headers {
  return new Headers({
    "cache-control": "private, no-store, max-age=0",
    "content-type": contentType,
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    pragma: "no-cache",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });
}

function requestAcceptsHtml(request: Request): boolean {
  const pathname = new URL(request.url).pathname;
  return pathname === "/" || (request.headers.get("accept") || "").includes("text/html");
}

function consoleEnvironment(env: Env): string {
  const environment = env.CONSOLE_ENVIRONMENT?.trim().toLowerCase() || "production";
  if (environment !== "production" && environment !== "development") {
    throw new ConsoleError(
      500,
      "console_environment_invalid",
      "CONSOLE_ENVIRONMENT must be production or development.",
      "unavailable",
    );
  }
  return environment;
}

function accessTeamDomain(env: Env): string {
  const configured = requiredString(env.ACCESS_TEAM_DOMAIN, "ACCESS_TEAM_DOMAIN is not configured");
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new ConsoleError(500, "access_team_domain_invalid", "ACCESS_TEAM_DOMAIN is invalid.", "unavailable");
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.pathname !== "/" && url.pathname !== "")) {
    throw new ConsoleError(500, "access_team_domain_invalid", "ACCESS_TEAM_DOMAIN must be an HTTPS origin.", "unavailable");
  }
  return url.origin;
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ConsoleError(500, "console_configuration_missing", message, "unavailable");
  }
  return value.trim();
}

function validateTenantId(value: unknown, source: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ConsoleError(403, "tenant_claim_missing", `${source} is missing.`, "forbidden");
  }
  const tenantId = value.trim();
  if (tenantId.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(tenantId)) {
    throw new ConsoleError(403, "tenant_claim_invalid", `${source} is invalid.`, "forbidden");
  }
  return tenantId;
}

function validateResourceSegment(value: string): void {
  if (!value || value.length > 256 || /[\u0000-\u001f/\\]/.test(value)) {
    throw new ConsoleError(400, "gateway_resource_invalid", "Gateway resource path is invalid.");
  }
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new ConsoleError(400, "gateway_path_invalid", "Gateway path encoding is invalid.");
  }
}

function sameSegments(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function readClaim(claims: Record<string, unknown>, path: string): unknown {
  let value: unknown = claims;
  for (const part of path.split(".").filter(Boolean)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function audienceMatches(value: unknown, allowed: string[]): boolean {
  const actual = Array.isArray(value) ? value.map(String) : typeof value === "string" ? [value] : [];
  return actual.some((audience) => allowed.includes(audience));
}

function parseJwt(token: string): {
  claims: Record<string, unknown>;
  encodedHeader: string;
  encodedPayload: string;
  encodedSignature: string;
  header: Record<string, unknown>;
} {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error("invalid JWT");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = JSON.parse(base64UrlDecode(encodedHeader)) as Record<string, unknown>;
  const claims = JSON.parse(base64UrlDecode(encodedPayload)) as Record<string, unknown>;
  if (!header || typeof header !== "object" || !claims || typeof claims !== "object") throw new Error("invalid JWT");
  return { claims, encodedHeader, encodedPayload, encodedSignature, header };
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

function base64UrlToBytes(value: string): Uint8Array {
  return Uint8Array.from(base64UrlDecode(value), (character) => character.charCodeAt(0));
}

function asConsoleError(error: unknown): ConsoleError {
  return error instanceof ConsoleError
    ? error
    : new ConsoleError(500, "console_internal_error", "Console request failed.", "unavailable");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}
