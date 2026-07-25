import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import test, { after } from "node:test";

import worker, { type Env } from "../src/worker.ts";

type GatewayCall = {
  headers: Headers;
  method: string;
  url: string;
};

const TEAM_DOMAIN = "https://agentpass-test.cloudflareaccess.com";
const ACCESS_AUD = "agentpass-console-aud";
const ACCESS_KID = "agentpass-console-test-key";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const { privateKey: otherPrivateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = {
  ...(publicKey.export({ format: "jwk" }) as JsonWebKey),
  alg: "RS256",
  kid: ACCESS_KID,
  use: "sig",
};

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
  const url = input instanceof Request ? input.url : String(input);
  if (url === `${TEAM_DOMAIN}/cdn-cgi/access/certs`) {
    return json({ keys: [publicJwk] });
  }
  if (url === "https://access-unavailable.test/certs") {
    return json({ error: "unavailable" }, 503);
  }
  throw new Error(`unexpected global fetch: ${url}`);
};

after(() => {
  globalThis.fetch = originalFetch;
});

test("requires a validated Cloudflare Access identity before serving the shell", async () => {
  const calls: GatewayCall[] = [];
  const response = await worker.fetch(
    new Request("https://console.test/", { headers: { accept: "text/html" } }),
    baseEnv(calls),
  );

  assert.equal(response.status, 401);
  assert.match(await response.text(), /Authentication required/);
  assert.equal(calls.length, 0);
});

test("rejects a token with an invalid signature", async () => {
  const response = await worker.fetch(
    accessRequest("/api/console/session", {}, {}, otherPrivateKey),
    baseEnv([]),
  );

  assert.equal(response.status, 401);
  assert.equal((await response.json() as any).error.code, "access_signature_invalid");
});

test("validates Access issuer, audience, and expiry claims", async () => {
  const now = Math.floor(Date.now() / 1000);
  const cases = [
    [{ iss: "https://other.cloudflareaccess.com" }, "access_issuer_mismatch"],
    [{ aud: ["another-application"] }, "access_audience_mismatch"],
    [{ exp: now - 120 }, "access_token_expired"],
  ] as const;

  for (const [claims, expectedCode] of cases) {
    const response = await worker.fetch(accessRequest("/api/console/session", {}, claims), baseEnv([]));
    assert.equal(response.status, 401);
    assert.equal((await response.json() as any).error.code, expectedCode);
  }
});

test("serves an accessible shell without embedding gateway credentials", async () => {
  const response = await worker.fetch(accessRequest("/", { headers: { accept: "text/html" } }), baseEnv([]));
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy") || "", /default-src 'self'/);
  assert.match(body, /Skip to main content/);
  assert.match(body, /aria-label="Console sections"/);
  assert.match(body, /data-overview-filters/);
  assert.match(body, /Finalized intent executions/);
  assert.match(body, /Overview/);
  assert.match(body, /Job detail/);
  assert.match(body, /Exceptions/);
  assert.doesNotMatch(body, /gateway-secret/);
});

test("serves a standalone overview client asset without credentials", async () => {
  const response = await worker.fetch(accessRequest("/assets/app.js"), baseEnv([]));
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/javascript/);
  assert.match(body, /intent-quality/);
  assert.match(body, /profile_digest/);
  assert.doesNotMatch(body, /gateway-secret|AGENTID_GATEWAY_TOKEN/);
  assert.doesNotThrow(() => new Function(body));
});

test("derives tenant identity only from the verified Access claim", async () => {
  const request = accessRequest("/api/console/session", {
    headers: {
      authorization: "Bearer browser-controlled-token",
      "x-agentid-tenant-id": "tenant-evil",
      "x-forwarded-user": "browser-controlled-user",
    },
  });
  const response = await worker.fetch(request, baseEnv([]));
  const body = await response.json() as any;

  assert.equal(response.status, 200);
  assert.equal(body.tenant_id, "tenant-alpha");
  assert.equal(body.subject, "operator-123");
  assert.equal(body.email, "operator@example.com");
  assert.equal(JSON.stringify(body).includes("tenant-evil"), false);
});

test("rejects a route tenant mismatch before calling the gateway", async () => {
  const calls: GatewayCall[] = [];
  const response = await worker.fetch(
    accessRequest("/api/console/tenants/tenant-beta/intent-quality/rollups?from=2026-07-01T00%3A00%3A00Z&to=2026-07-02T00%3A00%3A00Z"),
    baseEnv(calls),
  );

  assert.equal(response.status, 403);
  assert.equal((await response.json() as any).error.code, "tenant_mismatch");
  assert.equal(calls.length, 0);
});

test("reconstructs an allowlisted gateway request and strips browser-controlled headers", async () => {
  const calls: GatewayCall[] = [];
  const response = await worker.fetch(
    accessRequest(
      "/api/console/tenants/tenant-alpha/intent-quality/rollups?from=2026-07-01T00%3A00%3A00Z&to=2026-07-02T00%3A00%3A00Z&limit=20",
      {
        headers: {
          authorization: "Bearer browser-controlled-token",
          "x-agentid-tenant-id": "tenant-evil",
          "x-forwarded-host": "evil.example",
          "x-forwarded-user": "browser-controlled-user",
        },
      },
    ),
    baseEnv(calls, () => json({ groups: [], sample_size: 0 }, 200, { date: new Date().toUTCString() })),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("x-agentpass-console-data-state"), "fresh");
  assert.match(response.headers.get("x-agentpass-console-generated-at") || "", /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(Number.isFinite(Number(response.headers.get("x-agentpass-console-data-age-seconds"))), true);
  assert.deepEqual(await response.json(), { groups: [], sample_size: 0 });
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call.method, "GET");
  assert.equal(
    call.url,
    "https://agentpass-gateway.internal/tenants/tenant-alpha/intent-quality/rollups?from=2026-07-01T00%3A00%3A00Z&to=2026-07-02T00%3A00%3A00Z&limit=20",
  );
  assert.equal(call.headers.get("authorization"), "Bearer gateway-secret");
  assert.equal(call.headers.get("x-agentid-tenant-id"), null);
  assert.equal(call.headers.get("x-forwarded-host"), null);
  assert.equal(call.headers.get("cf-access-jwt-assertion"), null);
  assert.equal(call.headers.get("user-agent"), "agentpass-observability-console/0.1");
});

test("rejects tenant query overrides and unknown query parameters before forwarding", async () => {
  const calls: GatewayCall[] = [];
  const tenantOverride = await worker.fetch(
    accessRequest("/api/console/tenants/tenant-alpha/intent-quality/rollups?tenant_id=tenant-beta"),
    baseEnv(calls),
  );
  const unknownQuery = await worker.fetch(
    accessRequest("/api/console/tenants/tenant-alpha/intent-quality/rollups?debug=true"),
    baseEnv(calls),
  );

  assert.equal(tenantOverride.status, 400);
  assert.equal((await tenantOverride.json() as any).error.code, "tenant_override_not_allowed");
  assert.equal(unknownQuery.status, 400);
  assert.equal((await unknownQuery.json() as any).error.code, "query_parameter_not_allowed");
  assert.equal(calls.length, 0);
});

test("keeps the BFF read only and rejects routes outside the allowlist", async () => {
  const calls: GatewayCall[] = [];
  const write = await worker.fetch(
    accessRequest("/api/console/tenants/tenant-alpha/intent-quality/rollups", { method: "POST" }),
    baseEnv(calls),
  );
  const unknown = await worker.fetch(
    accessRequest("/api/console/tenants/tenant-alpha/authorize"),
    baseEnv(calls),
  );

  assert.equal(write.status, 405);
  assert.equal(write.headers.get("allow"), "GET");
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json() as any).error.code, "gateway_route_not_allowed");
  assert.equal(calls.length, 0);
});

test("exposes only the planned read-side extension routes", async () => {
  const calls: GatewayCall[] = [];
  const paths = [
    "/api/console/tenants/tenant-alpha/health",
    "/api/console/tenants/tenant-alpha/intent-profiles",
    "/api/console/tenants/tenant-alpha/intent-profiles/support_refund.v1%401.0.0",
    "/api/console/tenants/tenant-alpha/intent-contracts?job_id=job-1",
    "/api/console/tenants/tenant-alpha/intent-contracts/intent-1",
    "/api/console/tenants/tenant-alpha/audit/events?intent_id=intent-1",
    "/api/console/tenants/tenant-alpha/approvals?status=pending",
    "/api/console/tenants/tenant-alpha/approvals/approval-1",
  ];

  for (const path of paths) {
    const response = await worker.fetch(accessRequest(path), baseEnv(calls));
    assert.equal(response.status, 200, path);
  }
  assert.equal(calls.length, paths.length);
  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
    "/tenants/tenant-alpha/health",
    "/tenants/tenant-alpha/intent-profiles",
    "/tenants/tenant-alpha/intent-profiles/support_refund.v1%401.0.0",
    "/tenants/tenant-alpha/intent-contracts",
    "/tenants/tenant-alpha/intent-contracts/intent-1",
    "/tenants/tenant-alpha/audit/events",
    "/tenants/tenant-alpha/approvals",
    "/tenants/tenant-alpha/approvals/approval-1",
  ]);
});

test("reports a gateway failure without exposing upstream details", async () => {
  const calls: GatewayCall[] = [];
  const env = baseEnv(calls);
  env.AGENTID_GATEWAY = {
    async fetch(request: Request): Promise<Response> {
      capture(calls, request);
      throw new Error("internal gateway secret detail");
    },
  };
  const response = await worker.fetch(accessRequest("/api/console/health"), env);
  const text = await response.text();

  assert.equal(response.status, 503);
  assert.match(text, /AgentPass gateway is unavailable/);
  assert.doesNotMatch(text, /internal gateway secret detail/);
  assert.equal(calls.length, 1);
});

test("marks old gateway responses stale and sanitizes health output", async () => {
  const oldDate = new Date(Date.now() - 60_000).toUTCString();
  const env = {
    ...baseEnv([], () => json({ ok: true, auth: { token: "should-not-leak" }, internal: "hidden" }, 200, { date: oldDate })),
    CONSOLE_STALE_AFTER_SECONDS: "10",
  };
  const response = await worker.fetch(accessRequest("/api/console/health"), env);
  const body = await response.json() as any;

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-agentpass-console-data-state"), "stale");
  assert.match(response.headers.get("x-agentpass-console-generated-at") || "", /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(Number(response.headers.get("x-agentpass-console-data-age-seconds")) >= 59, true);
  assert.equal(body.data_state, "stale");
  assert.match(body.generated_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(body.age_seconds >= 59, true);
  assert.equal(body.gateway, "ready");
  assert.equal(body.tenant_id, "tenant-alpha");
  assert.equal(JSON.stringify(body).includes("should-not-leak"), false);
  assert.equal(JSON.stringify(body).includes("hidden"), false);
});

test("allows mock identity only in an explicitly configured development environment", async () => {
  const development: Env = {
    CONSOLE_ENVIRONMENT: "development",
    CONSOLE_ENABLE_MOCK_IDENTITY: "true",
    CONSOLE_MOCK_TENANT_ID: "tenant-local",
    CONSOLE_MOCK_SUBJECT: "local-operator",
  };
  const localResponse = await worker.fetch(new Request("https://console.test/api/console/session"), development);
  assert.equal(localResponse.status, 200);
  assert.equal((await localResponse.json() as any).tenant_id, "tenant-local");

  const productionResponse = await worker.fetch(
    new Request("https://console.test/api/console/session"),
    { ...development, CONSOLE_ENVIRONMENT: "production" },
  );
  assert.equal(productionResponse.status, 500);
  assert.equal((await productionResponse.json() as any).error.code, "unsafe_mock_identity_configuration");

  const ambiguousEnvironment = await worker.fetch(
    new Request("https://console.test/api/console/session"),
    { ...development, CONSOLE_ENVIRONMENT: "prod" },
  );
  assert.equal(ambiguousEnvironment.status, 500);
  assert.equal((await ambiguousEnvironment.json() as any).error.code, "console_environment_invalid");
});

test("fails closed when the tenant claim or Access signing keys are unavailable", async () => {
  const missingTenant = await worker.fetch(
    accessRequest("/api/console/session", {}, { custom: {} }),
    baseEnv([]),
  );
  assert.equal(missingTenant.status, 403);
  assert.equal((await missingTenant.json() as any).error.code, "tenant_claim_missing");

  const keysUnavailable = await worker.fetch(
    accessRequest("/api/console/session"),
    { ...baseEnv([]), ACCESS_JWKS_URL: "https://access-unavailable.test/certs" },
  );
  assert.equal(keysUnavailable.status, 503);
  assert.equal((await keysUnavailable.json() as any).error.code, "access_jwks_unavailable");
});

function baseEnv(
  calls: GatewayCall[],
  responder: (request: Request) => Response | Promise<Response> = () => json({ ok: true }, 200, { date: new Date().toUTCString() }),
): Env {
  return {
    ACCESS_AUD,
    ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
    ACCESS_TENANT_CLAIM: "custom.tenant_id",
    AGENTID_GATEWAY_TOKEN: "gateway-secret",
    CONSOLE_ENVIRONMENT: "production",
    AGENTID_GATEWAY: {
      async fetch(request: Request): Promise<Response> {
        capture(calls, request);
        return responder(request);
      },
    },
  };
}

function accessRequest(
  path: string,
  init: RequestInit = {},
  claims: Record<string, unknown> = {},
  signingKey = privateKey,
): Request {
  const headers = new Headers(init.headers);
  headers.set("accept", headers.get("accept") || "application/json");
  headers.set("cf-access-jwt-assertion", signAccessToken(claims, signingKey));
  return new Request(`https://console.test${path}`, { ...init, headers });
}

function signAccessToken(claims: Record<string, unknown>, signingKey = privateKey): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "RS256", kid: ACCESS_KID, typ: "JWT" });
  const payload = base64UrlJson({
    aud: [ACCESS_AUD],
    email: "operator@example.com",
    exp: now + 300,
    iat: now - 5,
    iss: TEAM_DOMAIN,
    nbf: now - 5,
    sub: "operator-123",
    type: "app",
    custom: { tenant_id: "tenant-alpha" },
    ...claims,
  });
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  const signature = signer.sign(signingKey).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function capture(calls: GatewayCall[], request: Request): void {
  calls.push({ headers: new Headers(request.headers), method: request.method, url: request.url });
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
