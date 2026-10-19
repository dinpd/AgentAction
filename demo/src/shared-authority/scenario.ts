import {
  DemoAuthority, ISSUER, PAYMENT_ENDPOINT, PROFILE, REFUND, SUPPORT_ENDPOINT,
  createSigner, digest, sign, verify, verifyProviderIdentity,
  type Action, type Execution, type Grant,
} from "./protocol.ts";
import { PaymentsProvider, SupportProvider, createState, type ProviderResult } from "./providers.ts";

export const SCENARIOS = ["happy_path", "changed_amount", "replay", "wrong_provider", "impostor", "revoked", "untrusted_issuer", "expired", "provider_policy"] as const;
export type Scenario = typeof SCENARIOS[number];
export type Step = {
  actor: string; stage: "trust" | "authorization" | "verification" | "execution";
  title: string; detail: string; status: "allow" | "deny" | "info"; reason?: string;
};

export async function createWorld(now = Math.floor(Date.now() / 1000)) {
  const runId = crypto.randomUUID();
  const [root, paymentKey, supportKey] = await Promise.all([
    createSigner("demo-authority"), createSigner("demo-payments"), createSigner("demo-support"),
  ]);
  const trustedRoot = { publicKey: root.publicKey, kid: root.kid };
  const trustedPayments = { publicKey: paymentKey.publicKey, kid: paymentKey.kid };
  const authority = new DemoAuthority(root, runId, now);
  const payments = new PaymentsProvider({ root: trustedRoot, signer: paymentKey, runId, now, state: createState() });
  const support = new SupportProvider({ root: trustedRoot, signer: supportKey, runId, now, state: createState() }, trustedPayments);
  return { runId, now, authority, root, paymentKey, supportKey, payments, support };
}

export async function runSharedAuthority(scenario: Scenario) {
  const world = await createWorld();
  const { authority, root, payments, support, paymentKey, supportKey, runId, now } = world;
  const steps: Step[] = [];
  const grants: Array<{ summary: string; claims: Grant; proof: string }> = [];
  const receipts: Array<{ provider: string; claims: Execution; proof: string }> = [];
  const identities: Array<{ provider: string; endpoint: string; certificate: string; publicKey: JsonWebKey }> = [];
  let blocked = false;
  const record = (step: Step) => steps.push(step);
  record({ actor: "Acme", stage: "trust", title: "Trust is explicitly provisioned", status: "info",
    detail: "Acme delegates the $40 refund and case update to AgentAction. Both synthetic providers accept this issuer only for Acme's support agent. The agent pins the same root for provider identities." });

  for (const [provider, key] of [[payments, paymentKey], [support, supportKey]] as const) {
    const certificate = await authority.certificate(provider.id, provider.endpoint, key);
    identities.push({ provider: provider.id, endpoint: provider.endpoint, certificate, publicKey: key.jwk });
    const challenge = crypto.randomUUID();
    const proof = await provider.identify(challenge);
    try {
      await verifyProviderIdentity({ certificate, root: { publicKey: root.publicKey, kid: root.kid }, runId, now,
        provider: provider.id, endpoint: scenario === "impostor" && provider === payments
          ? "https://impostor.demo.agentaction.local/mcp" : provider.endpoint, challenge, proof });
      record({ actor: "Acme agent", stage: "trust", title: `${provider.id} identity verified`, status: "allow",
        detail: "The signed identity matches the expected endpoint. A fresh challenge proves possession of the certified provider key." });
    } catch {
      blocked = true;
      record({ actor: "Acme agent", stage: "trust", title: "Impostor endpoint blocked", status: "deny", reason: "provider_identity_mismatch",
        detail: "The endpoint differs from PaymentsCo's signed identity. No customer payload was dispatched to either provider." });
      return finish();
    }
  }

  const paymentGrant = await authority.issue(REFUND, PAYMENT_ENDPOINT);
  grants.push({ summary: "Acme authorized Support Agent 7 to refund $40 on order 123 through PaymentsCo, once, within five minutes.", claims: paymentGrant.claims, proof: paymentGrant.token });
  record({ actor: "AgentAction", stage: "authorization", title: "Exact $40 refund authorized", status: "allow",
    detail: "The signed grant binds Acme, its agent and delegation, PaymentsCo, and every refund argument. The private signing key stays on the server." });

  let token = paymentGrant.token;
  let action: Action = structuredClone(REFUND);
  let target: PaymentsProvider | SupportProvider = payments;
  if (scenario === "changed_amount") action.amountCents = 40000;
  if (scenario === "wrong_provider") target = support;
  if (scenario === "revoked") {
    payments.options.state.revoked.add(paymentGrant.claims.id);
    record({ actor: "AgentAction", stage: "authorization", title: "Fresh grant revoked before dispatch", status: "info",
      detail: "The provider receives the revocation before checking this otherwise valid, unused grant." });
  }
  if (scenario === "expired") {
    payments.options.now = now + 301;
    record({ actor: "Acme agent", stage: "verification", title: "Dispatch delayed past the grant's expiry", status: "info",
      detail: "The simulation advances PaymentsCo's verification clock by 301 seconds. The original signed grant remains unchanged." });
  }
  if (scenario === "untrusted_issuer") {
    const unknown = await createSigner("unknown-authority");
    token = await sign({ ...paymentGrant.claims, issuer: "https://unknown.demo.agentaction.local" }, unknown, PROFILE);
  }
  if (scenario === "provider_policy") payments.maxRefundCents = 2000;

  const payment = await target.execute(token, action);
  report(target.id, payment);
  if (!payment.allowed) return finish();
  if (scenario === "replay") {
    const retry = await payments.execute(token, action);
    report(payments.id, retry);
  }

  // The agent verifies actual provider evidence before asking to close the case.
  const execution = await verify<Execution>(payment.receipt!, paymentKey.publicKey, paymentKey.kid, "agentaction.demo.execution.v1");
  if (execution.status !== "executed" || execution.runId !== runId || execution.grantId !== paymentGrant.claims.id
      || execution.actionDigest !== paymentGrant.claims.actionDigest || execution.provider !== payments.id) throw new Error("payment_execution_mismatch");
  record({ actor: "Acme agent", stage: "verification", title: "Payment execution receipt verified", status: "allow",
    detail: "PaymentsCo signed the completed refund. The case-closing request binds the digest of this receipt." });
  const close: Action = { tool: "support.close_case", customerId: REFUND.customerId, caseId: REFUND.caseId,
    orderId: REFUND.orderId, paymentReceiptDigest: await digest(payment.receipt) };
  const supportGrant = await authority.issue(close, SUPPORT_ENDPOINT);
  grants.push({ summary: "Acme authorized Support Agent 7 to close case 1042 through SupportCo, once, after the verified $40 refund.", claims: supportGrant.claims, proof: supportGrant.token });
  record({ actor: "AgentAction", stage: "authorization", title: "Case update authorized by the same issuer", status: "allow",
    detail: "SupportCo receives its own audience-bound grant in the same format. The payment grant cannot be substituted." });
  const closed = await support.execute(supportGrant.token, close, payment.receipt);
  report(support.id, closed);
  if (closed.allowed) {
    const receipt = await verify<Execution>(closed.receipt!, supportKey.publicKey, supportKey.kid, "agentaction.demo.execution.v1");
    if (receipt.runId !== runId || receipt.grantId !== supportGrant.claims.id || receipt.actionDigest !== supportGrant.claims.actionDigest
        || receipt.provider !== support.id || receipt.status !== "executed") throw new Error("support_execution_mismatch");
    record({ actor: "Acme agent", stage: "verification", title: "Case execution receipt verified", status: "allow",
      detail: "SupportCo signed the completed case update. Both provider results are linked to their original grants." });
  }
  return finish();

  function report(provider: string, result: ProviderResult) {
    if (!result.allowed) blocked = true;
    record({ actor: provider, stage: "verification", title: result.allowed ? "Grant independently verified" : "Execution rejected",
      status: result.allowed ? "allow" : "deny", reason: result.reason,
      detail: result.allowed ? "Issuer, signature, delegation, exact action, audience, lifetime, revocation and use state passed provider checks." : rejectionDetail(result.reason) });
    if (result.allowed) {
      receipts.push({ provider, claims: result.execution!, proof: result.receipt! });
      record({ actor: provider, stage: "execution", title: provider === payments.id ? "$40 refunded once" : "Case 1042 closed",
        status: "allow", detail: `Synthetic effect recorded as ${result.execution!.effectId}. A signed execution receipt was returned.` });
    }
  }
  function finish() {
    return { runId, scenario, blocked, workflowComplete: support.options.state.caseClosed, grants, receipts, steps,
      trust: { issuer: ISSUER, publicKey: root.jwk, providers: identities },
      effects: { refundCount: payments.options.state.refundCount, refundedCents: payments.options.state.refundedCents,
        caseClosed: support.options.state.caseClosed, paymentPayloads: payments.options.state.payloadsReceived,
        supportPayloads: support.options.state.payloadsReceived },
      limits: "Synthetic providers run inside one Worker with per-run keys and in-memory state. Trust roots and Acme's delegation are provisioned fixtures. No live payments, external certification or production durability." };
  }
}

function rejectionDetail(reason: string): string {
  const reasons: Record<string, string> = {
    action_changed: "The approved refund was $40. The dispatched $400 request no longer matches the signed action. No refund executed.",
    already_consumed: "The same grant was already consumed. This retry created no second refund; the verified first refund can still close the case.",
    wrong_provider: "SupportCo rejected a grant whose intended recipient is PaymentsCo. Neither provider executed an action.",
    revoked: "The fresh grant was revoked before execution. Its valid signature cannot override current revocation state.",
    expired_or_invalid_lifetime: "The signed grant expired before dispatch. No refund executed.",
    invalid_signature_or_profile: "The proof was not signed by the recognized authority with the required profile. No refund executed.",
    provider_business_policy: "Acme authorized $40, but PaymentsCo's own limit is $20. The provider retained its final decision and denied the refund.",
  };
  return reasons[reason] || "The provider rejected the request before any synthetic effect.";
}

export async function sharedAuthorityRequest(request: Request): Promise<Response> {
  const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return reply({ error: "Use application/json." }, 415);
  const reader = request.body?.getReader();
  if (!reader) return reply({ error: "Choose a scenario." }, 400);
  let text = "";
  let size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512) { await reader.cancel(); return reply({ error: "Scenario request is too large." }, 413); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1
        || !SCENARIOS.includes(body.scenario)) return reply({ error: "Choose a supported scenario." }, 400);
    return reply(await runSharedAuthority(body.scenario));
  } catch { return reply({ error: "The synthetic run could not complete. Reset and try again." }, 400); }
}
