export const AGENT_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>My agents — AgentAction</title><link rel="stylesheet" href="/assets/agents.css"><script src="/assets/agents.js" defer></script></head><body>
<header><a class="brand" href="/">AgentAction<span> / My agents</span></a><nav><a href="/#overview">Observability</a><a href="/#setup">Workspace setup</a><a href="https://agentaction.dev/recipes">Explore examples ↗</a></nav></header>
<main><div class="heading"><div><p class="eyebrow">Connect → discover → create → observe</p><h1>What could your MCP do for you?</h1><p class="lede">Connect a server. Discover useful agents with AI. Try one with your account, review its actions, and keep its run history.</p></div><label class="workspace">Workspace<select id="workspace" aria-label="Workspace"></select></label></div>
<p id="status" role="status" aria-live="polite">Loading your workspace…</p>
<div id="builder" hidden>
<section class="panel"><div class="section-heading"><h2>1. Connect an MCP</h2><span>Server-side credentials · supervised execution</span></div>
<form id="connect"><div class="fields"><label>Connection name<input name="label" maxlength="100" placeholder="My Firecrawl" required></label><label>MCP endpoint<input name="endpoint" type="url" value="https://mcp.firecrawl.dev/v2/mcp" required></label><label>Bearer token <span class="muted">optional for public servers</span><input name="token" type="password" autocomplete="off" maxlength="4096"></label><label>Protocol<select name="protocol"><option value="2025-03-26">Session-based MCP (2025)</option><option value="2026-07-28">Stateless MCP (2026-07-28)</option></select></label></div>
<p class="note">Firecrawl is enabled to start. An administrator can enable other exact HTTPS endpoints. Local stdio and OAuth-only connections are not supported yet.</p>
<label class="consent"><input type="checkbox" name="consent" required> Use AI to suggest and run agents. Tool descriptions, job inputs and tool results are sent to the configured AI model. The bearer token stays server-side and is excluded from model prompts.</label>
<button type="submit">Connect server</button></form><div id="connections" class="connections"></div></section>
<section class="panel"><div class="section-heading"><h2>2. Discover useful agents</h2><span>AI suggestions based on discovered tools</span></div><div id="suggestions" class="grid"><p class="empty">Connect a server, then choose “Suggest agents.”</p></div></section>
<section id="configure" class="panel" hidden><h2>3. Make it your agent</h2><form id="create"><label>Agent name<input name="title" maxlength="120" required></label><label>Your job inputs<textarea name="setup" maxlength="4000" rows="4" required placeholder="Add target URLs, resources, scope and any other inputs the agent needs."></textarea></label><p id="setup-hint" class="note"></p><label>What counts as success?<textarea name="success" maxlength="2000" rows="3" required></textarea></label><p id="selected-tools" class="note"></p><p class="note">The instance starts as a draft. Every proposed tool call requires your approval of its exact arguments. Up to four tool calls per run.</p><button type="submit">Create agent instance</button></form></section>
<section class="panel"><div class="section-heading"><h2>My agents</h2><button id="refresh" class="secondary" type="button">Refresh</button></div><div id="agents" class="grid"></div></section>
<section class="panel"><div class="section-heading"><h2>Observed runs</h2><span>Execution evidence and AI assessments shown separately</span></div><p class="note">Runs stay in this workspace. Tool results may contain account data and are visible to workspace members. History retains up to 40 recent runs, including trials needed by active instances. Token totals are reported when the model supplies usage; provider charges are not estimated.</p><div id="runs"></div></section>
</div></main></body></html>`;
export const AGENT_CSS = `:root{font-family:Arial,Helvetica,sans-serif;color:#171b15;background:#f5f5ee;line-height:1.5}*{box-sizing:border-box}body{margin:0}header{padding:22px 4vw;border-bottom:1px solid #cbd0c4;display:flex;justify-content:space-between;gap:24px;align-items:center}a{color:inherit}nav{display:flex;gap:24px;flex-wrap:wrap;font-size:14px}.brand{font-size:24px;font-weight:800;text-decoration:none}.brand span{font-size:16px;font-weight:400}main{max-width:1280px;margin:auto;padding:48px 4vw}h1{font-size:clamp(32px,4.5vw,56px);line-height:1.05;letter-spacing:-2px;max-width:780px;margin:12px 0 20px}h2{font-size:24px;letter-spacing:-.5px;margin:0 0 12px}h3{font-size:20px;line-height:1.25;margin:12px 0}.eyebrow{font-family:monospace;text-transform:uppercase;font-size:13px;letter-spacing:1px}.heading,.section-heading{display:flex;justify-content:space-between;gap:24px;align-items:start}.lede{max-width:730px;font-size:18px;color:#596150}.workspace{min-width:200px}label{display:flex;flex-direction:column;gap:7px;font-size:14px;font-weight:600;margin-bottom:18px}input,textarea,select{font:inherit;font-weight:400;border:1px solid #a6b09c;background:#fff;padding:12px;max-width:100%;border-radius:0;color:#171b15}textarea{width:100%;resize:vertical}input:focus,textarea:focus,select:focus,button:focus-visible,a:focus-visible{outline:3px solid #7b9c2a;outline-offset:3px}button{font:600 14px Arial;padding:12px 18px;border:1px solid #171b15;background:#171b15;color:#d5ff5d;cursor:pointer}button.secondary{color:#171b15;background:transparent}button:disabled{opacity:.45;cursor:wait}.panel{border-top:1px solid #bac3af;padding:30px 0;margin-top:22px}.section-heading span,.note,.muted{font-size:14px;color:#596150;font-weight:400}.fields,.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.fields{grid-template-columns:repeat(2,minmax(0,1fr))}.consent{display:flex;flex-direction:row;align-items:start;font-weight:400;max-width:850px}.consent input{margin-top:5px}.card{padding:22px;background:#fff;border:1px solid #cbd0c4;min-width:0;overflow-wrap:anywhere}.card p{font-size:16px}.card .note{font-size:14px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.pill{display:inline-block;background:#e4eccf;padding:4px 8px;font:12px monospace;text-transform:uppercase}.empty{color:#596150}.connection{display:flex;justify-content:space-between;gap:20px;border-top:1px solid #d6dccf;padding:18px 0;margin-top:18px;align-items:center}.run{margin-top:18px}.run-heading{display:flex;justify-content:space-between;gap:20px}.approval{border:2px solid #789832;padding:20px;background:#f6fbe9;margin-top:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:320px;overflow:auto;font:13px/1.5 monospace;background:#eef1e8;padding:15px}details{margin-top:16px}summary{cursor:pointer;font-weight:600}#status{padding:14px 18px;border-left:4px solid #8bad34;background:#eaf1d9}#status[data-error=true]{border-color:#ad4135;background:#f7e9e6}[hidden]{display:none!important}@media(max-width:850px){.grid{grid-template-columns:1fr}.heading,header{flex-direction:column}.workspace{width:100%}.fields{grid-template-columns:1fr}.section-heading,.connection,.run-heading{flex-direction:column;gap:8px}main{padding-top:25px}}`;

export function agentBuilderApp(runtime: Window): void {
  const doc = runtime.document;
  const get = <T extends HTMLElement>(id: string) => doc.getElementById(id) as T;
  const workspace = get<HTMLSelectElement>("workspace");
  let tenant = "", role = "viewer", generation = 0;
  let state: any = { connections: [], agents: [], runs: [] };
  let chosen: { connectionId: string; suggestion: any } | undefined;
  let memberships: any[] = [];
  function message(value: string, error = false) { get("status").textContent = value; get("status").dataset.error = String(error); }
  function node(tag: string, value = "", cls = "") { const el = doc.createElement(tag); el.textContent = value; if (cls) el.className = cls; return el; }
  function button(label: string, action: () => Promise<void>, secondary = true) {
    const el = node("button", label, secondary ? "secondary" : "") as HTMLButtonElement;
    el.type = "button"; el.disabled = role === "viewer";
    el.addEventListener("click", () => perform(el, action)); return el;
  }
  async function request(path: string, body?: any): Promise<any> {
    const response = await runtime.fetch(path, { method: body ? "POST" : "GET", credentials: "same-origin", headers: body ? { "content-type": "application/json", "x-agentaction-request": "agent-builder" } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
    const value = await response.json();
    if (!response.ok) throw new Error(typeof value.error === "string" ? value.error : value.error?.message || "The request could not be completed.");
    return value;
  }
  async function mutate(action: string, body: any) { return request(`/api/agents/${encodeURIComponent(tenant)}/${action}`, body); }
  async function perform(el: HTMLButtonElement, action: () => Promise<void>) {
    el.disabled = true; workspace.disabled = true;
    try { await action(); } catch (error) { const failure = error instanceof Error ? error.message : "Unable to complete the request."; await refresh().catch(() => {}); message(failure, true); }
    finally { el.disabled = role === "viewer"; workspace.disabled = false; }
  }
  async function refresh() {
    const current = ++generation;
    if (!tenant) { get("builder").hidden = true; message("Create or join a workspace in Workspace setup to build an agent."); return; }
    const data = await request(`/api/agents/${encodeURIComponent(tenant)}/state`);
    if (current !== generation) return;
    state = data; get("builder").hidden = false; render();
  }
  function render() {
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
  }
  get<HTMLFormElement>("connect").addEventListener("submit", event => {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement, data = new FormData(form), submit = form.querySelector("button")!;
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
  workspace.addEventListener("change", () => { tenant = workspace.value; role = memberships.find(m => m.tenant.tenant_id === tenant)?.membership.role || "viewer"; chosen = undefined; get("configure").hidden = true; get<HTMLFormElement>("connect").reset(); void refresh().then(() => message(`Workspace ready · ${role}`)).catch(e => message(e.message, true)); });
  void (async () => {
    try {
      const session = await request("/api/console/session"); memberships = session.memberships || [];
      for (const entry of memberships) { const option = node("option", entry.tenant.display_name || entry.tenant.tenant_id) as HTMLOptionElement; option.value = entry.tenant.tenant_id; workspace.append(option); }
      tenant = session.tenant_id || workspace.value; workspace.value = tenant;
      role = memberships.find(m => m.tenant.tenant_id === tenant)?.membership.role || "viewer";
      await refresh(); if (tenant) message(`Workspace ready · ${role}. Connect a server to start.`);
    } catch (error) { message(error instanceof Error ? error.message : "Unable to load the workspace.", true); }
  })();
}
export const AGENT_JS = `(${agentBuilderApp.toString()})(window);`;
