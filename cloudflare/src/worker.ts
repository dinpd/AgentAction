import {
  bindIntentContract,
  digestIntentContract,
  evaluateIntent,
  type IntentContract,
  type IntentEvidence,
} from "../../packages/guard/src/intent.ts";
import {
  IntentObservationVerificationError,
  verifiedIntentObservationFinding,
  verifyIntentObservationRequest,
} from "./intent-observation.ts";

type Env = {
  AGENTID_API_KEY?: string;
  AGENTID_AUDIT_WEBHOOK_TOKEN?: string;
  AGENTID_AUDIT_WEBHOOK_URL?: string;
  AGENTID_DEMO_OIDC_SECRET?: string;
  AGENTID_GITHUB_API_BASE?: string;
  AGENTID_GITHUB_TOKEN?: string;
  AGENTID_MANIFEST_JSON?: string;
  AGENTID_INTENT_OBSERVATION_DEV_UNSIGNED?: string;
  AGENTID_MANIFESTS?: {
    get(key: string): Promise<string | null>;
  };
  AGENTID_RECEIPT_AUDIENCE?: string;
  AGENTID_RECEIPT_ISSUER?: string;
  AGENTID_RECEIPT_KEY_ID?: string;
  AGENTID_RECEIPT_PRIVATE_JWK?: string;
  AGENTID_RECEIPT_PUBLIC_JWKS?: string;
  JIT_GRANTS: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(request: Request): Promise<Response> };
  };
};

type AgentIdManifest = {
  [key: string]: unknown;
  agent?: Record<string, unknown>;
  capabilities?: Array<Record<string, unknown>>;
  tools?: Array<Record<string, unknown>>;
  data_flows?: Array<Record<string, unknown>>;
  delegation_chain?: Record<string, unknown>;
  job_boundary?: Record<string, unknown>;
  jit_authorization?: Record<string, unknown>;
  intent_assurance?: Record<string, unknown>;
};

type ToolEvent = Record<string, unknown>;
type AuthContext = {
  method: "api_key" | "oidc" | "none";
  subject?: string;
  tenant_id?: string;
  user_id?: string;
  agent_id?: string;
  scopes?: string[];
  issuer?: string;
};
type Grant = {
  jit_grant_id: string;
  agent_id: string;
  intent_id?: string;
  intent_digest?: string;
  tool: string;
  action: string;
  resource: string;
  approval_id: string;
  user_id: string;
  expires_at: string;
  job_id?: string;
  case_id?: string;
  customer_id?: string;
  context?: Record<string, string>;
  evidence?: ApprovalEvidence;
  used: boolean;
};
type ApprovalEvidence = {
  schema_version: "agentpass.approval-evidence.v1";
  agent_id: string;
  intent_id?: string;
  intent_digest?: string;
  user_id?: string;
  tenant_id?: string;
  job_id?: string;
  case_id?: string;
  customer_id?: string;
  tool: string;
  action: string;
  resource?: string;
  amount?: number;
  currency?: string;
  data_from?: string;
  data_to?: string;
  destination_type?: string;
  external_domain?: string;
  data_classification: string[];
  field_set: string[];
  record_count?: number;
  redaction_state?: string;
  retention?: string;
  idempotency_key?: string;
  call_fingerprint?: string;
  request_digest: string;
  policy_version?: string;
  policy_findings: string[];
  prior_attempt_count?: number;
  budget_state?: Record<string, unknown>;
  expires_at: string;
  basis_category?: string;
  basis_ref?: string;
  context?: Record<string, string>;
};
type ApprovalRequest = {
  approval_id: string;
  status: "pending" | "approved" | "denied" | "expired";
  agent_id: string;
  intent_id?: string;
  intent_digest?: string;
  tool: string;
  action: string;
  resource: string;
  requested_by: string;
  reason: string;
  created_at: string;
  expires_at: string;
  decided_at?: string;
  decided_by?: string;
  decision_reason?: string;
  job_id?: string;
  case_id?: string;
  customer_id?: string;
  context?: Record<string, string>;
  evidence: ApprovalEvidence;
  findings?: string[];
};
type ProviderExecutionReceipt = {
  schema_version: "agentpass.provider-execution-receipt.v1";
  decision_id: string;
  intent_id?: string;
  intent_digest?: string;
  job_id?: string;
  tool: string;
  action: string;
  resource?: string;
  amount?: number;
  currency?: string;
  idempotency_key?: string;
  request_digest: string;
  status: "executed" | "replayed";
  executed_at: string;
  completed_at?: string;
  result_digest?: string;
  replayed_from_decision_id?: string;
  replay_count?: number;
};
type ProviderAuthorizationReceipt = {
  schema_version: "agentpass.provider-authorization-receipt.v1";
  decision_id: string;
  intent_id?: string;
  intent_digest?: string;
  tenant_id?: string;
  agent_id: string;
  user_id?: string;
  tool: string;
  action: string;
  resource?: string;
  job_id?: string;
  case_id?: string;
  customer_id?: string;
  approval_id?: string;
  jit_grant_id?: string;
  amount?: number;
  currency?: string;
  idempotency_key?: string;
  request_digest: string;
  issued_at: string;
  expires_at: string;
};
type JwsProviderAuthorizationReceipt = {
  jws: string;
};
type IdempotencyResultRecord = {
  schema_version: "agentpass.idempotency-result.v1";
  idempotency_key: string;
  request_digest: string;
  agent_id: string;
  intent_id?: string;
  intent_digest?: string;
  tool: string;
  action: string;
  resource?: string;
  amount?: number;
  currency?: string;
  approval_id?: string;
  jit_grant_id?: string;
  approval_evidence?: ApprovalEvidence;
  result: unknown;
  receipt: ProviderExecutionReceipt;
  created_at: string;
  replay_count: number;
};
type IntentContractRecord = {
  schema_version: "agentpass.intent-registry-record.v1";
  intent_id: string;
  intent_digest: string;
  job_id: string;
  tenant_id?: string;
  registered_at: string;
  registered_by?: string;
  contract: IntentContract;
};
type IntentBindingResult = {
  status: "unbound" | "bound";
  contract?: IntentContract;
};
type AuditRecord = {
  audit_id: string;
  received_at: string;
  schema_version: string;
  type: string;
  tenant_id?: string | null;
  agent_id?: string;
  intent_id?: string;
  tool?: string;
  action?: string;
  resource?: string;
  approval_id?: string;
  jit_grant_id?: string;
  allow?: boolean;
  payload: Record<string, unknown>;
};
type Route = {
  tenantId: string | null;
  endpoint: string;
  resourceId: string;
  action: string;
};
type AuthorizationDecision = {
  allow: boolean;
  challengeRequired?: boolean;
  findings: string[];
  event: ToolEvent;
  replayed?: boolean;
  result?: unknown;
  receipt?: ProviderExecutionReceipt;
};

const APPROVAL_REQUIRED = new Set(["required", "human_confirm", "step_up", "manager"]);

const SAMPLE_MANIFEST: AgentIdManifest = {
  agent: {
    id: "customer-support-refund-agent",
    name: "Customer Support Refund Agent",
    owner: "support-platform-team",
    environment: "production",
    purpose: "Handles refund triage and drafts refund decisions",
    expires_at: "2026-12-31",
  },
  delegation_chain: { may_call_agents: false, allowed_agents: [] },
  intent: { confirmation_required_for: ["external_email", "payment", "data_delete", "permission_change"] },
  jit_authorization: {
    enabled: true,
    default_ttl_seconds: 300,
    bind_token_to: ["agent_id", "user_id", "tool", "action", "resource", "approval_id"],
    revoke_after_use: true,
  },
  tools: [
    { name: "zendesk.search_tickets", access: "read", auth_mode: "delegated", approval: "none" },
    {
      name: "stripe.create_refund",
      access: "write",
      auth_mode: "just_in_time",
      approval: "human_confirm",
      constraints: { max_amount_usd: 100, token_ttl_seconds: 300 },
    },
    {
      name: "email.send_external",
      access: "write",
      auth_mode: "just_in_time",
      approval: "human_confirm",
      constraints: { token_ttl_seconds: 120 },
    },
  ],
  data_flows: [
    { from: "zendesk", to: "stripe", allowed: true },
    { from: "customer_records", to: "external_email", allowed: false },
  ],
  runtime: { enforce_manifest: true, detect_tool_drift: true, detect_new_destinations: true },
  audit: { log_prompt_summary: true, log_tool_calls: true, log_decisions: true, log_jit_grants: true },
  kill_switch: { enabled: true, revoke_on_policy_violation: true },
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      if (request.method === "OPTIONS") {
        return empty(204);
      }

      const url = new URL(request.url);
      const route = parseRoute(url.pathname);

      if (request.method === "GET" && route.endpoint === "audit" && !route.resourceId) {
        return html(AUDIT_UI_HTML);
      }

      if (request.method === "GET" && route.endpoint === "approvals" && !route.resourceId) {
        return html(APPROVALS_UI_HTML);
      }

      if (request.method === "GET" && route.endpoint === ".well-known" && route.resourceId === "jwks.json") {
        return json(receiptPublicJwks(env));
      }

      if (request.method === "GET" && route.endpoint === "jwks") {
        return json(receiptPublicJwks(env));
      }

      if (request.method === "POST" && route.endpoint === "audit" && route.resourceId === "webhook" && route.action === "agentid") {
        const inbound = authenticateAuditWebhook(request, env);
        if (!inbound.ok) return json({ error: inbound.error }, inbound.status);
        const payload = await readJson(request);
        const stored = await auditStore(env).fetch(
          new Request("https://agentid.local/audit-events", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          }),
        );
        return json(await stored.json(), stored.status);
      }

      const manifest = await loadManifest(env, route.tenantId);
      const authentication = await authenticate(request, env, manifest, route.tenantId, route.endpoint);
      const isObservationIngestion = request.method === "POST" &&
        route.endpoint === "intent-contracts" && Boolean(route.resourceId) && route.action === "observations";
      if (!authentication.ok && !isObservationIngestion) {
        return json({ error: authentication.error }, authentication.status);
      }
      const auth: { ok: true; context: AuthContext } = authentication.ok
        ? authentication
        : { ok: true, context: { method: "none" } };

      if (request.method === "GET" && route.endpoint === "health") {
        return json({ ok: true, agent_id: manifest.agent?.id ?? null, tenant_id: route.tenantId ?? null, auth: auth.context });
      }

      if (request.method === "GET" && route.endpoint === "policy") {
        const target = url.searchParams.get("target") ?? "opa";
        if (target !== "opa") {
          return json({ error: "Only target=opa is currently supported." }, 400);
        }
        return text(generateOpaPolicy(manifest));
      }

      if (request.method === "GET" && route.endpoint === "audit" && route.resourceId === "events") {
        const search = new URLSearchParams(url.searchParams);
        const stored = await auditStore(env).fetch(new Request(`https://agentid.local/audit-events?${search.toString()}`));
        const body = await stored.json() as Record<string, unknown>;
        body.auth = auth.context;
        return json(body, stored.status);
      }

      if (request.method === "POST" && route.endpoint === "intent-contracts" && !route.resourceId) {
        const contract = await readJson(request);
        const stored = await authorizationStore(env, route.tenantId, manifest).fetch(
          new Request("https://agentid.local/intent-contracts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              contract,
              tenant_id: route.tenantId,
              registered_by: auth.context.subject || auth.context.user_id || auth.context.agent_id || auth.context.method,
            }),
          }),
        );
        const body = await stored.json() as Record<string, unknown>;
        if (stored.ok) {
          ctx.waitUntil(
            emitAudit(env, {
              type: "agentpass.intent.registered",
              tenant_id: route.tenantId,
              intent_id: stringValue(body.intent_id),
              intent_digest: stringValue(body.intent_digest),
              job_id: stringValue(body.job_id),
              intent_contract: body.contract,
              auth: auth.context,
            }),
          );
        }
        body.auth = auth.context;
        return json(body, stored.status);
      }

      if (request.method === "GET" && route.endpoint === "intent-contracts" && !route.resourceId) {
        const stored = await authorizationStore(env, route.tenantId, manifest).fetch(
          new Request("https://agentid.local/intent-contracts"),
        );
        const body = await stored.json() as Record<string, unknown>;
        body.auth = auth.context;
        return json(body, stored.status);
      }

      if (request.method === "GET" && route.endpoint === "intent-contracts" && route.resourceId && !route.action) {
        const stored = await authorizationStore(env, route.tenantId, manifest).fetch(
          new Request(`https://agentid.local/intent-contracts/${encodeURIComponent(route.resourceId)}`),
        );
        const body = await stored.json() as Record<string, unknown>;
        body.auth = auth.context;
        return json(body, stored.status);
      }

      if (
        request.method === "POST" &&
        route.endpoint === "intent-contracts" &&
        route.resourceId &&
        route.action === "observations"
      ) {
        const submitted = await readJson(request);
        const store = authorizationStore(env, route.tenantId, manifest);
        const registeredResponse = await store.fetch(
          new Request(`https://agentid.local/intent-contracts/${encodeURIComponent(route.resourceId)}`),
        );
        if (!registeredResponse.ok) {
          const body = await registeredResponse.json() as Record<string, unknown>;
          const errorCode = registeredResponse.status === 404
            ? "observation_intent_not_registered"
            : "observation_registry_unavailable";
          body.error_code = errorCode;
          ctx.waitUntil(
            emitAudit(env, {
              type: "agentpass.intent.observation.rejected",
              tenant_id: route.tenantId,
              intent_id: route.resourceId,
              ...observationAuditMetadata(submitted),
              error_code: errorCode,
              error: stringValue(body.error),
              auth: auth.context,
            }),
          );
          body.auth = auth.context;
          return json(body, registeredResponse.status);
        }
        const registered = await registeredResponse.json() as Record<string, unknown>;
        let observation: Record<string, unknown>;
        try {
          observation = await verifyIntentObservationRequest({
            request: submitted,
            manifest,
            contract: recordValue(registered.contract) as IntentContract,
            tenantId: route.tenantId,
            routeIntentId: route.resourceId,
            auth: auth.context,
            env,
          }) as unknown as Record<string, unknown>;
        } catch (error) {
          if (!(error instanceof IntentObservationVerificationError)) throw error;
          ctx.waitUntil(
            emitAudit(env, {
              type: "agentpass.intent.observation.rejected",
              tenant_id: route.tenantId,
              intent_id: route.resourceId,
              ...observationAuditMetadata(submitted),
              error_code: error.code,
              error: error.message,
              auth: auth.context,
            }),
          );
          return json({ error: error.message, error_code: error.code, details: error.details, auth: auth.context }, error.status);
        }
        const stored = await store.fetch(
          new Request(`https://agentid.local/intent-contracts/${encodeURIComponent(route.resourceId)}/observations`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ observation }),
          }),
        );
        const body = await stored.json() as Record<string, unknown>;
        if (stored.ok) {
          const storedObservation = recordValue(body.observation);
          const replayed = body.replayed === true;
          ctx.waitUntil(
            emitAudit(env, {
              type: replayed ? "agentpass.intent.observation.replayed" : "agentpass.intent.observation.accepted",
              tenant_id: route.tenantId,
              intent_id: stringValue(storedObservation.intent_id),
              intent_digest: stringValue(storedObservation.intent_digest),
              observation_id: stringValue(storedObservation.observation_id),
              issuer: stringValue(storedObservation.issuer),
              predicate: stringValue(storedObservation.predicate),
              payload_digest: stringValue(storedObservation.payload_digest),
              verification_method: stringValue(recordValue(storedObservation.provenance).verification_method),
              auth: auth.context,
            }),
          );
        } else {
          ctx.waitUntil(
            emitAudit(env, {
              type: "agentpass.intent.observation.rejected",
              tenant_id: route.tenantId,
              intent_id: route.resourceId,
              ...observationAuditMetadata(observation),
              error_code: stringValue(body.error_code) || "observation_storage_rejected",
              error: stringValue(body.error),
              auth: auth.context,
            }),
          );
        }
        body.auth = auth.context;
        return json(body, stored.status);
      }

      if (
        request.method === "POST" &&
        route.endpoint === "intent-contracts" &&
        route.resourceId &&
        route.action === "evaluate"
      ) {
        const evaluationRequest = await readJson(request);
        const stored = await authorizationStore(env, route.tenantId, manifest).fetch(
          new Request(`https://agentid.local/intent-contracts/${encodeURIComponent(route.resourceId)}/evaluate`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(evaluationRequest),
          }),
        );
        const body = await stored.json() as Record<string, unknown>;
        if (stored.ok) {
          ctx.waitUntil(
            emitAudit(env, {
              type: "agentpass.intent.evaluated",
              tenant_id: route.tenantId,
              intent_id: stringValue(body.intent_id),
              intent_digest: stringValue(body.intent_digest),
              job_id: stringValue(body.job_id),
              verdict: stringValue(body.verdict),
              qualified_success: body.qualified_success === true,
              evaluation: body,
              auth: auth.context,
            }),
          );
        }
        body.auth = auth.context;
        return json(body, stored.status);
      }

      if (request.method === "GET" && route.endpoint === "approval-requests" && !route.resourceId) {
        const search = new URLSearchParams(url.searchParams);
        const stored = await authorizationStore(env, route.tenantId, manifest).fetch(
          new Request(`https://agentid.local/approvals?${search.toString()}`),
        );
        const body = await stored.json() as Record<string, unknown>;
        body.auth = auth.context;
        return json(body, stored.status);
      }

      if (request.method === "GET" && route.endpoint === "approval-requests" && route.resourceId) {
        const stored = await authorizationStore(env, route.tenantId, manifest).fetch(
          new Request(`https://agentid.local/approvals/${encodeURIComponent(route.resourceId)}`),
        );
        const body = await stored.json() as Record<string, unknown>;
        body.auth = auth.context;
        return json(body, stored.status);
      }

      if (request.method === "POST" && route.endpoint === "authorize") {
        const payload = await readJson(request);
        const decision = await authorize(manifest, payload, env, route.tenantId);
        await recordIntentDecisionEvidence(env, route.tenantId, manifest, decision);
        const authorizationReceipt = decision.allow && !decision.replayed
          ? await createProviderAuthorizationReceipt(env, decision.event, route.tenantId)
          : undefined;
        ctx.waitUntil(
          emitAudit(env, {
            type: "agentid.decision",
            tenant_id: route.tenantId,
            agent_id: stringValue(decision.event.agent_id),
            allow: decision.allow,
            findings: decision.findings,
            event: decision.event,
            approval_evidence: recordValue(decision.event.approval_evidence),
            decision: decision.allow ? "allow" : decision.challengeRequired ? "challenge_required" : "deny",
            failure_class: decision.allow ? undefined : "permission_failure",
            decision_summary: decisionSummary(decision.allow, decision.findings, decision.event),
            authorization_receipt: authorizationReceipt,
            auth: auth.context,
          }),
        );
        if (decision.replayed) {
          ctx.waitUntil(
            emitAudit(env, {
              type: "agentid.provider.replayed",
              tenant_id: route.tenantId,
              agent_id: stringValue(decision.event.agent_id),
              tool: stringValue(decision.event.tool),
              action: stringValue(decision.event.action),
              resource: stringValue(decision.event.resource),
              approval_id: stringValue(decision.event.approval_id),
              jit_grant_id: stringValue(decision.event.jit_grant_id),
              provider_result: decision.result,
              provider_execution_receipt: decision.receipt,
              auth: auth.context,
            }),
          );
        }
        return json(
          {
            allow: decision.allow,
            findings: decision.findings,
            decision: decision.allow ? "allow" : decision.challengeRequired ? "challenge_required" : "deny",
            event: decision.event,
            replayed: decision.replayed,
            result: decision.result,
            receipt: decision.receipt,
            authorization_receipt: authorizationReceipt,
            auth: auth.context,
          },
          decision.allow ? 200 : 403,
        );
      }

      if (request.method === "POST" && route.endpoint === "github-actions" && route.resourceId === "dispatch") {
        const payload = await readJson(request);
        const decision = await authorize(manifest, payload, env, route.tenantId);
        await recordIntentDecisionEvidence(env, route.tenantId, manifest, decision);
        ctx.waitUntil(
          emitAudit(env, {
            type: "agentid.decision",
            tenant_id: route.tenantId,
            agent_id: stringValue(decision.event.agent_id),
            allow: decision.allow,
            findings: decision.findings,
            event: decision.event,
            approval_evidence: recordValue(decision.event.approval_evidence),
            decision: decision.allow ? "allow" : decision.challengeRequired ? "challenge_required" : "deny",
            failure_class: decision.allow ? undefined : "permission_failure",
            decision_summary: decisionSummary(decision.allow, decision.findings, decision.event),
            auth: auth.context,
          }),
        );
        if (!decision.allow) {
          return json(
            {
              allow: false,
              findings: decision.findings,
              decision: decision.challengeRequired ? "challenge_required" : "deny",
              event: decision.event,
              auth: auth.context,
            },
            403,
          );
        }
        if (decision.replayed) {
          ctx.waitUntil(
            emitAudit(env, {
              type: "agentid.provider.replayed",
              tenant_id: route.tenantId,
              agent_id: stringValue(decision.event.agent_id),
              tool: stringValue(decision.event.tool),
              action: stringValue(decision.event.action),
              resource: stringValue(decision.event.resource),
              approval_id: stringValue(decision.event.approval_id),
              jit_grant_id: stringValue(decision.event.jit_grant_id),
              provider_result: decision.result,
              provider_execution_receipt: decision.receipt,
              auth: auth.context,
            }),
          );
          return json({
            allow: true,
            replayed: true,
            result: decision.result,
            receipt: decision.receipt,
            event: decision.event,
            auth: auth.context,
          });
        }

        const dispatchResult = await dispatchGithubActions(env, decision.event);
        const stored = await authorizationStore(env, route.tenantId, manifest).fetch(
          new Request("https://agentid.local/execution-results", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ manifest, event: decision.event, result: dispatchResult }),
          }),
        );
        const body = await stored.json() as Record<string, unknown>;
        if (stored.status === 201) {
          ctx.waitUntil(
            emitAudit(env, {
              type: "agentid.provider.executed",
              tenant_id: route.tenantId,
              agent_id: stringValue(body.agent_id),
              tool: stringValue(body.tool),
              action: stringValue(body.action),
              resource: stringValue(body.resource),
              approval_id: stringValue(body.approval_id),
              jit_grant_id: stringValue(body.jit_grant_id),
              provider_result: body.result,
              provider_execution_receipt: body.receipt,
              auth: auth.context,
            }),
          );
        }
        body.auth = auth.context;
        return json(body, stored.status);
      }

      if (request.method === "POST" && route.endpoint === "approval-requests" && !route.resourceId) {
        const payload = await readJson(request);
        const intentBinding = await resolveIntentBinding(env, route.tenantId, manifest, payload);
        if (intentBinding.findings.length > 0) {
          return json({ error: intentBinding.findings[0], findings: intentBinding.findings, auth: auth.context }, 400);
        }
        const approval = await createApprovalRequest(manifest, payload, route.tenantId);
        const stored = await authorizationStore(env, route.tenantId, manifest).fetch(
          new Request("https://agentid.local/approvals", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(approval),
          }),
        );
        const body = await stored.json() as Record<string, unknown>;
        if (stored.ok) {
          ctx.waitUntil(
            emitAudit(env, {
              type: "agentid.approval.created",
              tenant_id: route.tenantId,
              agent_id: stringValue(body.agent_id),
              approval_id: stringValue(body.approval_id),
              approval: body,
              auth: auth.context,
            }),
          );
        }
        body.auth = auth.context;
        return json(body, stored.status);
      }

      if (
        request.method === "POST" &&
        route.endpoint === "approval-requests" &&
        route.resourceId &&
        (route.action === "approve" || route.action === "deny")
      ) {
        const payload = await readJson(request);
        const stored = await authorizationStore(env, route.tenantId, manifest).fetch(
          new Request(`https://agentid.local/approvals/${encodeURIComponent(route.resourceId)}/${route.action}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          }),
        );
        const body = await stored.json() as Record<string, unknown>;
        if (stored.ok) {
          ctx.waitUntil(
            emitAudit(env, {
              type: "agentid.approval.decided",
              tenant_id: route.tenantId,
              agent_id: stringValue(body.agent_id),
              approval_id: stringValue(body.approval_id),
              approval_status: stringValue(body.status),
              decision_reason: stringValue(body.decision_reason),
              approval: body,
              auth: auth.context,
            }),
          );
        }
        body.auth = auth.context;
        return json(body, stored.status);
      }

      if (request.method === "POST" && route.endpoint === "execution-results") {
        const payload = await readJson(request);
        const event = toolEventFromPayload(manifest, payload, route.tenantId);
        const intentBinding = await resolveIntentBinding(env, route.tenantId, manifest, event);
        if (intentBinding.findings.length > 0) {
          return json({ error: intentBinding.findings[0], findings: intentBinding.findings, auth: auth.context }, 400);
        }
        const resultPayload = hasValue(payload.result) ? payload.result : payload.provider_result;
        if (!hasValue(resultPayload)) return json({ error: "result is required" }, 400);
        const stored = await authorizationStore(env, route.tenantId, manifest).fetch(
          new Request("https://agentid.local/execution-results", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ manifest, event, result: resultPayload }),
          }),
        );
        const body = await stored.json() as Record<string, unknown>;
        if (stored.status === 201) {
          ctx.waitUntil(
            emitAudit(env, {
              type: "agentid.provider.executed",
              tenant_id: route.tenantId,
              agent_id: stringValue(body.agent_id),
              tool: stringValue(body.tool),
              action: stringValue(body.action),
              resource: stringValue(body.resource),
              approval_id: stringValue(body.approval_id),
              jit_grant_id: stringValue(body.jit_grant_id),
              provider_result: body.result,
              provider_execution_receipt: body.receipt,
              auth: auth.context,
            }),
          );
        }
        body.auth = auth.context;
        return json(body, stored.status);
      }

      if (request.method === "POST" && route.endpoint === "jit-grants") {
        const payload = await readJson(request);
        const intentBinding = await resolveIntentBinding(env, route.tenantId, manifest, payload);
        if (intentBinding.findings.length > 0) {
          return json({ error: intentBinding.findings[0], findings: intentBinding.findings, auth: auth.context }, 400);
        }
        const checked = await authorizationStore(env, route.tenantId, manifest).fetch(
          new Request("https://agentid.local/approvals/require-approved", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ manifest, request: payload }),
          }),
        );
        if (!checked.ok) {
          const body = await checked.json() as Record<string, unknown>;
          ctx.waitUntil(
            emitAudit(env, {
              type: "agentid.jit.denied",
              tenant_id: route.tenantId,
              agent_id: stringValue(manifest.agent?.id),
              approval_id: stringValue(payload.approval_id),
              tool: stringValue(payload.tool),
              action: stringValue(payload.action),
              resource: stringValue(payload.resource),
              error: stringValue(body.error),
              auth: auth.context,
            }),
          );
          body.auth = auth.context;
          return json(body, checked.status);
        }
        const checkedBody = await checked.json() as { approval?: ApprovalRequest };
        const grant = createJitGrant(manifest, payload, checkedBody.approval);
        const stored = await authorizationStore(env, route.tenantId, manifest).fetch(
          new Request("https://agentid.local/grants", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(grant),
          }),
        );
        const body = await stored.json() as Record<string, unknown>;
        if (stored.ok) {
          ctx.waitUntil(
            emitAudit(env, {
              type: "agentid.jit.issued",
              tenant_id: route.tenantId,
              agent_id: stringValue(body.agent_id),
              approval_id: stringValue(body.approval_id),
              jit_grant_id: stringValue(body.jit_grant_id),
              grant: body,
              auth: auth.context,
            }),
          );
        }
        body.auth = auth.context;
        return json(body, stored.status);
      }

      return json({ error: "not found" }, 404);
    } catch (error) {
      return json({ error: (error as Error).message }, 400);
    }
  },
};

export class AgentIdJitGrants {
  state: {
    storage: {
      get<T = unknown>(key: string): Promise<T | undefined>;
      put<T = unknown>(key: string, value: T): Promise<void>;
    };
  };

  constructor(state: AgentIdJitGrants["state"]) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const payload = request.method === "GET" ? {} : await readJson(request);

    if (request.method === "POST" && url.pathname === "/grants") {
      const grant = payload as Grant;
      await this.state.storage.put(grant.jit_grant_id, grant);
      return json(grant, 201);
    }

    if (request.method === "POST" && url.pathname === "/audit-events") {
      const record = auditRecord(payload);
      const index = await this.state.storage.get<string[]>("audit:index") || [];
      index.unshift(record.audit_id);
      const capped = index.slice(0, 250);
      await this.state.storage.put(`audit:${record.audit_id}`, record);
      await this.state.storage.put("audit:index", capped);
      return json(record, 202);
    }

    if (request.method === "GET" && url.pathname === "/audit-events") {
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || "100"), 1), 250);
      const filters = {
        type: url.searchParams.get("type") || "",
        tenant_id: url.searchParams.get("tenant_id") || "",
        agent_id: url.searchParams.get("agent_id") || "",
        intent_id: url.searchParams.get("intent_id") || "",
        tool: url.searchParams.get("tool") || "",
        approval_id: url.searchParams.get("approval_id") || "",
        jit_grant_id: url.searchParams.get("jit_grant_id") || "",
      };
      const index = await this.state.storage.get<string[]>("audit:index") || [];
      const events: AuditRecord[] = [];
      for (const id of index) {
        const record = await this.state.storage.get<AuditRecord>(`audit:${id}`);
        if (!record || !auditMatches(record, filters)) continue;
        events.push(record);
        if (events.length >= limit) break;
      }
      return json({ events, count: events.length });
    }

    if (request.method === "POST" && url.pathname === "/intent-contracts") {
      try {
        const submitted = recordValue(payload.contract) as IntentContract;
        const submittedDigest = optionalString(submitted.intent_digest);
        const computedDigest = digestIntentContract(submitted);
        if (submittedDigest && submittedDigest !== computedDigest) {
          return json({ error: "intent contract digest does not match contract contents" }, 400);
        }
        const contract = bindIntentContract(submitted);
        const dateFinding = intentContractDateFinding(contract);
        if (dateFinding) return json({ error: dateFinding }, 400);

        const existing = await this.state.storage.get<IntentContractRecord>(`intent:${contract.intent_id}:contract`);
        if (existing) {
          if (existing.intent_digest !== contract.intent_digest) {
            return json({ error: `intent contract is frozen: ${contract.intent_id}` }, 409);
          }
          return json(intentContractResponse(existing));
        }

        const record: IntentContractRecord = {
          schema_version: "agentpass.intent-registry-record.v1",
          intent_id: contract.intent_id,
          intent_digest: stringValue(contract.intent_digest),
          job_id: contract.job_id,
          tenant_id: optionalString(payload.tenant_id),
          registered_at: new Date().toISOString(),
          registered_by: optionalString(payload.registered_by),
          contract,
        };
        const index = await this.state.storage.get<string[]>("intent:index") || [];
        const next = [record.intent_id, ...index.filter((id) => id !== record.intent_id)].slice(0, 1_000);
        await this.state.storage.put(`intent:${record.intent_id}:contract`, record);
        await this.state.storage.put("intent:index", next);
        return json(intentContractResponse(record), 201);
      } catch (error) {
        return json({ error: (error as Error).message }, 400);
      }
    }

    if (request.method === "GET" && url.pathname === "/intent-contracts") {
      const index = await this.state.storage.get<string[]>("intent:index") || [];
      const contracts: Record<string, unknown>[] = [];
      for (const intentId of index) {
        const record = await this.state.storage.get<IntentContractRecord>(`intent:${intentId}:contract`);
        if (record) contracts.push(intentContractResponse(record));
      }
      return json({ intent_contracts: contracts, count: contracts.length });
    }

    if (request.method === "POST" && url.pathname === "/intent-contracts/resolve") {
      const resolved = await this.resolveIntentRecord(recordValue(payload.event));
      if (resolved.error) return json({ error: resolved.error, findings: [resolved.error] }, resolved.httpStatus);
      if (!resolved.record) return json({ status: "unbound" } satisfies IntentBindingResult);
      return json({ status: "bound", contract: resolved.record.contract } satisfies IntentBindingResult);
    }

    if (request.method === "POST" && url.pathname === "/intent-evidence/decision-events") {
      const event = recordValue(payload.event);
      const appended = await this.appendIntentEvidence("decision_events", event);
      if (appended.error) return json({ error: appended.error }, appended.httpStatus);
      return json(appended.record, 201);
    }

    if (request.method === "GET" && url.pathname.startsWith("/intent-contracts/")) {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length !== 2) return json({ error: "not found" }, 404);
      const intentId = decodeURIComponent(parts[1]);
      const record = await this.state.storage.get<IntentContractRecord>(`intent:${intentId}:contract`);
      if (!record) return json({ error: `intent contract not found: ${intentId}` }, 404);
      return json(intentContractResponse(record));
    }

    if (request.method === "POST" && url.pathname.startsWith("/intent-contracts/")) {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length !== 3 || !["observations", "evaluate"].includes(parts[2])) {
        return json({ error: "not found" }, 404);
      }
      const intentId = decodeURIComponent(parts[1]);
      const registered = await this.state.storage.get<IntentContractRecord>(`intent:${intentId}:contract`);
      if (!registered) return json({ error: `intent contract not found: ${intentId}` }, 404);

      if (parts[2] === "observations") {
        const input = recordValue(payload.observation);
        const provenanceFinding = verifiedIntentObservationFinding(input);
        if (provenanceFinding) {
          return json({
            error: `intent observation provenance invalid: ${provenanceFinding}`,
            error_code: "observation_provenance_invalid",
          }, 400);
        }
        if (stringValue(input.intent_id) !== intentId) {
          return json({ error: "intent observation intent_id mismatch", error_code: "observation_intent_mismatch" }, 409);
        }
        if (stringValue(input.intent_digest) !== registered.intent_digest) {
          return json({
            error: "intent observation intent_digest mismatch",
            error_code: "observation_intent_digest_mismatch",
          }, 409);
        }
        const expectedTenant = registered.tenant_id || "default";
        if (stringValue(input.tenant_id) !== expectedTenant) {
          return json({ error: "intent observation tenant_id mismatch", error_code: "observation_tenant_mismatch" }, 409);
        }
        const appended = await this.appendIntentEvidence("observations", input);
        if (appended.error) {
          return json({ error: appended.error, error_code: appended.errorCode }, appended.httpStatus);
        }
        return json({ observation: appended.record, replayed: appended.replayed === true }, appended.httpStatus);
      }

      const jobInput = payload.job === undefined ? undefined : recordValue(payload.job);
      let job: Record<string, unknown> | undefined;
      if (jobInput) {
        const bindingFinding = suppliedIntentBindingFinding(jobInput, registered);
        if (bindingFinding) return json({ error: bindingFinding }, 409);
        job = {
          ...jobInput,
          intent_id: registered.intent_id,
          intent_digest: registered.intent_digest,
          job_id: registered.job_id,
        };
        await this.state.storage.put(`intent:${intentId}:job`, job);
      } else {
        job = await this.state.storage.get<Record<string, unknown>>(`intent:${intentId}:job`);
      }
      const evidence: IntentEvidence = {
        decision_events: await this.intentEvidence(intentId, "decision_events"),
        execution_receipts: await this.intentEvidence(intentId, "execution_receipts"),
        observations: await this.intentEvidence(intentId, "observations"),
        job,
      };
      const evaluation = evaluateIntent(registered.contract, evidence, {
        idGenerator: () => `eval_${crypto.randomUUID()}`,
      });
      await this.state.storage.put(`intent:${intentId}:evaluation:${evaluation.evaluation_id}`, evaluation);
      await this.state.storage.put(`intent:${intentId}:evaluation:latest`, evaluation);
      return json(evaluation);
    }

    if (request.method === "POST" && url.pathname === "/approvals") {
      const approval = payload as ApprovalRequest;
      const index = await this.state.storage.get<string[]>("approval:index") || [];
      const next = [approval.approval_id, ...index.filter((id) => id !== approval.approval_id)].slice(0, 500);
      await this.state.storage.put(`approval:${approval.approval_id}`, approval);
      await this.state.storage.put("approval:index", next);
      return json(approval, 201);
    }

    if (request.method === "GET" && url.pathname === "/approvals") {
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || "100"), 1), 250);
      const status = url.searchParams.get("status") || "";
      const index = await this.state.storage.get<string[]>("approval:index") || [];
      const approvals: ApprovalRequest[] = [];
      for (const id of index) {
        const approval = await this.state.storage.get<ApprovalRequest>(`approval:${id}`);
        if (!approval) continue;
        await this.expireApproval(approval);
        if (status && approval.status !== status) continue;
        approvals.push(approval);
        if (approvals.length >= limit) break;
      }
      return json({ approvals, count: approvals.length });
    }

    if (request.method === "GET" && url.pathname.startsWith("/approvals/")) {
      const approvalId = decodeURIComponent(url.pathname.replace("/approvals/", ""));
      const approval = await this.state.storage.get<ApprovalRequest>(`approval:${approvalId}`);
      if (!approval) return json({ error: "not found" }, 404);
      await this.expireApproval(approval);
      return json(approval);
    }

    if (request.method === "POST" && url.pathname === "/approvals/require-approved") {
      const manifest = payload.manifest as AgentIdManifest;
      const grantRequest = payload.request as ToolEvent;
      const result = await this.requireApprovedForGrant(manifest, grantRequest);
      if (result.length > 0) return json({ error: result[0] }, 400);
      const approval = await this.state.storage.get<ApprovalRequest>(`approval:${stringValue(grantRequest.approval_id)}`);
      return json({ ok: true, approval });
    }

    if (request.method === "POST" && url.pathname.startsWith("/approvals/")) {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length !== 3 || (parts[2] !== "approve" && parts[2] !== "deny")) {
        return json({ error: "not found" }, 404);
      }
      const approvalId = decodeURIComponent(parts[1]);
      const approval = await this.state.storage.get<ApprovalRequest>(`approval:${approvalId}`);
      if (!approval) return json({ error: `approval request not found: ${approvalId}` }, 404);
      await this.expireApproval(approval);
      if (approval.status !== "pending") {
        return json({ error: `approval request is ${approval.status}: ${approvalId}` }, 409);
      }
      const decidedBy = stringValue(payload.decided_by ?? payload.user_id);
      const findings = findingsFromPayload(payload);
      const decisionReason = stringValue(payload.decision_reason) || findings[0] || "";
      if (!decidedBy) return json({ error: "decided_by is required" }, 400);
      if (!decisionReason) return json({ error: "decision_reason is required" }, 400);
      approval.status = parts[2] === "approve" ? "approved" : "denied";
      approval.decided_at = new Date().toISOString();
      approval.decided_by = decidedBy;
      approval.decision_reason = decisionReason;
      approval.findings = findings;
      await this.state.storage.put(`approval:${approvalId}`, approval);
      return json(approval);
    }

    if (request.method === "POST" && url.pathname === "/idempotency-replay") {
      const event = payload.event as ToolEvent;
      const key = stringValue(event.idempotency_key);
      if (!key) return json({ status: "none" });
      const record = await this.state.storage.get<IdempotencyResultRecord>(`idempotency:${key}`);
      if (!record) return json({ status: "none" });
      const digest = await replayRequestDigest(event, record);
      if (digest !== record.request_digest) {
        event.idempotency_replay_mismatch = true;
        return json({
          status: "mismatch",
          event,
          findings: ["idempotencyKey was already used with different request digest"],
        });
      }
      record.replay_count += 1;
      const replayReceipt: ProviderExecutionReceipt = {
        ...record.receipt,
        status: "replayed",
        decision_id: stringValue(event.decision_id) || crypto.randomUUID(),
        executed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        replayed_from_decision_id: record.receipt.decision_id,
        replay_count: record.replay_count,
      };
      if (replayReceipt.intent_id) {
        const appended = await this.appendIntentEvidence(
          "execution_receipts",
          replayReceipt as unknown as Record<string, unknown>,
        );
        if (appended.error) {
          return json({ status: "mismatch", findings: [appended.error] }, appended.httpStatus);
        }
      }
      await this.state.storage.put(`idempotency:${key}`, record);
      event.idempotency_replayed = true;
      event.provider_execution_receipt = replayReceipt;
      event.provider_result = record.result;
      if (record.approval_evidence) event.approval_evidence = record.approval_evidence;
      event.approval_id = event.approval_id || record.approval_id;
      event.jit_grant_id = event.jit_grant_id || record.jit_grant_id;
      return json({ status: "replay", event, record: { ...record, receipt: replayReceipt } });
    }

    if (request.method === "POST" && url.pathname === "/execution-results") {
      const event = payload.event as ToolEvent;
      const result = payload.result;
      const key = stringValue(event.idempotency_key);
      if (!key) return json({ error: "idempotency_key is required" }, 400);
      if (!stringValue(event.jit_grant_id)) return json({ error: "jit_grant_id is required" }, 400);
      const manifest = payload.manifest as AgentIdManifest;
      const validation = await this.bindGrant(manifest, event, { allowUsed: true, consume: false });
      if (validation.findings.length > 0) return json({ error: validation.findings[0], findings: validation.findings }, 400);
      if (manifest.jit_authorization?.revoke_after_use === true && validation.grant?.used !== true) {
        return json({ error: "JIT grant has not been consumed by authorize" }, 409);
      }
      const requestDigest = validation.requestDigest || await approvalRequestDigest(event);
      const existing = await this.state.storage.get<IdempotencyResultRecord>(`idempotency:${key}`);
      if (existing) {
        const digest = await replayRequestDigest(event, existing);
        if (digest !== existing.request_digest) {
          return json({ error: "idempotencyKey was already used with different request digest" }, 409);
        }
        return json(existing);
      }
      const receipt: ProviderExecutionReceipt = {
        schema_version: "agentpass.provider-execution-receipt.v1",
        decision_id: stringValue(event.decision_id) || crypto.randomUUID(),
        intent_id: optionalString(event.intent_id),
        intent_digest: optionalString(event.intent_digest),
        job_id: optionalString(event.job_id),
        tool: stringValue(event.tool),
        action: stringValue(event.action),
        resource: optionalString(event.resource),
        amount: numberValue(event.amount ?? event.amount_usd),
        currency: optionalString(event.currency) || (numberValue(event.amount ?? event.amount_usd) === undefined ? undefined : "USD"),
        idempotency_key: key,
        request_digest: requestDigest,
        status: "executed",
        executed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        result_digest: await canonicalDigest(result),
      };
      const record: IdempotencyResultRecord = {
        schema_version: "agentpass.idempotency-result.v1",
        idempotency_key: key,
        request_digest: requestDigest,
        agent_id: stringValue(event.agent_id),
        intent_id: optionalString(event.intent_id),
        intent_digest: optionalString(event.intent_digest),
        tool: stringValue(event.tool),
        action: stringValue(event.action),
        resource: optionalString(event.resource),
        amount: numberValue(event.amount ?? event.amount_usd),
        currency: optionalString(event.currency) || (numberValue(event.amount ?? event.amount_usd) === undefined ? undefined : "USD"),
        approval_id: optionalString(event.approval_id),
        jit_grant_id: optionalString(event.jit_grant_id),
        approval_evidence: recordValue(event.approval_evidence).schema_version === "agentpass.approval-evidence.v1"
          ? event.approval_evidence as ApprovalEvidence
          : undefined,
        result,
        receipt,
        created_at: new Date().toISOString(),
        replay_count: 0,
      };
      if (receipt.intent_id) {
        const appended = await this.appendIntentEvidence(
          "execution_receipts",
          receipt as unknown as Record<string, unknown>,
        );
        if (appended.error) return json({ error: appended.error }, appended.httpStatus);
      }
      await this.state.storage.put(`idempotency:${key}`, record);
      return json(record, 201);
    }

    if (request.method === "POST" && url.pathname === "/bind") {
      const event = payload.event as ToolEvent;
      const manifest = payload.manifest as AgentIdManifest;
      const result = await this.bindGrant(manifest, event, {
        allowUsed: false,
        consume: manifest.jit_authorization?.revoke_after_use === true,
      });

      return json({ event, findings: result.findings });
    }

    return json({ error: "not found" }, 404);
  }

  async resolveIntentRecord(
    event: Record<string, unknown>,
    requireJob = true,
    allowExpired = false,
  ): Promise<{ record?: IntentContractRecord; error?: string; httpStatus: number }> {
    const intentId = stringValue(event.intent_id ?? event.intentId);
    const intentDigest = stringValue(event.intent_digest ?? event.intentDigest);
    if (!intentId && !intentDigest) return { httpStatus: 200 };
    if (!intentId || !intentDigest) {
      return { error: "intent_id and intent_digest are required together", httpStatus: 409 };
    }
    const record = await this.state.storage.get<IntentContractRecord>(`intent:${intentId}:contract`);
    if (!record) return { error: `intent contract not found: ${intentId}`, httpStatus: 404 };
    if (record.intent_digest !== intentDigest) {
      return { error: "registered intent contract digest mismatch", httpStatus: 409 };
    }
    if (digestIntentContract(record.contract) !== record.intent_digest) {
      return { error: "registered intent contract failed digest verification", httpStatus: 409 };
    }
    const issuedAt = Date.parse(record.contract.issued_at);
    if (Number.isFinite(issuedAt) && issuedAt > Date.now()) {
      return { error: `intent contract is not active yet: ${intentId}`, httpStatus: 409 };
    }
    if (!allowExpired && record.contract.expires_at && Date.parse(record.contract.expires_at) <= Date.now()) {
      return { error: `intent contract is expired: ${intentId}`, httpStatus: 410 };
    }
    if (requireJob) {
      const jobId = stringValue(event.job_id ?? event.jobId);
      if (!jobId || jobId !== record.job_id) {
        return { error: "registered intent contract job_id mismatch", httpStatus: 409 };
      }
    }
    return { record, httpStatus: 200 };
  }

  async appendIntentEvidence(
    source: "decision_events" | "execution_receipts" | "observations",
    record: Record<string, unknown>,
  ): Promise<{
    record?: Record<string, unknown>;
    error?: string;
    errorCode?: string;
    replayed?: boolean;
    httpStatus: number;
  }> {
    const resolved = await this.resolveIntentRecord(record, source !== "observations", true);
    if (resolved.error) return { error: resolved.error, httpStatus: resolved.httpStatus };
    if (!resolved.record) return { error: "intent evidence requires a registered intent binding", httpStatus: 409 };
    const evidenceId = stringValue(record.observation_id ?? record.decision_id ?? record.evaluation_id) || crypto.randomUUID();
    const indexKey = `intent:${resolved.record.intent_id}:evidence:${source}:index`;
    const recordKey = `intent:${resolved.record.intent_id}:evidence:${source}:${evidenceId}`;
    const observationIdKey = `intent:evidence:observations:id:${evidenceId}`;
    if (source === "observations") {
      const existing = await this.state.storage.get<Record<string, unknown>>(observationIdKey);
      if (existing) {
        if (stringValue(existing.payload_digest) === stringValue(record.payload_digest)) {
          return { record: existing, replayed: true, httpStatus: 200 };
        }
        return {
          error: `intent observation_id already exists with different payload: ${evidenceId}`,
          errorCode: "observation_id_conflict",
          httpStatus: 409,
        };
      }
    }
    const index = await this.state.storage.get<string[]>(indexKey) || [];
    const next = [evidenceId, ...index.filter((id) => id !== evidenceId)].slice(0, 2_000);
    await this.state.storage.put(recordKey, record);
    if (source === "observations") await this.state.storage.put(observationIdKey, record);
    await this.state.storage.put(indexKey, next);
    return { record, replayed: false, httpStatus: 201 };
  }

  async intentEvidence(
    intentId: string,
    source: "decision_events" | "execution_receipts" | "observations",
  ): Promise<Record<string, unknown>[]> {
    const index = await this.state.storage.get<string[]>(`intent:${intentId}:evidence:${source}:index`) || [];
    const evidence: Record<string, unknown>[] = [];
    for (const evidenceId of index) {
      const record = await this.state.storage.get<Record<string, unknown>>(
        `intent:${intentId}:evidence:${source}:${evidenceId}`,
      );
      if (record) evidence.push(record);
    }
    return evidence;
  }

  async bindGrant(
    manifest: AgentIdManifest,
    event: ToolEvent,
    options: { allowUsed: boolean; consume: boolean },
  ): Promise<{ grant?: Grant; findings: string[]; requestDigest?: string }> {
    const findings: string[] = [];
    const grantId = stringValue(event.jit_grant_id);

    if (!grantId) {
      event.jit_grant_valid = false;
      return { findings: ["missing jit_grant_id"] };
    }

    const grant = await this.state.storage.get<Grant>(grantId);
    if (!grant) {
      event.jit_grant_valid = false;
      return { findings: ["unknown jit_grant_id"] };
    }

    if (Date.parse(grant.expires_at) <= Date.now()) findings.push("JIT grant is expired");
    if (grant.used && !options.allowUsed) findings.push("JIT grant was already used");
    if (grant.agent_id !== event.agent_id) findings.push("JIT grant agent_id mismatch");
    if (grant.intent_id && grant.intent_id !== event.intent_id) findings.push("JIT grant intent_id mismatch");
    if (grant.intent_digest && grant.intent_digest !== event.intent_digest) findings.push("JIT grant intent_digest mismatch");
    if (grant.tool !== event.tool) findings.push("JIT grant tool mismatch");
    if (grant.action !== event.action) findings.push("JIT grant action mismatch");
    if (grant.resource && event.resource && grant.resource !== event.resource) {
      findings.push("JIT grant resource mismatch");
    }
    if (grant.job_id && event.job_id && grant.job_id !== event.job_id) {
      findings.push("JIT grant job_id mismatch");
    }
    if (grant.case_id && event.case_id && grant.case_id !== event.case_id) {
      findings.push("JIT grant case_id mismatch");
    }
    if (grant.customer_id && event.customer_id && grant.customer_id !== event.customer_id) {
      findings.push("JIT grant customer_id mismatch");
    }
    for (const [key, value] of Object.entries(grant.context ?? {})) {
      if (!hasValue(contextValue(event, key)) || stringValue(contextValue(event, key)) !== value) {
        findings.push(`JIT grant ${key} mismatch`);
      }
    }

    event.jit_grant_agent_id = grant.agent_id;
    event.jit_grant_intent_id = grant.intent_id;
    event.jit_grant_intent_digest = grant.intent_digest;
    event.jit_grant_tool = grant.tool;
    event.jit_grant_action = grant.action;
    event.jit_grant_approval_id = grant.approval_id;
    event.approval_id = event.approval_id || grant.approval_id;
    event.jit_grant_expires_at = grant.expires_at;
    event.jit_grant_job_id = grant.job_id;
    event.jit_grant_case_id = grant.case_id;
    event.jit_grant_customer_id = grant.customer_id;
    if (grant.context) event.jit_grant_context = grant.context;

    let requestDigest: string | undefined;
    if (grant.evidence) {
      event.approval_evidence = grant.evidence;
      requestDigest = await approvalRequestDigest(event, grant.evidence);
      if (requestDigest !== grant.evidence.request_digest) findings.push("JIT grant request_digest mismatch");
    }
    event.jit_grant_valid = findings.length === 0;

    if (findings.length === 0 && options.consume) {
      grant.used = true;
      await this.state.storage.put(grant.jit_grant_id, grant);
    }

    return { grant, findings, requestDigest };
  }

  async requireApprovedForGrant(manifest: AgentIdManifest, request: ToolEvent): Promise<string[]> {
    const toolName = stringValue(request.tool);
    const tool = toolByName(manifest, toolName);
    if (!tool || !approvalRequired(tool)) return [];

    const approvalId = stringValue(request.approval_id);
    if (!approvalId) return ["approval_id is required for approval-gated JIT grants"];
    const approval = await this.state.storage.get<ApprovalRequest>(`approval:${approvalId}`);
    if (!approval) return [`approval request not found: ${approvalId}`];
    await this.expireApproval(approval);
    if (approval.status === "expired") return [`approval request is expired: ${approvalId}`];
    if (approval.status === "denied") return [`approval request is denied: ${approvalId}`];
    if (approval.status !== "approved") return [`approval request is not approved: ${approvalId}`];

    const agentId = stringValue(manifest.agent?.id);
    if (approval.agent_id !== agentId) return ["approval request agent_id mismatch"];
    if (approval.tool !== toolName) return ["approval request tool mismatch"];
    if (approval.action !== stringValue(request.action)) return ["approval request action mismatch"];
    const fields: Array<[string, unknown, unknown]> = [
      ["intent_id", approval.intent_id, request.intent_id],
      ["intent_digest", approval.intent_digest, request.intent_digest],
      ["resource", approval.resource, request.resource],
      ["job_id", approval.job_id, request.job_id],
      ["case_id", approval.case_id, request.case_id],
      ["customer_id", approval.customer_id, request.customer_id],
    ];
    for (const [field, approved, requested] of fields) {
      const finding = matchingFinding(field, approved, requested);
      if (finding) return [finding];
    }
    for (const [key, value] of Object.entries(approval.context ?? {})) {
      const finding = matchingFinding(key, value, request[key] ?? recordValue(request.context)[key]);
      if (finding) return [finding];
    }
    const requestDigest = await approvalRequestDigest({
      ...request,
      agent_id: agentId,
      tenant_id: approval.evidence.tenant_id,
    }, approval.evidence);
    if (requestDigest !== approval.evidence.request_digest) return ["approval request request_digest mismatch"];
    return [];
  }

  async expireApproval(approval: ApprovalRequest): Promise<void> {
    if ((approval.status === "pending" || approval.status === "approved") && Date.parse(approval.expires_at) <= Date.now()) {
      approval.status = "expired";
      await this.state.storage.put(`approval:${approval.approval_id}`, approval);
    }
  }
}

async function authorize(
  manifest: AgentIdManifest,
  payload: ToolEvent,
  env: Env,
  tenantId: string | null,
): Promise<AuthorizationDecision> {
  const event = toolEventFromPayload(manifest, payload, tenantId);
  const findings: string[] = [];
  const tool = toolByName(manifest, stringValue(event.tool ?? event.capability ?? event.skill_id));
  const intentBinding = await resolveIntentBinding(env, tenantId, manifest, event);
  if (intentBinding.findings.length > 0) {
    event.intent_registry_bound = false;
    return { allow: false, findings: intentBinding.findings, event };
  }
  if (intentBinding.contract) {
    event.intent_registry_bound = true;
    event.intent_profile = intentBinding.contract.profile;
    event.intent_issuer = intentBinding.contract.issuer;
  }

  const replay = await authorizationStore(env, tenantId, manifest).fetch(
    new Request("https://agentid.local/idempotency-replay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event }),
    }),
  );
  const replayBody = await replay.json() as { status?: string; event?: ToolEvent; record?: IdempotencyResultRecord; findings?: string[] };
  if (replayBody.status === "replay" && replayBody.record) {
    Object.assign(event, replayBody.event || {});
    return {
      allow: true,
      findings: ["idempotency result replayed"],
      event,
      replayed: true,
      result: replayBody.record.result,
      receipt: replayBody.record.receipt,
    };
  }
  if (replayBody.status === "mismatch") {
    Object.assign(event, replayBody.event || {});
    const replayFindings = replayBody.findings || ["idempotencyKey was already used with different request digest"];
    return { allow: false, findings: replayFindings, event };
  }

  if (tool?.auth_mode === "just_in_time") {
    const response = await authorizationStore(env, tenantId, manifest).fetch(
      new Request("https://agentid.local/bind", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manifest, event }),
      }),
    );
    const bound = (await response.json()) as { event: ToolEvent; findings: string[] };
    Object.assign(event, bound.event);
    findings.push(...bound.findings);
  }

  if (event.approval_id && !event.jit_grant_id) {
    const response = await authorizationStore(env, tenantId, manifest).fetch(
      new Request("https://agentid.local/approvals/require-approved", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manifest, request: event }),
      }),
    );
    const body = await response.json() as { approval?: ApprovalRequest; error?: string };
    if (!response.ok) {
      findings.push(body.error || "approval request is not valid");
    } else if (body.approval?.evidence) {
      event.approval_evidence = body.approval.evidence;
    }
  }

  findings.push(...auditEvent(manifest, event));
  const challengeRequired = event.challenge_required === true && findings.length > 0;
  return { allow: findings.length === 0, challengeRequired, findings, event };
}

async function createProviderAuthorizationReceipt(
  env: Env,
  event: ToolEvent,
  tenantId: string | null,
): Promise<JwsProviderAuthorizationReceipt | undefined> {
  const privateJwk = receiptPrivateJwk(env);
  if (!privateJwk) return undefined;

  const issuedAt = new Date();
  const evidence = recordValue(event.approval_evidence);
  const requestDigest = evidence.schema_version === "agentpass.approval-evidence.v1"
    ? await approvalRequestDigest(event, evidence as ApprovalEvidence)
    : await approvalRequestDigest(event);
  const amount = numberValue(event.amount ?? event.amount_usd);
  const receipt: ProviderAuthorizationReceipt = {
    schema_version: "agentpass.provider-authorization-receipt.v1",
    decision_id: stringValue(event.decision_id),
    intent_id: optionalString(event.intent_id),
    intent_digest: optionalString(event.intent_digest),
    tenant_id: optionalString(event.tenant_id ?? tenantId),
    agent_id: stringValue(event.agent_id),
    user_id: optionalString(event.user_id),
    tool: stringValue(event.tool),
    action: stringValue(event.action),
    resource: optionalString(event.resource),
    job_id: optionalString(event.job_id),
    case_id: optionalString(event.case_id),
    customer_id: optionalString(event.customer_id),
    approval_id: optionalString(event.approval_id),
    jit_grant_id: optionalString(event.jit_grant_id),
    amount,
    currency: optionalString(event.currency) || (amount === undefined ? undefined : "USD"),
    idempotency_key: optionalString(event.idempotency_key),
    request_digest: requestDigest,
    issued_at: issuedAt.toISOString(),
    expires_at: optionalString(event.jit_grant_expires_at)
      || optionalString(evidence.expires_at)
      || new Date(issuedAt.getTime() + 300_000).toISOString(),
  };

  return { jws: await signProviderAuthorizationReceipt(env, receipt, privateJwk) };
}

async function signProviderAuthorizationReceipt(
  env: Env,
  receipt: ProviderAuthorizationReceipt,
  privateJwk: JsonWebKey,
): Promise<string> {
  const kid = stringValue(env.AGENTID_RECEIPT_KEY_ID || privateJwk.kid);
  const header = {
    alg: "RS256",
    typ: "JWT",
    kid: kid || undefined,
  };
  const issuedAt = Math.floor(Date.parse(receipt.issued_at) / 1000);
  const expiresAt = Math.floor(Date.parse(receipt.expires_at) / 1000);
  const claims = {
    receipt,
    iss: stringValue(env.AGENTID_RECEIPT_ISSUER) || "agentpass-cloudflare",
    aud: stringValue(env.AGENTID_RECEIPT_AUDIENCE) || "agentpass-provider",
    iat: Number.isFinite(issuedAt) ? issuedAt : undefined,
    exp: Number.isFinite(expiresAt) ? expiresAt : undefined,
    jti: receipt.decision_id,
  };
  const encodedHeader = base64UrlJson(header);
  const encodedClaims = base64UrlJson(claims);
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  const key = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

function receiptPrivateJwk(env: Env): JsonWebKey | undefined {
  if (!env.AGENTID_RECEIPT_PRIVATE_JWK) return undefined;
  const jwk = JSON.parse(env.AGENTID_RECEIPT_PRIVATE_JWK) as JsonWebKey;
  if (!jwk.kty) throw new Error("AGENTID_RECEIPT_PRIVATE_JWK must be a JWK object");
  return {
    ...jwk,
    alg: stringValue(jwk.alg) || "RS256",
    key_ops: ["sign"],
  };
}

function receiptPublicJwks(env: Env): { keys: JsonWebKey[] } {
  if (env.AGENTID_RECEIPT_PUBLIC_JWKS) {
    const jwks = JSON.parse(env.AGENTID_RECEIPT_PUBLIC_JWKS) as { keys?: JsonWebKey[] };
    return { keys: Array.isArray(jwks.keys) ? jwks.keys.map(publicReceiptJwk) : [] };
  }
  const privateJwk = receiptPrivateJwk(env);
  return { keys: privateJwk ? [publicReceiptJwk(privateJwk)] : [] };
}

function publicReceiptJwk(jwk: JsonWebKey): JsonWebKey {
  const publicJwk: JsonWebKey = {
    kty: jwk.kty,
    kid: stringValue(jwk.kid),
    alg: stringValue(jwk.alg) || "RS256",
    use: "sig",
    key_ops: ["verify"],
  };
  if (jwk.kty === "RSA") {
    publicJwk.n = jwk.n;
    publicJwk.e = jwk.e;
  }
  if (jwk.kty === "EC") {
    publicJwk.crv = jwk.crv;
    publicJwk.x = jwk.x;
    publicJwk.y = jwk.y;
  }
  return publicJwk;
}

async function dispatchGithubActions(env: Env, event: ToolEvent): Promise<Record<string, unknown>> {
  const token = stringValue(env.AGENTID_GITHUB_TOKEN);
  if (!token) throw new Error("AGENTID_GITHUB_TOKEN is required for GitHub Actions dispatch");

  const dispatch = githubDispatchRequest(event);
  const apiBase = stringValue(env.AGENTID_GITHUB_API_BASE) || "https://api.github.com";
  const url = `${apiBase.replace(/\/$/, "")}/repos/${dispatch.repository}/actions/workflows/${encodeURIComponent(dispatch.workflow_id)}/dispatches`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "accept": "application/vnd.github+json",
      "authorization": `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "agentpass-cloudflare-gateway",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify({
      ref: dispatch.ref,
      inputs: dispatch.inputs,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub Actions dispatch failed (${response.status}): ${body}`);
  }

  return {
    provider: "github_actions",
    status: "dispatched",
    github_status: response.status,
    repository: dispatch.repository,
    workflow_id: dispatch.workflow_id,
    ref: dispatch.ref,
    inputs: dispatch.inputs,
    idempotency_key: optionalString(event.idempotency_key),
    dispatched_at: new Date().toISOString(),
  };
}

function githubDispatchRequest(event: ToolEvent): { repository: string; workflow_id: string; ref: string; inputs: Record<string, string> } {
  const repository = githubRepository(stringValue(contextValue(event, "github_repository") ?? contextValue(event, "repo")));
  const workflowId = stringValue(contextValue(event, "workflow_id") ?? contextValue(event, "workflow"));
  const ref = stringValue(contextValue(event, "ref") ?? contextValue(event, "branch"));

  if (!repository) throw new Error("repo or github_repository is required for GitHub Actions dispatch");
  if (!workflowId) throw new Error("workflow_id is required for GitHub Actions dispatch");
  if (!ref) throw new Error("branch or ref is required for GitHub Actions dispatch");

  const inputFields = [
    "environment",
    "service_id",
    "repo",
    "branch",
    "commit_sha",
    "change_request_id",
    "incident_id",
    "rollback_plan_id",
    "rollback_plan",
    "resource",
    "job_id",
  ];
  const inputs: Record<string, string> = {};
  for (const field of inputFields) {
    const value = field === "resource" || field === "job_id" ? event[field] : contextValue(event, field);
    if (hasValue(value)) inputs[field] = stringValue(value);
  }

  return { repository, workflow_id: workflowId, ref, inputs };
}

function githubRepository(value: string): string {
  return value.replace(/^https:\/\/github\.com\//, "").replace(/^github\.com\//, "").replace(/\.git$/, "");
}

function toolEventFromPayload(manifest: AgentIdManifest, payload: ToolEvent, tenantId: string | null): ToolEvent {
  const event: ToolEvent = {
    decision_id: stringValue(payload.decision_id) || crypto.randomUUID(),
    agent_id: payload.agent_id ?? manifest.agent?.id,
    intent_id: payload.intent_id,
    intent_digest: payload.intent_digest,
    tool: payload.tool,
    capability: payload.capability,
    skill_id: payload.skill_id,
    skill_hash: payload.skill_hash,
    action: payload.action,
    data_from: payload.data_from ?? "",
    data_to: payload.data_to ?? "",
    approved: payload.approved === true,
    jit_grant_id: payload.jit_grant_id,
    approval_id: payload.approval_id,
    resource: payload.resource ?? "",
    called_agent: payload.called_agent,
    delegated_tool: payload.delegated_tool,
    delegation_depth: payload.delegation_depth,
    delegation_grant_id: payload.delegation_grant_id,
    approval_source: payload.approval_source,
    approval_agent: payload.approval_agent,
    tenant_id: payload.tenant_id ?? tenantId,
    user_id: payload.user_id,
    job_id: payload.job_id,
    case_id: payload.case_id,
    customer_id: payload.customer_id,
    amount: payload.amount ?? payload.amount_usd,
    currency: payload.currency,
    destination_type: payload.destination_type,
    external_domain: payload.external_domain,
    data_classification: arrayValue(payload.data_classification ?? payload.dataClassification),
    field_set: Array.isArray(payload.field_set) ? payload.field_set.map(String) : [],
    record_count: payload.record_count,
    redaction_state: payload.redaction_state,
    retention: payload.retention,
    idempotency_key: payload.idempotency_key,
    call_fingerprint: payload.call_fingerprint,
    policy_version: payload.policy_version,
    policy_findings: Array.isArray(payload.policy_findings) ? payload.policy_findings.map(String) : [],
    prior_attempt_count: payload.prior_attempt_count,
    budget_state: recordValue(payload.budget_state),
    basis_category: payload.basis_category,
    basis_ref: payload.basis_ref,
  };
  Object.assign(event, stringContext(payload));
  return event;
}

async function createApprovalRequest(
  manifest: AgentIdManifest,
  payload: ToolEvent,
  tenantId: string | null,
): Promise<ApprovalRequest> {
  const agentId = stringValue(manifest.agent?.id);
  const toolName = stringValue(payload.tool);
  const action = stringValue(payload.action);
  const tool = toolByName(manifest, toolName);

  if (!tool) throw new Error(`unknown tool: ${toolName}`);
  if (tool.access !== action) throw new Error(`action does not match manifest access for ${toolName}`);
  if (!approvalRequired(tool)) throw new Error(`${toolName} does not require approval`);
  const resource = stringValue(payload.resource);
  const requestedBy = stringValue(payload.requested_by ?? payload.user_id);
  const reason = stringValue(payload.reason);
  if (!resource) throw new Error("resource is required for approval requests");
  if (!requestedBy) throw new Error("requested_by is required for approval requests");
  if (!reason) throw new Error("reason is required for approval requests");

  const expiresAt = new Date(Date.now() + approvalTtlSeconds(manifest, tool) * 1000).toISOString();
  const evidencePayload = { ...payload, agent_id: agentId, tenant_id: tenantId ?? payload.tenant_id };
  const evidence = await createApprovalEvidence(manifest, evidencePayload, expiresAt);

  return {
    approval_id: stringValue(payload.approval_id) || crypto.randomUUID(),
    status: "pending",
    agent_id: agentId,
    intent_id: optionalString(payload.intent_id),
    intent_digest: optionalString(payload.intent_digest),
    tool: toolName,
    action,
    resource,
    requested_by: requestedBy,
    reason,
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
    job_id: stringValue(payload.job_id),
    case_id: stringValue(payload.case_id),
    customer_id: stringValue(payload.customer_id),
    context: stringContext(payload),
    evidence,
    findings: [],
  };
}

function createJitGrant(manifest: AgentIdManifest, payload: ToolEvent, approval?: ApprovalRequest): Grant {
  const agentId = stringValue(manifest.agent?.id);
  const toolName = stringValue(payload.tool);
  const action = stringValue(payload.action);
  const tool = toolByName(manifest, toolName);

  if (!tool) throw new Error(`unknown tool: ${toolName}`);
  if (tool.access !== action) throw new Error(`action does not match manifest access for ${toolName}`);
  if (tool.auth_mode !== "just_in_time") throw new Error(`${toolName} does not require just-in-time authorization`);
  if (APPROVAL_REQUIRED.has(stringValue(tool.approval)) && !payload.approval_id) {
    throw new Error("approval_id is required for approval-gated JIT grants");
  }

  const ttlSeconds = grantTtlSeconds(manifest, tool);
  return {
    jit_grant_id: crypto.randomUUID(),
    agent_id: agentId,
    intent_id: optionalString(payload.intent_id),
    intent_digest: optionalString(payload.intent_digest),
    tool: toolName,
    action,
    resource: stringValue(payload.resource),
    approval_id: stringValue(payload.approval_id),
    user_id: stringValue(payload.user_id),
    expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    job_id: stringValue(payload.job_id),
    case_id: stringValue(payload.case_id),
    customer_id: stringValue(payload.customer_id),
    context: stringContext(payload),
    evidence: approval?.evidence,
    used: false,
  };
}

async function createApprovalEvidence(
  manifest: AgentIdManifest,
  payload: ToolEvent,
  expiresAt: string,
): Promise<ApprovalEvidence> {
  const amount = numberValue(payload.amount ?? payload.amount_usd);
  const policyFindings = Array.isArray(payload.policy_findings)
    ? payload.policy_findings.map(String)
    : [`${stringValue(payload.tool)} requires human approval`];
  return {
    schema_version: "agentpass.approval-evidence.v1",
    agent_id: stringValue(payload.agent_id ?? manifest.agent?.id),
    intent_id: optionalString(payload.intent_id),
    intent_digest: optionalString(payload.intent_digest),
    user_id: optionalString(payload.user_id ?? payload.requested_by),
    tenant_id: optionalString(payload.tenant_id),
    job_id: optionalString(payload.job_id),
    case_id: optionalString(payload.case_id),
    customer_id: optionalString(payload.customer_id),
    tool: stringValue(payload.tool),
    action: stringValue(payload.action),
    resource: optionalString(payload.resource),
    amount,
    currency: optionalString(payload.currency) || (amount === undefined ? undefined : "USD"),
    data_from: optionalString(payload.data_from),
    data_to: optionalString(payload.data_to),
    destination_type: optionalString(payload.destination_type),
    external_domain: optionalString(payload.external_domain),
    data_classification: arrayValue(payload.data_classification ?? payload.dataClassification).sort(),
    field_set: Array.isArray(payload.field_set) ? payload.field_set.map(String).sort() : [],
    record_count: numberValue(payload.record_count),
    redaction_state: optionalString(payload.redaction_state),
    retention: optionalString(payload.retention),
    idempotency_key: optionalString(payload.idempotency_key),
    call_fingerprint: optionalString(payload.call_fingerprint),
    request_digest: await approvalRequestDigest(payload),
    policy_version: optionalString(payload.policy_version ?? recordValue(manifest.runtime).policy_version),
    policy_findings: policyFindings,
    prior_attempt_count: numberValue(payload.prior_attempt_count),
    budget_state: Object.keys(recordValue(payload.budget_state)).length ? recordValue(payload.budget_state) : undefined,
    expires_at: expiresAt,
    basis_category: optionalString(payload.basis_category),
    basis_ref: optionalString(payload.basis_ref),
    context: stringContext(payload),
  };
}

function auditEvent(manifest: AgentIdManifest, event: ToolEvent): string[] {
  const findings: string[] = [];
  const agentId = manifest.agent?.id;
  const skillId = stringValue(event.skill_id);
  const skill = skillId ? toolByName(manifest, skillId) : undefined;
  const requestedCapability = stringValue(event.tool ?? event.capability ?? event.skill_id);
  const tool = toolByName(manifest, requestedCapability);

  if (agentId && event.agent_id !== agentId) {
    findings.push(`event[0]: agent_id mismatch: ${event.agent_id} != ${agentId}`);
  }
  if (skillId) {
    if (!skill) {
      findings.push(`event[0]: undeclared skill used: ${skillId}`);
    } else if (skill.kind !== "skill") {
      findings.push(`event[0]: skill_id does not reference a skill capability: ${skillId}`);
    }
  }
  if (!tool) {
    findings.push(`event[0]: undeclared capability used: ${requestedCapability}`);
    return findings;
  }
  if (skill && event.tool && skillId !== event.tool) {
    const mayInvoke = Array.isArray(skill.may_invoke) ? skill.may_invoke : undefined;
    if (mayInvoke && !mayInvoke.includes(event.tool)) {
      findings.push(`event[0]: skill ${skillId} may not invoke tool: ${event.tool}`);
    }
  }
  if (tool.access !== event.action) {
    findings.push(`event[0]: action mismatch for ${requestedCapability}: actual=${event.action}, allowed=${tool.access}`);
  }

  const constraints = recordValue(tool.constraints);
  const requiredContext = arrayValue(constraints.required_context ?? constraints.requiredContext);
  for (const field of requiredContext) {
    if (!hasValue(contextValue(event, field))) {
      findings.push(`event[0]: required context field is missing: ${field}`);
    }
  }
  const allowedValues = recordValue(constraints.allowed_values ?? constraints.allowedValues);
  for (const [field, allowed] of Object.entries(allowedValues)) {
    const allowedSet = arrayValue(allowed);
    const value = contextValue(event, field);
    if (allowedSet.length > 0 && hasValue(value) && !allowedSet.includes(stringValue(value))) {
      findings.push(`event[0]: ${field} is not allowed: ${stringValue(value)}`);
    }
  }

  const approval = stringValue(tool.approval || "none");
  if (APPROVAL_REQUIRED.has(approval) && event.approved !== true) {
    findings.push(`event[0]: ${requestedCapability} requires approval but event is not approved`);
  }
  if (approval === "block") {
    findings.push(`event[0]: ${requestedCapability} is blocked by manifest policy`);
  }

  if (tool.auth_mode === "just_in_time") {
    if (!event.jit_grant_id) {
      findings.push(`event[0]: ${requestedCapability} requires JIT authorization but no jit_grant_id is present`);
    }
    if (event.jit_grant_valid === false) {
      findings.push("event[0]: JIT grant is marked invalid");
    }
  }

  const jobBoundary = manifest.job_boundary;
  if (jobBoundary && typeof jobBoundary === "object" && !Array.isArray(jobBoundary)) {
    const jobId = event.job_id;
    if ((jobBoundary.required === true || jobBoundary.require_job_id === true) && !jobId) {
      findings.push("event[0]: job_id is required by job_boundary");
    }

    const allowedJobs = Array.isArray(jobBoundary.allowed_jobs) ? jobBoundary.allowed_jobs : [];
    if (typeof jobId === "string" && allowedJobs.length > 0 && !allowedJobs.includes(jobId)) {
      findings.push(`event[0]: job_id is not allowed by job_boundary: ${jobId}`);
    }

    const outOfScope = Array.isArray(jobBoundary.out_of_scope) ? jobBoundary.out_of_scope : [];
    if (typeof jobId === "string" && outOfScope.includes(jobId)) {
      findings.push(`event[0]: job_id is explicitly out of scope: ${jobId}`);
    }

    const requiredBindings = Array.isArray(jobBoundary.bind_authorization_to)
      ? jobBoundary.bind_authorization_to
      : [];
    for (const field of requiredBindings) {
      if (!event[field]) findings.push(`event[0]: job_boundary binding field is missing: ${field}`);
    }
  }

  if (event.data_from && event.data_to) {
    const flow = (manifest.data_flows ?? []).find((candidate) => flowMatches(candidate, event));
    if (flow?.allowed === false || flow?.decision === "deny") {
      findings.push(`event[0]: blocked data flow used: ${event.data_from} -> ${event.data_to}`);
    } else if (!flow) {
      findings.push(`event[0]: undeclared data flow: ${event.data_from} -> ${event.data_to}`);
    } else {
      const fieldSet = arrayValue(event.field_set);
      const blockedFields = arrayValue(flow.blocked_fields ?? flow.blockedFields);
      for (const field of presentFields(fieldSet, blockedFields)) {
        findings.push(`event[0]: field is blocked by flow: ${field}`);
      }
      const allowedFields = arrayValue(flow.allowed_fields ?? flow.allowedFields);
      if (allowedFields.length > 0) {
        for (const field of absentFields(fieldSet, allowedFields)) {
          findings.push(`event[0]: field is not allowed by flow: ${field}`);
        }
      }
      const allowedDomains = arrayValue(flow.allowed_domains ?? flow.allowedDomains);
      if (allowedDomains.length > 0 && event.external_domain && !matchesDomain(event.external_domain, allowedDomains)) {
        findings.push(`event[0]: external_domain is not allowed for flow: ${event.external_domain}`);
      }
      const maxRecords = numberValue(flow.max_records ?? flow.maxRecords);
      const recordCount = numberValue(event.record_count);
      if (maxRecords !== undefined && recordCount !== undefined && recordCount > maxRecords) {
        findings.push(`event[0]: record_count exceeds max_records ${maxRecords}`);
      }
      const allowedRedactionStates = arrayValue(flow.allowed_redaction_states ?? flow.allowedRedactionStates).map(normalize);
      const redactionState = normalize(event.redaction_state);
      if (allowedRedactionStates.length > 0 && !allowedRedactionStates.includes(redactionState)) {
        findings.push(`event[0]: redaction_state is not allowed for flow: ${redactionState || "missing"}`);
      }
      if ((flow.requires_approval === true || flow.requiresApproval === true) && event.approved !== true) {
        event.challenge_required = true;
        findings.push(`event[0]: ${event.data_from} -> ${event.data_to} requires approval`);
      }
    }
  }

  if (event.called_agent) {
    const chain = manifest.delegation_chain ?? {};
    const allowedAgents = Array.isArray(chain.allowed_agents) ? chain.allowed_agents : [];
    if (chain.may_call_agents !== true) {
      findings.push("event[0]: agent-to-agent delegation is not allowed");
    } else if (!allowedAgents.includes(event.called_agent)) {
      findings.push(`event[0]: called agent is not in allowed_agents: ${event.called_agent}`);
    }
    if (chain.requires_approval === true && event.approved !== true) {
      findings.push("event[0]: agent-to-agent delegation requires approval but event is not approved");
    }
    const allowedApprovalSources = Array.isArray(chain.approval_sources) ? chain.approval_sources : [];
    if (
      event.approved === true &&
      allowedApprovalSources.length > 0 &&
      !allowedApprovalSources.includes(event.approval_source)
    ) {
      findings.push(`event[0]: approval_source is not allowed for delegation: ${event.approval_source}`);
    }
    const allowedApprovalAgents = Array.isArray(chain.approval_agents) ? chain.approval_agents : [];
    if (
      event.approval_source === "agent" &&
      allowedApprovalAgents.length > 0 &&
      !allowedApprovalAgents.includes(event.approval_agent)
    ) {
      findings.push(`event[0]: approval_agent is not allowed for delegation: ${event.approval_agent}`);
    }
    if (
      typeof event.approval_agent === "string" &&
      (event.approval_agent === event.called_agent || event.approval_agent === event.agent_id)
    ) {
      findings.push("event[0]: delegation approval agent must be independent of source and target agents");
    }

    const maxDepth = typeof chain.max_depth === "number" ? chain.max_depth : undefined;
    const delegationDepth = typeof event.delegation_depth === "number" ? event.delegation_depth : undefined;
    if (maxDepth !== undefined && delegationDepth !== undefined && delegationDepth > maxDepth) {
      findings.push(`event[0]: delegation depth ${delegationDepth} exceeds max_depth ${maxDepth}`);
    }

    const allowedDelegatedTools = Array.isArray(chain.allowed_delegated_tools)
      ? chain.allowed_delegated_tools
      : [];
    if (
      typeof event.delegated_tool === "string" &&
      allowedDelegatedTools.length > 0 &&
      !allowedDelegatedTools.includes(event.delegated_tool)
    ) {
      findings.push(`event[0]: delegated tool is not allowed: ${event.delegated_tool}`);
    }
  }

  return findings;
}

function generateOpaPolicy(manifest: AgentIdManifest): string {
  const agentId = stringValue(manifest.agent?.id || "unknown-agent");
  const tools = declaredCapabilities(manifest);
  const flows = manifest.data_flows ?? [];
  const jobBoundary = manifest.job_boundary ?? {};
  const allowed = tools.map((tool) => `allowed_tools["${tool.name}"] := "${tool.access}"`).join("\n") || "# No tools declared.";
  const approvals =
    tools
      .filter((tool) => APPROVAL_REQUIRED.has(stringValue(tool.approval || "none")))
      .map((tool) => `requires_approval["${tool.name}"]`)
      .join("\n") || "# No approval-required tools declared.";
  const blocked =
    tools
      .filter((tool) => tool.approval === "block")
      .map((tool) => `blocked_tools["${tool.name}"]`)
      .join("\n") || "# No blocked tools declared.";
  const jit =
    tools
      .filter((tool) => tool.auth_mode === "just_in_time")
      .map((tool) => `requires_jit["${tool.name}"]`)
      .join("\n") || "# No JIT-required tools declared.";
  const allowedFlows =
    flows
      .filter((flow) => flow.allowed === true)
      .map((flow) => `allowed_flows["${flow.from}::${flow.to}"]`)
      .join("\n") || "# No explicit allowed data flows declared.";
  const allowedJobs =
    Array.isArray(jobBoundary.allowed_jobs) && jobBoundary.allowed_jobs.length > 0
      ? jobBoundary.allowed_jobs.map((job) => `allowed_jobs["${job}"]`).join("\n")
      : "# No explicit allowed jobs declared.";
  const blockedJobs =
    Array.isArray(jobBoundary.out_of_scope) && jobBoundary.out_of_scope.length > 0
      ? jobBoundary.out_of_scope.map((job) => `blocked_jobs["${job}"]`).join("\n")
      : "# No out-of-scope jobs declared.";
  const requiredJobBindings =
    Array.isArray(jobBoundary.bind_authorization_to) && jobBoundary.bind_authorization_to.length > 0
      ? jobBoundary.bind_authorization_to.map((field) => `required_job_bindings["${field}"]`).join("\n")
      : "# No job binding fields declared.";
  const jobRequired = jobBoundary.required === true || jobBoundary.require_job_id === true ? "true" : "false";

  return `package agentid

default allow := false

agent_id := "${agentId}"

requested_capability := object.get(input, "tool", object.get(input, "capability", ""))

${allowed}

${approvals}

${blocked}

${jit}

${allowedFlows}

job_required := ${jobRequired}

${allowedJobs}

${blockedJobs}

${requiredJobBindings}

tool_allowed if {
    input.agent_id == agent_id
    allowed_tools[requested_capability] == input.action
    not blocked_tools[requested_capability]
}

flow_allowed if {
    input.data_from == ""
    input.data_to == ""
}

flow_allowed if {
    allowed_flows[concat("::", [input.data_from, input.data_to])]
}

job_allowed if {
    not job_required
}

job_allowed if {
    job_required
    input.job_id != ""
    allowed_job
    not blocked_jobs[input.job_id]
    job_bindings_satisfied
}

allowed_job if {
    count(allowed_jobs) == 0
}

allowed_job if {
    allowed_jobs[input.job_id]
}

job_bindings_satisfied if {
    count(missing_job_bindings) == 0
}

missing_job_bindings[field] if {
    required_job_bindings[field]
    object.get(input, field, "") == ""
}

jit_satisfied if {
    not requires_jit[requested_capability]
}

jit_satisfied if {
    requires_jit[requested_capability]
    input.jit_grant_valid == true
    input.jit_grant_agent_id == input.agent_id
    input.jit_grant_tool == requested_capability
    input.jit_grant_action == input.action
}

approval_satisfied if {
    not requires_approval[requested_capability]
}

approval_satisfied if {
    requires_approval[requested_capability]
    input.approved == true
}

allow if {
    tool_allowed
    flow_allowed
    job_allowed
    jit_satisfied
    approval_satisfied
}
`;
}

async function loadManifest(env: Env, tenantId: string | null): Promise<AgentIdManifest> {
  if (tenantId && env.AGENTID_MANIFESTS) {
    const raw = await env.AGENTID_MANIFESTS.get(tenantId);
    if (raw) return JSON.parse(raw) as AgentIdManifest;
  }
  if (env.AGENTID_MANIFEST_JSON) return JSON.parse(env.AGENTID_MANIFEST_JSON) as AgentIdManifest;
  return SAMPLE_MANIFEST;
}

function authorizationStore(env: Env, tenantId: string | null, manifest: AgentIdManifest) {
  const key = tenantId || stringValue(manifest.agent?.id) || "default";
  return env.JIT_GRANTS.get(env.JIT_GRANTS.idFromName(key));
}

async function resolveIntentBinding(
  env: Env,
  tenantId: string | null,
  manifest: AgentIdManifest,
  event: ToolEvent,
): Promise<{ contract?: IntentContract; findings: string[] }> {
  const response = await authorizationStore(env, tenantId, manifest).fetch(
    new Request("https://agentid.local/intent-contracts/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event }),
    }),
  );
  const body = await response.json() as IntentBindingResult & { error?: string; findings?: string[] };
  if (!response.ok) return { findings: body.findings || [body.error || "intent binding could not be resolved"] };
  return { contract: body.contract, findings: [] };
}

async function recordIntentDecisionEvidence(
  env: Env,
  tenantId: string | null,
  manifest: AgentIdManifest,
  decision: AuthorizationDecision,
): Promise<void> {
  if (decision.event.intent_registry_bound !== true) return;
  const record = {
    ...decision.event,
    schema_version: "agentpass.intent-decision-evidence.v1",
    decision: decision.allow ? "allow" : decision.challengeRequired ? "challenge_required" : "deny",
    allow: decision.allow,
    findings: decision.findings,
    decided_at: new Date().toISOString(),
    replayed: decision.replayed === true,
  };
  const stored = await authorizationStore(env, tenantId, manifest).fetch(
    new Request("https://agentid.local/intent-evidence/decision-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: record }),
    }),
  );
  if (!stored.ok) {
    const body = await stored.json() as { error?: string };
    throw new Error(body.error || "intent decision evidence could not be stored");
  }
}

function auditStore(env: Env) {
  return env.JIT_GRANTS.get(env.JIT_GRANTS.idFromName("audit"));
}

function parseRoute(pathname: string): Route {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "tenants" && parts[1]) {
    return {
      tenantId: parts[1],
      endpoint: parts[2] ?? "",
      resourceId: parts[3] ?? "",
      action: parts[4] ?? "",
    };
  }
  return { tenantId: null, endpoint: parts[0] ?? "", resourceId: parts[1] ?? "", action: parts[2] ?? "" };
}

function intentContractResponse(record: IntentContractRecord): Record<string, unknown> {
  const issuedAt = Date.parse(record.contract.issued_at);
  const expiresAt = record.contract.expires_at ? Date.parse(record.contract.expires_at) : Number.POSITIVE_INFINITY;
  const status = issuedAt > Date.now() ? "pending" : expiresAt <= Date.now() ? "expired" : "active";
  return { ...record, status };
}

function intentContractDateFinding(contract: IntentContract): string {
  const issuedAt = Date.parse(contract.issued_at);
  if (!Number.isFinite(issuedAt)) return "intent contract issued_at must be a valid date-time";
  if (!contract.expires_at) return "";
  const expiresAt = Date.parse(contract.expires_at);
  if (!Number.isFinite(expiresAt)) return "intent contract expires_at must be a valid date-time";
  if (expiresAt <= issuedAt) return "intent contract expires_at must be after issued_at";
  return "";
}

function observationAuditMetadata(value: unknown): Record<string, string> {
  const submitted = recordValue(value);
  const observation = recordValue(submitted.observation || submitted);
  const metadata: Record<string, string> = {};
  for (const field of ["observation_id", "issuer", "predicate", "payload_digest"]) {
    const entry = optionalString(observation[field]);
    if (entry) metadata[field] = entry;
  }
  return metadata;
}

function suppliedIntentBindingFinding(
  supplied: Record<string, unknown>,
  registered: IntentContractRecord,
): string {
  const fields: Array<[string, string]> = [
    ["intent_id", registered.intent_id],
    ["intent_digest", registered.intent_digest],
    ["job_id", registered.job_id],
  ];
  for (const [field, expected] of fields) {
    if (hasValue(supplied[field]) && stringValue(supplied[field]) !== expected) {
      return `intent job evidence ${field} mismatch`;
    }
  }
  return "";
}

function declaredCapabilities(manifest: AgentIdManifest): Array<Record<string, unknown>> {
  const capabilities = Array.isArray(manifest.capabilities)
    ? manifest.capabilities.map((capability) => ({
        kind: capability.kind ?? "mcp_tool",
        name: capability.name ?? capability.id,
        id: capability.id ?? capability.name,
        ...capability,
      }))
    : [];
  const tools = Array.isArray(manifest.tools)
    ? manifest.tools.map((tool) => ({
        kind: tool.kind ?? "mcp_tool",
        id: tool.id ?? tool.name,
        ...tool,
      }))
    : [];
  return [...capabilities, ...tools];
}

function toolByName(manifest: AgentIdManifest, name: string): Record<string, unknown> | undefined {
  return declaredCapabilities(manifest).find((tool) => tool.name === name || tool.id === name);
}

function grantTtlSeconds(manifest: AgentIdManifest, tool: Record<string, unknown>): number {
  const constraints = typeof tool.constraints === "object" && tool.constraints ? (tool.constraints as Record<string, unknown>) : {};
  const toolTtl = constraints.token_ttl_seconds;
  if (typeof toolTtl === "number" && toolTtl > 0) return toolTtl;
  const defaultTtl = manifest.jit_authorization?.default_ttl_seconds;
  if (typeof defaultTtl === "number" && defaultTtl > 0) return defaultTtl;
  return 300;
}

function approvalTtlSeconds(manifest: AgentIdManifest, tool: Record<string, unknown>): number {
  const constraints = recordValue(tool.constraints);
  const toolTtl = numberValue(constraints.approval_ttl_seconds);
  if (toolTtl && toolTtl > 0) return toolTtl;
  const defaultTtl = numberValue(manifest.jit_authorization?.approval_ttl_seconds);
  if (defaultTtl && defaultTtl > 0) return defaultTtl;
  return 900;
}

async function approvalRequestDigest(payload: ToolEvent, evidence?: ApprovalEvidence): Promise<string> {
  const context = evidence?.context
    ? Object.fromEntries(Object.keys(evidence.context).sort().map((key) => [
        key,
        stringValue(payload[key] ?? recordValue(payload.context)[key]),
      ]))
    : stringContext(payload);
  const scope = {
    agent_id: stringValue(payload.agent_id),
    intent_id: stringValue(payload.intent_id),
    intent_digest: stringValue(payload.intent_digest),
    tenant_id: stringValue(payload.tenant_id),
    user_id: stringValue(payload.user_id ?? payload.requested_by),
    job_id: stringValue(payload.job_id),
    case_id: stringValue(payload.case_id),
    customer_id: stringValue(payload.customer_id),
    tool: stringValue(payload.tool),
    action: stringValue(payload.action),
    resource: stringValue(payload.resource),
    amount: numberValue(payload.amount ?? payload.amount_usd) ?? null,
    currency: stringValue(payload.currency),
    data_from: stringValue(payload.data_from),
    data_to: stringValue(payload.data_to),
    destination_type: stringValue(payload.destination_type),
    external_domain: stringValue(payload.external_domain),
    data_classification: arrayValue(payload.data_classification ?? payload.dataClassification).sort(),
    field_set: Array.isArray(payload.field_set) ? payload.field_set.map(String).sort() : [],
    record_count: numberValue(payload.record_count) ?? null,
    redaction_state: stringValue(payload.redaction_state),
    retention: stringValue(payload.retention),
    idempotency_key: stringValue(payload.idempotency_key),
    call_fingerprint: stringValue(payload.call_fingerprint),
    basis_category: stringValue(payload.basis_category),
    basis_ref: stringValue(payload.basis_ref),
    context,
  };
  const bytes = new TextEncoder().encode(canonicalJson(scope));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function canonicalDigest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function replayRequestDigest(event: ToolEvent, record: IdempotencyResultRecord): Promise<string> {
  const evidence = record.approval_evidence || recordValue(event.approval_evidence) as Partial<ApprovalEvidence>;
  if (evidence.schema_version === "agentpass.approval-evidence.v1") {
    return approvalRequestDigest(event, evidence as ApprovalEvidence);
  }
  return approvalRequestDigest({
    ...event,
    agent_id: event.agent_id || record.agent_id,
    tool: event.tool || record.tool,
    action: event.action || record.action,
    resource: event.resource || record.resource,
    amount: event.amount ?? record.amount,
    currency: event.currency || record.currency,
    idempotency_key: event.idempotency_key || record.idempotency_key,
  });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function decisionSummary(allow: boolean, findings: string[], event: ToolEvent): string {
  const action = `${stringValue(event.action)} ${stringValue(event.resource) || stringValue(event.tool)}`.trim();
  if (allow) return `Allowed ${action} with scoped authority.`;
  return `Denied ${action}: ${findings.join("; ") || "policy requirements were not satisfied"}.`;
}

function approvalRequired(tool: Record<string, unknown>): boolean {
  return APPROVAL_REQUIRED.has(stringValue(tool.approval));
}

function flowMatches(flow: Record<string, unknown>, event: ToolEvent): boolean {
  if (stringValue(flow.from) !== stringValue(event.data_from)) return false;
  if (stringValue(flow.to) !== stringValue(event.data_to)) return false;
  const destinationType = stringValue(flow.destination_type ?? flow.destinationType);
  if (destinationType && destinationType !== stringValue(event.destination_type)) return false;

  const requiredClassifications = arrayValue(flow.data_classification ?? flow.dataClassification);
  if (requiredClassifications.length === 0) return true;
  const actual = new Set(arrayValue(event.data_classification).map(normalize));
  return requiredClassifications.some((classification) => actual.has(normalize(classification)));
}

function matchingFinding(field: string, approvedValue: unknown, requestedValue: unknown): string {
  if (!hasValue(approvedValue)) return "";
  if (!hasValue(requestedValue) || stringValue(approvedValue) !== stringValue(requestedValue)) {
    return `approval request ${field} mismatch`;
  }
  return "";
}

function findingsFromPayload(payload: Record<string, unknown>): string[] {
  const findings = payload.findings;
  if (Array.isArray(findings)) return findings.map(String);
  if (typeof findings === "string") return [findings];
  return [];
}

function authenticateAuditWebhook(request: Request, env: Env): { ok: true } | { ok: false; status: number; error: string } {
  if (!env.AGENTID_AUDIT_WEBHOOK_TOKEN) {
    if (!env.AGENTID_API_KEY) return { ok: true };
    return { ok: false, status: 500, error: "audit webhook token is not configured" };
  }
  const authorization = request.headers.get("authorization") || "";
  if (authorization !== `Bearer ${env.AGENTID_AUDIT_WEBHOOK_TOKEN}`) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: true };
}

async function authenticate(
  request: Request,
  env: Env,
  manifest: AgentIdManifest,
  tenantId: string | null,
  endpoint: string,
): Promise<{ ok: true; context: AuthContext } | { ok: false; status: number; error: string }> {
  const authorization = request.headers.get("authorization") || "";
  if (env.AGENTID_API_KEY && authorization === `Bearer ${env.AGENTID_API_KEY}`) {
    return { ok: true, context: { method: "api_key" } };
  }

  const oidc = oidcConfig(manifest);
  if (!oidc?.enabled) {
    if (!env.AGENTID_API_KEY) return { ok: true, context: { method: "none" } };
    return { ok: false, status: 401, error: "unauthorized" };
  }

  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  if (!token) return { ok: false, status: 401, error: "missing bearer token" };

  let claims: Record<string, unknown>;
  if (oidc.token_validation === "demo_hs256") {
    if (!env.AGENTID_DEMO_OIDC_SECRET) {
      return { ok: false, status: 500, error: "demo OIDC secret is not configured" };
    }
    claims = await verifyDemoJwt(token, env.AGENTID_DEMO_OIDC_SECRET);
  } else {
    claims = await verifyJwksJwt(token, stringValue(oidc.jwks_uri));
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= now) {
    return { ok: false, status: 401, error: "OIDC token is expired" };
  }
  if (claims.iss !== oidc.issuer) {
    return { ok: false, status: 401, error: "OIDC issuer mismatch" };
  }
  if (!audienceMatches(claims.aud, oidc.audiences)) {
    return { ok: false, status: 401, error: "OIDC audience mismatch" };
  }

  const mapping = oidc.claim_mapping || {};
  const tokenTenant = stringValue(claims[stringValue(mapping.tenant_id)]);
  const tokenAgent = stringValue(claims[stringValue(mapping.agent_id)]);
  const userId = stringValue(claims[stringValue(mapping.user_id)]);
  if (tenantId && tokenTenant && tokenTenant !== tenantId) {
    return { ok: false, status: 403, error: "OIDC tenant claim does not match route tenant" };
  }
  if (manifest.agent?.id && tokenAgent && tokenAgent !== manifest.agent.id) {
    return { ok: false, status: 403, error: "OIDC agent claim does not match manifest agent" };
  }

  const scopes = scopesFromClaims(claims);
  const requiredScope = requiredScopeForEndpoint(oidc, endpoint);
  if (requiredScope && !scopes.includes(requiredScope)) {
    return { ok: false, status: 403, error: `missing required OIDC scope: ${requiredScope}` };
  }

  return {
    ok: true,
    context: {
      method: "oidc",
      subject: stringValue(claims.sub),
      tenant_id: tokenTenant || tenantId || undefined,
      user_id: userId || undefined,
      agent_id: tokenAgent || undefined,
      scopes,
      issuer: stringValue(claims.iss),
    },
  };
}

function oidcConfig(manifest: AgentIdManifest): Record<string, any> | null {
  return typeof manifest.oidc === "object" && manifest.oidc ? manifest.oidc as Record<string, any> : null;
}

function requiredScopeForEndpoint(oidc: Record<string, any>, endpoint: string): string {
  const scopes = oidc.required_scopes || {};
  if (endpoint === "authorize") return stringValue(scopes.authorize);
  if (endpoint === "execution-results") return stringValue(scopes.authorize);
  if (endpoint === "github-actions") return stringValue(scopes.authorize);
  if (endpoint === "jit-grants") return stringValue(scopes.jit_grant);
  if (endpoint === "approval-requests") return stringValue(scopes.approval_request ?? scopes.jit_grant);
  if (endpoint === "intent-contracts") return stringValue(scopes.intent_contract ?? scopes.authorize);
  if (endpoint === "policy") return stringValue(scopes.policy_read);
  return "";
}

async function emitAudit(env: Env, payload: Record<string, unknown>): Promise<void> {
  await auditStore(env).fetch(
    new Request("https://agentid.local/audit-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schema_version: "agentid.audit.v1",
        emitted_at: new Date().toISOString(),
        ...payload,
      }),
    }),
  );

  if (!env.AGENTID_AUDIT_WEBHOOK_URL) return;
  if (isBuiltInAuditWebhook(env.AGENTID_AUDIT_WEBHOOK_URL)) return;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "agentid-cloudflare-gateway",
  };
  if (env.AGENTID_AUDIT_WEBHOOK_TOKEN) {
    headers.authorization = `Bearer ${env.AGENTID_AUDIT_WEBHOOK_TOKEN}`;
  }

  try {
    await fetch(env.AGENTID_AUDIT_WEBHOOK_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        schema_version: "agentid.audit.v1",
        emitted_at: new Date().toISOString(),
        ...payload,
      }),
    });
  } catch (error) {
    console.log(`agentid audit webhook failed: ${(error as Error).message}`);
  }
}

function isBuiltInAuditWebhook(url: string): boolean {
  try {
    return new URL(url).pathname === "/audit/webhook/agentid";
  } catch {
    return false;
  }
}

function auditRecord(payload: Record<string, unknown>): AuditRecord {
  const nestedEvent = recordValue(payload.event);
  const nestedApproval = recordValue(payload.approval);
  const nestedGrant = recordValue(payload.grant);
  return {
    audit_id: crypto.randomUUID(),
    received_at: new Date().toISOString(),
    schema_version: stringValue(payload.schema_version || "agentid.audit.v1"),
    type: stringValue(payload.type || "agentid.audit"),
    tenant_id: typeof payload.tenant_id === "string" ? payload.tenant_id : payload.tenant_id === null ? null : undefined,
    agent_id: firstString(payload.agent_id, nestedEvent.agent_id, nestedApproval.agent_id, nestedGrant.agent_id),
    intent_id: firstString(payload.intent_id, nestedEvent.intent_id, nestedApproval.intent_id, nestedGrant.intent_id),
    tool: firstString(payload.tool, nestedEvent.tool, nestedApproval.tool, nestedGrant.tool),
    action: firstString(payload.action, nestedEvent.action, nestedApproval.action, nestedGrant.action),
    resource: firstString(payload.resource, nestedEvent.resource, nestedApproval.resource, nestedGrant.resource),
    approval_id: firstString(payload.approval_id, nestedEvent.approval_id, nestedApproval.approval_id, nestedGrant.approval_id),
    jit_grant_id: firstString(payload.jit_grant_id, nestedEvent.jit_grant_id, nestedGrant.jit_grant_id),
    allow: typeof payload.allow === "boolean" ? payload.allow : undefined,
    payload,
  };
}

function auditMatches(record: AuditRecord, filters: Record<string, string>): boolean {
  for (const [field, expected] of Object.entries(filters)) {
    if (!expected) continue;
    if (field === "tenant_id" && stringValue(record.tenant_id) !== expected) return false;
    if (field === "type" && record.type !== expected) return false;
    if (field === "agent_id" && stringValue(record.agent_id) !== expected) return false;
    if (field === "intent_id" && stringValue(record.intent_id) !== expected) return false;
    if (field === "tool" && stringValue(record.tool) !== expected) return false;
    if (field === "approval_id" && stringValue(record.approval_id) !== expected) return false;
    if (field === "jit_grant_id" && stringValue(record.jit_grant_id) !== expected) return false;
  }
  return true;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}

function scopesFromClaims(claims: Record<string, unknown>): string[] {
  if (Array.isArray(claims.scope)) return claims.scope.map(String);
  if (typeof claims.scope === "string") return claims.scope.split(" ").filter(Boolean);
  if (Array.isArray(claims.scp)) return claims.scp.map(String);
  return [];
}

function audienceMatches(audience: unknown, allowed: unknown): boolean {
  const allowedValues = Array.isArray(allowed) ? allowed.map(String) : [String(allowed)];
  const tokenValues = Array.isArray(audience) ? audience.map(String) : [String(audience)];
  return tokenValues.some((value) => allowedValues.includes(value));
}

async function verifyDemoJwt(token: string, secret: string): Promise<Record<string, unknown>> {
  const { encodedHeader, encodedPayload, encodedSignature, header } = parseJwt(token);
  if (header.alg !== "HS256") throw new Error("unsupported demo OIDC token algorithm");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signature = base64UrlToBytes(encodedSignature);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid) throw new Error("invalid OIDC token signature");
  return JSON.parse(base64UrlDecode(encodedPayload)) as Record<string, unknown>;
}

async function verifyJwksJwt(token: string, jwksUri: string): Promise<Record<string, unknown>> {
  if (!jwksUri) throw new Error("oidc.jwks_uri is required for JWKS validation");
  const { encodedHeader, encodedPayload, encodedSignature, header } = parseJwt(token);
  if (header.alg !== "RS256") throw new Error("unsupported JWKS OIDC token algorithm");
  const kid = stringValue(header.kid);
  if (!kid) throw new Error("OIDC token header is missing kid");

  const jwksResponse = await fetch(jwksUri, {
    headers: { accept: "application/json" },
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!jwksResponse.ok) throw new Error(`failed to fetch JWKS: ${jwksResponse.status}`);

  const jwks = await jwksResponse.json() as { keys?: Array<JsonWebKey & { kid?: string; alg?: string }> };
  const jwk = (jwks.keys || []).find((key) => key.kid === kid);
  if (!jwk) throw new Error("OIDC signing key not found in JWKS");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid) throw new Error("invalid OIDC token signature");
  return JSON.parse(base64UrlDecode(encodedPayload)) as Record<string, unknown>;
}

function parseJwt(token: string): {
  encodedHeader: string;
  encodedPayload: string;
  encodedSignature: string;
  header: Record<string, unknown>;
} {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid OIDC token format");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  return {
    encodedHeader,
    encodedPayload,
    encodedSignature,
    header: JSON.parse(base64UrlDecode(encodedHeader)) as Record<string, unknown>,
  };
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

function base64UrlJson(value: unknown): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  return Uint8Array.from(base64UrlDecode(value), (char) => char.charCodeAt(0));
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("JSON body must be an object");
    }
    return payload as Record<string, unknown>;
  } catch (error) {
    throw new Error(`invalid JSON: ${(error as Error).message}`);
  }
}

function stringValue(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function optionalString(value: unknown): string | undefined {
  const result = stringValue(value);
  return result || undefined;
}

function arrayValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function normalize(value: unknown): string {
  return stringValue(value).trim().toLowerCase();
}

function matchesDomain(domain: unknown, allowedDomains: string[]): boolean {
  const normalizedDomain = normalize(domain);
  return allowedDomains.some((allowed) => {
    const normalizedAllowed = normalize(allowed);
    return normalizedDomain === normalizedAllowed || normalizedDomain.endsWith(`.${normalizedAllowed}`);
  });
}

function presentFields(fieldSet: string[], blockedFields: string[]): string[] {
  const blocked = new Set(blockedFields.map(normalize));
  return fieldSet.filter((field) => blocked.has(normalize(field)));
}

function absentFields(fieldSet: string[], allowedFields: string[]): string[] {
  const allowed = new Set(allowedFields.map(normalize));
  return fieldSet.filter((field) => !allowed.has(normalize(field)));
}

const RESERVED_CONTEXT_FIELDS = new Set([
  "agent_id",
  "tool",
  "capability",
  "skill_id",
  "skill_hash",
  "action",
  "data_from",
  "data_to",
  "approved",
  "jit_grant_id",
  "approval_id",
  "resource",
  "called_agent",
  "delegated_tool",
  "delegation_depth",
  "delegation_grant_id",
  "approval_source",
  "approval_agent",
  "intent_id",
  "intent_digest",
  "tenant_id",
  "user_id",
  "job_id",
  "case_id",
  "customer_id",
  "context",
  "requested_by",
  "reason",
  "decided_by",
  "findings",
  "amount",
  "amount_usd",
  "currency",
  "destination_type",
  "external_domain",
  "data_classification",
  "dataClassification",
  "field_set",
  "record_count",
  "redaction_state",
  "retention",
  "idempotency_key",
  "call_fingerprint",
  "request_digest",
  "policy_version",
  "policy_findings",
  "prior_attempt_count",
  "budget_state",
  "basis_category",
  "basis_ref",
  "expires_at",
  "decision_reason",
  "approval_evidence",
]);

function stringContext(payload: Record<string, unknown>): Record<string, string> {
  const context: Record<string, string> = {};
  if (payload.context && typeof payload.context === "object" && !Array.isArray(payload.context)) {
    for (const [key, value] of Object.entries(payload.context as Record<string, unknown>)) {
      if (isContextScalar(value)) context[key] = stringValue(value);
    }
  }
  for (const [key, value] of Object.entries(payload)) {
    if (!RESERVED_CONTEXT_FIELDS.has(key) && isContextScalar(value)) {
      context[key] = stringValue(value);
    }
  }
  return context;
}

function isContextScalar(value: unknown): boolean {
  return ["string", "number", "boolean"].includes(typeof value) && value !== null;
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value) !== "";
}

function contextValue(payload: Record<string, unknown>, field: string): unknown {
  return hasValue(payload[field]) ? payload[field] : recordValue(payload.context)[field];
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: cors({ "content-type": "application/json" }),
  });
}

function html(payload: string, status = 200): Response {
  return new Response(payload, {
    status,
    headers: cors({ "content-type": "text/html; charset=utf-8" }),
  });
}

function text(payload: string, status = 200): Response {
  return new Response(payload, {
    status,
    headers: cors({ "content-type": "text/plain; charset=utf-8" }),
  });
}

const APPROVALS_UI_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AgentPass Approvals</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --bg: #f4f6f8;
      --panel: #ffffff;
      --ink: #16202a;
      --muted: #617080;
      --line: #d9e0e7;
      --soft: #eef3f7;
      --blue: #1967d2;
      --green: #16794c;
      --green-bg: #e1f7eb;
      --red: #aa2e25;
      --red-bg: #fde7e5;
      --amber: #986700;
      --amber-bg: #fff3cf;
      --shadow: 0 14px 40px rgba(22, 32, 42, 0.10);
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); }
    button, input, textarea { font: inherit; }
    button { cursor: pointer; }
    .shell { min-height: 100vh; display: grid; grid-template-rows: auto 1fr; }
    header.top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: 16px 22px;
      background: var(--panel);
      border-bottom: 1px solid var(--line);
    }
    .brand { display: grid; gap: 2px; }
    h1 { margin: 0; font-size: 18px; line-height: 1.2; font-weight: 720; letter-spacing: 0; }
    .subtitle { color: var(--muted); font-size: 13px; }
    .top-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .token, .tenant {
      width: min(280px, 44vw);
      height: 34px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 0 10px;
      background: #fff;
      color: var(--ink);
      font-size: 13px;
    }
    .tenant { width: min(190px, 32vw); }
    .ghost, .primary, .danger {
      height: 34px;
      border-radius: 6px;
      border: 1px solid var(--line);
      padding: 0 12px;
      font-size: 13px;
      font-weight: 680;
      background: #fff;
      color: var(--ink);
    }
    .primary { background: var(--green); color: #fff; border-color: var(--green); }
    .danger { background: var(--red); color: #fff; border-color: var(--red); }
    main {
      display: grid;
      grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
      gap: 16px;
      padding: 16px;
      min-height: 0;
    }
    .queue, .detail {
      min-height: 0;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
      overflow: hidden;
    }
    .queue-head {
      padding: 14px;
      border-bottom: 1px solid var(--line);
      display: grid;
      gap: 12px;
    }
    .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .metric { border: 1px solid var(--line); border-radius: 6px; padding: 9px; background: #fbfcfd; }
    .metric strong { display: block; font-size: 20px; line-height: 1; }
    .metric span { display: block; margin-top: 5px; color: var(--muted); font-size: 11px; text-transform: uppercase; font-weight: 720; }
    .filters { display: flex; gap: 8px; }
    .filters button { flex: 1; height: 32px; border-radius: 6px; border: 1px solid var(--line); background: #fff; font-size: 12px; font-weight: 700; color: var(--muted); }
    .filters button.active { color: var(--blue); border-color: #9ec1ff; background: #eef5ff; }
    .list { overflow: auto; max-height: calc(100vh - 178px); }
    .item {
      width: 100%;
      display: grid;
      gap: 8px;
      padding: 14px;
      border: 0;
      border-bottom: 1px solid var(--line);
      background: #fff;
      color: inherit;
      text-align: left;
    }
    .item:hover, .item.active { background: #f7fbff; }
    .item.active { box-shadow: inset 3px 0 0 var(--blue); }
    .item-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .tool { font-size: 14px; font-weight: 730; overflow-wrap: anywhere; }
    .resource { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
    .pill { display: inline-flex; align-items: center; justify-content: center; min-height: 22px; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 760; white-space: nowrap; }
    .pending { background: var(--amber-bg); color: var(--amber); }
    .approved { background: var(--green-bg); color: var(--green); }
    .denied { background: var(--red-bg); color: var(--red); }
    .risk-critical { background: var(--red-bg); color: var(--red); }
    .risk-high { background: var(--amber-bg); color: var(--amber); }
    .risk-medium { background: #e7f0ff; color: var(--blue); }
    .detail { display: grid; grid-template-rows: auto 1fr auto; }
    .detail-head {
      padding: 18px;
      border-bottom: 1px solid var(--line);
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
    }
    .detail-title { display: grid; gap: 8px; min-width: 0; }
    .detail-title h2 { margin: 0; font-size: 24px; line-height: 1.15; letter-spacing: 0; overflow-wrap: anywhere; }
    .summary { color: var(--muted); font-size: 14px; line-height: 1.45; }
    .reviewer { display: grid; gap: 6px; min-width: 220px; }
    label { display: grid; gap: 5px; font-size: 11px; color: var(--muted); text-transform: uppercase; font-weight: 750; }
    .reviewer input {
      height: 34px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 0 10px;
      color: var(--ink);
      background: #fff;
      text-transform: none;
      font-size: 13px;
      font-weight: 500;
    }
    .detail-body { overflow: auto; padding: 16px 18px 20px; display: grid; gap: 16px; align-content: start; }
    .section { display: grid; gap: 10px; }
    .section h3 { margin: 0; font-size: 12px; text-transform: uppercase; color: var(--muted); letter-spacing: 0; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .field { border: 1px solid var(--line); border-radius: 6px; padding: 10px; background: #fbfcfd; min-width: 0; }
    .field span { display: block; color: var(--muted); font-size: 11px; text-transform: uppercase; font-weight: 750; margin-bottom: 5px; }
    .field code, .field strong { font-size: 13px; overflow-wrap: anywhere; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .evidence { display: grid; gap: 8px; }
    .evidence li { line-height: 1.4; }
    .note {
      width: 100%;
      min-height: 76px;
      resize: vertical;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px;
      color: var(--ink);
    }
    .payload {
      margin: 0;
      padding: 12px;
      background: #101820;
      color: #dce7f3;
      border-radius: 6px;
      overflow: auto;
      font-size: 12px;
      max-height: 230px;
    }
    .timeline { display: grid; gap: 8px; }
    .timeline-event { border: 1px solid var(--line); border-left: 3px solid var(--blue); border-radius: 6px; padding: 10px; background: #fbfcfd; }
    .timeline-event strong { display: block; font-size: 13px; }
    .timeline-event span { display: block; margin-top: 4px; color: var(--muted); font-size: 12px; line-height: 1.4; }
    .decision-bar {
      padding: 12px 18px;
      border-top: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      background: #fbfcfd;
    }
    .statusline { color: var(--muted); font-size: 13px; min-width: 0; overflow-wrap: anywhere; }
    .decision-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    @media (max-width: 920px) {
      header.top, .detail-head, .decision-bar { align-items: stretch; flex-direction: column; }
      main { grid-template-columns: 1fr; }
      .list { max-height: none; }
      .grid { grid-template-columns: 1fr; }
      .top-actions { justify-content: stretch; }
      .token { width: 100%; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="top">
      <div class="brand">
        <h1>AgentPass Approvals</h1>
        <div class="subtitle">Review exact agent tool actions before scoped authority is issued.</div>
      </div>
      <div class="top-actions">
        <input class="tenant" id="tenant" autocomplete="off" placeholder="Tenant ID (optional)">
        <input class="token" id="token" type="password" autocomplete="off" placeholder="API key for live approvals">
        <button class="ghost" id="loadLive">Load Live Queue</button>
        <button class="ghost" id="resetMock">Use Preview</button>
      </div>
    </header>
    <main>
      <aside class="queue">
        <div class="queue-head">
          <div class="metrics">
            <div class="metric"><strong id="pendingCount">0</strong><span>Pending</span></div>
            <div class="metric"><strong id="approvedCount">0</strong><span>Approved</span></div>
            <div class="metric"><strong id="deniedCount">0</strong><span>Denied</span></div>
          </div>
          <div class="filters" role="tablist" aria-label="Approval filters">
            <button class="active" data-filter="pending">Pending</button>
            <button data-filter="all">All</button>
            <button data-filter="decided">Decided</button>
          </div>
        </div>
        <div class="list" id="list"></div>
      </aside>
      <section class="detail">
        <div class="detail-head">
          <div class="detail-title">
            <div id="selectedPills"></div>
            <h2 id="title">Select an approval</h2>
            <div class="summary" id="summary"></div>
          </div>
          <div class="reviewer">
            <label>Approver identity <input id="decidedBy" value="release-manager-1"></label>
            <label>Findings <input id="finding" value="change request verified"></label>
          </div>
        </div>
        <div class="detail-body">
          <div class="section">
            <h3>Scope</h3>
            <div class="grid" id="scopeGrid"></div>
          </div>
          <div class="section">
            <h3>Why Approval Is Required</h3>
            <ul class="evidence" id="evidence"></ul>
          </div>
          <div class="section">
            <h3>Reviewer Note</h3>
            <textarea class="note" id="note" placeholder="Add context for the audit trail"></textarea>
          </div>
          <div class="section">
            <h3>Request Payload</h3>
            <pre class="payload" id="payload"></pre>
          </div>
          <div class="section">
            <h3>Lifecycle Timeline</h3>
            <div class="timeline" id="timeline"><div class="resource">Preview mode has no hosted audit events.</div></div>
          </div>
        </div>
        <div class="decision-bar">
          <div class="statusline" id="statusline">Mock approval inbox ready.</div>
          <div class="decision-actions">
            <button class="danger" id="deny">Deny</button>
            <button class="primary" id="approve">Approve Scope</button>
            <button class="ghost" id="issueGrant">Issue JIT</button>
            <button class="ghost" id="executeOnce">Execute Once</button>
            <button class="ghost" id="testReplay">Test Replay</button>
          </div>
        </div>
      </section>
    </main>
  </div>
  <script>
    function initialApprovals() {
      return [
      {
        approval_id: "approval-prod-deploy-1042",
        status: "pending",
        risk: "critical",
        agent_id: "platform-release-agent",
        tool: "devops.deploy.production",
        action: "deploy",
        resource: "service/checkout-api/environment/production",
        requested_by: "release-1",
        reason: "Deploy checkout-api after approved change request",
        created_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
        job_id: "production_deploy",
        context: {
          environment: "production",
          service_id: "checkout-api",
          repo: "github.com/example/checkout",
          branch: "main",
          commit_sha: "abc123def456",
          change_request_id: "CHG-1042",
          workflow_id: "deploy-production.yml",
          incident_id: "INC-2048"
        },
        evidence: {
          schema_version: "agentpass.approval_evidence.v1",
          agent_id: "platform-release-agent",
          user_id: "release-1",
          tool: "devops.deploy.production",
          action: "deploy",
          resource: "service/checkout-api/environment/production",
          job_id: "production_deploy",
          idempotency_key: "deploy-checkout-abc123def456",
          request_digest: "preview-prod-deploy-1042",
          context: {
            environment: "production",
            service_id: "checkout-api",
            repo: "github.com/example/checkout",
            branch: "main",
            commit_sha: "abc123def456",
            change_request_id: "CHG-1042",
            workflow_id: "deploy-production.yml",
            incident_id: "INC-2048"
          },
          policy_findings: [
            "Production deploy requires human approval.",
            "JIT grant is bound to service, branch, commit, and change request.",
            "Identical retry replays the recorded workflow dispatch result without another execution."
          ]
        }
      },
      {
        approval_id: "approval-prod-rollback-2048",
        status: "pending",
        risk: "critical",
        agent_id: "platform-release-agent",
        tool: "devops.rollback.production",
        action: "rollback",
        resource: "service/checkout-api/environment/production/deployment/dep-842",
        requested_by: "sre-1",
        reason: "Rollback checkout-api for active incident",
        created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        job_id: "production_rollback",
        context: {
          environment: "production",
          service_id: "checkout-api",
          repo: "github.com/example/checkout",
          branch: "main",
          commit_sha: "rollback123",
          incident_id: "INC-2048",
          rollback_plan_id: "RB-2048",
          workflow_id: "rollback-production.yml"
        },
        evidence: {
          schema_version: "agentpass.approval_evidence.v1",
          agent_id: "platform-release-agent",
          user_id: "sre-1",
          tool: "devops.rollback.production",
          action: "rollback",
          resource: "service/checkout-api/environment/production/deployment/dep-842",
          job_id: "production_rollback",
          idempotency_key: "rollback-checkout-INC-2048-RB-2048",
          request_digest: "preview-prod-rollback-2048",
          context: {
            environment: "production",
            service_id: "checkout-api",
            repo: "github.com/example/checkout",
            branch: "main",
            commit_sha: "rollback123",
            incident_id: "INC-2048",
            rollback_plan_id: "RB-2048",
            workflow_id: "rollback-production.yml"
          },
          policy_findings: [
            "Production rollback requires incident-scoped approval.",
            "JIT grant is bound to incident ID and rollback plan.",
            "Identical retry replays the recorded rollback dispatch result without another execution."
          ]
        }
      },
      {
        approval_id: "approval-refund-9917",
        status: "pending",
        risk: "high",
        agent_id: "customer-support-refund-agent",
        tool: "stripe.create_refund",
        action: "write",
        resource: "refund/re_9917/customer/cus_123",
        requested_by: "support-rep-17",
        reason: "Customer eligible for refund after duplicate charge review",
        created_at: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
        job_id: "support_case_resolution",
        case_id: "case-1042",
        customer_id: "cus_123",
        context: {
          amount_usd: "84.20",
          refund_window: "30d",
          prior_refunds: "0",
          ticket_url: "https://zendesk.example/tickets/1042"
        },
        evidence: [
          "Payment mutation requires approval.",
          "Refund amount is under policy maximum.",
          "Customer and support case are bound into the approval."
        ]
      },
      {
        approval_id: "approval-pii-browser-7712",
        status: "pending",
        risk: "high",
        agent_id: "support-agent",
        tool: "browser.fill_form",
        action: "send",
        resource: "browser/customer/cus_123/portal.customer.example",
        requested_by: "support-rep-22",
        reason: "Fill a verified customer-domain support form with minimum CRM fields",
        created_at: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
        job_id: "case-7712",
        case_id: "case-7712",
        customer_id: "cus_123",
        context: {
          destination_type: "browser_form",
          recipient_domain: "portal.customer.example",
          form_id: "support-intake"
        },
        evidence: {
          schema_version: "agentpass.approval_evidence.v1",
          agent_id: "support-agent",
          tool: "browser.fill_form",
          action: "send",
          resource: "browser/customer/cus_123/portal.customer.example",
          data_from: "provider_crm",
          data_to: "browser_form",
          destination_type: "browser_form",
          external_domain: "portal.customer.example",
          data_classification: ["customer_data", "pii"],
          field_set: ["case_id", "customer_id"],
          record_count: 1,
          redaction_state: "minimum_fields",
          retention: "transient",
          job_id: "case-7712",
          case_id: "case-7712",
          customer_id: "cus_123",
          request_digest: "preview-pii-browser-7712",
          policy_findings: [
            "Browser form PII egress requires human confirmation.",
            "Destination domain matches the customer account.",
            "Approval is bound to the exact field set and destination."
          ]
        }
      },
      {
        approval_id: "approval-email-5021",
        status: "approved",
        risk: "medium",
        agent_id: "customer-success-agent",
        tool: "email.send_external",
        action: "write",
        resource: "email/customer/cus_884",
        requested_by: "ae-4",
        reason: "Send renewal follow-up drafted from CRM notes",
        created_at: new Date(Date.now() - 28 * 60 * 1000).toISOString(),
        decided_at: new Date(Date.now() - 23 * 60 * 1000).toISOString(),
        decided_by: "account-manager-2",
        findings: ["recipient verified", "no sensitive attachment"],
        context: {
          recipient_domain: "customer.example",
          template_id: "renewal-followup",
          contains_attachment: "false"
        },
        evidence: [
          "External send requires human confirmation.",
          "Recipient domain matches CRM account.",
          "Approval is already decided."
        ]
      }
      ];
    }
    let approvals = initialApprovals();
    let selectedId = approvals[0]?.approval_id || "";
    let filter = "pending";
    let liveMode = false;
    let activeGrantId = "";
    let executionPayload = null;
    const list = document.getElementById("list");
    const token = document.getElementById("token");
    const tenant = document.getElementById("tenant");
    const statusline = document.getElementById("statusline");
    token.value = sessionStorage.getItem("agentid.approvals.token") || "";
    tenant.value = sessionStorage.getItem("agentid.approvals.tenant") || "";
    document.getElementById("approve").addEventListener("click", () => decide("approve"));
    document.getElementById("deny").addEventListener("click", () => decide("deny"));
    document.getElementById("issueGrant").addEventListener("click", issueGrant);
    document.getElementById("executeOnce").addEventListener("click", executeOnce);
    document.getElementById("testReplay").addEventListener("click", testReplay);
    document.getElementById("resetMock").addEventListener("click", () => {
      liveMode = false;
      activeGrantId = "";
      executionPayload = null;
      approvals = initialApprovals();
      selectedId = approvals[0].approval_id;
      render();
      statusline.textContent = "Preview mode. Load the live queue to make durable decisions.";
    });
    document.getElementById("loadLive").addEventListener("click", loadLive);
    for (const button of document.querySelectorAll(".filters button")) {
      button.addEventListener("click", () => {
        filter = button.dataset.filter;
        for (const peer of document.querySelectorAll(".filters button")) peer.classList.toggle("active", peer === button);
        renderList();
      });
    }
    render();
    function render() {
      document.getElementById("pendingCount").textContent = approvals.filter((item) => item.status === "pending").length;
      document.getElementById("approvedCount").textContent = approvals.filter((item) => item.status === "approved").length;
      document.getElementById("deniedCount").textContent = approvals.filter((item) => item.status === "denied" || item.status === "expired").length;
      renderList();
      renderDetail();
    }
    function renderList() {
      const visible = approvals.filter((item) => filter === "all" || (filter === "decided" ? item.status !== "pending" : item.status === filter));
      list.innerHTML = "";
      for (const approval of visible) {
        const button = document.createElement("button");
        button.className = "item" + (approval.approval_id === selectedId ? " active" : "");
        button.innerHTML =
          '<div class="item-row"><div class="tool">' + esc(approval.tool) + '</div><span class="pill ' + esc(approval.status) + '">' + esc(approval.status) + '</span></div>' +
          '<div class="resource">' + esc(approval.resource) + '</div>' +
          '<div class="item-row"><span class="pill risk-' + esc(approval.risk || "high") + '">' + esc(approval.risk || "high") + '</span><span class="resource">' + age(approval.created_at) + '</span></div>';
        button.addEventListener("click", () => { selectedId = approval.approval_id; activeGrantId = ""; executionPayload = null; render(); if (liveMode) loadTimeline(); });
        list.appendChild(button);
      }
      if (!visible.length) {
        list.innerHTML = '<div class="item"><div class="tool">No approvals in this view</div><div class="resource">Switch filters or load the current durable queue.</div></div>';
      }
    }
    function renderDetail() {
      const approval = selected();
      if (!approval) {
        document.getElementById("title").textContent = "No approval selected";
        return;
      }
      const evidence = evidenceFor(approval);
      document.getElementById("selectedPills").innerHTML =
        '<span class="pill ' + esc(approval.status) + '">' + esc(approval.status) + '</span> ' +
        '<span class="pill risk-' + esc(approval.risk || "high") + '">' + esc(approval.risk || "high") + ' risk</span>';
      document.getElementById("title").textContent = approval.tool;
      document.getElementById("summary").textContent = approval.agent_id + " wants to " + approval.action + " " + approval.resource + ".";
      const fields = {
        "Approval ID": approval.approval_id,
        "Agent": evidence.agent_id || approval.agent_id,
        "Requested By": approval.requested_by,
        "Action": evidence.action || approval.action,
        "Resource": evidence.resource || approval.resource,
        "Request Digest": evidence.request_digest || "preview only",
        "Policy Version": evidence.policy_version || "not supplied",
        "Job": evidence.job_id || approval.job_id || "",
        "Case": evidence.case_id || approval.case_id || "",
        "Customer": evidence.customer_id || approval.customer_id || "",
        "Amount": evidence.amount === undefined ? "" : String(evidence.amount) + " " + (evidence.currency || ""),
        "Destination": evidence.external_domain || evidence.data_to || "",
        "Classification": (evidence.data_classification || []).join(", "),
        "Fields": (evidence.field_set || []).join(", "),
        "Redaction": evidence.redaction_state || "",
        "Retention": evidence.retention || "",
        "Expires": evidence.expires_at || approval.expires_at || "",
        "Decided": approval.decided_at || ""
      };
      for (const [key, value] of Object.entries(evidence.context || approval.context || {})) fields[key] = value;
      document.getElementById("scopeGrid").innerHTML = Object.entries(fields)
        .filter(([, value]) => String(value || ""))
        .map(([key, value]) => '<div class="field"><span>' + esc(key) + '</span><code>' + esc(value) + '</code></div>')
        .join("");
      const findings = Array.isArray(evidence.policy_findings) ? evidence.policy_findings : (Array.isArray(approval.evidence) ? approval.evidence : []);
      document.getElementById("evidence").innerHTML = findings.map((item) => '<li>' + esc(item) + '</li>').join("");
      document.getElementById("payload").textContent = JSON.stringify(approval, null, 2);
      document.getElementById("approve").disabled = approval.status !== "pending";
      document.getElementById("deny").disabled = approval.status !== "pending";
      document.getElementById("issueGrant").disabled = !liveMode || approval.status !== "approved" || Boolean(activeGrantId);
      document.getElementById("executeOnce").disabled = !activeGrantId;
      document.getElementById("testReplay").disabled = !executionPayload;
      if (!liveMode) statusline.textContent = "Preview mode. Live actions are disabled.";
      else if (approval.status === "pending") statusline.textContent = "Approval is pending. Review the exact evidence before deciding.";
      else statusline.textContent = "Approval is " + approval.status + (approval.decided_by ? " by " + approval.decided_by : "") + ".";
    }
    async function decide(action) {
      const approval = selected();
      if (!approval || approval.status !== "pending") return;
      const finding = document.getElementById("finding").value || "reviewed";
      const note = document.getElementById("note").value || "";
      const payload = {
        decided_by: document.getElementById("decidedBy").value || "",
        decision_reason: note || finding,
        findings: [finding, note].filter(Boolean)
      };
      if (!liveMode) {
        approval.status = action === "approve" ? "approved" : "denied";
        approval.decided_at = new Date().toISOString();
        approval.decided_by = payload.decided_by || "preview-reviewer";
        approval.decision_reason = payload.decision_reason;
        approval.findings = payload.findings;
        render();
        return;
      }
      try {
        const body = await api(apiBase() + "/approval-requests/" + encodeURIComponent(approval.approval_id) + "/" + action, "POST", payload);
        Object.assign(approval, body);
        activeGrantId = "";
        executionPayload = null;
        render();
        await loadTimeline();
      } catch (error) {
        statusline.textContent = error.message;
      }
    }
    async function loadLive() {
      saveConnection();
      statusline.textContent = "Loading durable approval queue...";
      try {
        const body = await api(apiBase() + "/approval-requests?limit=100", "GET");
        liveMode = true;
        approvals = (body.approvals || []).map((approval) => ({ ...approval, risk: approval.risk || "high" }));
        selectedId = approvals[0]?.approval_id || "";
        activeGrantId = "";
        executionPayload = null;
        render();
        await loadTimeline();
        statusline.textContent = "Loaded " + approvals.length + " durable approval request(s).";
      } catch (error) {
        statusline.textContent = error.message;
      }
    }
    async function issueGrant() {
      const approval = selected();
      if (!approval || approval.status !== "approved") return;
      try {
        const payload = boundPayload(approval);
        payload.approval_id = approval.approval_id;
        const grant = await api(apiBase() + "/jit-grants", "POST", payload);
        activeGrantId = grant.jit_grant_id;
        executionPayload = null;
        renderDetail();
        statusline.textContent = "Single-use JIT grant issued. Execute the exact approved action once.";
        await loadTimeline();
      } catch (error) {
        statusline.textContent = error.message;
      }
    }
    async function executeOnce() {
      if (!activeGrantId) return;
      try {
        executionPayload = { ...boundPayload(selected()), approved: true, jit_grant_id: activeGrantId };
        const tool = executionPayload.tool || "";
        let body;
        if (tool.startsWith("devops.")) {
          body = await api(apiBase() + "/github-actions/dispatch", "POST", executionPayload);
        } else {
          body = await api(apiBase() + "/authorize", "POST", executionPayload);
          if (body.allow) {
            await api(apiBase() + "/execution-results", "POST", {
              ...executionPayload,
              result: {
                provider_result_id: "result-" + selected().approval_id,
                mutation_count: 1,
                completed_at: new Date().toISOString()
              }
            });
          }
        }
        if (body.allow === false) {
          statusline.textContent = "Action denied.";
        } else if (tool.startsWith("devops.")) {
          statusline.textContent = body.replayed ? "Cached workflow dispatch result replayed." : "GitHub Actions workflow dispatched and recorded for replay.";
        } else {
          statusline.textContent = "Exact action authorized and provider result recorded for replay.";
        }
        renderDetail();
        await loadTimeline();
      } catch (error) {
        statusline.textContent = error.message;
      }
    }
    async function testReplay() {
      if (!executionPayload) return;
      try {
        const tool = executionPayload.tool || "";
        const body = tool.startsWith("devops.")
          ? await api(apiBase() + "/github-actions/dispatch", "POST", executionPayload)
          : await api(apiBase() + "/authorize", "POST", executionPayload);
        statusline.textContent = body.replayed ? "Cached provider result replayed without another mutation." : "Retry authorized without replay metadata.";
      } catch (error) {
        statusline.textContent = "Replay denied: " + error.message;
      }
      await loadTimeline();
    }
    async function loadTimeline() {
      const approval = selected();
      if (!liveMode || !approval) return;
      try {
        const query = new URLSearchParams({ approval_id: approval.approval_id, limit: "30" });
        if (tenant.value) query.set("tenant_id", tenant.value);
        const body = await api("/audit/events?" + query.toString(), "GET");
        document.getElementById("timeline").innerHTML = (body.events || []).map((event) => {
          const summary = event.payload?.decision_summary || event.payload?.decision_reason || event.payload?.error || event.type;
          return '<div class="timeline-event"><strong>' + esc(event.type) + '</strong><span>' + esc(summary) + '</span><span>' + esc(event.received_at) + '</span></div>';
        }).join("") || '<div class="resource">No correlated events yet.</div>';
      } catch (error) {
        document.getElementById("timeline").innerHTML = '<div class="resource">' + esc(error.message) + '</div>';
      }
    }
    function boundPayload(approval) {
      const evidence = evidenceFor(approval);
      return {
        agent_id: evidence.agent_id || approval.agent_id,
        user_id: evidence.user_id || approval.requested_by,
        job_id: evidence.job_id,
        case_id: evidence.case_id,
        customer_id: evidence.customer_id,
        tool: evidence.tool || approval.tool,
        action: evidence.action || approval.action,
        resource: evidence.resource || approval.resource,
        amount: evidence.amount,
        currency: evidence.currency,
        data_from: evidence.data_from,
        data_to: evidence.data_to,
        destination_type: evidence.destination_type,
        external_domain: evidence.external_domain,
        field_set: evidence.field_set || [],
        record_count: evidence.record_count,
        idempotency_key: evidence.idempotency_key,
        call_fingerprint: evidence.call_fingerprint,
        basis_category: evidence.basis_category,
        basis_ref: evidence.basis_ref,
        context: evidence.context || approval.context || {}
      };
    }
    function evidenceFor(approval) {
      return approval && approval.evidence && !Array.isArray(approval.evidence) ? approval.evidence : {
        agent_id: approval.agent_id,
        tool: approval.tool,
        action: approval.action,
        resource: approval.resource,
        job_id: approval.job_id,
        case_id: approval.case_id,
        customer_id: approval.customer_id,
        amount: approval.amount,
        currency: approval.currency,
        request_digest: "preview only",
        context: approval.context || {},
        policy_findings: Array.isArray(approval.evidence) ? approval.evidence : []
      };
    }
    async function api(path, method, payload) {
      saveConnection();
      const headers = { "content-type": "application/json" };
      if (token.value) headers.authorization = "Bearer " + token.value;
      const response = await fetch(path, {
        method,
        headers,
        body: payload ? JSON.stringify(payload) : undefined
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || (body.findings || []).join("; ") || "request failed with status " + response.status);
      return body;
    }
    function apiBase() {
      return tenant.value ? "/tenants/" + encodeURIComponent(tenant.value) : "";
    }
    function saveConnection() {
      sessionStorage.setItem("agentid.approvals.token", token.value);
      sessionStorage.setItem("agentid.approvals.tenant", tenant.value);
    }
    function selected() {
      return approvals.find((item) => item.approval_id === selectedId) || approvals[0];
    }
    function persist() {
      sessionStorage.setItem("agentid.approvals.mock", JSON.stringify(approvals));
    }
    function esc(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    }
    function age(value) {
      const ms = Date.now() - Date.parse(value || new Date().toISOString());
      const minutes = Math.max(0, Math.round(ms / 60000));
      return minutes < 60 ? minutes + "m ago" : Math.round(minutes / 60) + "h ago";
    }
  </script>
</body>
</html>`;

const AUDIT_UI_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AgentPass Audit Console</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f6f7f8; color: #182026; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 24px; border-bottom: 1px solid #d9dee3; background: #fff; }
    h1 { margin: 0; font-size: 18px; font-weight: 650; }
    main { padding: 18px 24px 28px; }
    .toolbar { display: grid; grid-template-columns: 1.4fr repeat(5, minmax(120px, 1fr)) auto; gap: 8px; align-items: end; margin-bottom: 14px; }
    label { display: grid; gap: 4px; font-size: 11px; font-weight: 650; color: #53606b; text-transform: uppercase; }
    input, select, button { height: 34px; border: 1px solid #c7ced6; border-radius: 6px; background: #fff; color: #182026; font: inherit; font-size: 13px; padding: 0 10px; }
    button { cursor: pointer; font-weight: 650; background: #1f6feb; border-color: #1f6feb; color: #fff; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #d9dee3; }
    th, td { padding: 9px 10px; border-bottom: 1px solid #e8ebef; text-align: left; font-size: 13px; vertical-align: top; }
    th { font-size: 11px; color: #53606b; text-transform: uppercase; background: #f9fafb; }
    tr:hover td { background: #f6faff; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
    .status { font-size: 13px; color: #53606b; }
    .pill { display: inline-block; padding: 2px 7px; border-radius: 999px; background: #eef2f7; font-size: 12px; }
    .allow { background: #dff7e8; color: #176c35; }
    .deny { background: #fde7e7; color: #9f1d1d; }
    dialog { width: min(960px, calc(100vw - 32px)); border: 1px solid #c7ced6; border-radius: 8px; padding: 0; }
    dialog header { padding: 12px 14px; }
    pre { margin: 0; padding: 14px; max-height: 70vh; overflow: auto; background: #0f1720; color: #dce7f3; font-size: 12px; }
    @media (max-width: 980px) { .toolbar { grid-template-columns: 1fr 1fr; } table { display: block; overflow-x: auto; } }
  </style>
</head>
<body>
  <header>
    <h1>AgentPass Audit Console</h1>
    <div class="status" id="status">Idle</div>
  </header>
  <main>
    <section class="toolbar">
      <label>API Key <input id="token" type="password" autocomplete="off" placeholder="Bearer token"></label>
      <label>Type <select id="type"><option value="">All</option><option>agentid.decision</option><option>agentid.approval.created</option><option>agentid.approval.decided</option><option>agentid.jit.denied</option><option>agentid.jit.issued</option><option>agentid.provider.executed</option><option>agentid.provider.replayed</option></select></label>
      <label>Agent <input id="agent_id" placeholder="agent id"></label>
      <label>Tool <input id="tool" placeholder="tool"></label>
      <label>Approval <input id="approval_id" placeholder="approval id"></label>
      <label>JIT Grant <input id="jit_grant_id" placeholder="grant id"></label>
      <button id="refresh">Refresh</button>
    </section>
    <table>
      <thead><tr><th>Received</th><th>Type</th><th>Decision</th><th>Agent</th><th>Tool</th><th>Approval</th><th>JIT Grant</th></tr></thead>
      <tbody id="rows"></tbody>
    </table>
  </main>
  <dialog id="details">
    <header><h1>Audit Event</h1><button id="close">Close</button></header>
    <pre id="json"></pre>
  </dialog>
  <script>
    const ids = ["token", "type", "agent_id", "tool", "approval_id", "jit_grant_id"];
    const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
    const rows = document.getElementById("rows");
    const status = document.getElementById("status");
    const details = document.getElementById("details");
    const json = document.getElementById("json");
    el.token.value = sessionStorage.getItem("agentid.audit.token") || "";
    document.getElementById("refresh").addEventListener("click", load);
    document.getElementById("close").addEventListener("click", () => details.close());
    async function load() {
      sessionStorage.setItem("agentid.audit.token", el.token.value);
      const params = new URLSearchParams({ limit: "100" });
      for (const id of ids.slice(1)) if (el[id].value) params.set(id, el[id].value);
      status.textContent = "Loading";
      rows.innerHTML = "";
      const response = await fetch("/audit/events?" + params.toString(), {
        headers: el.token.value ? { authorization: "Bearer " + el.token.value } : {},
      });
      const body = await response.json();
      if (!response.ok) {
        status.textContent = body.error || "Request failed";
        return;
      }
      status.textContent = body.count + " events";
      for (const event of body.events || []) {
        const tr = document.createElement("tr");
        const decision = event.allow === true ? '<span class="pill allow">allow</span>' : event.allow === false ? '<span class="pill deny">deny</span>' : "";
        tr.innerHTML = "<td><code>" + esc(event.received_at || "") + "</code></td><td>" + esc(event.type || "") + "</td><td>" + decision + "</td><td>" + esc(event.agent_id || "") + "</td><td>" + esc(event.tool || "") + "</td><td><code>" + esc(event.approval_id || "") + "</code></td><td><code>" + esc(event.jit_grant_id || "") + "</code></td>";
        tr.addEventListener("click", () => { json.textContent = JSON.stringify(event, null, 2); details.showModal(); });
        rows.appendChild(tr);
      }
    }
    function esc(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    }
  </script>
</body>
</html>`;

function empty(status = 204): Response {
  return new Response(null, { status, headers: cors({}) });
}

function cors(headers: Record<string, string>): Headers {
  return new Headers({
    ...headers,
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
  });
}
