from __future__ import annotations

from pathlib import Path


CONFIG_UI_HTML = r"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AgentAction Policy Builder</title>
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
      grid-template-columns: minmax(420px, 740px) minmax(360px, 1fr);
      gap: 20px;
      padding: 20px;
      max-width: 1680px;
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

    .builder-nav {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 8px;
      padding: 10px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      position: sticky;
      top: 80px;
      z-index: 8;
    }

    .step-tab {
      min-height: 46px;
      display: grid;
      place-items: center;
      text-align: center;
      padding: 7px 8px;
      line-height: 1.2;
    }

    .step-tab.active {
      border-color: var(--accent);
      color: var(--accent-dark);
      background: #e7f5f2;
    }

    .builder-step {
      display: none;
    }

    .builder-step.active {
      display: block;
    }

    .section-intro {
      margin: -4px 0 14px;
      color: var(--muted);
      font-size: 13px;
    }

    .summary-panel {
      padding: 16px;
      border-bottom: 1px solid var(--line);
      background: #fbfcfe;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 12px;
    }

    .metric {
      min-height: 76px;
      padding: 11px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
    }

    .metric .label {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }

    .metric .value {
      margin-top: 5px;
      font-size: 24px;
      font-weight: 800;
    }

    .review-list {
      margin: 0;
      padding-left: 18px;
      color: var(--muted);
      font-size: 13px;
    }

    .review-list li {
      margin: 4px 0;
    }

    .output-shell {
      display: none;
    }

    .output-shell.active {
      display: block;
    }

    .bulk-actions {
      padding: 12px;
      background: #fbfcfe;
      border: 1px solid var(--line);
      border-radius: 8px;
    }

    .import-panel {
      display: grid;
      gap: 12px;
    }

    .quick-build {
      display: grid;
      gap: 14px;
      padding: 16px;
      border: 1px solid #b8ded7;
      border-radius: 8px;
      background: #f0fbf9;
    }

    .quick-build h2 {
      margin-bottom: 2px;
      font-size: 18px;
    }

    .quick-build textarea {
      min-height: 58px;
    }

    .quick-build-status {
      min-height: 22px;
      color: var(--accent-dark);
      font-size: 13px;
      font-weight: 700;
    }

    .import-review {
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
    }

    .import-review table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .import-review th,
    .import-review td {
      padding: 9px 10px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
    }

    .import-review th {
      color: var(--muted);
      background: #fbfcfe;
      font-size: 12px;
    }

    .import-review input[type="checkbox"] {
      width: auto;
      min-height: auto;
    }

    .import-review input,
    .import-review select {
      min-width: 118px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      min-height: 22px;
      padding: 2px 8px;
      border: 1px solid var(--line);
      border-radius: 999px;
      font-size: 12px;
      font-weight: 750;
      background: #fff;
    }

    .low { color: #027a48; border-color: #abefc6; background: #ecfdf3; }
    .medium { color: #175cd3; border-color: #b2ccff; background: #eff4ff; }
    .high { color: #b54708; border-color: #fedf89; background: #fffaeb; }
    .critical { color: var(--danger); border-color: #fecdca; background: #fef3f2; }

    @media (max-width: 960px) {
      main {
        grid-template-columns: 1fr;
        padding: 12px;
      }

      header {
        align-items: flex-start;
        flex-direction: column;
      }

      .builder-nav {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        position: static;
      }

      .summary-grid {
        grid-template-columns: 1fr;
      }

      pre {
        min-height: 420px;
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>AgentAction Policy Builder</h1>
    <div class="toolbar">
      <button id="addTool">Add tool</button>
      <button id="addSkill">Add skill</button>
      <button id="addFlow">Add flow</button>
      <button id="copyOutput" class="primary">Copy output</button>
    </div>
  </header>

  <main>
    <div class="stack">
      <div class="builder-nav">
        <button class="step-tab active" data-step-tab="source">1. Source</button>
        <button class="step-tab" data-step-tab="review">2. Review Tools</button>
        <button class="step-tab" data-step-tab="scope">3. Scope</button>
        <button class="step-tab" data-step-tab="controls">4. Controls</button>
        <button class="step-tab" data-step-tab="export">5. Export</button>
      </div>

      <section class="builder-step active" data-step="source">
        <div class="quick-build">
          <div>
            <h2>Build From MCP</h2>
            <p class="section-intro" style="margin-bottom:0">Paste or upload a `tools/list` response, then create a starter policy in one step. Remote server fetch works when this builder is served locally.</p>
          </div>
          <div class="grid">
            <label>MCP server URL<input id="quickMcpUrl" placeholder="https://mcp.example.com/mcp"></label>
            <label>Authorization headers<textarea id="quickMcpHeaders" spellcheck="false" placeholder="Authorization: Bearer ..."></textarea></label>
          </div>
          <div class="row">
            <button id="buildPolicyFromMcp" class="primary">Build policy from MCP</button>
            <button id="quickLoadMcpSample">Use sample</button>
          </div>
          <div id="quickBuildStatus" class="quick-build-status"></div>
          <p class="hint">For authenticated remote MCP servers, run `agentaction config-ui --serve` and open the localhost URL so credentials stay on your machine.</p>
        </div>
      </section>

      <section class="builder-step active" data-step="source">
        <h2>Agent</h2>
        <p class="section-intro">Name the agent and choose the starting source for its authority policy.</p>
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

      <section class="builder-step" data-step="controls">
        <h2>OIDC Access</h2>
        <p class="section-intro">Define how callers prove tenant, user, and agent identity before any tool execution.</p>
        <div class="grid">
          <label><span><input id="oidcEnabled" type="checkbox" checked> Require OIDC tokens</span></label>
          <label>Token validation<select id="oidcMode"><option value="jwks">jwks</option><option value="demo_hs256">demo_hs256</option></select></label>
          <label>Issuer<input id="oidcIssuer" value="https://idp.example.com/oauth2/default"></label>
          <label>Audience<input id="oidcAudience" value="agentid-gateway"></label>
          <label>JWKS URI<input id="oidcJwks" value="https://idp.example.com/oauth2/default/v1/keys"></label>
          <label>Tenant claim<input id="oidcTenantClaim" value="tid"></label>
        </div>
      </section>

      <section class="builder-step" data-step="scope">
        <h2>Job Boundary</h2>
        <p class="section-intro">Constrain where this agent can operate: approved jobs, cases, customers, and data movement.</p>
        <div class="grid">
          <label><span><input id="jobRequired" type="checkbox" checked> Require job boundary</span></label>
          <label><span><input id="requireJobId" type="checkbox" checked> Require job_id</span></label>
          <label>Allowed jobs<input id="allowedJobs" value="support_case_resolution, refund_triage, customer_status_lookup"></label>
          <label>Out of scope<input id="outOfScopeJobs" value="account_deletion, collections_action, contract_negotiation"></label>
          <label>Bind fields<input id="jobBindings" value="job_id, case_id, customer_id"></label>
        </div>
        <p class="hint">Job boundaries prevent scope drift when a tool is allowed in general but not for this case or customer.</p>
      </section>

      <section class="builder-step active" data-step="source">
        <h2>MCP Gateway</h2>
        <p class="section-intro">Set the downstream MCP server context used by generated gateway mappings.</p>
        <div class="grid">
          <label><span><input id="mcpEnabled" type="checkbox" checked> Include MCP gateway mapping</span></label>
          <label>Mode<select id="mcpMode"><option value="enterprise_proxy">enterprise_proxy</option><option value="internal_proxy">internal_proxy</option></select></label>
          <label>Provider<input id="mcpProvider" value="example-crm"></label>
          <label>Downstream server<input id="mcpServer" value="provider-crm-mcp"></label>
        </div>
        <p class="hint">The generated mapping derives AgentAction fields from MCP tool arguments such as job_id, case_id, and customer_id.</p>
      </section>

      <section class="builder-step active" data-step="source">
        <h2>Import MCP Tools</h2>
        <p class="section-intro">Paste or upload `tools/list`, review inferred defaults, then apply selected tools into the policy.</p>
        <div class="import-panel">
          <input id="mcpImportFile" type="file" accept="application/json,.json">
          <textarea id="mcpImportInput" spellcheck="false" placeholder='Paste a saved MCP tools/list response, an object with "tools", or a tools array'></textarea>
          <div class="row">
            <button id="loadMcpSample">Load sample</button>
            <button id="analyzeMcpImport" class="primary">Analyze import</button>
            <button id="applyMcpImport" disabled>Apply selected tools</button>
          </div>
          <p class="hint">MCP import suggests policy defaults from tool names, descriptions, and input schemas. Review before applying; the manifest remains authoritative.</p>
          <div id="mcpImportError" class="error"></div>
          <div id="mcpImportSummary" class="hint"></div>
          <div id="mcpImportReview"></div>
        </div>
      </section>

      <section class="builder-step" data-step="controls">
        <h2>Agent Delegation</h2>
        <p class="section-intro">Control whether this agent can hand work to another agent and which downstream tools remain in bounds.</p>
        <div class="grid">
          <label><span><input id="mayCallAgents" type="checkbox" checked> May call agents</span></label>
          <label><span><input id="delegationRequiresApproval" type="checkbox" checked> Require approval</span></label>
          <label>Allowed agents<input id="allowedAgents" value="provider-risk-review-agent"></label>
          <label>Delegated tools<input id="allowedDelegatedTools" value="provider.crm.search_customer, provider.billing.lookup_invoices"></label>
          <label>Max depth<input id="delegationDepth" type="number" min="1" max="5" value="1"></label>
          <label>Approval agents<input id="approvalAgents" value="enterprise-delegation-policy-agent"></label>
        </div>
      </section>

      <section class="builder-step" data-step="review">
        <div class="row" style="justify-content:space-between">
          <h2 style="margin:0">Tools</h2>
          <button class="icon" id="toolPlus" title="Add tool">+</button>
        </div>
        <p class="section-intro">Decide which tools are allowed, which require approval/JIT, and which should be blocked.</p>
        <div class="bulk-actions row">
          <button data-bulk="safeDefaults">Accept safe defaults</button>
          <button data-bulk="jitWrites">JIT for writes</button>
          <button data-bulk="blockCritical">Block critical</button>
        </div>
        <div id="tools" class="stack"></div>
      </section>

      <section class="builder-step" data-step="controls">
        <div class="row" style="justify-content:space-between">
          <h2 style="margin:0">Skill Guardrails</h2>
          <button class="icon" id="skillPlus" title="Add skill">+</button>
        </div>
        <p class="hint">Skills declare the tools they may invoke. The skill contract is a requested authority envelope; the manifest decides what is allowed.</p>
        <div id="skills" class="stack" style="margin-top:12px"></div>
      </section>

      <section class="builder-step" data-step="scope">
        <div class="row" style="justify-content:space-between">
          <h2 style="margin:0">Data Flows</h2>
          <button class="icon" id="flowPlus" title="Add flow">+</button>
        </div>
        <div id="flows" class="stack"></div>
      </section>

      <section class="builder-step" data-step="controls">
        <h2>Runtime</h2>
        <p class="section-intro">Turn on enforcement, drift detection, audit logging, and emergency revoke behavior.</p>
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

      <section class="builder-step" data-step="export">
        <h2>Review & Export</h2>
        <p class="section-intro">Review the policy summary, then copy the manifest, OPA starter policy, or gateway request from the output panel.</p>
        <div class="bulk-actions">
          <ul class="review-list">
            <li>Confirm high-risk tools are blocked or require JIT.</li>
            <li>Confirm job, case, customer, and resource bindings match your deployment.</li>
            <li>Keep drift detection and audit logging enabled for MCP tool surfaces.</li>
          </ul>
        </div>
      </section>
    </div>

    <div class="output">
      <div class="summary-panel">
        <h2>Policy Summary</h2>
        <div id="policySummary" class="summary-grid"></div>
        <ul id="reviewNotes" class="review-list"></ul>
      </div>
      <div id="exportIntro" class="summary-panel">
        <h2>Review & Export</h2>
        <p class="hint">Use the tabs below to copy the generated manifest, starter OPA policy, or gateway request example.</p>
      </div>
      <div id="outputShell" class="output-shell">
      <div class="tabs">
        <button class="tab active" data-tab="yaml">Manifest YAML</button>
        <button class="tab" data-tab="rego">OPA Policy</button>
        <button class="tab" data-tab="curl">Gateway cURL</button>
      </div>
      <pre id="output"></pre>
      <div id="error" class="error" style="padding:0 16px 14px"></div>
      </div>
    </div>
  </main>

  <script>
    const state = {
      activeStep: "source",
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
      ],
      mcpRecommendations: []
    };

    const accessOptions = ["read", "write", "send", "execute", "admin"];
    const approvalOptions = ["none", "notify", "required", "human_confirm", "step_up", "manager", "block"];
    const authOptions = ["delegated", "service", "just_in_time"];
    const RISKY_NAME_KEYWORDS = {
      delete: ["delete/destructive", 24],
      remove: ["delete/destructive", 20],
      destroy: ["delete/destructive", 24],
      drop: ["delete/destructive", 24],
      truncate: ["delete/destructive", 24],
      write: ["write", 16],
      update: ["write", 16],
      create: ["write", 14],
      insert: ["write", 14],
      send: ["external send", 18],
      email: ["external send", 14],
      slack: ["external send", 12],
      deploy: ["deployment", 22],
      rollback: ["deployment", 22],
      release: ["deployment", 16],
      terraform: ["infrastructure", 24],
      kubectl: ["kubernetes", 24],
      kubernetes: ["kubernetes", 20],
      helm: ["kubernetes", 18],
      namespace: ["kubernetes", 12],
      cluster: ["kubernetes", 18],
      migration: ["database", 20],
      exec: ["execution", 28],
      execute: ["execution", 28],
      shell: ["execution", 30],
      command: ["execution", 26],
      admin: ["admin", 26],
      permission: ["identity/access", 22],
      role: ["identity/access", 18],
      policy: ["identity/access", 18],
      token: ["secrets", 22],
      secret: ["secrets", 24],
      key: ["secrets", 12],
      payment: ["payment", 24],
      refund: ["payment", 18],
      charge: ["payment", 22],
      sql: ["database", 20],
      query: ["database", 10],
      database: ["database", 18],
      file: ["filesystem", 12],
      path: ["filesystem", 12],
      browser: ["browser/network", 14],
      url: ["browser/network", 10],
      http: ["browser/network", 10],
      cloud: ["cloud", 18],
      iam: ["identity/access", 24],
      prod: ["production", 18],
      production: ["production", 20]
    };
    const SENSITIVE_ARGUMENTS = {
      command: ["arbitrary command argument", 24],
      cmd: ["arbitrary command argument", 24],
      script: ["script argument", 20],
      path: ["filesystem path argument", 16],
      file: ["filesystem argument", 12],
      filename: ["filesystem argument", 12],
      directory: ["filesystem path argument", 14],
      url: ["network URL argument", 14],
      uri: ["network URI argument", 10],
      query: ["query argument", 14],
      sql: ["SQL argument", 24],
      token: ["token argument", 22],
      secret: ["secret argument", 24],
      password: ["password argument", 24],
      key: ["key argument", 12],
      recipient: ["recipient argument", 12],
      email: ["email argument", 10],
      amount: ["amount argument", 16],
      role: ["role argument", 16],
      permission: ["permission argument", 20],
      policy: ["policy argument", 18],
      environment: ["environment argument", 12],
      service_id: ["service argument", 12],
      cluster: ["cluster argument", 16],
      namespace: ["namespace argument", 14],
      repo: ["repository argument", 10],
      branch: ["branch argument", 10],
      commit_sha: ["commit argument", 12],
      change_request_id: ["change request argument", 16],
      incident_id: ["incident argument", 12]
    };
    const WRITE_HINTS = new Set(["write", "update", "create", "insert", "send", "post", "put", "patch", "delete", "remove", "destroy"]);
    const ADMIN_HINTS = new Set(["admin", "permission", "policy", "role", "token", "secret", "key", "iam", "apply"]);
    const EXECUTE_HINTS = new Set(["exec", "execute", "shell", "command", "run", "deploy", "rollback", "release", "migrate"]);
    const mcpSample = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        tools: [
          {
            name: "crm.search_customer",
            description: "Search customer records in the CRM.",
            inputSchema: {
              type: "object",
              properties: { customer_id: { type: "string" } },
              required: ["customer_id"]
            }
          },
          {
            name: "crm.update_customer",
            description: "Update customer profile fields.",
            inputSchema: {
              type: "object",
              properties: {
                customer_id: { type: "string" },
                email: { type: "string" },
                role: { type: "string" }
              },
              required: ["customer_id"]
            }
          },
          {
            name: "shell.execute_command",
            description: "Execute a shell command on the host.",
            inputSchema: {
              type: "object",
              properties: {
                command: { type: "string" },
                working_directory: { type: "string" }
              },
              required: ["command"]
            }
          }
        ]
      }
    };

    function csv(value) {
      return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
    }

    function yamlScalar(value) {
      const text = String(value ?? "");
      if (!text) return '""';
      if (/^[A-Za-z0-9_./:@ -]+$/.test(text) && !["true", "false", "null"].includes(text)) return text;
      return JSON.stringify(text);
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function escapeAttr(value) {
      return escapeHtml(value).replace(/'/g, "&#39;");
    }

    function riskLabel(score) {
      if (score < 25) return "low";
      if (score < 50) return "medium";
      if (score < 75) return "high";
      return "critical";
    }

    function splitWords(text) {
      return String(text || "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    }

    function plural(word, count) {
      return count === 1 ? word : `${word}s`;
    }

    function parseHeaderLines(value) {
      const headers = {};
      for (const line of String(value || "").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const index = trimmed.indexOf(":");
        if (index <= 0) throw new Error(`Invalid header line: ${trimmed}`);
        headers[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
      }
      return headers;
    }

    function isLocalHelperOrigin() {
      return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    }

    function toolsFromPayload(payload) {
      let tools;
      if (Array.isArray(payload)) tools = payload;
      else if (payload && Array.isArray(payload.tools)) tools = payload.tools;
      else if (payload && payload.result && Array.isArray(payload.result.tools)) tools = payload.result.tools;
      else throw new Error("Expected a tools/list response, an object with tools, or a tools array.");
      tools.forEach((tool, index) => {
        if (!tool || typeof tool !== "object" || Array.isArray(tool)) throw new Error(`Tool at index ${index} is not an object.`);
      });
      return tools;
    }

    function inputArgumentNames(schema) {
      if (!schema || typeof schema !== "object") return [];
      const properties = schema.properties;
      if (!properties || typeof properties !== "object") return [];
      return Object.keys(properties);
    }

    function inferAction(tokens) {
      if ([...tokens].some((token) => ADMIN_HINTS.has(token))) return "admin";
      if ([...tokens].some((token) => EXECUTE_HINTS.has(token))) return "execute";
      if ([...tokens].some((token) => WRITE_HINTS.has(token))) return "write";
      return "read";
    }

    function analyzeMcpTool(tool) {
      const name = String(tool.name || "");
      const description = String(tool.description || "");
      const schema = tool.inputSchema || tool.input_schema || {};
      const argumentNames = inputArgumentNames(schema);
      const haystack = `${name} ${description}`.toLowerCase();
      const tokens = new Set(splitWords(haystack));
      let score = 0;
      const categories = new Set();
      const findings = [];
      const sensitiveArguments = [];

      Object.entries(RISKY_NAME_KEYWORDS).forEach(([keyword, [category, points]]) => {
        if (tokens.has(keyword)) {
          categories.add(category);
          score += points;
        }
      });

      argumentNames.forEach((arg) => {
        const argTokens = new Set(splitWords(arg));
        for (const [keyword, [finding, points]] of Object.entries(SENSITIVE_ARGUMENTS)) {
          if (argTokens.has(keyword)) {
            sensitiveArguments.push(arg);
            score += points;
            findings.push(`${arg}: ${finding}`);
            break;
          }
        }
      });

      const action = inferAction(tokens);
      if (action === "read") score += 8;
      if (action === "write") {
        score += 22;
        findings.push("tool appears to modify state");
      }
      if (action === "execute") {
        score += 34;
        findings.push("tool appears to execute commands or deployments");
      }
      if (action === "admin") {
        score += 38;
        findings.push("tool appears to affect identity, secrets, policy, or administration");
      }
      if (!name) {
        findings.push("tool is missing a name");
        score += 8;
      }
      if (!description) {
        findings.push("tool is missing a description");
        score += 6;
      }
      if (!argumentNames.length) {
        findings.push("tool input schema has no declared arguments");
        score += 4;
      }

      score = Math.max(0, Math.min(100, score));
      return {
        name: name || "<unnamed>",
        risk_score: score,
        risk_label: riskLabel(score),
        action,
        categories: [...categories].sort(),
        sensitive_arguments: [...new Set(sensitiveArguments)].sort(),
        findings: [...new Set(findings)].sort(),
        argument_names: argumentNames
      };
    }

    function recommendMcpPolicy(tool) {
      let approval = "none";
      let authMode = "delegated";
      if (tool.risk_label === "medium") approval = "notify";
      if (tool.action === "write") {
        approval = "human_confirm";
        authMode = "just_in_time";
      }
      if (["execute", "admin"].includes(tool.action)) {
        approval = "manager";
        authMode = "just_in_time";
      }
      if (tool.risk_label === "high" && approval === "none") {
        approval = "human_confirm";
        authMode = "just_in_time";
      }
      if (tool.risk_label === "critical") {
        approval = "block";
        authMode = "just_in_time";
      }

      const hasCustomer = [...tool.argument_names, tool.name].join(" ").toLowerCase().includes("customer");
      const resource = hasCustomer ? "provider/customer/*" : tool.risk_score >= 50 ? "*" : "";
      const rationale = tool.findings.length ? tool.findings : [`inferred ${tool.action} action from tool name and description`];
      return {
        include: true,
        name: tool.name,
        access: tool.action,
        approval,
        auth_mode: authMode,
        resource,
        ttl: authMode === "just_in_time" ? "300" : "",
        risk_label: tool.risk_label,
        risk_score: tool.risk_score,
        rationale,
        review_required: tool.risk_score >= 50 || tool.findings.some((finding) => finding.includes("missing"))
      };
    }

    function analyzeMcpImportText(text) {
      const payload = JSON.parse(text);
      const tools = toolsFromPayload(payload);
      const analyses = tools.map(analyzeMcpTool).sort((a, b) => b.risk_score - a.risk_score || a.name.localeCompare(b.name));
      return analyses.map(recommendMcpPolicy);
    }

    function renderMcpImportReview() {
      const recommendations = state.mcpRecommendations;
      applyMcpImport.disabled = !recommendations.length;
      if (!recommendations.length) {
        mcpImportSummary.textContent = "";
        mcpImportReview.innerHTML = "";
        return;
      }

      const selectedCount = recommendations.filter((tool) => tool.include).length;
      const criticalCount = recommendations.filter((tool) => tool.risk_label === "critical").length;
      const highCount = recommendations.filter((tool) => tool.risk_label === "high").length;
      mcpImportSummary.textContent = `${recommendations.length} ${plural("tool", recommendations.length)} analyzed. ${selectedCount} selected. ${highCount} high risk, ${criticalCount} critical.`;
      mcpImportReview.innerHTML = `
        <div class="import-review">
          <table>
            <thead>
              <tr>
                <th>Include</th>
                <th>Tool</th>
                <th>Risk</th>
                <th>Access</th>
                <th>Approval</th>
                <th>Auth</th>
                <th>Resource</th>
                <th>Rationale</th>
              </tr>
            </thead>
            <tbody>
              ${recommendations.map((tool, index) => `
                <tr>
                  <td><input type="checkbox" data-rec="${index}" data-rec-field="include" ${tool.include ? "checked" : ""}></td>
                  <td><strong>${escapeHtml(tool.name)}</strong>${tool.review_required ? '<div class="hint">Review required</div>' : ""}</td>
                  <td><span class="badge ${tool.risk_label}">${tool.risk_label} ${tool.risk_score}</span></td>
                  <td><select data-rec="${index}" data-rec-field="access">${accessOptions.map((v) => `<option value="${v}" ${tool.access === v ? "selected" : ""}>${v}</option>`).join("")}</select></td>
                  <td><select data-rec="${index}" data-rec-field="approval">${approvalOptions.map((v) => `<option value="${v}" ${tool.approval === v ? "selected" : ""}>${v}</option>`).join("")}</select></td>
                  <td><select data-rec="${index}" data-rec-field="auth_mode">${authOptions.map((v) => `<option value="${v}" ${tool.auth_mode === v ? "selected" : ""}>${v}</option>`).join("")}</select></td>
                  <td><input data-rec="${index}" data-rec-field="resource" value="${escapeAttr(tool.resource)}" placeholder="resource/*"></td>
                  <td>${escapeHtml(tool.rationale.slice(0, 3).join("; "))}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    function applyMcpRecommendations(recommendations = state.mcpRecommendations) {
      const selected = recommendations.filter((tool) => tool.include);
      selected.forEach((tool) => {
        const generatedTool = {
          name: tool.name,
          access: tool.access,
          approval: tool.approval,
          auth_mode: tool.auth_mode,
          resource: tool.resource,
          ttl: tool.ttl
        };
        const existing = state.tools.findIndex((current) => current.name === tool.name);
        if (existing >= 0) state.tools[existing] = generatedTool;
        else state.tools.push(generatedTool);
      });
      mcpEnabled.checked = true;
      detectToolDrift.checked = true;
      return selected;
    }

    function quickPolicySummary(selected) {
      const blocked = selected.filter((tool) => tool.approval === "block").length;
      const jit = selected.filter((tool) => tool.approval !== "block" && (tool.auth_mode === "just_in_time" || !["none", "notify"].includes(tool.approval))).length;
      const allowed = Math.max(0, selected.length - blocked - jit);
      return `Policy built from ${selected.length} MCP ${plural("tool", selected.length)}: ${allowed} allowed, ${jit} require approval or JIT, ${blocked} blocked.`;
    }

    async function fetchRemoteMcpTools() {
      const url = quickMcpUrl.value.trim();
      if (!url) throw new Error("Paste tools/list JSON or enter an MCP server URL.");
      if (!isLocalHelperOrigin()) {
        throw new Error("Remote MCP fetch is local-only so auth headers do not leave your machine. Run agentaction config-ui --serve and open the localhost URL.");
      }
      const response = await fetch("/api/fetch-tools", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url,
          headers: parseHeaderLines(quickMcpHeaders.value)
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Remote MCP fetch failed.");
      return payload.tools_list;
    }

    async function buildPolicyFromMcp() {
      quickBuildStatus.textContent = "Building policy...";
      mcpImportError.textContent = "";
      try {
        let text = mcpImportInput.value.trim();
        if (!text) {
          const toolsList = await fetchRemoteMcpTools();
          text = JSON.stringify(toolsList, null, 2);
          mcpImportInput.value = text;
        }
        state.mcpRecommendations = analyzeMcpImportText(text);
        renderMcpImportReview();
        const selected = applyMcpRecommendations();
        state.activeStep = "review";
        render();
        quickBuildStatus.textContent = `${quickPolicySummary(selected)} Review the tool rows before export.`;
      } catch (error) {
        state.mcpRecommendations = [];
        renderMcpImportReview();
        const message = error.message || String(error);
        mcpImportError.textContent = message;
        quickBuildStatus.textContent = message;
      }
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
            ...tools.filter((tool) => ["write", "send", "execute", "admin"].includes(tool.access)).map((tool) => tool.name),
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

    function renderWorkflow() {
      document.querySelectorAll(".step-tab").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.stepTab === state.activeStep);
      });
      document.querySelectorAll(".builder-step").forEach((section) => {
        section.classList.toggle("active", section.dataset.step === state.activeStep);
      });
      outputShell.classList.toggle("active", state.activeStep === "export");
      exportIntro.style.display = state.activeStep === "export" ? "block" : "none";
    }

    function renderPolicySummary() {
      const data = manifest();
      const tools = data.tools || [];
      const blocked = tools.filter((tool) => tool.approval === "block");
      const jit = tools.filter((tool) => tool.auth_mode === "just_in_time");
      const writes = tools.filter((tool) => ["write", "send", "execute", "admin"].includes(tool.access));
      const flows = data.data_flows || [];
      const notes = [];

      if (!tools.length) notes.push("No tools are declared yet.");
      if (blocked.length) notes.push(`${blocked.length} ${plural("tool", blocked.length)} blocked by default.`);
      if (jit.length) notes.push(`${jit.length} ${plural("tool", jit.length)} require scoped JIT authority.`);
      if (writes.length && !jit.length) notes.push("Write, execute, or admin tools should usually require JIT.");
      if (!flows.length) notes.push("No data flows are declared.");
      if (!data.runtime.detect_tool_drift) notes.push("Tool drift detection is off.");
      if (data.oidc.enabled && data.oidc.token_validation === "demo_hs256") notes.push("Demo token validation is enabled.");
      if (!notes.length) notes.push("Policy has tools, scope, runtime enforcement, and audit controls configured.");

      policySummary.innerHTML = [
        metric("Tools", tools.length),
        metric("Blocked", blocked.length),
        metric("JIT Required", jit.length),
        metric("Data Flows", flows.length)
      ].join("");
      reviewNotes.innerHTML = notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("");
    }

    function metric(label, value) {
      return `<div class="metric"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`;
    }

    function applySafeDefaults(tool) {
      if (tool.access === "read") {
        tool.auth_mode = "delegated";
        if (tool.approval === "block") return;
        tool.approval = tool.approval || "none";
        tool.ttl = "";
      } else {
        tool.auth_mode = "just_in_time";
        tool.approval = tool.access === "admin" || tool.access === "execute" ? "manager" : "human_confirm";
        tool.ttl = tool.ttl || "300";
        tool.resource = tool.resource || "*";
      }
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
            <label>Name<input data-tool="${index}" data-field="name" value="${escapeAttr(tool.name)}"></label>
            <label>Resource<input data-tool="${index}" data-field="resource" value="${escapeAttr(tool.resource)}"></label>
            <label>Access<select data-tool="${index}" data-field="access">${accessOptions.map((v) => `<option ${tool.access === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
            <label>Approval<select data-tool="${index}" data-field="approval">${approvalOptions.map((v) => `<option ${tool.approval === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
            <label>Auth mode<select data-tool="${index}" data-field="auth_mode">${authOptions.map((v) => `<option ${tool.auth_mode === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
            <label>Token TTL<input type="number" min="30" data-tool="${index}" data-field="ttl" value="${escapeAttr(tool.ttl)}"></label>
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
      renderWorkflow();
      renderTools();
      renderSkills();
      renderFlows();
      renderMcpImportReview();
      renderOutput();
      renderPolicySummary();
    }

    document.addEventListener("input", (event) => {
      const target = event.target;
      if (target.dataset.rec !== undefined) {
        const rec = state.mcpRecommendations[Number(target.dataset.rec)];
        if (rec) {
          rec[target.dataset.recField] = target.type === "checkbox" ? target.checked : target.value;
          if (target.dataset.recField === "include") renderMcpImportReview();
        }
        return;
      }
      if (target.dataset.tool) state.tools[Number(target.dataset.tool)][target.dataset.field] = target.value;
      if (target.dataset.skill) state.skills[Number(target.dataset.skill)][target.dataset.field] = target.value;
      if (target.dataset.flow) state.flows[Number(target.dataset.flow)][target.dataset.field] = target.type === "checkbox" ? target.checked : target.value;
      renderOutput();
      renderPolicySummary();
    });

    document.addEventListener("click", async (event) => {
      const target = event.target;
      if (target.dataset.stepTab) {
        state.activeStep = target.dataset.stepTab;
        render();
      }
      if (target.dataset.tab) {
        state.tab = target.dataset.tab;
        document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === state.tab));
        renderOutput();
      }
      if (target.dataset.bulk === "safeDefaults") {
        state.tools.forEach(applySafeDefaults);
        render();
      }
      if (target.dataset.bulk === "jitWrites") {
        state.tools.forEach((tool) => {
          if (["write", "send", "execute", "admin"].includes(tool.access)) {
            tool.auth_mode = "just_in_time";
            tool.approval = tool.approval === "none" || tool.approval === "notify" ? "human_confirm" : tool.approval;
            tool.ttl = tool.ttl || "300";
          }
        });
        render();
      }
      if (target.dataset.bulk === "blockCritical") {
        state.tools.forEach((tool) => {
          const name = `${tool.name} ${tool.resource}`.toLowerCase();
          if (["shell", "command", "exec", "delete", "destroy", "iam", "secret", "token", "admin"].some((keyword) => name.includes(keyword))) {
            tool.approval = "block";
            tool.auth_mode = "just_in_time";
            tool.ttl = tool.ttl || "300";
          }
        });
        render();
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
      if (target.id === "loadMcpSample") {
        mcpImportInput.value = JSON.stringify(mcpSample, null, 2);
        mcpImportError.textContent = "";
      }
      if (target.id === "quickLoadMcpSample") {
        mcpImportInput.value = JSON.stringify(mcpSample, null, 2);
        quickBuildStatus.textContent = "Sample tools/list loaded. Build the policy when ready.";
        mcpImportError.textContent = "";
      }
      if (target.id === "buildPolicyFromMcp") {
        await buildPolicyFromMcp();
      }
      if (target.id === "analyzeMcpImport") {
        try {
          mcpImportError.textContent = "";
          state.mcpRecommendations = analyzeMcpImportText(mcpImportInput.value);
          renderMcpImportReview();
        } catch (error) {
          state.mcpRecommendations = [];
          renderMcpImportReview();
          mcpImportError.textContent = error.message || String(error);
        }
      }
      if (target.id === "applyMcpImport") {
        const selected = applyMcpRecommendations();
        quickBuildStatus.textContent = `${quickPolicySummary(selected)} Review the tool rows before export.`;
        state.activeStep = "review";
        render();
        target.textContent = "Applied";
        setTimeout(() => target.textContent = "Apply selected tools", 900);
      }
      if (target.id === "copyOutput") {
        state.activeStep = "export";
        renderWorkflow();
        await navigator.clipboard.writeText(output.textContent);
        target.textContent = "Copied";
        setTimeout(() => target.textContent = "Copy output", 900);
      }
    });

    mcpImportFile.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      mcpImportInput.value = await file.text();
      mcpImportError.textContent = "";
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
