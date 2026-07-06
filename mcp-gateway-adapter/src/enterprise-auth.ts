import { createPublicKey, createVerify } from "node:crypto";

import type { AdapterConfig, EnterpriseJwtClaimMapping, EnterpriseJwtConfig, JsonWebKeySet, RequestContext } from "./types.js";

const DEFAULT_ENTERPRISE_JWKS_CACHE_TTL_MS = 300_000;
const DEFAULT_ENTERPRISE_JWKS_STALE_IF_ERROR_MS = 300_000;
const enterpriseJwksCache = new Map<string, { jwks: JsonWebKeySet; expiresAt: number; staleUntil: number }>();

export type EnterpriseAuthResolution =
  | {
      ok: true;
      context: RequestContext;
    }
  | {
      ok: false;
      findings: string[];
    };

export async function resolveEnterpriseAuthContext(
  config: AdapterConfig,
  context: RequestContext,
  fetchImpl: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): Promise<EnterpriseAuthResolution> {
  const jwtConfig = config.enterprise_auth?.jwt;
  if (!jwtConfig) return { ok: true, context };

  const token = context.bearerToken;
  if (!token) return { ok: false, findings: ["enterprise bearer token is required"] };

  const verified = await verifyEnterpriseJwt(token, jwtConfig, fetchImpl, now);
  if (!verified.ok) return verified;

  const mapped = mapClaimsToContext(verified.header, verified.claims, jwtConfig.claim_mapping);
  return {
    ok: true,
    context: {
      ...context,
      agentId: context.agentId || mapped.agentId,
      tenantId: context.tenantId || mapped.tenantId,
      userId: context.userId || mapped.userId,
      enterpriseAuth: mapped.enterpriseAuth,
    },
  };
}

async function verifyEnterpriseJwt(
  token: string,
  config: EnterpriseJwtConfig,
  fetchImpl: typeof fetch,
  now: () => Date,
): Promise<
  | {
      ok: true;
      header: Record<string, unknown>;
      claims: Record<string, unknown>;
    }
  | {
      ok: false;
      findings: string[];
    }
> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, findings: ["enterprise JWT compact serialization is invalid"] };

  const header = parseBase64UrlJson(parts[0]);
  const claims = parseBase64UrlJson(parts[1]);
  if (!isRecord(header)) return { ok: false, findings: ["enterprise JWT header is invalid"] };
  if (!isRecord(claims)) return { ok: false, findings: ["enterprise JWT claims are invalid"] };

  const findings: string[] = [];
  const allowedAlgorithms = config.allowed_algorithms || ["RS256"];
  const alg = stringValue(header.alg);
  if (!allowedAlgorithms.includes(alg)) findings.push(`enterprise JWT alg is not allowed: ${alg}`);

  const jwks = await resolveJwks(config, fetchImpl, now);
  if (!jwks) findings.push("enterprise JWT JWKS is required");
  let key = jwks ? jwkForHeader(jwks, header) : undefined;
  if (!key && config.jwks_uri && !config.jwks) {
    const refreshedJwks = await resolveJwks(config, fetchImpl, now, true).catch(() => jwks);
    key = refreshedJwks ? jwkForHeader(refreshedJwks, header) : undefined;
  }
  if (!key) findings.push(`enterprise JWT key not found: ${stringValue(header.kid) || "missing-kid"}`);

  if (findings.length || !key) return { ok: false, findings };

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  if (!verifier.verify(createPublicKey({ key, format: "jwk" }), Buffer.from(parts[2], "base64url"))) {
    findings.push("enterprise JWT signature invalid");
  }

  if (config.issuer && stringValue(claims.iss) !== config.issuer) findings.push("enterprise JWT issuer mismatch");
  if (config.audience && !audienceMatches(claims.aud, config.audience)) findings.push("enterprise JWT audience mismatch");

  const nowSeconds = Math.floor(now().getTime() / 1000);
  if (typeof claims.exp === "number" && claims.exp <= nowSeconds) findings.push("enterprise JWT is expired");
  if (typeof claims.nbf === "number" && claims.nbf > nowSeconds) findings.push("enterprise JWT not before is in the future");
  if (typeof claims.iat === "number" && claims.iat > nowSeconds) findings.push("enterprise JWT issued_at is in the future");

  const scopes = valuesFromClaim(claimValue(claims, config.claim_mapping?.scopes || "scope"));
  for (const scope of config.required_scopes || []) {
    if (!scopes.includes(scope)) findings.push(`enterprise JWT missing required scope: ${scope}`);
  }

  const groups = valuesFromClaim(claimValue(claims, config.claim_mapping?.groups || "groups"));
  for (const group of config.required_groups || []) {
    if (!groups.includes(group)) findings.push(`enterprise JWT missing required group: ${group}`);
  }

  return findings.length ? { ok: false, findings } : { ok: true, header, claims };
}

async function resolveJwks(
  config: EnterpriseJwtConfig,
  fetchImpl: typeof fetch,
  now: () => Date,
  forceRefresh = false,
): Promise<JsonWebKeySet | undefined> {
  if (config.jwks) return config.jwks;
  if (!config.jwks_uri) return undefined;

  const current = now().getTime();
  const cached = enterpriseJwksCache.get(config.jwks_uri);
  if (cached && !forceRefresh && cached.expiresAt > current) return cached.jwks;

  try {
    const jwks = await fetchJwks(config.jwks_uri, fetchImpl);
    const ttlMs = Math.max(config.jwks_cache_ttl_ms ?? DEFAULT_ENTERPRISE_JWKS_CACHE_TTL_MS, 0);
    const staleIfErrorMs = Math.max(config.jwks_stale_if_error_ms ?? DEFAULT_ENTERPRISE_JWKS_STALE_IF_ERROR_MS, 0);
    enterpriseJwksCache.set(config.jwks_uri, {
      jwks,
      expiresAt: current + ttlMs,
      staleUntil: current + ttlMs + staleIfErrorMs,
    });
    return jwks;
  } catch (error) {
    if (cached && cached.staleUntil > current) return cached.jwks;
    throw error;
  }
}

async function fetchJwks(jwksUri: string, fetchImpl: typeof fetch): Promise<JsonWebKeySet> {
  const response = await fetchImpl(jwksUri, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`failed to fetch enterprise JWT JWKS: ${response.status}`);
  const payload = await response.json();
  if (!isRecord(payload) || ("keys" in payload && !Array.isArray(payload.keys))) {
    throw new Error("enterprise JWT JWKS response must be a JSON object with a keys array");
  }
  return payload as JsonWebKeySet;
}

function mapClaimsToContext(
  header: Record<string, unknown>,
  claims: Record<string, unknown>,
  mapping: EnterpriseJwtClaimMapping = {},
): Pick<RequestContext, "agentId" | "tenantId" | "userId" | "enterpriseAuth"> {
  const subject = stringOrUndefined(claimValue(claims, mapping.subject || "sub"));
  const tokenAudience = stringOrUndefined(claimValue(claims, mapping.token_audience || "aud"));
  return {
    agentId: stringOrUndefined(claimValue(claims, mapping.agent_id || "agent_id")),
    tenantId: stringOrUndefined(claimValue(claims, mapping.tenant_id || "tid")),
    userId: stringOrUndefined(claimValue(claims, mapping.user_id || "sub")),
    enterpriseAuth: {
      issuer: stringOrUndefined(claims.iss),
      subject,
      clientId:
        stringOrUndefined(claimValue(claims, mapping.client_id || "client_id")) ||
        stringOrUndefined(claims.azp) ||
        stringOrUndefined(claims.cid),
      scopes: valuesFromClaim(claimValue(claims, mapping.scopes || "scope")),
      groups: valuesFromClaim(claimValue(claims, mapping.groups || "groups")),
      acr: stringOrUndefined(claimValue(claims, mapping.acr || "acr")),
      amr: valuesFromClaim(claimValue(claims, mapping.amr || "amr")),
      idJagGrantId: stringOrUndefined(claimValue(claims, mapping.id_jag_grant_id || "id_jag_grant_id")),
      tokenAudience,
    },
  };
}

function jwkForHeader(jwks: JsonWebKeySet, header: Record<string, unknown>): JsonWebKey | undefined {
  const keys = Array.isArray(jwks.keys) ? jwks.keys : [];
  const kid = stringValue(header.kid);
  if (kid) return keys.find((key) => stringValue((key as unknown as Record<string, unknown>).kid) === kid);
  return keys.length === 1 ? keys[0] : undefined;
}

function audienceMatches(actual: unknown, expected: string | string[]): boolean {
  const actualValues = valuesFromClaim(actual);
  const expectedValues = Array.isArray(expected) ? expected : [expected];
  return expectedValues.some((value) => actualValues.includes(value));
}

function valuesFromClaim(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  const text = stringOrUndefined(value);
  if (!text) return [];
  return text
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function claimValue(claims: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!isRecord(current)) return undefined;
    return current[key];
  }, claims);
}

function parseBase64UrlJson(value: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
}

function stringOrUndefined(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.map(String).join(" ");
  return String(value);
}

function stringValue(value: unknown): string {
  return stringOrUndefined(value) || "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
