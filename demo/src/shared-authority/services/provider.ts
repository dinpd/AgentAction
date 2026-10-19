import { ISSUER, PAYMENT_ENDPOINT, PROFILE, SUPPORT_ENDPOINT, digest, fresh, importTrusted, providerCertificate, sign, verify, type Grant, type Signer } from "../protocol.ts";
import { PaymentsProvider, SupportProvider, createState, type ProviderResult, type ProviderState } from "../providers.ts";
import { Serial, bounded, json, nowSeconds, readObject, storedSigner, validRunId,
  type AuthorityReader, type Context, type Namespace, type Snapshot } from "./common.ts";

export type ProviderEnv = { RUNS: Namespace; AUTHORITY: AuthorityReader };
type Role = "PaymentsCo" | "SupportCo";
type SavedState = Omit<ProviderState, "revoked" | "consumed"> & { revoked: string[]; consumed: string[] };
const saveState = (state: ProviderState): SavedState => ({ ...state, revoked: [...state.revoked], consumed: [...state.consumed] });
const loadState = (saved?: SavedState): ProviderState => saved
  ? { ...saved, revoked: new Set(saved.revoked), consumed: new Set(saved.consumed) } : createState();

/** Each deployment owns its own namespace, keys and serialized durable run state. */
export class ProviderRuns {
  private readonly ctx: Context;
  private readonly env: ProviderEnv;
  private readonly role: Role;
  private readonly serial = new Serial();
  constructor(ctx: Context, env: ProviderEnv, role: Role) { this.ctx = ctx; this.env = env; this.role = role; }

  async fetch(request: Request): Promise<Response> {
    return this.serial.run(async () => {
      try {
        const input = await readObject(request);
        if (!validRunId(input.runId)) return json({ error: "invalid_run" }, 400);
        // The trusted authority comes from a fixed service capability, never the grant.
        const run = await bounded(this.env.AUTHORITY.status(input.runId));
        const rootKey = await bounded(this.env.AUTHORITY.root());
        const root = await importTrusted(rootKey);
        const key = await storedSigner(this.ctx.storage, `${this.role}-${run.id}`);
        const endpoint = this.role === "PaymentsCo" ? PAYMENT_ENDPOINT : SUPPORT_ENDPOINT;
        const authorityFingerprint = await digest(rootKey.jwk);
        const existing = await this.ctx.storage.get<string>("run-id");
        if (existing && existing !== run.id) return json({ error: "run_mismatch" }, 409);
        if (!existing) {
          await this.ctx.storage.put("run-id", run.id);
          await this.ctx.storage.setAlarm(Date.now() + 3600000);
        }
        let certificate = await this.ctx.storage.get<string>("certificate");
        if (!certificate) {
          certificate = await bounded(this.env.AUTHORITY.certify(run.id, { kid: key.kid, jwk: key.jwk }));
          await providerCertificate({ certificate, root, runId: run.id, now: nowSeconds(), provider: this.role, endpoint });
          await this.ctx.storage.put("certificate", certificate);
        }
        let state = loadState(await this.ctx.storage.get<SavedState>("effects"));
        state.revoked = new Set(run.revoked);
        if (input.operation === "identity") {
          if (typeof input.challenge !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(input.challenge)) return json({ error: "invalid_challenge" }, 400);
          const proof = await sign({ challenge: input.challenge, endpoint, runId: run.id }, key, "agentaction.demo.possession.v1");
          return json({ provider: this.role, endpoint, publicKey: key.jwk, kid: key.kid, certificate, proof });
        }
        if (typeof input.challenge !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(input.challenge)) return json({ error: "invalid_challenge" }, 400);
        if (input.operation === "snapshot") return json(await this.snapshot(state, run.id, key, authorityFingerprint, input.challenge));
        if (input.operation !== "execute") return json({ error: "not_found" }, 404);
        const original = saveState(state);
        let paymentKey = { publicKey: key.publicKey, kid: key.kid };
        let identityError: string | undefined;
        if (this.role === "SupportCo" && input.action.tool === "support.close_case") {
          try {
            const cert = await providerCertificate({ certificate: input.paymentCertificate, root,
              runId: run.id, now: nowSeconds(), provider: "PaymentsCo", endpoint: PAYMENT_ENDPOINT });
            paymentKey = await importTrusted({ kid: cert.keyId, jwk: cert.publicKey });
          } catch { identityError = "payment_identity_invalid"; }
        }
        const options = { root, signer: key, runId: run.id, now: nowSeconds(), state };
        const provider = this.role === "PaymentsCo" ? new PaymentsProvider(options) : new SupportProvider(options, paymentKey);
        if (provider instanceof PaymentsProvider && run.scenario === "provider_policy") provider.maxRefundCents = 2000;
        let result: ProviderResult;
        if (identityError) { state.payloadsReceived++; result = { allowed: false, reason: identityError }; }
        else result = await provider.execute(input.grant, input.action, input.paymentReceipt);
        if (result.allowed) {
          // Recheck revocation and the real clock immediately before the durable commit.
          const latest = await bounded(this.env.AUTHORITY.status(run.id));
          const grant = await verify<Grant>(input.grant, root.publicKey, root.kid, PROFILE);
          if (latest.revoked.includes(grant.id) || !fresh(grant.issuedAt, grant.expiresAt, nowSeconds())) {
            state = loadState(original); state.payloadsReceived++;
            result = { allowed: false, reason: latest.revoked.includes(grant.id) ? "revoked" : "expired_or_invalid_lifetime", grantId: grant.id };
          }
        }
        // One durable write commits consumption and the synthetic effect together.
        // No execution receipt is returned until the write succeeds.
        await this.ctx.storage.put("effects", saveState(state));
        return json({ result, snapshot: await this.snapshot(state, run.id, key, authorityFingerprint, input.challenge) }, result.allowed ? 200 : 403);
      } catch { return json({ error: "provider_unavailable_or_unknown_run", outcomeUnknown: true }, 503); }
    });
  }
  private async snapshot(state: ProviderState, runId: string, key: Signer, authorityFingerprint: string, challenge: string) {
    const claims: Snapshot = { provider: this.role, endpoint: this.role === "PaymentsCo" ? PAYMENT_ENDPOINT : SUPPORT_ENDPOINT,
      runId, authorityFingerprint, challenge, refundCount: state.refundCount, refundedCents: state.refundedCents,
      caseClosed: state.caseClosed, payloadsReceived: state.payloadsReceived, consumedCount: state.consumed.size, observedAt: nowSeconds() };
    return { claims, proof: await sign(claims, key, "agentaction.demo.snapshot.v1") };
  }
  async alarm() { await this.serial.run(() => this.ctx.storage.deleteAll()); }
}

export function providerWorker(role: Role) {
  return {
    async fetch(request: Request, env: ProviderEnv): Promise<Response> {
      try {
        const url = new URL(request.url);
        const endpoint = role === "PaymentsCo" ? PAYMENT_ENDPOINT : SUPPORT_ENDPOINT;
        if (request.method === "GET" && url.pathname === "/health") return json({ service: role, endpoint, issuer: ISSUER, mode: "independent-worker" });
        let input: Record<string, unknown>;
        if (request.method === "GET" && url.pathname === "/identity") {
          input = { operation: "identity", runId: url.searchParams.get("run"), challenge: url.searchParams.get("challenge") };
        } else if (request.method === "GET" && /^\/runs\/[0-9a-f-]{36}$/.test(url.pathname)) {
          input = { operation: "snapshot", runId: url.pathname.split("/")[2], challenge: url.searchParams.get("challenge") };
        } else if (request.method === "POST" && url.pathname === "/mcp") {
          if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return json({ error: "use_application_json" }, 415);
          const body = await readObject(request);
          if (Object.keys(body).some(k => !["runId", "grant", "action", "paymentReceipt", "paymentCertificate", "challenge"].includes(k))
            || typeof body.grant !== "string" || body.grant.length > 16000 || !body.action || typeof body.action !== "object" || Array.isArray(body.action)) return json({ error: "invalid_request" }, 400);
          input = { ...body, operation: "execute" };
        } else return json({ error: "not_found" }, 404);
        if (!validRunId(input.runId)) return json({ error: "invalid_run" }, 400);
        return await env.RUNS.get(env.RUNS.idFromName(input.runId)).fetch(new Request("https://provider.internal/", { method: "POST", body: JSON.stringify(input) }));
      } catch { return json({ error: "invalid_or_unavailable_request" }, 400); }
    },
  };
}
