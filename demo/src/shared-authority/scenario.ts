import {
  ISSUER, PAYMENT_ENDPOINT, PROFILE, REFUND, SUPPORT_ENDPOINT,
  canonical, createSigner, digest, importTrusted, sign, validEffectId, verify, verifyProviderIdentity,
  type Action, type Execution, type Grant, type TrustedKey,
} from "./protocol.ts";
import type { ProviderResult } from "./providers.ts";
import { SCENARIOS, bounded, json, nowSeconds, readObject,
  type Fetcher, type Identity, type Scenario, type SharedServices, type SignedSnapshot, type Snapshot } from "./services/common.ts";
export { SCENARIOS } from "./services/common.ts";
export type { Scenario } from "./services/common.ts";
export type Step = {
  actor: string; stage: "trust" | "authorization" | "verification" | "execution";
  title: string; detail: string; status: "allow" | "deny" | "info"; reason?: string;
};
type Provider = { name: string; endpoint: string; binding: Fetcher; identity?: Identity; key?: TrustedKey };

/** The orchestrator has no authority/provider private keys or local execution fallback. */
export async function runSharedAuthority(scenario: Scenario, services: SharedServices, progress: { runId?: string } = {}) {
  if (!services.SHARED_AUTHORITY || !services.PAYMENTS_PROVIDER || !services.SUPPORT_PROVIDER) throw new Error("independent_services_not_configured");
  const authority = services.SHARED_AUTHORITY;
  const rootInfo = await bounded(authority.root());
  const root = await importTrusted(rootInfo);
  const fingerprint = await digest(rootInfo.jwk);
  const run = await bounded(authority.start(scenario));
  const runId = run.id;
  progress.runId = runId;
  const payments: Provider = { name: "PaymentsCo", endpoint: PAYMENT_ENDPOINT, binding: services.PAYMENTS_PROVIDER };
  const support: Provider = { name: "SupportCo", endpoint: SUPPORT_ENDPOINT, binding: services.SUPPORT_PROVIDER };
  const steps: Step[] = [];
  const grants: Array<{ summary: string; claims: Grant; proof: string }> = [];
  const receipts: Array<{ provider: string; claims: Execution; proof: string }> = [];
  const transport: Array<{ provider: string; endpoint: string; operation: string; status: number; requestId: string }> = [];
  const snapshots: Record<string, SignedSnapshot> = {};
  let blocked = false;
  const record = (step: Step) => steps.push(step);
  record({ actor: "Acme", stage: "trust", title: "Three independent services share a provisioned trust relationship", status: "info",
    detail: "The authority owns its signing key. PaymentsCo and SupportCo run in separate Worker deployments, each with its own signing key and durable execution state. Both recognize only Acme's scoped delegation." });

  for (const provider of [payments, support]) {
    const challenge = crypto.randomUUID();
    const identity = await request(provider, "/identity?run=" + runId + "&challenge=" + challenge, "identity", challenge) as Identity;
    provider.key = { publicKey: await verifyProviderIdentity({ certificate: identity.certificate, root, runId, now: nowSeconds(),
      provider: provider.name, endpoint: provider.endpoint, challenge, proof: identity.proof }), kid: identity.kid };
    const cert = await verify<import("./protocol.ts").ProviderCertificate>(identity.certificate, root.publicKey, root.kid, "agentaction.demo.provider.v1");
    if (identity.provider !== provider.name || identity.endpoint !== provider.endpoint || identity.kid !== cert.keyId
      || canonical(identity.publicKey) !== canonical(cert.publicKey)) throw new Error("provider_metadata_mismatch");
    provider.identity = identity;
    record({ actor: "Acme agent", stage: "trust", title: provider.name + " identity verified across its service boundary", status: "allow",
      detail: provider.endpoint + " returned a root-signed identity and a fresh key-possession proof. Only its public key crossed the boundary." });
  }
  if (scenario === "impostor") {
    try {
      const challenge = crypto.randomUUID();
      const identity = await request(payments, "/identity?run=" + runId + "&challenge=" + challenge, "identity", challenge) as Identity;
      await verifyProviderIdentity({ certificate: identity.certificate, root, runId, now: nowSeconds(), provider: payments.name,
        endpoint: "https://impostor.demo.agentaction.local/mcp", challenge, proof: identity.proof });
      throw new Error("impostor_was_accepted");
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "provider_identity_mismatch") throw error;
      blocked = true;
      record({ actor: "Acme agent", stage: "trust", title: "Impostor endpoint blocked", status: "deny", reason: "provider_identity_mismatch",
        detail: "The attempted endpoint substitution does not match PaymentsCo's certified address. Identity traffic crossed services; no customer payload was dispatched." });
      return finish();
    }
  }

  const paymentGrant = await grant(REFUND, PAYMENT_ENDPOINT);
  grants.push({ summary: "Acme authorized Support Agent 7 to refund $40 on order 123 through PaymentsCo, once, within five minutes.", claims: paymentGrant.claims, proof: paymentGrant.token });
  record({ actor: "AgentAction", stage: "authorization", title: "Exact $40 refund authorized by the authority service", status: "allow",
    detail: "The orchestrator received a signed grant over its service-only issuance capability. Neither the agent nor either provider receives the authority's private key." });
  let token = paymentGrant.token;
  const action = structuredClone(REFUND);
  if (scenario === "changed_amount") action.amountCents = 40000;
  if (scenario === "revoked") {
    await bounded(authority.revoke(runId, paymentGrant.claims.id));
    record({ actor: "AgentAction", stage: "authorization", title: "Fresh grant revoked before dispatch", status: "info",
      detail: "The authority persisted the revocation. The independent provider checks current authority state before committing execution." });
  }
  if (scenario === "untrusted_issuer") {
    // A rogue signer is an attack fixture, never a trusted authority/provider key.
    token = await sign({ ...paymentGrant.claims, issuer: "https://unknown.demo.agentaction.local" }, await createSigner("unknown-authority"), PROFILE);
  }
  const target = scenario === "wrong_provider" ? support : payments;
  const payment = await execute(target, token, action);
  report(target, payment);
  if (!payment.allowed) return finish();
  if (scenario === "replay") report(payments, await execute(payments, token, action));
  await execution(payments, payment.receipt!, paymentGrant.claims, action);
  record({ actor: "Acme agent", stage: "verification", title: "Payment execution receipt verified", status: "allow",
    detail: "PaymentsCo's own key signed the refund result. The agent verified the receipt before requesting case closure." });
  const close: Action = { tool: "support.close_case", customerId: REFUND.customerId, caseId: REFUND.caseId,
    orderId: REFUND.orderId, paymentReceiptDigest: await digest(payment.receipt) };
  const supportGrant = await grant(close, SUPPORT_ENDPOINT);
  grants.push({ summary: "Acme authorized Support Agent 7 to close case 1042 through SupportCo, once, after the verified $40 refund.", claims: supportGrant.claims, proof: supportGrant.token });
  record({ actor: "AgentAction", stage: "authorization", title: "Case update authorized by the same issuer", status: "allow",
    detail: "A separate audience-bound grant uses the same authority key and format. SupportCo receives PaymentsCo's public identity certificate and signed receipt, never its private key." });
  const closed = await execute(support, supportGrant.token, close, payment.receipt, payments.identity!.certificate);
  report(support, closed);
  if (closed.allowed) {
    await execution(support, closed.receipt!, supportGrant.claims, close);
    record({ actor: "Acme agent", stage: "verification", title: "Case execution receipt verified", status: "allow",
      detail: "SupportCo's distinct key signed the completed case update. The receipt links to its own grant and the original payment evidence." });
  }
  return finish();

  async function grant(action: Action, audience: string) {
    const issued = await bounded(authority.grant(runId, action, audience));
    const claims = await verify<Grant>(issued.token, root.publicKey, root.kid, PROFILE);
    if (claims.issuer !== ISSUER || claims.runId !== runId || claims.audience !== audience || canonical(claims.action) !== canonical(action)
      || claims.actionDigest !== await digest(action) || canonical(claims) !== canonical(issued.claims)) throw new Error("authority_grant_mismatch");
    return { token: issued.token, claims };
  }
  async function request(provider: Provider, path: string, operation: string, requestId: string, body?: unknown): Promise<any> {
    const response = await bounded(provider.binding.fetch(new Request(new URL(path, provider.endpoint), body ? {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), redirect: "manual",
    } : { redirect: "manual" })));
    transport.push({ provider: provider.name, endpoint: provider.endpoint, operation, status: response.status, requestId });
    if (!response.ok && response.status !== 403) throw new Error("provider_service_unavailable");
    return bounded(readObject(response, 64000));
  }
  async function checkSnapshot(provider: Provider, value: SignedSnapshot, challenge: string) {
    const claims = await verify<Snapshot>(value.proof, provider.key!.publicKey, provider.key!.kid, "agentaction.demo.snapshot.v1");
    if (claims.runId !== runId || claims.provider !== provider.name || claims.endpoint !== provider.endpoint
      || claims.authorityFingerprint !== fingerprint || claims.challenge !== challenge || !Number.isSafeInteger(claims.observedAt) || Math.abs(claims.observedAt - nowSeconds()) > 30
      || ![claims.refundCount, claims.refundedCents, claims.payloadsReceived, claims.consumedCount].every(n => Number.isSafeInteger(n) && n >= 0)
      || typeof claims.caseClosed !== "boolean" || canonical(value.claims) !== canonical(claims)) throw new Error("invalid_provider_snapshot");
    snapshots[provider.name] = { claims, proof: value.proof };
  }
  async function execute(provider: Provider, token: string, action: Action, paymentReceipt?: string, paymentCertificate?: string) {
    const challenge = crypto.randomUUID();
    const value = await request(provider, "/mcp", "execute", challenge,
      { runId, grant: token, action, challenge, ...(paymentReceipt ? { paymentReceipt, paymentCertificate } : {}) });
    await checkSnapshot(provider, value.snapshot, challenge);
    if (!value.result || typeof value.result.allowed !== "boolean" || typeof value.result.reason !== "string") throw new Error("invalid_provider_result");
    if (value.result.allowed) {
      const signed = await verify<Execution>(value.result.receipt, provider.key!.publicKey, provider.key!.kid, "agentaction.demo.execution.v1");
      if (canonical(signed) !== canonical(value.result.execution) || signed.runId !== runId || signed.provider !== provider.name
        || !validEffectId(signed.effectId) || signed.actionDigest !== await digest(action)
        || canonical(signed.action) !== canonical(action) || signed.status !== "executed") throw new Error("invalid_execution_receipt");
    }
    return value.result as ProviderResult;
  }
  async function execution(provider: Provider, token: string, authorized: Grant, action: Action) {
    const signed = await verify<Execution>(token, provider.key!.publicKey, provider.key!.kid, "agentaction.demo.execution.v1");
    if (signed.runId !== runId || signed.grantId !== authorized.id || signed.provider !== provider.name || signed.status !== "executed"
      || !validEffectId(signed.effectId) || signed.actionDigest !== authorized.actionDigest || canonical(signed.action) !== canonical(action)
      || !Number.isSafeInteger(signed.executedAt) || Math.abs(signed.executedAt - nowSeconds()) > 300) throw new Error("execution_mismatch");
    return signed;
  }
  function report(provider: Provider, result: ProviderResult) {
    if (!result.allowed) blocked = true;
    record({ actor: provider.name, stage: "verification", title: result.allowed ? "Grant independently verified" : "Execution rejected",
      status: result.allowed ? "allow" : "deny", reason: result.reason,
      detail: result.allowed ? "The independent service checked the issuer, signature, delegation, exact action, audience, lifetime, current revocation and its own durable use state." : rejectionDetail(result.reason) });
    if (result.allowed) {
      receipts.push({ provider: provider.name, claims: result.execution!, proof: result.receipt! });
      record({ actor: provider.name, stage: "execution", title: provider === payments ? "$40 refunded once" : "Case 1042 closed", status: "allow",
        detail: "The provider durably committed effect " + result.execution!.effectId + " and returned its signed execution evidence." });
    }
  }
  async function finish() {
    for (const provider of [payments, support]) {
      const challenge = crypto.randomUUID();
      const value = await request(provider, "/runs/" + runId + "?challenge=" + challenge, "snapshot", challenge);
      await checkSnapshot(provider, value as SignedSnapshot, challenge);
    }
    const payment = snapshots.PaymentsCo.claims, ticket = snapshots.SupportCo.claims;
    return { runId, scenario, blocked, workflowComplete: ticket.caseClosed, outcomeUnknown: false, grants, receipts, steps, transport, snapshots,
      deployment: { mode: "independent-services", authority: ISSUER, providers: [PAYMENT_ENDPOINT, SUPPORT_ENDPOINT] },
      trust: { issuer: ISSUER, publicKey: rootInfo.jwk, kid: rootInfo.kid, fingerprint, providers: [payments.identity!, support.identity!] },
      effects: { refundCount: payment.refundCount, refundedCents: payment.refundedCents, caseClosed: ticket.caseClosed,
        paymentPayloads: payment.payloadsReceived, supportPayloads: ticket.payloadsReceived },
      limits: "Separate authority, PaymentsCo and SupportCo Workers under one demo operator. Provisioned trust and synthetic data; provider state persists across calls/restarts for one hour, while runs expire after ten minutes and grants after five. No independent-vendor adoption, live payments or public certification." };
  }
}

function rejectionDetail(reason: string): string {
  const reasons: Record<string, string> = {
    action_changed: "PaymentsCo rejected the dispatched $400 request because its signed grant authorized $40. No refund executed.",
    already_consumed: "PaymentsCo's own durable state says this grant was consumed. The retry created no second refund; the first verified result can still close the case.",
    wrong_provider: "SupportCo rejected a grant addressed to PaymentsCo. Neither provider executed an action.",
    revoked: "The provider observed the authority's revocation before execution. The valid signature did not override it.",
    expired_or_invalid_lifetime: "The provider's real clock found the signed grant expired. No refund executed.",
    invalid_signature_or_profile: "The independent provider rejected a proof from an unknown signing authority. No refund executed.",
    provider_business_policy: "Acme authorized $40, but PaymentsCo independently enforces its $20 demo limit. The provider denied execution.",
  };
  return reasons[reason] || "The provider rejected the request before any new synthetic effect.";
}

export async function sharedAuthorityRequest(request: Request, services: SharedServices): Promise<Response> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return json({ error: "Use application/json." }, 415);
  let body: Record<string, any>;
  try { body = await readObject(request, 512); }
  catch (error) { return json({ error: "Choose a supported scenario." }, error instanceof Error && error.message === "body_too_large" ? 413 : 400); }
  if (Object.keys(body).length !== 1 || !SCENARIOS.includes(body.scenario)) return json({ error: "Choose a supported scenario." }, 400);
  const progress: { runId?: string } = {};
  try { return json(await runSharedAuthority(body.scenario, services, progress)); }
  catch (error) {
    console.error("shared_authority_service_error", error instanceof Error ? error.message : "unknown_error");
    return json({ error: "Independent service verification could not complete. Outcome is unknown; review provider state before retrying.", outcomeUnknown: true,
      ...(progress.runId ? { runId: progress.runId, recovery: [PAYMENT_ENDPOINT, SUPPORT_ENDPOINT].map(endpoint =>
        new URL("/runs/" + progress.runId + "?challenge=" + crypto.randomUUID(), endpoint).href) } : {}) }, 503);
  }
}
