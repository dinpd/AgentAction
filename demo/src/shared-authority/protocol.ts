/** Experimental demo profile with a provisioned authority and fixed provider audiences. */
export const ISSUER = "https://agentaction-demo-authority.drisw.workers.dev";
export const TENANT = "acme";
export const AGENT = "support-agent-7";
export const PRINCIPAL = "support-manager-17";
export const DELEGATION = "acme-support-refunds-v1";
export const PROFILE = "agentaction.demo.action-grant.v1";
export const PAYMENT_ENDPOINT = "https://agentaction-demo-payments.drisw.workers.dev/mcp";
export const SUPPORT_ENDPOINT = "https://agentaction-demo-support.drisw.workers.dev/mcp";
export type Action = {
  tool: string;
  customerId: string;
  caseId: string;
  orderId: string;
  amountCents?: number;
  currency?: string;
  paymentReceiptDigest?: string;
};
export const REFUND: Action = Object.freeze({
  tool: "payments.refund", customerId: "customer-avery", caseId: "case-1042",
  orderId: "order-123", amountCents: 4000, currency: "USD",
});
export type Signer = { privateKey: CryptoKey; publicKey: CryptoKey; jwk: JsonWebKey; kid: string };
export type TrustedKey = Pick<Signer, "publicKey" | "kid">;
export type PublicKey = { kid: string; jwk: JsonWebKey };
export type Grant = {
  profile: string; issuer: string; id: string; runId: string;
  tenant: string; agent: string; principal: string; delegation: string;
  audience: string; action: Action; actionDigest: string; issuedAt: number; expiresAt: number;
};
export type ProviderCertificate = {
  issuer: string; runId: string; provider: string; endpoint: string;
  publicKey: JsonWebKey; keyId: string; issuedAt: number; expiresAt: number;
};
export type Execution = {
  provider: string; runId: string; grantId: string; actionDigest: string;
  status: "executed"; effectId: string; action: Action; executedAt: number;
};

export async function createSigner(kid: string): Promise<Signer> {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return { ...keys, kid, jwk: await crypto.subtle.exportKey("jwk", keys.publicKey) };
}

export async function importTrusted(key: PublicKey): Promise<TrustedKey> {
  if (!key || typeof key.kid !== "string" || !key.jwk || key.jwk.d || key.jwk.kty !== "EC" || key.jwk.crv !== "P-256") throw new Error("invalid_public_key");
  return { kid: key.kid, publicKey: await crypto.subtle.importKey("jwk", key.jwk,
    { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]) };
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const item = value as Record<string, unknown>;
    return `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${canonical(item[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function encode(value: string | ArrayBuffer): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid_encoding");
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
}

export async function digest(value: unknown): Promise<string> {
  return encode(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value))));
}

export async function sign(value: unknown, signer: Signer, type: string): Promise<string> {
  const input = `${encode(JSON.stringify({ alg: "ES256", typ: type, kid: signer.kid }))}.${encode(JSON.stringify(value))}`;
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signer.privateKey, new TextEncoder().encode(input));
  return `${input}.${encode(signature)}`;
}

export async function verify<T>(token: string, key: CryptoKey, kid: string, type: string): Promise<T> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || token.length > 16000) throw new Error();
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    if (header.alg !== "ES256" || header.typ !== type || header.kid !== kid || Object.keys(header).length !== 3) throw new Error();
    if (!await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, decode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))) throw new Error();
    return JSON.parse(new TextDecoder().decode(decode(parts[1]))) as T;
  } catch {
    throw new Error("invalid_signature_or_profile");
  }
}

export function fresh(issued: number, expires: number, now: number): boolean {
  return Number.isSafeInteger(issued) && Number.isSafeInteger(expires)
    && issued <= now && expires > now && expires > issued && expires - issued <= 300;
}

export function validEffectId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && value.trim() === value;
}

/** Acme explicitly delegates these fixture actions to this issuer for this agent. */
export class DemoAuthority {
  readonly root: Signer;
  readonly runId: string;
  readonly now: number;
  constructor(root: Signer, runId: string, now: number) {
    this.root = root; this.runId = runId; this.now = now;
  }

  async issue(action: Action, audience: string): Promise<{ claims: Grant; token: string }> {
    const refund = audience === PAYMENT_ENDPOINT && canonical(action) === canonical(REFUND);
    const close = audience === SUPPORT_ENDPOINT && canonical(action) === canonical({
      tool: "support.close_case", customerId: REFUND.customerId, caseId: REFUND.caseId,
      orderId: REFUND.orderId, paymentReceiptDigest: action.paymentReceiptDigest,
    }) && typeof action.paymentReceiptDigest === "string" && /^[A-Za-z0-9_-]{43}$/.test(action.paymentReceiptDigest);
    if (!refund && !close) throw new Error("outside_acme_delegation");
    const claims: Grant = {
      profile: PROFILE, issuer: ISSUER, id: crypto.randomUUID(), runId: this.runId,
      tenant: TENANT, agent: AGENT, principal: PRINCIPAL, delegation: DELEGATION,
      audience, action: structuredClone(action), actionDigest: await digest(action),
      issuedAt: this.now, expiresAt: this.now + 300,
    };
    return { claims, token: await sign(claims, this.root, PROFILE) };
  }

  async certificate(provider: string, endpoint: string, key: Signer): Promise<string> {
    return sign({ issuer: ISSUER, runId: this.runId, provider, endpoint,
      publicKey: key.jwk, keyId: key.kid, issuedAt: this.now, expiresAt: this.now + 300,
    } satisfies ProviderCertificate, this.root, "agentaction.demo.provider.v1");
  }
}

export async function providerCertificate(options: {
  certificate: string; root: TrustedKey; runId: string; now: number; provider: string; endpoint: string;
}): Promise<ProviderCertificate> {
  const cert = await verify<ProviderCertificate>(options.certificate, options.root.publicKey, options.root.kid, "agentaction.demo.provider.v1");
  if (!cert || cert.issuer !== ISSUER || cert.runId !== options.runId || cert.provider !== options.provider
      || cert.endpoint !== options.endpoint || !fresh(cert.issuedAt, cert.expiresAt, options.now)) throw new Error("provider_identity_mismatch");
  await importTrusted({ kid: cert.keyId, jwk: cert.publicKey });
  return cert;
}

export async function verifyProviderIdentity(options: {
  certificate: string; root: TrustedKey; runId: string; now: number;
  provider: string; endpoint: string; challenge: string; proof: string;
}): Promise<CryptoKey> {
  const cert = await providerCertificate(options);
  const key = await crypto.subtle.importKey("jwk", cert.publicKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const proof = await verify<{ challenge: string; endpoint: string; runId: string }>(options.proof, key, cert.keyId, "agentaction.demo.possession.v1");
  if (proof.challenge !== options.challenge || proof.endpoint !== options.endpoint || proof.runId !== options.runId) throw new Error("provider_possession_mismatch");
  return key;
}
