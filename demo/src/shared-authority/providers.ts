import {
  AGENT, DELEGATION, ISSUER, PAYMENT_ENDPOINT, PRINCIPAL, PROFILE, REFUND, SUPPORT_ENDPOINT, TENANT,
  canonical, digest, fresh, sign, verify, validEffectId,
  type Action, type Execution, type Grant, type Signer, type TrustedKey,
} from "./protocol.ts";

export type ProviderResult = { allowed: boolean; reason: string; grantId?: string; receipt?: string; execution?: Execution };
export type ProviderState = {
  revoked: Set<string>; consumed: Set<string>; payloadsReceived: number;
  refundCount: number; refundedCents: number; caseClosed: boolean;
};
export function createState(): ProviderState {
  return { revoked: new Set(), consumed: new Set(), payloadsReceived: 0, refundCount: 0, refundedCents: 0, caseClosed: false };
}
export type ProviderOptions = {
  root: TrustedKey; signer: Signer; runId: string; now: number; state: ProviderState;
};

/** Verification is outside agent control. Shared code defines a common experimental profile. */
abstract class Provider {
  abstract readonly id: string;
  abstract readonly endpoint: string;
  abstract readonly tool: string;
  readonly options: ProviderOptions;
  constructor(options: ProviderOptions) { this.options = options; }

  async identify(challenge: string): Promise<string> {
    return sign({ challenge, endpoint: this.endpoint, runId: this.options.runId }, this.options.signer, "agentaction.demo.possession.v1");
  }

  async execute(token: string, action: Action, paymentReceipt?: string): Promise<ProviderResult> {
    this.options.state.payloadsReceived++;
    let grant: Grant;
    try {
      grant = await verify<Grant>(token, this.options.root.publicKey, this.options.root.kid, PROFILE);
    } catch { return { allowed: false, reason: "invalid_signature_or_profile" }; }
    if (!grant || typeof grant !== "object" || Array.isArray(grant)) return { allowed: false, reason: "invalid_grant_context" };
    const deny = (reason: string): ProviderResult => ({ allowed: false, reason, grantId: grant.id });
    if (grant.issuer !== ISSUER) return deny("untrusted_issuer");
    if (grant.profile !== PROFILE || grant.runId !== this.options.runId || typeof grant.id !== "string" || !grant.id) return deny("invalid_grant_context");
    if (grant.tenant !== TENANT || grant.agent !== AGENT || grant.principal !== PRINCIPAL || grant.delegation !== DELEGATION) return deny("untrusted_delegation");
    if (grant.audience !== this.endpoint) return deny("wrong_provider");
    if (!fresh(grant.issuedAt, grant.expiresAt, this.options.now)) return deny("expired_or_invalid_lifetime");
    if (action.tool !== this.tool || canonical(action) !== canonical(grant.action)
        || await digest(action) !== grant.actionDigest) return deny("action_changed");
    if (this.options.state.revoked.has(grant.id)) return deny("revoked");
    if (this.options.state.consumed.has(grant.id)) return deny("already_consumed");
    const policyError = await this.businessPolicy(action, paymentReceipt);
    if (policyError) return deny(policyError);
    // Prepare the signed evidence first. The final check + consumption + synthetic effect
    // below have no await between them, so concurrent calls cannot both execute.
    const execution: Execution = {
      provider: this.id, runId: this.options.runId, grantId: grant.id, actionDigest: grant.actionDigest,
      status: "executed", effectId: crypto.randomUUID(), action: structuredClone(action), executedAt: this.options.now,
    };
    const receipt = await sign(execution, this.options.signer, "agentaction.demo.execution.v1");
    if (this.options.state.revoked.has(grant.id)) return deny("revoked");
    if (this.options.state.consumed.has(grant.id)) return deny("already_consumed");
    if (this.id === "PaymentsCo" && this.options.state.refundCount > 0) return deny("order_already_refunded");
    if (this.id === "SupportCo" && this.options.state.caseClosed) return deny("case_already_closed");
    this.options.state.consumed.add(grant.id);
    this.applyEffect(action);
    return { allowed: true, reason: "executed", grantId: grant.id, receipt, execution };
  }

  protected abstract businessPolicy(action: Action, paymentReceipt?: string): Promise<string | undefined>;
  protected abstract applyEffect(action: Action): void;
}

export class PaymentsProvider extends Provider {
  readonly id = "PaymentsCo";
  readonly endpoint = PAYMENT_ENDPOINT;
  readonly tool = "payments.refund";
  // This independent provider policy can be stricter than the enterprise grant.
  maxRefundCents = 4000;
  protected async businessPolicy(action: Action): Promise<string | undefined> {
    if (canonical(action) !== canonical(REFUND) || action.amountCents! > this.maxRefundCents) return "provider_business_policy";
  }
  protected applyEffect(action: Action): void {
    this.options.state.refundCount++;
    this.options.state.refundedCents += action.amountCents!;
  }
}

export class SupportProvider extends Provider {
  readonly id = "SupportCo";
  readonly endpoint = SUPPORT_ENDPOINT;
  readonly tool = "support.close_case";
  readonly paymentsKey: TrustedKey;
  constructor(options: ProviderOptions, paymentsKey: TrustedKey) { super(options); this.paymentsKey = paymentsKey; }
  protected async businessPolicy(action: Action, paymentReceipt?: string): Promise<string | undefined> {
    if (!paymentReceipt || action.paymentReceiptDigest !== await digest(paymentReceipt)) return "payment_evidence_missing";
    try {
      const result = await verify<Execution>(paymentReceipt, this.paymentsKey.publicKey, this.paymentsKey.kid, "agentaction.demo.execution.v1");
      if (result.provider !== "PaymentsCo" || result.runId !== this.options.runId || result.status !== "executed"
          || !validEffectId(result.effectId) || typeof result.grantId !== "string" || !result.grantId
          || canonical(result.action) !== canonical(REFUND) || result.actionDigest !== await digest(REFUND)
          || !Number.isSafeInteger(result.executedAt) || result.executedAt > this.options.now || result.executedAt < this.options.now - 300
          || action.customerId !== result.action.customerId || action.orderId !== result.action.orderId || action.caseId !== result.action.caseId) return "payment_evidence_invalid";
    } catch { return "payment_evidence_invalid"; }
    if (this.options.state.caseClosed) return "case_already_closed";
  }
  protected applyEffect(): void { this.options.state.caseClosed = true; }
}
