import type { HostedContract, HostedEvaluation } from "./recipe-evaluation.ts";
export type HostedExecution = {
  contract?: HostedContract; evaluation?: HostedEvaluation;
  id: string; runId: string; agentKey: string; agent: string; source: "recurring" | "supervised";
  status: string; kind: string; startedAt: number; finishedAt?: number; durationMs?: number;
  summary: string; findings?: number; outcome?: string; reason?: string; attention: boolean; approvalPending?: boolean;
  evidence: string; evidenceDigest?: string; observations?: unknown; toolCalls?: number;
};
/** A projection of existing runs, never a second execution or a fabricated receipt. */
export function executionRecords(supervised: any, recurring: any): HostedExecution[] {
  const rows: HostedExecution[] = [];
  const at = (value: unknown) => typeof value === "string" || typeof value === "number" ? new Date(value).getTime() : NaN;
  for (const [source, data] of [["supervised", supervised], ["recurring", recurring]] as const) {
    if (!data) continue;
    for (const run of data.runs) {
      const agentId = source === "recurring" ? run.jobId : run.agentId;
      const agent = (source === "recurring" ? data.jobs : data.agents).find((a: any) => a.id === agentId);
      const startedAt = at(run.startedAt), finishedAt = at(run.finishedAt);
      const findings = source === "recurring" && Number.isFinite(run.findings) ? run.findings : undefined;
      rows.push({
        id: `${source}:${run.id}`, runId: run.id, agentKey: `${source}:${agentId}`, agent: agent?.title || "Unknown agent", source,
        status: run.status, kind: run.kind, startedAt, ...(Number.isFinite(finishedAt) ? { finishedAt } : {}),
        ...(Number.isFinite(finishedAt) && finishedAt >= startedAt ? { durationMs: finishedAt - startedAt } : {}),
        summary: run.summary || "Result not yet available.", findings, outcome: source === "supervised" ? run.outcome : undefined,
        reason: source === "supervised" ? run.reason : undefined,
        approvalPending: source === "supervised" && run.status === "awaiting_approval" && Boolean(run.pending?.id && run.pending?.tool),
        attention: run.status !== "cancelled" && (["awaiting_approval", "failed", "partial", "interrupted"].includes(run.status) || (findings || 0) > 0 || ["not_met", "uncertain"].includes(run.outcome) || Boolean(run.evaluation && run.evaluation.status !== "pass")),
        ...(source === "supervised" ? { contract: run.contract, evaluation: run.evaluation } : {}),
        evidence: source === "recurring" ? "Recorded check" : "Recorded tool execution",
        ...(source === "recurring" ? { evidenceDigest: run.evidenceDigest, observations: run.observations } : { toolCalls: run.events?.length || 0 }),
      });
    }
  }
  return rows.sort((a, b) => b.startedAt - a.startedAt || a.id.localeCompare(b.id));
}

/** Read-only presentation shared by Run and Monitor. Never merges operational checks into signed Jobs. */
export function agentHistory(runtime: Pick<Window, "document" | "fetch"> & { location?: Pick<Location, "pathname" | "search" | "hash">; history?: Pick<History, "replaceState">; agentActionJourney?: Window["agentActionJourney"] }, project = executionRecords) {
  const doc = runtime.document;
  const node = (tag: string, text = "", css = "") => { const el = doc.createElement(tag); el.textContent = text; if (css) el.className = css; return el; };
  const when = (v: string | number | undefined) => v ? new Date(v).toLocaleString() : "Not yet";
  const link = (title: string, tenant: string, page: string, hash: string) => { const a = node("a", title) as HTMLAnchorElement; a.href = `${page}?workspace=${encodeURIComponent(tenant)}#${hash}`; return a; };
  async function read(tenant: string, source: "agents" | "automations"): Promise<any | null> {
    try {
      const response = await runtime.fetch(`/api/${source}/${encodeURIComponent(tenant)}/state`, { cache: "no-store", credentials: "same-origin", redirect: "error" });
      if (!response.ok) return null;
      const value = await response.json();
      const agents = source === "agents" ? value?.agents : value?.jobs;
      const records = (list: unknown): list is Record<string, any>[] => Array.isArray(list) && list.every(item => item && typeof item === "object" && !Array.isArray(item));
      return records(agents) && records(value?.runs) && agents.every(a => typeof a.id === "string" && typeof a.title === "string") && value.runs.every((r: any) => typeof r.id === "string" && typeof r.status === "string" && ["string", "number"].includes(typeof r.startedAt) && Number.isFinite(new Date(r.startedAt).getTime())) ? value : null;
    } catch { return null; }
  }
  function appendEvaluation(parent: HTMLElement, run: { contract?: HostedContract; evaluation?: HostedEvaluation }) {
    if (!run.contract) { parent.append(node('p', 'No bound evaluation. This run has no frozen hosted contract.', 'note')); return; }
    const { intent, binding } = run.contract, evaluation = run.evaluation;
    const detail = node('details') as HTMLDetailsElement; detail.dataset.hostedEvaluation = intent.job_id; detail.open=Boolean(binding.specification.rubrics?.length);
    const result = evaluation ? evaluation.status.replaceAll('_',' ') : 'pending';
    detail.append(node('summary', `Contract & evaluation · ${result}`), node('p', `Contract: ${intent.intent_id}`), node('p', `Profile: ${intent.profile}`), node('p', `Contract digest: ${intent.intent_digest}`, 'note'), node('p', `Profile digest: ${intent.profile_digest}`, 'note'));
    if (binding.recipe) detail.append(node('p', `Agent template: ${binding.recipe.id} · v${binding.recipe.version}`));
    detail.append(node('p', 'All checks are required. Outcome rubrics are AI assessments of the answer and tool evidence, not independent verification. Runtime records establish recorded execution; provider-reported fields are not independently verified. This is a hosted evaluation, not a signed gateway receipt.', 'note'));
    if (evaluation) {
      detail.append(node('p', `Evidence digest: ${evaluation.evidence_digest}`, 'note'), node('p', `Recorded source digest: ${evaluation.source_digest}`, 'note'));
      for (const c of evaluation.criteria) {
        const item = node('div', '', 'evaluation-criterion');
        item.append(node('strong', `${c.label} · ${c.status.replaceAll('_',' ')}`), node('p', c.reason, 'note'), node('p', `Evidence: ${c.evidence} · ${c.trust.replaceAll('_',' ')}`, 'note'));
        const rubric=binding.specification.rubrics?.find(r=>r.id===c.id);
        if(rubric) {
          item.append(node('p',`Pass threshold / rule: ${rubric.criterion}`,'note'));
          if(rubric.measurement)item.append(node('p',`How measured: ${rubric.measurement.method}`,'note'),node('p',`Evidence used: ${rubric.measurement.evidence}`,'note'));
          item.append(node('p',`Observed measurement: ${c.observed || 'Unavailable; no measurement was recorded.'}`,'note'));
        }
        const raw = [...evaluation.receipt.outcomes,...evaluation.receipt.constraints].find(r => r.predicate_id === c.id);
        if (raw && !rubric && c.status !== 'insufficient_evidence') item.append(node('pre', JSON.stringify({expected:raw.expected,actual:raw.actual},null,2)));
        detail.append(item);
      }
    } else {
      detail.append(node('p', 'Evaluation will be recorded when this run ends. No pass is implied while work is pending.', 'note'));
      for (const c of [...intent.required_outcomes,...intent.hard_constraints]) detail.append(node('p', c.description || c.id));
    }
    const contract = node('details'); contract.append(node('summary','Inspect frozen contract'),node('pre',JSON.stringify(run.contract,null,2))); detail.append(contract); parent.append(detail);
  }
  function appendAgents(parent: HTMLElement, data: any, tenant: string) {
    if (!data) { parent.append(node("p", "Recurring agents are unavailable. Refresh to retry.", "history-error")); return; }
    for (const job of data.jobs) {
      const card = node("article", "", "card history-card"); card.dataset.recurringAgent = job.id;
      const last = data.runs.filter((r: any) => r.jobId === job.id).at(-1);
      card.append(node("span", `Recurring · ${job.status}`, "pill"), node("h3", job.title), node("p", `${job.health || "Unknown"}${job.stale ? " · stale: recent coverage is unknown" : ""}`), node("p", `Every ${job.intervalMinutes} minutes · Last check ${when(job.lastRun)} · Next check ${job.status === "active" ? when(job.nextRun) : "Not scheduled"}`, "note"));
      card.append(node("p", last?.summary || "No checks recorded yet."), link("Schedule and findings →", tenant, "/automations", "agents"));
      parent.append(card);
    }
  }
  function appendRuns(parent: HTMLElement, data: any, tenant: string, recurring = true) {
    if (!data) { parent.append(node("p", `${recurring ? "Recurring" : "Supervised"} run history is unavailable. Refresh to retry.`, "history-error")); return; }
    for (const run of data.runs) {
      const agent = (recurring ? data.jobs : data.agents).find((a: any) => a.id === (recurring ? run.jobId : run.agentId));
      const card = node("article", "", "card run history-card"); card.dataset.runAt = String(new Date(run.startedAt).getTime());
      card.dataset.runAgent = `${recurring?'recurring':'supervised'}:${recurring?run.jobId:run.agentId}`;
      card.dataset.runTitle = agent?.title || 'Agent run';
      card.dataset.runStatus = run.status.replaceAll('_',' ');
      card.append(node("h3", agent?.title || "Agent run"), node("span", `${recurring ? "Recurring check" : "Supervised run"} · ${run.status.replaceAll("_", " ")}`, "pill"), node("p", `${when(run.startedAt)} · ${run.kind}${recurring ? ` · ${run.findings} findings` : ""}`, "note"), node("p", run.summary || "Result not yet available."));
      if (recurring && run.status !== "completed") card.append(node("p", "Check coverage is unknown; this run does not establish that the target is healthy.", "note"));
      if (!recurring) appendEvaluation(card, run);
      if (!recurring && run.outcome) card.append(node("p", `AI-assessed outcome: ${run.outcome.replaceAll("_", " ")}.`, "note"));
      card.append(link(recurring ? "View findings and check history →" : "Review run and approvals →", tenant, recurring ? "/automations" : "/agents", recurring ? "findings" : "run"));
      parent.append(card);
    }
  }
  function sortRuns(parent: HTMLElement, limit = 40, selected = "") {
    const cards = Array.from(parent.children).filter(el => (el as HTMLElement).dataset.runAt !== undefined) as HTMLElement[];
    cards.sort((a, b) => Number(b.dataset.runAt) - Number(a.dataset.runAt));
    const priority=cards.filter(card=>card.dataset.pendingApproval==='true'||card.dataset.activeRun==='true');
    const historical=cards.filter(card=>!priority.includes(card)),seen=new Set<string>();
    const retained=historical.filter((card,index)=>{const key=card.dataset.runAgent || 'unknown',latest=!seen.has(key);seen.add(key);return index<limit||latest||card.dataset.supervisedRun===selected;});
    for(const card of cards)card.remove();
    if(priority.length) {
      const attention=node('section');attention.dataset.runAttention='';
      attention.append(node('h3','Current runs & approvals'),...priority.sort((a,b)=>Number(b.dataset.pendingApproval==='true')-Number(a.dataset.pendingApproval==='true')));
      parent.append(attention);
    }
    if(retained.length)parent.append(node('h3','Run history'));
    const groups=new Map<string,HTMLElement[]>();
    for(const card of retained){const key=card.dataset.runAgent || 'unknown';groups.set(key,[...(groups.get(key)||[]),card]);}
    for(const [key,rows] of groups) {
      const group=node('details','','run-history-group');group.dataset.runGroup=key;
      const latest=rows[0];
      group.append(node('summary',`${latest.dataset.runTitle || 'Agent runs'} · ${rows.length} run${rows.length===1?'':'s'} · Latest: ${latest.dataset.runStatus || 'unknown'} · ${when(Number(latest.dataset.runAt))}`),...rows);
      parent.append(group);
    }
  }
  const panels = {
    activity: doc.querySelector<HTMLElement>("[data-hosted-history]"),
    jobs: doc.querySelector<HTMLElement>("[data-hosted-jobs]"),
    evals: doc.querySelector<HTMLElement>("[data-hosted-evals]"),
  };
  type View = "activity" | "jobs";
  const generations = { activity: 0, jobs: 0, evals: 0 };
  function clearMonitor(demo = false) {
    for (const view of ["activity", "jobs", "evals"] as const) {
      generations[view]++;
      const panel = panels[view]; if (panel) { panel.replaceChildren(); panel.hidden = demo; }
    }
  }
  function button(text: string, action: () => void) {
    const b = node("button", text, "text-button") as HTMLButtonElement;
    b.type = "button"; b.onclick = action; return b;
  }
  const duration = (ms?: number) => ms === undefined ? "—" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
  const status = (row: HostedExecution) => {
    if (row.status === 'cancelled') return 'Cancelled';
    if (row.approvalPending) return 'Awaiting your approval';
    if (row.status === 'awaiting_approval') return 'Proposal unavailable';
    if (row.status === 'planning') return 'Preparing next action';
    if (row.status === 'executing') return 'Executing approved action';
    if (row.status === 'failed') return 'Execution failed';
    if (row.evaluation?.status === 'insufficient_evidence') return 'Insufficient evidence';
    if (row.evaluation?.status === 'fail') return 'Checks failed';
    if (row.outcome === 'not_met') return 'Outcome not met';
    if (row.outcome === 'uncertain') return 'Outcome uncertain';
    return row.status.replaceAll('_', ' ') + (row.findings ? ` · ${row.findings} findings` : '');
  };
  function runLink(row: HostedExecution, tenant: string) {
    const a = node('a', row.approvalPending ? 'Review action →' : 'View run →') as HTMLAnchorElement;
    a.href = `/agents?workspace=${encodeURIComponent(tenant)}&${row.approvalPending ? 'approval' : 'run'}=${encodeURIComponent(row.runId)}#${row.approvalPending ? 'approvals' : 'run'}`;
    return a;
  }
  function jobLink(row: HostedExecution, tenant: string) {
    const a = node("a", "View job →") as HTMLAnchorElement;
    a.href = `/?workspace=${encodeURIComponent(tenant)}&execution=${encodeURIComponent(row.id)}#jobs`; return a;
  }
  function runTable(rows: HostedExecution[], parent: HTMLElement, tenant: string, jobs: boolean, selected = "") {
    let page = 0;
    const size = 10, host = node("div", "", "execution-history"); parent.append(host);
    function draw() {
      host.replaceChildren();
      if (!rows.length) { host.append(node("p", "No executions match these filters.", "empty")); return; }
      const wrap = node("div", "", "execution-table-wrap"), table = node("table", "", "execution-table");
      table.append(node("caption", jobs ? "Hosted execution jobs" : "Execution history"));
      const head = node("thead"), headers = node("tr");
      for (const label of ["Time / agent", "Result", "Duration", "Summary", jobs ? "Evidence / detail" : "Job"]) { const th = node("th", label); th.setAttribute("scope", "col"); headers.append(th); }
      head.append(headers); table.append(head);
      const body = node("tbody");
      for (const row of rows.slice(page * size, (page + 1) * size)) {
        const tr = node("tr"); tr.dataset.executionId = row.id; tr.dataset.attention = String(row.attention);
        const identity = node("td"); identity.append(node("strong", row.agent), node("span", when(row.startedAt), "execution-meta"), node("span", `${row.source} · ${row.kind}`, "execution-meta"));
        const result = node("td"); result.append(node("span", status(row), "execution-status"));
        if (row.approvalPending) result.append(runLink(row, tenant));
        if (row.contract) result.append(node("span", `Measured checks: ${row.evaluation?.status.replaceAll("_", " ") || "pending"}`, "execution-meta"));
        if (row.outcome) result.append(node("span", `AI assessment: ${row.outcome.replaceAll("_", " ")}`, "execution-meta"));
        const summary = node("td", row.summary, "execution-summary");
        const detail = node("td");
        if (jobs) {
          const disclosure = node("details") as HTMLDetailsElement; disclosure.dataset.jobDetail = row.id; disclosure.open = selected === row.id;
          disclosure.append(node("summary", "Details"), node("p", `Job ID: ${row.id}`), node("p", `Evidence: ${row.evidence}. No signed gateway receipt is attached to this record.`));
          disclosure.append(node("p", `Started: ${when(row.startedAt)} · Finished: ${when(row.finishedAt)}`));
          if (row.source === "supervised") appendEvaluation(disclosure, row);
          if (row.evidenceDigest) disclosure.append(node("p", `Recorded result digest: ${row.evidenceDigest}`));
          if (row.observations) disclosure.append(node("pre", JSON.stringify(row.observations, null, 2)));
          if (row.toolCalls !== undefined) disclosure.append(node("p", `${row.toolCalls} recorded tool calls`));
          if (row.reason) disclosure.append(node("p", `AI assessment reason: ${row.reason}`));
          if (row.source === "recurring" && row.status !== "completed") disclosure.append(node("p", "Coverage is unknown; this execution does not establish that the target is healthy."));
          disclosure.append(row.source === "recurring" ? link("Schedule and findings →", tenant, "/automations", "findings") : runLink(row, tenant));
          detail.append(node("span", row.evidence, "execution-meta"), disclosure);
        } else detail.append(jobLink(row, tenant));
        tr.append(identity, result, node("td", duration(row.durationMs)), summary, detail); body.append(tr);
      }
      table.append(body); wrap.append(table); host.append(wrap);
      const paging = node("div", "", "execution-paging");
      const previous = button("Previous", () => { page--; draw(); }); previous.disabled = page === 0;
      const next = button("Next", () => { page++; draw(); }); next.disabled = (page + 1) * size >= rows.length;
      paging.append(previous, node("span", `${page * size + 1}–${Math.min((page + 1) * size, rows.length)} of ${rows.length} executions`), next); host.append(paging);
    }
    draw();
  }
  async function load(view: View, tenant: string, demo: boolean, selected = "") {
    const panel = panels[view]; if (!panel) return;
    const current = ++generations[view]; panel.replaceChildren(); panel.hidden = demo; if (demo) return;
    if (!tenant) { panel.append(node("p", "Select a workspace to see executions.")); return; }
    panel.append(node("p", "Loading executions…", "note"));
    const [supervised, recurring] = await Promise.all([read(tenant, "agents"), read(tenant, "automations")]);
    if (current !== generations[view]) return;
    panel.replaceChildren();
    const heading = node("div", "", "section-heading");
    heading.append(node("h3", view === "jobs" ? "Hosted execution jobs" : "Agents at a glance"), button(view === "jobs" ? "Refresh hosted jobs" : "Refresh agent runs", () => { void load(view, tenant, demo, selected); })); panel.append(heading);
    panel.append(node("p", "Saved history: up to 40 supervised and 80 recurring executions per workspace. Refresh reads saved results; it does not run an agent.", "note"));
    const failures: string[] = [];
    if (!supervised) failures.push("Supervised execution history is unavailable.");
    if (!recurring) failures.push("Recurring execution history is unavailable.");
    if (failures.length) { const error = node("p", failures.join(" ") + " Refresh to retry; coverage is incomplete.", "history-error"); error.setAttribute("role", "status"); panel.append(error); }
    const rows = project(supervised, recurring);
    runtime.agentActionJourney?.setApprovalCount(tenant, supervised ? rows.filter(r => r.approvalPending).length : null);
    const agents = [
      ...(supervised?.agents || []).map((a: any) => ({ ...a, key: `supervised:${a.id}`, source: "supervised" })),
      ...(recurring?.jobs || []).map((a: any) => ({ ...a, key: `recurring:${a.id}`, source: "recurring" })),
    ];
    for (const row of rows) if (!agents.some(a => a.key === row.agentKey)) agents.push({ key: row.agentKey, title: row.agent, source: row.source, status: "unknown" });
    const controls = node("div", "", "execution-controls");
    function select(label: string, options: [string, string][]) {
      const field = node("label", label), input = doc.createElement("select"); input.setAttribute("aria-label", label);
      for (const [value, text] of options) { const option = node("option", text) as HTMLOptionElement; option.value = value; input.append(option); }
      field.append(input); controls.append(field); return input;
    }
    const mode = select("Layout", [["grouped", "By agent"], ["list", "All executions"]]); mode.parentElement!.hidden = view === "jobs";
    const agentFilter = select("Hosted agent", [["", "All agents"], ...agents.map((a: any): [string, string] => [a.key, `${a.title} (${a.source})`])]);
    const resultFilter = select("Execution status", [["", "All results"], ["attention", "Needs attention"], ["completed", "Completed"], ["awaiting_approval", "Awaiting approval"], ["running", "In progress"], ["partial", "Partial"], ["failed", "Failed"], ["interrupted", "Interrupted"], ["cancelled", "Cancelled"]]);
    const searchLabel = node("label", "Exact hosted job ID"), exact = doc.createElement("input"); exact.value = selected; exact.setAttribute("aria-label", "Exact hosted job ID"); exact.maxLength = 200; searchLabel.append(exact); searchLabel.hidden = view !== "jobs"; controls.append(searchLabel);
    panel.append(controls);
    const content = node("div"); content.dataset.hostedRuns = ""; panel.append(content);
    function matches(row: HostedExecution) {
      return (!agentFilter.value || row.agentKey === agentFilter.value) && (!exact.value.trim() || row.id === exact.value.trim()) && (!resultFilter.value || (resultFilter.value === "attention" ? row.attention : resultFilter.value === "running" ? ["running", "planning", "executing"].includes(row.status) : row.status === resultFilter.value));
    }
    function render() {
      content.replaceChildren();
      const filtered = rows.filter(matches);
      if (!rows.length && !agents.length && !failures.length) { content.append(node("p", "No executions recorded yet. Create an agent and run a baseline or trial.", "empty")); return; }
      if (view === "jobs" || mode.value === "list") { runTable(filtered, content, tenant, view === "jobs", exact.value.trim()); return; }
      const visible = agents.filter(a => (!agentFilter.value || a.key === agentFilter.value) && (!resultFilter.value || filtered.some(r => r.agentKey === a.key)));
      if (!visible.length) { content.append(node("p", "No agents match these filters.", "empty")); return; }
      const groups = visible.map(a => {
        const history = rows.filter(r => r.agentKey === a.key), latest = history[0];
        const pending = history.find(r => r.approvalPending);
        return { a, latest, pending, attention: Boolean(pending || a.stale || a.health === "findings" || latest?.attention || (a.status === "active" && a.health === "unknown")) };
      }).sort((a, b) => Number(b.attention) - Number(a.attention) || a.a.title.localeCompare(b.a.title));
      const header = node("div", "", "agent-group-columns"); header.setAttribute("aria-hidden", "true");
      for (const name of ["Agent", "Status", "Last execution", "Next execution", "Findings"]) header.append(node("span", name)); content.append(header);
      for (const { a, latest, pending, attention } of groups) {
        const group = node("details", "", "agent-group") as HTMLDetailsElement; group.dataset.agentKey = a.key; group.dataset.attention = String(attention);
        const summary = node("summary", "", "agent-group-columns");
        const title = node("span"); title.append(node("strong", a.title), node("small", `${a.source} · ${a.status}`, "execution-meta"));
        const health = pending ? "Awaiting your approval" : a.stale || a.health === "unknown" ? "Coverage unknown" : latest ? status(latest) : attention ? "Needs attention" : "Not run yet";
        for (const [label, value] of [["Agent", title], ["Status", health], ["Last execution", when(latest?.startedAt)], ["Next execution", a.status === "active" ? when(a.nextRun) : "Not scheduled"], ["Findings", latest?.findings === undefined ? "—" : String(latest.findings)]] as const) {
          const cell = node("span"); cell.dataset.label = label; typeof value === "string" ? cell.append(node("span", value)) : cell.append(value); if (label === "Status" && pending) cell.append(runLink(pending, tenant)); summary.append(cell);
        }
        group.append(summary);
        const inner = node("div", "", "agent-group-history");
        if (a.stale) inner.append(node("p", "The latest check is stale; current coverage is unknown.", "history-error"));
        if (pending) inner.append(runLink(pending, tenant));
        runTable(filtered.filter(r => r.agentKey === a.key), inner, tenant, false);
        group.append(inner); content.append(group);
      }
    }
    for (const input of [mode, agentFilter, resultFilter]) input.onchange = render;
    function selectionChanged() {
      selected = exact.value.trim();
      if (view === "jobs" && runtime.location && runtime.history) {
        const query = new URLSearchParams(runtime.location.search);
        if (selected) query.set("execution", selected); else query.delete("execution");
        query.set("workspace", tenant);
        runtime.history.replaceState(null, "", `${runtime.location.pathname || "/"}?${query}#jobs`);
      }
      render();
    }
    exact.oninput = selectionChanged;
    controls.append(button("Clear filters", () => { agentFilter.value = ""; resultFilter.value = ""; exact.value = ""; selectionChanged(); }));
    render();
  }
  async function loadEvals(tenant: string, demo: boolean) {
    const panel = panels.evals; if (!panel) return;
    const current = ++generations.evals; panel.replaceChildren(); panel.hidden = demo; if (demo || !tenant) return;
    panel.append(node('p', 'Loading hosted recipe evaluations…', 'note'));
    const data = await read(tenant, 'agents'); if (current !== generations.evals) return;
    panel.replaceChildren(); panel.append(node('h3','Hosted agent evaluations'),node('p','These definitions are bound automatically from Create. External-agent routing below applies to gateway Jobs.', 'note'));
    if (!data) { panel.append(node('p','Hosted agent evaluations are unavailable. Refresh to retry.','history-error')); return; }
    const agents = data.agents.filter((a: any) => a.evaluationBinding);
    for (const agent of agents) {
      const binding = agent.evaluationBinding, card = node('article','','card history-card');
      card.append(node('h4',agent.title),node('p',`Profile: ${binding.profile.profile}.${binding.profile.version}`),node('p',`Profile digest: ${binding.profile.profile_digest}`,'note'));
      for (const c of [...binding.profile.required_outcomes,...binding.profile.hard_constraints]) card.append(node('p',c.description || c.id,'note'));
      const run = data.runs.filter((r: any) => r.agentId === agent.id).sort((a: any,b: any) => b.startedAt.localeCompare(a.startedAt))[0];
      if (run) { appendEvaluation(card,run); const url = link('Inspect latest job →',tenant,'/','jobs'); url.href = `/?workspace=${encodeURIComponent(tenant)}&execution=${encodeURIComponent('supervised:'+run.id)}#jobs`; card.append(url); }
      else card.append(node('p','No run yet. The first contract is issued before planning starts.','note'));
      panel.append(card);
    }
    if (!agents.length) panel.append(node('p','No hosted agents have bound evaluations yet. Enable measurable checks in Create.','note'));
    panel.append(link('Build or revise an agent →',tenant,'/agents','create'));
  }
  return { read, appendAgents, appendRuns, appendEvaluation, sortRuns, clearMonitor, loadEvals,
    loadMonitor: (tenant: string, demo: boolean) => load("activity", tenant, demo),
    loadJobs: (tenant: string, demo: boolean, selected = "") => load("jobs", tenant, demo, selected),
  };
}
export const HISTORY_FACTORY_JS = `(runtime) => (${agentHistory.toString()})(runtime, ${executionRecords.toString()})`;

export const HISTORY_CSS = `.evaluation-criterion{border-top:1px solid #cbd0c4;padding:12px 0}.evaluation-criterion pre{max-width:100%;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}.history-card{border:1px solid #cbd0c4;background:#fff;padding:20px;margin:12px 0;min-width:0;overflow-wrap:anywhere}.history-card h3{margin:8px 0}.history-card p{margin:8px 0}.history-card .note{font-size:14px;color:#596150}.history-error{padding:12px;border-left:4px solid #ad4135;background:#f7e9e6}.hosted-history{margin-bottom:32px}.hosted-history .section-heading{gap:16px;flex-wrap:wrap}`;

export const EXECUTION_CSS = `
.execution-controls{display:flex;align-items:end;gap:12px;flex-wrap:wrap;margin:20px 0}.execution-controls label{display:flex;flex-direction:column;gap:6px;margin:0;min-width:150px;font-size:13px}.execution-controls select,.execution-controls input{font:inherit;padding:10px;max-width:100%;border:1px solid #bac3af;background:white;color:inherit}.execution-controls button{align-self:end}.execution-meta{display:block;font-size:12px;color:#596150;margin-top:4px}.agent-group-columns{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr) minmax(0,1.3fr) minmax(0,1.3fr) 70px;gap:14px;align-items:center;padding:14px}.agent-group-columns>span{min-width:0;overflow-wrap:anywhere}.agent-group-columns[aria-hidden]{font-size:12px;text-transform:uppercase;color:#596150;border-bottom:1px solid #cbd0c4}.agent-group{margin:0;border-bottom:1px solid #cbd0c4;background:white}.agent-group summary{cursor:pointer;list-style:none;font-size:14px;font-weight:400}.agent-group summary strong:before{content:'▸ ';color:#596150}.agent-group[open] summary strong:before{content:'▾ '}.agent-group[data-attention=true]{border-left:3px solid #aa6f13}.agent-group[open]{background:#f7f9f2}.agent-group-history{padding:0 14px 14px}.execution-table-wrap{max-width:100%;overflow-x:auto}.execution-table{border-collapse:collapse;width:100%;font-size:13px;text-align:left;table-layout:fixed}.execution-table caption{text-align:left;font-weight:600;padding:12px 0}.execution-table th{font-size:11px;text-transform:uppercase;color:#596150}.execution-table th,.execution-table td{padding:12px 10px;border-bottom:1px solid #d6dccf;vertical-align:top;overflow-wrap:anywhere}.execution-table th:nth-child(1){width:24%}.execution-table th:nth-child(2){width:17%}.execution-table th:nth-child(3){width:9%}.execution-table th:nth-child(4){width:30%}.execution-table th:nth-child(5){width:20%}.execution-table tr[data-attention=true] .execution-status{color:#88540b;font-weight:700}.execution-table details{margin:8px 0}.execution-table pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;max-height:200px;overflow:auto}.execution-paging{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:12px;margin:12px 0}.execution-paging button:disabled{opacity:.4;cursor:default}.agent-group summary:focus-visible{outline:3px solid #789832;outline-offset:-3px}
@media(max-width:650px){.execution-controls{align-items:stretch}.execution-controls label{min-width:0;flex:1 1 140px}.execution-table{min-width:650px}.agent-group-columns[aria-hidden]{display:none}.agent-group summary{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.agent-group summary>span:first-child{grid-column:1/-1}.agent-group summary>span:not(:first-child):before{content:attr(data-label);display:block;font-size:10px;text-transform:uppercase;color:#596150;margin-bottom:4px}.agent-group-history{padding:0 10px 12px}.execution-paging{flex-wrap:wrap}}
`;
