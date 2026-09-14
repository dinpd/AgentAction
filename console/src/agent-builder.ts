import type { PrecheckReport } from "./mcp-precheck.ts";
import type { CatalogResult } from "./mcp-registry.ts";

export const AGENT_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>My agents — AgentAction</title><link rel="icon" type="image/png" href="/favicon.png"><link rel="stylesheet" href="/assets/agents.css"><script src="/assets/agents.js" defer></script></head><body>
<header><a class="brand" href="/">AgentAction<span> / My agents</span></a><nav><a href="/#overview">Observability</a><a href="/#setup">Workspace setup</a><a href="https://agentaction.dev/recipes">Explore examples ↗</a></nav><section class="account" aria-label="Signed-in account"><p class="note">Signed in as <strong id="account-identity">Checking session…</strong></p><p class="note">Workspace role: <strong id="account-role">Checking…</strong></p><div class="actions"><a id="account-logout" href="/cdn-cgi/access/logout" hidden>Log out</a><a id="account-login" href="/agents">Sign in</a><a href="/#setup">Workspace setup</a></div><p id="account-help" class="note">To switch accounts, log out and return to this page to sign in. Your role is assigned by a workspace owner.</p></section></header>
<main><div class="heading"><div><p class="eyebrow">Find → connect → create → observe</p><h1>What could your MCP do for you?</h1><p class="lede">Find a server by name or capability. Discover useful agents with AI. Try one with your account, review its actions, and keep its run history.</p></div><label class="workspace">Workspace<select id="workspace" aria-label="Workspace"></select></label></div>
<p id="status" role="status" aria-live="polite">Loading your workspace…</p>
<div id="builder" hidden>
<section class="panel"><div class="section-heading"><h2>1. Connect an MCP</h2><span>Server-side credentials · supervised execution</span></div>
<form id="catalog-search" role="search"><div class="fields catalog-filters"><label>What do you want your agent to do?<input id="catalog-query" name="q" type="search" maxlength="200" placeholder="Try send emails, query a database, or a service name"></label><label>Capability<select id="catalog-capability" name="capability"><option value="">All capabilities</option></select></label><label>Authentication<select id="catalog-auth" name="auth" aria-describedby="catalog-auth-help"><option value="">All authentication types</option></select></label></div><p id="catalog-auth-help" class="note">Authentication labels reflect declared headers or package inputs, including optional credentials. Not specified does not mean no authentication. Check provider documentation for OAuth, pricing and requirements for your chosen deployment.</p><div class="actions"><button type="submit">Search registry</button><button id="manual-connect" type="button" class="secondary">Enter an endpoint manually</button></div></form>
<p id="catalog-status" class="note" role="status" aria-live="polite">Search the official MCP Registry. Capabilities are advertised; connect to inspect actual tools.</p><div id="catalog-results" class="grid" aria-label="MCP server search results"></div><button id="catalog-more" type="button" class="secondary" hidden>Show more servers</button>
<section id="endpoint-precheck" class="precheck-panel" aria-label="Endpoint pre-check"><h3>Pre-check before connecting an account</h3><p class="note">Inspect public authentication metadata and available tool descriptions before sharing credentials. OAuth can be detected even though OAuth login is not supported yet. This check does not approve an endpoint or certify a provider as safe.</p><label>Endpoint to inspect<input id="precheck-endpoint" type="url" maxlength="2048" placeholder="https://mcp.example.com/mcp"></label><button id="precheck-run" type="button">Pre-check endpoint</button><p id="precheck-status" role="status" aria-live="polite">No endpoint inspected. Enter a URL or select Pre-check on a registry result.</p><div id="precheck-results" aria-live="polite"></div><details><summary>Recent workspace pre-checks</summary><div id="precheck-history"></div></details></section>
<div id="connection-details"><h3>Connection details</h3><p id="catalog-selection" class="note">Already have a server? Enter its HTTPS endpoint below.</p>
<form id="connect"><div class="fields"><label>Connection name<input name="label" maxlength="100" placeholder="My Firecrawl" required></label><label>MCP endpoint<input name="endpoint" type="url" placeholder="https://mcp.example.com/mcp" required></label><label>Bearer token <span class="muted">optional for public servers</span><input name="token" type="password" autocomplete="off" maxlength="4096"></label><label>Protocol<select name="protocol"><option value="2025-03-26">Session-based MCP (2025)</option><option value="2026-07-28">Stateless MCP (2026-07-28)</option></select></label></div>
<p id="endpoint-status" class="note" role="status" aria-live="polite">Enter an endpoint to check workspace access.</p>
<div id="endpoint-review" hidden><p class="note">Approve this exact destination for this workspace. Connecting later can send your supplied credentials, job inputs and tool arguments to this server.</p><p id="endpoint-review-url" class="note"></p><label class="consent"><input id="endpoint-reviewed" type="checkbox"> I reviewed this URL and approve it as a destination for this workspace.</label><button id="approve-endpoint" type="button" class="secondary" disabled>Approve endpoint for workspace</button></div>
<p class="note">Public HTTPS endpoints require workspace-owner approval or deployment-managed access. Local stdio and OAuth-only connections are not supported yet.</p>
<label class="consent"><input type="checkbox" name="consent" required> Use AI to suggest and run agents. Tool descriptions, job inputs and tool results are sent to the configured AI model. The bearer token stays server-side and is excluded from model prompts.</label>
<p id="connect-readiness" class="note" role="status">Enter an MCP endpoint above to check access.</p><button type="submit" aria-describedby="connect-readiness">Connect server</button></form><details><summary>Workspace endpoint approvals</summary><p class="note">Owners can remove workspace approvals. Removing access disconnects affected accounts and pauses their agents unless the endpoint is also enabled by the deployment.</p><div id="endpoint-approvals"></div></details></div><div id="connections" class="connections"></div></section>
<section class="panel"><div class="section-heading"><h2>2. Discover useful agents</h2><span>AI suggestions based on discovered tools</span></div><div id="suggestions" class="grid"><p class="empty">Connect a server, then choose “Suggest agents.”</p></div></section>
<section id="configure" class="panel" hidden><h2>3. Make it your agent</h2><form id="create"><label>Agent name<input name="title" maxlength="120" required></label><label>Your job inputs<textarea name="setup" maxlength="4000" rows="4" required placeholder="Add target URLs, resources, scope and any other inputs the agent needs."></textarea></label><p id="setup-hint" class="note"></p><label>What counts as success?<textarea name="success" maxlength="2000" rows="3" required></textarea></label><p id="selected-tools" class="note"></p><p class="note">The instance starts as a draft. Every proposed tool call requires your approval of its exact arguments. Up to four tool calls per run.</p><button type="submit">Create agent instance</button></form></section>
<section class="panel"><div class="section-heading"><h2>My agents</h2><button id="refresh" class="secondary" type="button">Refresh</button></div><div id="agents" class="grid"></div></section>
<section class="panel"><div class="section-heading"><h2>Observed runs</h2><span>Execution evidence and AI assessments shown separately</span></div><p class="note">Runs stay in this workspace. Tool results may contain account data and are visible to workspace members. History retains up to 40 recent runs, including trials needed by active instances. Token totals are reported when the model supplies usage; provider charges are not estimated.</p><div id="runs"></div></section>
</div></main></body></html>`;
export const AGENT_CSS = `:root{font-family:Arial,Helvetica,sans-serif;color:#171b15;background:#f5f5ee;line-height:1.5}*{box-sizing:border-box}body{margin:0}header{padding:22px 4vw;border-bottom:1px solid #cbd0c4;display:flex;justify-content:space-between;gap:24px;align-items:center}a{color:inherit}.account{max-width:360px;min-width:0;overflow-wrap:anywhere}.account p{margin:0 0 6px}.account .actions{margin:8px 0}.account .actions a{font-size:14px;font-weight:600}.account strong{color:#171b15}nav{display:flex;gap:24px;flex-wrap:wrap;font-size:14px}.brand{font-size:24px;font-weight:800;text-decoration:none}.brand span{font-size:16px;font-weight:400}main{max-width:1280px;margin:auto;padding:48px 4vw}h1{font-size:clamp(32px,4.5vw,56px);line-height:1.05;letter-spacing:-2px;max-width:780px;margin:12px 0 20px}h2{font-size:24px;letter-spacing:-.5px;margin:0 0 12px}h3{font-size:20px;line-height:1.25;margin:12px 0}.eyebrow{font-family:monospace;text-transform:uppercase;font-size:13px;letter-spacing:1px}.heading,.section-heading{display:flex;justify-content:space-between;gap:24px;align-items:start}.lede{max-width:730px;font-size:18px;color:#596150}.workspace{min-width:200px}label{display:flex;flex-direction:column;gap:7px;font-size:14px;font-weight:600;margin-bottom:18px}input,textarea,select{font:inherit;font-weight:400;border:1px solid #a6b09c;background:#fff;padding:12px;max-width:100%;border-radius:0;color:#171b15}textarea{width:100%;resize:vertical}input:focus,textarea:focus,select:focus,button:focus-visible,a:focus-visible{outline:3px solid #7b9c2a;outline-offset:3px}button{font:600 14px Arial;padding:12px 18px;border:1px solid #171b15;background:#171b15;color:#d5ff5d;cursor:pointer}button.secondary{color:#171b15;background:transparent}button:disabled{opacity:.45;cursor:not-allowed}button[aria-busy=true]{cursor:wait}.panel{border-top:1px solid #bac3af;padding:30px 0;margin-top:22px}.section-heading span,.note,.muted{font-size:14px;color:#596150;font-weight:400}.fields,.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.fields{grid-template-columns:repeat(2,minmax(0,1fr))}.catalog-filters{grid-template-columns:minmax(0,2fr) repeat(2,minmax(0,1fr))}.precheck-panel{border:2px solid #789832;background:#f6fbe9;padding:24px;margin:28px 0;overflow-wrap:anywhere}.precheck-panel h4{margin:14px 0 6px}.precheck-finding{border-left:4px solid #9a6511;padding:8px 12px;background:#fff2d6;margin:10px 0}.precheck-finding[data-level=blocked]{border-color:#ad4135;background:#f7e9e6}.precheck-finding[data-level=info]{border-color:#789832;background:#eaf1d9}.consent{display:flex;flex-direction:row;align-items:start;font-weight:400;max-width:850px}.consent input{margin-top:5px}.card{padding:22px;background:#fff;border:1px solid #cbd0c4;min-width:0;overflow-wrap:anywhere}.card p{font-size:16px}.card .note{font-size:14px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.pill{display:inline-block;background:#e4eccf;padding:4px 8px;font:12px monospace;text-transform:uppercase}.empty{color:#596150}.connection{display:flex;justify-content:space-between;gap:20px;border-top:1px solid #d6dccf;padding:18px 0;margin-top:18px;align-items:center}.run{margin-top:18px}.run-heading{display:flex;justify-content:space-between;gap:20px}.approval{border:2px solid #789832;padding:20px;background:#f6fbe9;margin-top:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:320px;overflow:auto;font:13px/1.5 monospace;background:#eef1e8;padding:15px}#connect-readiness[data-state=blocked]{padding:12px 16px;border-left:4px solid #9a6511;background:#fff2d6;color:#4b350f;font-weight:600}#endpoint-review-url,#endpoint-approvals .note{overflow-wrap:anywhere;min-width:0}details{margin-top:16px}summary{cursor:pointer;font-weight:600}#status{padding:14px 18px;border-left:4px solid #8bad34;background:#eaf1d9}#status[data-error=true]{border-color:#ad4135;background:#f7e9e6}[hidden]{display:none!important}@media(max-width:850px){.grid{grid-template-columns:1fr}.heading,header{flex-direction:column}.workspace{width:100%}.fields,.catalog-filters{grid-template-columns:1fr}.section-heading,.connection,.run-heading{flex-direction:column;gap:8px}main{padding-top:25px}}`;

export function agentBuilderApp(runtime: Window): void {
  const doc = runtime.document;
  const get = <T extends HTMLElement>(id: string) => doc.getElementById(id) as T;
  const workspace = get<HTMLSelectElement>("workspace");
  let tenant = "", role = "viewer", generation = 0;
  let state: any = { connections: [], agents: [], runs: [] };
  let chosen: { connectionId: string; suggestion: any } | undefined;
  let memberships: any[] = [];
  let catalogGeneration = 0, catalogOffset: number | null = null;
  let catalogQuery = "", catalogCapability = "", catalogAuth = "";
  const capabilityLabels = new Map<string, string>();
  const authLabels = new Map<string, string>();
  let inspectionGeneration = 0, inspecting = false, precheckTouched = false;
  function renderAccountRole() { get("account-role").textContent = tenant ? role : "No workspace selected"; }
  function sessionUnavailable(detail: string) {
    generation++; catalogGeneration++; inspectionGeneration++; inspecting = false; tenant = ""; role = "viewer"; memberships = [];
    state = { connections: [], agents: [], runs: [] }; chosen = undefined;
    get<HTMLFormElement>("connect").reset(); get<HTMLFormElement>("create").reset();
    workspace.replaceChildren(); workspace.disabled = true;
    get("builder").hidden = true; get<HTMLInputElement>("precheck-endpoint").value = ""; renderPrechecks();
    get("account-identity").textContent = "Session unavailable";
    get("account-role").textContent = "Sign in required";
    get("account-login").hidden = false; get("account-logout").hidden = true;
    get("account-help").textContent = detail;
    message(detail, true);
  }
  function canonicalEndpoint(value: string): string { try { return new URL(value).href; } catch { return ""; } }
  function endpointEnabled(value: string): boolean {
    const endpoint = canonicalEndpoint(value), access = state.endpointAccess;
    return Boolean(endpoint && access && (access.deployment.includes(endpoint) || access.workspace.some((a: { endpoint: string }) => a.endpoint === endpoint)));
  }
  function updateEndpointAccess(resetReview = false) {
    updatePrecheckButton();
    const form = get<HTMLFormElement>("connect"), endpoint = (form.elements.namedItem("endpoint") as HTMLInputElement).value;
    const enabled = endpointEnabled(endpoint), canonical = canonicalEndpoint(endpoint);
    const reviewed = get<HTMLInputElement>("endpoint-reviewed");
    if (resetReview) reviewed.checked = false;
    get("endpoint-status").textContent = !endpoint ? "Enter an endpoint to check workspace access." : enabled ? "Enabled for this workspace. Connect to inspect the server’s actual tools." : role === "owner" ? "Owner approval required. Review and approve the exact endpoint below before connecting." : "Owner approval required. Ask an owner of this workspace to review this endpoint in My Agents.";
    get("endpoint-review").hidden = role !== "owner" || enabled || !endpoint;
    get("endpoint-review-url").textContent = canonical || endpoint;
    const approve = get<HTMLButtonElement>("approve-endpoint"), submit = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
    const connecting = submit.getAttribute("aria-busy") === "true";
    approve.disabled = role !== "owner" || !reviewed.checked || !canonical || enabled || approve.getAttribute("aria-busy") === "true";
    submit.disabled = role === "viewer" || !enabled || connecting;
    submit.textContent = connecting ? "Connecting…" : "Connect server";
    get("connect-readiness").dataset.state = connecting ? "busy" : role === "viewer" || (endpoint && !enabled) ? "blocked" : "ready";
    get("connect-readiness").textContent = connecting ? "Connecting to the server and inspecting its tools. Please wait." : role === "viewer" ? "You have view-only access. Ask a workspace owner or operator to connect this server." : !endpoint ? "Enter an MCP endpoint above to check access." : !enabled ? role === "owner" ? "Connection blocked: this endpoint is not approved. Review its exact URL and select “Approve endpoint for workspace” above." : "Connection blocked: this endpoint is not approved. Ask a workspace owner to approve its exact URL." : "Endpoint access is enabled. Complete the connection details and AI consent above, then select Connect server.";
    doc.querySelectorAll<HTMLButtonElement>("[data-owner-only]").forEach(el => el.disabled = role !== "owner" || el.getAttribute("aria-busy") === "true");
    doc.querySelectorAll<HTMLOptionElement>("#catalog-results option").forEach(el => { el.textContent = `${el.value} — ${endpointEnabled(el.value) ? "enabled" : "owner approval required"}`; });
    doc.querySelectorAll<HTMLElement>("[data-endpoint-access]").forEach(el => { el.textContent = endpointEnabled(el.dataset.endpointAccess || "") ? "Enabled for this workspace" : "Owner approval required"; });
  }
  function renderEndpointApprovals() {
    const container = get("endpoint-approvals"); container.replaceChildren();
    for (const approval of state.endpointAccess?.workspace || []) {
      const row = node("div", "", "connection");
      row.append(node("p", `${approval.endpoint} · approved ${new Date(approval.approvedAt).toLocaleString()} by ${approval.approvedBy}`, "note"));
      const remove = button("Remove workspace approval", async () => {
        const deploymentEnabled = state.endpointAccess.deployment.includes(approval.endpoint);
        if (!runtime.confirm(`Remove workspace approval for ${approval.endpoint}? ${deploymentEnabled ? "Deployment-managed access will remain enabled." : "Affected connections will be disconnected and their agents paused."}`)) return;
        await mutate("remove-endpoint", { endpoint: approval.endpoint }); await refresh(); message(deploymentEnabled ? "Workspace approval removed. Deployment-managed access remains enabled." : "Workspace approval removed. Affected connections and schedules were stopped.");
      });
      remove.dataset.ownerOnly = "true"; row.append(remove); container.append(row);
    }
    if (!container.children.length) container.append(node("p", "No workspace-specific approvals yet.", "empty"));
  }
  function inspectionLabel(report: PrecheckReport): string {
    return report.authentication === "oauth" ? "OAuth discovered · login not supported yet" : report.authentication === "required" ? "Authentication required · type unconfirmed" : report.authentication === "not-observed" ? "Tools listed without authentication" : "Authentication unknown";
  }
  function updatePrecheckButton() {
    const el = get<HTMLButtonElement>("precheck-run");
    el.disabled = inspecting || role === "viewer" || !get<HTMLInputElement>("precheck-endpoint").value.trim();
    el.textContent = inspecting ? "Inspecting endpoint…" : "Pre-check endpoint";
    if (inspecting) el.setAttribute("aria-busy", "true"); else el.removeAttribute("aria-busy");
  }
  function selectPrecheck(endpoint: string) {
    inspectionGeneration++; inspecting = false; precheckTouched = true;
    get<HTMLInputElement>("precheck-endpoint").value = endpoint;
    renderPrechecks(); get("endpoint-precheck").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function renderPrechecks() {
    const reports: PrecheckReport[] = state.inspections || [];
    const field = get<HTMLInputElement>("precheck-endpoint");
    if (!precheckTouched && !field.value && reports.length) field.value = [...reports].sort((a,b) => b.checkedAt.localeCompare(a.checkedAt))[0].endpoint;
    const endpoint = canonicalEndpoint(field.value.trim());
    const report = reports.find(r => r.endpoint === endpoint);
    const results = get("precheck-results"); results.replaceChildren();
    if (report) {
      results.append(node("h4", inspectionLabel(report)), node("p", `Inspected endpoint: ${report.endpoint}`), node("p", `Observed ${new Date(report.checkedAt).toLocaleString()} · ${report.protocol}. Saved snapshot; rerun before granting access.`, "note"));
      results.append(node("p", report.visibility === "public-tools" ? `${report.toolCount} public tools inspected. Account-specific tools may differ.` : report.visibility === "authentication-required" ? "Tool visibility: requires authentication. Account-specific behavior is unknown." : "Tool visibility: unavailable or incomplete."));
      for (const provider of report.providers) {
        results.append(node("p", `Authorization provider: ${provider.issuer} · ${provider.verified ? "issuer metadata matched" : "metadata unverified"}`));
        if (provider.authorizationEndpoint) results.append(node("p", `Advertised authorization endpoint: ${provider.authorizationEndpoint}`, "note"));
        if (provider.tokenEndpoint) results.append(node("p", `Advertised token endpoint: ${provider.tokenEndpoint}`, "note"));
      }
      results.append(node("p", `Advertised supported scopes: ${report.scopes.join(", ") || "Not specified"}`, "note"), node("p", `Scopes challenged for this request: ${report.challengedScopes.join(", ") || "Not specified"}`, "note"));
      for (const f of report.findings) { const row = node("div", "", "precheck-finding"); row.dataset.level = f.level; row.append(node("strong", `${f.level === "blocked" ? "Blocked / incomplete" : f.level === "review" ? "Review" : "Observed"}: ${f.title}`), node("p", f.detail, "note")); results.append(row); }
      if (report.tools.length) { const tools = node("details"); tools.append(node("summary", "Inspected tool descriptions (untrusted provider text)")); for (const t of report.tools) tools.append(node("p", `${t.name}: ${t.description} · Inputs: ${t.inputs.join(", ") || "Not declared"}`, "note")); results.append(tools); }
      const evidence = node("details"); evidence.append(node("summary", "HTTP evidence")); for (const e of report.evidence) evidence.append(node("p", `${e.status} · ${e.url}`, "note")); results.append(evidence);
      results.append(button("Use inspected endpoint", async () => { clearSelection(); const form = get<HTMLFormElement>("connect"); (form.elements.namedItem("endpoint") as HTMLInputElement).value = report.endpoint; updateEndpointAccess(true); get("connection-details").scrollIntoView({ behavior: "smooth", block: "start" }); }));
    }
    get("precheck-status").textContent = inspecting ? "Inspecting without credentials. This may take up to 30 seconds; no tools will be executed." : report ? "Saved pre-check findings for this exact endpoint. Review the observations and limitations below." : role === "viewer" ? "An owner or operator can run a pre-check. Saved workspace reports are available below." : "No pre-check for this endpoint. Inspect it before entering account credentials.";
    const history = get("precheck-history"); history.replaceChildren();
    for (const r of [...reports].sort((a,b) => b.checkedAt.localeCompare(a.checkedAt))) { const el = node("button", `${inspectionLabel(r)} · ${r.endpoint}`, "secondary") as HTMLButtonElement; el.type = "button"; el.addEventListener("click", () => selectPrecheck(r.endpoint)); history.append(el); }
    if (!reports.length) history.append(node("p", "No saved pre-checks in this workspace.", "note"));
    doc.querySelectorAll<HTMLElement>("[data-inspection-endpoint]").forEach(el => { const r = reports.find(r => r.endpoint === el.dataset.inspectionEndpoint); el.textContent = r ? `${inspectionLabel(r)} · checked ${new Date(r.checkedAt).toLocaleString()}` : "Not pre-checked"; });
    updatePrecheckButton();
  }
  async function runPrecheck(endpoint: string) {
    if (!tenant || role === "viewer") return;
    const current = ++inspectionGeneration, workspaceId = tenant;
    inspecting = true; renderPrechecks();
    try {
      const protocol = (get<HTMLFormElement>("connect").elements.namedItem("protocol") as HTMLSelectElement).value;
      const report = await request(`/api/agents/${encodeURIComponent(workspaceId)}/inspect-endpoint`, { endpoint, protocol }) as PrecheckReport;
      if (current !== inspectionGeneration || workspaceId !== tenant) return;
      state.inspections = [...(state.inspections || []).filter((r: PrecheckReport) => r.endpoint !== report.endpoint), report];
      inspecting = false; renderPrechecks();
    } catch (error) {
      if (current !== inspectionGeneration || workspaceId !== tenant) return;
      inspecting = false; renderPrechecks();
      get("precheck-status").textContent = `Pre-check failed: ${error instanceof Error ? error.message : "Unable to inspect this endpoint."} Any saved report below is from an earlier check.`;
    } finally { if (current === inspectionGeneration) updatePrecheckButton(); }
  }
  function clearSelection() {
    get<HTMLFormElement>("connect").reset();
    get("catalog-selection").textContent = "Already have a server? Enter its HTTPS endpoint below.";
    updateEndpointAccess(true);
  }
  async function searchCatalog(append = false) {
    if (!tenant) return;
    const current = ++catalogGeneration, currentTenant = tenant;
    if (!append) {
      catalogQuery = get<HTMLInputElement>("catalog-query").value.trim();
      catalogCapability = get<HTMLSelectElement>("catalog-capability").value;
      catalogAuth = get<HTMLSelectElement>("catalog-auth").value;
      catalogOffset = null; get("catalog-results").replaceChildren();
    }
    get("catalog-more").hidden = true;
    get("catalog-status").textContent = "Searching the registry catalog…";
    const params = new URLSearchParams({ q: catalogQuery, capability: catalogCapability, auth: catalogAuth, offset: String(append ? catalogOffset || 0 : 0) });
    try {
      const data = await request(`/api/agents/${encodeURIComponent(currentTenant)}/catalog?${params}`) as CatalogResult;
      if (current !== catalogGeneration || currentTenant !== tenant) return;
      if (!capabilityLabels.size) for (const c of data.capabilities) {
        capabilityLabels.set(c.id, c.label);
        const option = node("option", c.label) as HTMLOptionElement; option.value = c.id; get("catalog-capability").append(option);
      }
      if (!authLabels.size) for (const auth of data.authTypes) {
        authLabels.set(auth.id, auth.label);
        const option = node("option", auth.label) as HTMLOptionElement; option.value = auth.id; get("catalog-auth").append(option);
      }
      for (const server of data.servers) {
        const card = node("article", "", "card");
        card.append(node("span", "Advertised · tools unverified", "pill"), node("h3", server.title), node("p", server.description), node("p", `Publisher namespace: ${server.publisher} · ${server.hosting}`, "note"), node("p", `${server.name} · version ${server.version}`, "note"));
        if (server.capabilities.length) card.append(node("p", `Capabilities: ${server.capabilities.map((id: string) => capabilityLabels.get(id) || id).join(", ")}`, "note"));
        card.append(node("p", `Declared authentication: ${server.authTypes.map(id => authLabels.get(id) || id).join(", ")}`, "note"), node("p", server.setup, "note"));
        if (server.website) {
          // Defense in depth: never render an executable URL from catalog data.
          try { const url = new URL(server.website); if (url.protocol === "https:" && !url.username && !url.password) {
            const link = node("a", "Provider documentation ↗") as HTMLAnchorElement; link.href = url.href; link.target = "_blank"; link.rel = "noopener noreferrer"; card.append(link);
          } } catch { /* Unsupported links are omitted. */ }
        }
        if (server.endpoints.length) {
          const endpointLabel = node("label", "Remote endpoint"), select = doc.createElement("select");
          select.setAttribute("aria-label", `Endpoint for ${server.title}`);
          for (const endpoint of server.endpoints) { const option = node("option", `${endpoint} — ${endpointEnabled(endpoint) ? "enabled" : "owner approval required"}`) as HTMLOptionElement; option.value = endpoint; select.append(option); }
          const accessLabel = node("p", "", "pill");
          accessLabel.dataset.endpointAccess = select.value;
          accessLabel.textContent = endpointEnabled(select.value) ? "Enabled for this workspace" : "Owner approval required";
          select.addEventListener("change", () => { accessLabel.dataset.endpointAccess = select.value; accessLabel.textContent = endpointEnabled(select.value) ? "Enabled for this workspace" : "Owner approval required"; });
          endpointLabel.append(select); card.append(accessLabel, endpointLabel, button("Use this server", async () => {
            clearSelection();
            const form = get<HTMLFormElement>("connect");
            (form.elements.namedItem("label") as HTMLInputElement).value = server.title.slice(0, 100);
            (form.elements.namedItem("endpoint") as HTMLInputElement).value = select.value;
            get("catalog-selection").textContent = `Selected ${server.title}. Review the endpoint before entering credentials.`;
            updateEndpointAccess(true);
            get("connection-details").scrollIntoView({ behavior: "smooth", block: "start" });
            (form.elements.namedItem("label") as HTMLInputElement).focus();
          }));
        } else card.append(node("p", "Setup required outside this builder", "pill"));
        const inspectable = server.inspectableEndpoints || server.endpoints;
        for (const endpoint of inspectable) {
          const badge = node("p", "Not pre-checked", "note"); badge.dataset.inspectionEndpoint = endpoint;
          card.append(badge, button(inspectable.length > 1 ? `Pre-check ${endpoint}` : "Pre-check", async () => { selectPrecheck(endpoint); await runPrecheck(endpoint); }));
        }
        get("catalog-results").append(card);
      }
      renderPrechecks();
      catalogOffset = data.nextOffset; get("catalog-more").hidden = catalogOffset === null;
      get("catalog-status").textContent = `${data.total} matching servers. ${data.notice}${data.updatedAt ? ` Last complete update: ${new Date(data.updatedAt).toLocaleString()}.` : ""}${data.stale ? " Catalog may be out of date." : ""}`;
      if (!data.servers.length && !append) get("catalog-results").append(node("p", data.indexing || data.unavailable ? "Catalog results are not available yet. Search again shortly or enter an endpoint manually." : "No matching servers. Try a service name, broaden the capability or authentication filters, or enter an endpoint manually.", "empty"));
    } catch (error) {
      if (current !== catalogGeneration || currentTenant !== tenant) return;
      get("catalog-status").textContent = error instanceof Error ? error.message : "Registry discovery is unavailable. Enter an endpoint manually.";
    }
  }
  function message(value: string, error = false) { get("status").textContent = value; get("status").dataset.error = String(error); }
  function node(tag: string, value = "", cls = "") { const el = doc.createElement(tag); el.textContent = value; if (cls) el.className = cls; return el; }
  function button(label: string, action: () => Promise<void>, secondary = true) {
    const el = node("button", label, secondary ? "secondary" : "") as HTMLButtonElement;
    el.type = "button"; el.disabled = role === "viewer";
    el.addEventListener("click", () => perform(el, action)); return el;
  }
  async function request(path: string, body?: any): Promise<any> {
    let response: Response;
    try {
      response = await runtime.fetch(path, { method: body ? "POST" : "GET", credentials: "same-origin", redirect: "manual", headers: body ? { "content-type": "application/json", "x-agentaction-request": "agent-builder" } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch {
      const detail = "Unable to verify your session. Check your connection, then select Sign in to reload this page.";
      sessionUnavailable(detail); throw new Error(detail);
    }
    if (response.status === 401 || response.type === "opaqueredirect" || response.redirected) {
      const detail = "Your session has expired or you are signed out. Select Sign in to continue.";
      sessionUnavailable(detail); throw new Error(detail);
    }
    const value = await response.json();
    if (!response.ok) throw new Error(typeof value.error === "string" ? value.error : value.error?.message || "The request could not be completed.");
    return value;
  }
  async function mutate(action: string, body: any) { return request(`/api/agents/${encodeURIComponent(tenant)}/${action}`, body); }
  async function perform(el: HTMLButtonElement, action: () => Promise<void>) {
    el.disabled = true; el.setAttribute("aria-busy", "true"); workspace.disabled = true; updateEndpointAccess();
    try { await action(); } catch (error) { const failure = error instanceof Error ? error.message : "Unable to complete the request."; await refresh().catch(() => {}); message(failure, true); }
    finally { el.removeAttribute("aria-busy"); el.disabled = role === "viewer"; workspace.disabled = !memberships.length; updateEndpointAccess(); }
  }
  async function refresh() {
    const current = ++generation;
    if (!tenant) { get("builder").hidden = true; message("Create or join a workspace in Workspace setup to build an agent."); return; }
    const data = await request(`/api/agents/${encodeURIComponent(tenant)}/state`);
    if (current !== generation) return;
    state = data; get("builder").hidden = false; render();
  }
  function render() {
    renderEndpointApprovals(); renderPrechecks();
    const connections = get("connections"), suggestions = get("suggestions"), agents = get("agents"), runs = get("runs");
    connections.replaceChildren(); suggestions.replaceChildren(); agents.replaceChildren(); runs.replaceChildren();
    for (const c of state.connections) {
      const row = node("div", "", "connection"), detail = node("div");
      detail.append(node("strong", c.label), node("p", `${c.tools.length} discovered tools · ${c.status}${c.hasCredential ? " · credential stored" : ""}`, "note"));
      row.append(detail);
      if (c.status === "connected") {
        const actions = node("div", "", "actions");
        actions.append(button("Suggest agents", async () => { message("AI is finding useful jobs in this server’s tool catalog…"); await mutate("suggest", { connectionId: c.id }); await refresh(); message("Suggestions are ready. Review a job, its tools and setup requirements."); }), button("Disconnect", async () => { if (!runtime.confirm("Disconnect this account, remove the stored credential and pause its agents?")) return; await mutate("disconnect", { connectionId: c.id }); await refresh(); message("Disconnected. The credential was removed and its agents were paused."); }));
        row.append(actions);
      }
      const credentialLabel = node("label", "Replace credential / reconnect");
      const credential = doc.createElement("input"); credential.type = "password"; credential.autocomplete = "off"; credential.maxLength = 4096; credential.placeholder = "New bearer token (blank for public access)"; credential.disabled = role === "viewer";
      credentialLabel.append(credential);
      const replace = button("Reconnect account", async () => {
        const token = credential.value; credential.value = "";
        message("Checking the replacement connection…");
        await mutate("connect", { connectionId: c.id, token }); await refresh(); message("Account reconnected. Its agents are paused; run a new trial before reactivation.");
      });
      const replacement = node("details"); replacement.append(node("summary", "Account connection"), credentialLabel, replace); detail.append(replacement);
      connections.append(row);
      for (const s of c.suggestions) {
        const card = node("article", "", "card");
        card.append(node("span", "AI suggested · untested", "pill"), node("h3", s.title), node("p", s.goal), node("p", `Requires: ${s.setup}`, "note"), node("p", `Success: ${s.success}`, "note"), node("p", `Tools: ${s.tools.join(", ")}`, "note"), button("Build this agent", async () => {
          chosen = { connectionId: c.id, suggestion: s }; get("configure").hidden = false;
          const form = get<HTMLFormElement>("create"); (form.elements.namedItem("title") as HTMLInputElement).value = s.title; (form.elements.namedItem("success") as HTMLTextAreaElement).value = s.success;
          get("setup-hint").textContent = s.setup; get("selected-tools").textContent = `Allowed tools: ${s.tools.join(", ")}`;
          get("configure").scrollIntoView({ behavior: "smooth", block: "start" });
        }, false)); suggestions.append(card);
      }
    }
    if (!suggestions.children.length) suggestions.append(node("p", "Connect a server, then choose “Suggest agents.”", "empty"));
    for (const a of state.agents) {
      const card = node("article", "", "card"), actions = node("div", "", "actions");
      card.append(node("span", a.status, "pill"), node("h3", a.title), node("p", a.goal), node("p", `Success: ${a.success}`, "note"));
      actions.append(button("Run a trial", async () => { message("Planning a trial. No tool executes until you approve its arguments."); await mutate("trial", { agentId: a.id }); await refresh(); message("Trial updated. Review its proposed call or result below."); }));
      const trial = state.runs.find((r: any) => r.id === a.lastTrial);
      if (a.status !== "active" && trial?.status === "completed" && trial.outcome === "met") actions.append(button("Activate daily", async () => { if (!runtime.confirm("I reviewed the trial result. Start a daily supervised run? Each tool call will still wait for approval.")) return; await mutate("activate", { agentId: a.id, reviewed: true }); await refresh(); message("Daily supervised schedule activated."); }));
      if (a.status !== "paused") actions.append(button("Pause", async () => { await mutate("pause", { agentId: a.id }); await refresh(); message("Agent paused. Pending calls were cancelled."); }));
      card.append(actions); if (a.nextRun) card.append(node("p", `Next proposal: ${new Date(a.nextRun).toLocaleString()}`, "note")); agents.append(card);
    }
    if (!agents.children.length) agents.append(node("p", "Choose an AI suggestion to create your first agent instance.", "empty"));
    for (const r of state.runs) {
      const card = node("article", "", "card run"), heading = node("div", "", "run-heading");
      heading.append(node("h3", state.agents.find((a: any) => a.id === r.agentId)?.title || "Agent run"), node("span", r.status.replaceAll("_", " "), "pill"));
      card.append(heading, node("p", `${r.kind} · ${new Date(r.startedAt).toLocaleString()} · ${r.events.length}/4 tool calls · ${r.tokens || "unreported"} model tokens`, "note"));
      if (r.summary) card.append(node("p", r.summary));
      if (r.outcome) card.append(node("p", `AI-assessed outcome: ${r.outcome.replaceAll("_", " ")}. ${r.reason || ""}`, "note"));
      for (const event of r.events) {
        const detail = node("details"); detail.append(node("summary", `${event.tool} · ${event.status}${event.durationMs !== undefined ? ` · ${event.durationMs} ms` : ""}`), node("pre", JSON.stringify({ arguments: event.arguments, result: event.result }, null, 2))); card.append(detail);
      }
      if (r.pending) {
        const approval = node("div", "", "approval"), actions = node("div", "", "actions");
        approval.append(node("strong", `Approve tool call: ${r.pending.tool}`), node("p", "This executes against your connected account. Review the exact arguments before approval.", "note"), node("pre", JSON.stringify(r.pending.arguments, null, 2)));
        const edit = doc.createElement("textarea"); edit.rows = 5; edit.value = JSON.stringify(r.pending.arguments, null, 2); edit.setAttribute("aria-label", "Revised tool arguments"); edit.disabled = role === "viewer";
        const advanced = node("details"); advanced.append(node("summary", "Adjust tool arguments"), node("p", "AI proposals use required inputs and provider defaults. Add optional settings here when needed, then save and review the revised call before approving.", "note"), edit, button("Save revised call", async () => { const args = JSON.parse(edit.value); await mutate("revise", { runId: r.id, approvalId: r.pending.id, arguments: args }); await refresh(); message("Proposal revised. Review the saved arguments before approving execution."); })); approval.append(advanced);
        actions.append(button("Approve and execute", async () => { message("Executing the approved call and assessing the next step…"); await mutate("approve", { runId: r.id, approvalId: r.pending.id }); await refresh(); message("Run updated. Review the execution evidence and any next proposal."); }, false), button("Cancel run", async () => { await mutate("cancel", { runId: r.id }); await refresh(); message("Run cancelled."); })); approval.append(actions); card.append(approval);
      }
      runs.append(card);
    }
    if (!runs.children.length) runs.append(node("p", "Trial and scheduled runs will appear here with their execution history.", "empty"));
    get<HTMLFormElement>("connect").querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>("input,button,select").forEach(el => el.disabled = role === "viewer");
    updateEndpointAccess();
  }
  get<HTMLFormElement>("connect").querySelector<HTMLInputElement>("[name=endpoint]")!.addEventListener("input", () => updateEndpointAccess(true));
  get("endpoint-reviewed").addEventListener("change", () => updateEndpointAccess());
  get<HTMLButtonElement>("approve-endpoint").addEventListener("click", event => {
    const form = get<HTMLFormElement>("connect"), endpoint = canonicalEndpoint((form.elements.namedItem("endpoint") as HTMLInputElement).value);
    if (role !== "owner" || !get<HTMLInputElement>("endpoint-reviewed").checked) return;
    void perform(event.currentTarget as HTMLButtonElement, async () => {
      message("Validating the public endpoint and saving workspace approval…");
      await mutate("approve-endpoint", { endpoint, reviewed: true });
      await refresh(); updateEndpointAccess(true); message("Endpoint approved for this workspace. Enter any required credential and connect when ready.");
    });
  });
  get<HTMLInputElement>("precheck-endpoint").addEventListener("input", () => { inspectionGeneration++; inspecting = false; precheckTouched = true; renderPrechecks(); });
  get<HTMLButtonElement>("precheck-run").addEventListener("click", () => { void runPrecheck(get<HTMLInputElement>("precheck-endpoint").value.trim()); });
  get<HTMLFormElement>("catalog-search").addEventListener("submit", event => { event.preventDefault(); void searchCatalog(); });
  get("catalog-more").addEventListener("click", () => { void searchCatalog(true); });
  get("manual-connect").addEventListener("click", () => { clearSelection(); selectPrecheck(""); get<HTMLInputElement>("precheck-endpoint").focus(); });
  get<HTMLFormElement>("connect").addEventListener("submit", event => {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement, data = new FormData(form), submit = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
    const payload = { label: data.get("label"), endpoint: data.get("endpoint"), token: data.get("token"), protocol: data.get("protocol") };
    (form.elements.namedItem("token") as HTMLInputElement).value = "";
    void perform(submit, async () => { message("Connecting and discovering the server’s actual tools…"); try { await mutate("connect", payload); } finally { payload.token = null; } await refresh(); message("Connected. Choose “Suggest agents” to discover useful jobs."); });
  });
  get<HTMLFormElement>("create").addEventListener("submit", event => {
    event.preventDefault(); if (!chosen) return;
    const form = event.currentTarget as HTMLFormElement, data = new FormData(form);
    void perform(form.querySelector("button")!, async () => { await mutate("create", { connectionId: chosen!.connectionId, suggestionId: chosen!.suggestion.id, title: data.get("title"), setup: data.get("setup"), success: data.get("success") }); get("configure").hidden = true; form.reset(); chosen = undefined; await refresh(); message("Agent instance created. Run a trial to review its first action."); });
  });
  get<HTMLButtonElement>("refresh").addEventListener("click", () => { void refresh().catch(e => message(e.message, true)); });
  workspace.addEventListener("change", () => { get("builder").hidden = true; catalogGeneration++; inspectionGeneration++; inspecting = false; precheckTouched = false; get<HTMLInputElement>("precheck-endpoint").value = ""; catalogOffset = null; get("catalog-results").replaceChildren(); get("catalog-more").hidden = true; get("catalog-status").textContent = "Search the official MCP Registry by name or capability."; state = { connections: [], agents: [], runs: [] }; clearSelection(); tenant = workspace.value; role = memberships.find(m => m.tenant.tenant_id === tenant)?.membership.role || "viewer"; renderAccountRole(); chosen = undefined; get("configure").hidden = true; get<HTMLFormElement>("connect").reset(); void refresh().then(() => message(`Workspace ready · ${role}`)).catch(e => message(e.message, true)); });
  void (async () => {
    try {
      const session = await request("/api/console/session"); memberships = session.memberships || [];
      get("account-identity").textContent = session.email || session.subject || "Authenticated account";
      get("account-logout").hidden = false; get("account-login").hidden = true;
      workspace.disabled = !memberships.length;
      for (const entry of memberships) { const option = node("option", entry.tenant.display_name || entry.tenant.tenant_id) as HTMLOptionElement; option.value = entry.tenant.tenant_id; workspace.append(option); }
      tenant = session.tenant_id || workspace.value; workspace.value = tenant;
      role = memberships.find(m => m.tenant.tenant_id === tenant)?.membership.role || "viewer";
      renderAccountRole(); await refresh(); if (tenant) void searchCatalog(); if (tenant) message(`Workspace ready · ${role}. Connect a server to start.`);
    } catch (error) { message(error instanceof Error ? error.message : "Unable to load the workspace.", true); }
  })();
}
export const AGENT_JS = `(${agentBuilderApp.toString()})(window);`;
