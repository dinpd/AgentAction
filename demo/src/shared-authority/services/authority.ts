import { WorkerEntrypoint } from "cloudflare:workers";
import { DemoAuthority, ISSUER, PAYMENT_ENDPOINT, PROFILE, SUPPORT_ENDPOINT, canonical, importTrusted, sign, type Action, type Grant, type ProviderCertificate, type PublicKey } from "../protocol.ts";
import { SCENARIOS, Serial, json, nowSeconds, readObject, storedSigner, validRunId, type Context, type Namespace, type Run, type Scenario } from "./common.ts";

type Env = { AUTHORITY_STATE: Namespace };
type RecordRun = Run & { grants: Record<string, { claims: Grant; token: string }>; identities: Record<string, { key: PublicKey; token: string }> };

/** Only this service holds the persisted authority signing key. */
export class DemoAuthorityState {
  private readonly ctx: Context;
  private readonly serial = new Serial();
  constructor(ctx: Context) { this.ctx = ctx; }

  async fetch(request: Request): Promise<Response> {
    return this.serial.run(async () => {
      try {
        const input = await readObject(request);
        const root = await storedSigner(this.ctx.storage, "demo-authority-v1");
        if (input.operation === "root") return json({ kid: root.kid, jwk: root.jwk });
        const now = nowSeconds();
        if (input.operation === "start") {
          if (!SCENARIOS.includes(input.scenario)) return json({ error: "invalid_scenario" }, 400);
          await this.prune();
          if ((await this.ctx.storage.list({ prefix: "run:", limit: 1000 })).size >= 1000) return json({ error: "demo_capacity" }, 429);
          const record: RecordRun = { id: crypto.randomUUID(), scenario: input.scenario, createdAt: now, expiresAt: now + 600, revoked: [], grants: {}, identities: {} };
          await this.ctx.storage.put(`run:${record.id}`, record);
          await this.ctx.storage.setAlarm(Date.now() + 900000);
          return json(publicRun(record));
        }
        if (!validRunId(input.runId)) return json({ error: "invalid_run" }, 400);
        const run = await this.ctx.storage.get<RecordRun>(`run:${input.runId}`);
        if (!run || run.expiresAt <= now) return json({ error: "run_expired_or_unknown" }, 410);
        if (input.operation === "status") return json(publicRun(run));
        if (input.operation === "certificate") {
          const endpoint = input.provider === "PaymentsCo" ? PAYMENT_ENDPOINT : input.provider === "SupportCo" ? SUPPORT_ENDPOINT : null;
          if (!endpoint) return json({ error: "invalid_provider" }, 400);
          await importTrusted(input.key);
          const existing = run.identities[input.provider];
          if (existing && canonical(existing.key) !== canonical(input.key)) return json({ error: "provider_key_already_bound" }, 409);
          if (existing) return json({ token: existing.token });
          const certificate: ProviderCertificate = { issuer: ISSUER, runId: run.id, provider: input.provider,
            endpoint, publicKey: input.key.jwk, keyId: input.key.kid, issuedAt: now, expiresAt: now + 300 };
          const token = await sign(certificate, root, "agentaction.demo.provider.v1");
          run.identities[input.provider] = { key: input.key, token };
          await this.ctx.storage.put(`run:${run.id}`, run);
          return json({ token });
        }
        if (input.operation === "grant") {
          const issued = await new DemoAuthority(root, run.id, now).issue(input.action as Action, input.audience);
          const slot = input.audience === PAYMENT_ENDPOINT ? "payment" : "support";
          const existing = run.grants[slot];
          if (existing) {
            if (canonical(existing.claims.action) !== canonical(input.action)) return json({ error: "grant_already_bound" }, 409);
            return json(existing);
          }
          // This control is an explicitly expired signed fixture; verifiers use their real clock.
          if (run.scenario === "expired" && slot === "payment") {
            issued.claims.issuedAt = now - 301; issued.claims.expiresAt = now - 1;
            issued.token = await sign(issued.claims, root, PROFILE);
          }
          run.grants[slot] = issued;
          await this.ctx.storage.put(`run:${run.id}`, run);
          return json(issued);
        }
        if (input.operation === "revoke" && run.scenario === "revoked" && run.grants.payment?.claims.id === input.grantId) {
          if (!run.revoked.includes(input.grantId)) run.revoked.push(input.grantId);
          await this.ctx.storage.put(`run:${run.id}`, run);
          return json({ revoked: true });
        }
        return json({ error: "operation_not_allowed" }, 403);
      } catch { return json({ error: "authority_request_rejected" }, 400); }
    });
  }
  private async prune() {
    const rows = await this.ctx.storage.list<RecordRun>({ prefix: "run:", limit: 1000 });
    const expired = [...rows].filter(([, run]) => run.expiresAt <= nowSeconds()).map(([key]) => key);
    for (let offset = 0; offset < expired.length; offset += 64) await this.ctx.storage.delete(expired.slice(offset, offset + 64));
  }
  async alarm() { await this.serial.run(async () => { await this.prune(); if ((await this.ctx.storage.list({ prefix: "run:", limit: 1 })).size) await this.ctx.storage.setAlarm(Date.now() + 900000); }); }
}

function publicRun(run: Run): Run { return { id: run.id, scenario: run.scenario, createdAt: run.createdAt, expiresAt: run.expiresAt, revoked: run.revoked }; }
async function call(env: Env, operation: string, input: Record<string, unknown> = {}): Promise<any> {
  const response = await env.AUTHORITY_STATE.get(env.AUTHORITY_STATE.idFromName("root-v1")).fetch(new Request("https://authority.internal/", {
    method: "POST", body: JSON.stringify({ operation, ...input }),
  }));
  const value = await response.json() as any;
  if (!response.ok) throw new Error(value.error || "authority_unavailable");
  return value;
}

/** RPC capabilities are not reachable through public HTTP routes. */
export class DemoIssuer extends WorkerEntrypoint<Env> {
  root() { return call(this.env, "root"); }
  start(scenario: Scenario) { return call(this.env, "start", { scenario }); }
  grant(runId: string, action: unknown, audience: string) { return call(this.env, "grant", { runId, action, audience }); }
  async revoke(runId: string, grantId: string) { await call(this.env, "revoke", { runId, grantId }); }
}
export class PaymentAuthority extends WorkerEntrypoint<Env> {
  root() { return call(this.env, "root"); }
  status(runId: string) { return call(this.env, "status", { runId }); }
  async certify(runId: string, key: PublicKey) { return (await call(this.env, "certificate", { runId, key, provider: "PaymentsCo" })).token; }
}
export class SupportAuthority extends WorkerEntrypoint<Env> {
  root() { return call(this.env, "root"); }
  status(runId: string) { return call(this.env, "status", { runId }); }
  async certify(runId: string, key: PublicKey) { return (await call(this.env, "certificate", { runId, key, provider: "SupportCo" })).token; }
}
export default {
  async fetch(request: Request, env: Env) {
    const path = new URL(request.url).pathname;
    if (request.method !== "GET") return json({ error: "not_found" }, 404);
    if (path === "/health") return json({ service: "AgentAction authority", issuer: ISSUER, mode: "independent-worker" });
    if (path === "/.well-known/jwks.json") {
      const key = await call(env, "root");
      return json({ issuer: ISSUER, keys: [{ ...key.jwk, kid: key.kid, alg: "ES256", use: "sig" }] });
    }
    return json({ error: "not_found" }, 404);
  },
};
