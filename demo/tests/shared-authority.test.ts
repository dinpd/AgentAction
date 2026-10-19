import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/worker.ts";
import {
  ISSUER, PAYMENT_ENDPOINT, PROFILE, REFUND, SUPPORT_ENDPOINT,
  canonical, createSigner, digest, sign, verify, verifyProviderIdentity,
  type Action, type Execution,
} from "../src/shared-authority/protocol.ts";
import { SCENARIOS } from "../src/shared-authority/scenario.ts";
import { createWorld } from "./fixture-world.ts";

test("authority refuses to issue grants outside Acme's exact delegation", async () => {
  const { authority } = await createWorld();
  for (const action of [{ ...REFUND, amountCents: 40000 }, { ...REFUND, customerId: "other" }, { ...REFUND, extra: true }]) {
    await assert.rejects(authority.issue(action, PAYMENT_ENDPOINT), /outside_acme_delegation/);
  }
  await assert.rejects(authority.issue(REFUND, SUPPORT_ENDPOINT), /outside_acme_delegation/);
});

test("all refund arguments are bound and mutation cannot consume authority", async () => {
  const { authority, payments } = await createWorld();
  const grant = await authority.issue(REFUND, PAYMENT_ENDPOINT);
  for (const field of Object.keys(REFUND)) {
    const result = await payments.execute(grant.token, { ...REFUND, [field]: "changed" } as Action);
    assert.equal(result.reason, "action_changed", field);
  }
  assert.equal(payments.options.state.refundCount, 0);
  assert.equal((await payments.execute(grant.token, REFUND)).allowed, true);
});

test("signed but untrusted context, delegation, digest and lifetime fail closed", async () => {
  const { authority, root, payments, now } = await createWorld();
  const grant = await authority.issue(REFUND, PAYMENT_ENDPOINT);
  const changes = [
    { issuer: "unknown" }, { tenant: "other" }, { agent: "other" }, { principal: "other" },
    { delegation: "other" }, { runId: "other" }, { profile: "other" }, { actionDigest: "other" },
    { issuedAt: now + 1 }, { expiresAt: now + 301 }, { expiresAt: now }, { issuedAt: null },
  ];
  for (const change of changes) {
    const result = await payments.execute(await sign({ ...grant.claims, ...change }, root, PROFILE), REFUND);
    assert.equal(result.allowed, false, JSON.stringify(change));
  }
  assert.equal(payments.options.state.refundCount, 0);
  assert.equal((await payments.execute(await sign(null, root, PROFILE), REFUND)).reason, "invalid_grant_context");
});

test("forged signature, altered payload, malformed token and wrong profile cannot execute", async () => {
  const { authority, payments } = await createWorld();
  const grant = await authority.issue(REFUND, PAYMENT_ENDPOINT);
  const rogue = await createSigner("demo-authority");
  const parts = grant.token.split(".");
  parts[1] = btoa(JSON.stringify({ ...grant.claims, audience: SUPPORT_ENDPOINT })).replace(/=+$/, "");
  for (const token of [await sign(grant.claims, rogue, PROFILE), parts.join("."), "not-a-token", "a.b.c", await sign(grant.claims, rogue, "other")]) {
    assert.equal((await payments.execute(token, REFUND)).allowed, false);
  }
  assert.equal(payments.options.state.refundCount, 0);
});

test("concurrent replay and independently reissued grants never duplicate the synthetic order refund", async () => {
  const { authority, payments } = await createWorld();
  const first = await authority.issue(REFUND, PAYMENT_ENDPOINT);
  const second = await authority.issue(REFUND, PAYMENT_ENDPOINT);
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => payments.execute(i < 10 ? first.token : second.token, REFUND)));
  assert.equal(results.filter(r => r.allowed).length, 1);
  assert.equal(payments.options.state.refundCount, 1);
  assert.equal(payments.options.state.refundedCents, 4000);
});

test("revocation during asynchronous verification prevents final consumption", async () => {
  const { authority, payments } = await createWorld();
  const grant = await authority.issue(REFUND, PAYMENT_ENDPOINT);
  const pending = payments.execute(grant.token, REFUND);
  payments.options.state.revoked.add(grant.claims.id);
  assert.equal((await pending).reason, "revoked");
  assert.equal(payments.options.state.consumed.size, 0);
  assert.equal(payments.options.state.refundCount, 0);
});

test("support requires authentic, matching payment execution evidence", async () => {
  const { authority, payments, support, paymentKey, runId, now } = await createWorld();
  const paymentGrant = await authority.issue(REFUND, PAYMENT_ENDPOINT);
  const payment = await payments.execute(paymentGrant.token, REFUND);
  const execution = await verify<Execution>(payment.receipt!, paymentKey.publicKey, paymentKey.kid, "agentaction.demo.execution.v1");
  const rogue = await createSigner("demo-payments");
  const proofs = ["garbage", await sign(execution, rogue, "agentaction.demo.execution.v1")];
  for (const change of [{ runId: "different" }, { status: "authorized" }, { executedAt: now + 1 }, { executedAt: null },
    { action: { ...REFUND, amountCents: 100 } }, { actionDigest: "changed" }, { provider: "other" }]) {
    proofs.push(await sign({ ...execution, ...change }, paymentKey, "agentaction.demo.execution.v1"));
  }
  for (const proof of proofs) {
    const close = { tool: "support.close_case", customerId: REFUND.customerId, orderId: REFUND.orderId, caseId: REFUND.caseId, paymentReceiptDigest: await digest(proof) };
    const grant = await authority.issue(close, SUPPORT_ENDPOINT);
    assert.equal((await support.execute(grant.token, close, proof)).allowed, false);
  }
  const close = { tool: "support.close_case", customerId: REFUND.customerId, orderId: REFUND.orderId, caseId: REFUND.caseId, paymentReceiptDigest: await digest(payment.receipt) };
  const grant = await authority.issue(close, SUPPORT_ENDPOINT);
  assert.equal((await support.execute(grant.token, close)).reason, "payment_evidence_missing");
  assert.equal(support.options.state.caseClosed, false);
  assert.equal((await support.execute(grant.token, close, payment.receipt)).allowed, true);
  assert.equal(support.options.state.caseClosed, true);
  assert.equal(execution.runId, runId);
});

test("provider identity binds endpoint, key possession, challenge and run", async () => {
  const { authority, root, payments, paymentKey, runId, now } = await createWorld();
  const certificate = await authority.certificate(payments.id, payments.endpoint, paymentKey);
  const proof = await payments.identify("challenge");
  const options = { certificate, root, runId, now, provider: payments.id, endpoint: payments.endpoint, challenge: "challenge", proof };
  await verifyProviderIdentity(options);
  for (const change of [{ endpoint: SUPPORT_ENDPOINT }, { provider: "SupportCo" }, { challenge: "other" }, { runId: "other" }, { now: now + 301 }]) {
    await assert.rejects(verifyProviderIdentity({ ...options, ...change }));
  }
  const rogue = await createSigner(paymentKey.kid);
  await assert.rejects(verifyProviderIdentity({ ...options, proof: await sign({ challenge: "challenge", endpoint: payments.endpoint, runId }, rogue, "agentaction.demo.possession.v1") }));
});

test("runs have distinct roots, grant identifiers and effects; grants cannot cross runs", async () => {
  const a = await createWorld(); const b = await createWorld();
  const grant = await a.authority.issue(REFUND, PAYMENT_ENDPOINT);
  assert.equal((await b.payments.execute(grant.token, REFUND)).allowed, false);
  assert.notEqual(canonical(a.root.jwk), canonical(b.root.jwk));
  assert.equal(a.payments.options.state.refundCount + b.payments.options.state.refundCount, 0);
});

test("HTTP endpoint requires independent services, rejects unbound inputs and never calls the gateway", async () => {
  const env = { AGENTID_GATEWAY: { fetch() { throw new Error("Unexpected external request"); } } } as any;
  for (const scenario of SCENARIOS) {
    const response = await worker.fetch(request(JSON.stringify({ scenario })), env);
    assert.equal(response.status, 503);
    assert.equal((await response.json() as any).outcomeUnknown, true);
  }
  for (const body of ["invalid", "null", "[]", '{}', '{"scenario":"unknown"}', '{"scenario":"happy_path","url":"https://evil.test"}']) {
    assert.equal((await worker.fetch(request(body), env)).status, 400);
  }
  assert.equal((await worker.fetch(request("x".repeat(513)), env)).status, 413);
  assert.equal((await worker.fetch(request("{}", "text/plain"), env)).status, 415);
  const page = await worker.fetch(new Request("https://demo.test/shared-authority"), env);
  assert.match(page.headers.get("content-security-policy")!, /connect-src 'self'/);
  assert.match(await page.text(), /One task\. Two providers\./);
  assert.match(await (await worker.fetch(new Request("https://demo.test/"), env)).text(), /href="\/shared-authority"/);
});

function request(body: string, contentType = "application/json") {
  return new Request("https://demo.test/api/shared-authority/run", { method: "POST", headers: { "content-type": contentType }, body });
}

for (const failure of ["bad_snapshot", "bad_execution", "wrong_receipt_grant", "missing_effect_id", "empty_effect_id", "invalid_effect_id"] as const) {
  test(`unverifiable provider result (${failure}) stops downstream dispatch and never reports zero effects`, async () => {
    const world = await createWorld();
    const { root, authority, payments, paymentKey, supportKey, runId, now } = world;
    let supportDispatches = 0;
    const provider = (role: "PaymentsCo" | "SupportCo") => ({
      async fetch(req: Request): Promise<Response> {
        const url = new URL(req.url), key = role === "PaymentsCo" ? paymentKey : supportKey;
        const endpoint = role === "PaymentsCo" ? PAYMENT_ENDPOINT : SUPPORT_ENDPOINT;
        if (url.pathname === "/identity") return response({ provider: role, endpoint, kid: key.kid, publicKey: key.jwk,
          certificate: await authority.certificate(role, endpoint, key),
          proof: await sign({ runId, endpoint, challenge: url.searchParams.get("challenge") }, key, "agentaction.demo.possession.v1") });
        assert.equal(url.pathname, "/mcp");
        if (role === "SupportCo") { supportDispatches++; throw new Error("Downstream dispatch must stop"); }
        const input = await req.json() as any;
        const result = await payments.execute(input.grant, input.action);
        assert.equal(result.allowed, true);
        const snapshot = { provider: role, endpoint, runId, authorityFingerprint: await digest(root.jwk), challenge: input.challenge,
          refundCount: 1, refundedCents: 4000, caseClosed: false, payloadsReceived: 1, consumedCount: 1, observedAt: now };
        if (failure === "bad_execution") result.receipt = "forged";
        if (failure === "wrong_receipt_grant") {
          result.execution = { ...result.execution!, grantId: "different-grant" };
          result.receipt = await sign(result.execution, key, "agentaction.demo.execution.v1");
        }
        if (["missing_effect_id", "empty_effect_id", "invalid_effect_id"].includes(failure)) {
          const effectId = failure === "missing_effect_id" ? undefined : failure === "empty_effect_id" ? "" : 42;
          result.execution = { ...result.execution!, effectId } as Execution;
          result.receipt = await sign(result.execution, key, "agentaction.demo.execution.v1");
        }
        return response({ result, snapshot: { claims: snapshot,
          proof: failure === "bad_snapshot" ? "forged" : await sign(snapshot, key, "agentaction.demo.snapshot.v1") } });
      },
    });
    const env: any = {
      SHARED_AUTHORITY: {
        root: async () => ({ kid: root.kid, jwk: root.jwk }),
        start: async () => ({ id: runId, scenario: "happy_path", createdAt: now, expiresAt: now + 600, revoked: [] }),
        grant: async (_id: string, action: Action, audience: string) => authority.issue(action, audience),
      },
      PAYMENTS_PROVIDER: provider("PaymentsCo"), SUPPORT_PROVIDER: provider("SupportCo"),
    };
    const out = await worker.fetch(request(JSON.stringify({ scenario: "happy_path" })), env);
    assert.equal(out.status, 503);
    const body = await out.json() as any;
    assert.equal(body.outcomeUnknown, true);
    assert.equal(body.runId, runId);
    assert.equal(body.recovery.length, 2);
    assert.equal(body.effects, undefined);
    assert.equal(payments.options.state.refundCount, 1, "an effect can exist even when its response cannot be verified");
    assert.equal(supportDispatches, 0);
  });
}

function response(value: unknown): Response { return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }); }
