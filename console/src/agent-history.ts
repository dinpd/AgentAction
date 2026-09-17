/** Read-only presentation shared by Run and Monitor. Never merges operational checks into signed Jobs. */
export function agentHistory(runtime: Pick<Window, "document" | "fetch">) {
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
      return records(agents) && records(value?.runs) && agents.every(a => typeof a.id === "string" && typeof a.title === "string") && value.runs.every((r: any) => typeof r.status === "string" && ["string", "number"].includes(typeof r.startedAt)) ? value : null;
    } catch { return null; }
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
      card.append(node("h3", agent?.title || "Agent run"), node("span", `${recurring ? "Recurring check" : "Supervised run"} · ${run.status.replaceAll("_", " ")}`, "pill"), node("p", `${when(run.startedAt)} · ${run.kind}${recurring ? ` · ${run.findings} findings` : ""}`, "note"), node("p", run.summary || "Result not yet available."));
      if (recurring && run.status !== "completed") card.append(node("p", "Check coverage is unknown; this run does not establish that the target is healthy.", "note"));
      if (!recurring && run.outcome) card.append(node("p", `AI-assessed outcome: ${run.outcome.replaceAll("_", " ")}.`, "note"));
      card.append(link(recurring ? "View findings and check history →" : "Review run and approvals →", tenant, recurring ? "/automations" : "/agents", recurring ? "findings" : "run"));
      parent.append(card);
    }
  }
  function sortRuns(parent: HTMLElement, limit = 40) {
    const cards = Array.from(parent.children).filter(el => (el as HTMLElement).dataset.runAt !== undefined) as HTMLElement[];
    cards.sort((a, b) => Number(b.dataset.runAt) - Number(a.dataset.runAt));
    cards.forEach((card, i) => { if (i < limit || card.dataset.pendingApproval === "true") parent.append(card); else card.remove(); });
  }
  let generation = 0;
  const panel = doc.querySelector<HTMLElement>("[data-hosted-history]");
  function clearMonitor(demo = false) { generation++; if (panel) { panel.replaceChildren(); panel.hidden = demo; } }
  async function loadMonitor(tenant: string, demo: boolean) {
    if (!panel) return;
    clearMonitor(demo); if (demo) return;
    if (!tenant) { panel.append(node("p", "Select a workspace to see agent runs.")); return; }
    const current = generation;
    panel.append(node("p", "Loading agent runs…", "note"));
    const [supervised, recurring] = await Promise.all([read(tenant, "agents"), read(tenant, "automations")]);
    if (current !== generation) return;
    panel.replaceChildren();
    const heading = node("div", "", "section-heading"), refresh = node("button", "Refresh agent runs", "text-button") as HTMLButtonElement;
    refresh.type = "button"; refresh.onclick = () => { void loadMonitor(tenant, demo); };
    heading.append(node("h3", "Agent runs"), refresh); panel.append(heading);
    panel.append(node("p", "Latest 40 retained supervised runs and recurring checks, newest first. Monitoring findings and AI assessments are shown as reported; these entries are not signed Jobs. External activity filters below apply only to external events.", "note"));
    const agents = node("div", "", "history-agents"); appendAgents(agents, recurring, tenant); panel.append(agents);
    const runs = node("div"); runs.dataset.hostedRuns = "";
    appendRuns(runs, supervised, tenant, false); appendRuns(runs, recurring, tenant); sortRuns(runs);
    if (supervised && recurring && !supervised.runs.length && !recurring.runs.length) runs.append(node("p", "No agent runs recorded yet. Draft agents need a first run before activation.", "empty"));
    panel.append(runs);
  }
  return { read, appendAgents, appendRuns, sortRuns, clearMonitor, loadMonitor };
}
export const HISTORY_CSS = `.history-card{border:1px solid #cbd0c4;background:#fff;padding:20px;margin:12px 0;min-width:0;overflow-wrap:anywhere}.history-card h3{margin:8px 0}.history-card p{margin:8px 0}.history-card .note{font-size:14px;color:#596150}.history-agents{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.history-error{padding:12px;border-left:4px solid #ad4135;background:#f7e9e6}.hosted-history{margin-bottom:32px}.hosted-history .section-heading{gap:16px;flex-wrap:wrap}@media(max-width:850px){.history-agents{grid-template-columns:1fr}}`;
