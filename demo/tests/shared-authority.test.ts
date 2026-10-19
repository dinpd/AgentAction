import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/worker.ts";
import {
  ISSUER, PAYMENT_ENDPOINT, PROFILE, REFUND, SUPPORT_ENDPOINT,
  canonical, createSigner, digest, sign, verify, verifyProviderIdentity,
  type Action, type Execution,
} from "../src/shared-authority/protocol.ts";
import { SCENARIOS, createWorld, runSharedAuthority } from "../src/shared-authority/scenario.ts";

test("two providers accept distinct exact-action grants from one recognized issuer", async () => {
  const result = await runSharedAuthority("happy_path");
  assert.equal(result.workflowComplete, true);
  assert.equal(result.blocked, false);
  assert.deepEqual(result.effects, { refundCount: 1, refundedCents: 4000, caseClosed: true, paymentPayloads: 1, supportPayloads: 1 });
  assert.equal(result.grants.length, 2);
  assert.equal(result.receipts.length, 2);
  for (const receipt of result.receipts) {
    const identity = result.trust.providers.find(p => p.provider === receipt.provider)!;
    const key = await crypto.subtle.importKey("jwk", identity.publicKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const kid = receipt.provider === "PaymentsCo" ? "demo-payments" : "demo-support";
    assert.deepEqual(await verify(receipt.proof, key, kid, "agentaction.demo.execution.v1"), receipt.claims);
  }
  assert.deepEqual(result.grants.map(g => g.claims.issuer), [ISSUER, ISSUER]);
  assert.deepEqual(result.grants.map(g => g.claims.audience), [PAYMENT_ENDPOINT, SUPPORT_ENDPOINT]);
  assert.notEqual(result.grants[0].claims.id, result.grants[1].claims.id);
  const stages = result.steps.map(s => `${s.actor}/${s.stage}/${s.title}`);
  assert.ok(stages.indexOf("Acme agent/verification/Payment execution receipt verified")
    < stages.indexOf("SupportCo/execution/Case 1042 closed"));
  assert.ok(!JSON.stringify(result).includes('"d":'));
  assert.ok(!JSON.stringify(result).includes("privateKey"));
});

const denials = {
  changed_amount: "action_changed", wrong_provider: "wrong_provider", impostor: "provider_identity_mismatch",
  revoked: "revoked", untrusted_issuer: "invalid_signature_or_profile", expired: "expired_or_invalid_lifetime",
  provider_policy: "provider_business_policy",
} as const;
for (const [scenario, reason] of Object.entries(denials)) {
  test(`${scenario} is rejected with zero effects and an open support case`, async () => {
    const result = await runSharedAuthority(scenario as keyof typeof denials);
    assert.equal(result.workflowComplete, false);
    assert.equal(result.blocked, true);
    assert.equal(result.effects.refundCount, 0);
    assert.equal(result.effects.refundedCents, 0);
    assert.equal(result.effects.caseClosed, false);
    assert.equal(result.steps.filter(s => s.stage === "execution").length, 0);
    assert.ok(result.steps.some(s => s.status === "deny" && s.reason === reason));
    if (scenario === "impostor") {
      assert.equal(result.effects.paymentPayloads + result.effects.supportPayloads, 0);
      assert.equal(result.grants.length, 0);
    }
  });
}

test("replay is rejected while exactly one verified refund closes the case", async () => {
  const result = await runSharedAuthority("replay");
  assert.equal(result.blocked, true);
  assert.equal(result.workflowComplete, true);
  assert.equal(result.effects.refundCount, 1);
  assert.equal(result.effects.refundedCents, 4000);
  assert.ok(result.steps.some(s => s.reason === "already_consumed"));
});

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

test("HTTP endpoint restricts inputs, never calls the gateway, and exposes only public evidence", async () => {
  const env = { AGENTID_GATEWAY: { fetch() { throw new Error("Unexpected external request"); } } } as any;
  for (const scenario of SCENARIOS) {
    const response = await worker.fetch(request(JSON.stringify({ scenario })), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const result = await response.json() as any;
    assert.equal(result.scenario, scenario);
    assert.ok(!JSON.stringify(result).includes("privateKey"));
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
