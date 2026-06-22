type Env = {
  AGENTID_API_KEY?: string;
  AGENTID_AUDIT_WEBHOOK_TOKEN?: string;
  AGENTID_AUDIT_WEBHOOK_URL?: string;
  AGENTID_DEMO_OIDC_SECRET?: string;
  AGENTID_MANIFEST_JSON?: string;
  AGENTID_MANIFESTS?: {
    get(key: string): Promise<string | null>;
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
  used: boolean;
};
type ApprovalRequest = {
  approval_id: string;
  status: "pending" | "approved" | "denied";
  agent_id: string;
  tool: string;
  action: string;
  resource: string;
  requested_by: string;
  reason: string;
  created_at: string;
  decided_at?: string;
  decided_by?: string;
  job_id?: string;
  case_id?: string;
  customer_id?: string;
  context?: Record<string, string>;
  findings?: string[];
};
type AuditRecord = {
  audit_id: string;
  received_at: string;
  schema_version: string;
  type: string;
  tenant_id?: string | null;
  agent_id?: string;
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
      const auth = await authenticate(request, env, manifest, route.tenantId, route.endpoint);
      if (!auth.ok) {
        return json({ error: auth.error }, auth.status);
      }

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
        ctx.waitUntil(
          emitAudit(env, {
            type: "agentid.decision",
            tenant_id: route.tenantId,
            agent_id: stringValue(decision.event.agent_id),
            allow: decision.allow,
            findings: decision.findings,
            event: decision.event,
            auth: auth.context,
          }),
        );
        return json(
          {
            allow: decision.allow,
            findings: decision.findings,
            decision: decision.allow ? "allow" : "deny",
            event: decision.event,
            auth: auth.context,
          },
          decision.allow ? 200 : 403,
        );
      }

      if (request.method === "POST" && route.endpoint === "approval-requests" && !route.resourceId) {
        const payload = await readJson(request);
        const approval = createApprovalRequest(manifest, payload);
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
              approval: body,
              auth: auth.context,
            }),
          );
        }
        body.auth = auth.context;
        return json(body, stored.status);
      }

      if (request.method === "POST" && route.endpoint === "jit-grants") {
        const payload = await readJson(request);
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
        const grant = createJitGrant(manifest, payload);
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

    if (request.method === "POST" && url.pathname === "/approvals") {
      const approval = payload as ApprovalRequest;
      await this.state.storage.put(`approval:${approval.approval_id}`, approval);
      return json(approval, 201);
    }

    if (request.method === "GET" && url.pathname.startsWith("/approvals/")) {
      const approvalId = decodeURIComponent(url.pathname.replace("/approvals/", ""));
      const approval = await this.state.storage.get<ApprovalRequest>(`approval:${approvalId}`);
      if (!approval) return json({ error: "not found" }, 404);
      return json(approval);
    }

    if (request.method === "POST" && url.pathname === "/approvals/require-approved") {
      const manifest = payload.manifest as AgentIdManifest;
      const grantRequest = payload.request as ToolEvent;
      const result = await this.requireApprovedForGrant(manifest, grantRequest);
      if (result.length > 0) return json({ error: result[0] }, 400);
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname.startsWith("/approvals/")) {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length !== 3 || (parts[2] !== "approve" && parts[2] !== "deny")) {
        return json({ error: "not found" }, 404);
      }
      const approvalId = decodeURIComponent(parts[1]);
      const approval = await this.state.storage.get<ApprovalRequest>(`approval:${approvalId}`);
      if (!approval) return json({ error: `approval request not found: ${approvalId}` }, 404);
      approval.status = parts[2] === "approve" ? "approved" : "denied";
      approval.decided_at = new Date().toISOString();
      approval.decided_by = stringValue(payload.decided_by ?? payload.user_id);
      approval.findings = findingsFromPayload(payload);
      await this.state.storage.put(`approval:${approvalId}`, approval);
      return json(approval);
    }

    if (request.method === "POST" && url.pathname === "/bind") {
      const event = payload.event as ToolEvent;
      const manifest = payload.manifest as AgentIdManifest;
      const findings: string[] = [];
      const grantId = stringValue(event.jit_grant_id);

      if (!grantId) {
        event.jit_grant_valid = false;
        return json({ event, findings: ["missing jit_grant_id"] });
      }

      const grant = await this.state.storage.get<Grant>(grantId);
      if (!grant) {
        event.jit_grant_valid = false;
        return json({ event, findings: ["unknown jit_grant_id"] });
      }

      if (Date.parse(grant.expires_at) <= Date.now()) findings.push("JIT grant is expired");
      if (grant.used) findings.push("JIT grant was already used");
      if (grant.agent_id !== event.agent_id) findings.push("JIT grant agent_id mismatch");
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
        if (!hasValue(event[key]) || stringValue(event[key]) !== value) {
          findings.push(`JIT grant ${key} mismatch`);
        }
      }

      event.jit_grant_valid = findings.length === 0;
      event.jit_grant_agent_id = grant.agent_id;
      event.jit_grant_tool = grant.tool;
      event.jit_grant_action = grant.action;
      event.jit_grant_approval_id = grant.approval_id;
      event.approval_id = event.approval_id || grant.approval_id;
      event.jit_grant_job_id = grant.job_id;
      event.jit_grant_case_id = grant.case_id;
      event.jit_grant_customer_id = grant.customer_id;
      if (grant.context) event.jit_grant_context = grant.context;

      if (findings.length === 0 && manifest.jit_authorization?.revoke_after_use === true) {
        grant.used = true;
        await this.state.storage.put(grant.jit_grant_id, grant);
      }

      return json({ event, findings });
    }

    return json({ error: "not found" }, 404);
  }

  async requireApprovedForGrant(manifest: AgentIdManifest, request: ToolEvent): Promise<string[]> {
    const toolName = stringValue(request.tool);
    const tool = toolByName(manifest, toolName);
    if (!tool || !approvalRequired(tool)) return [];

    const approvalId = stringValue(request.approval_id);
    if (!approvalId) return ["approval_id is required for approval-gated JIT grants"];
    const approval = await this.state.storage.get<ApprovalRequest>(`approval:${approvalId}`);
    if (!approval) return [`approval request not found: ${approvalId}`];
    if (approval.status === "denied") return [`approval request is denied: ${approvalId}`];
    if (approval.status !== "approved") return [`approval request is not approved: ${approvalId}`];

    const agentId = stringValue(manifest.agent?.id);
    if (approval.agent_id !== agentId) return ["approval request agent_id mismatch"];
    if (approval.tool !== toolName) return ["approval request tool mismatch"];
    if (approval.action !== stringValue(request.action)) return ["approval request action mismatch"];
    const fields: Array<[string, unknown, unknown]> = [
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
      const finding = matchingFinding(key, value, request[key]);
      if (finding) return [finding];
    }
    return [];
  }
}

async function authorize(
  manifest: AgentIdManifest,
  payload: ToolEvent,
  env: Env,
  tenantId: string | null,
): Promise<{ allow: boolean; findings: string[]; event: ToolEvent }> {
  const event: ToolEvent = {
    agent_id: payload.agent_id ?? manifest.agent?.id,
    tool: payload.tool,
    capability: payload.capability,
    skill_id: payload.skill_id,
    skill_hash: payload.skill_hash,
    action: payload.action,
    data_from: payload.data_from ?? "",
    data_to: payload.data_to ?? "",
    approved: payload.approved === true,
    jit_grant_id: payload.jit_grant_id,
    resource: payload.resource ?? "",
    called_agent: payload.called_agent,
    delegated_tool: payload.delegated_tool,
    delegation_depth: payload.delegation_depth,
    delegation_grant_id: payload.delegation_grant_id,
    approval_source: payload.approval_source,
    approval_agent: payload.approval_agent,
    tenant_id: payload.tenant_id,
    user_id: payload.user_id,
    job_id: payload.job_id,
    case_id: payload.case_id,
    customer_id: payload.customer_id,
  };
  Object.assign(event, stringContext(payload));
  const findings: string[] = [];
  const tool = toolByName(manifest, stringValue(event.tool ?? event.capability ?? event.skill_id));

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

  findings.push(...auditEvent(manifest, event));
  return { allow: findings.length === 0, findings, event };
}

function createApprovalRequest(manifest: AgentIdManifest, payload: ToolEvent): ApprovalRequest {
  const agentId = stringValue(manifest.agent?.id);
  const toolName = stringValue(payload.tool);
  const action = stringValue(payload.action);
  const tool = toolByName(manifest, toolName);

  if (!tool) throw new Error(`unknown tool: ${toolName}`);
  if (tool.access !== action) throw new Error(`action does not match manifest access for ${toolName}`);
  if (!approvalRequired(tool)) throw new Error(`${toolName} does not require approval`);

  return {
    approval_id: stringValue(payload.approval_id) || crypto.randomUUID(),
    status: "pending",
    agent_id: agentId,
    tool: toolName,
    action,
    resource: stringValue(payload.resource),
    requested_by: stringValue(payload.requested_by ?? payload.user_id),
    reason: stringValue(payload.reason),
    created_at: new Date().toISOString(),
    job_id: stringValue(payload.job_id),
    case_id: stringValue(payload.case_id),
    customer_id: stringValue(payload.customer_id),
    context: stringContext(payload),
    findings: [],
  };
}

function createJitGrant(manifest: AgentIdManifest, payload: ToolEvent): Grant {
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
    used: false,
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
    const flow = (manifest.data_flows ?? []).find(
      (candidate) => candidate.from === event.data_from && candidate.to === event.data_to,
    );
    if (flow?.allowed === false) {
      findings.push(`event[0]: blocked data flow used: ${event.data_from} -> ${event.data_to}`);
    } else if (!flow) {
      findings.push(`event[0]: undeclared data flow: ${event.data_from} -> ${event.data_to}`);
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

function approvalRequired(tool: Record<string, unknown>): boolean {
  return APPROVAL_REQUIRED.has(stringValue(tool.approval));
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
  if (endpoint === "jit-grants") return stringValue(scopes.jit_grant);
  if (endpoint === "approval-requests") return stringValue(scopes.approval_request ?? scopes.jit_grant);
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
    .token {
      width: min(280px, 44vw);
      height: 34px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 0 10px;
      background: #fff;
      color: var(--ink);
      font-size: 13px;
    }
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
        <input class="token" id="token" type="password" autocomplete="off" placeholder="API key for live approvals">
        <button class="ghost" id="loadLive">Load by ID</button>
        <button class="ghost" id="resetMock">Reset Mock</button>
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
        </div>
        <div class="decision-bar">
          <div class="statusline" id="statusline">Mock approval inbox ready.</div>
          <div class="decision-actions">
            <button class="danger" id="deny">Deny</button>
            <button class="primary" id="approve">Approve Once</button>
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
        action: "execute",
        resource: "service/checkout-api/environment/production",
        requested_by: "user-1",
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
          incident_id: "INC-2048"
        },
        evidence: [
          "Production-changing tool requires human approval.",
          "JIT grant will be single-use and bound to service, branch, commit, and change request.",
          "Read-only diagnostics were allowed before this request."
        ]
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
    let approvals = JSON.parse(sessionStorage.getItem("agentid.approvals.mock") || "null") || initialApprovals();
    let selectedId = approvals[0]?.approval_id || "";
    let filter = "pending";
    const list = document.getElementById("list");
    const token = document.getElementById("token");
    const statusline = document.getElementById("statusline");
    token.value = sessionStorage.getItem("agentid.approvals.token") || "";
    document.getElementById("approve").addEventListener("click", () => decide("approve"));
    document.getElementById("deny").addEventListener("click", () => decide("deny"));
    document.getElementById("resetMock").addEventListener("click", () => {
      approvals = initialApprovals();
      selectedId = approvals[0].approval_id;
      persist();
      render();
      statusline.textContent = "Mock data reset.";
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
      document.getElementById("deniedCount").textContent = approvals.filter((item) => item.status === "denied").length;
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
          '<div class="item-row"><span class="pill risk-' + esc(approval.risk || "medium") + '">' + esc(approval.risk || "medium") + '</span><span class="resource">' + age(approval.created_at) + '</span></div>';
        button.addEventListener("click", () => { selectedId = approval.approval_id; render(); });
        list.appendChild(button);
      }
      if (!visible.length) {
        list.innerHTML = '<div class="item"><div class="tool">No approvals in this view</div><div class="resource">Switch filters or reset the mock inbox.</div></div>';
      }
    }
    function renderDetail() {
      const approval = selected();
      if (!approval) return;
      document.getElementById("selectedPills").innerHTML =
        '<span class="pill ' + esc(approval.status) + '">' + esc(approval.status) + '</span> ' +
        '<span class="pill risk-' + esc(approval.risk || "medium") + '">' + esc(approval.risk || "medium") + ' risk</span>';
      document.getElementById("title").textContent = approval.tool;
      document.getElementById("summary").textContent = approval.agent_id + " wants to " + approval.action + " " + approval.resource + ".";
      const fields = {
        "Approval ID": approval.approval_id,
        "Agent": approval.agent_id,
        "Requested By": approval.requested_by,
        "Action": approval.action,
        "Resource": approval.resource,
        "Job": approval.job_id || "",
        "Case": approval.case_id || "",
        "Customer": approval.customer_id || "",
        "Created": approval.created_at,
        "Decided": approval.decided_at || ""
      };
      for (const [key, value] of Object.entries(approval.context || {})) fields[key] = value;
      document.getElementById("scopeGrid").innerHTML = Object.entries(fields)
        .filter(([, value]) => String(value || ""))
        .map(([key, value]) => '<div class="field"><span>' + esc(key) + '</span><code>' + esc(value) + '</code></div>')
        .join("");
      document.getElementById("evidence").innerHTML = (approval.evidence || []).map((item) => '<li>' + esc(item) + '</li>').join("");
      document.getElementById("payload").textContent = JSON.stringify(approval, null, 2);
      document.getElementById("approve").disabled = approval.status !== "pending";
      document.getElementById("deny").disabled = approval.status !== "pending";
      statusline.textContent = approval.status === "pending"
        ? "Approval is pending. Decision will be recorded against this exact scope."
        : "Approval was " + approval.status + " by " + (approval.decided_by || "unknown") + ".";
    }
    async function decide(action) {
      const approval = selected();
      if (!approval || approval.status !== "pending") return;
      const payload = {
        decided_by: document.getElementById("decidedBy").value || "approver",
        findings: [document.getElementById("finding").value || "reviewed", document.getElementById("note").value || ""].filter(Boolean)
      };
      if (!approval.approval_id.startsWith("approval-prod") && !approval.approval_id.startsWith("approval-refund") && !approval.approval_id.startsWith("approval-email")) {
        try {
          sessionStorage.setItem("agentid.approvals.token", token.value);
          const response = await fetch("/approval-requests/" + encodeURIComponent(approval.approval_id) + "/" + action, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(token.value ? { authorization: "Bearer " + token.value } : {})
            },
            body: JSON.stringify(payload)
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || "approval request failed");
          Object.assign(approval, body);
          statusline.textContent = "Live approval " + action + " recorded.";
        } catch (error) {
          statusline.textContent = error.message;
          return;
        }
      } else {
        approval.status = action === "approve" ? "approved" : "denied";
        approval.decided_at = new Date().toISOString();
        approval.decided_by = payload.decided_by;
        approval.findings = payload.findings;
        statusline.textContent = "Mock approval " + approval.status + ".";
      }
      persist();
      render();
    }
    async function loadLive() {
      const id = prompt("Approval ID to load");
      if (!id) return;
      sessionStorage.setItem("agentid.approvals.token", token.value);
      statusline.textContent = "Loading " + id + "...";
      try {
        const response = await fetch("/approval-requests/" + encodeURIComponent(id), {
          headers: token.value ? { authorization: "Bearer " + token.value } : {}
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "approval not found");
        body.risk = body.risk || "high";
        body.evidence = body.evidence || ["Loaded from live approval store.", "Decision will use the real approval endpoint."];
        approvals = [body, ...approvals.filter((item) => item.approval_id !== body.approval_id)];
        selectedId = body.approval_id;
        persist();
        render();
        statusline.textContent = "Loaded live approval " + id + ".";
      } catch (error) {
        statusline.textContent = error.message;
      }
    }
    function selected() {
      return approvals.find((item) => item.approval_id === selectedId) || approvals[0];
    }
    function persist() {
      sessionStorage.setItem("agentid.approvals.mock", JSON.stringify(approvals));
    }
    function age(value) {
      const ms = Date.now() - Date.parse(value);
      const mins = Math.max(1, Math.round(ms / 60000));
      return mins + "m ago";
    }
    function esc(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
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
      <label>Type <select id="type"><option value="">All</option><option>agentid.decision</option><option>agentid.approval.created</option><option>agentid.approval.decided</option><option>agentid.jit.denied</option><option>agentid.jit.issued</option></select></label>
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
