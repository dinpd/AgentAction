import {
  bindIntentContract,
  bindIntentProfile,
  digestIntentContract,
  digestIntentProfile,
  evaluateIntent,
  intentProfileKey,
  issueIntentContract,
  type IntentContract,
  type IntentAssertion,
  type IntentEvidence,
  type IntentEvidenceSource,
  type IntentEvaluationReceipt,
  type IntentFilter,
  type IntentPredicate,
  type IntentProfile,
  type IntentProfileIssuanceInput,
} from "../../packages/guard/src/intent.ts";
import {
  IntentObservationVerificationError,
  verifiedIntentObservationFinding,
  verifyIntentObservationRequest,
} from "./intent-observation.ts";
import {
  buildBoundaryDecisionBasis,
  validateDecisionBasis,
  type DecisionBasis,
} from "./decision-basis.ts";

type Env = {
  AGENTACTION_CONSOLE_URL?: string;
  AGENTACTION_INVITATION_FROM_EMAIL?: string;
  AGENTID_API_KEY?: string;
  AGENTID_INTERNAL_SERVICE_TOKEN?: string;
  AGENTID_AUDIT_WEBHOOK_TOKEN?: string;
  AGENTID_AUDIT_WEBHOOK_URL?: string;
  AGENTID_DEMO_OIDC_SECRET?: string;
  AGENTID_GITHUB_API_BASE?: string;
  AGENTID_GITHUB_TOKEN?: string;
  AGENTID_MANIFEST_JSON?: string;
  AGENTID_INTENT_OBSERVATION_DEV_UNSIGNED?: string;
  AGENTID_MANIFESTS?: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
  };
  AGENTID_RECEIPT_AUDIENCE?: string;
  AGENTID_RECEIPT_ISSUER?: string;
  AGENTID_RECEIPT_KEY_ID?: string;
  AGENTID_RECEIPT_PRIVATE_JWK?: string;
  AGENTID_RECEIPT_PUBLIC_JWKS?: string;
  INVITATION_EMAIL?: {
    send(message: {
      from: string | { email: string; name?: string };
      to: string | { email: string; name?: string };
      subject: string;
      html?: string;
      text?: string;
    }): Promise<{ messageId?: string }>;
  };
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
  observability?: Record<string, unknown>;
};

type ActivityEvent = {
  schema_version: "agentaction.hermes-observation.v1";
  event_id: string;
  event_type: string;
  observed_at: string;
  source_id: string;
  agent_id: string;
  correlation: Record<string, string>;
  intent: {
    binding_status: "bound" | "unbound";
    intent_id?: string;
    intent_digest?: string;
  };
  tool?: { name: string; action: string };
  evaluation?: {
    status: string;
    counterfactual_decision: "allow" | "deny" | "challenge_required" | null;
    findings: string[];
  };
  execution?: { status: string; duration_ms?: number | null; error_type?: string };
  model?: Record<string, string>;
  request?: Record<string, number | null>;
  usage?: Record<string, number>;
  subagent?: { role: string; status: string; duration_ms?: number };
};

type ActivityBatch = {
  schema_version: "agentaction.observation-batch.v1";
  batch_id: string;
  tenant_id: string;
  source_id: string;
  sent_at: string;
  events: ActivityEvent[];
};

type ActivityJobLifecycle = {
  schema_version: "agentaction.activity-job.v1";
  phase: "started" | "completed";
  tenant_id: string;
  source_id: string;
  agent_id: string;
  session_id: string;
  task_id?: string;
  turn_id?: string;
  started_at: string;
  completed_at?: string;
  status?: "completed" | "interrupted" | "incomplete" | "error";
  declared_intent?: AgentDeclaredIntent;
  reported_outcome?: AgentReportedOutcome;
  model_usage?: ModelUsageSummary;
};

type ModelUsageGroup = {
  provider?: string;
  model?: string;
  request_count: number;
  requests_with_usage: number;
  input_tokens?: number;
  uncached_input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

type ModelUsageSummary = {
  request_count: number;
  requests_with_model: number;
  requests_with_usage: number;
  input_tokens?: number;
  uncached_input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  requests_truncated?: true;
  models_truncated?: true;
  models?: ModelUsageGroup[];
};

type AgentDeclaredIntent = {
  schema_version: "agentaction.declared-intent.v1";
  goal: string;
  success_criteria: string[];
  constraints: string[];
  confidence: number;
};

type AgentReportedOutcome = {
  schema_version: "agentaction.reported-outcome.v1";
  status: "achieved" | "partial" | "failed" | "unknown";
  success_criteria_met: "all" | "some" | "none" | "unknown";
  constraints_respected: "pass" | "fail" | "unknown";
  confidence: number;
  criterion_evidence?: SelfAttestedCriterionEvidenceReport;
};

type SelfAttestedCriterionEvidence = {
  criterion_id: string;
  status: "pass" | "fail" | "insufficient_evidence";
  evidence_refs: string[];
};

type SelfAttestedCriterionEvidenceReport = {
  schema_version: "agentaction.refund-triage-criterion-evidence.v1";
  eval_id: "refund_triage";
  eval_version: "v2";
  job_id: string;
  trust: "agent_self_attested";
  criteria: SelfAttestedCriterionEvidence[];
};

type AgentDeclaredIntentContext = {
  kind: "agent_declared";
  trust: "self_attested";
  goal: string;
  success_criteria: string[];
  constraints: string[];
  declaration_confidence: number;
  reported_outcome?: Omit<AgentReportedOutcome, "schema_version">;
};

type EvalKind = "agent_declared" | "observed_execution";
type EvalCriterion = {
  criterion_id: string;
  label: string;
  description: string;
  category: "outcome" | "constraint";
  required: boolean;
  source: IntentEvidenceSource;
  where?: IntentFilter[];
  assertion: IntentAssertion;
};
type DeterministicEvalSpecification = {
  schema_version: "agentaction.deterministic-eval-specification.v1";
  pass_threshold: number;
  required_evidence: IntentEvidenceSource[];
  criteria: EvalCriterion[];
};
type EvalDefinition = {
  schema_version: "agentaction.eval-definition.v1";
  eval_id: string;
  version: string;
  name: string;
  description: string;
  kind: EvalKind;
  trust: "agent_self_attested" | "trusted_execution_state";
  profile_key: string;
  profile_digest: string;
  issued_at: string;
  created_at: string;
  created_by: string;
  specification?: DeterministicEvalSpecification;
  specification_digest?: string;
  built_in?: true;
};
type EvalAssignment = {
  schema_version: "agentaction.eval-assignment.v1";
  assignment_id: string;
  source_id?: string;
  agent_id?: string;
  eval_id: string;
  eval_version: string;
  created_at: string;
  created_by: string;
  replaced_assignment_id?: string;
};
type EvalBinding = {
  schema_version: "agentaction.eval-binding.v1";
  eval_id: string;
  version: string;
  kind: EvalKind;
  trust: EvalDefinition["trust"];
  profile_key: string;
  profile_digest: string;
  assignment_id: string;
  specification_digest?: string;
  pass_threshold?: number;
  required_criteria?: string[];
};

type DeterministicCriterionResult = {
  criterion_id: string;
  label: string;
  description: string;
  category: "outcome" | "constraint";
  required: boolean;
  source: IntentEvidenceSource;
  status: "pass" | "fail" | "insufficient_evidence";
  explanation: string;
  evidence_refs: string[];
  evidence_trust?: "agent_self_attested";
};

type DeterministicEvalResult = {
  schema_version: "agentaction.deterministic-eval-result.v1";
  aggregate_status: "pass" | "fail" | "insufficient_evidence";
  pass_rate: number;
  pass_threshold: number;
  required_criteria: string[];
  criteria: DeterministicCriterionResult[];
  provenance: {
    evaluator: "agentaction.deterministic";
    evaluator_version: "v1";
    eval_id: string;
    eval_version: string;
    specification_digest: string;
    profile_digest: string;
    assignment_id: string;
    evidence_digest: string;
    evaluated_at: string;
    trust: "agent_self_attested" | "trusted_execution_state";
  };
};

type StoredActivityEvent = { digest: string; event: ActivityEvent };

type ToolEvent = Record<string, unknown>;
type AuthContext = {
  method: "api_key" | "internal_service" | "oidc" | "none";
  subject?: string;
  tenant_id?: string;
  user_id?: string;
  agent_id?: string;
  scopes?: string[];
  issuer?: string;
};
type TenantRole = "owner" | "operator" | "viewer";
type ControlIdentity = {
  subject: string;
  email?: string;
  issuer: string;
  claimed_tenant_id?: string;
  claimed_role?: TenantRole;
};
type TenantRecord = {
  schema_version: "agentaction.tenant.v1";
  tenant_id: string;
  display_name: string;
  created_at: string;
  created_by: string;
};
type TenantMembership = {
  schema_version: "agentaction.tenant-membership.v1";
  tenant_id: string;
  subject: string;
  issuer: string;
  email?: string;
  role: TenantRole;
  created_at: string;
  created_by: string;
  workspace_mode?: "directory";
};
type TenantInvitation = {
  schema_version: "agentaction.tenant-invitation.v1";
  invitation_id: string;
  tenant_id: string;
  email: string;
  role: Exclude<TenantRole, "owner">;
  secret_digest: string;
  created_at: string;
  created_by: string;
  expires_at: string;
  redeemed_at?: string;
  redeemed_by?: string;
};
class TenantManifestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
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
type IntentProfileRecord = {
  schema_version: "agentpass.intent-profile-registry-record.v1";
  profile_key: string;
  profile: string;
  version: string;
  profile_digest: string;
  tenant_id?: string;
  registered_at: string;
  registered_by?: string;
  definition: IntentProfile;
};
type IntentStoredEvidenceSourceName = "decision_events" | "decision_bases" | "execution_receipts" | "observations";
type IntentEvidenceSourceName = IntentStoredEvidenceSourceName | "job";
type IntentEvidenceManifest = Record<IntentEvidenceSourceName, {
  count: number;
  evidence_ids: string[];
  digest: string;
}>;
type IntentEvidenceSnapshot = {
  schema_version: "agentpass.intent-evidence-snapshot.v1" | "agentpass.intent-evidence-snapshot.v2";
  snapshot_id: string;
  tenant_id: string;
  intent_id: string;
  intent_digest: string;
  job_id: string;
  captured_at: string;
  evidence_digest: string;
  sources: Partial<IntentEvidenceManifest>;
  evidence: {
    decision_events: Record<string, unknown>[];
    decision_bases?: Record<string, unknown>[];
    execution_receipts: Record<string, unknown>[];
    observations: Record<string, unknown>[];
    job?: Record<string, unknown>;
  };
};
type HostedIntentEvaluationReceipt = IntentEvaluationReceipt & {
  evaluation_mode: "preview" | "final";
  snapshot_id?: string;
  evidence_digest?: string;
  criterion_evaluation?: DeterministicEvalResult;
};
type IntentFinalizationState = {
  status: "finalizing" | "finalized";
  started_at: string;
  finalized_at?: string;
  pending_job?: Record<string, unknown>;
};
type IntentFinalizationRecord = {
  schema_version: "agentpass.intent-finalization.v1";
  finalized_at: string;
  snapshot: IntentEvidenceSnapshot;
  evaluation: HostedIntentEvaluationReceipt;
};
type IntentQualityRecord = {
  tenant_id: string;
  profile_key: string;
  profile_version: string;
  profile_digest: string;
  intent_id: string;
  intent_digest: string;
  job_id: string;
  agent_ids: string[];
  finalized_at: string;
  evaluation: HostedIntentEvaluationReceipt;
  eval_binding?: EvalBinding;
  intent_context?: AgentDeclaredIntentContext;
  model_usage?: ModelUsageSummary;
};
type IntentQualityFilters = {
  from: string;
  to: string;
  profile_key?: string;
  profile_version?: string;
  agent_id?: string;
  verdict?: IntentEvaluationReceipt["verdict"];
  constraint_compliance?: IntentEvaluationReceipt["constraint_compliance"];
  minimum_sample_size: number;
  limit: number;
  cursor?: string;
};
type IntentQualityJobsFilters = {
  from: string;
  to: string;
  profile_key?: string;
  profile_version?: string;
  agent_id?: string;
  verdict?: IntentEvaluationReceipt["verdict"];
  constraint_compliance?: IntentEvaluationReceipt["constraint_compliance"];
  confidence?: "low" | "medium" | "high";
  job_id?: string;
  intent_id?: string;
  limit: number;
  cursor?: string;
};
type IntentQualityExclusionReason =
  | "not_finalized"
  | "invalid_final_receipt"
  | "unversioned_profile"
  | "outside_time_window"
  | "profile_filter"
  | "agent_filter"
  | "verdict_filter"
  | "constraint_filter";
type IntentQualityJobsExclusionReason =
  | IntentQualityExclusionReason
  | "tenant_mismatch"
  | "confidence_filter"
  | "job_filter"
  | "intent_filter";
type IntentBindingResult = {
  status: "unbound" | "bound";
  contract?: IntentContract;
  error_code?: string;
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
  errorCode?: string;
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

      if (route.endpoint === "control-plane") {
        const controlAuthentication = await authenticate(request, env, SAMPLE_MANIFEST, null, "control-plane");
        if (!controlAuthentication.ok || controlAuthentication.context.method !== "internal_service") {
          return json({ error: "control plane requires the internal console service credential" }, 403);
        }
        const identity = controlIdentity(request);
        return await handleControlPlane(request, env, identity);
      }

      const manifest = await loadManifest(env, route.tenantId);
      const isActivityIngestion = request.method === "POST" &&
        route.endpoint === "activity" && route.resourceId === "batches" && !route.action;
      const isActivityJobLifecycle = request.method === "POST" &&
        route.endpoint === "activity" && route.resourceId === "jobs" && !route.action;
      if (isActivityIngestion || isActivityJobLifecycle) {
        if (!route.tenantId) return json({ error: "activity ingestion requires a tenant route" }, 400);
        const sourceAuthentication = await authenticateActivitySource(request, manifest);
        if (!sourceAuthentication.ok) {
          return json({ error: sourceAuthentication.error }, sourceAuthentication.status);
        }
        if (isActivityJobLifecycle) {
          const submitted = await readBoundedActivityJob(request);
          const lifecycle = validateActivityJob(
            submitted,
            route.tenantId,
            sourceAuthentication.sourceId,
            sourceAuthentication.agentIds,
          );
          const result = await storeActivityJob(env, manifest, lifecycle);
          if (result.response.ok) {
            ctx.waitUntil(
              emitAudit(env, {
                type: lifecycle.phase === "started"
                  ? "agentaction.activity.job.started"
                  : "agentaction.activity.job.finalized",
                tenant_id: lifecycle.tenant_id,
                source_id: lifecycle.source_id,
                agent_id: lifecycle.agent_id,
                session_id: lifecycle.session_id,
                job_id: stringValue(result.body.job_id),
                intent_id: stringValue(result.body.intent_id),
                replayed: result.body.replayed === true,
                auth: { method: "activity_source" },
              }),
            );
          }
          return json(result.body, result.response.status);
        }
        const submitted = await readBoundedActivityBatch(request);
        const batch = validateActivityBatch(
          submitted,
          route.tenantId,
          sourceAuthentication.sourceId,
          sourceAuthentication.agentIds,
        );
        const stored = await authorizationStore(env, route.tenantId, manifest).fetch(
          new Request("https://agentid.local/activity/batches", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(batch),
          }),
        );
        return json(await stored.json(), stored.status);
      }
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
        body.tenant_id = route.tenantId;
        body.auth = auth.context;
        return json(body, stored.status);
      }

      if (request.method === "GET" && route.endpoint === "activity" && route.resourceId === "events" && !route.action) {
        const invalidQuery = [...url.searchParams.keys()].find((key) => !ACTIVITY_QUERY_FIELDS.has(key));
        if (invalidQuery) return json({ error: `unsupported activity query parameter: ${invalidQuery}` }, 400);
        const search = new URLSearchParams(url.searchParams);
        const stored = await authorizationStore(env, route.tenantId, manifest).fetch(
          new Request(`https://agentid.local/activity/events?${search.toString()}`),
        );
        const body = await stored.json() as Record<string, unknown>;
        body.tenant_id = route.tenantId;
        body.auth = auth.context;
        return json(body, stored.status);
      }

      if (
        request.method === "GET" &&
        route.endpoint === "intent-quality" &&
        (route.resourceId === "rollups" || route.resourceId === "jobs") &&
        !route.action
      ) {
        const search = new URLSearchParams(url.searchParams);
        search.set("tenant_id", route.tenantId || "default");
        const stored = await authorizationStore(env, route.tenantId, manifest).fetch(
          new Request(`https://agentid.local/intent-quality/${route.resourceId}?${search.toString()}`),
        );
        const body = await stored.json() as Record<string, unknown>;
        body.auth = auth.context;
        return json(body, stored.status);
      }
      if (
        request.method === "GET" &&
        route.endpoint === "intent-quality" &&
        route.resourceId === "jobs" &&
        route.action
      ) {
        if ([...url.searchParams.keys()].length > 0) {
          return json({
            error: "intent quality job detail does not accept query parameters",
            error_code: "intent_quality_job_detail_query_not_allowed",
          }, 400);
        }
        const stored = await authorizationStore(env, route.tenantId, manifest).fetch(
          new Request(
            `https://agentid.local/intent-quality/jobs/${encodeURIComponent(route.action)}?tenant_id=${encodeURIComponent(route.tenantId || "default")}`,
          ),
        );
        const body = await stored.json() as Record<string, unknown>;
        body.auth = auth.context;
        return json(body, stored.status);
      }

      if (request.method === "POST" && route.endpoint === "intent-profiles" && !route.resourceId) {
        const submitted = await readJson(request) as IntentProfile;
        let profile: IntentProfile;
        try {
          const submittedDigest = optionalString(submitted.profile_digest);
          const computedDigest = digestIntentProfile(submitted);
          if (submittedDigest && submittedDigest !== computedDigest) {
            return json({ error: "intent profile digest does not match profile contents", error_code: "intent_profile_digest_mismatch" }, 400);
          }
          profile = bindIntentProfile(submitted);
        } catch (error) {
          return json({ error: (error as Error).message, error_code: "intent_profile_invalid" }, 400);
        }
        const trustFinding = intentProfileTrustFinding(manifest, profile);
        if (trustFinding) {
          return json({ error: trustFinding, error_code: "profile_trust_requirement_unsatisfied" }, 409);
        }
        const stored = await authorizationStore(env, route.tenantId, manifest).fetch(
          new Request("https://agentid.local/intent-profiles", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              profile,
              tenant_id: route.tenantId,
              registered_by: auth.context.subject || auth.context.user_id || auth.context.agent_id || auth.context.method,
            }),
          }),
        );
        const body = await stored.json() as Record<string, unknown>;
        if (stored.ok) {
          ctx.waitUntil(
            emitAudit(env, {
              type: stored.status === 201
                ? "agentpass.intent.profile.registered"
                : "agentpass.intent.profile.replayed",
              tenant_id: route.tenantId,
              profile_key: stringValue(body.profile_key),
              profile_digest: stringValue(body.profile_digest),
              auth: auth.context,
            }),
          );
        }
        body.auth = auth.context;
        return json(body, stored.status);
      }

      if (request.method === "GET" && route.endpoint === "intent-profiles" && !route.resourceId) {
        const stored = await authorizationStore(env, route.tenantId, manifest).fetch(
          new Request("https://agentid.local/intent-profiles"),
        );
        const body = await stored.json() as Record<string, unknown>;
        body.auth = auth.context;
        return json(body, stored.status);
      }

      if (request.method === "GET" && route.endpoint === "intent-profiles" && route.resourceId && !route.action) {
        const stored = await authorizationStore(env, route.tenantId, manifest).fetch(
          new Request(`https://agentid.local/intent-profiles/${encodeURIComponent(route.resourceId)}`),
        );
        const body = await stored.json() as Record<string, unknown>;
        body.auth = auth.context;
        return json(body, stored.status);
      }

      if (
        request.method === "POST" &&
        route.endpoint === "intent-profiles" &&
        route.resourceId &&
        route.action === "issue"
      ) {
        const issuance = await readJson(request);
        const store = authorizationStore(env, route.tenantId, manifest);
        const registered = await store.fetch(
          new Request(`https://agentid.local/intent-profiles/${encodeURIComponent(route.resourceId)}`),
        );
        if (!registered.ok) {
          const body = await registered.json() as Record<string, unknown>;
          body.auth = auth.context;
          return json(body, registered.status);
        }
        const registeredBody = await registered.json() as Record<string, unknown>;
        const trustFinding = intentProfileTrustFinding(manifest, recordValue(registeredBody.definition) as IntentProfile);
        if (trustFinding) {
          return json({ error: trustFinding, error_code: "profile_trust_requirement_unsatisfied", auth: auth.context }, 409);
        }
        const stored = await store.fetch(
          new Request(`https://agentid.local/intent-profiles/${encodeURIComponent(route.resourceId)}/issue`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              issuance,
              tenant_id: route.tenantId,
              registered_by: auth.context.subject || auth.context.user_id || auth.context.agent_id || auth.context.method,
            }),
          }),
        );
        const body = await stored.json() as Record<string, unknown>;
        if (stored.ok) {
          ctx.waitUntil(
            emitAudit(env, {
              type: stored.status === 201 ? "agentpass.intent.issued" : "agentpass.intent.issuance.replayed",
              tenant_id: route.tenantId,
              profile_key: route.resourceId,
              profile_digest: stringValue(body.profile_digest),
              intent_id: stringValue(body.intent_id),
              intent_digest: stringValue(body.intent_digest),
              job_id: stringValue(body.job_id),
              auth: auth.context,
            }),
          );
        }
        body.auth = auth.context;
        return json(body, stored.status);
      }

      if (request.method === "POST" && route.endpoint === "intent-contracts" && !route.resourceId) {
        if (intentContractIssuanceMode(manifest) === "registered_profile_required") {
          return json({
            error: "tenant policy requires contracts issued from a registered intent profile",
            error_code: "registered_profile_required",
          }, 409);
        }
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
        request.method === "GET" &&
        route.endpoint === "intent-contracts" &&
        route.resourceId &&
        route.action === "evaluations"
      ) {
        const search = new URLSearchParams(url.searchParams);
        const stored = await authorizationStore(env, route.tenantId, manifest).fetch(
          new Request(
            `https://agentid.local/intent-contracts/${encodeURIComponent(route.resourceId)}/evaluations?${search.toString()}`,
          ),
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
              type: body.error_code === "intent_evidence_finalized"
                ? "agentpass.intent.evidence.rejected"
                : "agentpass.intent.observation.rejected",
              tenant_id: route.tenantId,
              intent_id: route.resourceId,
              evidence_source: "observations",
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
        (route.action === "evaluate" || route.action === "finalize")
      ) {
        const evaluationRequest = await readJson(request);
        const stored = await authorizationStore(env, route.tenantId, manifest).fetch(
          new Request(`https://agentid.local/intent-contracts/${encodeURIComponent(route.resourceId)}/${route.action}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(evaluationRequest),
          }),
        );
        const body = await stored.json() as Record<string, unknown>;
        if (stored.ok) {
          const evaluation = route.action === "finalize" ? recordValue(body.evaluation) : body;
          const snapshot = route.action === "finalize" ? recordValue(body.snapshot) : {};
          ctx.waitUntil(
            emitAudit(env, {
              type: route.action === "finalize"
                ? body.replayed === true
                  ? "agentpass.intent.finalization.replayed"
                  : "agentpass.intent.finalized"
                : "agentpass.intent.evaluation.previewed",
              tenant_id: route.tenantId,
              intent_id: stringValue(evaluation.intent_id),
              intent_digest: stringValue(evaluation.intent_digest),
              job_id: stringValue(evaluation.job_id),
              evaluation_id: stringValue(evaluation.evaluation_id),
              evaluation_mode: route.action === "finalize" ? "final" : "preview",
              snapshot_id: stringValue(snapshot.snapshot_id),
              evidence_digest: stringValue(snapshot.evidence_digest),
              evidence_counts: recordValue(snapshot.sources),
              verdict: stringValue(evaluation.verdict),
              qualified_success: evaluation.qualified_success === true,
              auth: auth.context,
            }),
          );
        } else if (body.error_code === "intent_evidence_finalized") {
          ctx.waitUntil(
            emitAudit(env, {
              type: "agentpass.intent.evidence.rejected",
              tenant_id: route.tenantId,
              intent_id: route.resourceId,
              evidence_source: "job",
              error_code: body.error_code,
              error: stringValue(body.error),
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
        if (decision.errorCode === "intent_evidence_finalized") {
          ctx.waitUntil(
            emitAudit(env, {
              type: "agentpass.intent.evidence.rejected",
              tenant_id: route.tenantId,
              intent_id: stringValue(decision.event.intent_id),
              intent_digest: stringValue(decision.event.intent_digest),
              evidence_source: "decision_events",
              error_code: decision.errorCode,
              error: decision.findings[0],
              auth: auth.context,
            }),
          );
        }
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
            error_code: decision.errorCode,
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
            error_code: decision.errorCode,
            auth: auth.context,
          },
          decision.allow ? 200 : 403,
        );
      }

      if (request.method === "POST" && route.endpoint === "github-actions" && route.resourceId === "dispatch") {
        const payload = await readJson(request);
        const decision = await authorize(manifest, payload, env, route.tenantId);
        await recordIntentDecisionEvidence(env, route.tenantId, manifest, decision);
        if (decision.errorCode === "intent_evidence_finalized") {
          ctx.waitUntil(
            emitAudit(env, {
              type: "agentpass.intent.evidence.rejected",
              tenant_id: route.tenantId,
              intent_id: stringValue(decision.event.intent_id),
              intent_digest: stringValue(decision.event.intent_digest),
              evidence_source: "decision_events",
              error_code: decision.errorCode,
              error: decision.findings[0],
              auth: auth.context,
            }),
          );
        }
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
              error_code: decision.errorCode,
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
          return json({
            error: intentBinding.findings[0],
            error_code: intentBinding.errorCode,
            findings: intentBinding.findings,
            auth: auth.context,
          }, intentBinding.errorCode === "intent_evidence_finalized" ? 409 : 400);
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
          if (intentBinding.errorCode === "intent_evidence_finalized") {
            ctx.waitUntil(
              emitAudit(env, {
                type: "agentpass.intent.evidence.rejected",
                tenant_id: route.tenantId,
                intent_id: stringValue(event.intent_id),
                intent_digest: stringValue(event.intent_digest),
                evidence_source: "execution_receipts",
                error_code: intentBinding.errorCode,
                error: intentBinding.findings[0],
                auth: auth.context,
              }),
            );
          }
          return json({
            error: intentBinding.findings[0],
            error_code: intentBinding.errorCode,
            findings: intentBinding.findings,
            auth: auth.context,
          }, intentBinding.errorCode === "intent_evidence_finalized" ? 409 : 400);
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
          return json({
            error: intentBinding.findings[0],
            error_code: intentBinding.errorCode,
            findings: intentBinding.findings,
            auth: auth.context,
          }, intentBinding.errorCode === "intent_evidence_finalized" ? 409 : 400);
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
      return json({ error: (error as Error).message }, error instanceof TenantManifestError ? error.status : 400);
    }
  },
};

export class AgentIdJitGrants {
  state: {
    storage: {
      get<T = unknown>(key: string): Promise<T | undefined>;
      get<T = unknown>(keys: string[]): Promise<Map<string, T>>;
      list<T = unknown>(options?: { prefix?: string }): Promise<Map<string, T>>;
      put<T = unknown>(key: string, value: T): Promise<void>;
      put(entries: Record<string, unknown>): Promise<void>;
      delete(key: string): Promise<boolean>;
    };
  };
  private intentFinalizationQueues = new Map<string, Promise<void>>();

  constructor(state: AgentIdJitGrants["state"]) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const payload = request.method === "GET" ? {} : await readJson(request);

    if (url.pathname.startsWith("/directory/")) {
      return this.directoryRequest(request.method, url.pathname, recordValue(payload));
    }

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

    if (request.method === "POST" && url.pathname === "/activity/batches") {
      const batch = payload as ActivityBatch;
      const records: Array<{ key: string; digest: string; event: ActivityEvent }> = [];
      let duplicates = 0;
      for (const event of batch.events) {
        const key = `activity:event:${event.event_id}`;
        const digest = await canonicalDigest(event);
        const existing = await this.state.storage.get<StoredActivityEvent>(key);
        if (existing) {
          if (existing.digest !== digest) {
            return json({
              error: `activity event ID conflicts with stored content: ${event.event_id}`,
              error_code: "activity_event_conflict",
            }, 409);
          }
          duplicates += 1;
          continue;
        }
        records.push({ key, digest, event });
      }
      const priorIndex = await this.state.storage.get<string[]>("activity:index") || [];
      const newIds = records.map(({ event }) => event.event_id);
      const nextIndex = [...newIds.reverse(), ...priorIndex.filter((id) => !newIds.includes(id))].slice(0, 2_000);
      for (const record of records) {
        await this.state.storage.put(record.key, { digest: record.digest, event: record.event } satisfies StoredActivityEvent);
      }
      await this.state.storage.put("activity:index", nextIndex);
      const expired = priorIndex.filter((id) => !nextIndex.includes(id));
      for (const id of expired) await this.state.storage.delete(`activity:event:${id}`);
      return json({
        schema_version: "agentaction.activity-ingest-result.v1",
        batch_id: batch.batch_id,
        accepted: records.length,
        duplicates,
      }, 202);
    }

    if (request.method === "GET" && url.pathname === "/activity/events") {
      return this.activityEvents(url);
    }

    if (request.method === "GET" && url.pathname === "/evals") {
      return this.evalConfiguration();
    }
    if (request.method === "POST" && url.pathname === "/evals") {
      return this.createEvalDefinition(recordValue(payload));
    }
    if (request.method === "POST" && url.pathname === "/eval-assignments/resolve") {
      return this.resolveEvalAssignment(recordValue(payload));
    }
    if (request.method === "POST" && url.pathname === "/eval-assignments") {
      return this.createEvalAssignment(recordValue(payload));
    }

    if (request.method === "GET" && url.pathname === "/intent-quality/rollups") {
      return this.intentQualityRollups(url);
    }
    if (request.method === "GET" && url.pathname === "/intent-quality/jobs") {
      return this.intentQualityJobs(url);
    }
    if (request.method === "GET" && url.pathname.startsWith("/intent-quality/jobs/")) {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length !== 3) return json({ error: "not found" }, 404);
      let jobId = "";
      try {
        jobId = decodeURIComponent(parts[2]);
      } catch {
        return json({ error: "intent quality job ID is invalid", error_code: "intent_quality_job_id_invalid" }, 400);
      }
      return this.intentQualityJobDetail(jobId, url);
    }

    if (request.method === "POST" && url.pathname === "/intent-profiles") {
      try {
        const submitted = recordValue(payload.profile) as IntentProfile;
        const submittedDigest = optionalString(submitted.profile_digest);
        const computedDigest = digestIntentProfile(submitted);
        if (submittedDigest && submittedDigest !== computedDigest) {
          return json({ error: "intent profile digest does not match profile contents", error_code: "intent_profile_digest_mismatch" }, 400);
        }
        const profile = bindIntentProfile(submitted);
        const profileKey = intentProfileKey(profile);
        const existing = await this.state.storage.get<IntentProfileRecord>(`intent-profile:${profileKey}`);
        if (existing) {
          if (existing.profile_digest !== profile.profile_digest) {
            return json({ error: `intent profile version is frozen: ${profileKey}`, error_code: "intent_profile_frozen" }, 409);
          }
          return json(intentProfileResponse(existing));
        }
        const record: IntentProfileRecord = {
          schema_version: "agentpass.intent-profile-registry-record.v1",
          profile_key: profileKey,
          profile: profile.profile,
          version: profile.version,
          profile_digest: stringValue(profile.profile_digest),
          tenant_id: optionalString(payload.tenant_id),
          registered_at: new Date().toISOString(),
          registered_by: optionalString(payload.registered_by),
          definition: profile,
        };
        const index = await this.state.storage.get<string[]>("intent-profile:index") || [];
        const next = [profileKey, ...index.filter((key) => key !== profileKey)].slice(0, 1_000);
        await this.state.storage.put(`intent-profile:${profileKey}`, record);
        await this.state.storage.put("intent-profile:index", next);
        return json(intentProfileResponse(record), 201);
      } catch (error) {
        return json({ error: (error as Error).message, error_code: "intent_profile_invalid" }, 400);
      }
    }

    if (request.method === "GET" && url.pathname === "/intent-profiles") {
      const index = await this.state.storage.get<string[]>("intent-profile:index") || [];
      const profiles: Record<string, unknown>[] = [];
      for (const profileKey of index) {
        const record = await this.state.storage.get<IntentProfileRecord>(`intent-profile:${profileKey}`);
        if (record) profiles.push(intentProfileResponse(record));
      }
      return json({ intent_profiles: profiles, count: profiles.length });
    }

    if (url.pathname.startsWith("/intent-profiles/")) {
      const parts = url.pathname.split("/").filter(Boolean);
      const profileKey = decodeURIComponent(parts[1]);
      const record = await this.state.storage.get<IntentProfileRecord>(`intent-profile:${profileKey}`);
      if (!record) return json({ error: `intent profile not found: ${profileKey}`, error_code: "intent_profile_not_found" }, 404);
      if (request.method === "GET" && parts.length === 2) return json(intentProfileResponse(record));
      if (request.method === "POST" && parts.length === 3 && parts[2] === "issue") {
        if (Date.parse(record.definition.issued_at) > Date.now()) {
          return json({ error: `intent profile is not active yet: ${profileKey}`, error_code: "intent_profile_not_active" }, 409);
        }
        try {
          const issuance = recordValue(payload.issuance) as IntentProfileIssuanceInput;
          const contract = issueIntentContract(record.definition, issuance);
          const existing = await this.state.storage.get<IntentContractRecord>(`intent:${contract.intent_id}:contract`);
          if (existing) {
            if (existing.intent_digest !== contract.intent_digest) {
              return json({ error: `intent contract is frozen: ${contract.intent_id}`, error_code: "intent_contract_frozen" }, 409);
            }
            return json(intentContractResponse(existing));
          }
          const contractRecord: IntentContractRecord = {
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
          const next = [contractRecord.intent_id, ...index.filter((id) => id !== contractRecord.intent_id)].slice(0, 1_000);
          await this.state.storage.put(`intent:${contractRecord.intent_id}:contract`, contractRecord);
          await this.state.storage.put("intent:index", next);
          return json(intentContractResponse(contractRecord), 201);
        } catch (error) {
          return json({ error: (error as Error).message, error_code: "intent_profile_issuance_invalid" }, 400);
        }
      }
      return json({ error: "not found" }, 404);
    }

    if (request.method === "POST" && url.pathname === "/intent-contracts") {
      try {
        const submitted = recordValue(payload.contract) as IntentContract;
        if (submitted.profile_version || submitted.profile_digest || submitted.profile_variables !== undefined) {
          return json({
            error: "profile-bound intent contracts must use the registered profile issuance endpoint",
            error_code: "profile_issuance_endpoint_required",
          }, 409);
        }
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
      if (resolved.error) {
        return json({ error: resolved.error, error_code: resolved.errorCode, findings: [resolved.error] }, resolved.httpStatus);
      }
      if (!resolved.record) return json({ status: "unbound" } satisfies IntentBindingResult);
      return json({ status: "bound", contract: resolved.record.contract } satisfies IntentBindingResult);
    }

    if (request.method === "POST" && url.pathname === "/intent-evidence/decision-events") {
      const event = recordValue(payload.event);
      const basis = recordValue(payload.basis);
      const appended = await this.appendIntentDecisionEvidence(event, basis);
      if (appended.error) {
        return json({ error: appended.error, error_code: appended.errorCode }, appended.httpStatus);
      }
      return json({ event: appended.event, basis: appended.basis, replayed: appended.replayed === true }, appended.httpStatus);
    }

    if (request.method === "GET" && url.pathname.startsWith("/intent-contracts/")) {
      const parts = url.pathname.split("/").filter(Boolean);
      const intentId = decodeURIComponent(parts[1]);
      const record = await this.state.storage.get<IntentContractRecord>(`intent:${intentId}:contract`);
      if (!record) return json({ error: `intent contract not found: ${intentId}` }, 404);
      if (parts.length === 3 && parts[2] === "evaluations") {
        return this.intentEvaluationHistory(intentId, record, url);
      }
      if (parts.length !== 2) return json({ error: "not found" }, 404);
      return json(intentContractResponse(record));
    }

    if (request.method === "POST" && url.pathname.startsWith("/intent-contracts/")) {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length !== 3 || !["observations", "evaluate", "finalize"].includes(parts[2])) {
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

      if (parts[2] === "finalize") return this.finalizeIntentEvaluation(intentId, registered, payload);
      return this.previewIntentEvaluation(intentId, registered, payload);
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

  async evalConfiguration(): Promise<Response> {
    const storedKeys = await this.state.storage.get<string[]>("eval:index") || [];
    const definitions = [...BUILTIN_EVAL_DEFINITIONS];
    for (const key of storedKeys) {
      const definition = await this.state.storage.get<EvalDefinition>(`eval:${key}`);
      if (definition) definitions.push(definition);
    }
    const assignmentKeys = await this.state.storage.get<string[]>("eval-assignment:index") || [];
    const assignments: EvalAssignment[] = [];
    for (const key of assignmentKeys) {
      const assignment = await this.state.storage.get<EvalAssignment>(`eval-assignment:${key}`);
      if (assignment) assignments.push(assignment);
    }
    assignments.sort((left, right) => right.created_at.localeCompare(left.created_at));
    const traffic = await this.knownEvalTraffic();
    return json({
      schema_version: "agentaction.eval-configuration.v1",
      definitions,
      assignments,
      known_traffic: traffic.records,
      ...(traffic.truncated ? { known_traffic_truncated: true } : {}),
    });
  }

  async knownEvalTraffic(): Promise<{
    records: Array<{
      source_id: string;
      agent_id: string;
      observed_kinds: EvalKind[];
      last_observed_at: string;
    }>;
    truncated: boolean;
  }> {
    const intentIds = await this.state.storage.get<string[]>("intent:index") || [];
    const limited = intentIds.slice(0, 200);
    const grouped = new Map<string, {
      source_id: string;
      agent_id: string;
      observed_kinds: Set<EvalKind>;
      last_observed_at: string;
    }>();
    for (const intentId of limited) {
      const finalization = await this.state.storage.get<IntentFinalizationRecord>(`intent:${intentId}:finalization`);
      const job = recordValue(finalization?.snapshot?.evidence?.job);
      const sourceId = optionalString(job.source_id);
      const agentId = optionalString(job.agent_id);
      if (!sourceId || !agentId || !ACTIVITY_ID.test(sourceId) || !ACTIVITY_ID.test(agentId)) continue;
      const kind: EvalKind = Object.keys(recordValue(job.declared_intent)).length > 0
        ? "agent_declared"
        : "observed_execution";
      const observedAt = intentQualityTimestamp(job.completed_at)
        || intentQualityTimestamp(job.started_at)
        || intentQualityTimestamp(finalization?.finalized_at);
      if (!observedAt) continue;
      const key = `${sourceId}\u0000${agentId}`;
      const existing = grouped.get(key) || {
        source_id: sourceId,
        agent_id: agentId,
        observed_kinds: new Set<EvalKind>(),
        last_observed_at: observedAt,
      };
      existing.observed_kinds.add(kind);
      if (observedAt > existing.last_observed_at) existing.last_observed_at = observedAt;
      grouped.set(key, existing);
    }
    const records = [...grouped.values()]
      .map((record) => ({
        source_id: record.source_id,
        agent_id: record.agent_id,
        observed_kinds: [...record.observed_kinds].sort(),
        last_observed_at: record.last_observed_at,
      }))
      .sort((left, right) => (
        right.last_observed_at.localeCompare(left.last_observed_at) ||
        left.source_id.localeCompare(right.source_id) ||
        left.agent_id.localeCompare(right.agent_id)
      ));
    return { records, truncated: intentIds.length > limited.length };
  }

  async createEvalDefinition(payload: Record<string, unknown>): Promise<Response> {
    const evalId = requiredEvalId(payload.eval_id, "eval_id");
    const version = requiredEvalVersion(payload.version, "version");
    const name = requiredActivityText(payload.name, "eval name", 120);
    const description = requiredActivityText(payload.description, "eval description", 500);
    const kind = requiredEvalKind(payload.kind);
    const specification = payload.specification === undefined
      ? undefined
      : requiredEvalSpecification(payload.specification, kind);
    const specificationDigest = specification ? await canonicalDigest(specification) : undefined;
    const createdBy = requiredActivityText(payload.created_by, "eval created_by", 256);
    const key = `${evalId}.${version}`;
    const builtIn = BUILTIN_EVAL_DEFINITIONS.find((definition) => definition.profile_key === key);
    if (builtIn) return json({ error: `built-in eval version is frozen: ${key}`, error_code: "eval_definition_frozen" }, 409);
    const existing = await this.state.storage.get<EvalDefinition>(`eval:${key}`);
    if (existing) {
      if (
        existing.name !== name ||
        existing.description !== description ||
        existing.kind !== kind ||
        existing.specification_digest !== specificationDigest
      ) {
        return json({ error: `eval version is frozen: ${key}`, error_code: "eval_definition_frozen" }, 409);
      }
      return json({ definition: existing, replayed: true });
    }
    const storedKeys = await this.state.storage.get<string[]>("eval:index") || [];
    if (storedKeys.length >= 500) {
      return json({ error: "workspace eval definition limit reached", error_code: "eval_definition_limit" }, 409);
    }
    const createdAt = new Date().toISOString();
    const definition = evalDefinition({
      eval_id: evalId,
      version,
      name,
      description,
      kind,
      ...(specification && specificationDigest ? { specification, specification_digest: specificationDigest } : {}),
      issued_at: createdAt,
      created_at: createdAt,
      created_by: createdBy,
    });
    const next = [key, ...storedKeysWithout(storedKeys, key)];
    await this.state.storage.put({ [`eval:${key}`]: definition, "eval:index": next });
    return json({ definition, replayed: false }, 201);
  }

  async createEvalAssignment(payload: Record<string, unknown>): Promise<Response> {
    const sourceId = payload.source_id === undefined ? undefined : evalSelectorId(payload.source_id, "eval assignment source_id");
    const agentId = payload.agent_id === undefined ? undefined : evalSelectorId(payload.agent_id, "eval assignment agent_id");
    const evalId = requiredEvalId(payload.eval_id, "eval_id");
    const evalVersion = requiredEvalVersion(payload.eval_version, "eval_version");
    const createdBy = requiredActivityText(payload.created_by, "eval assignment created_by", 256);
    const definition = await this.findEvalDefinition(evalId, evalVersion);
    if (!definition) return json({ error: `eval not found: ${evalId}.${evalVersion}`, error_code: "eval_definition_not_found" }, 404);
    const selectorKey = await evalAssignmentSelectorKey(sourceId, agentId);
    const assignmentIndex = await this.state.storage.get<string[]>("eval-assignment:index") || [];
    const traffic = await this.knownEvalTraffic();
    let incompatible: (typeof traffic.records)[number] | undefined;
    for (const record of traffic.records) {
      const winner = await this.effectiveEvalAssignment(record.source_id, record.agent_id, selectorKey);
      if (winner.pending && record.observed_kinds.some((kind) => kind !== definition.kind)) {
        incompatible = record;
        break;
      }
    }
    if (incompatible) {
      return json({
        error: `eval ${definition.profile_key} is incompatible with observed ${incompatible.observed_kinds.join(" and ")} traffic`,
        error_code: "eval_assignment_incompatible",
        source_id: incompatible.source_id,
        agent_id: incompatible.agent_id,
        observed_kinds: incompatible.observed_kinds,
        eval_kind: definition.kind,
      }, 409);
    }
    const existing = await this.state.storage.get<EvalAssignment>(`eval-assignment:${selectorKey}`);
    if (existing?.eval_id === evalId && existing.eval_version === evalVersion) {
      return json({ assignment: existing, replayed: true });
    }
    const assignment: EvalAssignment = {
      schema_version: "agentaction.eval-assignment.v1",
      assignment_id: randomIdentifier("evalroute"),
      ...(sourceId ? { source_id: sourceId } : {}),
      ...(agentId ? { agent_id: agentId } : {}),
      eval_id: evalId,
      eval_version: evalVersion,
      created_at: new Date().toISOString(),
      created_by: createdBy,
      ...(existing ? { replaced_assignment_id: existing.assignment_id } : {}),
    };
    if (!existing && assignmentIndex.length >= 500) {
      return json({ error: "workspace eval assignment limit reached", error_code: "eval_assignment_limit" }, 409);
    }
    const next = [selectorKey, ...assignmentIndex.filter((key) => key !== selectorKey)];
    await this.state.storage.put({
      [`eval-assignment:${selectorKey}`]: assignment,
      "eval-assignment:index": next,
    });
    return json({ assignment, replayed: false }, existing ? 200 : 201);
  }

  async resolveEvalAssignment(payload: Record<string, unknown>): Promise<Response> {
    const sourceId = evalSelectorId(payload.source_id, "eval routing source_id");
    const agentId = evalSelectorId(payload.agent_id, "eval routing agent_id");
    if (typeof payload.has_declared_intent !== "boolean") throw new Error("eval routing has_declared_intent is required");
    const assignment = (await this.effectiveEvalAssignment(sourceId, agentId)).assignment;
    const expectedKind: EvalKind = payload.has_declared_intent ? "agent_declared" : "observed_execution";
    const definition = assignment
      ? await this.findEvalDefinition(assignment.eval_id, assignment.eval_version)
      : BUILTIN_EVAL_DEFINITIONS.find((candidate) => candidate.kind === expectedKind);
    if (!definition) return json({ error: "assigned eval definition is unavailable", error_code: "eval_definition_not_found" }, 409);
    if (definition.kind !== expectedKind) {
      return json({
        error: `eval ${definition.profile_key} expects ${definition.kind.replace("_", " ")} Jobs`,
        error_code: "eval_assignment_incompatible",
        expected_kind: expectedKind,
      }, 409);
    }
    return json({
      definition,
      assignment: assignment || null,
      assignment_id: assignment?.assignment_id || `implicit_${expectedKind}`,
    });
  }

  async effectiveEvalAssignment(
    sourceId: string,
    agentId: string,
    pendingSelectorKey?: string,
  ): Promise<{ pending: boolean; assignment?: EvalAssignment }> {
    const selectors = [
      await evalAssignmentSelectorKey(sourceId, agentId),
      await evalAssignmentSelectorKey(undefined, agentId),
      await evalAssignmentSelectorKey(sourceId, undefined),
      await evalAssignmentSelectorKey(undefined, undefined),
    ];
    for (const selector of selectors) {
      if (selector === pendingSelectorKey) return { pending: true };
      const assignment = await this.state.storage.get<EvalAssignment>(`eval-assignment:${selector}`);
      if (assignment) return { pending: false, assignment };
    }
    return { pending: false };
  }

  async findEvalDefinition(evalId: string, version: string): Promise<EvalDefinition | undefined> {
    const key = `${evalId}.${version}`;
    return BUILTIN_EVAL_DEFINITIONS.find((definition) => definition.profile_key === key)
      || this.state.storage.get<EvalDefinition>(`eval:${key}`);
  }

  async directoryRequest(method: string, pathname: string, payload: Record<string, unknown>): Promise<Response> {
    if (method === "POST" && pathname === "/directory/session") {
      const identity = directoryIdentity(payload.identity);
      const workspaceMode = await this.directoryWorkspaceMode(identity);
      const memberships = await this.directoryMemberships(identity);
      return json({
        schema_version: "agentaction.tenant-session.v1",
        workspace_mode: workspaceMode,
        claimed_tenant_id: identity.claimed_tenant_id || null,
        memberships,
      });
    }

    if (method === "POST" && pathname === "/directory/authorize") {
      const identity = directoryIdentity(payload.identity);
      const tenantId = directoryId(payload.tenant_id, "tenant_id");
      const minimumRole = directoryRole(payload.minimum_role, "viewer");
      const membership = await this.directoryMembership(identity, tenantId);
      if (!membership || !roleAllows(membership.role, minimumRole)) {
        return json({ error: "tenant membership does not permit this operation", error_code: "tenant_role_forbidden" }, 403);
      }
      return json({ membership });
    }

    if (method === "POST" && pathname === "/directory/tenants") {
      const identity = directoryIdentity(payload.identity);
      if (await this.directoryWorkspaceMode(identity) !== "directory") {
        return json({ error: "signed tenant identity must enable workspace switching first", error_code: "claimed_tenant_fixed" }, 403);
      }
      const existingMemberships = await this.directoryMemberships(identity);
      if (existingMemberships.length > 0 && !existingMemberships.some((entry) => entry.membership.role === "owner")) {
        return json({ error: "only workspace owners can create another workspace", error_code: "workspace_creation_forbidden" }, 403);
      }
      const tenantId = directoryId(payload.tenant_id, "tenant_id");
      const displayName = directoryLabel(payload.display_name, "display_name", 120);
      const existing = await this.state.storage.get<TenantRecord>(`directory:tenant:${tenantId}`);
      if (existing) return json({ error: "tenant ID is already registered", error_code: "tenant_exists" }, 409);
      const createdAt = new Date().toISOString();
      const tenant: TenantRecord = {
        schema_version: "agentaction.tenant.v1",
        tenant_id: tenantId,
        display_name: displayName,
        created_at: createdAt,
        created_by: identity.subject,
      };
      const membership: TenantMembership = {
        schema_version: "agentaction.tenant-membership.v1",
        tenant_id: tenantId,
        subject: identity.subject,
        issuer: identity.issuer,
        ...(identity.email ? { email: identity.email } : {}),
        role: "owner",
        created_at: createdAt,
        created_by: identity.subject,
      };
      await this.state.storage.put(`directory:tenant:${tenantId}`, tenant);
      await this.persistDirectoryMembership(membership);
      return json({ tenant, membership }, 201);
    }

    const migrationMatch = pathname.match(/^\/directory\/tenants\/([^/]+)\/migrate$/);
    if (method === "POST" && migrationMatch) {
      const tenantId = directoryId(decodeURIComponent(migrationMatch[1]), "tenant_id");
      const identity = directoryIdentity(payload.identity);
      if (identity.claimed_tenant_id !== tenantId || identity.claimed_role !== "owner") {
        return json({ error: "only the signed tenant owner can enable workspace switching", error_code: "tenant_role_forbidden" }, 403);
      }
      const displayName = directoryLabel(payload.display_name || tenantId, "display_name", 120);
      const createdAt = new Date().toISOString();
      const existingTenant = await this.state.storage.get<TenantRecord>(`directory:tenant:${tenantId}`);
      const tenant: TenantRecord = existingTenant || {
        schema_version: "agentaction.tenant.v1",
        tenant_id: tenantId,
        display_name: displayName,
        created_at: createdAt,
        created_by: identity.subject,
      };
      const existingMembership = await this.state.storage.get<TenantMembership>(
        await directoryMembershipKey(identity.issuer, identity.subject, tenantId),
      );
      const membership: TenantMembership = {
        schema_version: "agentaction.tenant-membership.v1",
        tenant_id: tenantId,
        subject: identity.subject,
        issuer: identity.issuer,
        ...((identity.email || existingMembership?.email) ? { email: identity.email || existingMembership?.email } : {}),
        role: "owner",
        created_at: existingMembership?.created_at || createdAt,
        created_by: existingMembership?.created_by || "signed-access-owner-migration",
        workspace_mode: "directory",
      };
      if (!existingTenant) await this.state.storage.put(`directory:tenant:${tenantId}`, tenant);
      await this.persistDirectoryMembership(membership);
      const subjectKey = await directorySubjectKey(identity.issuer, identity.subject);
      await this.state.storage.put(`${subjectKey}:workspace-mode`, "directory");
      return json({ tenant, membership, workspace_mode: "directory" }, existingMembership ? 200 : 201);
    }

    if (method === "DELETE" && pathname.startsWith("/directory/tenants/")) {
      const tenantId = directoryId(decodeURIComponent(pathname.slice("/directory/tenants/".length)), "tenant_id");
      const identity = directoryIdentity(payload.identity);
      const tenant = await this.state.storage.get<TenantRecord>(`directory:tenant:${tenantId}`);
      if (!tenant || tenant.created_by !== identity.subject) return json({ error: "tenant rollback is not permitted" }, 403);
      const members = await this.state.storage.get<string[]>(`directory:tenant:${tenantId}:members`) || [];
      const creatorPrincipal = await directorySubjectKey(identity.issuer, identity.subject);
      if (members.some((principal) => principal !== creatorPrincipal)) return json({ error: "tenant rollback is not permitted" }, 409);
      await this.state.storage.delete(`directory:tenant:${tenantId}`);
      await this.removeDirectoryMembership(identity.issuer, identity.subject, tenantId);
      return empty(204);
    }

    const invitationMatch = pathname.match(/^\/directory\/tenants\/([^/]+)\/invitations$/);
    if (method === "POST" && invitationMatch) {
      const tenantId = directoryId(decodeURIComponent(invitationMatch[1]), "tenant_id");
      const identity = directoryIdentity(payload.identity);
      const owner = await this.directoryMembership(identity, tenantId);
      if (!owner || owner.role !== "owner") {
        return json({ error: "only tenant owners can create invitations", error_code: "tenant_role_forbidden" }, 403);
      }
      const invitation = payload.invitation as TenantInvitation;
      const email = directoryEmail(invitation.email);
      const role = directoryRole(invitation.role, "viewer");
      if (role === "owner") throw new Error("invitations cannot grant the owner role");
      const expiresAt = Date.parse(stringValue(invitation.expires_at));
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + 7 * 86_400_000) {
        throw new Error("invitation expiry must be within seven days");
      }
      const record: TenantInvitation = {
        schema_version: "agentaction.tenant-invitation.v1",
        invitation_id: directoryId(invitation.invitation_id, "invitation_id"),
        tenant_id: tenantId,
        email,
        role,
        secret_digest: stringValue(invitation.secret_digest),
        created_at: new Date().toISOString(),
        created_by: identity.subject,
        expires_at: new Date(expiresAt).toISOString(),
      };
      if (!/^[a-f0-9]{64}$/.test(record.secret_digest)) throw new Error("invitation secret digest is invalid");
      const invitationIndexKey = `directory:tenant:${tenantId}:invitations`;
      const invitationIds = await this.directoryInvitationIds(tenantId);
      await this.state.storage.put({
        [`directory:invitation:${record.invitation_id}`]: record,
        [invitationIndexKey]: [...new Set([...invitationIds, record.invitation_id])],
      });
      return json({ invitation: publicInvitation(record) }, 201);
    }

    const invitationListMatch = pathname.match(/^\/directory\/tenants\/([^/]+)\/invitations\/list$/);
    if (method === "POST" && invitationListMatch) {
      const tenantId = directoryId(decodeURIComponent(invitationListMatch[1]), "tenant_id");
      const identity = directoryIdentity(payload.identity);
      const membership = await this.directoryMembership(identity, tenantId);
      if (!membership || membership.role !== "owner") {
        return json({ error: "only tenant owners can list invitations", error_code: "tenant_role_forbidden" }, 403);
      }
      const invitationIds = await this.directoryInvitationIds(tenantId);
      const invitationKeys = invitationIds.map((invitationId) => `directory:invitation:${invitationId}`);
      const stored = invitationKeys.length > 0
        ? await this.state.storage.get<TenantInvitation>(invitationKeys)
        : new Map<string, TenantInvitation>();
      const invitations = [...stored.values()]
        .filter((invitation) => invitation.tenant_id === tenantId && !invitation.redeemed_at)
        .sort((left, right) => right.created_at.localeCompare(left.created_at))
        .map(publicInvitation);
      return json({ invitations });
    }

    if (method === "POST" && pathname === "/directory/invitations/redeem") {
      const identity = directoryIdentity(payload.identity);
      if (!identity.email) return json({ error: "a verified Access email is required to redeem invitations" }, 403);
      const invitationId = directoryInvitationId(payload.invitation_id);
      const redemptionMethod = stringValue(payload.redemption_method);
      if (redemptionMethod !== "code" && redemptionMethod !== "email_link") {
        return json({ error: "invitation redemption method is invalid", error_code: "invitation_invalid" }, 400);
      }
      const secretDigest = stringValue(payload.secret_digest);
      const invitation = await this.state.storage.get<TenantInvitation>(`directory:invitation:${invitationId}`);
      if (!invitation || (redemptionMethod === "code" && !constantTimeEqual(invitation.secret_digest, secretDigest))) {
        return json({ error: "invitation is invalid", error_code: "invitation_invalid" }, 404);
      }
      if (await this.directoryWorkspaceMode(identity) !== "directory" && identity.claimed_tenant_id !== invitation.tenant_id) {
        return json({ error: "signed tenant identity cannot join another tenant", error_code: "claimed_tenant_fixed" }, 403);
      }
      if (invitation.redeemed_at) return json({ error: "invitation was already redeemed", error_code: "invitation_replayed" }, 409);
      if (Date.parse(invitation.expires_at) <= Date.now()) return json({ error: "invitation has expired", error_code: "invitation_expired" }, 410);
      if (identity.email.toLowerCase() !== invitation.email) return json({ error: "invitation email does not match Access identity" }, 403);
      const membership: TenantMembership = {
        schema_version: "agentaction.tenant-membership.v1",
        tenant_id: invitation.tenant_id,
        subject: identity.subject,
        issuer: identity.issuer,
        email: identity.email,
        role: invitation.role,
        created_at: new Date().toISOString(),
        created_by: invitation.created_by,
      };
      await this.persistDirectoryMembership(membership);
      invitation.redeemed_at = new Date().toISOString();
      invitation.redeemed_by = identity.subject;
      await this.state.storage.put(`directory:invitation:${invitationId}`, invitation);
      return json({ membership }, 201);
    }

    const membersMatch = pathname.match(/^\/directory\/tenants\/([^/]+)\/members$/);
    if (method === "POST" && membersMatch) {
      const tenantId = directoryId(decodeURIComponent(membersMatch[1]), "tenant_id");
      const identity = directoryIdentity(payload.identity);
      const membership = await this.directoryMembership(identity, tenantId);
      if (!membership || membership.role !== "owner") return json({ error: "only tenant owners can list members" }, 403);
      const subjects = await this.state.storage.get<string[]>(`directory:tenant:${tenantId}:members`) || [];
      const members: TenantMembership[] = [];
      for (const principal of subjects) {
        const member = await this.state.storage.get<TenantMembership>(`${principal}:membership:${tenantId}`);
        if (member) members.push(member);
      }
      return json({ members });
    }

    return json({ error: "not found" }, 404);
  }

  async directoryMembership(identity: ControlIdentity, tenantId: string): Promise<TenantMembership | undefined> {
    if (await this.directoryWorkspaceMode(identity) !== "directory" && identity.claimed_tenant_id === tenantId && identity.claimed_role) {
      return {
        schema_version: "agentaction.tenant-membership.v1",
        tenant_id: tenantId,
        subject: identity.subject,
        issuer: identity.issuer,
        ...(identity.email ? { email: identity.email } : {}),
        role: identity.claimed_role,
        created_at: new Date(0).toISOString(),
        created_by: "signed-access-claim",
      };
    }
    return this.state.storage.get<TenantMembership>(await directoryMembershipKey(identity.issuer, identity.subject, tenantId));
  }

  async directoryInvitationIds(tenantId: string): Promise<string[]> {
    const indexKey = `directory:tenant:${tenantId}:invitations`;
    const indexed = await this.state.storage.get<string[]>(indexKey);
    if (indexed) return indexed;
    const legacyInvitations = await this.state.storage.list<TenantInvitation>({ prefix: "directory:invitation:" });
    const invitationIds = [...legacyInvitations.values()]
      .filter((invitation) => invitation.tenant_id === tenantId)
      .map((invitation) => invitation.invitation_id);
    await this.state.storage.put(indexKey, invitationIds);
    return invitationIds;
  }

  async directoryMemberships(identity: ControlIdentity): Promise<Array<{ tenant: TenantRecord; membership: TenantMembership }>> {
    const subjectKey = await directorySubjectKey(identity.issuer, identity.subject);
    const tenantIds = await this.state.storage.get<string[]>(`${subjectKey}:tenants`) || [];
    if (await this.directoryWorkspaceMode(identity) !== "directory" && identity.claimed_tenant_id && !tenantIds.includes(identity.claimed_tenant_id)) {
      tenantIds.unshift(identity.claimed_tenant_id);
    }
    const memberships: Array<{ tenant: TenantRecord; membership: TenantMembership }> = [];
    for (const tenantId of tenantIds) {
      const membership = await this.directoryMembership(identity, tenantId);
      if (!membership) continue;
      const storedTenant = await this.state.storage.get<TenantRecord>(`directory:tenant:${tenantId}`);
      const tenant = storedTenant || {
        schema_version: "agentaction.tenant.v1" as const,
        tenant_id: tenantId,
        display_name: tenantId,
        created_at: membership.created_at,
        created_by: membership.created_by,
      };
      memberships.push({ tenant, membership });
    }
    return memberships;
  }

  async directoryWorkspaceMode(identity: ControlIdentity): Promise<"directory" | "sso_fixed"> {
    if (!identity.claimed_tenant_id) return "directory";
    const subjectKey = await directorySubjectKey(identity.issuer, identity.subject);
    if (await this.state.storage.get<string>(`${subjectKey}:workspace-mode`) === "directory") return "directory";
    const membership = await this.state.storage.get<TenantMembership>(
      await directoryMembershipKey(identity.issuer, identity.subject, identity.claimed_tenant_id),
    );
    return membership?.workspace_mode === "directory" ? "directory" : "sso_fixed";
  }

  async persistDirectoryMembership(membership: TenantMembership): Promise<void> {
    const key = await directoryMembershipKey(membership.issuer, membership.subject, membership.tenant_id);
    const subjectKey = await directorySubjectKey(membership.issuer, membership.subject);
    const tenantIds = await this.state.storage.get<string[]>(`${subjectKey}:tenants`) || [];
    const subjects = await this.state.storage.get<string[]>(`directory:tenant:${membership.tenant_id}:members`) || [];
    await this.state.storage.put(key, membership);
    await this.state.storage.put(`${subjectKey}:tenants`, [membership.tenant_id, ...tenantIds.filter((id) => id !== membership.tenant_id)]);
    await this.state.storage.put(`directory:tenant:${membership.tenant_id}:members`, [subjectKey, ...subjects.filter((principal) => principal !== subjectKey)]);
  }

  async removeDirectoryMembership(issuer: string, subject: string, tenantId: string): Promise<void> {
    const key = await directoryMembershipKey(issuer, subject, tenantId);
    const subjectKey = await directorySubjectKey(issuer, subject);
    const tenantIds = await this.state.storage.get<string[]>(`${subjectKey}:tenants`) || [];
    const subjects = await this.state.storage.get<string[]>(`directory:tenant:${tenantId}:members`) || [];
    await this.state.storage.delete(key);
    await this.state.storage.put(`${subjectKey}:tenants`, tenantIds.filter((id) => id !== tenantId));
    await this.state.storage.put(`directory:tenant:${tenantId}:members`, subjects.filter((entry) => entry !== subjectKey));
  }

  async activityEvents(url: URL): Promise<Response> {
    const limitValue = Number(url.searchParams.get("limit") || "50");
    if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 100) {
      return json({ error: "activity limit must be an integer from 1 to 100" }, 400);
    }
    const from = activityDateFilter(url.searchParams.get("from"), "from");
    if (from.error) return json({ error: from.error }, 400);
    const to = activityDateFilter(url.searchParams.get("to"), "to");
    if (to.error) return json({ error: to.error }, 400);
    const index = await this.state.storage.get<string[]>("activity:index") || [];
    const cursor = url.searchParams.get("cursor") || "";
    const start = cursor ? index.indexOf(cursor) + 1 : 0;
    if (cursor && start === 0) return json({ error: "activity cursor is invalid" }, 400);
    const filters = {
      agent_id: url.searchParams.get("agent_id") || "",
      event_type: url.searchParams.get("event_type") || "",
      tool: url.searchParams.get("tool") || "",
      decision: url.searchParams.get("decision") || "",
      execution_status: url.searchParams.get("execution_status") || "",
      intent_binding: url.searchParams.get("intent_binding") || "",
    };
    const events: ActivityEvent[] = [];
    let lastVisited = "";
    let hasMore = false;
    for (let position = start; position < index.length; position += 1) {
      const id = index[position];
      lastVisited = id;
      const stored = await this.state.storage.get<StoredActivityEvent>(`activity:event:${id}`);
      if (!stored || !activityMatches(stored.event, filters, from.value, to.value)) continue;
      events.push(stored.event);
      if (events.length >= limitValue) {
        hasMore = position < index.length - 1;
        break;
      }
    }
    return json({
      schema_version: "agentaction.activity-page.v1",
      events,
      count: events.length,
      next_cursor: hasMore ? lastVisited : null,
    });
  }

  async resolveIntentRecord(
    event: Record<string, unknown>,
    requireJob = true,
    allowExpired = false,
  ): Promise<{ record?: IntentContractRecord; error?: string; errorCode?: string; httpStatus: number }> {
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
    const finalization = await this.state.storage.get<IntentFinalizationState>(`intent:${intentId}:finalization:state`);
    if (!allowExpired && finalization) {
      return {
        error: `intent evidence is ${finalization.status}: ${intentId}`,
        errorCode: "intent_evidence_finalized",
        httpStatus: 409,
      };
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

  async previewIntentEvaluation(
    intentId: string,
    registered: IntentContractRecord,
    payload: Record<string, unknown>,
  ): Promise<Response> {
    const finalization = await this.state.storage.get<IntentFinalizationState>(`intent:${intentId}:finalization:state`);
    const finalRecord = await this.state.storage.get<IntentFinalizationRecord>(`intent:${intentId}:finalization`);
    const jobInput = payload.job === undefined ? undefined : recordValue(payload.job);
    if (jobInput && finalization) {
      return json({
        error: `intent evidence is ${finalization.status}: ${intentId}`,
        error_code: "intent_evidence_finalized",
      }, 409);
    }
    if (finalization?.status === "finalizing" && !finalRecord) {
      return json({ error: `intent finalization is in progress: ${intentId}`, error_code: "intent_finalization_in_progress" }, 409);
    }

    let job: Record<string, unknown> | undefined;
    if (jobInput) {
      const bindingFinding = suppliedIntentBindingFinding(jobInput, registered);
      if (bindingFinding) return json({ error: bindingFinding, error_code: "intent_job_binding_mismatch" }, 409);
      job = boundIntentJob(jobInput, registered);
      await this.state.storage.put(`intent:${intentId}:job`, job);
    } else if (finalRecord) {
      job = finalRecord.snapshot.evidence.job;
    } else {
      job = await this.state.storage.get<Record<string, unknown>>(`intent:${intentId}:job`);
    }

    const evidence = finalRecord
      ? snapshotIntentEvidence(finalRecord.snapshot)
      : await this.currentIntentEvidence(intentId, job);
    const evaluation: HostedIntentEvaluationReceipt = {
      ...evaluateIntent(registered.contract, evidence, {
        idGenerator: () => `eval_${crypto.randomUUID()}`,
      }),
      evaluation_mode: "preview",
    };
    await this.persistIntentEvaluation(intentId, evaluation);
    return json(evaluation);
  }

  async finalizeIntentEvaluation(
    intentId: string,
    registered: IntentContractRecord,
    payload: Record<string, unknown>,
  ): Promise<Response> {
    const previous = this.intentFinalizationQueues.get(intentId) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.intentFinalizationQueues.set(intentId, queued);
    await previous;
    try {
      return await this.finalizeIntentEvaluationLocked(intentId, registered, payload);
    } finally {
      release();
      if (this.intentFinalizationQueues.get(intentId) === queued) {
        this.intentFinalizationQueues.delete(intentId);
      }
    }
  }

  async finalizeIntentEvaluationLocked(
    intentId: string,
    registered: IntentContractRecord,
    payload: Record<string, unknown>,
  ): Promise<Response> {
    const jobInput = payload.job === undefined ? undefined : recordValue(payload.job);
    if (jobInput) {
      const bindingFinding = suppliedIntentBindingFinding(jobInput, registered);
      if (bindingFinding) return json({ error: bindingFinding, error_code: "intent_job_binding_mismatch" }, 409);
    }
    const requestedJob = jobInput ? boundIntentJob(jobInput, registered) : undefined;
    const finalizationKey = `intent:${intentId}:finalization`;
    const stateKey = `intent:${intentId}:finalization:state`;
    const existing = await this.state.storage.get<IntentFinalizationRecord>(finalizationKey);
    if (existing) {
      if (requestedJob && canonicalJson(requestedJob) !== canonicalJson(existing.snapshot.evidence.job)) {
        return json({
          error: `intent evidence is finalized with different job evidence: ${intentId}`,
          error_code: "intent_evidence_finalized",
        }, 409);
      }
      await this.state.storage.put(stateKey, {
        status: "finalized",
        started_at: existing.snapshot.captured_at,
        finalized_at: existing.finalized_at,
      } satisfies IntentFinalizationState);
      await this.indexIntentQualityFinalization(intentId, existing.finalized_at, existing.snapshot.job_id);
      return json({ evaluation: existing.evaluation, snapshot: existing.snapshot, replayed: true });
    }

    const priorState = await this.state.storage.get<IntentFinalizationState>(stateKey);
    const storedJob = await this.state.storage.get<Record<string, unknown>>(`intent:${intentId}:job`);
    const frozenJob = priorState ? priorState.pending_job || storedJob : undefined;
    if (priorState && requestedJob && frozenJob && canonicalJson(requestedJob) !== canonicalJson(frozenJob)) {
      return json({
        error: `intent finalization already started with different job evidence: ${intentId}`,
        error_code: "intent_evidence_finalized",
      }, 409);
    }
    const job = priorState ? frozenJob || requestedJob : requestedJob || storedJob;
    const capturedAt = priorState?.started_at || new Date().toISOString();
    await this.state.storage.put(stateKey, {
      status: "finalizing",
      started_at: capturedAt,
      pending_job: job,
    } satisfies IntentFinalizationState);

    let snapshot: IntentEvidenceSnapshot;
    let baseEvaluation: IntentEvaluationReceipt;
    let criterionEvaluation: DeterministicEvalResult | undefined;
    try {
      snapshot = await this.createIntentEvidenceSnapshot(intentId, registered, job, capturedAt);
      baseEvaluation = evaluateIntent(registered.contract, snapshotIntentEvidence(snapshot), {
        now: () => new Date(capturedAt),
        idGenerator: () => `eval_final_${snapshot.evidence_digest.slice(0, 24)}`,
      });
      criterionEvaluation = await deterministicCriterionEvaluation(
        registered.contract,
        snapshot,
        baseEvaluation,
        recordValue(job).eval_binding,
      );
    } catch (error) {
      // Invalid frozen provenance is a rejected finalization attempt, not a
      // recoverable in-progress write. Clear the marker so a corrected retry
      // cannot be permanently stranded in `finalizing`.
      await this.state.storage.delete(stateKey);
      return json({
        error: (error as Error).message,
        error_code: "eval_result_provenance_invalid",
      }, 409);
    }
    const evaluation: HostedIntentEvaluationReceipt = {
      ...baseEvaluation,
      evaluation_mode: "final",
      snapshot_id: snapshot.snapshot_id,
      evidence_digest: snapshot.evidence_digest,
      ...(criterionEvaluation ? { criterion_evaluation: criterionEvaluation } : {}),
    };
    const finalizedAt = capturedAt;
    const record: IntentFinalizationRecord = {
      schema_version: "agentpass.intent-finalization.v1",
      finalized_at: finalizedAt,
      snapshot,
      evaluation,
    };
    if (job) await this.state.storage.put(`intent:${intentId}:job`, job);
    await this.state.storage.put(`intent:${intentId}:snapshot:${snapshot.snapshot_id}`, snapshot);
    await this.persistIntentEvaluation(intentId, evaluation);
    await this.state.storage.put(stateKey, {
      status: "finalized",
      started_at: capturedAt,
      finalized_at: finalizedAt,
    } satisfies IntentFinalizationState);
    await this.state.storage.put(finalizationKey, record);
    await this.indexIntentQualityFinalization(intentId, finalizedAt, snapshot.job_id);
    return json({ evaluation, snapshot, replayed: false }, 201);
  }

  async createIntentEvidenceSnapshot(
    intentId: string,
    registered: IntentContractRecord,
    job: Record<string, unknown> | undefined,
    capturedAt: string,
  ): Promise<IntentEvidenceSnapshot> {
    const decisions = await this.sortedIntentEvidence(intentId, "decision_events");
    const decisionBases = await this.sortedIntentEvidence(intentId, "decision_bases");
    const receipts = await this.sortedIntentEvidence(intentId, "execution_receipts");
    const observations = (await this.sortedIntentEvidence(intentId, "observations", true));
    const jobDigest = await canonicalDigest(job ?? null);
    const sources: IntentEvidenceManifest = {
      decision_events: {
        count: decisions.records.length,
        evidence_ids: decisions.ids,
        digest: decisions.digest,
      },
      decision_bases: {
        count: decisionBases.records.length,
        evidence_ids: decisionBases.ids,
        digest: decisionBases.digest,
      },
      execution_receipts: {
        count: receipts.records.length,
        evidence_ids: receipts.ids,
        digest: receipts.digest,
      },
      observations: {
        count: observations.records.length,
        evidence_ids: observations.ids,
        digest: observations.digest,
      },
      job: {
        count: job ? 1 : 0,
        evidence_ids: job ? [registered.job_id] : [],
        digest: jobDigest,
      },
    };
    const evidence = {
      decision_events: decisions.records,
      decision_bases: decisionBases.records,
      execution_receipts: receipts.records,
      observations: observations.records,
      job,
    };
    const evidenceDigest = await canonicalDigest({
      schema_version: "agentpass.intent-evidence-snapshot.v2",
      tenant_id: registered.tenant_id || "default",
      intent_id: registered.intent_id,
      intent_digest: registered.intent_digest,
      job_id: registered.job_id,
      sources,
    });
    return {
      schema_version: "agentpass.intent-evidence-snapshot.v2",
      snapshot_id: `snapshot_${evidenceDigest.slice(0, 24)}`,
      tenant_id: registered.tenant_id || "default",
      intent_id: registered.intent_id,
      intent_digest: registered.intent_digest,
      job_id: registered.job_id,
      captured_at: capturedAt,
      evidence_digest: evidenceDigest,
      sources,
      evidence,
    };
  }

  async sortedIntentEvidence(
    intentId: string,
    source: IntentStoredEvidenceSourceName,
    verifiedOnly = false,
  ): Promise<{ ids: string[]; records: Record<string, unknown>[]; digest: string }> {
    const records = (await this.intentEvidence(intentId, source))
      .filter((record) => !verifiedOnly || verifiedIntentObservationFinding(record) === undefined);
    const entries = await Promise.all(records.map(async (record) => ({
      id: intentEvidenceIdentifier(source, record) || `${source}_${(await canonicalDigest(record)).slice(0, 24)}`,
      record,
    })));
    entries.sort((left, right) => left.id.localeCompare(right.id) || canonicalJson(left.record).localeCompare(canonicalJson(right.record)));
    const sortedRecords = entries.map((entry) => entry.record);
    return {
      ids: entries.map((entry) => entry.id),
      records: sortedRecords,
      digest: await canonicalDigest(sortedRecords),
    };
  }

  async currentIntentEvidence(intentId: string, job?: Record<string, unknown>): Promise<IntentEvidence> {
    return {
      decision_events: await this.intentEvidence(intentId, "decision_events"),
      execution_receipts: await this.intentEvidence(intentId, "execution_receipts"),
      observations: await this.intentEvidence(intentId, "observations"),
      job,
    };
  }

  async appendIntentDecisionEvidence(
    event: Record<string, unknown>,
    basisInput: Record<string, unknown>,
  ): Promise<{
    event?: Record<string, unknown>;
    basis?: Record<string, unknown>;
    error?: string;
    errorCode?: string;
    replayed?: boolean;
    httpStatus: number;
  }> {
    const resolved = await this.resolveIntentRecord(event, true, true);
    if (resolved.error) {
      return { error: resolved.error, errorCode: resolved.errorCode, httpStatus: resolved.httpStatus };
    }
    if (!resolved.record) {
      return { error: "intent decision evidence requires a registered intent binding", httpStatus: 409 };
    }

    const basisFindings = validateDecisionBasis(basisInput);
    const decisionId = stringValue(event.decision_id);
    const expectedTenant = resolved.record.tenant_id || "default";
    const basisSubject = recordValue(basisInput.subject);
    const basisContext = recordValue(basisInput.context);
    if (basisSubject.type !== "authorization_decision" || basisSubject.id !== decisionId) {
      basisFindings.push("decision basis subject does not match decision_id");
    }
    if (basisInput.basis_id !== stringValue(event.decision_basis_id)) {
      basisFindings.push("decision basis_id does not match decision event reference");
    }
    if (
      basisContext.tenant_id !== expectedTenant ||
      basisContext.intent_id !== resolved.record.intent_id ||
      basisContext.intent_digest !== resolved.record.intent_digest ||
      basisContext.job_id !== resolved.record.job_id
    ) {
      basisFindings.push("decision basis context does not match registered intent binding");
    }
    if (basisFindings.length > 0) {
      return {
        error: `decision basis is invalid: ${basisFindings.join("; ")}`,
        errorCode: "decision_basis_invalid",
        httpStatus: 400,
      };
    }
    const basis = basisInput as DecisionBasis;

    const finalization = await this.state.storage.get<IntentFinalizationState>(
      `intent:${resolved.record.intent_id}:finalization:state`,
    );
    if (finalization) {
      return {
        error: `intent evidence is ${finalization.status}: ${resolved.record.intent_id}`,
        errorCode: "intent_evidence_finalized",
        httpStatus: 409,
      };
    }

    const decisionIndexKey = `intent:${resolved.record.intent_id}:evidence:decision_events:index`;
    const basisIndexKey = `intent:${resolved.record.intent_id}:evidence:decision_bases:index`;
    const decisionKey = `intent:${resolved.record.intent_id}:evidence:decision_events:${decisionId}`;
    const basisKey = `intent:${resolved.record.intent_id}:evidence:decision_bases:${basis.basis_id}`;
    const [decisionIndex, basisIndex, existingDecision, existingBasis] = await Promise.all([
      this.state.storage.get<string[]>(decisionIndexKey),
      this.state.storage.get<string[]>(basisIndexKey),
      this.state.storage.get<Record<string, unknown>>(decisionKey),
      this.state.storage.get<Record<string, unknown>>(basisKey),
    ]);
    if (existingDecision || existingBasis) {
      if (canonicalJson(existingDecision) === canonicalJson(event) && canonicalJson(existingBasis) === canonicalJson(basis)) {
        return { event: existingDecision, basis: existingBasis, replayed: true, httpStatus: 200 };
      }
      return {
        error: `decision evidence identifier conflict: ${decisionId}`,
        errorCode: "decision_evidence_id_conflict",
        httpStatus: 409,
      };
    }

    const nextDecisionIndex = [decisionId, ...(decisionIndex || []).filter((id) => id !== decisionId)].slice(0, 2_000);
    const nextBasisIndex = [basis.basis_id, ...(basisIndex || []).filter((id) => id !== basis.basis_id)].slice(0, 2_000);
    await this.state.storage.put({
      [decisionKey]: event,
      [decisionIndexKey]: nextDecisionIndex,
      [basisKey]: basis,
      [basisIndexKey]: nextBasisIndex,
    });
    return { event, basis, replayed: false, httpStatus: 201 };
  }

  async intentQualityRollups(url: URL): Promise<Response> {
    const parsed = parseIntentQualityFilters(url);
    if (parsed.error || !parsed.filters) {
      return json({ error: parsed.error, error_code: parsed.errorCode }, 400);
    }
    const filters = parsed.filters;
    const tenantId = url.searchParams.get("tenant_id") || "default";
    const exclusionReasons: IntentQualityExclusionReason[] = [
      "not_finalized",
      "invalid_final_receipt",
      "unversioned_profile",
      "outside_time_window",
      "profile_filter",
      "agent_filter",
      "verdict_filter",
      "constraint_filter",
    ];
    const excluded = Object.fromEntries(exclusionReasons.map((reason) => [reason, 0])) as Record<
      IntentQualityExclusionReason,
      number
    >;
    const legacyIntentIndex = await this.state.storage.get<string[]>("intent:index") || [];
    const qualityIntentIndex: string[] = [];
    for (const date of intentQualityDateBuckets(filters.from, filters.to)) {
      const ids = await this.state.storage.get<string[]>(`intent-quality:index:${date}`) || [];
      qualityIntentIndex.push(...ids);
    }
    const intentIndex = [...new Set([...qualityIntentIndex, ...legacyIntentIndex])];
    const groups = new Map<string, IntentQualityRecord[]>();
    let finalizedRecords = 0;

    for (const intentId of intentIndex) {
      const finalization = await this.state.storage.get<IntentFinalizationRecord>(`intent:${intentId}:finalization`);
      if (!finalization) {
        const contract = await this.state.storage.get<IntentContractRecord>(`intent:${intentId}:contract`);
        const registered = recordValue(contract);
        const registeredAt = Date.parse(
          optionalString(registered.registered_at) || optionalString(recordValue(registered.contract).issued_at) || "",
        );
        if (Number.isFinite(registeredAt) && (registeredAt < Date.parse(filters.from) || registeredAt >= Date.parse(filters.to))) {
          excluded.outside_time_window += 1;
        } else {
          excluded.not_finalized += 1;
        }
        continue;
      }
      finalizedRecords += 1;
      const finalizedAt = Date.parse(optionalString(recordValue(finalization).finalized_at) || "");
      if (Number.isFinite(finalizedAt) && (finalizedAt < Date.parse(filters.from) || finalizedAt >= Date.parse(filters.to))) {
        excluded.outside_time_window += 1;
        continue;
      }
      const quality = intentQualityRecord(finalization);
      if (quality.error || !quality.record) {
        excluded[quality.error || "invalid_final_receipt"] += 1;
        continue;
      }
      const record = quality.record;
      if (
        (filters.profile_key && record.profile_key !== filters.profile_key) ||
        (filters.profile_version && record.profile_version !== filters.profile_version)
      ) {
        excluded.profile_filter += 1;
        continue;
      }
      if (filters.agent_id && !record.agent_ids.includes(filters.agent_id)) {
        excluded.agent_filter += 1;
        continue;
      }
      if (filters.verdict && record.evaluation.verdict !== filters.verdict) {
        excluded.verdict_filter += 1;
        continue;
      }
      if (
        filters.constraint_compliance &&
        record.evaluation.constraint_compliance !== filters.constraint_compliance
      ) {
        excluded.constraint_filter += 1;
        continue;
      }
      const groupKey = intentQualityGroupKey(record);
      groups.set(groupKey, [...(groups.get(groupKey) || []), record]);
    }

    const groupKeys = [...groups.keys()].sort();
    let start = 0;
    if (filters.cursor) {
      const cursorIndex = groupKeys.indexOf(filters.cursor);
      if (cursorIndex < 0) {
        return json({ error: "intent quality cursor is invalid", error_code: "intent_quality_cursor_invalid" }, 400);
      }
      start = cursorIndex + 1;
    }
    const pageKeys = groupKeys.slice(start, start + filters.limit);
    const rollups = pageKeys.map((key) => intentQualityRollup(
      tenantId,
      groups.get(key) || [],
      filters,
    ));
    const nextCursor = start + filters.limit < groupKeys.length
      ? pageKeys.at(-1) || null
      : null;
    const excludedTotal = Object.values(excluded).reduce((total, count) => total + count, 0);
    const dataQualityFindings: string[] = [];
    if (excluded.not_finalized > 0) {
      dataQualityFindings.push(`${excluded.not_finalized} registered intent contract(s) are not finalized`);
    }
    if (excluded.unversioned_profile > 0) {
      dataQualityFindings.push(`${excluded.unversioned_profile} finalized receipt(s) lack a versioned profile binding`);
    }
    if (excluded.invalid_final_receipt > 0) {
      dataQualityFindings.push(`${excluded.invalid_final_receipt} invalid final receipt(s) were excluded`);
    }
    if (groupKeys.length === 0) dataQualityFindings.push("no finalized receipts matched the requested filters");

    return json({
      schema_version: "agentpass.intent-quality-rollups.v1",
      tenant_id: tenantId,
      filters: intentQualityResponseFilters(filters),
      records_scanned: intentIndex.length,
      finalized_records: finalizedRecords,
      matched_records: [...groups.values()].reduce((total, records) => total + records.length, 0),
      excluded_records: {
        total: excludedTotal,
        by_reason: excluded,
      },
      data_quality: {
        findings: dataQualityFindings,
      },
      rollups,
      pagination: {
        limit: filters.limit,
        total_groups: groupKeys.length,
        returned_groups: rollups.length,
        next_cursor: nextCursor,
      },
    });
  }

  async intentQualityJobs(url: URL): Promise<Response> {
    const parsed = parseIntentQualityJobsFilters(url);
    if (parsed.error || !parsed.filters) {
      return json({ error: parsed.error, error_code: parsed.errorCode }, 400);
    }
    const filters = parsed.filters;
    const tenantId = url.searchParams.get("tenant_id") || "default";
    const exclusionReasons: IntentQualityJobsExclusionReason[] = [
      "not_finalized",
      "invalid_final_receipt",
      "unversioned_profile",
      "tenant_mismatch",
      "outside_time_window",
      "profile_filter",
      "agent_filter",
      "verdict_filter",
      "constraint_filter",
      "confidence_filter",
      "job_filter",
      "intent_filter",
    ];
    const excluded = Object.fromEntries(exclusionReasons.map((reason) => [reason, 0])) as Record<
      IntentQualityJobsExclusionReason,
      number
    >;
    const legacyIntentIndex = await this.state.storage.get<string[]>("intent:index") || [];
    const qualityIntentIndex: string[] = [];
    for (const date of intentQualityDateBuckets(filters.from, filters.to)) {
      const ids = await this.state.storage.get<string[]>(`intent-quality:index:${date}`) || [];
      qualityIntentIndex.push(...ids);
    }
    const intentIndex = [...new Set([...qualityIntentIndex, ...legacyIntentIndex])];
    const records: IntentQualityRecord[] = [];
    let finalizedRecords = 0;

    for (const intentId of intentIndex) {
      const finalization = await this.state.storage.get<IntentFinalizationRecord>(`intent:${intentId}:finalization`);
      if (!finalization) {
        const contract = await this.state.storage.get<IntentContractRecord>(`intent:${intentId}:contract`);
        const registered = recordValue(contract);
        const registeredAt = Date.parse(
          optionalString(registered.registered_at) || optionalString(recordValue(registered.contract).issued_at) || "",
        );
        if (Number.isFinite(registeredAt) && (registeredAt < Date.parse(filters.from) || registeredAt >= Date.parse(filters.to))) {
          excluded.outside_time_window += 1;
        } else {
          excluded.not_finalized += 1;
        }
        continue;
      }
      finalizedRecords += 1;
      const finalizedAt = Date.parse(optionalString(recordValue(finalization).finalized_at) || "");
      if (!Number.isFinite(finalizedAt) || finalizedAt < Date.parse(filters.from) || finalizedAt >= Date.parse(filters.to)) {
        excluded.outside_time_window += 1;
        continue;
      }
      const quality = intentQualityRecord(finalization);
      if (quality.error || !quality.record) {
        excluded[quality.error || "invalid_final_receipt"] += 1;
        continue;
      }
      const record = quality.record;
      if (record.tenant_id !== tenantId) {
        excluded.tenant_mismatch += 1;
        continue;
      }
      if (
        (filters.profile_key && record.profile_key !== filters.profile_key) ||
        (filters.profile_version && record.profile_version !== filters.profile_version)
      ) {
        excluded.profile_filter += 1;
        continue;
      }
      if (filters.agent_id && !record.agent_ids.includes(filters.agent_id)) {
        excluded.agent_filter += 1;
        continue;
      }
      if (filters.verdict && record.evaluation.verdict !== filters.verdict) {
        excluded.verdict_filter += 1;
        continue;
      }
      if (
        filters.constraint_compliance &&
        record.evaluation.constraint_compliance !== filters.constraint_compliance
      ) {
        excluded.constraint_filter += 1;
        continue;
      }
      if (filters.confidence && intentQualityConfidenceBand(record.evaluation.evidence_confidence) !== filters.confidence) {
        excluded.confidence_filter += 1;
        continue;
      }
      if (filters.job_id && record.job_id !== filters.job_id) {
        excluded.job_filter += 1;
        continue;
      }
      if (filters.intent_id && record.intent_id !== filters.intent_id) {
        excluded.intent_filter += 1;
        continue;
      }
      records.push(record);
    }

    records.sort((left, right) =>
      right.finalized_at.localeCompare(left.finalized_at) || right.intent_id.localeCompare(left.intent_id)
    );
    let start = 0;
    if (filters.cursor) {
      const cursor = decodeIntentQualityJobsCursor(filters.cursor);
      if (!cursor) {
        return json({ error: "intent quality jobs cursor is invalid", error_code: "intent_quality_jobs_cursor_invalid" }, 400);
      }
      const cursorIndex = records.findIndex((record) =>
        record.finalized_at === cursor.finalized_at && record.intent_id === cursor.intent_id
      );
      if (cursorIndex < 0) {
        return json({ error: "intent quality jobs cursor is invalid", error_code: "intent_quality_jobs_cursor_invalid" }, 400);
      }
      start = cursorIndex + 1;
    }
    const pageRecords = records.slice(start, start + filters.limit);
    const jobs = await Promise.all(pageRecords.map(async (record) => intentQualityJob(
      record,
      await this.intentQualityPreviewCount(record.intent_id),
    )));
    const nextCursor = start + filters.limit < records.length && pageRecords.length > 0
      ? encodeIntentQualityJobsCursor(pageRecords[pageRecords.length - 1])
      : null;
    const excludedTotal = Object.values(excluded).reduce((total, count) => total + count, 0);
    const findings: string[] = [];
    if (excluded.not_finalized > 0) findings.push(`${excluded.not_finalized} registered intent contract(s) are not finalized`);
    if (excluded.unversioned_profile > 0) {
      findings.push(`${excluded.unversioned_profile} finalized receipt(s) lack a versioned profile binding`);
    }
    if (excluded.invalid_final_receipt > 0) findings.push(`${excluded.invalid_final_receipt} invalid final receipt(s) were excluded`);
    if (excluded.tenant_mismatch > 0) findings.push(`${excluded.tenant_mismatch} tenant-mismatched final receipt(s) were excluded`);
    if (records.length === 0) findings.push("no finalized jobs matched the requested filters");

    return json({
      schema_version: "agentpass.intent-quality-jobs.v1",
      tenant_id: tenantId,
      filters: intentQualityJobsResponseFilters(filters),
      records_scanned: intentIndex.length,
      finalized_records: finalizedRecords,
      matched_records: records.length,
      excluded_records: { total: excludedTotal, by_reason: excluded },
      data_quality: { findings },
      jobs,
      pagination: {
        limit: filters.limit,
        returned_jobs: jobs.length,
        next_cursor: nextCursor,
      },
    });
  }

  async intentQualityJobDetail(jobId: string, url: URL): Promise<Response> {
    for (const key of url.searchParams.keys()) {
      if (key !== "tenant_id") {
        return json({
          error: "intent quality job detail does not accept query parameters",
          error_code: "intent_quality_job_detail_query_not_allowed",
        }, 400);
      }
    }
    if (!intentQualityJobIdValid(jobId)) {
      return json({ error: "intent quality job ID is invalid", error_code: "intent_quality_job_id_invalid" }, 400);
    }
    const tenantId = url.searchParams.get("tenant_id") || "default";
    const indexed = await this.state.storage.get<string[] | string>(`intent-quality:job:${jobId}`);
    const indexedIntentIds = Array.isArray(indexed) ? indexed : typeof indexed === "string" ? [indexed] : [];
    const legacyIntentIds = await this.state.storage.get<string[]>("intent:index") || [];
    const intentIds = [...new Set([...indexedIntentIds, ...legacyIntentIds])];
    const matches: Array<{ finalization: IntentFinalizationRecord; record: IntentQualityRecord }> = [];

    for (const intentId of intentIds) {
      const finalization = await this.state.storage.get<IntentFinalizationRecord>(`intent:${intentId}:finalization`);
      if (!finalization || optionalString(recordValue(finalization.snapshot).job_id) !== jobId) continue;
      const quality = intentQualityRecord(finalization);
      if (!quality.record || quality.record.tenant_id !== tenantId || quality.record.job_id !== jobId) continue;
      matches.push({ finalization, record: quality.record });
    }
    if (matches.length === 0) {
      return json({
        error: `finalized intent quality job not found: ${jobId}`,
        error_code: "intent_quality_job_not_found",
      }, 404);
    }
    if (matches.length > 1) {
      return json({
        error: `finalized intent quality job ID is ambiguous: ${jobId}`,
        error_code: "intent_quality_job_ambiguous",
      }, 409);
    }

    const match = matches[0];
    const evaluationIds = await this.state.storage.get<string[]>(
      `intent:${match.record.intent_id}:evaluation:index`,
    ) || [];
    const previews: Record<string, unknown>[] = [];
    let invalidPreviewCount = 0;
    for (const evaluationId of evaluationIds.slice(0, 1_000)) {
      const evaluation = await this.state.storage.get<HostedIntentEvaluationReceipt>(
        `intent:${match.record.intent_id}:evaluation:${evaluationId}`,
      );
      if (evaluation?.evaluation_mode !== "preview") continue;
      const summary = intentQualityPreviewSummary(evaluation, match.record);
      if (summary) previews.push(summary);
      else invalidPreviewCount += 1;
    }
    previews.sort((left, right) =>
      intentQualityNullableTimestamp(left.evaluated_at).localeCompare(intentQualityNullableTimestamp(right.evaluated_at)) ||
      stringValue(left.evaluation_id).localeCompare(stringValue(right.evaluation_id))
    );
    return json(intentQualityJobDetailPayload(
      match.record,
      match.finalization,
      previews,
      invalidPreviewCount,
    ));
  }

  async intentQualityPreviewCount(intentId: string): Promise<number> {
    const evaluationIds = await this.state.storage.get<string[]>(`intent:${intentId}:evaluation:index`) || [];
    let previewCount = 0;
    for (const evaluationId of evaluationIds) {
      const evaluation = await this.state.storage.get<HostedIntentEvaluationReceipt>(
        `intent:${intentId}:evaluation:${evaluationId}`,
      );
      if (evaluation?.evaluation_mode === "preview") previewCount += 1;
    }
    if (previewCount > 0) return previewCount;
    const latestPreview = await this.state.storage.get<HostedIntentEvaluationReceipt>(
      `intent:${intentId}:evaluation:latest-preview`,
    );
    return latestPreview?.evaluation_mode === "preview" ? 1 : 0;
  }

  async indexIntentQualityFinalization(intentId: string, finalizedAt: string, jobId?: string): Promise<void> {
    const date = new Date(finalizedAt).toISOString().slice(0, 10);
    const key = `intent-quality:index:${date}`;
    const index = await this.state.storage.get<string[]>(key) || [];
    if (!index.includes(intentId)) await this.state.storage.put(key, [...index, intentId].sort());
    if (jobId && intentQualityJobIdValid(jobId)) {
      const jobKey = `intent-quality:job:${jobId}`;
      const existing = await this.state.storage.get<string[] | string>(jobKey);
      const intentIds = Array.isArray(existing) ? existing : typeof existing === "string" ? [existing] : [];
      if (!intentIds.includes(intentId)) await this.state.storage.put(jobKey, [...intentIds, intentId].sort());
    }
  }

  async persistIntentEvaluation(intentId: string, evaluation: HostedIntentEvaluationReceipt): Promise<void> {
    const indexKey = `intent:${intentId}:evaluation:index`;
    const index = await this.state.storage.get<string[]>(indexKey) || [];
    const next = [evaluation.evaluation_id, ...index.filter((id) => id !== evaluation.evaluation_id)].slice(0, 1_000);
    await this.state.storage.put(`intent:${intentId}:evaluation:${evaluation.evaluation_id}`, evaluation);
    await this.state.storage.put(indexKey, next);
    await this.state.storage.put(
      `intent:${intentId}:evaluation:${evaluation.evaluation_mode === "final" ? "final" : "latest-preview"}`,
      evaluation,
    );
  }

  async intentEvaluationHistory(intentId: string, registered: IntentContractRecord, url: URL): Promise<Response> {
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || "100"), 1), 250);
    const index = await this.state.storage.get<string[]>(`intent:${intentId}:evaluation:index`) || [];
    const evaluations: HostedIntentEvaluationReceipt[] = [];
    for (const evaluationId of index.slice(0, limit)) {
      const evaluation = await this.state.storage.get<HostedIntentEvaluationReceipt>(
        `intent:${intentId}:evaluation:${evaluationId}`,
      );
      if (evaluation) evaluations.push(evaluation);
    }
    const latestPreview = await this.state.storage.get<HostedIntentEvaluationReceipt>(
      `intent:${intentId}:evaluation:latest-preview`,
    );
    const finalization = await this.state.storage.get<IntentFinalizationRecord>(`intent:${intentId}:finalization`);
    const finalizationState = await this.state.storage.get<IntentFinalizationState>(`intent:${intentId}:finalization:state`);
    return json({
      intent_id: registered.intent_id,
      intent_digest: registered.intent_digest,
      job_id: registered.job_id,
      tenant_id: registered.tenant_id || "default",
      evaluations,
      count: evaluations.length,
      total_count: index.length,
      latest_preview: latestPreview,
      final: finalization?.evaluation,
      snapshot: finalization?.snapshot,
      finalization_status: finalization ? "finalized" : finalizationState?.status || "open",
    });
  }

  async appendIntentEvidence(
    source: IntentStoredEvidenceSourceName,
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
    const evidenceId = stringValue(
      record.observation_id ?? record.basis_id ?? record.decision_id ?? record.evaluation_id,
    ) || crypto.randomUUID();
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
    const finalization = await this.state.storage.get<IntentFinalizationState>(
      `intent:${resolved.record.intent_id}:finalization:state`,
    );
    if (finalization) {
      return {
        error: `intent evidence is ${finalization.status}: ${resolved.record.intent_id}`,
        errorCode: "intent_evidence_finalized",
        httpStatus: 409,
      };
    }
    const index = await this.state.storage.get<string[]>(indexKey) || [];
    const next = [evidenceId, ...index.filter((id) => id !== evidenceId)].slice(0, 2_000);
    const entries: Record<string, unknown> = {
      [recordKey]: record,
      [indexKey]: next,
    };
    if (source === "observations") entries[observationIdKey] = record;
    await this.state.storage.put(entries);
    return { record, replayed: false, httpStatus: 201 };
  }

  async intentEvidence(
    intentId: string,
    source: IntentStoredEvidenceSourceName,
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
    return { allow: false, findings: intentBinding.findings, event, errorCode: intentBinding.errorCode };
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

async function handleControlPlane(request: Request, env: Env, identity: ControlIdentity): Promise<Response> {
  const url = new URL(request.url);
  const directory = tenantDirectoryStore(env);
  if (request.method === "GET" && url.pathname === "/control-plane/session") {
    return directory.fetch(directoryRequest("/directory/session", { identity }));
  }

  if (request.method === "POST" && url.pathname === "/control-plane/tenants") {
    if (!env.AGENTID_MANIFESTS) return json({ error: "tenant manifest storage is not configured" }, 503);
    const input = await readControlJson(request);
    const tenantId = directoryId(input.tenant_id, "tenant_id");
    const displayName = directoryLabel(input.display_name, "display_name", 120);
    const sourceValue = optionalString(input.source_id)?.trim();
    const agentValue = optionalString(input.agent_id)?.trim();
    if (Boolean(sourceValue) !== Boolean(agentValue)) return json({ error: "source_id and agent_id must be provided together" }, 400);
    const sourceId = sourceValue ? directoryId(sourceValue, "source_id") : undefined;
    const agentId = agentValue ? directoryId(agentValue, "agent_id") : undefined;
    const integration = sourceIntegration(input.integration, "hermes");
    if (await env.AGENTID_MANIFESTS.get(tenantId)) return json({ error: "tenant ID is already registered", error_code: "tenant_exists" }, 409);
    const created = await directory.fetch(directoryRequest("/directory/tenants", {
      identity,
      tenant_id: tenantId,
      display_name: displayName,
    }));
    if (!created.ok) return json(await created.json(), created.status);
    const token = sourceId ? randomSecret("aa_src") : undefined;
    const tokenDigest = token ? await sha256Hex(token) : undefined;
    const manifest = newTenantManifest(tenantId, displayName, sourceId, agentId, tokenDigest, integration);
    try {
      await env.AGENTID_MANIFESTS.put(tenantId, JSON.stringify(manifest));
    } catch {
      await directory.fetch(directoryRequest(`/directory/tenants/${encodeURIComponent(tenantId)}`, { identity }, "DELETE"));
      return json({ error: "tenant manifest could not be provisioned" }, 503);
    }
    const directoryBody = await created.json() as Record<string, unknown>;
    const source = sourceId ? publicActivitySource(sourceId, activitySources(manifest)[sourceId]) : undefined;
    return json({
      schema_version: "agentaction.tenant-onboarding.v1",
      ...directoryBody,
      ...(source && token && agentId ? {
        source,
        source_token: token,
        setup: integrationSetup(integration, tenantId, sourceId, agentId),
        ...(integration === "hermes" ? { hermes: hermesSetup(tenantId, sourceId, agentId) } : {}),
      } : {}),
    }, 201);
  }

  if (request.method === "POST" && url.pathname === "/control-plane/invitations/redeem") {
    const input = await readControlJson(request);
    const code = optionalString(input.code)?.trim() || "";
    const linkedInvitationId = optionalString(input.invitation_id)?.trim() || "";
    if (Boolean(code) === Boolean(linkedInvitationId)) {
      return json({ error: "provide exactly one invitation code or invitation ID" }, 400);
    }
    let invitationId: string;
    let redemptionMethod: "code" | "email_link";
    let secretDigest: string | undefined;
    if (code) {
      const separator = code.indexOf(".");
      if (separator < 1 || separator === code.length - 1 || code.length > 300) return json({ error: "invitation code is invalid" }, 400);
      invitationId = directoryInvitationId(code.slice(0, separator));
      secretDigest = await sha256Hex(code.slice(separator + 1));
      redemptionMethod = "code";
    } else {
      invitationId = directoryInvitationId(linkedInvitationId);
      redemptionMethod = "email_link";
    }
    const redeemed = await directory.fetch(directoryRequest("/directory/invitations/redeem", {
      identity,
      invitation_id: invitationId,
      redemption_method: redemptionMethod,
      ...(secretDigest ? { secret_digest: secretDigest } : {}),
    }));
    return json(await redeemed.json(), redeemed.status);
  }

  const tenantMatch = url.pathname.match(/^\/control-plane\/tenants\/([^/]+)(?:\/(.*))?$/);
  if (!tenantMatch) return json({ error: "not found" }, 404);
  const tenantId = directoryId(decodeURIComponent(tenantMatch[1]), "tenant_id");
  const suffix = tenantMatch[2] || "";

  if (request.method === "POST" && suffix === "migrate") {
    if (!env.AGENTID_MANIFESTS) return json({ error: "tenant manifest storage is not configured" }, 503);
    const manifest = await requiredTenantManifest(env, tenantId);
    const displayName = directoryLabel(recordValue(manifest.agent).name || tenantId, "display_name", 120);
    const migrated = await directory.fetch(directoryRequest(`/directory/tenants/${encodeURIComponent(tenantId)}/migrate`, {
      identity,
      display_name: displayName,
    }));
    return json(await migrated.json(), migrated.status);
  }

  if (request.method === "GET" && suffix === "authorize") {
    const checked = await authorizeControlTenant(directory, identity, tenantId, "viewer");
    return json(await checked.json(), checked.status);
  }

  if (request.method === "GET" && suffix === "setup") {
    const checked = await authorizeControlTenant(directory, identity, tenantId, "viewer");
    if (!checked.ok) return json(await checked.json(), checked.status);
    const membership = recordValue((await checked.json() as Record<string, unknown>).membership) as TenantMembership;
    const manifest = await requiredTenantManifest(env, tenantId);
    const sources = activitySources(manifest);
    const page = await authorizationStore(env, tenantId, manifest).fetch(new Request("https://agentid.local/activity/events?limit=1"));
    const pageBody = await page.json() as { events?: ActivityEvent[] };
    const latest = Array.isArray(pageBody.events) ? pageBody.events[0] : undefined;
    let members: unknown[] = [];
    let invitations: unknown[] = [];
    if (membership.role === "owner") {
      const [membersResponse, invitationsResponse] = await Promise.all([
        directory.fetch(directoryRequest(`/directory/tenants/${encodeURIComponent(tenantId)}/members`, { identity })),
        directory.fetch(directoryRequest(`/directory/tenants/${encodeURIComponent(tenantId)}/invitations/list`, { identity })),
      ]);
      if (membersResponse.ok) members = (await membersResponse.json() as { members?: unknown[] }).members || [];
      if (invitationsResponse.ok) invitations = (await invitationsResponse.json() as { invitations?: unknown[] }).invitations || [];
    }
    return json({
      schema_version: "agentaction.tenant-setup.v1",
      tenant_id: tenantId,
      membership,
      sources: Object.entries(sources).map(([sourceId, source]) => publicActivitySource(sourceId, source)),
      members,
      invitations,
      ingestion: {
        observed: Boolean(latest),
        last_observed_at: latest?.observed_at || null,
        last_event_type: latest?.event_type || null,
        last_agent_id: latest?.agent_id || null,
      },
    });
  }

  if (request.method === "POST" && suffix === "invitations") {
    const checked = await authorizeControlTenant(directory, identity, tenantId, "owner");
    if (!checked.ok) return json(await checked.json(), checked.status);
    const input = await readControlJson(request);
    const email = directoryEmail(input.email);
    const role = directoryRole(input.role, "viewer");
    if (role === "owner") return json({ error: "invitations cannot grant owner" }, 400);
    const invitationId = randomIdentifier("invite");
    const secret = randomSecret("aa_inv");
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const created = await directory.fetch(directoryRequest(`/directory/tenants/${encodeURIComponent(tenantId)}/invitations`, {
      identity,
      invitation: {
        invitation_id: invitationId,
        email,
        role,
        secret_digest: await sha256Hex(secret),
        expires_at: expiresAt,
      },
    }));
    if (!created.ok) return json(await created.json(), created.status);
    const invitationCode = `${invitationId}.${secret}`;
    const manifest = await requiredTenantManifest(env, tenantId);
    const workspaceName = directoryLabel(recordValue(manifest.agent).name || tenantId, "workspace name", 120);
    const delivery = await deliverWorkspaceInvitation(env, {
      code: invitationCode,
      email,
      expiresAt,
      invitationId,
      inviter: identity.email || "an AgentAction workspace owner",
      role,
      workspaceName,
    });
    return json({
      ...(await created.json() as Record<string, unknown>),
      invitation_code: invitationCode,
      delivery,
    }, 201);
  }

  if (request.method === "GET" && suffix === "members") {
    const checked = await authorizeControlTenant(directory, identity, tenantId, "owner");
    if (!checked.ok) return json(await checked.json(), checked.status);
    const members = await directory.fetch(directoryRequest(`/directory/tenants/${encodeURIComponent(tenantId)}/members`, { identity }));
    return json(await members.json(), members.status);
  }

  if (request.method === "GET" && suffix === "evals") {
    const checked = await authorizeControlTenant(directory, identity, tenantId, "viewer");
    if (!checked.ok) return json(await checked.json(), checked.status);
    const manifest = await requiredTenantManifest(env, tenantId);
    const configured = await authorizationStore(env, tenantId, manifest).fetch(new Request("https://agentid.local/evals"));
    return json(await configured.json(), configured.status);
  }

  if (request.method === "POST" && suffix === "evals") {
    const checked = await authorizeControlTenant(directory, identity, tenantId, "owner");
    if (!checked.ok) return json(await checked.json(), checked.status);
    const manifest = await requiredTenantManifest(env, tenantId);
    const input = await readControlJson(request);
    const created = await authorizationStore(env, tenantId, manifest).fetch(new Request("https://agentid.local/evals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, created_by: identity.subject }),
    }));
    return json(await created.json(), created.status);
  }

  if (request.method === "POST" && suffix === "eval-assignments") {
    const checked = await authorizeControlTenant(directory, identity, tenantId, "owner");
    if (!checked.ok) return json(await checked.json(), checked.status);
    const manifest = await requiredTenantManifest(env, tenantId);
    const input = await readControlJson(request);
    const sourceId = input.source_id === undefined ? undefined : directoryId(input.source_id, "source_id");
    const agentId = input.agent_id === undefined ? undefined : directoryId(input.agent_id, "agent_id");
    const sources = activitySources(manifest);
    if (sourceId && !Object.prototype.hasOwnProperty.call(sources, sourceId)) {
      return json({ error: "eval assignment source is not in this workspace", error_code: "eval_assignment_source_not_found" }, 404);
    }
    const visibleAgentIds = new Set(Object.values(sources).flatMap((source) => arrayValue(recordValue(source).agent_ids).map(String)));
    if (agentId && !visibleAgentIds.has(agentId)) {
      return json({ error: "eval assignment agent is not in this workspace", error_code: "eval_assignment_agent_not_found" }, 404);
    }
    if (sourceId && agentId && !arrayValue(recordValue(sources[sourceId]).agent_ids).map(String).includes(agentId)) {
      return json({
        error: "eval assignment agent is not connected to the selected source",
        error_code: "eval_assignment_source_agent_mismatch",
      }, 409);
    }
    const created = await authorizationStore(env, tenantId, manifest).fetch(new Request("https://agentid.local/eval-assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...input,
        ...(sourceId ? { source_id: sourceId } : {}),
        ...(agentId ? { agent_id: agentId } : {}),
        created_by: identity.subject,
      }),
    }));
    return json(await created.json(), created.status);
  }

  if (request.method === "POST" && suffix === "sources") {
    const checked = await authorizeControlTenant(directory, identity, tenantId, "operator");
    if (!checked.ok) return json(await checked.json(), checked.status);
    const input = await readControlJson(request);
    return provisionActivitySource(
      env,
      tenantId,
      directoryId(input.source_id, "source_id"),
      directoryId(input.agent_id, "agent_id"),
      false,
      sourceIntegration(input.integration, "hermes"),
    );
  }

  const sourceMatch = suffix.match(/^sources\/([^/]+)(?:\/(rotate))?$/);
  if (sourceMatch && request.method === "POST" && sourceMatch[2] === "rotate") {
    const checked = await authorizeControlTenant(directory, identity, tenantId, "operator");
    if (!checked.ok) return json(await checked.json(), checked.status);
    const manifest = await requiredTenantManifest(env, tenantId);
    const sourceId = directoryId(decodeURIComponent(sourceMatch[1]), "source_id");
    const source = recordValue(activitySources(manifest)[sourceId]);
    if (!source.token_sha256) return json({ error: "source not found" }, 404);
    return provisionActivitySource(
      env,
      tenantId,
      sourceId,
      directoryId(arrayValue(source.agent_ids)[0], "agent_id"),
      true,
      sourceIntegration(source.integration, "hermes"),
    );
  }
  if (sourceMatch && request.method === "DELETE" && !sourceMatch[2]) {
    const checked = await authorizeControlTenant(directory, identity, tenantId, "operator");
    if (!checked.ok) return json(await checked.json(), checked.status);
    const manifest = await requiredTenantManifest(env, tenantId);
    const sourceId = directoryId(decodeURIComponent(sourceMatch[1]), "source_id");
    const sources = activitySources(manifest);
    const source = recordValue(sources[sourceId]);
    if (!source.token_sha256) return json({ error: "source not found" }, 404);
    sources[sourceId] = { ...source, enabled: false };
    await env.AGENTID_MANIFESTS!.put(tenantId, JSON.stringify(manifest));
    return json({ source: publicActivitySource(sourceId, sources[sourceId]) });
  }

  return json({ error: "not found" }, 404);
}

async function provisionActivitySource(
  env: Env,
  tenantId: string,
  sourceId: string,
  agentId: string,
  rotate: boolean,
  integration: "agentaction" | "hermes",
): Promise<Response> {
  const manifest = await requiredTenantManifest(env, tenantId);
  const sources = activitySources(manifest);
  if (!rotate && sources[sourceId]) return json({ error: "source ID is already registered" }, 409);
  const token = randomSecret("aa_src");
  sources[sourceId] = {
    enabled: true,
    token_sha256: `sha256:${await sha256Hex(token)}`,
    agent_ids: [agentId],
    integration,
    rotated_at: new Date().toISOString(),
  };
  await env.AGENTID_MANIFESTS!.put(tenantId, JSON.stringify(manifest));
  return json({
    source: publicActivitySource(sourceId, sources[sourceId]),
    source_token: token,
    setup: integrationSetup(integration, tenantId, sourceId, agentId),
    ...(integration === "hermes" ? { hermes: hermesSetup(tenantId, sourceId, agentId) } : {}),
  }, rotate ? 200 : 201);
}

function newTenantManifest(
  tenantId: string,
  displayName: string,
  sourceId?: string,
  agentId?: string,
  tokenDigest?: string,
  integration: "agentaction" | "hermes" = "hermes",
): AgentIdManifest {
  const sources = sourceId && agentId && tokenDigest ? {
    [sourceId]: {
      enabled: true,
      token_sha256: `sha256:${tokenDigest}`,
      agent_ids: [agentId],
      integration,
      created_at: new Date().toISOString(),
    },
  } : {};
  return {
    agent: {
      id: agentId || tenantId,
      name: displayName,
      owner: tenantId,
      environment: "production",
      purpose: "AgentAction shadow observability",
    },
    tools: [],
    data_flows: [],
    runtime: { enforce_manifest: false },
    observability: {
      ingestion: {
        sources,
      },
    },
  };
}

function activitySources(manifest: AgentIdManifest): Record<string, Record<string, unknown>> {
  const observability = recordValue(manifest.observability);
  const ingestion = recordValue(observability.ingestion);
  if (!ingestion.sources || typeof ingestion.sources !== "object" || Array.isArray(ingestion.sources)) ingestion.sources = {};
  observability.ingestion = ingestion;
  manifest.observability = observability;
  return ingestion.sources as Record<string, Record<string, unknown>>;
}

function publicActivitySource(sourceId: string, value: unknown): Record<string, unknown> {
  const source = recordValue(value);
  return {
    source_id: sourceId,
    enabled: source.enabled === true,
    integration: sourceIntegration(source.integration, "hermes"),
    agent_ids: arrayValue(source.agent_ids),
    created_at: optionalString(source.created_at) || null,
    rotated_at: optionalString(source.rotated_at) || null,
  };
}

function sourceIntegration(value: unknown, fallback: "agentaction" | "hermes"): "agentaction" | "hermes" {
  const integration = optionalString(value)?.trim();
  if (!integration) return fallback;
  if (integration === "agentaction" || integration === "hermes") return integration;
  throw new Error("integration is invalid");
}

function integrationSetup(
  integration: "agentaction" | "hermes",
  tenantId: string,
  sourceId: string,
  agentId: string,
): Record<string, string> {
  const environment = "AGENTACTION_INGEST_TOKEN=<one-time-token>";
  if (integration === "hermes") {
    return { integration, environment, configuration: hermesSetup(tenantId, sourceId, agentId).yaml };
  }
  return {
    integration,
    environment,
    configuration: [
      "AGENTACTION_GATEWAY=https://agentid-gateway.drisw.workers.dev",
      `AGENTACTION_TENANT_ID=${tenantId}`,
      `AGENTACTION_SOURCE_ID=${sourceId}`,
      `AGENTACTION_AGENT_ID=${agentId}`,
    ].join("\n"),
  };
}

function hermesSetup(tenantId: string, sourceId: string, agentId: string): Record<string, string> {
  return {
    environment: "AGENTACTION_INGEST_TOKEN=<one-time-token>",
    yaml: [
      "plugins:",
      "  entries:",
      "    agentaction:",
      "      settings:",
      "        endpoint: https://agentid-gateway.drisw.workers.dev",
      `        tenant_id: ${tenantId}`,
      `        source_id: ${sourceId}`,
      `        agent_id: ${agentId}`,
      "        capture_declared_intent: true",
    ].join("\n"),
  };
}

async function deliverWorkspaceInvitation(
  env: Env,
  invitation: {
    code: string;
    email: string;
    expiresAt: string;
    invitationId: string;
    inviter: string;
    role: Exclude<TenantRole, "owner">;
    workspaceName: string;
  },
): Promise<{ status: "failed" | "sent" | "unavailable" }> {
  const fromEmail = optionalString(env.AGENTACTION_INVITATION_FROM_EMAIL)?.trim().toLowerCase() || "";
  const consoleUrl = optionalString(env.AGENTACTION_CONSOLE_URL)?.trim() || "";
  if (!env.INVITATION_EMAIL || !fromEmail || !consoleUrl) return { status: "unavailable" };

  let baseUrl: URL;
  try {
    baseUrl = new URL(consoleUrl);
  } catch {
    return { status: "unavailable" };
  }
  if (baseUrl.protocol !== "https:" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
    return { status: "unavailable" };
  }

  baseUrl.search = "";
  baseUrl.hash = "";
  baseUrl.searchParams.set("invitation", invitation.invitationId);
  baseUrl.hash = "setup";
  const inviteUrl = baseUrl.toString();
  const roleLabel = invitation.role === "operator" ? "Operator" : "Viewer";
  const text = [
    `You have been invited to ${invitation.workspaceName} in AgentAction Observability.`,
    "",
    `Invited by: ${invitation.inviter}`,
    `Role: ${roleLabel}`,
    `Expires: ${invitation.expiresAt}`,
    "",
    "To join:",
    "1. Open the secure invitation link below.",
    `2. Sign in through Cloudflare Access as ${invitation.email}.`,
    "3. After sign-in, the console redeems the invitation automatically for that exact email.",
    "4. Select the workspace from the Workspace menu if it is not already selected.",
    "",
    inviteUrl,
    "",
    "Fallback invitation code:",
    invitation.code,
    "",
    "The invitation is email-bound, expires after seven days, and can be used once. If Cloudflare Access blocks sign-in, ask the workspace owner to add your email to the console Access policy.",
  ].join("\n");
  const html = `<h1>Join ${htmlEscape(invitation.workspaceName)}</h1>
    <p>You have been invited to an AgentAction Observability workspace.</p>
    <dl>
      <dt>Invited by</dt><dd>${htmlEscape(invitation.inviter)}</dd>
      <dt>Role</dt><dd>${roleLabel}</dd>
      <dt>Expires</dt><dd>${htmlEscape(invitation.expiresAt)}</dd>
    </dl>
    <p><a href="${htmlEscape(inviteUrl)}">Open the secure invitation</a></p>
    <ol>
      <li>Sign in through Cloudflare Access as ${htmlEscape(invitation.email)}.</li>
      <li>After sign-in, the console redeems the invitation automatically for that exact email.</li>
      <li>Select ${htmlEscape(invitation.workspaceName)} from the Workspace menu if it is not already selected.</li>
    </ol>
    <p>If automatic redemption fails, paste this one-time code into Setup:</p>
    <p><code>${htmlEscape(invitation.code)}</code></p>
    <p>This invitation is email-bound, expires after seven days, and can be used once. If Cloudflare Access blocks sign-in, ask the workspace owner to add your email to the console Access policy.</p>`;
  try {
    await env.INVITATION_EMAIL.send({
      from: { email: fromEmail, name: "AgentAction" },
      to: invitation.email,
      subject: `Join ${invitation.workspaceName} in AgentAction Observability`,
      text,
      html,
    });
    return { status: "sent" };
  } catch {
    return { status: "failed" };
  }
}

function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

async function requiredTenantManifest(env: Env, tenantId: string): Promise<AgentIdManifest> {
  if (!env.AGENTID_MANIFESTS) throw new TenantManifestError(503, "tenant manifest storage is not configured");
  const raw = await env.AGENTID_MANIFESTS.get(tenantId);
  if (!raw) throw new TenantManifestError(404, "tenant manifest not found");
  return JSON.parse(raw) as AgentIdManifest;
}

function tenantDirectoryStore(env: Env) {
  return env.JIT_GRANTS.get(env.JIT_GRANTS.idFromName("__agentaction_tenant_directory__"));
}

function directoryRequest(path: string, body: Record<string, unknown>, method = "POST"): Request {
  return new Request(`https://agentid.local${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function authorizeControlTenant(
  directory: { fetch(request: Request): Promise<Response> },
  identity: ControlIdentity,
  tenantId: string,
  minimumRole: TenantRole,
): Promise<Response> {
  return directory.fetch(directoryRequest("/directory/authorize", { identity, tenant_id: tenantId, minimum_role: minimumRole }));
}

async function readControlJson(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) throw new Error("control plane content-type must be application/json");
  const declared = Number(request.headers.get("content-length") || "0");
  if (declared > 32_768) throw new Error("control plane request exceeds 32 KiB");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("control plane request body is required");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > 32_768) {
      await reader.cancel();
      throw new Error("control plane request exceeds 32 KiB");
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return recordValue(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch {
    throw new Error("control plane request must be valid JSON");
  }
}

function controlIdentity(request: Request): ControlIdentity {
  const subject = directoryLabel(request.headers.get("x-agentaction-console-subject"), "console subject", 256);
  const issuer = directoryLabel(request.headers.get("x-agentaction-console-issuer"), "console issuer", 256);
  const emailValue = request.headers.get("x-agentaction-console-email");
  const claimedTenant = request.headers.get("x-agentaction-console-tenant-id");
  const claimedRole = request.headers.get("x-agentaction-console-role");
  return {
    subject,
    issuer,
    ...(emailValue ? { email: directoryEmail(emailValue) } : {}),
    ...(claimedTenant ? { claimed_tenant_id: directoryId(claimedTenant, "claimed tenant") } : {}),
    ...(claimedRole ? { claimed_role: directoryRole(claimedRole, "viewer") } : {}),
  };
}

function directoryIdentity(value: unknown): ControlIdentity {
  const input = recordValue(value);
  const subject = directoryLabel(input.subject, "subject", 256);
  const issuer = directoryLabel(input.issuer, "issuer", 256);
  return {
    subject,
    issuer,
    ...(input.email ? { email: directoryEmail(input.email) } : {}),
    ...(input.claimed_tenant_id ? { claimed_tenant_id: directoryId(input.claimed_tenant_id, "claimed tenant") } : {}),
    ...(input.claimed_role ? { claimed_role: directoryRole(input.claimed_role, "viewer") } : {}),
  };
}

function directoryId(value: unknown, label: string): string {
  const id = stringValue(value).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(id)) throw new Error(`${label} is invalid`);
  return id;
}

function directoryInvitationId(value: unknown): string {
  const id = stringValue(value).trim();
  if (!/^invite_[a-f0-9]{24}$/.test(id)) throw new Error("invitation_id is invalid");
  return id;
}

function directoryLabel(value: unknown, label: string, maximum: number): string {
  const result = stringValue(value).trim();
  if (!result || result.length > maximum || /[\u0000-\u001f]/.test(result)) throw new Error(`${label} is invalid`);
  return result;
}

function directoryEmail(value: unknown): string {
  const email = stringValue(value).trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("email is invalid");
  return email;
}

function directoryRole(value: unknown, fallback: TenantRole): TenantRole {
  const role = stringValue(value) || fallback;
  if (role !== "owner" && role !== "operator" && role !== "viewer") throw new Error("tenant role is invalid");
  return role;
}

function roleAllows(actual: TenantRole, minimum: TenantRole): boolean {
  const rank: Record<TenantRole, number> = { viewer: 1, operator: 2, owner: 3 };
  return rank[actual] >= rank[minimum];
}

function publicInvitation(invitation: TenantInvitation): Record<string, unknown> {
  return {
    invitation_id: invitation.invitation_id,
    tenant_id: invitation.tenant_id,
    email: invitation.email,
    role: invitation.role,
    created_at: invitation.created_at,
    expires_at: invitation.expires_at,
    redeemed_at: invitation.redeemed_at || null,
  };
}

async function directorySubjectKey(issuer: string, subject: string): Promise<string> {
  return `directory:principal:${await sha256Hex(`${issuer}\u0000${subject}`)}`;
}

async function directoryMembershipKey(issuer: string, subject: string, tenantId: string): Promise<string> {
  return `${await directorySubjectKey(issuer, subject)}:membership:${tenantId}`;
}

function randomIdentifier(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `${prefix}_${[...bytes].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function randomSecret(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const encoded = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${prefix}_${encoded}`;
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
): Promise<{ contract?: IntentContract; findings: string[]; errorCode?: string }> {
  const response = await authorizationStore(env, tenantId, manifest).fetch(
    new Request("https://agentid.local/intent-contracts/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event }),
    }),
  );
  const body = await response.json() as IntentBindingResult & { error?: string; findings?: string[] };
  if (!response.ok) {
    return {
      findings: body.findings || [body.error || "intent binding could not be resolved"],
      errorCode: body.error_code,
    };
  }
  return { contract: body.contract, findings: [] };
}

async function recordIntentDecisionEvidence(
  env: Env,
  tenantId: string | null,
  manifest: AgentIdManifest,
  decision: AuthorizationDecision,
): Promise<void> {
  if (decision.event.intent_registry_bound !== true) return;
  const decidedAt = new Date().toISOString();
  const basis = await createBoundaryDecisionBasis(
    manifest,
    decision,
    tenantId,
    env.AGENTID_RECEIPT_ISSUER || "agentpass.gateway",
    decidedAt,
  );
  decision.event.decision_basis_id = basis.basis_id;
  decision.event.reason_codes = basis.factors.map((factor) => factor.code);
  const record = {
    ...decision.event,
    schema_version: "agentpass.intent-decision-evidence.v1",
    decision: decision.allow ? "allow" : decision.challengeRequired ? "challenge_required" : "deny",
    allow: decision.allow,
    findings: decision.findings,
    reason_codes: decision.event.reason_codes,
    decided_at: decidedAt,
    replayed: decision.replayed === true,
  };
  const stored = await authorizationStore(env, tenantId, manifest).fetch(
    new Request("https://agentid.local/intent-evidence/decision-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: record, basis }),
    }),
  );
  if (!stored.ok) {
    const body = await stored.json() as { error?: string };
    throw new Error(body.error || "intent decision evidence could not be stored");
  }
}

export async function createBoundaryDecisionBasis(
  manifest: AgentIdManifest,
  decision: AuthorizationDecision,
  tenantId: string | null,
  issuer = "agentpass.gateway",
  createdAt = new Date().toISOString(),
): Promise<DecisionBasis> {
  const decisionId = stringValue(decision.event.decision_id);
  const conclusionCode = decision.allow ? "allow" : decision.challengeRequired ? "challenge_required" : "deny";
  const policyRef = optionalString(decision.event.policy_version ?? recordValue(manifest.runtime).policy_version)
    || `manifest:sha256:${await canonicalDigest(manifest)}`;
  const inputDigest = await approvalRequestDigest(decision.event);
  const producerSubject = optionalString(recordValue(manifest.runtime).boundary_id) || "agentpass-gateway";
  const resolvedTenantId = tenantId || stringValue(decision.event.tenant_id) || "default";
  const basisId = `basis_${(await canonicalDigest({
    tenant_id: resolvedTenantId,
    intent_id: stringValue(decision.event.intent_id),
    decision_id: decisionId,
  })).slice(0, 24)}`;
  return buildBoundaryDecisionBasis({
    basis_id: basisId,
    decision_id: decisionId,
    decision: conclusionCode,
    findings: decision.findings,
    policy_ref: policyRef,
    approval_id: optionalString(decision.event.approval_id),
    grant_id: optionalString(decision.event.jit_grant_id),
    action_digest: inputDigest.replace(/^sha256:/, ""),
    issuer,
    producer_subject: producerSubject,
    tenant_id: resolvedTenantId,
    intent_id: optionalString(decision.event.intent_id),
    intent_digest: optionalString(decision.event.intent_digest),
    job_id: optionalString(decision.event.job_id),
    created_at: createdAt,
  });
}

function auditStore(env: Env) {
  return env.JIT_GRANTS.get(env.JIT_GRANTS.idFromName("audit"));
}

const INTENT_QUALITY_MAX_WINDOW_MS = 90 * 24 * 60 * 60 * 1_000;
const INTENT_QUALITY_LOW_CONFIDENCE = 0.75;
const INTENT_QUALITY_HIGH_CONFIDENCE = 0.9;

function intentQualityDateBuckets(from: string, to: string): string[] {
  const start = new Date(from);
  let cursor = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const end = Date.parse(to);
  const dates: string[] = [];
  while (cursor < end) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 24 * 60 * 60 * 1_000;
  }
  return dates;
}

function parseIntentQualityFilters(url: URL): {
  filters?: IntentQualityFilters;
  error?: string;
  errorCode?: string;
} {
  const fromInput = optionalString(url.searchParams.get("from"));
  const toInput = optionalString(url.searchParams.get("to"));
  if (!fromInput || !toInput) {
    return {
      error: "intent quality rollups require from and to date-time parameters",
      errorCode: "intent_quality_time_window_required",
    };
  }
  const fromMs = Date.parse(fromInput);
  const toMs = Date.parse(toInput);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
    return {
      error: "intent quality time window must contain valid date-times with from before to",
      errorCode: "intent_quality_time_window_invalid",
    };
  }
  if (toMs - fromMs > INTENT_QUALITY_MAX_WINDOW_MS) {
    return {
      error: "intent quality time window cannot exceed 90 days",
      errorCode: "intent_quality_time_window_too_large",
    };
  }

  const verdict = optionalString(url.searchParams.get("verdict"));
  if (verdict && !["completed", "partial", "failed", "indeterminate"].includes(verdict)) {
    return { error: `unsupported intent quality verdict: ${verdict}`, errorCode: "intent_quality_filter_invalid" };
  }
  const compliance = optionalString(url.searchParams.get("constraint_compliance"));
  if (compliance && !["pass", "fail", "indeterminate"].includes(compliance)) {
    return {
      error: `unsupported intent quality constraint_compliance: ${compliance}`,
      errorCode: "intent_quality_filter_invalid",
    };
  }
  const minimumSampleSize = boundedIntegerQuery(url, "minimum_sample_size", 5, 1, 1_000);
  if (minimumSampleSize === null) {
    return { error: "minimum_sample_size must be an integer from 1 to 1000", errorCode: "intent_quality_filter_invalid" };
  }
  const limit = boundedIntegerQuery(url, "limit", 25, 1, 100);
  if (limit === null) {
    return { error: "limit must be an integer from 1 to 100", errorCode: "intent_quality_filter_invalid" };
  }

  return {
    filters: {
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
      ...(optionalString(url.searchParams.get("profile_key"))
        ? { profile_key: stringValue(url.searchParams.get("profile_key")) }
        : {}),
      ...(optionalString(url.searchParams.get("profile_version"))
        ? { profile_version: stringValue(url.searchParams.get("profile_version")) }
        : {}),
      ...(optionalString(url.searchParams.get("agent_id"))
        ? { agent_id: stringValue(url.searchParams.get("agent_id")) }
        : {}),
      ...(verdict ? { verdict: verdict as IntentEvaluationReceipt["verdict"] } : {}),
      ...(compliance
        ? { constraint_compliance: compliance as IntentEvaluationReceipt["constraint_compliance"] }
        : {}),
      minimum_sample_size: minimumSampleSize,
      limit,
      ...(optionalString(url.searchParams.get("cursor"))
        ? { cursor: stringValue(url.searchParams.get("cursor")) }
        : {}),
    },
  };
}

function parseIntentQualityJobsFilters(url: URL): {
  filters?: IntentQualityJobsFilters;
  error?: string;
  errorCode?: string;
} {
  const fromInput = optionalString(url.searchParams.get("from"));
  const toInput = optionalString(url.searchParams.get("to"));
  if (!fromInput || !toInput) {
    return {
      error: "intent quality jobs require from and to date-time parameters",
      errorCode: "intent_quality_time_window_required",
    };
  }
  const fromMs = Date.parse(fromInput);
  const toMs = Date.parse(toInput);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
    return {
      error: "intent quality time window must contain valid date-times with from before to",
      errorCode: "intent_quality_time_window_invalid",
    };
  }
  if (toMs - fromMs > INTENT_QUALITY_MAX_WINDOW_MS) {
    return {
      error: "intent quality time window cannot exceed 90 days",
      errorCode: "intent_quality_time_window_too_large",
    };
  }

  const verdict = optionalString(url.searchParams.get("verdict"));
  if (verdict && !["completed", "partial", "failed", "indeterminate"].includes(verdict)) {
    return { error: `unsupported intent quality verdict: ${verdict}`, errorCode: "intent_quality_filter_invalid" };
  }
  const compliance = optionalString(url.searchParams.get("constraint_compliance"));
  if (compliance && !["pass", "fail", "indeterminate"].includes(compliance)) {
    return {
      error: `unsupported intent quality constraint_compliance: ${compliance}`,
      errorCode: "intent_quality_filter_invalid",
    };
  }
  const confidence = optionalString(url.searchParams.get("confidence"));
  if (confidence && !["low", "medium", "high"].includes(confidence)) {
    return {
      error: `unsupported intent quality confidence: ${confidence}`,
      errorCode: "intent_quality_filter_invalid",
    };
  }
  const limit = boundedIntegerQuery(url, "limit", 50, 1, 100);
  if (limit === null) {
    return { error: "limit must be an integer from 1 to 100", errorCode: "intent_quality_filter_invalid" };
  }
  for (const name of ["profile_key", "profile_version", "agent_id", "job_id", "intent_id"]) {
    const value = optionalString(url.searchParams.get(name));
    if (value && value.length > 160) {
      return { error: `${name} cannot exceed 160 characters`, errorCode: "intent_quality_filter_invalid" };
    }
  }
  const cursor = optionalString(url.searchParams.get("cursor"));
  if (cursor && cursor.length > 1_024) {
    return { error: "cursor cannot exceed 1024 characters", errorCode: "intent_quality_jobs_cursor_invalid" };
  }

  return {
    filters: {
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
      ...(optionalString(url.searchParams.get("profile_key"))
        ? { profile_key: stringValue(url.searchParams.get("profile_key")) }
        : {}),
      ...(optionalString(url.searchParams.get("profile_version"))
        ? { profile_version: stringValue(url.searchParams.get("profile_version")) }
        : {}),
      ...(optionalString(url.searchParams.get("agent_id"))
        ? { agent_id: stringValue(url.searchParams.get("agent_id")) }
        : {}),
      ...(verdict ? { verdict: verdict as IntentEvaluationReceipt["verdict"] } : {}),
      ...(compliance
        ? { constraint_compliance: compliance as IntentEvaluationReceipt["constraint_compliance"] }
        : {}),
      ...(confidence ? { confidence: confidence as IntentQualityJobsFilters["confidence"] } : {}),
      ...(optionalString(url.searchParams.get("job_id"))
        ? { job_id: stringValue(url.searchParams.get("job_id")) }
        : {}),
      ...(optionalString(url.searchParams.get("intent_id"))
        ? { intent_id: stringValue(url.searchParams.get("intent_id")) }
        : {}),
      limit,
      ...(cursor ? { cursor } : {}),
    },
  };
}

function boundedIntegerQuery(url: URL, name: string, fallback: number, minimum: number, maximum: number): number | null {
  const input = url.searchParams.get(name);
  if (input === null || input === "") return fallback;
  const value = Number(input);
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : null;
}

function intentQualityRecord(value: unknown): {
  record?: IntentQualityRecord;
  error?: "invalid_final_receipt" | "unversioned_profile";
} {
  const finalization = recordValue(value) as IntentFinalizationRecord;
  const evaluation = finalization.evaluation;
  const snapshot = finalization.snapshot;
  const discipline = recordValue(evaluation?.execution_discipline);
  const requiredDisciplineMetrics = [
    "tool_calls",
    "execution_receipts",
    "executions",
    "replays",
    "retries",
    "denied_decisions",
    "challenge_decisions",
    "estimated_cost_usd",
  ];
  if (
    finalization.schema_version !== "agentpass.intent-finalization.v1" ||
    evaluation?.schema_version !== "agentpass.intent-evaluation.v1" ||
    !["agentpass.intent-evidence-snapshot.v1", "agentpass.intent-evidence-snapshot.v2"].includes(
      stringValue(snapshot?.schema_version),
    ) ||
    evaluation?.evaluation_mode !== "final" ||
    !evaluation.snapshot_id ||
    !evaluation.evidence_digest ||
    evaluation.snapshot_id !== snapshot?.snapshot_id ||
    evaluation.evidence_digest !== snapshot?.evidence_digest ||
    evaluation.intent_id !== snapshot?.intent_id ||
    evaluation.intent_digest !== snapshot?.intent_digest ||
    evaluation.job_id !== snapshot?.job_id ||
    !snapshot.tenant_id ||
    !snapshot.evidence ||
    !Array.isArray(snapshot.evidence.decision_events) ||
    (snapshot.schema_version === "agentpass.intent-evidence-snapshot.v2" && !Array.isArray(snapshot.evidence.decision_bases)) ||
    !Array.isArray(snapshot.evidence.execution_receipts) ||
    !Array.isArray(snapshot.evidence.observations) ||
    !Number.isFinite(Date.parse(finalization.finalized_at)) ||
    Date.parse(evaluation.evaluated_at) !== Date.parse(finalization.finalized_at) ||
    Date.parse(snapshot.captured_at) !== Date.parse(finalization.finalized_at) ||
    !["completed", "partial", "failed", "indeterminate"].includes(evaluation.verdict) ||
    !["pass", "fail", "indeterminate"].includes(evaluation.constraint_compliance) ||
    typeof evaluation.qualified_success !== "boolean" ||
    !qualityMetricInRange(evaluation.goal_attainment, 0, 1) ||
    !qualityMetricInRange(evaluation.evidence_confidence, 0, 1) ||
    requiredDisciplineMetrics.some((field) => !qualityMetricInRange(discipline[field], 0)) ||
    (discipline.runtime_ms !== undefined && !qualityMetricInRange(discipline.runtime_ms, 0)) ||
    ![true, false, null].includes(discipline.preferences_met as boolean | null)
  ) {
    return { error: "invalid_final_receipt" };
  }
  if (!evaluation.profile_version || !evaluation.profile_digest || !evaluation.profile) {
    return { error: "unversioned_profile" };
  }
  if (
    !evaluation.profile.endsWith(`.${evaluation.profile_version}`) ||
    !/^[a-f0-9]{64}$/.test(evaluation.profile_digest)
  ) return { error: "invalid_final_receipt" };
  const jobEvidence = recordValue(snapshot.evidence.job);
  const evalBinding = intentQualityEvalBinding(jobEvidence, evaluation);
  if (jobEvidence.eval_binding !== undefined && !evalBinding) {
    return { error: "invalid_final_receipt" };
  }
  const expectsDeclaredContext = evalBinding?.kind === "agent_declared" || evaluation.profile === "agentaction_declared_intent.v1";
  const intentContext = expectsDeclaredContext ? intentQualityDeclaredContext(snapshot.evidence.job) : undefined;
  const modelUsage = intentQualityModelUsage(snapshot.evidence.job);
  if (expectsDeclaredContext && !intentContext) {
    return { error: "invalid_final_receipt" };
  }
  const agentIds = new Set<string>();
  const jobAgent = optionalString(recordValue(snapshot.evidence.job).agent_id);
  if (jobAgent) agentIds.add(jobAgent);
  for (const event of snapshot.evidence.decision_events || []) {
    const agentId = optionalString(recordValue(event).agent_id);
    if (agentId) agentIds.add(agentId);
  }
  for (const receipt of snapshot.evidence.execution_receipts || []) {
    const agentId = optionalString(recordValue(receipt).agent_id);
    if (agentId) agentIds.add(agentId);
  }
  return {
    record: {
      tenant_id: snapshot.tenant_id,
      profile_key: evaluation.profile,
      profile_version: evaluation.profile_version,
      profile_digest: evaluation.profile_digest,
      intent_id: evaluation.intent_id,
      intent_digest: evaluation.intent_digest,
      job_id: evaluation.job_id,
      agent_ids: [...agentIds].sort(),
      finalized_at: new Date(finalization.finalized_at).toISOString(),
      evaluation,
      ...(evalBinding ? { eval_binding: evalBinding } : {}),
      ...(intentContext ? { intent_context: intentContext } : {}),
      ...(modelUsage ? { model_usage: modelUsage } : {}),
    },
  };
}

function intentQualityDeclaredContext(
  jobValue: unknown,
): AgentDeclaredIntentContext | undefined {
  const job = recordValue(jobValue);
  const declaration = recordValue(job.declared_intent);
  if (
    declaration.schema_version !== "agentaction.declared-intent.v1" ||
    declaration.provenance !== "agent_declared"
  ) return undefined;
  const goal = optionalString(declaration.goal);
  const criteria = intentQualityBoundedTextList(declaration.success_criteria, 1, 8, 240);
  const constraints = intentQualityBoundedTextList(declaration.constraints, 0, 8, 240);
  const declarationConfidence = declaration.confidence;
  if (
    !goal || goal !== goal.trim() || goal.length > 500 ||
    !criteria || !constraints ||
    typeof declarationConfidence !== "number" ||
    !Number.isFinite(declarationConfidence) ||
    declarationConfidence < 0 || declarationConfidence > 1
  ) return undefined;

  const outcome = recordValue(job.reported_outcome);
  let reportedOutcome: AgentDeclaredIntentContext["reported_outcome"];
  if (Object.keys(outcome).length > 0) {
    if (
      outcome.schema_version !== "agentaction.reported-outcome.v1" ||
      outcome.provenance !== "agent_self_attested" ||
      !["achieved", "partial", "failed", "unknown"].includes(String(outcome.status)) ||
      !["all", "some", "none", "unknown"].includes(String(outcome.success_criteria_met)) ||
      !["pass", "fail", "unknown"].includes(String(outcome.constraints_respected)) ||
      typeof outcome.confidence !== "number" ||
      !Number.isFinite(outcome.confidence) ||
      outcome.confidence < 0 || outcome.confidence > 1
    ) return undefined;
    reportedOutcome = {
      status: outcome.status as AgentReportedOutcome["status"],
      success_criteria_met: outcome.success_criteria_met as AgentReportedOutcome["success_criteria_met"],
      constraints_respected: outcome.constraints_respected as AgentReportedOutcome["constraints_respected"],
      confidence: outcome.confidence,
    };
  }
  return {
    kind: "agent_declared",
    trust: "self_attested",
    goal,
    success_criteria: criteria,
    constraints,
    declaration_confidence: declarationConfidence,
    ...(reportedOutcome ? { reported_outcome: reportedOutcome } : {}),
  };
}

function intentQualityEvalBinding(
  jobValue: unknown,
  evaluation: HostedIntentEvaluationReceipt,
): EvalBinding | undefined {
  const binding = recordValue(recordValue(jobValue).eval_binding);
  if (Object.keys(binding).length === 0) {
    const legacyKind = evaluation.profile === "agentaction_declared_intent.v1"
      ? "agent_declared"
      : evaluation.profile === "agentaction_observed_execution.v1"
        ? "observed_execution"
        : undefined;
    if (!legacyKind || !evaluation.profile_version || !evaluation.profile_digest) return undefined;
    return {
      schema_version: "agentaction.eval-binding.v1",
      eval_id: legacyKind === "agent_declared" ? "agentaction_declared_intent" : "agentaction_observed_execution",
      version: evaluation.profile_version,
      kind: legacyKind,
      trust: legacyKind === "agent_declared" ? "agent_self_attested" : "trusted_execution_state",
      profile_key: evaluation.profile,
      profile_digest: evaluation.profile_digest,
      assignment_id: `legacy_implicit_${legacyKind}`,
    };
  }
  const kind = binding.kind;
  const trust = binding.trust;
  const specificationFields = [
    binding.specification_digest !== undefined,
    binding.pass_threshold !== undefined,
    binding.required_criteria !== undefined,
  ].filter(Boolean).length;
  if (
    binding.schema_version !== "agentaction.eval-binding.v1" ||
    !EVAL_ID.test(stringValue(binding.eval_id)) ||
    !EVAL_VERSION.test(stringValue(binding.version)) ||
    (kind !== "agent_declared" && kind !== "observed_execution") ||
    trust !== (kind === "agent_declared" ? "agent_self_attested" : "trusted_execution_state") ||
    binding.profile_key !== evaluation.profile ||
    binding.profile_digest !== evaluation.profile_digest ||
    binding.version !== evaluation.profile_version ||
    binding.eval_id !== evalIdFromProfile(evaluation.profile, evaluation.profile_version) ||
    !ACTIVITY_ID.test(stringValue(binding.assignment_id)) ||
    (specificationFields !== 0 && specificationFields !== 3) ||
    (specificationFields === 3 && (
      !/^[a-f0-9]{64}$/.test(stringValue(binding.specification_digest)) ||
      !qualityMetricInRange(binding.pass_threshold, 0, 1) ||
      !Array.isArray(binding.required_criteria) ||
      binding.required_criteria.length > 20 ||
      !binding.required_criteria.every((criterionId: unknown) => (
        typeof criterionId === "string" && EVAL_CRITERION_ID.test(criterionId)
      ))
    ))
  ) return undefined;
  return binding as EvalBinding;
}

function intentQualityModelUsage(jobValue: unknown): ModelUsageSummary | undefined {
  const value = recordValue(jobValue).model_usage;
  if (value === undefined) return undefined;
  try {
    return validateModelUsage(value);
  } catch {
    return undefined;
  }
}

function intentQualityBoundedTextList(
  value: unknown,
  minimum: number,
  maximum: number,
  maximumLength: number,
): string[] | undefined {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) return undefined;
  const result = value.filter((item): item is string => (
    typeof item === "string" && Boolean(item) && item === item.trim() && item.length <= maximumLength
  ));
  if (result.length !== value.length || new Set(result).size !== result.length) return undefined;
  return result;
}

function intentQualityGroupKey(record: IntentQualityRecord): string {
  return `${record.profile_key}|${record.profile_version}|${record.profile_digest}`;
}

function intentQualityResponseFilters(filters: IntentQualityFilters): Record<string, unknown> {
  return {
    time_window: { from: filters.from, to: filters.to, boundary: "[from,to)", maximum_days: 90 },
    ...(filters.profile_key ? { profile_key: filters.profile_key } : {}),
    ...(filters.profile_version ? { profile_version: filters.profile_version } : {}),
    ...(filters.agent_id ? { agent_id: filters.agent_id } : {}),
    ...(filters.verdict ? { verdict: filters.verdict } : {}),
    ...(filters.constraint_compliance ? { constraint_compliance: filters.constraint_compliance } : {}),
    minimum_sample_size: filters.minimum_sample_size,
  };
}

function intentQualityJobsResponseFilters(filters: IntentQualityJobsFilters): Record<string, unknown> {
  return {
    time_window: { from: filters.from, to: filters.to, boundary: "[from,to)", maximum_days: 90 },
    ...(filters.profile_key ? { profile_key: filters.profile_key } : {}),
    ...(filters.profile_version ? { profile_version: filters.profile_version } : {}),
    ...(filters.agent_id ? { agent_id: filters.agent_id } : {}),
    ...(filters.verdict ? { verdict: filters.verdict } : {}),
    ...(filters.constraint_compliance ? { constraint_compliance: filters.constraint_compliance } : {}),
    ...(filters.confidence ? { confidence: filters.confidence } : {}),
    ...(filters.job_id ? { job_id: filters.job_id } : {}),
    ...(filters.intent_id ? { intent_id: filters.intent_id } : {}),
  };
}

function intentQualityConfidenceBand(value: number): "low" | "medium" | "high" {
  if (value >= INTENT_QUALITY_HIGH_CONFIDENCE) return "high";
  if (value >= INTENT_QUALITY_LOW_CONFIDENCE) return "medium";
  return "low";
}

function encodeIntentQualityJobsCursor(record: IntentQualityRecord): string {
  return base64UrlJson({
    schema_version: "agentpass.intent-quality-jobs-cursor.v1",
    finalized_at: record.finalized_at,
    intent_id: record.intent_id,
  });
}

function decodeIntentQualityJobsCursor(value: string): { finalized_at: string; intent_id: string } | null {
  try {
    const parsed = JSON.parse(base64UrlDecode(value));
    const cursor = recordValue(parsed);
    if (
      cursor.schema_version !== "agentpass.intent-quality-jobs-cursor.v1" ||
      typeof cursor.finalized_at !== "string" ||
      new Date(cursor.finalized_at).toISOString() !== cursor.finalized_at ||
      typeof cursor.intent_id !== "string" ||
      !cursor.intent_id ||
      cursor.intent_id.length > 160
    ) return null;
    return { finalized_at: cursor.finalized_at, intent_id: cursor.intent_id };
  } catch {
    return null;
  }
}

function intentQualityJob(record: IntentQualityRecord, previewCount: number): Record<string, unknown> {
  const discipline = recordValue(record.evaluation.execution_discipline);
  const confidenceBand = intentQualityConfidenceBand(record.evaluation.evidence_confidence);
  const runtime = typeof discipline.runtime_ms === "number" && Number.isFinite(discipline.runtime_ms)
    ? discipline.runtime_ms
    : null;
  const findings: string[] = [];
  const criterionEvaluation = intentQualityCriterionEvaluation(record.evaluation.criterion_evaluation);
  if (record.agent_ids.length === 0) findings.push("agent identity is missing");
  if (runtime === null) findings.push("runtime metric is missing");
  if (confidenceBand === "low") findings.push("final receipt has low evidence confidence");
  if (
    record.evaluation.verdict === "indeterminate" ||
    record.evaluation.constraint_compliance === "indeterminate"
  ) findings.push("final receipt contains an indeterminate outcome");
  return {
    schema_version: "agentpass.intent-quality-job.v1",
    tenant_id: record.tenant_id,
    finalized_at: record.finalized_at,
    final_status: "finalized",
    job_id: record.job_id,
    intent_id: record.intent_id,
    agent_id: record.agent_ids[0] || null,
    agent_ids: record.agent_ids,
    profile_binding: {
      key: record.profile_key,
      version: record.profile_version,
      digest: record.profile_digest,
    },
    ...(record.eval_binding ? { eval_binding: record.eval_binding } : {}),
    ...(record.intent_context ? { intent_context: record.intent_context } : {}),
    ...(record.model_usage ? { model_usage: record.model_usage } : {}),
    ...(criterionEvaluation ? {
      criterion_evaluation: {
        schema_version: criterionEvaluation.schema_version,
        aggregate_status: criterionEvaluation.aggregate_status,
        pass_rate: criterionEvaluation.pass_rate,
        pass_threshold: criterionEvaluation.pass_threshold,
        criteria_count: criterionEvaluation.criteria.length,
        passed_count: criterionEvaluation.criteria.filter((criterion) => criterion.status === "pass").length,
        failed_count: criterionEvaluation.criteria.filter((criterion) => criterion.status === "fail").length,
        insufficient_evidence_count: criterionEvaluation.criteria.filter(
          (criterion) => criterion.status === "insufficient_evidence",
        ).length,
        trust: criterionEvaluation.provenance.trust,
      },
    } : {}),
    verdict: record.evaluation.verdict,
    qualified_success: record.evaluation.qualified_success,
    constraint_compliance: record.evaluation.constraint_compliance,
    goal_attainment: record.evaluation.goal_attainment,
    evidence_confidence: record.evaluation.evidence_confidence,
    confidence_band: confidenceBand,
    preview_count: previewCount,
    execution_discipline: {
      retries: qualityNumber(discipline.retries),
      replays: qualityNumber(discipline.replays),
      runtime_ms: runtime,
    },
    data_quality: {
      missing_agent: record.agent_ids.length === 0,
      missing_runtime: runtime === null,
      low_confidence: confidenceBand === "low",
      indeterminate:
        record.evaluation.verdict === "indeterminate" ||
        record.evaluation.constraint_compliance === "indeterminate",
      findings,
    },
  };
}

function intentQualityJobIdValid(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value);
}

function intentQualityTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function intentQualityNullableTimestamp(value: unknown): string {
  return intentQualityTimestamp(value) || "\uffff";
}

function intentQualityStringList(value: unknown, limit = 20): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      .map((item) => item.trim().slice(0, 500))
      .slice(0, limit)
    : [];
}

function intentQualityPreviewSummary(
  evaluation: HostedIntentEvaluationReceipt,
  record: IntentQualityRecord,
): Record<string, unknown> | null {
  if (
    evaluation.schema_version !== "agentpass.intent-evaluation.v1" ||
    evaluation.evaluation_mode !== "preview" ||
    !evaluation.evaluation_id ||
    evaluation.intent_id !== record.intent_id ||
    evaluation.intent_digest !== record.intent_digest ||
    evaluation.job_id !== record.job_id ||
    evaluation.profile !== record.profile_key ||
    evaluation.profile_version !== record.profile_version ||
    evaluation.profile_digest !== record.profile_digest ||
    !["completed", "partial", "failed", "indeterminate"].includes(evaluation.verdict) ||
    !["pass", "fail", "indeterminate"].includes(evaluation.constraint_compliance) ||
    typeof evaluation.qualified_success !== "boolean" ||
    !qualityMetricInRange(evaluation.goal_attainment, 0, 1) ||
    !qualityMetricInRange(evaluation.evidence_confidence, 0, 1)
  ) return null;
  return {
    schema_version: "agentpass.intent-quality-job-preview.v1",
    evaluation_id: evaluation.evaluation_id,
    evaluated_at: intentQualityTimestamp(evaluation.evaluated_at),
    timestamp_status: intentQualityTimestamp(evaluation.evaluated_at) ? "recorded" : "missing",
    verdict: evaluation.verdict,
    qualified_success: evaluation.qualified_success,
    constraint_compliance: evaluation.constraint_compliance,
    goal_attainment: evaluation.goal_attainment,
    evidence_confidence: evaluation.evidence_confidence,
    confidence_band: intentQualityConfidenceBand(evaluation.evidence_confidence),
    evidence_findings: intentQualityStringList(evaluation.evidence_findings),
  };
}

function intentQualityPredicateSummaries(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  const summaries: Record<string, unknown>[] = [];
  for (const item of value) {
    const predicate = recordValue(item);
    if (
      !optionalString(predicate.predicate_id) ||
      !["pass", "fail", "indeterminate"].includes(stringValue(predicate.status)) ||
      !qualityMetricInRange(predicate.observed_count, 0) ||
      !optionalString(predicate.reason)
    ) continue;
    summaries.push({
      predicate_id: stringValue(predicate.predicate_id),
      status: stringValue(predicate.status),
      observed_count: qualityNumber(predicate.observed_count),
      reason: stringValue(predicate.reason).slice(0, 500),
    });
  }
  return summaries;
}

function intentQualityCriterionEvaluation(value: unknown): DeterministicEvalResult | undefined {
  const result = recordValue(value);
  const provenance = recordValue(result.provenance);
  if (
    result.schema_version !== "agentaction.deterministic-eval-result.v1" ||
    !["pass", "fail", "insufficient_evidence"].includes(stringValue(result.aggregate_status)) ||
    !qualityMetricInRange(result.pass_rate, 0, 1) ||
    !qualityMetricInRange(result.pass_threshold, 0, 1) ||
    !Array.isArray(result.required_criteria) || result.required_criteria.length > 20 ||
    !result.required_criteria.every((item: unknown) => typeof item === "string" && EVAL_CRITERION_ID.test(item)) ||
    !Array.isArray(result.criteria) || result.criteria.length < 1 || result.criteria.length > 20 ||
    provenance.evaluator !== "agentaction.deterministic" ||
    provenance.evaluator_version !== "v1" ||
    !EVAL_ID.test(stringValue(provenance.eval_id)) ||
    !EVAL_VERSION.test(stringValue(provenance.eval_version)) ||
    !/^[a-f0-9]{64}$/.test(stringValue(provenance.specification_digest)) ||
    !/^[a-f0-9]{64}$/.test(stringValue(provenance.profile_digest)) ||
    !ACTIVITY_ID.test(stringValue(provenance.assignment_id)) ||
    !/^[a-f0-9]{64}$/.test(stringValue(provenance.evidence_digest)) ||
    !intentQualityTimestamp(provenance.evaluated_at) ||
    !["agent_self_attested", "trusted_execution_state"].includes(stringValue(provenance.trust))
  ) return undefined;
  const criteria: DeterministicCriterionResult[] = [];
  const criterionIds = new Set<string>();
  for (const value of result.criteria) {
    const criterion = recordValue(value);
    const criterionId = stringValue(criterion.criterion_id);
    if (
      !EVAL_CRITERION_ID.test(criterionId) || criterionIds.has(criterionId) ||
      typeof criterion.label !== "string" || !criterion.label || criterion.label.length > 120 ||
      typeof criterion.description !== "string" || !criterion.description || criterion.description.length > 500 ||
      (criterion.category !== "outcome" && criterion.category !== "constraint") ||
      typeof criterion.required !== "boolean" ||
      !EVAL_EVIDENCE_SOURCES.has(criterion.source as IntentEvidenceSource) ||
      !["pass", "fail", "insufficient_evidence"].includes(stringValue(criterion.status)) ||
      typeof criterion.explanation !== "string" || !criterion.explanation || criterion.explanation.length > 500 ||
      !Array.isArray(criterion.evidence_refs) || criterion.evidence_refs.length > 20 ||
      !criterion.evidence_refs.every((item: unknown) => typeof item === "string" && Boolean(item) && item.length <= 500) ||
      (criterion.evidence_trust !== undefined && criterion.evidence_trust !== "agent_self_attested")
    ) return undefined;
    criterionIds.add(criterionId);
    criteria.push({
      criterion_id: criterionId,
      label: criterion.label,
      description: criterion.description,
      category: criterion.category,
      required: criterion.required,
      source: criterion.source as IntentEvidenceSource,
      status: criterion.status as DeterministicCriterionResult["status"],
      explanation: criterion.explanation,
      evidence_refs: [...criterion.evidence_refs] as string[],
      ...(criterion.evidence_trust === "agent_self_attested" ? { evidence_trust: "agent_self_attested" as const } : {}),
    });
  }
  if (!result.required_criteria.every((criterionId: string) => criterionIds.has(criterionId))) return undefined;
  return {
    schema_version: "agentaction.deterministic-eval-result.v1",
    aggregate_status: result.aggregate_status as DeterministicEvalResult["aggregate_status"],
    pass_rate: Number(result.pass_rate),
    pass_threshold: Number(result.pass_threshold),
    required_criteria: [...result.required_criteria] as string[],
    criteria,
    provenance: {
      evaluator: "agentaction.deterministic",
      evaluator_version: "v1",
      eval_id: stringValue(provenance.eval_id),
      eval_version: stringValue(provenance.eval_version),
      specification_digest: stringValue(provenance.specification_digest),
      profile_digest: stringValue(provenance.profile_digest),
      assignment_id: stringValue(provenance.assignment_id),
      evidence_digest: stringValue(provenance.evidence_digest),
      evaluated_at: String(intentQualityTimestamp(provenance.evaluated_at)),
      trust: provenance.trust as "agent_self_attested" | "trusted_execution_state",
    },
  };
}

function intentQualityFinalEvaluation(record: IntentQualityRecord): Record<string, unknown> {
  const evaluation = record.evaluation;
  const discipline = recordValue(evaluation.execution_discipline);
  const criterionEvaluation = intentQualityCriterionEvaluation(evaluation.criterion_evaluation);
  return {
    schema_version: "agentpass.intent-quality-job-final-evaluation.v1",
    evaluation_id: evaluation.evaluation_id,
    evaluated_at: intentQualityTimestamp(evaluation.evaluated_at),
    verdict: evaluation.verdict,
    qualified_success: evaluation.qualified_success,
    constraint_compliance: evaluation.constraint_compliance,
    goal_attainment: evaluation.goal_attainment,
    evidence_confidence: evaluation.evidence_confidence,
    confidence_band: intentQualityConfidenceBand(evaluation.evidence_confidence),
    outcomes: intentQualityPredicateSummaries(evaluation.outcomes),
    constraints: intentQualityPredicateSummaries(evaluation.constraints),
    ...(criterionEvaluation ? { criterion_evaluation: criterionEvaluation } : {}),
    execution_discipline: {
      tool_calls: qualityNumber(discipline.tool_calls),
      execution_receipts: qualityNumber(discipline.execution_receipts),
      executions: qualityNumber(discipline.executions),
      replays: qualityNumber(discipline.replays),
      retries: qualityNumber(discipline.retries),
      denied_decisions: qualityNumber(discipline.denied_decisions),
      challenge_decisions: qualityNumber(discipline.challenge_decisions),
      estimated_cost_usd: qualityNumber(discipline.estimated_cost_usd),
      runtime_ms: typeof discipline.runtime_ms === "number" && Number.isFinite(discipline.runtime_ms)
        ? discipline.runtime_ms
        : null,
      preferences_met: discipline.preferences_met,
      preference_findings: intentQualityStringList(discipline.preference_findings),
    },
    evidence_findings: intentQualityStringList(evaluation.evidence_findings),
  };
}

function intentQualityEvidenceSources(snapshot: IntentEvidenceSnapshot): {
  findings: string[];
  sources: Record<string, unknown>;
} {
  const findings: string[] = [];
  const manifest = recordValue(snapshot.sources);
  const evidence = recordValue(snapshot.evidence);
  const sourceRecords: Record<string, unknown[]> = {
    decision_events: Array.isArray(evidence.decision_events) ? evidence.decision_events : [],
    ...(snapshot.schema_version === "agentpass.intent-evidence-snapshot.v2"
      ? { decision_bases: Array.isArray(evidence.decision_bases) ? evidence.decision_bases : [] }
      : {}),
    execution_receipts: Array.isArray(evidence.execution_receipts) ? evidence.execution_receipts : [],
    observations: Array.isArray(evidence.observations) ? evidence.observations : [],
    job: evidence.job ? [evidence.job] : [],
  };
  const sources: Record<string, unknown> = {};
  const sourceNames = snapshot.schema_version === "agentpass.intent-evidence-snapshot.v2"
    ? ["decision_events", "decision_bases", "execution_receipts", "observations", "job"]
    : ["decision_events", "execution_receipts", "observations", "job"];
  for (const source of sourceNames) {
    const declared = recordValue(manifest[source]);
    const digest = optionalString(declared.digest);
    const declaredCount = Number.isInteger(declared.count) && Number(declared.count) >= 0
      ? Number(declared.count)
      : null;
    const count = sourceRecords[source].length;
    if (declaredCount !== count) findings.push(`${source} manifest count does not match frozen evidence`);
    if (!digest || !/^[a-f0-9]{64}$/.test(digest)) findings.push(`${source} manifest digest is missing or invalid`);
    sources[source] = {
      count,
      declared_count: declaredCount,
      digest: digest && /^[a-f0-9]{64}$/.test(digest) ? digest : null,
    };
  }
  return { sources, findings };
}

function intentQualityJobTimeline(
  record: IntentQualityRecord,
  finalization: IntentFinalizationRecord,
  previews: Record<string, unknown>[],
): { entries: Record<string, unknown>[]; missingTimestampCount: number } {
  type TimelineEntry = Record<string, unknown> & {
    _source_index: number;
    event_type: string;
    evidence_id: string | null;
    occurred_at: string | null;
  };
  const entries: TimelineEntry[] = [];
  const add = (
    eventType: string,
    evidenceId: string | null,
    timestamp: unknown,
    sourceIndex: number,
    fields: Record<string, unknown>,
  ) => {
    const occurredAt = intentQualityTimestamp(timestamp);
    entries.push({
      event_type: eventType,
      evidence_id: evidenceId,
      occurred_at: occurredAt,
      timestamp_status: occurredAt ? "recorded" : "missing",
      _source_index: sourceIndex,
      ...fields,
    });
  };

  previews.forEach((preview, index) => add(
    "preview_evaluation",
    optionalString(preview.evaluation_id) || null,
    preview.evaluated_at,
    index,
    {
      verdict: preview.verdict,
      constraint_compliance: preview.constraint_compliance,
      evidence_confidence: preview.evidence_confidence,
      confidence_band: preview.confidence_band,
    },
  ));
  finalization.snapshot.evidence.decision_events.forEach((value, index) => {
    const event = recordValue(value);
    const decision = ["allow", "deny", "challenge_required"].includes(stringValue(event.decision))
      ? stringValue(event.decision)
      : event.allow === true
        ? "allow"
        : event.allow === false
          ? "deny"
          : "indeterminate";
    add(
      "authorization_decision",
      optionalString(event.decision_id) || null,
      event.decided_at,
      index,
      {
        agent_id: optionalString(event.agent_id) || null,
        tool: optionalString(event.tool) || null,
        action: optionalString(event.action) || null,
        decision,
        approval_id: optionalString(event.approval_id) || null,
        jit_grant_id: optionalString(event.jit_grant_id) || null,
        replayed: event.replayed === true,
        findings: intentQualityStringList(event.findings),
      },
    );
  });
  finalization.snapshot.evidence.execution_receipts.forEach((value, index) => {
    const receipt = recordValue(value);
    add(
      "execution_receipt",
      optionalString(receipt.decision_id) || null,
      receipt.executed_at,
      index,
      {
        completed_at: intentQualityTimestamp(receipt.completed_at),
        tool: optionalString(receipt.tool) || null,
        action: optionalString(receipt.action) || null,
        status: ["executed", "replayed"].includes(stringValue(receipt.status))
          ? stringValue(receipt.status)
          : "indeterminate",
        replay_count: Number.isInteger(receipt.replay_count) && Number(receipt.replay_count) >= 0
          ? Number(receipt.replay_count)
          : 0,
        replayed_from_decision_id: optionalString(receipt.replayed_from_decision_id) || null,
        outcome_code: optionalString(receipt.outcome_code) || null,
        error_code: optionalString(receipt.error_code) || null,
      },
    );
  });
  finalization.snapshot.evidence.observations.forEach((value, index) => {
    const observation = recordValue(value);
    const provenance = recordValue(observation.provenance);
    add(
      "verified_observation",
      optionalString(observation.observation_id) || null,
      observation.observed_at,
      index,
      {
        issued_at: intentQualityTimestamp(observation.issued_at),
        issuer: optionalString(observation.issuer) || null,
        predicate: optionalString(observation.predicate) || null,
        payload_digest: /^[a-f0-9]{64}$/.test(stringValue(observation.payload_digest))
          ? stringValue(observation.payload_digest)
          : null,
        verification_method: ["oidc", "jws", "unsigned_dev"].includes(stringValue(provenance.verification_method))
          ? stringValue(provenance.verification_method)
          : null,
        verified_at: intentQualityTimestamp(provenance.verified_at),
        signature_kid: optionalString(provenance.signature_kid) || null,
      },
    );
  });
  add(
    "finalization",
    optionalString(record.evaluation.evaluation_id) || null,
    finalization.finalized_at,
    0,
    {
      verdict: record.evaluation.verdict,
      constraint_compliance: record.evaluation.constraint_compliance,
      evidence_confidence: record.evaluation.evidence_confidence,
      snapshot_id: finalization.snapshot.snapshot_id,
    },
  );

  entries.sort((left, right) => {
    const leftTime = left.occurred_at || "\uffff";
    const rightTime = right.occurred_at || "\uffff";
    return leftTime.localeCompare(rightTime) ||
      left.event_type.localeCompare(right.event_type) ||
      (left.evidence_id || "").localeCompare(right.evidence_id || "") ||
      left._source_index - right._source_index;
  });
  const missingTimestampCount = entries.filter((entry) => entry.occurred_at === null).length;
  return {
    missingTimestampCount,
    entries: entries.map(({ _source_index: sourceIndex, ...entry }, index) => ({
      sequence: index + 1,
      source_index: sourceIndex,
      ...entry,
    })),
  };
}

function intentQualityJobDetailPayload(
  record: IntentQualityRecord,
  finalization: IntentFinalizationRecord,
  previews: Record<string, unknown>[],
  invalidPreviewCount: number,
): Record<string, unknown> {
  const job = intentQualityJob(record, previews.length);
  const jobQuality = recordValue(recordValue(job).data_quality);
  const evidenceSources = intentQualityEvidenceSources(finalization.snapshot);
  const timeline = intentQualityJobTimeline(record, finalization, previews);
  const findings = [
    ...intentQualityStringList(jobQuality.findings),
    ...evidenceSources.findings,
  ];
  if (invalidPreviewCount > 0) findings.push(`${invalidPreviewCount} invalid preview evaluation(s) were excluded`);
  if (timeline.missingTimestampCount > 0) {
    findings.push(`${timeline.missingTimestampCount} timeline event(s) lack a valid timestamp`);
  }
  const outcomeSummaries = intentQualityPredicateSummaries(record.evaluation.outcomes);
  const constraintSummaries = intentQualityPredicateSummaries(record.evaluation.constraints);
  if (outcomeSummaries.length !== (Array.isArray(record.evaluation.outcomes) ? record.evaluation.outcomes.length : 0)) {
    findings.push("one or more malformed outcome evaluations were excluded");
  }
  if (constraintSummaries.length !== (Array.isArray(record.evaluation.constraints) ? record.evaluation.constraints.length : 0)) {
    findings.push("one or more malformed constraint evaluations were excluded");
  }

  return {
    schema_version: "agentpass.intent-quality-job-detail.v1",
    tenant_id: record.tenant_id,
    job,
    immutable_boundary: {
      status: "finalized",
      finalized_at: record.finalized_at,
      captured_at: intentQualityTimestamp(finalization.snapshot.captured_at),
      intent_digest: record.intent_digest,
      snapshot_id: finalization.snapshot.snapshot_id,
      evidence_digest: finalization.snapshot.evidence_digest,
    },
    final_evaluation: intentQualityFinalEvaluation(record),
    previews: {
      count: previews.length,
      invalid_count: invalidPreviewCount,
      evaluations: previews,
    },
    evidence_sources: evidenceSources.sources,
    timeline: {
      ordering: {
        direction: "ascending",
        primary: "occurred_at with missing timestamps last",
        tie_breaker: "event_type, evidence_id, source_index",
      },
      entries: timeline.entries,
    },
    data_quality: {
      missing_timestamps_count: timeline.missingTimestampCount,
      invalid_preview_count: invalidPreviewCount,
      findings: [...new Set(findings)],
    },
  };
}

function intentQualityRollup(
  tenantId: string,
  records: IntentQualityRecord[],
  filters: IntentQualityFilters,
): Record<string, unknown> {
  records = [...records].sort((left, right) => left.intent_id < right.intent_id ? -1 : left.intent_id > right.intent_id ? 1 : 0);
  const first = records[0];
  const jobCount = records.length;
  const verdicts: IntentEvaluationReceipt["verdict"][] = ["completed", "partial", "failed", "indeterminate"];
  const complianceStates: IntentEvaluationReceipt["constraint_compliance"][] = ["pass", "fail", "indeterminate"];
  const outcomeCounts = Object.fromEntries(verdicts.map((verdict) => [
    verdict,
    records.filter((record) => record.evaluation.verdict === verdict).length,
  ])) as Record<IntentEvaluationReceipt["verdict"], number>;
  const complianceCounts = Object.fromEntries(complianceStates.map((state) => [
    state,
    records.filter((record) => record.evaluation.constraint_compliance === state).length,
  ])) as Record<IntentEvaluationReceipt["constraint_compliance"], number>;
  const confidences = records.map((record) => record.evaluation.evidence_confidence);
  const confidenceCounts = {
    high: confidences.filter((value) => value >= INTENT_QUALITY_HIGH_CONFIDENCE).length,
    medium: confidences.filter((value) => value >= INTENT_QUALITY_LOW_CONFIDENCE && value < INTENT_QUALITY_HIGH_CONFIDENCE).length,
    low: confidences.filter((value) => value < INTENT_QUALITY_LOW_CONFIDENCE).length,
  };
  const disciplineFields = [
    "tool_calls",
    "execution_receipts",
    "executions",
    "replays",
    "retries",
    "denied_decisions",
    "challenge_decisions",
    "estimated_cost_usd",
  ] as const;
  const disciplineTotals = Object.fromEntries(disciplineFields.map((field) => [
    field,
    qualityRound(records.reduce(
      (total, record) => total + qualityNumber(record.evaluation.execution_discipline[field]),
      0,
    )),
  ])) as Record<(typeof disciplineFields)[number], number>;
  const runtimeValues = records
    .map((record) => record.evaluation.execution_discipline.runtime_ms)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const runtimeTotal = runtimeValues.reduce((total, value) => total + value, 0);
  const preferencesMet = records.filter((record) => record.evaluation.execution_discipline.preferences_met === true).length;
  const preferencesNotMet = records.filter((record) => record.evaluation.execution_discipline.preferences_met === false).length;
  const preferencesNotApplicable = jobCount - preferencesMet - preferencesNotMet;
  const qualifiedSuccesses = records.filter((record) => record.evaluation.qualified_success).length;
  const missingAgentCount = records.filter((record) => record.agent_ids.length === 0).length;
  const lowConfidenceCount = confidenceCounts.low;
  const indeterminateCount = outcomeCounts.indeterminate;
  const dataQualityFindings: string[] = [];
  if (jobCount < filters.minimum_sample_size) {
    dataQualityFindings.push(`sample size ${jobCount} is below minimum ${filters.minimum_sample_size}`);
  }
  if (lowConfidenceCount > 0) dataQualityFindings.push(`${lowConfidenceCount} low-confidence finalized job(s)`);
  if (indeterminateCount > 0) dataQualityFindings.push(`${indeterminateCount} indeterminate finalized job(s)`);
  if (missingAgentCount > 0) dataQualityFindings.push(`${missingAgentCount} finalized job(s) lack agent identity`);
  if (runtimeValues.length < jobCount) {
    dataQualityFindings.push(`${jobCount - runtimeValues.length} finalized job(s) lack runtime metrics`);
  }

  return {
    schema_version: "agentpass.intent-quality-rollup.v1",
    tenant_id: tenantId,
    profile_key: first.profile_key,
    profile_version: first.profile_version,
    profile_digest: first.profile_digest,
    time_window: { from: filters.from, to: filters.to, boundary: "[from,to)" },
    sample: {
      finalized_jobs: jobCount,
      minimum_sample_size: filters.minimum_sample_size,
      meets_minimum_sample_size: jobCount >= filters.minimum_sample_size,
    },
    outcomes: {
      counts: outcomeCounts,
      rates: Object.fromEntries(verdicts.map((verdict) => [verdict, qualityRate(outcomeCounts[verdict], jobCount)])),
      qualified_success: { count: qualifiedSuccesses, rate: qualityRate(qualifiedSuccesses, jobCount) },
      goal_attainment_average: qualityAverage(records.map((record) => record.evaluation.goal_attainment)),
    },
    constraint_compliance: {
      counts: complianceCounts,
      rates: Object.fromEntries(complianceStates.map((state) => [state, qualityRate(complianceCounts[state], jobCount)])),
    },
    evidence_confidence: {
      average: qualityAverage(confidences),
      minimum: qualityRound(Math.min(...confidences)),
      maximum: qualityRound(Math.max(...confidences)),
      thresholds: { low_below: INTENT_QUALITY_LOW_CONFIDENCE, high_at_or_above: INTENT_QUALITY_HIGH_CONFIDENCE },
      distribution: Object.fromEntries(Object.entries(confidenceCounts).map(([bucket, count]) => [
        bucket,
        { count, rate: qualityRate(count, jobCount) },
      ])),
    },
    execution_discipline: {
      totals: { ...disciplineTotals, runtime_ms: qualityRound(runtimeTotal) },
      averages: {
        ...Object.fromEntries(disciplineFields.map((field) => [field, qualityRound(disciplineTotals[field] / jobCount)])),
        runtime_ms: runtimeValues.length > 0 ? qualityRound(runtimeTotal / runtimeValues.length) : null,
      },
      preference_compliance: {
        met: preferencesMet,
        not_met: preferencesNotMet,
        not_applicable: preferencesNotApplicable,
        rate: preferencesMet + preferencesNotMet > 0
          ? qualityRate(preferencesMet, preferencesMet + preferencesNotMet)
          : null,
      },
      coverage: {
        runtime_ms_records: runtimeValues.length,
        preference_records: preferencesMet + preferencesNotMet,
      },
    },
    data_quality: {
      low_confidence_count: lowConfidenceCount,
      indeterminate_count: indeterminateCount,
      missing_agent_count: missingAgentCount,
      missing_runtime_count: jobCount - runtimeValues.length,
      findings: dataQualityFindings,
    },
  };
}

function qualityNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function qualityMetricInRange(value: unknown, minimum: number, maximum = Number.POSITIVE_INFINITY): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function qualityRate(count: number, total: number): number {
  return total > 0 ? qualityRound(count / total) : 0;
}

function qualityAverage(values: number[]): number {
  return values.length > 0 ? qualityRound(values.reduce((total, value) => total + value, 0) / values.length) : 0;
}

function qualityRound(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
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
  return {
    ...record,
    ...(record.contract.profile_version ? { profile_key: record.contract.profile } : {}),
    ...(record.contract.profile_version ? { profile_version: record.contract.profile_version } : {}),
    ...(record.contract.profile_digest ? { profile_digest: record.contract.profile_digest } : {}),
    status,
  };
}

function intentProfileResponse(record: IntentProfileRecord): Record<string, unknown> {
  const issuedAt = Date.parse(record.definition.issued_at);
  return { ...record, status: issuedAt > Date.now() ? "pending" : "active" };
}

function intentContractIssuanceMode(manifest: AgentIdManifest): "raw_compatible" | "registered_profile_required" {
  const assurance = recordValue(manifest.intent_assurance);
  const issuance = recordValue(assurance.contract_issuance);
  return issuance.mode === "registered_profile_required" ? "registered_profile_required" : "raw_compatible";
}

function intentProfileTrustFinding(manifest: AgentIdManifest, profile: IntentProfile): string {
  const requirements = profile.trusted_observation_requirements || [];
  if (requirements.length === 0) return "";
  const assurance = recordValue(manifest.intent_assurance);
  const observations = recordValue(assurance.observations);
  const policies = Array.isArray(observations.trusted_issuers)
    ? observations.trusted_issuers.map(recordValue)
    : [];
  const profileKey = intentProfileKey(profile);
  for (const requirement of requirements) {
    const satisfied = policies.some((policy) => {
      if (!requirement.issuers.includes(stringValue(policy.issuer))) return false;
      const profiles = arrayValue(policy.profiles);
      if (profiles.length > 0 && !profiles.includes(profileKey)) return false;
      const predicates = arrayValue(policy.predicates);
      if (predicates.length > 0 && !predicates.includes(requirement.predicate)) return false;
      const trustedMethods = arrayValue(policy.verification_methods);
      const requiredMethods = requirement.verification_methods || [];
      return requiredMethods.length === 0 || requiredMethods.some((method) => trustedMethods.includes(method));
    });
    if (!satisfied) {
      return `tenant observation policy does not satisfy profile requirement: ${requirement.predicate}`;
    }
  }
  return "";
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
    ["tenant_id", registered.tenant_id || "default"],
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

function boundIntentJob(job: Record<string, unknown>, registered: IntentContractRecord): Record<string, unknown> {
  return {
    ...job,
    tenant_id: registered.tenant_id || "default",
    intent_id: registered.intent_id,
    intent_digest: registered.intent_digest,
    job_id: registered.job_id,
  };
}

function snapshotIntentEvidence(snapshot: IntentEvidenceSnapshot): IntentEvidence {
  return {
    decision_events: snapshot.evidence.decision_events,
    execution_receipts: snapshot.evidence.execution_receipts,
    observations: snapshot.evidence.observations,
    job: snapshot.evidence.job,
  };
}

function intentEvidenceIdentifier(
  source: IntentStoredEvidenceSourceName,
  record: Record<string, unknown>,
): string {
  if (source === "observations") return stringValue(record.observation_id);
  if (source === "decision_bases") return stringValue(record.basis_id);
  return stringValue(record.decision_id ?? record.event_id ?? record.receipt_id);
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

const ACTIVITY_QUERY_FIELDS = new Set([
  "from",
  "to",
  "agent_id",
  "event_type",
  "tool",
  "decision",
  "execution_status",
  "intent_binding",
  "limit",
  "cursor",
]);
const ACTIVITY_EVENT_TYPES = new Set([
  "tool_action",
  "model_request_started",
  "model_request_completed",
  "session_started",
  "session_completed",
  "job_started",
  "job_completed",
  "subagent_started",
  "subagent_completed",
]);
const ACTIVITY_EXECUTION_STATUSES = new Set(["ok", "error", "blocked", "cancelled", "unknown", "running"]);
const ACTIVITY_DECISIONS = new Set(["allow", "deny", "challenge_required"]);
const ACTIVITY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const EVAL_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const EVAL_VERSION = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
const EVAL_CRITERION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const REFUND_TRIAGE_CRITERION_IDS = new Set([
  "policy-outcome-correct",
  "applicable-rule-evidence",
  "no-invented-customer-facts",
  "ambiguity-escalated",
  "no-refund-execution",
  "evidence-captured",
]);
const CRITERION_EVIDENCE_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const EVAL_EVIDENCE_SOURCES = new Set<IntentEvidenceSource>([
  "decision_events",
  "execution_receipts",
  "observations",
  "job",
]);
const EVAL_FILTER_OPERATORS = new Set<IntentFilter["operator"]>([
  "equals",
  "not_equals",
  "in",
  "not_in",
  "exists",
]);
const EVAL_ASSERTION_OPERATORS = new Set<IntentAssertion["operator"]>([
  "count_equals",
  "count_lte",
  "count_gte",
  "equals",
  "not_equals",
  "in",
  "not_in",
  "lte",
  "gte",
  "exists",
]);
const EVAL_CREATED_AT = "2026-09-02T00:00:00.000Z";

type EvalDefinitionInput = Pick<EvalDefinition, "eval_id" | "version" | "name" | "description" | "kind" | "issued_at" | "created_at" | "created_by"> & {
  specification?: DeterministicEvalSpecification;
  specification_digest?: string;
  built_in?: true;
};

function profileForEval(input: Pick<EvalDefinition, "eval_id" | "version" | "kind" | "issued_at" | "specification">): IntentProfile {
  const assignmentVariable = {
    agentaction_assignment_id: {
      type: "string" as const,
      required: true,
      description: "The routing assignment frozen when the Job contract was issued.",
    },
  };
  const specification = input.specification;
  const specificationVariable = specification ? {
    agentaction_evaluation_specification: {
      type: "string" as const,
      required: true,
      description: "Canonical deterministic evaluation specification frozen into the Job contract.",
    },
  } : {};
  if (specification) {
    const predicate = (criterion: EvalCriterion): IntentPredicate => ({
      id: criterion.criterion_id,
      description: `${criterion.label}: ${criterion.description}`,
      source: criterion.source,
      ...(criterion.where ? { where: criterion.where } : {}),
      assertion: criterion.assertion,
    });
    return {
      schema_version: "agentpass.intent-profile.v1",
      profile: input.eval_id,
      version: input.version,
      issuer: "agentaction-gateway",
      issued_at: input.issued_at,
      objective_template: input.kind === "agent_declared"
        ? "{{goal}}"
        : "Observe one bounded agent run through a terminal lifecycle state.",
      variables: {
        ...assignmentVariable,
        ...specificationVariable,
        ...(input.kind === "agent_declared" ? {
          goal: {
            type: "string" as const,
            required: true,
            description: "Concise goal declared by the agent; not trusted user intent.",
          },
        } : {}),
      },
      required_outcomes: specification.criteria
        .filter((criterion) => criterion.category === "outcome")
        .map(predicate),
      hard_constraints: specification.criteria
        .filter((criterion) => criterion.category === "constraint")
        .map(predicate),
      evidence_requirements: specification.required_evidence,
    };
  }
  if (input.kind === "observed_execution") {
    return {
      schema_version: "agentpass.intent-profile.v1",
      profile: input.eval_id,
      version: input.version,
      issuer: "agentaction-gateway",
      issued_at: input.issued_at,
      objective_template: "Observe one bounded agent run through a terminal lifecycle state.",
      variables: assignmentVariable,
      required_outcomes: [{
        id: "run-completed",
        description: "The observed agent run reached a successful terminal state.",
        source: "job",
        assertion: { path: "status", operator: "equals", value: "completed" },
      }],
      hard_constraints: [],
      evidence_requirements: ["job"],
    };
  }
  return {
    schema_version: "agentpass.intent-profile.v1",
    profile: input.eval_id,
    version: input.version,
    issuer: "agentaction-gateway",
    issued_at: input.issued_at,
    objective_template: "{{goal}}",
    variables: {
      ...assignmentVariable,
      goal: {
        type: "string",
        required: true,
        description: "Concise goal declared by the agent; not trusted user intent.",
      },
    },
    required_outcomes: [
      {
        id: "run-completed",
        description: "The observed agent run reached a successful terminal state.",
        source: "job",
        assertion: { path: "status", operator: "equals", value: "completed" },
      },
      {
        id: "agent-reported-achieved",
        description: "The agent self-attested that the declared goal was achieved.",
        source: "job",
        assertion: { path: "reported_outcome.status", operator: "equals", value: "achieved" },
      },
      {
        id: "agent-reported-criteria-met",
        description: "The agent self-attested that all declared success criteria were met.",
        source: "job",
        assertion: { path: "reported_outcome.success_criteria_met", operator: "equals", value: "all" },
      },
    ],
    hard_constraints: [{
      id: "agent-reported-constraints-respected",
      description: "The agent self-attested that the declared constraints were respected.",
      source: "job",
      assertion: { path: "reported_outcome.constraints_respected", operator: "equals", value: "pass" },
    }],
    evidence_requirements: ["job"],
  };
}

function evalDefinition(input: EvalDefinitionInput): EvalDefinition {
  const profile = bindIntentProfile(profileForEval(input));
  return {
    schema_version: "agentaction.eval-definition.v1",
    eval_id: input.eval_id,
    version: input.version,
    name: input.name,
    description: input.description,
    kind: input.kind,
    trust: input.kind === "agent_declared" ? "agent_self_attested" : "trusted_execution_state",
    profile_key: intentProfileKey(profile),
    profile_digest: stringValue(profile.profile_digest),
    issued_at: input.issued_at,
    created_at: input.created_at,
    created_by: input.created_by,
    ...(input.specification && input.specification_digest ? {
      specification: input.specification,
      specification_digest: input.specification_digest,
    } : {}),
    ...(input.built_in ? { built_in: true } : {}),
  };
}

const BUILTIN_EVAL_DEFINITIONS = [
  evalDefinition({
    eval_id: "observed_execution",
    version: "v1",
    name: "Observed execution",
    description: "Checks whether a Job reached a successful terminal state using trusted execution state.",
    kind: "observed_execution",
    issued_at: EVAL_CREATED_AT,
    created_at: EVAL_CREATED_AT,
    created_by: "agentaction-gateway",
    built_in: true,
  }),
  evalDefinition({
    eval_id: "agent_declared_intent",
    version: "v1",
    name: "Agent-declared intent",
    description: "Checks lifecycle success plus the agent's self-attested goal, criteria, and constraints.",
    kind: "agent_declared",
    issued_at: EVAL_CREATED_AT,
    created_at: EVAL_CREATED_AT,
    created_by: "agentaction-gateway",
    built_in: true,
  }),
] satisfies EvalDefinition[];

function requiredEvalId(value: unknown, label: string): string {
  const result = stringValue(value).trim();
  if (!EVAL_ID.test(result)) throw new Error(`${label} is invalid`);
  return result;
}

function requiredEvalVersion(value: unknown, label: string): string {
  const result = stringValue(value).trim();
  if (!EVAL_VERSION.test(result)) throw new Error(`${label} is invalid`);
  return result;
}

function requiredEvalKind(value: unknown): EvalKind {
  if (value !== "agent_declared" && value !== "observed_execution") throw new Error("eval kind is invalid");
  return value;
}

function requiredEvalSpecification(value: unknown, kind: EvalKind): DeterministicEvalSpecification {
  const specification = strictRecord(value, [
    "schema_version",
    "pass_threshold",
    "required_evidence",
    "criteria",
  ], "eval specification");
  if (specification.schema_version !== "agentaction.deterministic-eval-specification.v1") {
    throw new Error("eval specification schema_version is unsupported");
  }
  if (
    typeof specification.pass_threshold !== "number" ||
    !Number.isFinite(specification.pass_threshold) ||
    specification.pass_threshold < 0 || specification.pass_threshold > 1
  ) throw new Error("eval specification pass_threshold is invalid");
  if (!Array.isArray(specification.required_evidence) || specification.required_evidence.length > 4) {
    throw new Error("eval specification required_evidence is invalid");
  }
  const requiredEvidence = specification.required_evidence.map((source, index) => {
    if (!EVAL_EVIDENCE_SOURCES.has(source as IntentEvidenceSource)) {
      throw new Error(`eval specification required_evidence[${index}] is invalid`);
    }
    return source as IntentEvidenceSource;
  });
  if (new Set(requiredEvidence).size !== requiredEvidence.length) {
    throw new Error("eval specification required_evidence must be unique");
  }
  if (!Array.isArray(specification.criteria) || specification.criteria.length < 1 || specification.criteria.length > 20) {
    throw new Error("eval specification criteria is invalid");
  }
  const criterionIds = new Set<string>();
  const criteria = specification.criteria.map((value, index) => {
    const criterion = strictRecord(value, [
      "criterion_id",
      "label",
      "description",
      "category",
      "required",
      "source",
      "where",
      "assertion",
    ], `eval specification criteria[${index}]`);
    const criterionId = stringValue(criterion.criterion_id);
    if (!EVAL_CRITERION_ID.test(criterionId)) {
      throw new Error(`eval specification criteria[${index}].criterion_id is invalid`);
    }
    if (criterionIds.has(criterionId)) throw new Error(`duplicate eval criterion_id: ${criterionId}`);
    criterionIds.add(criterionId);
    const label = requiredActivityText(criterion.label, `eval specification criteria[${index}].label`, 120);
    const description = requiredActivityText(
      criterion.description,
      `eval specification criteria[${index}].description`,
      500,
    );
    if (criterion.category !== "outcome" && criterion.category !== "constraint") {
      throw new Error(`eval specification criteria[${index}].category is invalid`);
    }
    if (typeof criterion.required !== "boolean") {
      throw new Error(`eval specification criteria[${index}].required is invalid`);
    }
    if (!EVAL_EVIDENCE_SOURCES.has(criterion.source as IntentEvidenceSource)) {
      throw new Error(`eval specification criteria[${index}].source is invalid`);
    }
    if (criterion.where !== undefined && (!Array.isArray(criterion.where) || criterion.where.length > 10)) {
      throw new Error(`eval specification criteria[${index}].where is invalid`);
    }
    const where = Array.isArray(criterion.where)
      ? criterion.where.map((filter, filterIndex) => normalizeEvalFilter(filter, index, filterIndex))
      : undefined;
    const assertion = normalizeEvalAssertion(criterion.assertion, index);
    return {
      criterion_id: criterionId,
      label,
      description,
      category: criterion.category,
      required: criterion.required,
      source: criterion.source as IntentEvidenceSource,
      ...(where && where.length > 0 ? { where } : {}),
      assertion,
    } satisfies EvalCriterion;
  });
  if (!criteria.some((criterion) => criterion.category === "outcome")) {
    throw new Error("eval specification requires at least one outcome criterion");
  }
  const normalized: DeterministicEvalSpecification = {
    schema_version: "agentaction.deterministic-eval-specification.v1",
    pass_threshold: specification.pass_threshold,
    required_evidence: requiredEvidence,
    criteria,
  };
  // Reuse the public deterministic evaluator's validation as the final fail-closed schema boundary.
  bindIntentProfile(profileForEval({
    eval_id: "validation",
    version: "v1",
    kind,
    issued_at: EVAL_CREATED_AT,
    specification: normalized,
  } as EvalDefinition));
  return normalized;
}

function normalizeEvalFilter(value: unknown, criterionIndex: number, filterIndex: number): IntentFilter {
  const filter = strictRecord(value, ["path", "operator", "value"], `eval specification criteria[${criterionIndex}].where[${filterIndex}]`);
  const path = requiredEvalPath(filter.path, `eval specification criteria[${criterionIndex}].where[${filterIndex}].path`);
  if (!EVAL_FILTER_OPERATORS.has(filter.operator as IntentFilter["operator"])) {
    throw new Error(`eval specification criteria[${criterionIndex}].where[${filterIndex}].operator is invalid`);
  }
  if (filter.operator !== "exists" && !("value" in filter)) {
    throw new Error(`eval specification criteria[${criterionIndex}].where[${filterIndex}].value is required`);
  }
  if (filter.operator === "exists" && "value" in filter) {
    throw new Error(`eval specification criteria[${criterionIndex}].where[${filterIndex}].value is not allowed`);
  }
  if ((filter.operator === "in" || filter.operator === "not_in") && !Array.isArray(filter.value)) {
    throw new Error(`eval specification criteria[${criterionIndex}].where[${filterIndex}].value must be an array`);
  }
  if ("value" in filter) requiredBoundedEvalValue(filter.value, `eval specification criteria[${criterionIndex}].where[${filterIndex}].value`);
  return {
    path,
    operator: filter.operator as IntentFilter["operator"],
    ...(filter.operator !== "exists" ? { value: filter.value } : {}),
  };
}

function normalizeEvalAssertion(value: unknown, criterionIndex: number): IntentAssertion {
  const assertion = strictRecord(value, ["operator", "path", "value", "quantifier"], `eval specification criteria[${criterionIndex}].assertion`);
  if (!EVAL_ASSERTION_OPERATORS.has(assertion.operator as IntentAssertion["operator"])) {
    throw new Error(`eval specification criteria[${criterionIndex}].assertion.operator is invalid`);
  }
  const isCount = ["count_equals", "count_lte", "count_gte"].includes(String(assertion.operator));
  const path = assertion.path === undefined
    ? undefined
    : requiredEvalPath(assertion.path, `eval specification criteria[${criterionIndex}].assertion.path`);
  if (!isCount && !path) throw new Error(`eval specification criteria[${criterionIndex}].assertion.path is required`);
  if (assertion.operator !== "exists" && !("value" in assertion)) {
    throw new Error(`eval specification criteria[${criterionIndex}].assertion.value is required`);
  }
  if (assertion.operator === "exists" && "value" in assertion) {
    throw new Error(`eval specification criteria[${criterionIndex}].assertion.value is not allowed`);
  }
  if ((assertion.operator === "in" || assertion.operator === "not_in") && !Array.isArray(assertion.value)) {
    throw new Error(`eval specification criteria[${criterionIndex}].assertion.value must be an array`);
  }
  if (isCount && (!Number.isSafeInteger(assertion.value) || Number(assertion.value) < 0)) {
    throw new Error(`eval specification criteria[${criterionIndex}].assertion.value must be a non-negative integer`);
  }
  if (assertion.quantifier !== undefined && assertion.quantifier !== "any" && assertion.quantifier !== "all") {
    throw new Error(`eval specification criteria[${criterionIndex}].assertion.quantifier is invalid`);
  }
  if ("value" in assertion) requiredBoundedEvalValue(assertion.value, `eval specification criteria[${criterionIndex}].assertion.value`);
  return {
    operator: assertion.operator as IntentAssertion["operator"],
    ...(path ? { path } : {}),
    ...(assertion.operator !== "exists" ? { value: assertion.value } : {}),
    ...(assertion.quantifier ? { quantifier: assertion.quantifier as "any" | "all" } : {}),
  };
}

function requiredEvalPath(value: unknown, label: string): string {
  const path = stringValue(value);
  if (!path || path.length > 240 || !/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(path)) {
    throw new Error(`${label} is invalid`);
  }
  if (path.split(".").some((segment) => ["__proto__", "prototype", "constructor"].includes(segment))) {
    throw new Error(`${label} is invalid`);
  }
  return path;
}

function requiredBoundedEvalValue(value: unknown, label: string): void {
  const serialized = JSON.stringify(value);
  if (serialized === undefined || serialized.length > 2_048) throw new Error(`${label} is invalid`);
  let nodeCount = 0;
  const visit = (candidate: unknown, depth: number): void => {
    nodeCount += 1;
    if (nodeCount > 200 || depth > 8) throw new Error(`${label} is invalid`);
    if (Array.isArray(candidate)) {
      candidate.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (candidate !== null && typeof candidate === "object") {
      Object.values(candidate as Record<string, unknown>).forEach((item) => visit(item, depth + 1));
    }
  };
  visit(value, 0);
}

async function evalSpecificationFromContract(
  contract: IntentContract,
  kind: EvalKind,
): Promise<{ specification: DeterministicEvalSpecification; digest: string } | undefined> {
  const encoded = optionalString(recordValue(contract.profile_variables).agentaction_evaluation_specification);
  if (!encoded) return undefined;
  if (encoded.length > 32_768) throw new Error("frozen eval specification is too large");
  const specification = requiredEvalSpecification(JSON.parse(encoded), kind);
  return { specification, digest: await canonicalDigest(specification) };
}

async function deterministicCriterionEvaluation(
  contract: IntentContract,
  snapshot: IntentEvidenceSnapshot,
  evaluation: IntentEvaluationReceipt,
  bindingValue: unknown,
): Promise<DeterministicEvalResult | undefined> {
  const kind: EvalKind = optionalString(recordValue(contract.profile_variables).goal)
    ? "agent_declared"
    : "observed_execution";
  const frozen = await evalSpecificationFromContract(contract, kind);
  if (!frozen) return undefined;
  const binding = recordValue(bindingValue);
  const requiredCriteria = frozen.specification.criteria
    .filter((criterion) => criterion.required)
    .map((criterion) => criterion.criterion_id);
  if (
    binding.schema_version !== "agentaction.eval-binding.v1" ||
    binding.specification_digest !== frozen.digest ||
    binding.pass_threshold !== frozen.specification.pass_threshold ||
    canonicalJson(binding.required_criteria) !== canonicalJson(requiredCriteria) ||
    binding.profile_key !== contract.profile ||
    binding.profile_digest !== contract.profile_digest ||
    binding.version !== contract.profile_version
  ) throw new Error("frozen eval binding does not match its deterministic specification");
  const evaluatedById = new Map(
    [...evaluation.outcomes, ...evaluation.constraints].map((result) => [result.predicate_id, result]),
  );
  const reportedOutcome = recordValue(recordValue(snapshot.evidence.job).reported_outcome);
  const selfAttestedReport = reportedOutcome.criterion_evidence === undefined
    ? undefined
    : validateSelfAttestedCriterionEvidence(reportedOutcome.criterion_evidence);
  if (selfAttestedReport && (
    binding.eval_id !== selfAttestedReport.eval_id ||
    binding.version !== selfAttestedReport.eval_version ||
    binding.trust !== selfAttestedReport.trust ||
    snapshot.job_id !== selfAttestedReport.job_id
  )) throw new Error("self-attested criterion evidence does not match its frozen Job binding");
  const selfAttestedById = new Map(
    (selfAttestedReport?.criteria || []).map((criterion) => [criterion.criterion_id, criterion]),
  );
  if ([...selfAttestedById.keys()].some((criterionId) => (
    !frozen.specification.criteria.some((criterion) => criterion.criterion_id === criterionId)
  ))) throw new Error("self-attested criterion evidence is not present in the frozen specification");
  const criteria = frozen.specification.criteria.map((criterion): DeterministicCriterionResult => {
    const result = evaluatedById.get(criterion.criterion_id);
    if (!result) throw new Error(`deterministic criterion result is missing: ${criterion.criterion_id}`);
    const selfAttested = criterion.source === "observations" && result.observed_count === 0
      ? selfAttestedById.get(criterion.criterion_id)
      : undefined;
    const evidenceSource = snapshot.sources[criterion.source];
    const evidenceRefs = selfAttested
      ? selfAttested.evidence_refs.map((reference) => `job:self_attested:${criterion.criterion_id}:${reference}`)
      : (result.observed_count > 0
        ? evidenceSource.evidence_ids.slice(0, 20).map((id) => `${criterion.source}:${id}`)
        : [`${criterion.source}:digest:${evidenceSource.digest}`]
      ).filter((reference) => reference.length <= 500);
    const status = selfAttested?.status
      || (criterion.source === "observations" && result.observed_count === 0
        ? "insufficient_evidence"
        : result.status === "indeterminate" ? "insufficient_evidence" : result.status);
    return {
      criterion_id: criterion.criterion_id,
      label: criterion.label,
      description: criterion.description,
      category: criterion.category,
      required: criterion.required,
      source: criterion.source,
      status,
      explanation: selfAttested
        ? `Self-attested by agent as ${selfAttested.status.replace("_", " ")}; not independently verified.`
        : result.reason.slice(0, 500),
      evidence_refs: evidenceRefs,
      ...(selfAttested ? { evidence_trust: "agent_self_attested" as const } : {}),
    };
  });
  const passed = criteria.filter((criterion) => criterion.status === "pass").length;
  const insufficient = criteria.filter((criterion) => criterion.status === "insufficient_evidence").length;
  const passRate = criteria.length === 0 ? 0 : Math.round((passed / criteria.length) * 1_000_000) / 1_000_000;
  const maximumPassRate = criteria.length === 0
    ? 0
    : Math.round(((passed + insufficient) / criteria.length) * 1_000_000) / 1_000_000;
  const requiredResults = criteria.filter((criterion) => criterion.required);
  const aggregateStatus: DeterministicEvalResult["aggregate_status"] = requiredResults.some(
    (criterion) => criterion.status === "fail",
  )
    ? "fail"
    : requiredResults.some((criterion) => criterion.status === "insufficient_evidence")
      ? "insufficient_evidence"
      : passRate >= frozen.specification.pass_threshold
        ? "pass"
        : maximumPassRate >= frozen.specification.pass_threshold
          ? "insufficient_evidence"
          : "fail";
  return {
    schema_version: "agentaction.deterministic-eval-result.v1",
    aggregate_status: aggregateStatus,
    pass_rate: passRate,
    pass_threshold: frozen.specification.pass_threshold,
    required_criteria: requiredCriteria,
    criteria,
    provenance: {
      evaluator: "agentaction.deterministic",
      evaluator_version: "v1",
      eval_id: stringValue(binding.eval_id),
      eval_version: stringValue(binding.version),
      specification_digest: frozen.digest,
      profile_digest: stringValue(contract.profile_digest),
      assignment_id: stringValue(binding.assignment_id),
      evidence_digest: snapshot.evidence_digest,
      evaluated_at: evaluation.evaluated_at,
      trust: binding.trust as "agent_self_attested" | "trusted_execution_state",
    },
  };
}

function evalSelectorId(value: unknown, label: string): string {
  requiredActivityId(value, label);
  return String(value);
}

function storedKeysWithout(value: string[] | undefined, key: string): string[] {
  return (value || []).filter((candidate) => candidate !== key);
}

async function evalAssignmentSelectorKey(sourceId?: string, agentId?: string): Promise<string> {
  return canonicalDigest({ source_id: sourceId || null, agent_id: agentId || null });
}

function evalIdFromProfile(profileKey: string, version?: string): string | undefined {
  if (!version || !profileKey.endsWith(`.${version}`)) return undefined;
  const evalId = profileKey.slice(0, -(version.length + 1));
  return EVAL_ID.test(evalId) ? evalId : undefined;
}

async function storeActivityJob(
  env: Env,
  manifest: AgentIdManifest,
  lifecycle: ActivityJobLifecycle,
): Promise<{ response: Response; body: Record<string, unknown> }> {
  const store = authorizationStore(env, lifecycle.tenant_id, manifest);
  const identityDigest = await canonicalDigest({
    tenant_id: lifecycle.tenant_id,
    source_id: lifecycle.source_id,
    agent_id: lifecycle.agent_id,
    session_id: lifecycle.session_id,
    task_id: lifecycle.task_id || "",
    turn_id: lifecycle.turn_id || "",
  });
  const jobId = `hermes_${identityDigest.slice(0, 24)}`;
  const intentId = `intent_${identityDigest.slice(0, 24)}`;
  const existing = await store.fetch(
    new Request(`https://agentid.local/intent-contracts/${encodeURIComponent(intentId)}`),
  );
  let contractBody: Record<string, unknown>;
  let bindingReplayed = existing.ok;

  if (existing.ok) {
    contractBody = await existing.json() as Record<string, unknown>;
  } else if (existing.status === 404) {
    const resolved = await store.fetch(new Request("https://agentid.local/eval-assignments/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source_id: lifecycle.source_id,
        agent_id: lifecycle.agent_id,
        has_declared_intent: Boolean(lifecycle.declared_intent),
      }),
    }));
    if (!resolved.ok) return { response: resolved, body: await resolved.json() as Record<string, unknown> };
    const resolvedBody = await resolved.json() as Record<string, unknown>;
    const definition = recordValue(resolvedBody.definition) as EvalDefinition;
    if (definition.schema_version !== "agentaction.eval-definition.v1") {
      return {
        response: new Response(null, { status: 500 }),
        body: { error: "resolved eval definition is invalid", error_code: "eval_definition_invalid" },
      };
    }
    const profile = profileForEval(definition);
    const profileVariables = {
      agentaction_assignment_id: stringValue(resolvedBody.assignment_id),
      ...(definition.specification ? {
        agentaction_evaluation_specification: canonicalJson(definition.specification),
      } : {}),
      ...(lifecycle.declared_intent ? { goal: lifecycle.declared_intent.goal } : {}),
    };
    const boundProfile = bindIntentProfile(profile);
    const registered = await store.fetch(
      new Request("https://agentid.local/intent-profiles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile: boundProfile,
          tenant_id: lifecycle.tenant_id,
          registered_by: `activity_source:${lifecycle.source_id}`,
        }),
      }),
    );
    if (!registered.ok) {
      return { response: registered, body: await registered.json() as Record<string, unknown> };
    }
    const issued = await store.fetch(
      new Request(
        `https://agentid.local/intent-profiles/${encodeURIComponent(intentProfileKey(boundProfile))}/issue`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            issuance: {
              intent_id: intentId,
              job_id: jobId,
              variables: profileVariables,
              issued_at: lifecycle.started_at,
            } satisfies IntentProfileIssuanceInput,
            tenant_id: lifecycle.tenant_id,
            registered_by: `activity_source:${lifecycle.source_id}`,
          }),
        },
      ),
    );
    if (!issued.ok) return { response: issued, body: await issued.json() as Record<string, unknown> };
    contractBody = await issued.json() as Record<string, unknown>;
    bindingReplayed = issued.status === 200;
  } else {
    return { response: existing, body: await existing.json() as Record<string, unknown> };
  }

  const contract = recordValue(contractBody.contract) as IntentContract;
  const contractGoal = optionalString(recordValue(contract.profile_variables).goal);
  const expectedKind: EvalKind = lifecycle.declared_intent ? "agent_declared" : "observed_execution";
  const contractKind: EvalKind = contractGoal === undefined ? "observed_execution" : "agent_declared";
  if (
    contractKind !== expectedKind ||
    (lifecycle.declared_intent && contractGoal !== lifecycle.declared_intent.goal)
  ) {
    return {
      response: new Response(null, { status: 409 }),
      body: {
        error: "activity job intent declaration conflicts with the immutable contract",
        error_code: "activity_job_intent_conflict",
      },
    };
  }
  const evalId = evalIdFromProfile(contract.profile, contract.profile_version);
  if (!evalId || !contract.profile_version || !contract.profile_digest) {
    return {
      response: new Response(null, { status: 409 }),
      body: { error: "activity job eval binding is invalid", error_code: "activity_job_eval_binding_invalid" },
    };
  }
  let frozenSpecification: { specification: DeterministicEvalSpecification; digest: string } | undefined;
  try {
    frozenSpecification = await evalSpecificationFromContract(contract, contractKind);
  } catch {
    return {
      response: new Response(null, { status: 409 }),
      body: { error: "activity job eval specification is invalid", error_code: "activity_job_eval_specification_invalid" },
    };
  }
  const evalBinding: EvalBinding = {
    schema_version: "agentaction.eval-binding.v1",
    eval_id: evalId,
    version: contract.profile_version,
    kind: contractKind,
    trust: contractKind === "agent_declared" ? "agent_self_attested" : "trusted_execution_state",
    profile_key: contract.profile,
    profile_digest: contract.profile_digest,
    assignment_id: optionalString(recordValue(contract.profile_variables).agentaction_assignment_id)
      || `legacy_implicit_${contractKind}`,
    ...(frozenSpecification ? {
      specification_digest: frozenSpecification.digest,
      pass_threshold: frozenSpecification.specification.pass_threshold,
      required_criteria: frozenSpecification.specification.criteria
        .filter((criterion) => criterion.required)
        .map((criterion) => criterion.criterion_id),
    } : {}),
  };
  const criterionEvidence = lifecycle.reported_outcome?.criterion_evidence;
  if (criterionEvidence && (
    evalBinding.eval_id !== criterionEvidence.eval_id ||
    evalBinding.version !== criterionEvidence.eval_version ||
    evalBinding.trust !== criterionEvidence.trust
  )) {
    return {
      response: new Response(null, { status: 409 }),
      body: {
        error: "activity job criterion evidence does not match the frozen eval binding",
        error_code: "criterion_evidence_binding_mismatch",
      },
    };
  }
  if (criterionEvidence && criterionEvidence.job_id !== jobId) {
    return {
      response: new Response(null, { status: 409 }),
      body: {
        error: "activity job criterion evidence job_id does not match the active Job",
        error_code: "criterion_evidence_job_mismatch",
      },
    };
  }
  const binding = {
    schema_version: "agentaction.activity-job-result.v1",
    phase: lifecycle.phase,
    tenant_id: lifecycle.tenant_id,
    source_id: lifecycle.source_id,
    agent_id: lifecycle.agent_id,
    session_id: lifecycle.session_id,
    ...(lifecycle.task_id ? { task_id: lifecycle.task_id } : {}),
    ...(lifecycle.turn_id ? { turn_id: lifecycle.turn_id } : {}),
    job_id: jobId,
    intent_id: intentId,
    intent_digest: stringValue(contractBody.intent_digest || contract.intent_digest),
    profile_key: contract.profile,
    profile_kind: contractKind,
    eval_binding: evalBinding,
  };
  if (lifecycle.phase === "started") {
    return {
      response: new Response(null, { status: bindingReplayed ? 200 : 201 }),
      body: { ...binding, replayed: bindingReplayed },
    };
  }

  const history = await store.fetch(
    new Request(`https://agentid.local/intent-contracts/${encodeURIComponent(intentId)}/evaluations`),
  );
  if (history.ok) {
    const historyBody = await history.json() as Record<string, unknown>;
    const final = recordValue(historyBody.final);
    if (Object.keys(final).length > 0 && !criterionEvidence) {
      return {
        response: new Response(null, { status: 200 }),
        body: { ...binding, replayed: true, evaluation: final },
      };
    }
  }

  const finalized = await store.fetch(
    new Request(`https://agentid.local/intent-contracts/${encodeURIComponent(intentId)}/finalize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        job: {
          tenant_id: lifecycle.tenant_id,
          source_id: lifecycle.source_id,
          agent_id: lifecycle.agent_id,
          session_id: lifecycle.session_id,
          ...(lifecycle.task_id ? { task_id: lifecycle.task_id } : {}),
          ...(lifecycle.turn_id ? { turn_id: lifecycle.turn_id } : {}),
          intent_id: intentId,
          intent_digest: binding.intent_digest,
          job_id: jobId,
          eval_binding: evalBinding,
          started_at: lifecycle.started_at,
          completed_at: lifecycle.completed_at,
          status: lifecycle.status,
          ...(lifecycle.declared_intent ? {
            declared_intent: {
              ...lifecycle.declared_intent,
              provenance: "agent_declared",
            },
          } : {}),
          ...(lifecycle.reported_outcome ? {
            reported_outcome: {
              ...lifecycle.reported_outcome,
              provenance: "agent_self_attested",
            },
          } : {}),
          ...(lifecycle.model_usage ? { model_usage: lifecycle.model_usage } : {}),
        },
      }),
    }),
  );
  const finalBody = await finalized.json() as Record<string, unknown>;
  return {
    response: finalized,
    body: {
      ...binding,
      replayed: finalBody.replayed === true,
      ...(finalBody.evaluation ? { evaluation: finalBody.evaluation } : {}),
      ...(finalBody.error ? { error: finalBody.error, error_code: finalBody.error_code } : {}),
    },
  };
}

async function authenticateActivitySource(
  request: Request,
  manifest: AgentIdManifest,
): Promise<
  | { ok: true; sourceId: string; agentIds: string[] }
  | { ok: false; status: number; error: string }
> {
  const sourceId = request.headers.get("x-agentaction-source-id") || "";
  const authorization = request.headers.get("authorization") || "";
  if (!ACTIVITY_ID.test(sourceId) || !authorization.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "unauthorized activity source" };
  }
  const sources = recordValue(recordValue(recordValue(manifest.observability).ingestion).sources);
  if (!Object.prototype.hasOwnProperty.call(sources, sourceId)) {
    return { ok: false, status: 401, error: "unauthorized activity source" };
  }
  const source = recordValue(sources[sourceId]);
  if (source.enabled !== true) return { ok: false, status: 401, error: "unauthorized activity source" };
  const configuredDigest = optionalString(source.token_sha256)?.replace(/^sha256:/, "") || "";
  if (!/^[a-f0-9]{64}$/.test(configuredDigest)) {
    return { ok: false, status: 500, error: "activity source credentials are not configured" };
  }
  const submittedDigest = await sha256Hex(authorization.slice("Bearer ".length));
  if (!constantTimeEqual(configuredDigest, submittedDigest)) {
    return { ok: false, status: 401, error: "unauthorized activity source" };
  }
  if (source.agent_ids !== undefined && !Array.isArray(source.agent_ids)) {
    return { ok: false, status: 500, error: "activity source agent allowlist is invalid" };
  }
  const configuredAgentIds = Array.isArray(source.agent_ids) ? source.agent_ids : [];
  const agentIds = configuredAgentIds.map(String).filter((value) => ACTIVITY_ID.test(value));
  if (agentIds.length !== configuredAgentIds.length) {
    return { ok: false, status: 500, error: "activity source agent allowlist is invalid" };
  }
  return { ok: true, sourceId, agentIds };
}

async function readBoundedActivityJob(request: Request): Promise<unknown> {
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    throw new Error("activity job content-type must be application/json");
  }
  const declared = Number(request.headers.get("content-length") || "0");
  if (declared > 16_384) throw new Error("activity job exceeds 16 KiB");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("activity job body is required");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > 16_384) {
      await reader.cancel();
      throw new Error("activity job exceeds 16 KiB");
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("activity job must be valid JSON");
  }
}

function validateActivityJob(
  submitted: unknown,
  tenantId: string,
  sourceId: string,
  allowedAgentIds: string[],
): ActivityJobLifecycle {
  const job = strictRecord(submitted, [
    "schema_version",
    "phase",
    "tenant_id",
    "source_id",
    "agent_id",
    "session_id",
    "task_id",
    "turn_id",
    "started_at",
    "completed_at",
    "status",
    "declared_intent",
    "reported_outcome",
    "model_usage",
  ], "activity job");
  if (job.schema_version !== "agentaction.activity-job.v1") {
    throw new Error("activity job schema_version is unsupported");
  }
  if (job.phase !== "started" && job.phase !== "completed") throw new Error("activity job phase is invalid");
  if (job.tenant_id !== tenantId) throw new Error("activity job tenant_id does not match route tenant");
  if (job.source_id !== sourceId) throw new Error("activity job source_id does not match authenticated source");
  requiredActivityId(job.agent_id, "activity job agent_id");
  if (allowedAgentIds.length > 0 && !allowedAgentIds.includes(String(job.agent_id))) {
    throw new Error("activity job agent_id is not allowed for source");
  }
  requiredActivityId(job.session_id, "activity job session_id");
  if (job.task_id !== undefined) requiredActivityId(job.task_id, "activity job task_id");
  if (job.turn_id !== undefined) requiredActivityId(job.turn_id, "activity job turn_id");
  requiredActivityDate(job.started_at, "activity job started_at");
  const declaredIntent = job.declared_intent === undefined
    ? undefined
    : validateDeclaredIntent(job.declared_intent);
  const reportedOutcome = job.reported_outcome === undefined
    ? undefined
    : validateReportedOutcome(job.reported_outcome);
  const modelUsage = job.model_usage === undefined
    ? undefined
    : validateModelUsage(job.model_usage);
  if (reportedOutcome && !declaredIntent) {
    throw new Error("activity job reported_outcome requires declared_intent");
  }
  if (job.phase === "started") {
    if (job.completed_at !== undefined || job.status !== undefined || reportedOutcome !== undefined || modelUsage !== undefined) {
      throw new Error("started activity job cannot include terminal fields");
    }
  } else {
    requiredActivityDate(job.completed_at, "activity job completed_at");
    if (Date.parse(String(job.completed_at)) < Date.parse(String(job.started_at))) {
      throw new Error("activity job completed_at cannot precede started_at");
    }
    if (!["completed", "interrupted", "incomplete", "error"].includes(String(job.status))) {
      throw new Error("activity job status is invalid");
    }
  }
  return {
    ...job,
    ...(declaredIntent ? { declared_intent: declaredIntent } : {}),
    ...(reportedOutcome ? { reported_outcome: reportedOutcome } : {}),
    ...(modelUsage ? { model_usage: modelUsage } : {}),
  } as ActivityJobLifecycle;
}

function validateModelUsage(value: unknown): ModelUsageSummary {
  const usage = strictRecord(value, [
    "request_count",
    "requests_with_model",
    "requests_with_usage",
    "input_tokens",
    "uncached_input_tokens",
    "cached_input_tokens",
    "output_tokens",
    "total_tokens",
    "requests_truncated",
    "models_truncated",
    "models",
  ], "activity job model_usage");
  const requestCount = requiredUsageInteger(usage.request_count, "activity job model_usage request_count", 1, 10_000);
  const requestsWithModel = requiredUsageInteger(
    usage.requests_with_model,
    "activity job model_usage requests_with_model",
    0,
    requestCount,
  );
  const requestsWithUsage = requiredUsageInteger(
    usage.requests_with_usage,
    "activity job model_usage requests_with_usage",
    0,
    requestCount,
  );
  const inputTokens = optionalUsageInteger(usage.input_tokens, "activity job model_usage input_tokens");
  const uncachedInputTokens = optionalUsageInteger(
    usage.uncached_input_tokens,
    "activity job model_usage uncached_input_tokens",
  );
  const cachedInputTokens = optionalUsageInteger(
    usage.cached_input_tokens,
    "activity job model_usage cached_input_tokens",
  );
  const outputTokens = optionalUsageInteger(usage.output_tokens, "activity job model_usage output_tokens");
  const totalTokens = optionalUsageInteger(usage.total_tokens, "activity job model_usage total_tokens");
  validateReconciledUsageTotal(
    uncachedInputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens,
    "activity job model_usage",
  );
  if (usage.requests_truncated !== undefined && usage.requests_truncated !== true) {
    throw new Error("activity job model_usage requests_truncated is invalid");
  }
  if (usage.models_truncated !== undefined && usage.models_truncated !== true) {
    throw new Error("activity job model_usage models_truncated is invalid");
  }
  if (usage.models !== undefined && (!Array.isArray(usage.models) || usage.models.length > 20)) {
    throw new Error("activity job model_usage models is invalid");
  }
  const seen = new Set<string>();
  const models = (Array.isArray(usage.models) ? usage.models : []).map((item, index) => {
    const group = strictRecord(item, [
      "provider", "model", "request_count", "requests_with_usage", "input_tokens", "uncached_input_tokens",
      "cached_input_tokens", "output_tokens", "total_tokens",
    ], `activity job model_usage models[${index}]`);
    const provider = group.provider === undefined
      ? undefined
      : requiredActivityText(group.provider, `activity job model_usage models[${index}].provider`, 160);
    const model = group.model === undefined
      ? undefined
      : requiredActivityText(group.model, `activity job model_usage models[${index}].model`, 160);
    if (!provider && !model) throw new Error(`activity job model_usage models[${index}] requires provider or model`);
    const key = `${provider || ""}\u0000${model || ""}`;
    if (seen.has(key)) throw new Error("activity job model_usage contains duplicate model groups");
    seen.add(key);
    const groupRequestCount = requiredUsageInteger(
      group.request_count,
      `activity job model_usage models[${index}].request_count`,
      1,
      requestCount,
    );
    const groupRequestsWithUsage = requiredUsageInteger(
      group.requests_with_usage,
      `activity job model_usage models[${index}].requests_with_usage`,
      0,
      groupRequestCount,
    );
    const groupInput = optionalUsageInteger(group.input_tokens, `activity job model_usage models[${index}].input_tokens`);
    const groupUncachedInput = optionalUsageInteger(
      group.uncached_input_tokens,
      `activity job model_usage models[${index}].uncached_input_tokens`,
    );
    const groupCachedInput = optionalUsageInteger(
      group.cached_input_tokens,
      `activity job model_usage models[${index}].cached_input_tokens`,
    );
    const groupOutput = optionalUsageInteger(group.output_tokens, `activity job model_usage models[${index}].output_tokens`);
    const groupTotal = optionalUsageInteger(group.total_tokens, `activity job model_usage models[${index}].total_tokens`);
    validateReconciledUsageTotal(
      groupUncachedInput,
      groupCachedInput,
      groupOutput,
      groupTotal,
      `activity job model_usage models[${index}]`,
    );
    if (
      (groupInput !== undefined && (inputTokens === undefined || groupInput > inputTokens)) ||
      (groupUncachedInput !== undefined && (uncachedInputTokens === undefined || groupUncachedInput > uncachedInputTokens)) ||
      (groupCachedInput !== undefined && (cachedInputTokens === undefined || groupCachedInput > cachedInputTokens)) ||
      (groupOutput !== undefined && (outputTokens === undefined || groupOutput > outputTokens)) ||
      (groupTotal !== undefined && (totalTokens === undefined || groupTotal > totalTokens))
    ) throw new Error(`activity job model_usage models[${index}] exceeds aggregate tokens`);
    return {
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
      request_count: groupRequestCount,
      requests_with_usage: groupRequestsWithUsage,
      ...(groupInput !== undefined ? { input_tokens: groupInput } : {}),
      ...(groupUncachedInput !== undefined ? { uncached_input_tokens: groupUncachedInput } : {}),
      ...(groupCachedInput !== undefined ? { cached_input_tokens: groupCachedInput } : {}),
      ...(groupOutput !== undefined ? { output_tokens: groupOutput } : {}),
      ...(groupTotal !== undefined ? { total_tokens: groupTotal } : {}),
    };
  });
  if (models.reduce((sum, group) => sum + group.request_count, 0) > requestsWithModel) {
    throw new Error("activity job model_usage model requests exceed aggregate coverage");
  }
  if (models.reduce((sum, group) => sum + group.requests_with_usage, 0) > requestsWithUsage) {
    throw new Error("activity job model_usage model usage coverage exceeds aggregate coverage");
  }
  return {
    request_count: requestCount,
    requests_with_model: requestsWithModel,
    requests_with_usage: requestsWithUsage,
    ...(inputTokens !== undefined ? { input_tokens: inputTokens } : {}),
    ...(uncachedInputTokens !== undefined ? { uncached_input_tokens: uncachedInputTokens } : {}),
    ...(cachedInputTokens !== undefined ? { cached_input_tokens: cachedInputTokens } : {}),
    ...(outputTokens !== undefined ? { output_tokens: outputTokens } : {}),
    ...(totalTokens !== undefined ? { total_tokens: totalTokens } : {}),
    ...(usage.requests_truncated === true ? { requests_truncated: true as const } : {}),
    ...(usage.models_truncated === true ? { models_truncated: true as const } : {}),
    ...(models.length > 0 ? { models } : {}),
  };
}

function validateReconciledUsageTotal(
  uncachedInputTokens: number | undefined,
  cachedInputTokens: number | undefined,
  outputTokens: number | undefined,
  totalTokens: number | undefined,
  label: string,
): void {
  if (
    uncachedInputTokens !== undefined &&
    cachedInputTokens !== undefined &&
    outputTokens !== undefined &&
    totalTokens !== undefined &&
    uncachedInputTokens + cachedInputTokens + outputTokens !== totalTokens
  ) throw new Error(`${label} total_tokens does not equal uncached_input_tokens + cached_input_tokens + output_tokens`);
}

function requiredUsageInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`${label} is invalid`);
  }
  return Number(value);
}

function optionalUsageInteger(value: unknown, label: string): number | undefined {
  return value === undefined ? undefined : requiredUsageInteger(value, label, 0, 1_000_000_000_000);
}

function validateDeclaredIntent(value: unknown): AgentDeclaredIntent {
  const declared = strictRecord(value, [
    "schema_version",
    "goal",
    "success_criteria",
    "constraints",
    "confidence",
  ], "activity job declared_intent");
  if (declared.schema_version !== "agentaction.declared-intent.v1") {
    throw new Error("activity job declared_intent schema_version is unsupported");
  }
  return {
    schema_version: "agentaction.declared-intent.v1",
    goal: requiredActivityText(declared.goal, "activity job declared_intent goal", 500),
    success_criteria: requiredActivityTextList(
      declared.success_criteria,
      "activity job declared_intent success_criteria",
      1,
      8,
      240,
    ),
    constraints: requiredActivityTextList(
      declared.constraints,
      "activity job declared_intent constraints",
      0,
      8,
      240,
    ),
    confidence: requiredActivityConfidence(declared.confidence, "activity job declared_intent confidence"),
  };
}

function validateReportedOutcome(value: unknown): AgentReportedOutcome {
  const outcome = strictRecord(value, [
    "schema_version",
    "status",
    "success_criteria_met",
    "constraints_respected",
    "confidence",
    "criterion_evidence",
  ], "activity job reported_outcome");
  if (outcome.schema_version !== "agentaction.reported-outcome.v1") {
    throw new Error("activity job reported_outcome schema_version is unsupported");
  }
  if (!["achieved", "partial", "failed", "unknown"].includes(String(outcome.status))) {
    throw new Error("activity job reported_outcome status is invalid");
  }
  if (!["all", "some", "none", "unknown"].includes(String(outcome.success_criteria_met))) {
    throw new Error("activity job reported_outcome success_criteria_met is invalid");
  }
  if (!["pass", "fail", "unknown"].includes(String(outcome.constraints_respected))) {
    throw new Error("activity job reported_outcome constraints_respected is invalid");
  }
  return {
    schema_version: "agentaction.reported-outcome.v1",
    status: outcome.status as AgentReportedOutcome["status"],
    success_criteria_met: outcome.success_criteria_met as AgentReportedOutcome["success_criteria_met"],
    constraints_respected: outcome.constraints_respected as AgentReportedOutcome["constraints_respected"],
    confidence: requiredActivityConfidence(outcome.confidence, "activity job reported_outcome confidence"),
    ...(outcome.criterion_evidence !== undefined ? {
      criterion_evidence: validateSelfAttestedCriterionEvidence(outcome.criterion_evidence),
    } : {}),
  };
}

function validateSelfAttestedCriterionEvidence(value: unknown): SelfAttestedCriterionEvidenceReport {
  const report = strictRecord(value, [
    "schema_version", "eval_id", "eval_version", "job_id", "trust", "criteria",
  ], "activity job criterion_evidence");
  if (report.schema_version !== "agentaction.refund-triage-criterion-evidence.v1") {
    throw new Error("activity job criterion_evidence schema_version is unsupported");
  }
  if (report.eval_id !== "refund_triage" || report.eval_version !== "v2") {
    throw new Error("activity job criterion_evidence eval is unsupported");
  }
  if (report.trust !== "agent_self_attested") {
    throw new Error("activity job criterion_evidence trust is invalid");
  }
  requiredActivityId(report.job_id, "activity job criterion_evidence job_id");
  if (!Array.isArray(report.criteria) || report.criteria.length < 1 || report.criteria.length > 6) {
    throw new Error("activity job criterion_evidence criteria is invalid");
  }
  const seen = new Set<string>();
  const criteria = report.criteria.map((value, index): SelfAttestedCriterionEvidence => {
    const criterion = strictRecord(
      value,
      ["criterion_id", "status", "evidence_refs"],
      `activity job criterion_evidence criteria[${index}]`,
    );
    const criterionId = stringValue(criterion.criterion_id);
    if (!REFUND_TRIAGE_CRITERION_IDS.has(criterionId) || seen.has(criterionId)) {
      throw new Error(`activity job criterion_evidence criteria[${index}].criterion_id is invalid`);
    }
    seen.add(criterionId);
    if (!["pass", "fail", "insufficient_evidence"].includes(stringValue(criterion.status))) {
      throw new Error(`activity job criterion_evidence criteria[${index}].status is invalid`);
    }
    if (!Array.isArray(criterion.evidence_refs) || criterion.evidence_refs.length < 1 || criterion.evidence_refs.length > 4) {
      throw new Error(`activity job criterion_evidence criteria[${index}].evidence_refs is invalid`);
    }
    const evidenceRefs = criterion.evidence_refs.map((reference, referenceIndex) => {
      if (typeof reference !== "string" || !CRITERION_EVIDENCE_REF.test(reference)) {
        throw new Error(
          `activity job criterion_evidence criteria[${index}].evidence_refs[${referenceIndex}] is invalid`,
        );
      }
      return reference;
    });
    if (new Set(evidenceRefs).size !== evidenceRefs.length) {
      throw new Error(`activity job criterion_evidence criteria[${index}].evidence_refs contains duplicates`);
    }
    return {
      criterion_id: criterionId,
      status: criterion.status as SelfAttestedCriterionEvidence["status"],
      evidence_refs: evidenceRefs,
    };
  });
  return {
    schema_version: "agentaction.refund-triage-criterion-evidence.v1",
    eval_id: "refund_triage",
    eval_version: "v2",
    job_id: String(report.job_id),
    trust: "agent_self_attested",
    criteria,
  };
}

function requiredActivityText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > maximum) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function requiredActivityTextList(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  maximumLength: number,
): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error(`${label} is invalid`);
  }
  const result = value.map((item, index) => requiredActivityText(item, `${label}[${index}]`, maximumLength));
  if (new Set(result).size !== result.length) throw new Error(`${label} contains duplicates`);
  return result;
}

function requiredActivityConfidence(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

async function readBoundedActivityBatch(request: Request): Promise<unknown> {
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    throw new Error("activity batch content-type must be application/json");
  }
  const declared = Number(request.headers.get("content-length") || "0");
  if (declared > 262_144) throw new Error("activity batch exceeds 256 KiB");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("activity batch body is required");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > 262_144) {
      await reader.cancel();
      throw new Error("activity batch exceeds 256 KiB");
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const textBody = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  try {
    return JSON.parse(textBody);
  } catch {
    throw new Error("activity batch must be valid JSON");
  }
}

function validateActivityBatch(
  submitted: unknown,
  tenantId: string,
  sourceId: string,
  allowedAgentIds: string[],
): ActivityBatch {
  const batch = strictRecord(submitted, ["schema_version", "batch_id", "tenant_id", "source_id", "sent_at", "events"], "activity batch");
  if (batch.schema_version !== "agentaction.observation-batch.v1") throw new Error("activity batch schema_version is unsupported");
  requiredActivityId(batch.batch_id, "batch_id");
  if (batch.tenant_id !== tenantId) throw new Error("activity batch tenant_id does not match route tenant");
  if (batch.source_id !== sourceId) throw new Error("activity batch source_id does not match authenticated source");
  requiredActivityDate(batch.sent_at, "sent_at");
  if (!Array.isArray(batch.events) || batch.events.length < 1 || batch.events.length > 100) {
    throw new Error("activity batch events must contain 1 to 100 entries");
  }
  const seen = new Set<string>();
  const events = batch.events.map((value, index) => {
    const event = validateActivityEvent(value, sourceId, allowedAgentIds, index);
    if (seen.has(event.event_id)) throw new Error(`activity event ID is duplicated in batch: ${event.event_id}`);
    seen.add(event.event_id);
    return event;
  });
  return { ...batch, events } as ActivityBatch;
}

function validateActivityEvent(
  value: unknown,
  sourceId: string,
  allowedAgentIds: string[],
  index: number,
): ActivityEvent {
  const label = `activity event ${index}`;
  const event = strictRecord(value, [
    "schema_version", "event_id", "event_type", "observed_at", "source_id", "agent_id", "correlation", "intent",
    "tool", "evaluation", "execution", "model", "request", "usage", "subagent",
  ], label);
  if (event.schema_version !== "agentaction.hermes-observation.v1") throw new Error(`${label} schema_version is unsupported`);
  requiredActivityId(event.event_id, `${label} event_id`);
  if (typeof event.event_type !== "string" || !ACTIVITY_EVENT_TYPES.has(event.event_type)) throw new Error(`${label} event_type is unsupported`);
  requiredActivityDate(event.observed_at, `${label} observed_at`);
  if (event.source_id !== sourceId) throw new Error(`${label} source_id does not match authenticated source`);
  requiredActivityId(event.agent_id, `${label} agent_id`);
  if (allowedAgentIds.length > 0 && !allowedAgentIds.includes(String(event.agent_id))) throw new Error(`${label} agent_id is not allowed for source`);

  const correlation = strictRecord(event.correlation, [
    "session_id", "job_id", "task_id", "turn_id", "tool_call_id", "api_request_id", "parent_session_id", "child_session_id",
    "parent_turn_id", "child_subagent_id",
  ], `${label} correlation`);
  for (const [key, entry] of Object.entries(correlation)) requiredActivityId(entry, `${label} correlation.${key}`);
  const intent = strictRecord(event.intent, ["binding_status", "intent_id", "intent_digest"], `${label} intent`);
  if (intent.binding_status !== "bound" && intent.binding_status !== "unbound") throw new Error(`${label} intent binding_status is invalid`);
  const hasIntentId = typeof intent.intent_id === "string" && intent.intent_id.length > 0;
  const hasIntentDigest = typeof intent.intent_digest === "string" && intent.intent_digest.length > 0;
  if (intent.binding_status === "bound" && (!hasIntentId || !hasIntentDigest)) throw new Error(`${label} bound intent requires intent_id and intent_digest`);
  if (intent.binding_status === "unbound" && (hasIntentId || hasIntentDigest)) throw new Error(`${label} unbound intent cannot include intent identifiers`);
  if (hasIntentId) requiredBoundedString(intent.intent_id, 160, `${label} intent_id`);
  if (hasIntentDigest) requiredBoundedString(intent.intent_digest, 160, `${label} intent_digest`);

  if (event.tool !== undefined) {
    const tool = strictRecord(event.tool, ["name", "action"], `${label} tool`);
    requiredBoundedString(tool.name, 160, `${label} tool.name`);
    requiredActivityId(tool.action, `${label} tool.action`);
  }
  if (event.evaluation !== undefined) {
    const evaluation = strictRecord(event.evaluation, ["status", "counterfactual_decision", "findings"], `${label} evaluation`);
    requiredActivityId(evaluation.status, `${label} evaluation.status`);
    if (evaluation.counterfactual_decision !== null && !ACTIVITY_DECISIONS.has(String(evaluation.counterfactual_decision))) {
      throw new Error(`${label} counterfactual_decision is invalid`);
    }
    if (!Array.isArray(evaluation.findings) || evaluation.findings.length > 20) throw new Error(`${label} evaluation findings are invalid`);
    for (const finding of evaluation.findings) requiredActivityId(finding, `${label} evaluation finding`);
  }
  if (event.execution !== undefined) {
    const execution = strictRecord(event.execution, ["status", "duration_ms", "error_type"], `${label} execution`);
    if (!ACTIVITY_EXECUTION_STATUSES.has(String(execution.status))) throw new Error(`${label} execution status is invalid`);
    optionalNonnegativeNumber(execution.duration_ms, `${label} execution.duration_ms`);
    if (execution.error_type !== undefined) requiredActivityId(execution.error_type, `${label} execution.error_type`);
  }
  validateStringRecord(event.model, ["model", "provider", "api_mode", "platform"], `${label} model`, 160);
  validateNumberRecord(event.request, ["api_call_count", "approx_input_tokens", "tool_count"], `${label} request`, true, 1_000_000_000_000);
  validateNumberRecord(
    event.usage,
    ["input_tokens", "uncached_input_tokens", "cached_input_tokens", "output_tokens", "total_tokens"],
    `${label} usage`,
    false,
    1_000_000_000_000,
  );
  if (event.usage !== undefined) {
    const usage = event.usage as Record<string, unknown>;
    validateReconciledUsageTotal(
      usage.uncached_input_tokens as number | undefined,
      usage.cached_input_tokens as number | undefined,
      usage.output_tokens as number | undefined,
      usage.total_tokens as number | undefined,
      `${label} usage`,
    );
  }
  if (event.subagent !== undefined) {
    const subagent = strictRecord(event.subagent, ["role", "status", "duration_ms"], `${label} subagent`);
    requiredBoundedString(subagent.role, 80, `${label} subagent.role`);
    requiredActivityId(subagent.status, `${label} subagent.status`);
    optionalNonnegativeNumber(subagent.duration_ms, `${label} subagent.duration_ms`);
  }
  if (event.event_type === "tool_action" && (!event.tool || !event.evaluation || !event.execution)) {
    throw new Error(`${label} tool_action requires tool, evaluation, and execution metadata`);
  }
  return event as unknown as ActivityEvent;
}

function strictRecord(value: unknown, allowedKeys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const record = value as Record<string, unknown>;
  const unsupported = Object.keys(record).find((key) => !allowedKeys.includes(key));
  if (unsupported) throw new Error(`${label} contains unsupported field: ${unsupported}`);
  return record;
}

function requiredActivityId(value: unknown, label: string): void {
  if (typeof value !== "string" || !ACTIVITY_ID.test(value)) throw new Error(`${label} is invalid`);
}

function requiredBoundedString(value: unknown, maximum: number, label: string): void {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) throw new Error(`${label} is invalid`);
}

function requiredActivityDate(value: unknown, label: string): void {
  if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value))) throw new Error(`${label} must be a valid date-time`);
}

function optionalNonnegativeNumber(value: unknown, label: string): void {
  if (value === undefined || value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${label} is invalid`);
}

function validateStringRecord(value: unknown, fields: string[], label: string, maximum: number): void {
  if (value === undefined) return;
  const record = strictRecord(value, fields, label);
  for (const [key, entry] of Object.entries(record)) requiredBoundedString(entry, maximum, `${label}.${key}`);
}

function validateNumberRecord(
  value: unknown,
  fields: string[],
  label: string,
  allowNull: boolean,
  maximum = Number.MAX_SAFE_INTEGER,
): void {
  if (value === undefined) return;
  const record = strictRecord(value, fields, label);
  for (const [key, entry] of Object.entries(record)) {
    if (allowNull && entry === null) continue;
    if (typeof entry !== "number" || !Number.isSafeInteger(entry) || entry < 0 || entry > maximum) {
      throw new Error(`${label}.${key} is invalid`);
    }
  }
}

function activityDateFilter(value: string | null, label: string): { value?: number; error?: string } {
  if (!value) return {};
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? { value: parsed } : { error: `activity ${label} must be a valid date-time` };
}

function activityMatches(
  event: ActivityEvent,
  filters: Record<string, string>,
  from?: number,
  to?: number,
): boolean {
  const observedAt = Date.parse(event.observed_at);
  if (from !== undefined && observedAt < from) return false;
  if (to !== undefined && observedAt > to) return false;
  if (filters.agent_id && event.agent_id !== filters.agent_id) return false;
  if (filters.event_type && event.event_type !== filters.event_type) return false;
  if (filters.tool && event.tool?.name !== filters.tool) return false;
  if (filters.decision && event.evaluation?.counterfactual_decision !== filters.decision) return false;
  if (filters.execution_status && event.execution?.status !== filters.execution_status) return false;
  if (filters.intent_binding && event.intent.binding_status !== filters.intent_binding) return false;
  return true;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((entry) => entry.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
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
  if (
    env.AGENTID_INTERNAL_SERVICE_TOKEN &&
    authorization === `Bearer ${env.AGENTID_INTERNAL_SERVICE_TOKEN}`
  ) {
    return { ok: true, context: { method: "internal_service" } };
  }
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
  if (endpoint === "intent-profiles") return stringValue(scopes.intent_profile ?? scopes.intent_contract ?? scopes.authorize);
  if (endpoint === "intent-quality") return stringValue(scopes.intent_quality ?? scopes.intent_contract ?? scopes.authorize);
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
  <title>AgentAction Approvals</title>
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
        <h1>AgentAction Approvals</h1>
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
  <title>AgentAction Audit Console</title>
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
    <h1>AgentAction Audit Console</h1>
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
