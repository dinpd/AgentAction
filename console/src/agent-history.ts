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

export type RunCheck = { id: string; label: string; status: "pass" | "fail" | "not_measured" | "pending"; trust: "runtime_recorded" | "provider_reported" | "ai_assessed"; reason: string };
export type RunResult = {
  execution: string; verdict: "met" | "not_met" | "undetermined" | "pending" | "not_evaluated";
  label: string; statement: string; reason: string; activity: string; checks: RunCheck[];
  /** One label for a list row, and the line under it: the outcome once the run finished, otherwise how the run ended or where it stands. */
  headline: string; support: string;
};
export type RunView = {
  status: string; outcome?: string; reason?: string; summary?: string; toolCalls?: number;
  events?: Array<{ tool?: string; source?: { tool?: string }; status?: string }>;
  contract?: HostedContract; evaluation?: Partial<HostedEvaluation>;
  research?: { checks?: Array<{ label: string; status: string; observed: string }>; delivery?: { status?: string } };
};
/**
 * Plain-language reading of one supervised run: what it did, whether it worked and why.
 * A projection of the stored record that never alters evidence; the unchanged record stays
 * under Audit details. Self-contained because it is serialized into the page.
 */
export function runResult(run: RunView): RunResult {
  const [execution, phrase, terminal = false] = ({
    completed: ["Run finished", "finished", true], failed: ["Run failed", "failed", true], partial: ["Run partly finished", "finished only partly", true],
    interrupted: ["Run interrupted", "was interrupted", true], cancelled: ["Run cancelled", "was cancelled", true],
    awaiting_approval: ["Waiting for approval", "is waiting for approval"], planning: ["Preparing next action", "is preparing its next action"],
    executing: ["Executing approved action", "is executing an approved action"],
  } as Record<string, [string, string, boolean?]>)[run.status] || [run.status.replaceAll("_", " "), `is ${run.status.replaceAll("_", " ")}`];
  const events = Array.isArray(run.events) ? run.events : undefined, calls = events ? events.length : run.toolCalls;
  let activity = calls === undefined ? "" : calls ? `${calls} recorded tool call${calls === 1 ? "" : "s"}` : terminal ? "No tool was called." : "No tool has been called yet.";
  if (events?.length) {
    const tools = new Map<string, number>();
    for (const e of events) { const name = e.source?.tool || e.tool || "unknown tool"; tools.set(name, (tools.get(name) || 0) + 1); }
    const count = (status: string[]) => events.filter(e => status.includes(e.status || "")).length;
    const ok = count(["succeeded"]), failed = count(["failed"]), open = events.length - ok - failed;
    activity += `: ${[...tools].map(([name, n]) => n > 1 ? `${name} ×${n}` : name).join(", ")}. ` + (ok === events.length ? (ok === 1 ? "It succeeded." : "All succeeded.")
      : [`${ok} succeeded`, ...(failed ? [`${failed} failed`] : []), ...(open ? [`${open} with an unknown result`] : [])].join(", ") + ".");
  } else if (calls) activity += ".";

  const spec = run.contract?.binding?.specification, intent = run.contract?.intent, bindings = run.contract?.binding?.tool_bindings;
  const receipt = run.evaluation?.receipt, measured = receipt ? [...receipt.outcomes, ...receipt.constraints] : [];
  const show = (value: unknown) => typeof value === "string" ? `“${value}”` : JSON.stringify(value);
  const trustOf = (id: string): RunCheck["trust"] => spec?.rubrics?.some(r => r.id === id) ? "ai_assessed" : spec?.checks.find(c => c.id === id)?.kind === "result_field" ? "provider_reported" : "runtime_recorded";
  const checks: RunCheck[] = [];
  for (const c of run.evaluation?.criteria || []) {
    const check = spec?.checks.find(k => k.id === c.id), rubric = spec?.rubrics?.find(k => k.id === c.id), raw = measured.find(r => r.predicate_id === c.id);
    const pass = c.status === "pass", tool = check ? bindings?.[check.tool]?.tool || check.tool : "";
    let reason: string;
    if (c.status === "insufficient_evidence") {
      // The evaluator's own sentence for a missing measurement names no cause; say what was missing and what to do.
      if (rubric) reason = (c.reason !== "The required evidence is missing, incomplete or unavailable." ? c.reason
        : run.status !== "completed" ? `The run ${phrase}, so the AI assessment was skipped.`
        : events && !events.length ? "No tool call was recorded, so there was nothing to assess."
        : events?.some(e => e.status !== "succeeded") ? "A tool call did not succeed, so the AI assessment was skipped."
        : "The AI assessment was skipped or returned nothing usable; a tool result may have been an error or truncated.") + " Check the tool calls, then run another trial.";
      else if (check?.kind === "result_field") reason = `${tool} did not return a usable “${check.path}” value in its structured result. Check that call; if the tool never returns this field, change the check in Create.`;
      else if (check?.kind === "tool_succeeded") reason = `A call to ${tool} was interrupted, so its result is unknown. Confirm with the provider whether it took effect before running again.`;
      else reason = "The runtime did not record the evidence this check needs. Run another trial; if it repeats, revise the check in Create.";
    }
    else if (rubric) reason = c.reason + (c.observed ? ` Measured: ${c.observed}` : "");
    else if (c.id === "run_completed") reason = pass ? "" : `The run ${phrase}.`;
    else if (c.id === "successful_call") reason = pass ? (raw ? `${show(raw.actual)} succeeded.` : "") : "No tool call succeeded.";
    else if (c.id === "budget") reason = !raw ? "" : pass ? `${show(raw.actual)} of ${show(raw.expected)} allowed calls used.` : `${show(raw.actual)} calls were made; the limit is ${show(raw.expected)}.`;
    else if (c.id === "scope") reason = pass ? "" : "A call used a tool or server outside the selected set.";
    else if (c.id === "approval") reason = pass ? "" : "At least one tool call has no recorded approval.";
    else if (check?.kind === "tool_succeeded") reason = pass ? "" : `${tool} was not called or did not succeed.`;
    else if (check?.kind === "tool_not_called") reason = pass ? "" : `${tool} was called.`;
    else if (check?.kind === "result_field" && raw) reason = check.operator === "exists" ? "" : pass ? `${tool} reported ${show(raw.actual)}.`
      : `Expected ${check.operator === "gte" ? "at least " : check.operator === "lte" ? "at most " : ""}${show(raw.expected)}; ${tool} reported ${show(raw.actual)}.`;
    else reason = raw && !pass ? `Expected ${show(raw.expected)}; recorded ${show(raw.actual)}.` : "";
    checks.push({ id: c.id, label: c.label, status: c.status === "insufficient_evidence" ? "not_measured" : c.status, trust: c.trust, reason });
  }
  if (!run.evaluation && intent) for (const p of [...intent.required_outcomes, ...intent.hard_constraints]) {
    checks.push({ id: p.id, label: p.description || p.id, status: terminal ? "not_measured" : "pending", trust: trustOf(p.id), reason: terminal ? "No evaluation was recorded for this run." : "" });
  }
  if (run.outcome) {
    const status = run.outcome === "met" ? "pass" : run.outcome === "not_met" ? "fail" : "not_measured", gap = run.research?.checks?.find(c => c.status !== "pass");
    checks.push(run.research
      ? { id: "outcome", label: "Research checks passed and the report was accepted for delivery", status, trust: "runtime_recorded",
          reason: status === "pass" ? "" : gap ? `${gap.label}: ${gap.observed}` : `Email delivery: ${run.research.delivery?.status || "not recorded"}.` }
      : { id: "outcome", label: "Goal met, in the agent’s own assessment", status, trust: "ai_assessed",
          reason: run.reason || (status !== "not_measured" ? "" : run.status === "completed" ? "The agent could not tell whether it met the goal." : `The run ${phrase} before the agent assessed its result.`) });
  }

  const failed = checks.filter(c => c.status === "fail"), unmeasured = checks.filter(c => c.status === "not_measured"), recorded = run.evaluation?.status;
  const verdict: RunResult["verdict"] = !terminal ? "pending" : failed.length || recorded === "fail" ? "not_met"
    : unmeasured.length || recorded === "insufficient_evidence" ? "undetermined" : checks.length || recorded === "pass" ? "met" : "not_evaluated";
  const noun = checks.length === 1 ? "check" : "checks", share = (list: RunCheck[]) => list.length ? `${list.length} of ${checks.length} ${noun}` : "its checks";
  const judged = verdict !== "pending" && verdict !== "not_evaluated", finished = run.status === "completed";
  const label = { met: "Outcome met", not_met: "Outcome not met", undetermined: "Outcome could not be determined", pending: "Not judged yet", not_evaluated: "Not evaluated" }[verdict];
  const turn = finished ? ", but" : " and", lead = verdict === "not_met" ? failed[0] : verdict === "undetermined" ? unmeasured[0] : undefined;
  return {
    execution, verdict, activity, checks, label,
    headline: finished && judged ? label : execution,
    support: !judged ? "" : [finished ? execution : label, ...(checks.length ? [`${checks.filter(c => c.status === "pass").length} of ${checks.length} ${noun} passed`] : [])].join(" · "),
    statement: verdict === "pending" ? `The run ${phrase}. The outcome is judged when the run ends.`
      : verdict === "not_evaluated" ? `The run ${phrase}. It has no checks or assessment, so the outcome was not judged.`
      : verdict === "met" ? `The run ${phrase} and ${checks.length > 1 ? `all ${checks.length} checks` : checks.length ? "its check" : "its checks"} passed.`
      : verdict === "not_met" ? `The run ${phrase}${turn} ${share(failed)} failed.`
      : `The run ${phrase}${turn} ${share(unmeasured)} could not be measured.`,
    reason: lead ? (lead.reason ? `${lead.label}: ${lead.reason}` : lead.label) : verdict === "met" ? run.reason || "" : "",
  };
}

/** Read-only presentation shared by Run and Monitor. Never merges operational checks into signed Jobs. */
export function agentHistory(runtime: Pick<Window, "document" | "fetch"> & { location?: Pick<Location, "pathname" | "search" | "hash">; history?: Pick<History, "replaceState">; agentActionJourney?: Window["agentActionJourney"] }, project = executionRecords, describe = runResult) {
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
  /**
   * The run's result in reading order: outcome, main reason and activity, then one line per check.
   * Identifiers, digests, raw measurements and the frozen contract follow, unchanged, under Audit details.
   */
  function appendResult(parent: HTMLElement, run: RunView, { audit = true, answer = false } = {}) {
    const result = describe(run), section = node('section', '', 'run-result'); section.dataset.runResult = result.verdict;
    const facts = node('dl', '', 'run-facts');
    const fact = (term: string, ...content: (HTMLElement | string)[]) => { const value = node('dd'); value.append(...content); facts.append(node('dt', term), value); };
    fact('Outcome', node('strong', result.label, 'run-verdict'), result.statement);
    if (result.reason) fact('Main reason', result.reason);
    if (result.activity) fact('What it did', result.activity);
    if (answer && run.summary) fact('Agent’s answer', run.summary);
    section.append(facts);
    if (result.checks.length) {
      const list = node('ul', '', 'run-checks'), passed = result.checks.filter(c => c.status === 'pass').length, rank = { fail: 0, not_measured: 1, pending: 2, pass: 3 };
      for (const c of [...result.checks].sort((a, b) => rank[a.status] - rank[b.status])) { // what needs attention reads first
        const item = node('li'); item.dataset.check = c.id; item.dataset.checkStatus = c.status;
        const [provenance, meaning] = { runtime_recorded: ['Runtime-recorded', 'Recorded by the runtime during this run.'], provider_reported: ['Provider-reported', 'Reported by the tool provider; not independently verified.'], ai_assessed: ['AI-assessed', 'An AI assessment of the answer and tool evidence; not independent verification.'] }[c.trust];
        const trust = node('span', provenance, 'check-trust'); trust.title = meaning;
        item.append(node('span', { pass: '✓ Passed', fail: '✕ Failed', not_measured: '– Not measured', pending: '… Pending' }[c.status], 'check-status'), node('strong', c.label), trust);
        if (c.reason) item.append(node('p', c.reason, 'note'));
        list.append(item);
      }
      section.append(node('h4', result.verdict === 'pending' ? `Checks · ${result.checks.length} required` : `Checks · ${passed} of ${result.checks.length} passed`), list);
    }
    if (audit) appendAudit(section, run);
    parent.append(section);
  }
  function appendAudit(parent: HTMLElement, run: { contract?: HostedContract; evaluation?: Partial<HostedEvaluation> }) {
    const detail = node('details', '', 'run-audit') as HTMLDetailsElement; detail.dataset.runAudit = '';
    detail.append(node('summary', 'Audit details')); parent.append(detail);
    if (!run.contract) { detail.append(node('p', 'No bound evaluation. This run has no frozen hosted contract.', 'note')); return; }
    const { intent, binding } = run.contract, evaluation = run.evaluation;
    detail.dataset.hostedEvaluation = intent.job_id;
    const result = evaluation?.status ? evaluation.status.replaceAll('_',' ') : 'pending';
    detail.append(node('p', `Contract & evaluation · ${result}`), node('p', `Contract: ${intent.intent_id}`), node('p', `Profile: ${intent.profile}`), node('p', `Contract digest: ${intent.intent_digest}`, 'note'), node('p', `Profile digest: ${intent.profile_digest}`, 'note'));
    if (binding.recipe) detail.append(node('p', `Agent template: ${binding.recipe.id} · v${binding.recipe.version}`));
    detail.append(node('p', 'All checks are required. Outcome rubrics are AI assessments of the answer and tool evidence, not independent verification. Runtime records establish recorded execution; provider-reported fields are not independently verified. This is a hosted evaluation, not a signed gateway receipt.', 'note'));
    if (evaluation?.criteria && evaluation.receipt) {
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
    } else if (!evaluation) {
      detail.append(node('p', 'Evaluation will be recorded when this run ends. No pass is implied while work is pending.', 'note'));
      for (const c of [...intent.required_outcomes,...intent.hard_constraints]) detail.append(node('p', c.description || c.id));
    }
    const contract = node('details'); contract.append(node('summary','Inspect frozen contract'),node('pre',JSON.stringify(run.contract,null,2))); detail.append(contract);
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
  function appendRuns(parent: HTMLElement, data: any, tenant: string) {
    if (!data) { parent.append(node("p", "Recurring run history is unavailable. Refresh to retry.", "history-error")); return; }
    for (const run of data.runs) {
      const agent = data.jobs.find((a: any) => a.id === run.jobId);
      const card = node("article", "", "card run history-card"); card.dataset.runAt = String(new Date(run.startedAt).getTime());
      card.dataset.runAgent = `recurring:${run.jobId}`;
      card.dataset.runTitle = agent?.title || 'Agent run';
      card.dataset.runStatus = run.status.replaceAll('_',' ');
      card.append(node("h3", agent?.title || "Agent run"), node("span", `Recurring check · ${run.status.replaceAll("_", " ")}`, "pill"), node("p", `${when(run.startedAt)} · ${run.kind} · ${run.findings} findings`, "note"), node("p", run.summary || "Result not yet available."));
      if (run.status !== "completed") card.append(node("p", "Check coverage is unknown; this run does not establish that the target is healthy.", "note"));
      card.append(link("View findings and check history →", tenant, "/automations", "findings"));
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
  /** Supervised rows read like the run detail; only an approval this member can act on is named here. Recurring checks have no outcome. */
  const outcomeOf = (row: HostedExecution) => row.source === 'supervised' ? describe(row) : undefined;
  const status = (row: HostedExecution, result = outcomeOf(row)) => {
    if (row.approvalPending) return 'Awaiting your approval';
    if (row.status === 'awaiting_approval') return 'Proposal unavailable';
    if (result) return result.headline;
    if (row.status === 'cancelled') return 'Cancelled';
    if (row.status === 'failed') return 'Execution failed';
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
        const outcome = outcomeOf(row), result = node("td"); result.append(node("span", status(row, outcome), "execution-status"));
        if (row.approvalPending) result.append(runLink(row, tenant));
        if (outcome?.support) result.append(node("span", outcome.support, "execution-meta"));
        const summary = node("td", row.summary, "execution-summary");
        const detail = node("td");
        if (jobs) {
          const disclosure = node("details") as HTMLDetailsElement; disclosure.dataset.jobDetail = row.id; disclosure.open = selected === row.id;
          disclosure.append(node("summary", "Details"), node("p", `Job ID: ${row.id}`), node("p", `Evidence: ${row.evidence}. No signed gateway receipt is attached to this record.`));
          disclosure.append(node("p", `Started: ${when(row.startedAt)} · Finished: ${when(row.finishedAt)}`));
          if (row.source === "supervised") appendResult(disclosure, row);
          if (row.evidenceDigest) disclosure.append(node("p", `Recorded result digest: ${row.evidenceDigest}`));
          if (row.observations) disclosure.append(node("pre", JSON.stringify(row.observations, null, 2)));
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
      if (run) { appendResult(card,run); const url = link('Inspect latest job →',tenant,'/','jobs'); url.href = `/?workspace=${encodeURIComponent(tenant)}&execution=${encodeURIComponent('supervised:'+run.id)}#jobs`; card.append(url); }
      else card.append(node('p','No run yet. The first contract is issued before planning starts.','note'));
      panel.append(card);
    }
    if (!agents.length) panel.append(node('p','No hosted agents have bound evaluations yet. Enable measurable checks in Create.','note'));
    panel.append(link('Build or revise an agent →',tenant,'/agents','create'));
  }
  return { read, appendAgents, appendRuns, appendResult, describe, sortRuns, clearMonitor, loadEvals,
    loadMonitor: (tenant: string, demo: boolean) => load("activity", tenant, demo),
    loadJobs: (tenant: string, demo: boolean, selected = "") => load("jobs", tenant, demo, selected),
  };
}
export const HISTORY_FACTORY_JS = `(runtime) => (${agentHistory.toString()})(runtime, ${executionRecords.toString()}, ${runResult.toString()})`;

export const HISTORY_CSS = `.run-result{border:1px solid #cbd0c4;border-left:4px solid #8a9180;background:#fafbf7;padding:16px;margin:12px 0;min-width:0;overflow-wrap:anywhere}.run-result[data-run-result=met]{border-left-color:#3c7a52}.run-result[data-run-result=not_met]{border-left-color:#ad4135}.run-result[data-run-result=undetermined]{border-left-color:#aa6f13}.run-facts{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:10px 16px;margin:0}.run-facts,.run-facts dt,.run-facts dd{border:0}.run-facts dt{font-size:12px;font-weight:400;text-transform:uppercase;color:#596150;padding-top:3px}.run-facts dd{margin:0;min-width:0;font-size:15px;font-weight:400}.run-verdict{display:inline-block;padding:2px 8px;margin-right:8px;background:#eef0ea}[data-run-result=met] .run-verdict{background:#d3e8d8;color:#173c28}[data-run-result=not_met] .run-verdict{background:#f7e9e6;color:#782e25}[data-run-result=undetermined] .run-verdict{background:#f6ecd6;color:#6b4208}.run-result h4{margin:16px 0 0;font-size:13px;text-transform:uppercase;color:#596150}.run-checks{list-style:none;margin:8px 0 0;padding:0}.run-checks li{display:grid;grid-template-columns:118px minmax(0,1fr) max-content;gap:4px 12px;align-items:baseline;padding:10px 0;border-top:1px solid #d6dccf;font-size:15px}.run-checks li p{grid-column:2/-1;margin:0}.check-status{font-size:12px;font-weight:700;text-transform:uppercase;white-space:nowrap}[data-check-status=pass] .check-status{color:#24633c}[data-check-status=fail] .check-status{color:#8f2f24}[data-check-status=not_measured] .check-status{color:#88540b}[data-check-status=pending] .check-status{color:#596150}.check-trust{font-size:12px;color:#596150;border:1px solid #cbd0c4;padding:1px 6px;white-space:nowrap;justify-self:start}.run-heading .pill{background:#eef0ea;align-self:flex-start;white-space:nowrap}.run-audit{margin-top:12px;border-top:1px solid #d6dccf;padding-top:12px}.execution-table .run-result{padding:10px}.execution-table .run-facts dd,.execution-table .run-checks li{font-size:13px}.execution-table .run-facts,.execution-table .run-checks li{grid-template-columns:minmax(0,1fr)}.execution-table .run-checks li p{grid-column:1}@media(max-width:650px){.run-facts,.run-checks li{grid-template-columns:minmax(0,1fr)}.run-facts dt{padding-top:6px}.run-checks li p{grid-column:1}}.evaluation-criterion{border-top:1px solid #cbd0c4;padding:12px 0}.evaluation-criterion pre{max-width:100%;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}.history-card{border:1px solid #cbd0c4;background:#fff;padding:20px;margin:12px 0;min-width:0;overflow-wrap:anywhere}.history-card h3{margin:8px 0}.history-card p{margin:8px 0}.history-card .note{font-size:14px;color:#596150}.history-error{padding:12px;border-left:4px solid #ad4135;background:#f7e9e6}.hosted-history{margin-bottom:32px}.hosted-history .section-heading{gap:16px;flex-wrap:wrap}`;

export const EXECUTION_CSS = `
.execution-controls{display:flex;align-items:end;gap:12px;flex-wrap:wrap;margin:20px 0}.execution-controls label{display:flex;flex-direction:column;gap:6px;margin:0;min-width:150px;font-size:13px}.execution-controls select,.execution-controls input{font:inherit;padding:10px;max-width:100%;border:1px solid #bac3af;background:white;color:inherit}.execution-controls button{align-self:end}.execution-meta{display:block;font-size:12px;color:#596150;margin-top:4px}.agent-group-columns{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr) minmax(0,1.3fr) minmax(0,1.3fr) 70px;gap:14px;align-items:center;padding:14px}.agent-group-columns>span{min-width:0;overflow-wrap:anywhere}.agent-group-columns[aria-hidden]{font-size:12px;text-transform:uppercase;color:#596150;border-bottom:1px solid #cbd0c4}.agent-group{margin:0;border-bottom:1px solid #cbd0c4;background:white}.agent-group summary{cursor:pointer;list-style:none;font-size:14px;font-weight:400}.agent-group summary strong:before{content:'▸ ';color:#596150}.agent-group[open] summary strong:before{content:'▾ '}.agent-group[data-attention=true]{border-left:3px solid #aa6f13}.agent-group[open]{background:#f7f9f2}.agent-group-history{padding:0 14px 14px}.execution-table-wrap{max-width:100%;overflow-x:auto}.execution-table{border-collapse:collapse;width:100%;font-size:13px;text-align:left;table-layout:fixed}.execution-table caption{text-align:left;font-weight:600;padding:12px 0}.execution-table th{font-size:11px;text-transform:uppercase;color:#596150}.execution-table th,.execution-table td{padding:12px 10px;border-bottom:1px solid #d6dccf;vertical-align:top;overflow-wrap:anywhere}.execution-table th:nth-child(1){width:24%}.execution-table th:nth-child(2){width:17%}.execution-table th:nth-child(3){width:9%}.execution-table th:nth-child(4){width:30%}.execution-table th:nth-child(5){width:20%}.execution-table tr[data-attention=true] .execution-status{color:#88540b;font-weight:700}.execution-table details{margin:8px 0}.execution-table pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;max-height:200px;overflow:auto}.execution-paging{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:12px;margin:12px 0}.execution-paging button:disabled{opacity:.4;cursor:default}.agent-group summary:focus-visible{outline:3px solid #789832;outline-offset:-3px}
@media(max-width:650px){.execution-controls{align-items:stretch}.execution-controls label{min-width:0;flex:1 1 140px}.execution-table{min-width:650px}.agent-group-columns[aria-hidden]{display:none}.agent-group summary{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.agent-group summary>span:first-child{grid-column:1/-1}.agent-group summary>span:not(:first-child):before{content:attr(data-label);display:block;font-size:10px;text-transform:uppercase;color:#596150;margin-bottom:4px}.agent-group-history{padding:0 10px 12px}.execution-paging{flex-wrap:wrap}}
`;
