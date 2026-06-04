from __future__ import annotations

from pathlib import Path


CONFIG_UI_HTML = r"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AgentID Policy Builder</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --panel-soft: #eef3f8;
      --ink: #172033;
      --muted: #5c677d;
      --line: #d8dee8;
      --accent: #0f766e;
      --accent-dark: #115e59;
      --danger: #b42318;
      --code: #101828;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.4;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 24px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
      position: sticky;
      top: 0;
      z-index: 10;
    }

    h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
    }

    main {
      display: grid;
      grid-template-columns: minmax(360px, 520px) minmax(0, 1fr);
      gap: 20px;
      padding: 20px;
      max-width: 1500px;
      margin: 0 auto;
    }

    section, .output {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
    }

    section {
      padding: 18px;
    }

    .stack {
      display: grid;
      gap: 16px;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .row {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    h2 {
      margin: 0 0 12px;
      font-size: 15px;
    }

    label {
      display: grid;
      gap: 5px;
      font-size: 12px;
      font-weight: 650;
      color: var(--muted);
    }

    input, select, textarea {
      width: 100%;
      min-height: 36px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 8px 10px;
      color: var(--ink);
      background: #fff;
      font: inherit;
      font-size: 14px;
    }

    textarea {
      min-height: 78px;
      resize: vertical;
    }

    button {
      border: 1px solid var(--line);
      background: #fff;
      color: var(--ink);
      min-height: 36px;
      padding: 8px 11px;
      border-radius: 6px;
      font-weight: 650;
      cursor: pointer;
    }

    button.primary {
      border-color: var(--accent);
      background: var(--accent);
      color: #fff;
    }

    button.primary:hover { background: var(--accent-dark); }

    button.icon {
      width: 36px;
      padding: 0;
      display: inline-grid;
      place-items: center;
      font-size: 18px;
      line-height: 1;
    }

    .tool, .skill, .flow {
      display: grid;
      gap: 12px;
      padding: 12px;
      background: var(--panel-soft);
      border: 1px solid var(--line);
      border-radius: 8px;
    }

    .output {
      min-width: 0;
      overflow: hidden;
    }

    .tabs {
      display: flex;
      gap: 4px;
      padding: 10px;
      border-bottom: 1px solid var(--line);
      background: #fbfcfe;
    }

    .tab {
      min-height: 32px;
      padding: 6px 10px;
      border-radius: 6px;
    }

    .tab.active {
      border-color: var(--accent);
      color: var(--accent-dark);
      background: #e7f5f2;
    }

    pre {
      margin: 0;
      padding: 16px;
      min-height: calc(100vh - 150px);
      overflow: auto;
      color: #f8fafc;
      background: var(--code);
      font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      white-space: pre;
    }

    .error {
      color: var(--danger);
      font-size: 13px;
      min-height: 18px;
    }

    .hint {
      color: var(--muted);
      font-size: 12px;
      margin-top: 6px;
    }

    .toolbar {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    @media (max-width: 960px) {
      main {
        grid-template-columns: 1fr;
        padding: 12px;
      }

      header {
        align-items: flex-start;
        flex-direction: column;
      }

      pre {
        min-height: 420px;
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>AgentID Policy Builder</h1>
    <div class="toolbar">
      <button id="addTool">Add tool</button>
      <button id="addSkill">Add skill</button>
      <button id="addFlow">Add flow</button>
      <button id="copyOutput" class="primary">Copy output</button>
    </div>
  </header>

  <main>
    <div class="stack">
      <section>
        <h2>Agent</h2>
        <div class="grid">
          <label>ID<input id="agentId" value="enterprise-support-agent"></label>
          <label>Name<input id="agentName" value="Enterprise Support Agent"></label>
          <label>Owner<input id="owner" value="enterprise-ai-platform"></label>
          <label>Environment<select id="environment"><option>production</option><option>staging</option><option>development</option></select></label>
          <label>Expires at<input id="expiresAt" type="date"></label>
          <label>Default JIT TTL<input id="jitTtl" type="number" min="30" max="3600" value="300"></label>
        </div>
        <label style="margin-top:12px">Purpose<textarea id="purpose">Resolve customer support cases by calling approved internal and provider MCP tools.</textarea></label>
      </section>

      <section>
        <h2>OIDC Access</h2>
        <div class="grid">
          <label><span><input id="oidcEnabled" type="checkbox" checked> Require OIDC tokens</span></label>
          <label>Token validation<select id="oidcMode"><option value="jwks">jwks</option><option value="demo_hs256">demo_hs256</option></select></label>
          <label>Issuer<input id="oidcIssuer" value="https://idp.example.com/oauth2/default"></label>
          <label>Audience<input id="oidcAudience" value="agentid-gateway"></label>
          <label>JWKS URI<input id="oidcJwks" value="https://idp.example.com/oauth2/default/v1/keys"></label>
          <label>Tenant claim<input id="oidcTenantClaim" value="tid"></label>
        </div>
      </section>

      <section>
        <h2>Job Boundary</h2>
        <div class="grid">
          <label><span><input id="jobRequired" type="checkbox" checked> Require job boundary</span></label>
          <label><span><input id="requireJobId" type="checkbox" checked> Require job_id</span></label>
          <label>Allowed jobs<input id="allowedJobs" value="support_case_resolution, refund_triage, customer_status_lookup"></label>
          <label>Out of scope<input id="outOfScopeJobs" value="account_deletion, collections_action, contract_negotiation"></label>
          <label>Bind fields<input id="jobBindings" value="job_id, case_id, customer_id"></label>
        </div>
        <p class="hint">Job boundaries prevent scope drift when a tool is allowed in general but not for this case or customer.</p>
      </section>

      <section>
        <h2>MCP Gateway</h2>
        <div class="grid">
          <label><span><input id="mcpEnabled" type="checkbox" checked> Include MCP gateway mapping</span></label>
          <label>Mode<select id="mcpMode"><option value="enterprise_proxy">enterprise_proxy</option><option value="internal_proxy">internal_proxy</option></select></label>
          <label>Provider<input id="mcpProvider" value="example-crm"></label>
          <label>Downstream server<input id="mcpServer" value="provider-crm-mcp"></label>
        </div>
        <p class="hint">The generated mapping derives AgentID fields from MCP tool arguments such as job_id, case_id, and customer_id.</p>
      </section>

      <section>
        <h2>Agent Delegation</h2>
        <div class="grid">
          <label><span><input id="mayCallAgents" type="checkbox" checked> May call agents</span></label>
          <label><span><input id="delegationRequiresApproval" type="checkbox" checked> Require approval</span></label>
          <label>Allowed agents<input id="allowedAgents" value="provider-risk-review-agent"></label>
          <label>Delegated tools<input id="allowedDelegatedTools" value="provider.crm.search_customer, provider.billing.lookup_invoices"></label>
          <label>Max depth<input id="delegationDepth" type="number" min="1" max="5" value="1"></label>
          <label>Approval agents<input id="approvalAgents" value="enterprise-delegation-policy-agent"></label>
        </div>
      </section>

      <section>
        <div class="row" style="justify-content:space-between">
          <h2 style="margin:0">Tools</h2>
          <button class="icon" id="toolPlus" title="Add tool">+</button>
        </div>
        <div id="tools" class="stack"></div>
      </section>

      <section>
        <div class="row" style="justify-content:space-between">
          <h2 style="margin:0">Skill Guardrails</h2>
          <button class="icon" id="skillPlus" title="Add skill">+</button>
        </div>
        <p class="hint">Skills declare the tools they may invoke. The skill contract is a requested authority envelope; the manifest decides what is allowed.</p>
        <div id="skills" class="stack" style="margin-top:12px"></div>
      </section>

      <section>
        <div class="row" style="justify-content:space-between">
          <h2 style="margin:0">Data Flows</h2>
          <button class="icon" id="flowPlus" title="Add flow">+</button>
        </div>
        <div id="flows" class="stack"></div>
      </section>

      <section>
        <h2>Runtime</h2>
        <div class="grid">
          <label><span><input id="enforceManifest" type="checkbox" checked> Enforce manifest</span></label>
          <label><span><input id="detectToolDrift" type="checkbox" checked> Detect tool drift</span></label>
          <label><span><input id="detectNewDestinations" type="checkbox" checked> Detect new destinations</span></label>
          <label><span><input id="killSwitch" type="checkbox" checked> Kill switch</span></label>
          <label><span><input id="logToolCalls" type="checkbox" checked> Log tool calls</span></label>
          <label><span><input id="logDecisions" type="checkbox" checked> Log decisions</span></label>
          <label><span><input id="logJitGrants" type="checkbox" checked> Log JIT grants</span></label>
        </div>
      </section>
    </div>

    <div class="output">
      <div class="tabs">
        <button class="tab active" data-tab="yaml">Manifest YAML</button>
        <button class="tab" data-tab="rego">OPA Policy</button>
        <button class="tab" data-tab="curl">Gateway cURL</button>
      </div>
      <pre id="output"></pre>
      <div id="error" class="error" style="padding:0 16px 14px"></div>
    </div>
  </main>

  <script>
    const state = {
      tab: "yaml",
      tools: [
        { name: "provider.crm.search_customer", access: "read", approval: "none", auth_mode: "delegated", resource: "provider/customer/*", ttl: "" },
        { name: "provider.crm.update_customer", access: "write", approval: "human_confirm", auth_mode: "just_in_time", resource: "provider/customer/*", ttl: "300" },
        { name: "provider.billing.lookup_invoices", access: "read", approval: "notify", auth_mode: "delegated", resource: "provider/billing/customer/*", ttl: "" }
      ],
      skills: [
        {
          id: "support-refund-workflow",
          source: "./skills/support-refund-workflow",
          version: "1.0.0",
          hash: "sha256:replace-with-skill-bundle-digest",
          approval: "human_confirm",
          auth_mode: "just_in_time",
          may_invoke: "provider.crm.search_customer, provider.billing.lookup_invoices, provider.billing.issue_credit",
          ttl: "300",
          max_amount_usd: "100"
        }
      ],
      flows: [
        { from: "enterprise_crm", to: "provider_crm", allowed: true },
        { from: "provider_crm", to: "agent_context", allowed: true },
        { from: "customer_records", to: "provider_external_email", allowed: false }
      ]
    };

    const accessOptions = ["read", "write", "execute", "admin"];
    const approvalOptions = ["none", "notify", "required", "human_confirm", "step_up", "manager", "block"];
    const authOptions = ["delegated", "service", "just_in_time"];

    function csv(value) {
      return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
    }

    function yamlScalar(value) {
      const text = String(value ?? "");
      if (!text) return '""';
      if (/^[A-Za-z0-9_./:@ -]+$/.test(text) && !["true", "false", "null"].includes(text)) return text;
      return JSON.stringify(text);
    }

    function manifest() {
      const tools = state.tools.map((tool) => ({
        name: tool.name.trim(),
        access: tool.access,
        approval: tool.approval,
        auth_mode: tool.auth_mode,
        constraints: {
          resource: tool.resource.trim(),
          ...(tool.ttl ? { token_ttl_seconds: Number(tool.ttl) } : {})
        }
      })).filter((tool) => tool.name);

      const capabilities = state.skills.map((skill) => ({
        id: skill.id.trim(),
        kind: "skill",
        source: skill.source.trim(),
        version: skill.version.trim(),
        hash: skill.hash.trim(),
        access: "execute",
        approval: skill.approval,
        auth_mode: skill.auth_mode,
        may_invoke: csv(skill.may_invoke),
        constraints: {
          ...(skill.ttl ? { token_ttl_seconds: Number(skill.ttl) } : {}),
          ...(skill.max_amount_usd ? { max_amount_usd: Number(skill.max_amount_usd) } : {})
        }
      })).filter((skill) => skill.id);

      return {
        agent: {
          id: agentId.value.trim(),
          name: agentName.value.trim(),
          owner: owner.value.trim(),
          environment: environment.value,
          purpose: purpose.value.trim(),
          ...(expiresAt.value ? { expires_at: expiresAt.value } : {})
        },
        delegation_chain: {
          may_call_agents: mayCallAgents.checked,
          allowed_agents: csv(allowedAgents.value),
          max_depth: Number(delegationDepth.value || 1),
          allowed_delegated_tools: csv(allowedDelegatedTools.value),
          requires_approval: delegationRequiresApproval.checked,
          approval_sources: ["human", "agent"],
          approval_agents: csv(approvalAgents.value),
          delegation_ttl_seconds: Number(jitTtl.value || 300)
        },
        job_boundary: {
          required: jobRequired.checked,
          allowed_jobs: csv(allowedJobs.value),
          out_of_scope: csv(outOfScopeJobs.value),
          require_job_id: requireJobId.checked,
          bind_authorization_to: csv(jobBindings.value)
        },
        intent: {
          confirmation_required_for: [
            ...tools.filter((tool) => ["write", "execute", "admin"].includes(tool.access)).map((tool) => tool.name),
            ...capabilities.filter((capability) => ["execute", "admin"].includes(capability.access)).map((capability) => capability.id)
          ]
        },
        oidc: {
          enabled: oidcEnabled.checked,
          issuer: oidcIssuer.value.trim(),
          audiences: [oidcAudience.value.trim()].filter(Boolean),
          ...(oidcMode.value === "jwks" ? { jwks_uri: oidcJwks.value.trim() } : {}),
          token_validation: oidcMode.value,
          claim_mapping: {
            tenant_id: oidcTenantClaim.value.trim(),
            user_id: "sub",
            agent_id: "agent_id",
            groups: "groups",
            email: "email"
          },
          required_scopes: {
            authorize: "agentid.authorize",
            policy_read: "agentid.policy.read",
            policy_write: "agentid.policy.write",
            jit_grant: "agentid.jit.grant"
          }
        },
        jit_authorization: {
          enabled: tools.some((tool) => tool.auth_mode === "just_in_time") || capabilities.some((capability) => capability.auth_mode === "just_in_time"),
          default_ttl_seconds: Number(jitTtl.value || 300),
          bind_token_to: ["agent_id", "user_id", "skill_id", "tool", "action", "resource", "approval_id", "job_id", "case_id", "customer_id"],
          revoke_after_use: true
        },
        ...(mcpEnabled.checked ? { mcp_gateway: {
          mode: mcpMode.value,
          provider: mcpProvider.value.trim(),
          downstream_server: mcpServer.value.trim(),
          tool_argument_mapping: Object.fromEntries(tools.map((tool) => [tool.name, {
            action: tool.access,
            ...(tool.constraints?.resource ? { resource_template: tool.constraints.resource.replace("*", "{customer_id}") } : { resource_arg: "customer_id" }),
            job_id_arg: "job_id",
            case_id_arg: "case_id",
            customer_id_arg: "customer_id",
            ...(tool.auth_mode === "just_in_time" ? { approved_arg: "approved", jit_grant_id_arg: "jit_grant_id" } : {})
          }]))
        } } : {}),
        capabilities,
        tools,
        data_flows: state.flows.map((flow) => ({ from: flow.from.trim(), to: flow.to.trim(), allowed: Boolean(flow.allowed) })).filter((flow) => flow.from && flow.to),
        runtime: {
          enforce_manifest: enforceManifest.checked,
          detect_tool_drift: detectToolDrift.checked,
          detect_new_destinations: detectNewDestinations.checked
        },
        audit: {
          log_prompt_summary: true,
          log_tool_calls: logToolCalls.checked,
          log_decisions: logDecisions.checked,
          log_jit_grants: logJitGrants.checked
        },
        kill_switch: {
          enabled: killSwitch.checked,
          revoke_on_policy_violation: killSwitch.checked
        }
      };
    }

    function toYaml(value, indent = 0) {
      const pad = " ".repeat(indent);
      if (Array.isArray(value)) {
        if (!value.length) return "[]";
        return value.map((item) => {
          if (item && typeof item === "object") {
            const rendered = toYaml(item, indent + 2).split("\n");
            return `${pad}- ${rendered[0].trimStart()}\n${rendered.slice(1).join("\n")}`;
          }
          return `${pad}- ${yamlScalar(item)}`;
        }).join("\n");
      }
      if (value && typeof value === "object") {
        return Object.entries(value).map(([key, val]) => {
          if (val && typeof val === "object") {
            const rendered = toYaml(val, indent + 2);
            return rendered === "[]" ? `${pad}${key}: []` : `${pad}${key}:\n${rendered}`;
          }
          return `${pad}${key}: ${typeof val === "boolean" || typeof val === "number" ? val : yamlScalar(val)}`;
        }).join("\n");
      }
      return yamlScalar(value);
    }

    function opaPolicy(data) {
      const capabilities = [
        ...data.capabilities.map((capability) => ({ name: capability.id, access: capability.access, approval: capability.approval, auth_mode: capability.auth_mode })),
        ...data.tools
      ];
      const allowed = capabilities.map((tool) => `allowed_tools["${tool.name}"] := "${tool.access}"`).join("\n") || "# No capabilities declared.";
      const approvals = capabilities.filter((tool) => ["required", "human_confirm", "step_up", "manager"].includes(tool.approval)).map((tool) => `requires_approval["${tool.name}"]`).join("\n") || "# No approval-required capabilities declared.";
      const blocked = capabilities.filter((tool) => tool.approval === "block").map((tool) => `blocked_tools["${tool.name}"]`).join("\n") || "# No blocked capabilities declared.";
      const jit = capabilities.filter((tool) => tool.auth_mode === "just_in_time").map((tool) => `requires_jit["${tool.name}"]`).join("\n") || "# No JIT-required capabilities declared.";
      const flows = data.data_flows.filter((flow) => flow.allowed).map((flow) => `allowed_flows["${flow.from}::${flow.to}"]`).join("\n") || "# No explicit allowed data flows declared.";
      return `package agentid

default allow := false

agent_id := "${data.agent.id}"

requested_capability := object.get(input, "tool", object.get(input, "capability", ""))

${allowed}

${approvals}

${blocked}

${jit}

${flows}

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
    jit_satisfied
    approval_satisfied
}`;
    }

    function curlExample(data) {
      const event = {
        agent_id: data.agent.id,
        job_id: data.job_boundary?.allowed_jobs?.[0] || "support_case_resolution",
        case_id: "case-1042",
        customer_id: "cus_123",
        tool: data.capabilities[0]?.id || data.tools[0]?.name || "tool.name",
        action: data.capabilities[0]?.access || data.tools[0]?.access || "read",
        data_from: data.data_flows[0]?.from || "",
        data_to: data.data_flows[0]?.to || "",
        approved: false
      };
      return `curl -s http://localhost:8787/authorize \\
  -H 'content-type: application/json' \\
  -d '${JSON.stringify(event, null, 2)}'`;
    }

    function renderTools() {
      tools.innerHTML = "";
      state.tools.forEach((tool, index) => {
        const el = document.createElement("div");
        el.className = "tool";
        el.innerHTML = `
          <div class="row" style="justify-content:space-between">
            <strong>Tool ${index + 1}</strong>
            <button class="icon" title="Remove tool" data-remove-tool="${index}">x</button>
          </div>
          <div class="grid">
            <label>Name<input data-tool="${index}" data-field="name" value="${tool.name}"></label>
            <label>Resource<input data-tool="${index}" data-field="resource" value="${tool.resource}"></label>
            <label>Access<select data-tool="${index}" data-field="access">${accessOptions.map((v) => `<option ${tool.access === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
            <label>Approval<select data-tool="${index}" data-field="approval">${approvalOptions.map((v) => `<option ${tool.approval === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
            <label>Auth mode<select data-tool="${index}" data-field="auth_mode">${authOptions.map((v) => `<option ${tool.auth_mode === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
            <label>Token TTL<input type="number" min="30" data-tool="${index}" data-field="ttl" value="${tool.ttl}"></label>
          </div>`;
        tools.appendChild(el);
      });
    }

    function renderSkills() {
      skills.innerHTML = "";
      state.skills.forEach((skill, index) => {
        const el = document.createElement("div");
        el.className = "skill";
        el.innerHTML = `
          <div class="row" style="justify-content:space-between">
            <strong>Skill ${index + 1}</strong>
            <button class="icon" title="Remove skill" data-remove-skill="${index}">x</button>
          </div>
          <div class="grid">
            <label>ID<input data-skill="${index}" data-field="id" value="${skill.id}"></label>
            <label>Source<input data-skill="${index}" data-field="source" value="${skill.source}"></label>
            <label>Version<input data-skill="${index}" data-field="version" value="${skill.version}"></label>
            <label>Hash<input data-skill="${index}" data-field="hash" value="${skill.hash}"></label>
            <label>Approval<select data-skill="${index}" data-field="approval">${approvalOptions.map((v) => `<option ${skill.approval === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
            <label>Auth mode<select data-skill="${index}" data-field="auth_mode">${authOptions.map((v) => `<option ${skill.auth_mode === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
            <label>Token TTL<input type="number" min="30" data-skill="${index}" data-field="ttl" value="${skill.ttl}"></label>
            <label>Max amount USD<input type="number" min="0" data-skill="${index}" data-field="max_amount_usd" value="${skill.max_amount_usd}"></label>
          </div>
          <label>May invoke<input data-skill="${index}" data-field="may_invoke" value="${skill.may_invoke}"></label>`;
        skills.appendChild(el);
      });
    }

    function renderFlows() {
      flows.innerHTML = "";
      state.flows.forEach((flow, index) => {
        const el = document.createElement("div");
        el.className = "flow";
        el.innerHTML = `
          <div class="row" style="justify-content:space-between">
            <strong>Flow ${index + 1}</strong>
            <button class="icon" title="Remove flow" data-remove-flow="${index}">x</button>
          </div>
          <div class="grid">
            <label>From<input data-flow="${index}" data-field="from" value="${flow.from}"></label>
            <label>To<input data-flow="${index}" data-field="to" value="${flow.to}"></label>
            <label><span><input data-flow="${index}" data-field="allowed" type="checkbox" ${flow.allowed ? "checked" : ""}> Allowed</span></label>
          </div>`;
        flows.appendChild(el);
      });
    }

    function renderOutput() {
      const data = manifest();
      error.textContent = "";
      if (!data.agent.id || !data.agent.name || !data.agent.owner || !data.agent.purpose) {
        error.textContent = "Agent ID, name, owner, and purpose are required.";
      }
      output.textContent = state.tab === "yaml" ? toYaml(data) : state.tab === "rego" ? opaPolicy(data) : curlExample(data);
    }

    function render() {
      renderTools();
      renderSkills();
      renderFlows();
      renderOutput();
    }

    document.addEventListener("input", (event) => {
      const target = event.target;
      if (target.dataset.tool) state.tools[Number(target.dataset.tool)][target.dataset.field] = target.value;
      if (target.dataset.skill) state.skills[Number(target.dataset.skill)][target.dataset.field] = target.value;
      if (target.dataset.flow) state.flows[Number(target.dataset.flow)][target.dataset.field] = target.type === "checkbox" ? target.checked : target.value;
      renderOutput();
    });

    document.addEventListener("click", async (event) => {
      const target = event.target;
      if (target.dataset.tab) {
        state.tab = target.dataset.tab;
        document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === state.tab));
        renderOutput();
      }
      if (target.id === "addTool" || target.id === "toolPlus") {
        state.tools.push({ name: "", access: "read", approval: "none", auth_mode: "delegated", resource: "", ttl: "" });
        render();
      }
      if (target.id === "addSkill" || target.id === "skillPlus") {
        state.skills.push({ id: "", source: "", version: "1.0.0", hash: "", approval: "human_confirm", auth_mode: "just_in_time", may_invoke: "", ttl: "300", max_amount_usd: "" });
        render();
      }
      if (target.id === "addFlow" || target.id === "flowPlus") {
        state.flows.push({ from: "", to: "", allowed: true });
        render();
      }
      if (target.dataset.removeTool) {
        state.tools.splice(Number(target.dataset.removeTool), 1);
        render();
      }
      if (target.dataset.removeSkill) {
        state.skills.splice(Number(target.dataset.removeSkill), 1);
        render();
      }
      if (target.dataset.removeFlow) {
        state.flows.splice(Number(target.dataset.removeFlow), 1);
        render();
      }
      if (target.id === "copyOutput") {
        await navigator.clipboard.writeText(output.textContent);
        target.textContent = "Copied";
        setTimeout(() => target.textContent = "Copy output", 900);
      }
    });

    render();
  </script>
</body>
</html>
"""


def write_config_ui(path: str | Path) -> Path:
    output_path = Path(path)
    output_path.write_text(CONFIG_UI_HTML)
    return output_path
