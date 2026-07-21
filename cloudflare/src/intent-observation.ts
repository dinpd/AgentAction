import {
  digestIntentObservation,
  type IntentContract,
  type IntentObservation,
} from "../../packages/guard/src/intent.ts";

export type ObservationAuthContext = {
  method: "api_key" | "oidc" | "none";
  subject?: string;
  tenant_id?: string;
  issuer?: string;
};

export type ObservationVerificationEnv = {
  AGENTID_INTENT_OBSERVATION_DEV_UNSIGNED?: string;
};

type TrustedObservationIssuer = {
  issuer: string;
  profiles: string[];
  predicates: string[];
  verification_methods: Array<"oidc" | "jws" | "unsigned_dev">;
  oidc_subjects: string[];
  oidc_issuers: string[];
  jws_subjects: string[];
  jwks_uri?: string;
  audiences: string[];
};

type ObservationPolicy = {
  max_age_seconds: number;
  max_future_skew_seconds: number;
  trusted_issuers: TrustedObservationIssuer[];
};

type ParsedJws = {
  encodedHeader: string;
  encodedPayload: string;
  encodedSignature: string;
  header: Record<string, unknown>;
  claims: Record<string, unknown>;
};

export class IntentObservationVerificationError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = "IntentObservationVerificationError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export async function verifyIntentObservationRequest(options: {
  request: Record<string, unknown>;
  manifest: Record<string, unknown>;
  contract: IntentContract;
  tenantId: string | null;
  routeIntentId: string;
  auth: ObservationAuthContext;
  env: ObservationVerificationEnv;
  now?: Date;
}): Promise<IntentObservation> {
  const now = options.now || new Date();
  const policy = observationPolicy(options.manifest);
  const compactJws = stringValue(options.request.jws);
  let input = compactJws
    ? recordValue(parseCompactJws(compactJws).claims.observation)
    : recordValue(options.request.observation || options.request);
  const issuer = stringValue(input.issuer);
  const predicate = stringValue(input.predicate);
  if (!issuer) throw observationError("observation_issuer_required", "intent observation issuer is required", 400);
  if (!predicate) throw observationError("observation_predicate_required", "intent observation predicate is required", 400);

  const trusted = policy.trusted_issuers.find((candidate) =>
    candidate.issuer === issuer &&
    (candidate.profiles.length === 0 || candidate.profiles.includes(options.contract.profile)) &&
    (candidate.predicates.length === 0 || candidate.predicates.includes(predicate))
  );
  if (!trusted) {
    throw observationError(
      "observation_untrusted_issuer",
      `intent observation issuer is not trusted for ${options.contract.profile}/${predicate}: ${issuer}`,
      403,
    );
  }

  let verificationMethod: IntentObservation["provenance"]["verification_method"];
  let verifiedSubject: string | undefined;
  let signatureKid: string | undefined;
  let signedClaims: Record<string, unknown> | undefined;
  if (compactJws) {
    if (!trusted.verification_methods.includes("jws")) {
      throw observationError("observation_verification_method_not_allowed", "JWS observations are not allowed for issuer", 403);
    }
    if (!trusted.jwks_uri) {
      throw observationError("observation_jwks_uri_missing", "trusted observation issuer is missing jwks_uri", 500);
    }
    const verified = await verifyRs256Jws(compactJws, trusted.jwks_uri);
    signedClaims = verified.claims;
    input = recordValue(verified.claims.observation);
    signatureKid = stringValue(verified.header.kid) || undefined;
    verifiedSubject = stringValue(verified.claims.sub) || undefined;
    verificationMethod = "jws";
    validateSignedClaims(verified.claims, input, trusted, now);
  } else if (options.auth.method === "oidc") {
    if (!trusted.verification_methods.includes("oidc")) {
      throw observationError("observation_verification_method_not_allowed", "OIDC observations are not allowed for issuer", 403);
    }
    const subject = stringValue(options.auth.subject);
    const tokenIssuer = stringValue(options.auth.issuer);
    if (!subject || (trusted.oidc_subjects.length > 0 && !trusted.oidc_subjects.includes(subject))) {
      throw observationError("observation_oidc_subject_mismatch", "OIDC subject is not trusted for observation issuer", 403);
    }
    if (!tokenIssuer || trusted.oidc_issuers.length === 0 || !trusted.oidc_issuers.includes(tokenIssuer)) {
      throw observationError("observation_oidc_issuer_mismatch", "OIDC token issuer is not trusted for observation issuer", 403);
    }
    verifiedSubject = subject;
    verificationMethod = "oidc";
  } else if (unsignedDevelopmentAllowed(options.manifest, options.env, trusted)) {
    verificationMethod = "unsigned_dev";
    verifiedSubject = options.auth.subject || "development-mode";
  } else {
    throw observationError(
      "observation_verification_required",
      "intent observation requires trusted OIDC identity or a signed JWS envelope",
      403,
    );
  }

  const observationId = stringValue(input.observation_id);
  const issuedAt = stringValue(input.issued_at);
  const observedAt = stringValue(input.observed_at);
  if (!observationId) throw observationError("observation_id_required", "intent observation observation_id is required", 400);
  if (!Object.prototype.hasOwnProperty.call(input, "value")) {
    throw observationError("observation_value_required", "intent observation value is required", 400);
  }
  if (hasValue(input.schema_version) && input.schema_version !== "agentpass.intent-observation.v1") {
    throw observationError(
      "observation_schema_unsupported",
      `unsupported intent observation schema_version: ${stringValue(input.schema_version)}`,
      400,
    );
  }

  const expectedTenant = options.tenantId || stringValue(input.tenant_id) || "default";
  if (hasValue(input.tenant_id) && stringValue(input.tenant_id) !== expectedTenant) {
    throw observationError("observation_tenant_mismatch", "intent observation tenant_id mismatch", 409);
  }
  if (hasValue(input.intent_id) && stringValue(input.intent_id) !== options.routeIntentId) {
    throw observationError("observation_intent_mismatch", "intent observation intent_id mismatch", 409);
  }
  if (hasValue(input.intent_digest) && stringValue(input.intent_digest) !== options.contract.intent_digest) {
    throw observationError("observation_intent_digest_mismatch", "intent observation intent_digest mismatch", 409);
  }
  if (compactJws) {
    for (const field of ["tenant_id", "intent_id", "intent_digest", "payload_digest"]) {
      if (!hasValue(input[field])) {
        throw observationError("observation_signed_binding_missing", `signed intent observation is missing ${field}`, 400);
      }
    }
  }

  const issuedAtMs = parseRequiredDate(issuedAt, "issued_at");
  const observedAtMs = parseRequiredDate(observedAt, "observed_at");
  const expiresAt = stringValue(input.expires_at) || new Date(issuedAtMs + policy.max_age_seconds * 1_000).toISOString();
  const expiresAtMs = parseRequiredDate(expiresAt, "expires_at");
  validateObservationTime(policy, { issuedAtMs, observedAtMs, expiresAtMs }, now);

  const observation: IntentObservation = {
    schema_version: "agentpass.intent-observation.v1",
    observation_id: observationId,
    tenant_id: expectedTenant,
    intent_id: options.routeIntentId,
    intent_digest: stringValue(options.contract.intent_digest),
    predicate,
    value: input.value,
    observed_at: new Date(observedAtMs).toISOString(),
    issued_at: new Date(issuedAtMs).toISOString(),
    expires_at: new Date(expiresAtMs).toISOString(),
    issuer,
    resource: optionalString(input.resource),
    payload_digest: "",
    provenance: {
      verification_method: verificationMethod,
      verified_issuer: issuer,
      verified_at: now.toISOString(),
      verified_subject: verifiedSubject,
      signature_kid: signatureKid,
    },
  };
  observation.payload_digest = digestIntentObservation(observation);
  const suppliedDigest = stringValue(input.payload_digest);
  if (suppliedDigest && suppliedDigest !== observation.payload_digest) {
    throw observationError("observation_payload_digest_mismatch", "intent observation payload_digest mismatch", 409);
  }
  if (compactJws && !suppliedDigest) {
    throw observationError("observation_payload_digest_required", "signed intent observation requires payload_digest", 400);
  }

  if (signedClaims) {
    const claimObservationId = stringValue(signedClaims.jti);
    if (claimObservationId !== observation.observation_id) {
      throw observationError("observation_jws_id_mismatch", "JWS jti does not match observation_id", 409);
    }
  }
  return observation;
}

export function verifiedIntentObservationFinding(value: unknown): string | undefined {
  const observation = recordValue(value);
  const provenance = recordValue(observation.provenance);
  if (observation.schema_version !== "agentpass.intent-observation.v1") return "unsupported observation schema";
  if (!stringValue(observation.observation_id)) return "observation_id is required";
  if (!stringValue(observation.tenant_id)) return "tenant_id is required";
  if (!stringValue(observation.issued_at) || !stringValue(observation.expires_at)) return "observation lifetime is required";
  if (!stringValue(observation.payload_digest)) return "payload_digest is required";
  if (!stringValue(provenance.verification_method) || !stringValue(provenance.verified_issuer)) {
    return "verified provenance is required";
  }
  if (provenance.verified_issuer !== observation.issuer) return "verified issuer mismatch";
  if (digestIntentObservation(observation) !== observation.payload_digest) return "payload_digest mismatch";
  return undefined;
}

function observationPolicy(manifest: Record<string, unknown>): ObservationPolicy {
  const assurance = recordValue(manifest.intent_assurance ?? manifest.intentAssurance);
  const observations = recordValue(assurance.observations);
  const trustedIssuers = Array.isArray(observations.trusted_issuers) ? observations.trusted_issuers : [];
  return {
    max_age_seconds: positiveNumber(observations.max_age_seconds, 300),
    max_future_skew_seconds: nonNegativeNumber(observations.max_future_skew_seconds, 30),
    trusted_issuers: trustedIssuers.map((value) => {
      const issuer = recordValue(value);
      return {
        issuer: stringValue(issuer.issuer),
        profiles: stringArray(issuer.profiles),
        predicates: stringArray(issuer.predicates),
        verification_methods: stringArray(issuer.verification_methods)
          .filter((method): method is "oidc" | "jws" | "unsigned_dev" => ["oidc", "jws", "unsigned_dev"].includes(method)),
        oidc_subjects: stringArray(issuer.oidc_subjects),
        oidc_issuers: stringArray(issuer.oidc_issuers),
        jws_subjects: stringArray(issuer.jws_subjects),
        jwks_uri: optionalString(issuer.jwks_uri),
        audiences: stringArray(issuer.audiences),
      };
    }).filter((issuer) => issuer.issuer),
  };
}

function unsignedDevelopmentAllowed(
  manifest: Record<string, unknown>,
  env: ObservationVerificationEnv,
  trusted: TrustedObservationIssuer,
): boolean {
  const environment = stringValue(recordValue(manifest.agent).environment).toLowerCase();
  return env.AGENTID_INTENT_OBSERVATION_DEV_UNSIGNED === "true" &&
    ["dev", "development", "test", "local"].includes(environment) &&
    trusted.verification_methods.includes("unsigned_dev");
}

function validateSignedClaims(
  claims: Record<string, unknown>,
  observation: Record<string, unknown>,
  trusted: TrustedObservationIssuer,
  now: Date,
): void {
  if (claims.iss !== trusted.issuer || observation.issuer !== trusted.issuer) {
    throw observationError("observation_jws_issuer_mismatch", "JWS issuer does not match observation issuer policy", 403);
  }
  if (trusted.audiences.length === 0 || !audienceMatches(claims.aud, trusted.audiences)) {
    throw observationError("observation_jws_audience_mismatch", "JWS audience is not trusted for observations", 403);
  }
  const subject = stringValue(claims.sub);
  if (!subject || (trusted.jws_subjects.length > 0 && !trusted.jws_subjects.includes(subject))) {
    throw observationError("observation_jws_subject_mismatch", "JWS subject is not trusted for observation issuer", 403);
  }
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  if (typeof claims.iat !== "number" || typeof claims.exp !== "number") {
    throw observationError("observation_jws_lifetime_missing", "JWS iat and exp claims are required", 400);
  }
  if (claims.iat > nowSeconds || claims.exp <= nowSeconds) {
    throw observationError("observation_jws_expired", "JWS observation envelope is expired or not active", 410);
  }
  const issuedAt = Date.parse(stringValue(observation.issued_at));
  const expiresAt = Date.parse(stringValue(observation.expires_at));
  if (!Number.isFinite(issuedAt) || Math.abs(Math.floor(issuedAt / 1_000) - claims.iat) > 1) {
    throw observationError("observation_jws_issued_at_mismatch", "JWS iat does not match observation issued_at", 409);
  }
  if (!Number.isFinite(expiresAt) || Math.abs(Math.floor(expiresAt / 1_000) - claims.exp) > 1) {
    throw observationError("observation_jws_expires_at_mismatch", "JWS exp does not match observation expires_at", 409);
  }
}

function validateObservationTime(
  policy: ObservationPolicy,
  times: { issuedAtMs: number; observedAtMs: number; expiresAtMs: number },
  now: Date,
): void {
  const nowMs = now.getTime();
  const skewMs = policy.max_future_skew_seconds * 1_000;
  const maxAgeMs = policy.max_age_seconds * 1_000;
  if (times.issuedAtMs > nowMs + skewMs || times.observedAtMs > nowMs + skewMs) {
    throw observationError("observation_future_dated", "intent observation is future-dated", 400);
  }
  if (times.issuedAtMs < nowMs - maxAgeMs || times.observedAtMs < nowMs - maxAgeMs) {
    throw observationError("observation_stale", "intent observation is older than tenant freshness policy", 410);
  }
  if (times.expiresAtMs <= nowMs) {
    throw observationError("observation_expired", "intent observation is expired", 410);
  }
  if (times.expiresAtMs <= times.issuedAtMs || times.expiresAtMs > times.issuedAtMs + maxAgeMs) {
    throw observationError(
      "observation_expiry_out_of_policy",
      "intent observation expires_at is outside tenant freshness policy",
      400,
    );
  }
}

async function verifyRs256Jws(token: string, jwksUri: string): Promise<{ claims: Record<string, unknown>; header: Record<string, unknown> }> {
  const parsed = parseCompactJws(token);
  if (parsed.header.alg !== "RS256") {
    throw observationError("observation_jws_algorithm_unsupported", "only RS256 observation JWS is supported", 400);
  }
  const kid = stringValue(parsed.header.kid);
  if (!kid) throw observationError("observation_jws_kid_missing", "observation JWS header is missing kid", 400);
  let response: Response;
  try {
    response = await fetch(jwksUri, { headers: { accept: "application/json" } });
  } catch {
    throw observationError("observation_jwks_unavailable", "failed to fetch trusted observation JWKS", 503);
  }
  if (!response.ok) {
    throw observationError("observation_jwks_unavailable", `failed to fetch trusted observation JWKS: ${response.status}`, 503);
  }
  const jwks = await response.json() as { keys?: JsonWebKey[] };
  const jwk = (jwks.keys || []).find((key) =>
    key.kid === kid && (!key.alg || key.alg === "RS256") && (!key.use || key.use === "sig"));
  if (!jwk) throw observationError("observation_jws_key_unknown", "observation signing key not found in JWKS", 401);
  let valid = false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlToBytes(parsed.encodedSignature),
      new TextEncoder().encode(`${parsed.encodedHeader}.${parsed.encodedPayload}`),
    );
  } catch {
    throw observationError("observation_jws_key_invalid", "trusted observation signing key is invalid", 401);
  }
  if (!valid) throw observationError("observation_jws_signature_invalid", "invalid observation JWS signature", 401);
  return { claims: parsed.claims, header: parsed.header };
}

function parseCompactJws(token: string): ParsedJws {
  const parts = token.split(".");
  if (parts.length !== 3) throw observationError("observation_jws_format_invalid", "invalid observation JWS format", 400);
  const encodedHeader = parts[0]!;
  const encodedPayload = parts[1]!;
  const encodedSignature = parts[2]!;
  try {
    return {
      encodedHeader,
      encodedPayload,
      encodedSignature,
      header: JSON.parse(base64UrlDecode(encodedHeader)) as Record<string, unknown>,
      claims: JSON.parse(base64UrlDecode(encodedPayload)) as Record<string, unknown>,
    };
  } catch {
    throw observationError("observation_jws_format_invalid", "invalid observation JWS encoding", 400);
  }
}

function parseRequiredDate(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!value || !Number.isFinite(parsed)) {
    throw observationError("observation_time_invalid", `intent observation ${field} must be a valid date-time`, 400, { field });
  }
  return parsed;
}

function observationError(code: string, message: string, status: number, details?: Record<string, unknown>) {
  return new IntentObservationVerificationError(code, message, status, details);
}

function audienceMatches(audience: unknown, allowed: string[]): boolean {
  const tokenValues = Array.isArray(audience) ? audience.map(String) : [String(audience)];
  return tokenValues.some((value) => allowed.includes(value));
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

function base64UrlToBytes(value: string): Uint8Array {
  return Uint8Array.from(base64UrlDecode(value), (character) => character.charCodeAt(0));
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
}

function optionalString(value: unknown): string | undefined {
  const string = stringValue(value);
  return string || undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}
