type Env = {
  AGENTID_API_KEY?: string;
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
  tools?: Array<Record<string, unknown>>;
  data_flows?: Array<Record<string, unknown>>;
  delegation_chain?: Record<string, unknown>;
  jit_authorization?: Record<string, unknown>;
};

type ToolEvent = Record<string, unknown>;
type Grant = {
  jit_grant_id: string;
  agent_id: string;
  tool: string;
  action: string;
  resource: string;
  approval_id: string;
  user_id: string;
  expires_at: string;
  used: boolean;
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
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (request.method === "OPTIONS") {
        return empty(204);
      }

      if (!authorized(request, env)) {
        return json({ error: "unauthorized" }, 401);
      }

      const url = new URL(request.url);
      const route = parseRoute(url.pathname);
      const manifest = await loadManifest(env, route.tenantId);

      if (request.method === "GET" && route.endpoint === "health") {
        return json({ ok: true, agent_id: manifest.agent?.id ?? null, tenant_id: route.tenantId ?? null });
      }

      if (request.method === "GET" && route.endpoint === "policy") {
        const target = url.searchParams.get("target") ?? "opa";
        if (target !== "opa") {
          return json({ error: "Only target=opa is currently supported." }, 400);
        }
        return text(generateOpaPolicy(manifest));
      }

      if (request.method === "POST" && route.endpoint === "authorize") {
        const payload = await readJson(request);
        const decision = await authorize(manifest, payload, env, route.tenantId);
        return json(
          {
            allow: decision.allow,
            findings: decision.findings,
            decision: decision.allow ? "allow" : "deny",
            event: decision.event,
          },
          decision.allow ? 200 : 403,
        );
      }

      if (request.method === "POST" && route.endpoint === "jit-grants") {
        const payload = await readJson(request);
        const grant = createJitGrant(manifest, payload);
        const stored = await grantStore(env, route.tenantId, manifest).fetch(
          new Request("https://agentid.local/grants", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(grant),
          }),
        );
        return json(await stored.json(), stored.status);
      }

      return json({ error: "not found" }, 404);
    } catch (error) {
      return json({ error: (error as Error).message }, 400);
    }
  },
};

export class AgentIdJitGrants {
  state: { storage: { get(key: string): Promise<Grant | undefined>; put(key: string, value: Grant): Promise<void> } };

  constructor(state: AgentIdJitGrants["state"]) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const payload = await readJson(request);

    if (request.method === "POST" && url.pathname === "/grants") {
      const grant = payload as Grant;
      await this.state.storage.put(grant.jit_grant_id, grant);
      return json(grant, 201);
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

      const grant = await this.state.storage.get(grantId);
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

      event.jit_grant_valid = findings.length === 0;
      event.jit_grant_agent_id = grant.agent_id;
      event.jit_grant_tool = grant.tool;
      event.jit_grant_action = grant.action;

      if (findings.length === 0 && manifest.jit_authorization?.revoke_after_use === true) {
        grant.used = true;
        await this.state.storage.put(grant.jit_grant_id, grant);
      }

      return json({ event, findings });
    }

    return json({ error: "not found" }, 404);
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
    action: payload.action,
    data_from: payload.data_from ?? "",
    data_to: payload.data_to ?? "",
    approved: payload.approved === true,
    jit_grant_id: payload.jit_grant_id,
    resource: payload.resource ?? "",
    called_agent: payload.called_agent,
  };
  const findings: string[] = [];
  const tool = toolByName(manifest, stringValue(event.tool));

  if (tool?.auth_mode === "just_in_time") {
    const response = await grantStore(env, tenantId, manifest).fetch(
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
    used: false,
  };
}

function auditEvent(manifest: AgentIdManifest, event: ToolEvent): string[] {
  const findings: string[] = [];
  const agentId = manifest.agent?.id;
  const tool = toolByName(manifest, stringValue(event.tool));

  if (agentId && event.agent_id !== agentId) {
    findings.push(`event[0]: agent_id mismatch: ${event.agent_id} != ${agentId}`);
  }
  if (!tool) {
    findings.push(`event[0]: undeclared tool used: ${event.tool}`);
    return findings;
  }
  if (tool.access !== event.action) {
    findings.push(`event[0]: action mismatch for ${event.tool}: actual=${event.action}, allowed=${tool.access}`);
  }

  const approval = stringValue(tool.approval || "none");
  if (APPROVAL_REQUIRED.has(approval) && event.approved !== true) {
    findings.push(`event[0]: ${event.tool} requires approval but event is not approved`);
  }
  if (approval === "block") {
    findings.push(`event[0]: ${event.tool} is blocked by manifest policy`);
  }

  if (tool.auth_mode === "just_in_time") {
    if (!event.jit_grant_id) {
      findings.push(`event[0]: ${event.tool} requires JIT authorization but no jit_grant_id is present`);
    }
    if (event.jit_grant_valid === false) {
      findings.push("event[0]: JIT grant is marked invalid");
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
  }

  return findings;
}

function generateOpaPolicy(manifest: AgentIdManifest): string {
  const agentId = stringValue(manifest.agent?.id || "unknown-agent");
  const tools = manifest.tools ?? [];
  const flows = manifest.data_flows ?? [];
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

  return `package agentid

default allow := false

agent_id := "${agentId}"

${allowed}

${approvals}

${blocked}

${jit}

${allowedFlows}

tool_allowed if {
    input.agent_id == agent_id
    allowed_tools[input.tool] == input.action
    not blocked_tools[input.tool]
}

flow_allowed if {
    input.data_from == ""
    input.data_to == ""
}

flow_allowed if {
    allowed_flows[concat("::", [input.data_from, input.data_to])]
}

jit_satisfied if {
    not requires_jit[input.tool]
}

jit_satisfied if {
    requires_jit[input.tool]
    input.jit_grant_valid == true
    input.jit_grant_agent_id == input.agent_id
    input.jit_grant_tool == input.tool
    input.jit_grant_action == input.action
}

approval_satisfied if {
    not requires_approval[input.tool]
}

approval_satisfied if {
    requires_approval[input.tool]
    input.approved == true
}

allow if {
    tool_allowed
    flow_allowed
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

function grantStore(env: Env, tenantId: string | null, manifest: AgentIdManifest) {
  const key = tenantId || stringValue(manifest.agent?.id) || "default";
  return env.JIT_GRANTS.get(env.JIT_GRANTS.idFromName(key));
}

function parseRoute(pathname: string): { tenantId: string | null; endpoint: string } {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "tenants" && parts[1]) {
    return { tenantId: parts[1], endpoint: parts[2] ?? "" };
  }
  return { tenantId: null, endpoint: parts[0] ?? "" };
}

function toolByName(manifest: AgentIdManifest, name: string): Record<string, unknown> | undefined {
  return (manifest.tools ?? []).find((tool) => tool.name === name);
}

function grantTtlSeconds(manifest: AgentIdManifest, tool: Record<string, unknown>): number {
  const constraints = typeof tool.constraints === "object" && tool.constraints ? (tool.constraints as Record<string, unknown>) : {};
  const toolTtl = constraints.token_ttl_seconds;
  if (typeof toolTtl === "number" && toolTtl > 0) return toolTtl;
  const defaultTtl = manifest.jit_authorization?.default_ttl_seconds;
  if (typeof defaultTtl === "number" && defaultTtl > 0) return defaultTtl;
  return 300;
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

function authorized(request: Request, env: Env): boolean {
  if (!env.AGENTID_API_KEY) return true;
  return request.headers.get("authorization") === `Bearer ${env.AGENTID_API_KEY}`;
}

function stringValue(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: cors({ "content-type": "application/json" }),
  });
}

function text(payload: string, status = 200): Response {
  return new Response(payload, {
    status,
    headers: cors({ "content-type": "text/plain; charset=utf-8" }),
  });
}

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
