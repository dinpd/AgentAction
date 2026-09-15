import { JOURNEY_NAV } from "./journey.ts";
export const RECURRING_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AgentAction — Recurring agents</title><link rel="icon" href="/favicon.png"><link rel="stylesheet" href="/assets/recurring.css"><script src="/assets/journey.js" defer></script><script src="/assets/recurring.js" defer></script></head><body>
<header><a class="brand" href="/#overview">AgentAction</a><div><span id="identity">Checking session…</span> · <a href="/cdn-cgi/access/logout">Log out</a></div></header><div class="builder-layout">${JOURNEY_NAV}<main>
<div class="heading"><div><p class="eyebrow">Recurring workflows</p><h1>Agents that keep watch.</h1><p class="lede">Configure a recipe, review its first check, and authorize ongoing work.</p></div><label>Workspace<select id="workspace"></select></label></div>
<p id="status" role="status" aria-live="polite">Loading…</p><div id="content" hidden>
<nav class="stage-tabs" aria-label="Recurring agent views"><a href="#agents">Agents</a><a href="#findings">Findings</a><a href="#notifications">Workspace notifications</a></nav>
<section id="agents"><div class="section-heading"><h2>Recurring agents</h2><button id="refresh" class="secondary">Refresh</button></div><div id="job-list" class="grid"></div>
<details id="new-agent"><summary>Create a recurring agent</summary><form id="create-recurring"><label>Recipe<select name="handler" id="handler"></select></label><p id="recipe-description" class="note"></p><label>Agent name<input name="title" maxlength="120" required></label><div id="recipe-inputs"></div><label>Check frequency<select name="intervalMinutes"><option value="5">Every 5 minutes</option><option value="15">Every 15 minutes</option><option value="60">Hourly</option><option value="1440">Daily</option></select></label><p class="note">Creates a draft. Run a baseline, then review the exact targets before enabling automatic reads. Up to eight agents; no AI usage for these deterministic checks.</p><button>Create draft</button></form></details></section>
<section id="findings" hidden><h2>Findings</h2><p class="note">A completed monitoring run can discover a problem. Unknown or stale checks do not establish that a target is healthy. Acknowledge keeps a finding open until a check observes recovery.</p><div id="finding-list"></div><h2>Recent runs</h2><div id="run-list"></div></section>
<section id="notifications" hidden><h2>Workspace notifications</h2><p class="note">Shared email destinations for agent findings, recoveries, approvals and execution failures. Agents inherit these defaults or use a subset. Quiet hours apply to critical alerts too. Times below are UTC.</p><p id="email-state" role="status"></p>
<form id="notification-settings"><label>Email recipients (one per line, up to five)<textarea name="recipients" rows="3" maxlength="1300" placeholder="alerts@example.com"></textarea></label><div class="fields"><label>Minimum severity<select name="minimumSeverity"><option value="info">All findings</option><option value="warning">Warnings and critical</option><option value="critical">Critical only</option></select></label><label>Noncritical notifications<select name="warnings"><option value="digest">Daily digest</option><option value="immediate">Immediately</option></select></label><label>Digest hour (UTC)<input name="digestHourUtc" type="number" min="0" max="23" required></label><label>Quiet hours start (UTC, optional)<input name="quietStartUtc" type="number" min="0" max="23"></label><label>Quiet hours end (UTC, optional)<input name="quietEndUtc" type="number" min="0" max="23"></label></div><label class="consent"><input name="weeklySummary" type="checkbox"> Email a weekly recurring-agent summary</label><button>Save workspace notifications</button><button id="test-email" type="button" class="secondary">Send test email</button></form>
<p class="note">Saving recipients authorizes notifications to those addresses. Provider acceptance is shown separately from inbox delivery. Up to five retries; an interrupted delivery can produce a duplicate. Removing a recipient cancels unsent deliveries.</p><h3>Delivery history</h3><div id="delivery-list"></div></section>
</div></main></div></body></html>`;

export function recurringApp(runtime: Window): void {
  const doc = runtime.document, el = (id: string) => doc.getElementById(id)!;
  const workspace = el("workspace") as HTMLSelectElement;
  let tenant = "", role = "viewer", generation = 0, busy = false, data: any;
  const node = (tag: string, value: string, css = "") => { const n = doc.createElement(tag); n.textContent = value; if (css) n.className = css; return n; };
  const message = (s: string, error = false) => { el("status").textContent = s; el("status").dataset.error = String(error); };
  const when = (v: number | undefined) => v ? new Date(v).toLocaleString() : "Not yet";
  function view() {
    const selected = ["agents", "findings", "notifications"].includes(runtime.location.hash.slice(1)) ? runtime.location.hash.slice(1) : "agents";
    for (const id of ["agents", "findings", "notifications"]) el(id).hidden = id !== selected;
    doc.querySelectorAll<HTMLAnchorElement>(".stage-tabs a").forEach(a => { if (a.hash === "#" + selected) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    runtime.agentActionJourney?.setView(selected === "notifications" ? "settings" : selected === "findings" ? "monitor" : "run");
  }
  async function refresh() {
    const g = generation, t = tenant;
    const response = await runtime.fetch(`/api/automations/${encodeURIComponent(t)}/state`, { cache: "no-store" });
    const result = await response.json(); if (g !== generation || t !== tenant) return;
    if (!response.ok) { el("content").hidden = true; throw new Error(result.error || "Workspace unavailable"); }
    data = result; el("content").hidden = false; render(); view(); message(`Workspace ready · ${role}`);
  }
  async function mutate(action: string, body: unknown) {
    if (busy) return; busy = true; const g = generation, t = tenant;
    try {
      const response = await runtime.fetch(`/api/automations/${encodeURIComponent(t)}/${action}`, { method: "POST", headers: { "content-type": "application/json", "x-agentaction-request": "agent-builder" }, body: JSON.stringify(body) });
      const result = await response.json(); if (g !== generation || t !== tenant) return;
      if (!response.ok) throw new Error(result.error || "Action failed");
      await refresh(); message(action === "test-email" ? "Test email queued. Refresh delivery history to see provider acceptance." : "Saved. Review the updated evidence below.");
    } catch (e) { if (g === generation) message((e as Error).message, true); }
    finally { busy = false; }
  }
  function button(label: string, fn: () => void, owner = false) {
    const b = node("button", label, "secondary") as HTMLButtonElement; b.type = "button"; b.disabled = role === "viewer" || (owner && role !== "owner"); b.onclick = fn; return b;
  }
  function recipeInputs() {
    const form = el("create-recurring") as HTMLFormElement, recipe = data.recipes.find((r: any) => r.id === (el("handler") as HTMLSelectElement).value);
    el("recipe-inputs").replaceChildren(); if (!recipe) return;
    el("recipe-description").textContent = recipe.description;
    (form.elements.namedItem("title") as HTMLInputElement).value = recipe.title;
    for (const field of recipe.inputs || []) {
      const label = node("label", field.label), input = doc.createElement(field.type === "lines" ? "textarea" : "input") as HTMLInputElement;
      input.name = "config-" + field.name; if (field.type !== "lines") input.type = field.type; input.required = Boolean(field.required); input.maxLength = field.maxLength || 512; label.append(input); el("recipe-inputs").append(label);
    }
    form.querySelectorAll<HTMLInputElement>("input,textarea,select,button").forEach(n => n.disabled = role !== "owner");
  }
  function render() {
    const jobs = el("job-list"); jobs.replaceChildren();
    for (const job of data.jobs) {
      const card = node("article", "", "card"); card.dataset.jobId = job.id;
      card.append(node("h3", job.title), node("p", `${job.status} · ${job.health}${job.stale ? " · stale" : ""}`), node("p", `Every ${job.intervalMinutes} minutes · Last check ${when(job.lastRun)} · Next ${when(job.nextRun)}`, "note"));
      const config = node("details", ""); config.append(node("summary", "Scope and saved evidence"));
      const showValues = (parent: HTMLElement, values: Record<string, unknown>) => {
        const list = node("dl", "");
        for (const [key, value] of Object.entries(values)) {
          if (value && typeof value === "object" && !Array.isArray(value)) { const detail = node("details", ""); detail.append(node("summary", key.replace(/([A-Z])/g, " $1"))); showValues(detail, value as Record<string, unknown>); parent.append(detail); continue; }
          list.append(node("dt", key.replace(/([A-Z])/g, " $1")), node("dd", key.endsWith("At") && typeof value === "number" ? when(value) : Array.isArray(value) ? value.join(", ") : String(value ?? "Not observed")));
        }
        parent.append(list);
      };
      config.append(node("h4", "Approved scope")); showValues(config, job.config); config.append(node("h4", "Last saved observations")); showValues(config, job.state); card.append(config);
      const last = data.runs.filter((r: any) => r.jobId === job.id).at(-1); if (last) card.append(node("p", last.summary));
      const actions = node("div", "", "actions"); actions.append(button(job.baselineAt ? "Check now" : "Run baseline", () => { void mutate("run", { jobId: job.id }); }));
      if (job.status === "active") actions.append(button("Pause", () => { void mutate("pause", { jobId: job.id }); }));
      else if (job.baselineAt) actions.append(button("Enable schedule", () => { if (runtime.confirm(`Authorize automatic reads every ${job.intervalMinutes} minutes for ${job.title}?\n${Object.entries(job.config).map(([key, value]) => key + ": " + (Array.isArray(value) ? value.join(", ") : value)).join("\n")}\nNotifications follow your configured workspace recipients. No website changes are permitted.`)) void mutate("activate", { jobId: job.id, reviewed: true }); }, true));
      if (job.status !== "active") actions.append(button("Remove agent", () => { if (runtime.confirm("Remove this agent and its saved findings and checks?")) void mutate("delete", { jobId: job.id }); }, true));
      card.append(actions);
      const routing = node("details", ""); routing.append(node("summary", "Agent notification routing"));
      const label = node("label", "Recipients"), select = doc.createElement("select");
      for (const [value, text] of [["inherit", "Inherit workspace defaults"], ["none", "No notifications"], ...data.notifications.recipients.map((r: string) => [r, r])]) { const option = node("option", text) as HTMLOptionElement; option.value = value; select.append(option); }
      select.value = job.recipients === null ? "inherit" : job.recipients.length ? job.recipients[0] : "none"; select.disabled = role !== "owner"; label.append(select); routing.append(label, button("Save agent routing", () => { void mutate("route", { jobId: job.id, recipients: select.value === "inherit" ? null : select.value === "none" ? [] : [select.value] }); }, true)); card.append(routing); jobs.append(card);
    }
    if (!data.jobs.length) jobs.append(node("p", "No recurring agents yet. Create a draft below.", "empty"));
    const handler = el("handler") as HTMLSelectElement, old = handler.value; handler.replaceChildren();
    for (const r of data.recipes) { const o = node("option", r.title) as HTMLOptionElement; o.value = r.id; handler.append(o); }
    if (data.recipes.some((r: any) => r.id === old)) handler.value = old;
    recipeInputs();
    const findings = el("finding-list"); findings.replaceChildren();
    for (const f of [...data.findings].sort((a: any, b: any) => b.updatedAt - a.updatedAt)) {
      const c = node("article", "", "card"); c.append(node("h3", f.title), node("p", `${data.jobs.find((j: any) => j.id === f.jobId)?.title || "Agent"} · ${f.severity} · ${f.status} · ${when(f.updatedAt)}`, "note"), node("p", f.detail));
      if (f.status === "open") c.append(button("Acknowledge", () => { void mutate("acknowledge", { findingId: f.id }); })); findings.append(c);
    }
    if (!data.findings.length) findings.append(node("p", "No findings recorded. Check run coverage before interpreting this as healthy."));
    const runs = el("run-list"); runs.replaceChildren();
    for (const r of [...data.runs].reverse().slice(0, 30)) { const c = node("article", "", "card"); c.append(node("strong", `${data.jobs.find((j: any) => j.id === r.jobId)?.title || "Agent"}: ${r.status}`), node("p", `${when(r.startedAt)} · ${r.kind} · ${r.findings} findings`, "note"), node("p", r.summary)); runs.append(c); }
    const form = el("notification-settings") as HTMLFormElement;
    for (const [key, value] of Object.entries(data.notifications)) { const input = form.elements.namedItem(key) as HTMLInputElement; if (key === "weeklySummary") input.checked = Boolean(value); else input.value = key === "recipients" ? (value as string[]).join("\n") : value === null ? "" : String(value); }
    form.querySelectorAll<HTMLInputElement>("input,textarea,select,button").forEach(n => n.disabled = role !== "owner");
    el("email-state").textContent = (data.emailAvailable ? "Email service configured; delivery history shows provider acceptance." : "Email service is not configured. Queued notifications cannot be delivered yet.") + (data.droppedNotifications ? ` ${data.droppedNotifications} notifications exceeded the queue limit.` : "");
    const deliveries = el("delivery-list"); deliveries.replaceChildren();
    for (const d of [...data.deliveries].reverse()) { const c = node("article", "", "card"); c.append(node("strong", `${d.status} · ${d.recipient}`), node("p", d.events.map((e: any) => e.title).join("; ")), node("p", `Attempts ${d.attempts} · ${d.acceptedAt ? "Accepted " + when(d.acceptedAt) : "Scheduled " + when(d.due)}`, "note")); if (d.error) c.append(node("p", d.error)); deliveries.append(c); }
    if (!data.deliveries.length) deliveries.append(node("p", "No email deliveries yet."));
  }
  (el("create-recurring") as HTMLFormElement).onsubmit = e => {
    e.preventDefault(); const form = e.currentTarget as HTMLFormElement, values = new FormData(form), handler = data.recipes.find((r: any) => r.id === values.get("handler")); const config: Record<string, unknown> = {};
    for (const field of handler.inputs || []) { const value = String(values.get("config-" + field.name) || "").trim(); if (value) config[field.name] = field.type === "lines" ? value.split(/\n/).map(v => v.trim()).filter(Boolean) : value; }
    void mutate("create", { handler: handler.id, title: values.get("title"), config, intervalMinutes: Number(values.get("intervalMinutes")) });
  };
  (el("notification-settings") as HTMLFormElement).onsubmit = e => {
    e.preventDefault(); const v = new FormData(e.currentTarget as HTMLFormElement); const hour = (key: string) => v.get(key) === "" ? null : Number(v.get(key));
    void mutate("settings", { recipients: String(v.get("recipients") || "").split(/\n/).map(s => s.trim()).filter(Boolean), minimumSeverity: v.get("minimumSeverity"), warnings: v.get("warnings"), digestHourUtc: Number(v.get("digestHourUtc")), quietStartUtc: hour("quietStartUtc"), quietEndUtc: hour("quietEndUtc"), weeklySummary: v.has("weeklySummary") });
  };
  el("test-email").onclick = () => { void mutate("test-email", {}); };
  el("handler").onchange = recipeInputs;
  el("refresh").onclick = () => { void refresh().catch(e => message(e.message, true)); };
  runtime.addEventListener("hashchange", view);
  async function selectWorkspace() {
    generation++; tenant = workspace.value; el("content").hidden = true; data = undefined;
    (el("create-recurring") as HTMLFormElement).reset(); (el("notification-settings") as HTMLFormElement).reset();
    for (const id of ["job-list", "finding-list", "run-list", "delivery-list", "recipe-inputs"]) el(id).replaceChildren();
    const option = workspace.selectedOptions[0]; role = option?.dataset.role || "viewer";
    const url = new URL(runtime.location.href); url.searchParams.set("workspace", tenant); runtime.history.replaceState(null, "", url); runtime.agentActionJourney?.setWorkspace(tenant);
    message("Loading workspace…"); await refresh();
  }
  workspace.onchange = () => { void selectWorkspace().catch(e => message(e.message, true)); };
  void (async () => {
    const response = await runtime.fetch("/api/console/session", { cache: "no-store" }), session = await response.json();
    if (!response.ok) throw new Error("Session unavailable. Sign in again.");
    el("identity").textContent = session.email || session.subject || "Signed in";
    for (const m of session.memberships || []) { const o = node("option", m.tenant.display_name || m.tenant.tenant_id) as HTMLOptionElement; o.value = m.tenant.tenant_id; o.dataset.role = m.membership.role; workspace.append(o); }
    if (!workspace.options.length) { message("Create or join a workspace in Workspace settings first."); return; }
    const preferred = new URL(runtime.location.href).searchParams.get("workspace"); if ([...workspace.options].some(o => o.value === preferred)) workspace.value = preferred!;
    await selectWorkspace();
  })().catch(e => message(e.message, true));
}
export const RECURRING_JS = `(${recurringApp.toString()})(window);`;
