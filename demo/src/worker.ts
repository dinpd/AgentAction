type Env = {
  AGENTID_GATEWAY_URL: string;
  AGENTID_GATEWAY_TOKEN?: string;
  AGENTID_DEMO_OIDC_SECRET?: string;
  AGENTID_OIDC_ISSUER: string;
  AGENTID_OIDC_AUDIENCE: string;
  AGENTID_TENANT_ID: string;
  AGENTID_MCP_TENANT_ID?: string;
  AGENTID_GATEWAY?: { fetch(request: Request): Promise<Response> };
};

type DemoStep = {
  id: string;
  title: string;
  detail: string;
  status: "ready" | "running" | "allow" | "deny" | "info";
  payload?: unknown;
  response?: unknown;
};

const HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AgentPass Gateway Control Demo</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f7fa;
      --surface: #ffffff;
      --surface-2: #eef4f8;
      --ink: #142033;
      --muted: #607085;
      --line: #d7e0ea;
      --green: #0f766e;
      --green-2: #dff5f1;
      --blue: #1d4ed8;
      --blue-2: #e7efff;
      --red: #b42318;
      --red-2: #ffe9e6;
      --amber: #9a5b00;
      --amber-2: #fff3d7;
      --code: #111827;
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
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 20px;
      padding: 18px 24px;
      border-bottom: 1px solid var(--line);
      background: var(--surface);
      position: sticky;
      top: 0;
      z-index: 10;
    }

    h1, h2, h3, p { margin: 0; }

    h1 {
      font-size: 19px;
      letter-spacing: 0;
    }

    h2 {
      font-size: 15px;
      margin-bottom: 12px;
    }

    h3 {
      font-size: 14px;
    }

    main {
      max-width: 1480px;
      margin: 0 auto;
      padding: 20px;
      display: grid;
      grid-template-columns: 360px minmax(0, 1fr) 430px;
      gap: 18px;
    }

    section, aside {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      min-width: 0;
    }

    section, aside {
      padding: 16px;
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 28px;
      padding: 4px 9px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: #fff;
      color: var(--muted);
      font-size: 12px;
      font-weight: 650;
    }

    button {
      min-height: 38px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      color: var(--ink);
      font: inherit;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      padding: 8px 11px;
    }

    button.primary {
      border-color: var(--green);
      background: var(--green);
      color: #fff;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    label {
      display: grid;
      gap: 5px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }

    input, select {
      min-height: 38px;
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      color: var(--ink);
      font: inherit;
      font-size: 14px;
      padding: 8px 10px;
    }

    .stack { display: grid; gap: 12px; }

    .grid-2 {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .customer {
      display: grid;
      gap: 14px;
    }

    .metric {
      padding: 11px;
      border: 1px solid var(--line);
      background: var(--surface-2);
      border-radius: 8px;
    }

    .metric span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .metric strong {
      font-size: 19px;
    }

    .case-note {
      padding: 12px;
      background: var(--blue-2);
      border: 1px solid #c8d8ff;
      border-radius: 8px;
      color: #17346d;
      font-size: 13px;
    }

    .timeline {
      display: grid;
      gap: 10px;
    }

    .step {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr);
      gap: 10px;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
    }

    .icon {
      width: 30px;
      height: 30px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      font-weight: 800;
      border: 1px solid var(--line);
      color: var(--muted);
      background: #fff;
    }

    .step.allow .icon { background: var(--green-2); border-color: #95d8cf; color: var(--green); }
    .step.deny .icon { background: var(--red-2); border-color: #ffb5ac; color: var(--red); }
    .step.running .icon { background: var(--amber-2); border-color: #f0c36a; color: var(--amber); }
    .step.info .icon { background: var(--blue-2); border-color: #b9cdfb; color: var(--blue); }

    .step p {
      margin-top: 3px;
      color: var(--muted);
      font-size: 13px;
    }

    .details {
      display: grid;
      gap: 12px;
    }

    pre {
      margin: 0;
      min-height: 190px;
      overflow: auto;
      border-radius: 8px;
      background: var(--code);
      color: #f8fafc;
      padding: 12px;
      font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .status {
      min-height: 36px;
      padding: 8px 10px;
      border-radius: 6px;
      background: var(--surface-2);
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }

    .status.allow { background: var(--green-2); color: var(--green); }
    .status.deny { background: var(--red-2); color: var(--red); }
    .status.info { background: var(--blue-2); color: var(--blue); }

    .use-cases {
      display: grid;
      gap: 8px;
    }

    .use-case {
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      font-size: 13px;
    }

    .use-case strong {
      display: block;
      margin-bottom: 3px;
    }

    .use-case span {
      color: var(--muted);
    }

    @media (max-width: 1120px) {
      main { grid-template-columns: 1fr; }
      header { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>AgentPass Gateway Control Demo</h1>
      <p style="color:var(--muted);font-size:13px;margin-top:3px">Runtime, skill, and MCP gateway checks before agent tool execution.</p>
    </div>
    <div class="toolbar">
      <span class="pill">Gateway: Cloudflare Worker</span>
      <span class="pill">Auth: OIDC JWT</span>
      <span class="pill">Tenant: refund-demo-agent</span>
      <a class="pill" href="https://agentid-policy-builder.pages.dev/" target="_blank" rel="noreferrer">Policy Builder</a>
    </div>
  </header>

  <main>
    <section class="customer">
      <h2>Support Case</h2>
      <div class="case-note">
        Customer was charged after cancelling. The agent may issue one month immediately after policy/JIT checks. If the customer rejects that, a three-month refund requires human notification before execution.
      </div>
      <div class="grid-2">
        <div class="metric"><span>Customer</span><strong>Avery Kim</strong></div>
        <div class="metric"><span>Plan</span><strong>Pro</strong></div>
        <div class="metric"><span>Monthly fee</span><strong>$29</strong></div>
        <div class="metric"><span>Prior refunds</span><strong id="priorRefundMetric">0</strong></div>
      </div>
      <label>Refund scenario
        <select id="scenario">
          <option value="one">Refund one month, clean history</option>
          <option value="repeat">Refund one month, prior refund found</option>
          <option value="three">Refund three months after customer escalation</option>
        </select>
      </label>
      <div class="grid-2">
        <label>Months<input id="months" type="number" min="1" max="6" value="1"></label>
        <label>Amount<input id="amount" type="text" value="$29" readonly></label>
      </div>
      <div class="toolbar">
        <button class="primary" id="run">Run Scenario</button>
        <button id="reset">Reset</button>
      </div>
      <div id="status" class="status">Ready to run policy-backed refund or MCP gateway flow.</div>
    </section>

    <section>
      <h2>Runtime Flow</h2>
      <div id="timeline" class="timeline"></div>
    </section>

    <aside class="details">
      <div>
        <h2>Decision Payload</h2>
        <pre id="payload">{}</pre>
      </div>
      <div>
        <h2>Gateway Response</h2>
        <pre id="response">{}</pre>
      </div>
      <div>
        <h2>Skill Guardrails Demo</h2>
        <div class="use-cases" style="margin-bottom:12px">
          <div class="use-case">
            <strong>Support refund workflow skill</strong>
            <span>Activate a reviewed skill, block an undeclared downstream tool, then allow a scoped provider credit.</span>
          </div>
        </div>
        <button class="primary" id="runSkill">Run Skill Demo</button>
      </div>
      <div>
        <h2>MCP Gateway Demo</h2>
        <div class="use-cases" style="margin-bottom:12px">
          <div class="use-case">
            <strong>Provider CRM tool call</strong>
            <span>Filter MCP tools/list, allow a read, deny a write without JIT, then allow the write with a scoped grant.</span>
          </div>
        </div>
        <button class="primary" id="runMcp">Run MCP Demo</button>
      </div>
      <div>
        <h2>Enterprise Auth Receipt Demo</h2>
        <div class="use-cases" style="margin-bottom:12px">
          <div class="use-case">
            <strong>Managed MCP authorization</strong>
            <span>Validate an enterprise JWT, bind claims into AgentPass authorization, sign a provider receipt, and verify it before execution.</span>
          </div>
        </div>
        <button class="primary" id="runEnterpriseMcp">Run Enterprise Auth Demo</button>
        <button id="runEnterpriseMcpDenied" style="margin-top:8px">Run Receipt Denial</button>
      </div>
      <div>
        <h2>Other Demo Use Cases</h2>
        <div class="use-cases">
          <div class="use-case"><strong>Outbound email guardrail</strong><span>Allow customer-domain replies, block sensitive data to external email.</span></div>
          <div class="use-case"><strong>CRM write escalation</strong><span>Read account data freely, require approval for plan changes or data deletion.</span></div>
          <div class="use-case"><strong>Finance operations</strong><span>Permit invoice lookup, require JIT for credits, block bank-detail changes.</span></div>
          <div class="use-case"><strong>Agent-to-agent delegation</strong><span>Show one agent denied when trying to call an undeclared specialist agent.</span></div>
        </div>
      </div>
    </aside>
  </main>

  <script>
    const els = {
      scenario: document.getElementById("scenario"),
      months: document.getElementById("months"),
      amount: document.getElementById("amount"),
      priorRefundMetric: document.getElementById("priorRefundMetric"),
      run: document.getElementById("run"),
      reset: document.getElementById("reset"),
      runMcp: document.getElementById("runMcp"),
      runEnterpriseMcp: document.getElementById("runEnterpriseMcp"),
      runEnterpriseMcpDenied: document.getElementById("runEnterpriseMcpDenied"),
      runSkill: document.getElementById("runSkill"),
      status: document.getElementById("status"),
      timeline: document.getElementById("timeline"),
      payload: document.getElementById("payload"),
      response: document.getElementById("response")
    };

    const state = { steps: [] };

    function money(months) {
      return "$" + (Number(months) * 29);
    }

    function syncScenario() {
      els.months.value = els.scenario.value === "three" ? "3" : "1";
      els.amount.value = money(els.months.value);
      els.priorRefundMetric.textContent = els.scenario.value === "repeat" ? "1" : "0";
    }

    function setStatus(text, kind = "") {
      els.status.className = "status " + kind;
      els.status.textContent = text;
    }

    function addStep(step) {
      state.steps.push(step);
      renderSteps();
      if (step.payload) els.payload.textContent = JSON.stringify(step.payload, null, 2);
      if (step.response) els.response.textContent = JSON.stringify(step.response, null, 2);
    }

    function renderSteps() {
      els.timeline.innerHTML = state.steps.map((step, index) => {
        const marker = step.status === "allow" ? "✓" : step.status === "deny" ? "!" : step.status === "running" ? "…" : String(index + 1);
        return '<div class="step ' + step.status + '">' +
          '<div class="icon">' + marker + '</div>' +
          '<div><h3>' + escapeHtml(step.title) + '</h3><p>' + escapeHtml(step.detail) + '</p></div>' +
          '</div>';
      }).join("");
    }

    function reset() {
      state.steps = [];
      renderSteps();
      els.payload.textContent = "{}";
      els.response.textContent = "{}";
      setStatus("Ready to run policy-backed refund or MCP gateway flow.");
    }

    async function api(path, body) {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const json = await response.json();
      return { status: response.status, body: json };
    }

    async function runScenario() {
      reset();
      els.run.disabled = true;
      const months = Number(els.months.value);
      const amount = months * 29;
      const hasPriorRefund = els.scenario.value === "repeat";
      const needsHumanReview = months > 1 || hasPriorRefund;
      const resource = "refund/case-1042/" + months + "-months";

      try {
        addStep({
          id: "read",
          title: "Read customer support context",
          detail: "The app asks AgentPass if the support agent can read Zendesk context for this case.",
          status: "running"
        });
        const readPayload = {
          agent_id: "refund-demo-agent",
          tool: "zendesk.search_tickets",
          action: "read",
          data_from: "zendesk",
          data_to: "agent_context"
        };
        const read = await api("/api/authorize", readPayload);
        addStep({
          id: "read-result",
          title: read.body.allow ? "Context read allowed" : "Context read denied",
          detail: read.body.allow ? "The declared read permission and data flow match the manifest." : read.body.findings.join("; "),
          status: read.body.allow ? "allow" : "deny",
          payload: readPayload,
          response: read.body
        });
        if (!read.body.allow) return setStatus("Stopped before refund: support context read denied.", "deny");

        addStep({
          id: "history",
          title: "Check customer refund history",
          detail: "Before any refund, the app asks AgentPass if the agent can read billing history for repeat-refund risk.",
          status: "running"
        });
        const historyPayload = {
          agent_id: "refund-demo-agent",
          tool: "billing.refund_history",
          action: "read",
          data_from: "billing",
          data_to: "agent_context"
        };
        const history = await api("/api/authorize", historyPayload);
        addStep({
          id: "history-result",
          title: history.body.allow ? "Refund history check allowed" : "Refund history check denied",
          detail: history.body.allow
            ? (hasPriorRefund ? "History shows a prior refund, so the app escalates before issuing even a one-month refund." : "History is clean, so one-month refund can continue without human review.")
            : history.body.findings.join("; "),
          status: history.body.allow ? "allow" : "deny",
          payload: historyPayload,
          response: history.body
        });
        if (!history.body.allow) return setStatus("Stopped before refund: billing history check denied.", "deny");

        if (needsHumanReview) {
          addStep({
            id: "escalate",
            title: months > 1 ? "Customer rejected one-month refund" : "Repeat-refund history found",
            detail: months > 1
              ? "The app applies its refund policy profile: multi-month refunds require human notification before the refund tool can run."
              : "The app applies its refund policy profile: repeat refunds require human notification even when the amount is one month.",
            status: "info"
          });
          const notifyPayload = {
            agent_id: "refund-demo-agent",
            tool: "human.notify_refund_review",
            action: "write",
            data_from: "agent_context",
            data_to: "human_review_queue"
          };
          const notify = await api("/api/authorize", notifyPayload);
          addStep({
            id: "notify-result",
            title: notify.body.allow ? "Human notification allowed" : "Human notification denied",
            detail: notify.body.allow ? "Supervisor review notification was policy-authorized before the larger refund." : notify.body.findings.join("; "),
            status: notify.body.allow ? "allow" : "deny",
            payload: notifyPayload,
            response: notify.body
          });
          if (!notify.body.allow) return setStatus("Stopped before refund: human notification was not allowed.", "deny");
        }

        const approvalId = months === 1 ? "auto-policy-one-month" : "human-review-3-months-approved";
        addStep({
          id: "grant",
          title: "Request JIT authority for Stripe refund",
          detail: months === 1 && !hasPriorRefund
            ? "One-month refund is below the escalation threshold, so the app requests a scoped JIT grant."
            : "Human review is complete, so the app requests a scoped JIT grant for the refund.",
          status: "running"
        });
        const grantPayload = {
          tool: "stripe.create_refund",
          action: "write",
          resource,
          approval_id: approvalId,
          user_id: "support-rep-17"
        };
        const grant = await api("/api/jit-grants", grantPayload);
        addStep({
          id: "grant-result",
          title: grant.status === 201 ? "JIT grant issued" : "JIT grant denied",
          detail: grant.status === 201 ? "The grant is bound to agent, user, tool, action, resource, approval, and expiry." : grant.body.error,
          status: grant.status === 201 ? "allow" : "deny",
          payload: grantPayload,
          response: grant.body
        });
        if (grant.status !== 201) return setStatus("Stopped before refund: JIT grant failed.", "deny");

        const refundPayload = {
          agent_id: "refund-demo-agent",
          tool: "stripe.create_refund",
          action: "write",
          resource,
          approved: true,
          jit_grant_id: grant.body.jit_grant_id
        };
        const refund = await api("/api/authorize", refundPayload);
        addStep({
          id: "refund-result",
          title: refund.body.allow ? "Refund execution allowed" : "Refund execution denied",
          detail: refund.body.allow
            ? money(months) + " refund may be sent to Stripe. The JIT grant is now consumed."
            : refund.body.findings.join("; "),
          status: refund.body.allow ? "allow" : "deny",
          payload: refundPayload,
          response: refund.body
        });

        setStatus(refund.body.allow
          ? "Refund approved by AgentPass controls: " + money(months) + " for " + months + " month" + (months === 1 ? "." : "s.")
          : "Refund blocked by AgentPass controls.",
          refund.body.allow ? "allow" : "deny");
      } catch (error) {
        setStatus("Demo error: " + error.message, "deny");
      } finally {
        els.run.disabled = false;
      }
    }

    async function runMcpDemo() {
      reset();
      els.run.disabled = true;
      els.runMcp.disabled = true;
      try {
        addStep({
          id: "mcp-list",
          title: "Filter MCP tools/list",
          detail: "The enterprise MCP gateway exposes only provider tools mapped to AgentPass policy.",
          status: "running"
        });
        const toolsListPayload = { jsonrpc: "2.0", id: 1, method: "tools/list" };
        const toolsListResponse = {
          jsonrpc: "2.0",
          id: 1,
          result: {
            tools: [
              { name: "provider.crm.search_customer" },
              { name: "provider.crm.update_customer" }
            ]
          }
        };
        addStep({
          id: "mcp-list-result",
          title: "Unsafe provider admin tool hidden",
          detail: "A mock provider admin delete tool is not mapped, so the gateway does not expose it to the agent.",
          status: "allow",
          payload: toolsListPayload,
          response: toolsListResponse
        });

        const readPayload = {
          agent_id: "enterprise-support-agent",
          job_id: "support_case_resolution",
          case_id: "case-1042",
          customer_id: "cus_123",
          tool: "provider.crm.search_customer",
          action: "read",
          resource: "provider/customer/cus_123",
          data_from: "provider_crm",
          data_to: "agent_context"
        };
        addStep({
          id: "mcp-read",
          title: "Authorize provider CRM read",
          detail: "The adapter maps MCP tool arguments into AgentPass job, case, customer, resource, and data-flow fields.",
          status: "running",
          payload: readPayload
        });
        const read = await api("/api/mcp/authorize", readPayload);
        addStep({
          id: "mcp-read-result",
          title: read.body.allow ? "Provider CRM read allowed" : "Provider CRM read denied",
          detail: read.body.allow ? "The read tool is declared and stays inside the support-case job boundary." : read.body.findings.join("; "),
          status: read.body.allow ? "allow" : "deny",
          payload: readPayload,
          response: read.body
        });
        if (!read.body.allow) return setStatus("MCP demo stopped: provider CRM read denied.", "deny");

        const deniedWritePayload = {
          agent_id: "enterprise-support-agent",
          job_id: "support_case_resolution",
          case_id: "case-1042",
          customer_id: "cus_123",
          tool: "provider.crm.update_customer",
          action: "write",
          resource: "provider/customer/cus_123",
          data_from: "enterprise_crm",
          data_to: "provider_crm"
        };
        const deniedWrite = await api("/api/mcp/authorize", deniedWritePayload);
        addStep({
          id: "mcp-write-denied",
          title: deniedWrite.body.allow ? "Provider CRM write unexpectedly allowed" : "Provider CRM write denied without JIT",
          detail: deniedWrite.body.allow ? "The policy allowed the write." : "The write requires approval and a scoped JIT grant before the provider MCP call can be forwarded.",
          status: deniedWrite.body.allow ? "allow" : "deny",
          payload: deniedWritePayload,
          response: deniedWrite.body
        });

        const grantPayload = {
          tool: "provider.crm.update_customer",
          action: "write",
          resource: "provider/customer/cus_123",
          job_id: "support_case_resolution",
          case_id: "case-1042",
          customer_id: "cus_123",
          approval_id: "approval-123",
          user_id: "support-rep-17"
        };
        const grant = await api("/api/mcp/jit-grants", grantPayload);
        addStep({
          id: "mcp-grant",
          title: grant.status === 201 ? "JIT grant issued for provider write" : "JIT grant denied",
          detail: grant.status === 201 ? "The grant is bound to the provider tool, resource, job, case, customer, user, and approval." : grant.body.error,
          status: grant.status === 201 ? "allow" : "deny",
          payload: grantPayload,
          response: grant.body
        });
        if (grant.status !== 201) return setStatus("MCP demo stopped: JIT grant failed.", "deny");

        const allowedWritePayload = {
          ...deniedWritePayload,
          approved: true,
          jit_grant_id: grant.body.jit_grant_id
        };
        const allowedWrite = await api("/api/mcp/authorize", allowedWritePayload);
        addStep({
          id: "mcp-write-allowed",
          title: allowedWrite.body.allow ? "Provider CRM write allowed" : "Provider CRM write denied",
          detail: allowedWrite.body.allow ? "The MCP gateway may now forward the provider tool call. The JIT grant is consumed." : allowedWrite.body.findings.join("; "),
          status: allowedWrite.body.allow ? "allow" : "deny",
          payload: allowedWritePayload,
          response: allowedWrite.body
        });

        setStatus(allowedWrite.body.allow ? "MCP gateway demo complete: read allowed, unsafe write denied, approved JIT write allowed." : "MCP gateway demo ended with denial.", allowedWrite.body.allow ? "allow" : "deny");
      } catch (error) {
        setStatus("MCP demo error: " + error.message, "deny");
      } finally {
        els.run.disabled = false;
        els.runMcp.disabled = false;
      }
    }

    async function runSkillDemo() {
      reset();
      els.run.disabled = true;
      els.runMcp.disabled = true;
      els.runSkill.disabled = true;
      const skillId = "support-refund-workflow";
      const skillHash = "sha256:replace-with-skill-bundle-digest";
      const job = "refund_triage";
      const caseId = "case-1042";
      const customerId = "cus_123";
      try {
        addStep({
          id: "skill-contract",
          title: "Review skill-carried AgentPass contract",
          detail: "The skill declares its source, hash, approval/JIT requirements, and the downstream tools listed in may_invoke.",
          status: "info",
          payload: {
            agentid_skill: {
              id: skillId,
              kind: "skill",
              hash: skillHash,
              access: "execute",
              auth_mode: "just_in_time",
              approval: "human_confirm",
              may_invoke: [
                "provider.crm.search_customer",
                "provider.billing.lookup_invoices",
                "provider.billing.issue_credit"
              ]
            }
          }
        });

        const skillGrantPayload = {
          tool: skillId,
          action: "execute",
          resource: "skill/" + skillId,
          job_id: job,
          case_id: caseId,
          customer_id: customerId,
          approval_id: "approval-skill-123",
          user_id: "support-rep-17"
        };
        const skillGrant = await api("/api/skill/jit-grants", skillGrantPayload);
        addStep({
          id: "skill-grant",
          title: skillGrant.status === 201 ? "JIT grant issued for skill activation" : "Skill activation grant denied",
          detail: skillGrant.status === 201 ? "The skill cannot run on standing authority; activation is bound to this job, case, customer, and approval." : skillGrant.body.error,
          status: skillGrant.status === 201 ? "allow" : "deny",
          payload: skillGrantPayload,
          response: skillGrant.body
        });
        if (skillGrant.status !== 201) return setStatus("Skill demo stopped: skill activation grant failed.", "deny");

        const activatePayload = {
          agent_id: "enterprise-support-agent",
          tool: skillId,
          action: "execute",
          resource: "skill/" + skillId,
          job_id: job,
          case_id: caseId,
          customer_id: customerId,
          approved: true,
          jit_grant_id: skillGrant.body.jit_grant_id
        };
        const activate = await api("/api/skill/authorize", activatePayload);
        addStep({
          id: "skill-activation",
          title: activate.body.allow ? "Skill activation allowed" : "Skill activation denied",
          detail: activate.body.allow ? "AgentPass allowed the reviewed skill to run for this scoped refund-triage job." : activate.body.findings.join("; "),
          status: activate.body.allow ? "allow" : "deny",
          payload: activatePayload,
          response: activate.body
        });
        if (!activate.body.allow) return setStatus("Skill demo stopped: skill activation denied.", "deny");

        const blockedPayload = {
          agent_id: "enterprise-support-agent",
          skill_id: skillId,
          skill_hash: skillHash,
          job_id: job,
          case_id: caseId,
          customer_id: customerId,
          tool: "provider.crm.update_customer",
          action: "write",
          resource: "provider/customer/" + customerId,
          approved: true
        };
        const blocked = await api("/api/skill/authorize", blockedPayload);
        addStep({
          id: "skill-blocked-tool",
          title: blocked.body.allow ? "Undeclared downstream tool unexpectedly allowed" : "Skill blocked from undeclared downstream tool",
          detail: blocked.body.allow ? "The provider CRM write was allowed." : "The skill contract does not include provider.crm.update_customer in may_invoke, so the gateway denies the call.",
          status: blocked.body.allow ? "allow" : "deny",
          payload: blockedPayload,
          response: blocked.body
        });

        const creditGrantPayload = {
          tool: "provider.billing.issue_credit",
          action: "write",
          resource: "provider/billing/customer/" + customerId,
          job_id: job,
          case_id: caseId,
          customer_id: customerId,
          approval_id: "manager-approval-456",
          user_id: "support-rep-17"
        };
        const creditGrant = await api("/api/skill/jit-grants", creditGrantPayload);
        addStep({
          id: "skill-credit-grant",
          title: creditGrant.status === 201 ? "JIT grant issued for provider credit" : "Provider credit grant denied",
          detail: creditGrant.status === 201 ? "The downstream tool still needs its own scoped grant; the skill activation grant is not enough." : creditGrant.body.error,
          status: creditGrant.status === 201 ? "allow" : "deny",
          payload: creditGrantPayload,
          response: creditGrant.body
        });
        if (creditGrant.status !== 201) return setStatus("Skill demo stopped: provider credit grant failed.", "deny");

        const creditPayload = {
          agent_id: "enterprise-support-agent",
          skill_id: skillId,
          skill_hash: skillHash,
          job_id: job,
          case_id: caseId,
          customer_id: customerId,
          tool: "provider.billing.issue_credit",
          action: "write",
          resource: "provider/billing/customer/" + customerId,
          approved: true,
          jit_grant_id: creditGrant.body.jit_grant_id
        };
        const credit = await api("/api/skill/authorize", creditPayload);
        addStep({
          id: "skill-credit",
          title: credit.body.allow ? "Skill-originated provider credit allowed" : "Skill-originated provider credit denied",
          detail: credit.body.allow ? "The skill may invoke this tool, the manager approval is present, and the downstream JIT grant is valid." : credit.body.findings.join("; "),
          status: credit.body.allow ? "allow" : "deny",
          payload: creditPayload,
          response: credit.body
        });

        setStatus(credit.body.allow ? "Skill guardrails demo complete: reviewed skill activated, undeclared tool blocked, scoped provider credit allowed." : "Skill guardrails demo ended with denial.", credit.body.allow ? "allow" : "deny");
      } catch (error) {
        setStatus("Skill demo error: " + error.message, "deny");
      } finally {
        els.run.disabled = false;
        els.runMcp.disabled = false;
        els.runSkill.disabled = false;
      }
    }

    async function runEnterpriseMcpDemo(variant = "allow") {
      reset();
      els.run.disabled = true;
      els.runMcp.disabled = true;
      els.runEnterpriseMcp.disabled = true;
      els.runEnterpriseMcpDenied.disabled = true;
      els.runSkill.disabled = true;
      try {
        const demo = await api("/api/enterprise-mcp/demo", { variant });
        for (const step of demo.body.steps || []) addStep(step);
        setStatus(
          demo.body.ok
            ? "Enterprise auth receipt demo complete: JWT validated, authorization bound, provider receipt verified."
            : "Enterprise auth receipt demo ended with provider denial.",
          demo.body.ok ? "allow" : "deny"
        );
      } catch (error) {
        setStatus("Enterprise auth demo error: " + error.message, "deny");
      } finally {
        els.run.disabled = false;
        els.runMcp.disabled = false;
        els.runEnterpriseMcp.disabled = false;
        els.runEnterpriseMcpDenied.disabled = false;
        els.runSkill.disabled = false;
      }
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[char]);
    }

    els.scenario.addEventListener("change", syncScenario);
    els.months.addEventListener("input", () => els.amount.value = money(els.months.value));
    els.run.addEventListener("click", runScenario);
    els.runMcp.addEventListener("click", runMcpDemo);
    els.runEnterpriseMcp.addEventListener("click", () => runEnterpriseMcpDemo("allow"));
    els.runEnterpriseMcpDenied.addEventListener("click", () => runEnterpriseMcpDemo("binding_mismatch"));
    els.runSkill.addEventListener("click", runSkillDemo);
    els.reset.addEventListener("click", reset);
    syncScenario();
    reset();
  </script>
</body>
</html>`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return empty();
    if (request.method === "GET" && url.pathname === "/") {
      return html(HTML);
    }
    if (request.method === "POST" && url.pathname === "/api/authorize") {
      return proxyGateway(request, env, "authorize");
    }
    if (request.method === "POST" && url.pathname === "/api/jit-grants") {
      return proxyGateway(request, env, "jit-grants");
    }
    if (request.method === "POST" && url.pathname === "/api/mcp/authorize") {
      return proxyGateway(request, env, "authorize", mcpTenant(env), "enterprise-support-agent");
    }
    if (request.method === "POST" && url.pathname === "/api/mcp/jit-grants") {
      return proxyGateway(request, env, "jit-grants", mcpTenant(env), "enterprise-support-agent");
    }
    if (request.method === "POST" && url.pathname === "/api/skill/authorize") {
      return proxyGateway(request, env, "authorize", mcpTenant(env), "enterprise-support-agent");
    }
    if (request.method === "POST" && url.pathname === "/api/skill/jit-grants") {
      return proxyGateway(request, env, "jit-grants", mcpTenant(env), "enterprise-support-agent");
    }
    if (request.method === "POST" && url.pathname === "/api/enterprise-mcp/demo") {
      const body = await readJsonObject(request);
      const variant = body.variant === "binding_mismatch" ? "binding_mismatch" : "allow";
      return json(await enterpriseMcpDemo(env, { variant }));
    }
    return json({ error: "not found" }, 404);
  },
};

async function enterpriseMcpDemo(
  env: Env,
  options: { variant?: "allow" | "binding_mismatch" } = {},
): Promise<{ ok: boolean; steps: DemoStep[] }> {
  const enterprise = await createEnterpriseJwt();
  const verifiedEnterprise = await verifyEnterpriseJwt(enterprise.token, enterprise.jwks);
  const authorizePayload = {
    agent_id: "enterprise-support-agent",
    tenant_id: "tenant-a",
    user_id: verifiedEnterprise.subject,
    tool: "provider.crm.update_customer",
    action: "write",
    resource: "provider/customer/cus_123",
    job_id: "support_case_resolution",
    case_id: "case-1042",
    customer_id: "cus_123",
    approved: true,
    jit_grant_id: "grant-1",
    enterprise_auth: verifiedEnterprise,
  };
  const decision = {
    allow: true,
    decision: "allow",
    findings: [],
    event: { decision_id: "dec-enterprise-1" },
  };
  const receipt = {
    decision_id: "dec-enterprise-1",
    tenant_id: "tenant-a",
    agent_id: "enterprise-support-agent",
    user_id: verifiedEnterprise.subject,
    tool: "provider.crm.update_customer",
    action: "write",
    resource: "provider/customer/cus_123",
    job_id: "support_case_resolution",
    case_id: "case-1042",
    customer_id: "cus_123",
    approval_id: "approval-1",
    jit_grant_id: "grant-1",
    enterprise_issuer: verifiedEnterprise.issuer,
    enterprise_subject: verifiedEnterprise.subject,
    enterprise_client_id: verifiedEnterprise.clientId,
    enterprise_token_audience: verifiedEnterprise.tokenAudience,
    enterprise_id_jag_grant_id: verifiedEnterprise.idJagGrantId,
    enterprise_scopes: verifiedEnterprise.scopes,
    enterprise_groups: verifiedEnterprise.groups,
    enterprise_acr: verifiedEnterprise.acr,
    enterprise_amr: verifiedEnterprise.amr,
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 300_000).toISOString(),
  };
  const providerReceipt = options.variant === "binding_mismatch"
    ? { ...receipt, enterprise_client_id: "unapproved-mcp-client" }
    : receipt;
  const signedReceipt = await signDemoReceipt(providerReceipt, enterpriseReceiptSecret(env));
  const providerVerification = await verifyDemoProviderReceipt(signedReceipt, enterpriseReceiptSecret(env));
  const providerFindings = providerReceiptFindings(providerVerification.receipt);
  const providerAllowed = providerVerification.findings.length === 0 && providerFindings.length === 0;
  const providerResponse = providerAllowed
    ? {
        jsonrpc: "2.0",
        id: 42,
        result: {
          content: [{ type: "text", text: "provider.crm.update_customer executed" }],
          agentpass: {
            decision_id: providerVerification.receipt.decision_id,
            enterprise_client_id: providerVerification.receipt.enterprise_client_id,
          },
        },
      }
    : {
        jsonrpc: "2.0",
        id: 42,
        error: {
          code: -32010,
          message: "Provider denied MCP tool call",
          data: { findings: [...providerVerification.findings, ...providerFindings] },
        },
      };

  return {
    ok: providerAllowed,
    steps: [
      {
        id: "enterprise-jwt",
        title: "Enterprise JWT validated",
        detail: "The hosted demo signs a managed-auth JWT, verifies the RS256 signature, issuer, audience, required scope, and required group.",
        status: "allow",
        payload: {
          header: { alg: "RS256", kid: "enterprise-idp-2026-07" },
          claims: enterprise.claims,
        },
        response: {
          issuer: verifiedEnterprise.issuer,
          subject: verifiedEnterprise.subject,
          client_id: verifiedEnterprise.clientId,
          scopes: verifiedEnterprise.scopes,
          groups: verifiedEnterprise.groups,
        },
      },
      {
        id: "agentpass-authorize",
        title: "AgentPass authorization bound to enterprise context",
        detail: "The gateway maps the MCP call to an AgentPass authorization event and carries the validated enterprise identity context with it.",
        status: decision.allow ? "allow" : "deny",
        payload: authorizePayload,
        response: decision,
      },
      {
        id: "provider-receipt",
        title: providerAllowed ? "Provider receipt signed with enterprise bindings" : "Provider receipt signed with a mismatched enterprise binding",
        detail: providerAllowed
          ? "The authorization receipt is bound to tenant, agent, user, job, resource, approval, JIT grant, issuer, client, scopes, and groups."
          : "The receipt signature is valid, but the enterprise client binding no longer matches the provider trust policy.",
        status: "allow",
        payload: signedReceipt,
        response: {
          decision_id: providerReceipt.decision_id,
          enterprise_client_id: providerReceipt.enterprise_client_id,
          enterprise_id_jag_grant_id: providerReceipt.enterprise_id_jag_grant_id,
        },
      },
      {
        id: "provider-execution",
        title: providerAllowed ? "Provider verified receipt and executed" : "Provider denied execution",
        detail: providerAllowed
          ? "The mock provider verifies the receipt signature and required enterprise bindings before executing the CRM write."
          : "The mock provider found a missing or mismatched receipt binding.",
        status: providerAllowed ? "allow" : "deny",
        payload: {
          tool: "provider.crm.update_customer",
          arguments: {
            customer_id: "cus_123",
            job_id: "support_case_resolution",
            case_id: "case-1042",
            approved: true,
            jit_grant_id: "grant-1",
            approval_id: "approval-1",
            _agentid_receipt: signedReceipt,
          },
        },
        response: providerResponse,
      },
    ],
  };
}

async function proxyGateway(
  request: Request,
  env: Env,
  endpoint: string,
  tenantId = env.AGENTID_TENANT_ID,
  agentId = "refund-demo-agent",
): Promise<Response> {
  const payload = await request.text();
  const path = `/tenants/${tenantId}/${endpoint}`;
  const target = env.AGENTID_GATEWAY
    ? `https://agentid-gateway${path}`
    : `${env.AGENTID_GATEWAY_URL}${path}`;
  const bearerToken = env.AGENTID_DEMO_OIDC_SECRET
    ? await createDemoOidcToken(env, endpoint, tenantId, agentId)
    : env.AGENTID_GATEWAY_TOKEN;
  if (!bearerToken) {
    return json({ error: "demo auth token is not configured" }, 500);
  }
  const gatewayRequest = new Request(target, {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearerToken}`,
      "content-type": "application/json",
    },
    body: payload,
  });
  const response = env.AGENTID_GATEWAY
    ? await env.AGENTID_GATEWAY.fetch(gatewayRequest)
    : await fetch(gatewayRequest);
  return new Response(await response.text(), {
    status: response.status,
    headers: cors({ "content-type": response.headers.get("content-type") || "application/json" }),
  });
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function mcpTenant(env: Env): string {
  return env.AGENTID_MCP_TENANT_ID || "provider-mcp-support-agent";
}

type EnterpriseAuthContext = {
  issuer: string;
  subject: string;
  clientId: string;
  tokenAudience: string;
  idJagGrantId: string;
  scopes: string[];
  groups: string[];
  acr: string;
  amr: string[];
};

type SignedDemoReceipt = {
  alg: "HS256";
  payload: Record<string, unknown>;
  signature: string;
};

async function createEnterpriseJwt(): Promise<{
  token: string;
  jwks: { keys: JsonWebKey[] };
  claims: Record<string, unknown>;
}> {
  const kid = "enterprise-idp-2026-07";
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const header = { alg: "RS256", typ: "JWT", kid };
  const claims = {
    iss: "https://idp.example.com",
    aud: "provider-crm-mcp",
    sub: "user-17",
    azp: "claude-enterprise",
    tid: "tenant-a",
    agent_id: "enterprise-support-agent",
    scp: ["openid", "mcp:provider-crm", "crm.write"],
    groups: ["support", "support-admins"],
    id_jag: "id-jag-1",
    acr: "urn:okta:loa:2fa",
    amr: ["pwd", "mfa"],
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
  };
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claims))}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return {
    token: `${signingInput}.${base64UrlEncode(signature)}`,
    jwks: { keys: [{ ...publicJwk, kid, alg: "RS256", use: "sig" }] },
    claims,
  };
}

async function verifyEnterpriseJwt(token: string, jwks: { keys: JsonWebKey[] }): Promise<EnterpriseAuthContext> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("enterprise JWT compact serialization is invalid");
  const header = parseBase64UrlJson(parts[0]);
  const claims = parseBase64UrlJson(parts[1]);
  if (!isRecord(header) || !isRecord(claims)) throw new Error("enterprise JWT header or payload is invalid");
  if (header.alg !== "RS256") throw new Error("enterprise JWT alg is not allowed");

  const key = jwks.keys.find((item) => item.kid === header.kid);
  if (!key) throw new Error("enterprise JWT key not found");
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    key,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    base64UrlDecode(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!verified) throw new Error("enterprise JWT signature invalid");

  if (claims.iss !== "https://idp.example.com") throw new Error("enterprise JWT issuer mismatch");
  if (claims.aud !== "provider-crm-mcp") throw new Error("enterprise JWT audience mismatch");
  if (typeof claims.exp === "number" && claims.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error("enterprise JWT is expired");
  }

  const scopes = stringArray(claims.scp);
  const groups = stringArray(claims.groups);
  if (!scopes.includes("mcp:provider-crm")) throw new Error("enterprise JWT missing required scope: mcp:provider-crm");
  if (!groups.includes("support-admins")) throw new Error("enterprise JWT missing required group: support-admins");

  return {
    issuer: stringValue(claims.iss),
    subject: stringValue(claims.sub),
    clientId: stringValue(claims.azp),
    tokenAudience: stringValue(claims.aud),
    idJagGrantId: stringValue(claims.id_jag),
    scopes,
    groups,
    acr: stringValue(claims.acr),
    amr: stringArray(claims.amr),
  };
}

async function signDemoReceipt(payload: Record<string, unknown>, secret: string): Promise<SignedDemoReceipt> {
  return {
    alg: "HS256",
    payload,
    signature: await hmacSha256Base64Url(canonicalJson(payload), secret),
  };
}

async function verifyDemoProviderReceipt(
  receipt: SignedDemoReceipt,
  secret: string,
): Promise<{ receipt: Record<string, unknown>; findings: string[] }> {
  const findings: string[] = [];
  if (receipt.alg !== "HS256") findings.push("receipt signature alg must be HS256");
  if (!isRecord(receipt.payload)) findings.push("receipt signed payload is required");
  const expected = await hmacSha256Base64Url(canonicalJson(receipt.payload), secret);
  if (receipt.signature !== expected) findings.push("receipt signature mismatch");
  return { receipt: receipt.payload, findings };
}

function providerReceiptFindings(receipt: Record<string, unknown>): string[] {
  const findings: string[] = [];
  requireReceiptEqual(findings, receipt, "tenant_id", "tenant-a");
  requireReceiptEqual(findings, receipt, "agent_id", "enterprise-support-agent");
  requireReceiptEqual(findings, receipt, "user_id", "user-17");
  requireReceiptEqual(findings, receipt, "tool", "provider.crm.update_customer");
  requireReceiptEqual(findings, receipt, "action", "write");
  requireReceiptEqual(findings, receipt, "resource", "provider/customer/cus_123");
  requireReceiptEqual(findings, receipt, "job_id", "support_case_resolution");
  requireReceiptEqual(findings, receipt, "case_id", "case-1042");
  requireReceiptEqual(findings, receipt, "customer_id", "cus_123");
  requireReceiptEqual(findings, receipt, "approval_id", "approval-1");
  requireReceiptEqual(findings, receipt, "jit_grant_id", "grant-1");
  requireReceiptEqual(findings, receipt, "enterprise_issuer", "https://idp.example.com");
  requireReceiptEqual(findings, receipt, "enterprise_subject", "user-17");
  requireReceiptEqual(findings, receipt, "enterprise_client_id", "claude-enterprise");
  requireReceiptEqual(findings, receipt, "enterprise_token_audience", "provider-crm-mcp");
  requireReceiptEqual(findings, receipt, "enterprise_id_jag_grant_id", "id-jag-1");
  requireReceiptIncludes(findings, receipt, "enterprise_scopes", "mcp:provider-crm");
  requireReceiptIncludes(findings, receipt, "enterprise_scopes", "crm.write");
  requireReceiptIncludes(findings, receipt, "enterprise_groups", "support-admins");
  return findings;
}

function requireReceiptEqual(findings: string[], receipt: Record<string, unknown>, field: string, expected: string): void {
  if (receipt[field] !== expected) findings.push(`${field} mismatch`);
}

function requireReceiptIncludes(findings: string[], receipt: Record<string, unknown>, field: string, expected: string): void {
  const value = receipt[field];
  if (!Array.isArray(value) || !value.includes(expected)) findings.push(`${field} missing ${expected}`);
}

async function hmacSha256Base64Url(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64UrlEncode(signature);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function enterpriseReceiptSecret(env: Env): string {
  return env.AGENTID_DEMO_OIDC_SECRET || "local-enterprise-receipt-demo-secret";
}

async function createDemoOidcToken(env: Env, endpoint: string, tenantId: string, agentId: string): Promise<string> {
  if (!env.AGENTID_DEMO_OIDC_SECRET) throw new Error("AGENTID_DEMO_OIDC_SECRET is not configured");
  const now = Math.floor(Date.now() / 1000);
  const scopes = ["agentid.authorize"];
  if (endpoint === "jit-grants") scopes.push("agentid.jit.grant");
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: env.AGENTID_OIDC_ISSUER,
    aud: env.AGENTID_OIDC_AUDIENCE,
    sub: "support-rep-17",
    tid: tenantId,
    agent_id: agentId,
    email: "support-rep-17@example.com",
    scope: scopes.join(" "),
    iat: now,
    exp: now + 300,
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.AGENTID_DEMO_OIDC_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

function base64UrlEncode(value: string | ArrayBuffer): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function parseBase64UrlJson(value: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(value)));
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  return [];
}

function stringValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function html(body: string): Response {
  return new Response(body, {
    headers: cors({ "content-type": "text/html; charset=utf-8" }),
  });
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: cors({ "content-type": "application/json" }),
  });
}

function empty(): Response {
  return new Response(null, { status: 204, headers: cors({}) });
}

function cors(headers: Record<string, string>): Headers {
  return new Headers({
    ...headers,
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  });
}
