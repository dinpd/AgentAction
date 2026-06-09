type Env = {
  AGENTID_AUDIT_URL?: string;
  AGENTID_DEMO_OIDC_SECRET?: string;
  AGENTID_GATEWAY?: { fetch(request: Request): Promise<Response> };
  AGENTID_GATEWAY_TOKEN?: string;
  AGENTID_GATEWAY_URL: string;
  AGENTID_OIDC_AUDIENCE: string;
  AGENTID_OIDC_ISSUER: string;
  AGENTID_TENANT_ID: string;
};

type Step = {
  id: string;
  title: string;
  detail: string;
  status: "allow" | "deny" | "info";
  payload?: unknown;
  response?: unknown;
};

type GatewayResult = {
  status: number;
  body: Record<string, any>;
};

type GuardSettings = {
  require_green_ci: boolean;
  block_freeze_window: boolean;
  max_error_rate_percent: number;
  max_p95_latency_ms: number;
  canary_window_minutes: number;
  rollback_error_rate_percent: number;
};

type GuardConditions = {
  ci_status: string;
  freeze_window_active: boolean;
  current_error_rate_percent: number;
  current_p95_latency_ms: number;
  cloud_status: string;
};

type CanaryMetrics = {
  canary_error_rate_percent: number;
  canary_p95_latency_ms: number;
  window_minutes: number;
  samples: number;
};

type GuardEvaluation = {
  allow: boolean;
  findings: string[];
  payload: Record<string, unknown>;
  response: Record<string, unknown>;
  context: Record<string, string>;
};

type Continuation = {
  approval_id: string;
  ctx: ReturnType<typeof demoContext>;
  guard_context: Record<string, string>;
  settings: GuardSettings;
  canary_metrics: CanaryMetrics;
};

const HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AgentID DevOps Control Demo</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f3f5f7;
      --surface: #ffffff;
      --surface-2: #eef3f6;
      --ink: #17212b;
      --muted: #5b6773;
      --line: #d5dce3;
      --green: #12715f;
      --green-2: #ddf3ed;
      --blue: #2158c6;
      --blue-2: #e8efff;
      --red: #b42318;
      --red-2: #fde8e5;
      --amber: #946200;
      --amber-2: #fff2d1;
      --code: #101820;
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
      position: sticky;
      top: 0;
      z-index: 10;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: center;
      padding: 18px 24px;
      border-bottom: 1px solid var(--line);
      background: var(--surface);
    }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 20px; letter-spacing: 0; }
    h2 { font-size: 15px; margin-bottom: 12px; }
    h3 { font-size: 14px; }
    main {
      max-width: 1500px;
      margin: 0 auto;
      padding: 20px;
      display: grid;
      grid-template-columns: 380px minmax(0, 1fr) 440px;
      gap: 18px;
    }
    section, aside {
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      padding: 16px;
    }
    .subtle { color: var(--muted); font-size: 13px; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .pill {
      display: inline-flex;
      min-height: 28px;
      align-items: center;
      padding: 4px 9px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: #fff;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-decoration: none;
    }
    button, a.button {
      min-height: 38px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      color: var(--ink);
      font: inherit;
      font-size: 14px;
      font-weight: 750;
      cursor: pointer;
      padding: 8px 11px;
      text-decoration: none;
    }
    button.primary { border-color: var(--green); background: var(--green); color: #fff; }
    button.danger { border-color: var(--red); background: var(--red); color: #fff; }
    button:disabled { opacity: 0.55; cursor: not-allowed; }
    [hidden] { display: none !important; }
    label { display: grid; gap: 5px; color: var(--muted); font-size: 12px; font-weight: 750; }
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
    select { appearance: auto; }
    .check {
      display: flex;
      grid-template-columns: none;
      gap: 8px;
      align-items: center;
      color: var(--ink);
      font-size: 13px;
      font-weight: 700;
    }
    .check input {
      width: 16px;
      min-height: 16px;
      accent-color: var(--green);
    }
    .stack { display: grid; gap: 12px; }
    .grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .note {
      padding: 12px;
      border: 1px solid #c5d5fb;
      border-radius: 8px;
      background: var(--blue-2);
      color: #18356f;
      font-size: 13px;
    }
    .metric {
      padding: 11px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface-2);
    }
    .metric span { display: block; margin-bottom: 4px; color: var(--muted); font-size: 12px; font-weight: 750; }
    .metric strong { font-size: 18px; }
    .timeline { display: grid; gap: 10px; }
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
      display: grid;
      place-items: center;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #fff;
      color: var(--muted);
      font-weight: 850;
    }
    .step.allow .icon { background: var(--green-2); border-color: #91d6c4; color: var(--green); }
    .step.deny .icon { background: var(--red-2); border-color: #f2ada5; color: var(--red); }
    .step.info .icon { background: var(--amber-2); border-color: #ebc46d; color: var(--amber); }
    .step p { margin-top: 3px; color: var(--muted); font-size: 13px; }
    .details { display: grid; gap: 12px; }
    pre {
      margin: 0;
      min-height: 190px;
      overflow: auto;
      border-radius: 8px;
      background: var(--code);
      color: #f6fafc;
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
      font-weight: 750;
    }
    .status.allow { background: var(--green-2); color: var(--green); }
    .status.deny { background: var(--red-2); color: var(--red); }
    .status.info { background: var(--blue-2); color: var(--blue); }
    .rail {
      display: grid;
      grid-template-columns: 1fr 18px 1fr 18px 1fr;
      gap: 8px;
      align-items: center;
      margin-top: 8px;
    }
    .node {
      min-height: 62px;
      display: grid;
      align-content: center;
      gap: 2px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 9px;
      font-size: 13px;
      font-weight: 750;
    }
    .node span { color: var(--muted); font-size: 12px; font-weight: 650; }
    .arrow { color: var(--muted); text-align: center; font-weight: 850; }
    @media (max-width: 1140px) {
      main { grid-template-columns: 1fr; }
      header { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>AgentID DevOps Control Demo</h1>
      <p class="subtle">Production-change authority without standing production credentials.</p>
    </div>
    <div class="toolbar">
      <span class="pill">Gateway: Cloudflare Worker</span>
      <span class="pill">Mode: dry-run deploy</span>
      <span class="pill">Tenant: devops-sre-demo-agent</span>
      <a class="pill" href="__AUDIT_URL__" target="_blank" rel="noreferrer">Audit Console</a>
    </div>
  </header>

  <main>
    <section class="stack">
      <h2>Production Change</h2>
      <div class="note">The release agent can inspect production. It cannot deploy until approval and JIT authority are bound to this exact service, branch, commit, change request, and environment.</div>
      <div class="grid-2">
        <div class="metric"><span>Service</span><strong>checkout-api</strong></div>
        <div class="metric"><span>Environment</span><strong>production</strong></div>
        <div class="metric"><span>Branch</span><strong>main</strong></div>
        <div class="metric"><span>Change</span><strong>CHG-1042</strong></div>
      </div>
      <label>Commit SHA<input id="commit" value="abc123def456"></label>
      <label>Incident ID<input id="incident" value="INC-2048"></label>
      <h2 style="margin-bottom:0">Guard Agent Settings</h2>
      <div class="grid-2">
        <label class="check"><input id="autoApprove" type="checkbox" checked>Auto approve</label>
        <label class="check"><input id="requireCi" type="checkbox" checked>Require green CI</label>
        <label class="check"><input id="blockFreeze" type="checkbox" checked>Block freeze windows</label>
        <label>Max error %<input id="maxError" type="number" min="0" max="100" step="0.1" value="1.0"></label>
        <label>Max p95 ms<input id="maxLatency" type="number" min="1" step="1" value="400"></label>
        <label>Canary minutes<input id="canaryWindow" type="number" min="1" step="1" value="10"></label>
        <label>Rollback error %<input id="rollbackError" type="number" min="0" max="100" step="0.1" value="2.5"></label>
      </div>
      <div class="rail">
        <div class="node">Agent<span>Release request</span></div>
        <div class="arrow">→</div>
        <div class="node">AgentID<span>Approval + JIT</span></div>
        <div class="arrow">→</div>
        <div class="node">Provider<span>GitHub dry-run</span></div>
      </div>
      <div class="toolbar">
        <button class="primary" id="run">Run Controlled Deploy</button>
        <button id="reset">Reset</button>
      </div>
      <div id="status" class="status">Ready to run the DevOps/SRE control flow.</div>
    </section>

    <section>
      <h2>Runtime Flow</h2>
      <div id="timeline" class="timeline"></div>
    </section>

    <aside class="details">
      <div>
        <h2>Emulated Guard Signals</h2>
        <h3 style="margin-bottom:8px">Preflight</h3>
        <div class="grid-2">
          <label>CI status<select id="ciStatus"><option value="success">success</option><option value="failed">failed</option><option value="pending">pending</option></select></label>
          <label class="check"><input id="freezeActive" type="checkbox">Freeze active</label>
          <label>Current error %<input id="currentError" type="number" min="0" max="100" step="0.01" value="0.18"></label>
          <label>Current p95 ms<input id="currentLatency" type="number" min="1" step="1" value="212"></label>
          <label>Cloud status<select id="cloudStatus"><option value="operational">operational</option><option value="degraded">degraded</option><option value="major_outage">major outage</option></select></label>
        </div>
        <h3 style="margin:12px 0 8px">Canary</h3>
        <div class="grid-2">
          <label>Canary error %<input id="canaryError" type="number" min="0" max="100" step="0.01" value="0.42"></label>
          <label>Canary p95 ms<input id="canaryLatency" type="number" min="1" step="1" value="238"></label>
          <label>Samples<input id="canarySamples" type="number" min="1" step="1" value="6400"></label>
        </div>
      </div>
      <div id="approvalReview" hidden>
        <h2>Approval Review</h2>
        <pre id="approvalPayload">{}</pre>
        <div class="toolbar">
          <button class="primary" id="approve">Approve</button>
          <button class="danger" id="deny">Deny</button>
        </div>
      </div>
      <div>
        <h2>Request Payload</h2>
        <pre id="payload">{}</pre>
      </div>
      <div>
        <h2>Gateway / Provider Response</h2>
        <pre id="response">{}</pre>
      </div>
      <div>
        <h2>Live Audit</h2>
        <p class="subtle" style="margin-bottom:10px">After the flow completes, the deployed gateway audit console can filter by the generated approval ID.</p>
        <a id="auditLink" class="button" href="__AUDIT_URL__" target="_blank" rel="noreferrer">Open Audit Console</a>
      </div>
    </aside>
  </main>

  <script>
    const els = {
      run: document.getElementById("run"),
      reset: document.getElementById("reset"),
      commit: document.getElementById("commit"),
      incident: document.getElementById("incident"),
      autoApprove: document.getElementById("autoApprove"),
      requireCi: document.getElementById("requireCi"),
      blockFreeze: document.getElementById("blockFreeze"),
      maxError: document.getElementById("maxError"),
      maxLatency: document.getElementById("maxLatency"),
      canaryWindow: document.getElementById("canaryWindow"),
      rollbackError: document.getElementById("rollbackError"),
      ciStatus: document.getElementById("ciStatus"),
      freezeActive: document.getElementById("freezeActive"),
      currentError: document.getElementById("currentError"),
      currentLatency: document.getElementById("currentLatency"),
      cloudStatus: document.getElementById("cloudStatus"),
      canaryError: document.getElementById("canaryError"),
      canaryLatency: document.getElementById("canaryLatency"),
      canarySamples: document.getElementById("canarySamples"),
      status: document.getElementById("status"),
      timeline: document.getElementById("timeline"),
      payload: document.getElementById("payload"),
      response: document.getElementById("response"),
      auditLink: document.getElementById("auditLink"),
      approvalReview: document.getElementById("approvalReview"),
      approvalPayload: document.getElementById("approvalPayload"),
      approve: document.getElementById("approve"),
      deny: document.getElementById("deny")
    };
    let steps = [];
    let continuation = null;
    function setStatus(text, kind = "") {
      els.status.className = "status " + kind;
      els.status.textContent = text;
    }
    function reset() {
      steps = [];
      els.timeline.innerHTML = "";
      els.payload.textContent = "{}";
      els.response.textContent = "{}";
      els.approvalPayload.textContent = "{}";
      els.approvalReview.hidden = true;
      els.approve.disabled = true;
      els.deny.disabled = true;
      continuation = null;
      els.auditLink.href = "__AUDIT_URL__";
      setStatus("Ready to run the DevOps/SRE control flow.");
    }
    function render() {
      els.timeline.innerHTML = steps.map((step, index) => {
        const marker = step.status === "allow" ? "✓" : step.status === "deny" ? "!" : String(index + 1);
        return '<div class="step ' + step.status + '"><div class="icon">' + marker + '</div><div><h3>' + esc(step.title) + '</h3><p>' + esc(step.detail) + '</p></div></div>';
      }).join("");
    }
    function addStep(step) {
      steps.push(step);
      render();
      if (step.payload) els.payload.textContent = JSON.stringify(step.payload, null, 2);
      if (step.response) els.response.textContent = JSON.stringify(step.response, null, 2);
    }
    async function run() {
      reset();
      els.run.disabled = true;
      try {
        const response = await fetch("/api/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            commit_sha: els.commit.value,
            incident_id: els.incident.value,
            auto_approve: els.autoApprove.checked,
            guard_settings: collectGuardSettings(),
            guard_conditions: collectGuardConditions(),
            canary_metrics: collectCanaryMetrics()
          })
        });
        const body = await response.json();
        for (const step of body.steps || []) addStep(step);
        if (body.approval_id) {
          els.auditLink.href = (body.audit_url || "__AUDIT_URL__") + "?approval_id=" + encodeURIComponent(body.approval_id);
        }
        if (body.continuation) showApprovalReview(body);
        setStatus(statusMessage(body), statusKind(body));
      } catch (error) {
        setStatus("Demo error: " + error.message, "deny");
      } finally {
        els.run.disabled = false;
      }
    }
    function esc(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
    }
    function collectGuardSettings() {
      return {
        require_green_ci: els.requireCi.checked,
        block_freeze_window: els.blockFreeze.checked,
        max_error_rate_percent: Number(els.maxError.value),
        max_p95_latency_ms: Number(els.maxLatency.value),
        canary_window_minutes: Number(els.canaryWindow.value),
        rollback_error_rate_percent: Number(els.rollbackError.value)
      };
    }
    function collectGuardConditions() {
      return {
        ci_status: els.ciStatus.value,
        freeze_window_active: els.freezeActive.checked,
        current_error_rate_percent: Number(els.currentError.value),
        current_p95_latency_ms: Number(els.currentLatency.value),
        cloud_status: els.cloudStatus.value
      };
    }
    function collectCanaryMetrics() {
      return {
        canary_error_rate_percent: Number(els.canaryError.value),
        canary_p95_latency_ms: Number(els.canaryLatency.value),
        samples: Number(els.canarySamples.value)
      };
    }
    function statusMessage(body) {
      if (body.outcome === "complete") return "Controlled deploy complete: production action allowed only after scoped approval and JIT.";
      if (body.outcome === "approval_pending") return "Approval request is pending. Review the evidence, then approve or deny.";
      if (body.outcome === "approval_denied") return "Approval was denied; no JIT grant was issued.";
      if (body.outcome === "preflight_blocked") return "Guard preflight blocked the deploy before approval or JIT.";
      if (body.outcome === "rollback_jit_required") return "Guard monitor would request a separate rollback JIT grant.";
      return "Controlled deploy ended with a policy denial.";
    }
    function statusKind(body) {
      if (body.ok) return "allow";
      if (body.outcome === "approval_pending") return "info";
      return "deny";
    }
    function showApprovalReview(body) {
      continuation = body.continuation;
      els.approvalPayload.textContent = JSON.stringify(body.approval || {}, null, 2);
      els.approvalReview.hidden = false;
      els.approve.disabled = false;
      els.deny.disabled = false;
    }
    async function decide(action) {
      if (!continuation) return;
      els.approve.disabled = true;
      els.deny.disabled = true;
      try {
        const response = await fetch("/api/approval/" + action, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ continuation })
        });
        const body = await response.json();
        for (const step of body.steps || []) addStep(step);
        els.approvalPayload.textContent = JSON.stringify(body.approval || {}, null, 2);
        continuation = null;
        els.approvalReview.hidden = true;
        setStatus(statusMessage(body), statusKind(body));
      } catch (error) {
        setStatus("Demo error: " + error.message, "deny");
      }
    }
    els.run.addEventListener("click", run);
    els.reset.addEventListener("click", reset);
    els.approve.addEventListener("click", () => decide("approve"));
    els.deny.addEventListener("click", () => decide("deny"));
    reset();
  </script>
</body>
</html>`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return empty();
    if (request.method === "GET" && url.pathname === "/") return html(renderHtml(env));
    if (request.method === "POST" && url.pathname === "/api/run") return runDemo(request, env);
    if (request.method === "POST" && url.pathname === "/api/approval/approve") return decideApproval(request, env, "approve");
    if (request.method === "POST" && url.pathname === "/api/approval/deny") return decideApproval(request, env, "deny");
    return json({ error: "not found" }, 404);
  },
};

function renderHtml(env: Env): string {
  return HTML.replaceAll("__AUDIT_URL__", env.AGENTID_AUDIT_URL || `${env.AGENTID_GATEWAY_URL}/audit`);
}

async function runDemo(request: Request, env: Env): Promise<Response> {
  const input = await readJson(request);
  const ctx = demoContext(input);
  const settings = guardSettings(input.guard_settings);
  const conditions = guardConditionsFromInput(input.guard_conditions);
  const canaryMetrics = canaryMetricsFromInput(input.canary_metrics, settings);
  const autoApprove = input.auto_approve !== false;
  const approvalId = `approval-${Date.now()}`;
  const steps: Step[] = [];

  const readPayload = {
    agent_id: "platform-release-agent",
    tool: "devops.logs.read",
    action: "read",
    resource: `service/${ctx.service_id}/environment/${ctx.environment}/logs`,
    data_from: "runtime_logs",
    data_to: "agent_context",
    job_id: "incident_diagnostics",
    environment: ctx.environment,
    service_id: ctx.service_id,
    incident_id: ctx.incident_id,
  };
  const read = await gateway(env, "authorize", readPayload);
  steps.push(step("read", read.body.allow ? "Production logs read allowed" : "Production logs read denied", read.body.allow ? "Diagnostics are low-risk and stay inside the declared runtime log flow." : findings(read), read.body.allow ? "allow" : "deny", readPayload, read.body));
  if (!read.body.allow) return json({ ok: false, outcome: "policy_denied", approval_id: approvalId, audit_url: env.AGENTID_AUDIT_URL, steps });

  const preflight = evaluatePreflight(settings, ctx, conditions);
  steps.push(step("guard-preflight", preflight.allow ? "Guard preflight passed" : "Guard preflight blocked deploy", preflight.allow ? "External conditions are inside the configured guard thresholds and can be bound to the approval/JIT request." : preflight.findings.join("; "), preflight.allow ? "allow" : "deny", preflight.payload, preflight.response));
  if (!preflight.allow) return json({ ok: false, outcome: "preflight_blocked", approval_id: approvalId, audit_url: env.AGENTID_AUDIT_URL, steps });

  const deniedDeployPayload = deployAuthorizePayload(ctx, preflight.context);
  const deniedDeploy = await gateway(env, "authorize", deniedDeployPayload);
  steps.push(step("deploy-denied", deniedDeploy.body.allow ? "Deploy unexpectedly allowed" : "Production deploy denied without JIT", deniedDeploy.body.allow ? "The deploy was allowed." : "The gateway requires approval and a scoped JIT grant before production deploy execution.", deniedDeploy.body.allow ? "allow" : "deny", deniedDeployPayload, deniedDeploy.body));

  const approvalPayload = {
    ...deployGrantPayload(ctx, approvalId, preflight.context),
    requested_by: "sre-on-call",
    reason: "Deploy checkout-api after guard preflight, change approval, and incident verification",
  };
  const approval = await gateway(env, "approval-requests", approvalPayload);
  steps.push(step("approval-created", approval.status === 201 ? "Approval request created" : "Approval request failed", approval.status === 201 ? "The request is bound to service, production environment, branch, commit, change request, incident, and guard preflight evidence." : errorText(approval), approval.status === 201 ? "info" : "deny", approvalPayload, approval.body));
  if (approval.status !== 201) return json({ ok: false, outcome: "policy_denied", approval_id: approvalId, audit_url: env.AGENTID_AUDIT_URL, steps });

  const pendingGrantPayload = deployGrantPayload(ctx, approvalId, preflight.context);
  const pendingGrant = await gateway(env, "jit-grants", pendingGrantPayload);
  steps.push(step("pending-jit-denied", pendingGrant.status === 400 ? "JIT denied while approval is pending" : "Pending JIT result", pendingGrant.status === 400 ? "The gateway refuses to mint production authority until the approval request is approved." : errorText(pendingGrant), pendingGrant.status === 400 ? "deny" : "info", pendingGrantPayload, pendingGrant.body));

  const continuation = approvalContinuation(approvalId, ctx, preflight.context, settings, canaryMetrics);
  if (!autoApprove) {
    return json({
      ok: false,
      outcome: "approval_pending",
      approval_id: approvalId,
      audit_url: env.AGENTID_AUDIT_URL,
      approval: approval.body,
      continuation,
      steps,
    });
  }

  const continued = await continueAfterApproval(env, continuation);
  return json({
    ok: continued.ok,
    outcome: continued.outcome,
    approval_id: approvalId,
    audit_url: env.AGENTID_AUDIT_URL,
    approval: continued.approval,
    steps: [...steps, ...continued.steps],
  });
}

async function decideApproval(request: Request, env: Env, action: "approve" | "deny"): Promise<Response> {
  const input = await readJson(request);
  const continuation = continuationFromInput(input.continuation);
  if (!continuation.approval_id) return json({ error: "approval continuation is missing" }, 400);

  if (action === "deny") {
    const denial = await gateway(env, `approval-requests/${continuation.approval_id}/deny`, {
      decided_by: "release-manager-1",
      findings: ["manual approval denied"],
    });
    const denialStep = step(
      "approval-denied",
      denial.status === 200 ? "Release manager denied" : "Approval denial failed",
      denial.status === 200 ? "The request stopped before JIT authority could be issued." : errorText(denial),
      denial.status === 200 ? "deny" : "info",
      { decided_by: "release-manager-1" },
      denial.body,
    );
    return json({
      ok: false,
      outcome: "approval_denied",
      approval_id: continuation.approval_id,
      audit_url: env.AGENTID_AUDIT_URL,
      approval: denial.body,
      steps: [denialStep],
    });
  }

  const continued = await continueAfterApproval(env, continuation);
  return json({
    ok: continued.ok,
    outcome: continued.outcome,
    approval_id: continuation.approval_id,
    audit_url: env.AGENTID_AUDIT_URL,
    approval: continued.approval,
    steps: continued.steps,
  });
}

async function continueAfterApproval(
  env: Env,
  continuation: Continuation,
): Promise<{ ok: boolean; outcome: string; approval?: unknown; steps: Step[] }> {
  const { approval_id: approvalId, ctx, guard_context: guardContext, canary_metrics: canaryMetrics, settings } = continuation;
  const steps: Step[] = [];

  const approvalDecision = await gateway(env, `approval-requests/${approvalId}/approve`, {
    decided_by: "release-manager-1",
    findings: ["change request verified", "guard preflight evidence reviewed", "production deploy window open"],
  });
  steps.push(step("approval-approved", approvalDecision.status === 200 ? "Release manager approved" : "Approval decision failed", approvalDecision.status === 200 ? "Approval state changed to approved without exposing broad production credentials." : errorText(approvalDecision), approvalDecision.status === 200 ? "allow" : "deny", { decided_by: "release-manager-1" }, approvalDecision.body));
  if (approvalDecision.status !== 200) return { ok: false, outcome: "policy_denied", approval: approvalDecision.body, steps };

  const grantPayload = deployGrantPayload(ctx, approvalId, guardContext);
  const grant = await gateway(env, "jit-grants", grantPayload);
  steps.push(step("jit-issued", grant.status === 201 ? "Scoped JIT grant issued" : "JIT grant denied", grant.status === 201 ? "The grant is short-lived, single-use, and bound to the approved production-change and guard evidence context." : errorText(grant), grant.status === 201 ? "allow" : "deny", grantPayload, grant.body));
  if (grant.status !== 201) return { ok: false, outcome: "policy_denied", approval: approvalDecision.body, steps };

  const allowedDeployPayload = {
    ...deployAuthorizePayload(ctx, guardContext),
    approved: true,
    jit_grant_id: grant.body.jit_grant_id,
  };
  const allowedDeploy = await gateway(env, "authorize", allowedDeployPayload);
  steps.push(step("deploy-allowed", allowedDeploy.body.allow ? "Production deploy authorized" : "Production deploy denied", allowedDeploy.body.allow ? "The deploy can be forwarded because approval, JIT, job, resource, and context bindings all match." : findings(allowedDeploy), allowedDeploy.body.allow ? "allow" : "deny", allowedDeployPayload, allowedDeploy.body));
  if (!allowedDeploy.body.allow) return { ok: false, outcome: "policy_denied", approval: approvalDecision.body, steps };

  const providerReceipt = {
    provider: "github-actions",
    mode: "dry_run",
    workflow: ctx.workflow_id,
    repo: ctx.repo,
    branch: ctx.branch,
    commit_sha: ctx.commit_sha,
    dispatch: "would_create_workflow_dispatch",
    status: "accepted",
  };
  steps.push(step("provider-dry-run", "GitHub Actions dry-run accepted", "The provider wrapper would dispatch the production workflow only after verifying the AgentID receipt.", "allow", { workflow_dispatch: providerReceipt }, providerReceipt));

  const canary = evaluateCanary(settings, ctx, stringValue(grant.body.jit_grant_id), canaryMetrics);
  steps.push(step("guard-monitor", canary.allow ? "Guard monitor passed" : "Guard monitor would request rollback JIT", canary.allow ? "Canary metrics stayed inside guard thresholds; rollback authority was not requested." : canary.findings.join("; "), canary.allow ? "allow" : "deny", canary.payload, canary.response));

  return { ok: canary.allow, outcome: canary.allow ? "complete" : "rollback_jit_required", approval: approvalDecision.body, steps };
}

function demoContext(input: Record<string, unknown>) {
  return {
    environment: "production",
    service_id: "checkout-api",
    repo: "github.com/example/checkout",
    workflow_id: "deploy-production.yml",
    branch: "main",
    commit_sha: stringValue(input.commit_sha) || "abc123def456",
    change_request_id: "CHG-1042",
    incident_id: stringValue(input.incident_id) || "INC-2048",
  };
}

function deployAuthorizePayload(ctx: ReturnType<typeof demoContext>, guardContext: Record<string, string> = {}) {
  return {
    agent_id: "platform-release-agent",
    tool: "devops.deploy.production",
    action: "execute",
    resource: `service/${ctx.service_id}/environment/${ctx.environment}`,
    data_from: "release_pipeline",
    data_to: "production_runtime",
    job_id: "production_deploy",
    approved: false,
    ...ctx,
    ...guardContext,
  };
}

function deployGrantPayload(ctx: ReturnType<typeof demoContext>, approvalId: string, guardContext: Record<string, string> = {}) {
  return {
    tool: "devops.deploy.production",
    action: "execute",
    resource: `service/${ctx.service_id}/environment/${ctx.environment}`,
    approval_id: approvalId,
    user_id: "sre-on-call",
    job_id: "production_deploy",
    ...ctx,
    ...guardContext,
  };
}

function approvalContinuation(
  approvalId: string,
  ctx: ReturnType<typeof demoContext>,
  guardContext: Record<string, string>,
  settings: GuardSettings,
  canaryMetrics: CanaryMetrics,
): Continuation {
  return {
    approval_id: approvalId,
    ctx,
    guard_context: guardContext,
    settings,
    canary_metrics: canaryMetrics,
  };
}

function continuationFromInput(value: unknown): Continuation {
  const raw = recordValue(value);
  return approvalContinuation(
    stringValue(raw.approval_id),
    demoContextFromValue(raw.ctx),
    stringRecord(raw.guard_context),
    guardSettings(raw.settings),
    canaryMetricsFromInput(raw.canary_metrics, guardSettings(raw.settings)),
  );
}

function demoContextFromValue(value: unknown): ReturnType<typeof demoContext> {
  const raw = recordValue(value);
  return {
    environment: stringValue(raw.environment) || "production",
    service_id: stringValue(raw.service_id) || "checkout-api",
    repo: stringValue(raw.repo) || "github.com/example/checkout",
    workflow_id: stringValue(raw.workflow_id) || "deploy-production.yml",
    branch: stringValue(raw.branch) || "main",
    commit_sha: stringValue(raw.commit_sha) || "abc123def456",
    change_request_id: stringValue(raw.change_request_id) || "CHG-1042",
    incident_id: stringValue(raw.incident_id) || "INC-2048",
  };
}

function guardSettings(value: unknown): GuardSettings {
  const raw = recordValue(value);
  return {
    require_green_ci: booleanValue(raw.require_green_ci, true),
    block_freeze_window: booleanValue(raw.block_freeze_window, true),
    max_error_rate_percent: numberValue(raw.max_error_rate_percent, 1),
    max_p95_latency_ms: numberValue(raw.max_p95_latency_ms, 400),
    canary_window_minutes: numberValue(raw.canary_window_minutes, 10),
    rollback_error_rate_percent: numberValue(raw.rollback_error_rate_percent, 2.5),
  };
}

function guardConditionsFromInput(value: unknown): GuardConditions {
  const raw = recordValue(value);
  return {
    ci_status: stringChoice(raw.ci_status, "success", ["success", "failed", "pending"]),
    freeze_window_active: booleanValue(raw.freeze_window_active, false),
    current_error_rate_percent: numberValue(raw.current_error_rate_percent, 0.18),
    current_p95_latency_ms: numberValue(raw.current_p95_latency_ms, 212),
    cloud_status: stringChoice(raw.cloud_status, "operational", ["operational", "degraded", "major_outage"]),
  };
}

function canaryMetricsFromInput(value: unknown, settings: GuardSettings): CanaryMetrics {
  const raw = recordValue(value);
  return {
    canary_error_rate_percent: numberValue(raw.canary_error_rate_percent, 0.42),
    canary_p95_latency_ms: numberValue(raw.canary_p95_latency_ms, 238),
    window_minutes: settings.canary_window_minutes,
    samples: numberValue(raw.samples, 6400),
  };
}

function evaluatePreflight(settings: GuardSettings, ctx: ReturnType<typeof demoContext>, conditions: GuardConditions): GuardEvaluation {
  const findings: string[] = [];
  if (settings.require_green_ci && conditions.ci_status !== "success") findings.push("CI is not green");
  if (settings.block_freeze_window && conditions.freeze_window_active) findings.push("deploy freeze window is active");
  if (conditions.current_error_rate_percent > settings.max_error_rate_percent) findings.push("current error rate exceeds guard threshold");
  if (conditions.current_p95_latency_ms > settings.max_p95_latency_ms) findings.push("current p95 latency exceeds guard threshold");
  if (conditions.cloud_status !== "operational") findings.push("cloud provider status is not operational");

  const context = {
    preflight_check_id: `preflight-${Date.now()}`,
    guard_policy_version: "guard-demo-2026-06-09",
    guard_max_error_rate_percent: String(settings.max_error_rate_percent),
    guard_max_p95_latency_ms: String(settings.max_p95_latency_ms),
    guard_canary_window_minutes: String(settings.canary_window_minutes),
  };

  return {
    allow: findings.length === 0,
    findings,
    context,
    payload: {
      agent_id: "platform-release-agent",
      service_id: ctx.service_id,
      environment: ctx.environment,
      change_request_id: ctx.change_request_id,
      commit_sha: ctx.commit_sha,
      guard_settings: settings,
      external_conditions: conditions,
    },
    response: {
      decision: findings.length === 0 ? "pass" : "block",
      findings,
      context,
    },
  };
}

function evaluateCanary(settings: GuardSettings, ctx: ReturnType<typeof demoContext>, grantId: string, metrics: CanaryMetrics): GuardEvaluation {
  const findings: string[] = [];
  if (metrics.canary_error_rate_percent > settings.rollback_error_rate_percent) {
    findings.push("canary error rate exceeds rollback threshold");
  }
  if (metrics.canary_p95_latency_ms > settings.max_p95_latency_ms) {
    findings.push("canary p95 latency exceeds guard threshold");
  }

  return {
    allow: findings.length === 0,
    findings,
    context: {},
    payload: {
      agent_id: "platform-release-agent",
      service_id: ctx.service_id,
      environment: ctx.environment,
      jit_grant_id: grantId,
      rollback_error_rate_percent: settings.rollback_error_rate_percent,
      canary_window_minutes: settings.canary_window_minutes,
    },
    response: {
      decision: findings.length === 0 ? "continue" : "request_rollback_jit",
      findings,
      metrics,
      rollback_authority: findings.length === 0 ? "not_requested" : "requires_separate_jit_grant",
    },
  };
}

function step(id: string, title: string, detail: string, status: Step["status"], payload?: unknown, response?: unknown): Step {
  return { id, title, detail, status, payload, response };
}

async function gateway(env: Env, endpoint: string, payload: unknown): Promise<GatewayResult> {
  const path = `/tenants/${env.AGENTID_TENANT_ID}/${endpoint}`;
  const target = env.AGENTID_GATEWAY ? `https://agentid-gateway${path}` : `${env.AGENTID_GATEWAY_URL}${path}`;
  const bearerToken = env.AGENTID_DEMO_OIDC_SECRET
    ? await createDemoOidcToken(env, endpoint)
    : env.AGENTID_GATEWAY_TOKEN;
  if (!bearerToken) return { status: 500, body: { error: "demo auth token is not configured" } };
  const gatewayRequest = new Request(target, {
    method: "POST",
    headers: { authorization: `Bearer ${bearerToken}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const response = env.AGENTID_GATEWAY ? await env.AGENTID_GATEWAY.fetch(gatewayRequest) : await fetch(gatewayRequest);
  return { status: response.status, body: await response.json() as Record<string, any> };
}

async function createDemoOidcToken(env: Env, endpoint: string): Promise<string> {
  if (!env.AGENTID_DEMO_OIDC_SECRET) throw new Error("AGENTID_DEMO_OIDC_SECRET is not configured");
  const now = Math.floor(Date.now() / 1000);
  const scopes = ["agentid.authorize"];
  if (endpoint.includes("jit-grants") || endpoint.includes("approval-requests")) scopes.push("agentid.jit.grant");
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: env.AGENTID_OIDC_ISSUER,
    aud: env.AGENTID_OIDC_AUDIENCE,
    sub: "sre-on-call",
    tid: env.AGENTID_TENANT_ID,
    agent_id: "platform-release-agent",
    email: "sre-on-call@example.com",
    scope: scopes.join(" "),
    iat: now,
    exp: now + 300,
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.AGENTID_DEMO_OIDC_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

function findings(result: GatewayResult): string {
  return Array.isArray(result.body.findings) ? result.body.findings.join("; ") : errorText(result);
}

function errorText(result: GatewayResult): string {
  return stringValue(result.body.error) || `Gateway returned ${result.status}`;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const payload = await request.json();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("JSON body must be an object");
  return payload as Record<string, unknown>;
}

function stringValue(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringChoice(value: unknown, fallback: string, allowed: string[]): string {
  const raw = stringValue(value);
  return allowed.includes(raw) ? raw : fallback;
}

function stringRecord(value: unknown): Record<string, string> {
  const raw = recordValue(value);
  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(raw)) output[key] = stringValue(item);
  return output;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function base64UrlEncode(value: string | ArrayBuffer): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function html(body: string): Response {
  return new Response(body, { headers: cors({ "content-type": "text/html; charset=utf-8" }) });
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload, null, 2), { status, headers: cors({ "content-type": "application/json" }) });
}

function empty(): Response {
  return new Response(null, { status: 204, headers: cors({}) });
}

function cors(headers: Record<string, string>): Headers {
  return new Headers({
    ...headers,
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
  });
}
