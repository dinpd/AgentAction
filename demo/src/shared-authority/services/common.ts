import { createSigner, type PublicKey, type Signer } from "../protocol.ts";

export const SCENARIOS = ["happy_path", "changed_amount", "replay", "wrong_provider", "impostor", "revoked", "untrusted_issuer", "expired", "provider_policy"] as const;
export type Scenario = typeof SCENARIOS[number];
export type Run = { id: string; scenario: Scenario; createdAt: number; expiresAt: number; revoked: string[] };
export type Identity = { provider: string; endpoint: string; certificate: string; proof: string; publicKey: JsonWebKey; kid: string };
export type Snapshot = {
  provider: string; endpoint: string; runId: string; authorityFingerprint: string;
  challenge: string;
  refundCount: number; refundedCents: number; caseClosed: boolean; payloadsReceived: number;
  consumedCount: number; observedAt: number;
};
export type SignedSnapshot = { claims: Snapshot; proof: string };
export type Fetcher = { fetch(request: Request): Promise<Response> };
export type AuthorityReader = {
  root(): Promise<PublicKey>;
  status(runId: string): Promise<Run>;
  certify(runId: string, key: PublicKey): Promise<string>;
};
export type AuthorityIssuer = {
  root(): Promise<PublicKey>;
  start(scenario: Scenario): Promise<Run>;
  grant(runId: string, action: unknown, audience: string): Promise<{ claims: import("../protocol.ts").Grant; token: string }>;
  revoke(runId: string, grantId: string): Promise<void>;
};
export type SharedServices = { SHARED_AUTHORITY?: AuthorityIssuer; PAYMENTS_PROVIDER?: Fetcher; SUPPORT_PROVIDER?: Fetcher };
export type Store = {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string | string[]): Promise<unknown>;
  deleteAll(): Promise<void>;
  list<T>(options: { prefix: string; limit?: number }): Promise<Map<string, T>>;
  setAlarm(time: number): Promise<void>;
};
export type Context = { storage: Store };
export type Namespace = { idFromName(name: string): unknown; get(id: unknown): Fetcher };

export const nowSeconds = () => Math.floor(Date.now() / 1000);
export const validRunId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(id);
export function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status,
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
export async function readObject(request: Request | Response, limit = 24000): Promise<Record<string, any>> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_json");
  let size = 0, text = "";
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new Error("body_too_large"); }
    text += decoder.decode(value, { stream: true });
  }
  const result = JSON.parse(text + decoder.decode());
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("invalid_json");
  return result;
}
export async function bounded<T>(work: Promise<T>, timeoutMs = 8000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("service_timeout")), timeoutMs); })]); }
  finally { clearTimeout(timer!); }
}

/** Serialize DO operations across awaits; persist only public evidence in responses. */
export class Serial {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(work: () => Promise<T>): Promise<T> {
    const next = this.tail.then(work);
    this.tail = next.catch(() => {});
    return next;
  }
}

export async function storedSigner(store: Store, kid: string): Promise<Signer> {
  let saved = await store.get<{ privateJwk: JsonWebKey; publicJwk: JsonWebKey; kid: string }>("signing-key");
  if (!saved) {
    const key = await createSigner(kid);
    saved = { privateJwk: await crypto.subtle.exportKey("jwk", key.privateKey), publicJwk: key.jwk, kid };
    await store.put("signing-key", saved);
  }
  return { kid: saved.kid, jwk: saved.publicJwk,
    privateKey: await crypto.subtle.importKey("jwk", saved.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]),
    publicKey: await crypto.subtle.importKey("jwk", saved.publicJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]) };
}
