import { boundedText, object, RuntimeError, textField } from "./mcp-client.ts";
import { afterQuietHours, defaultNotifications, deliveryText, enqueue, notificationSettings, recipients } from "./notifications.ts";
import type { CheckResult, CheckRun, EmailTransport, Handler, Notice, RecurringJob, RecurringState } from "./recurring-types.ts";

export type Store = { get<T>(key: string): Promise<T | undefined>; put<T>(key: string, value: T): Promise<void>; setAlarm(time: number): Promise<void>; deleteAlarm(): Promise<void> };
export type RecurringEnv = { NOTIFICATION_EMAIL?: EmailTransport; NOTIFICATION_FROM_EMAIL?: string };
const day = 86400000, week = day * 7;
const initial = (now: number): RecurringState => ({ version: 1, jobs: [], findings: [], runs: [], deliveries: [], notifications: defaultNotifications(), nextSummary: now + week, droppedNotifications: 0, quota: { day: "", manual: 0, emails: 0 }, externalEvents: [] });
async function withDeadline<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Deadline exceeded")), 25000); })]); }
  finally { if (timer) clearTimeout(timer); }
}
const pending = (status: string) => ["pending", "sending"].includes(status);
/** One isolated durable coordinator per workspace. Handlers supply domain logic only. */
export class RecurringRuntime {
  private queue: Promise<unknown> = Promise.resolve();
  private storage: Store; private env: RecurringEnv; private handlers: Handler[]; private fetcher: typeof fetch; private clock: () => number;
  constructor(storage: Store, env: RecurringEnv, handlers: Handler[], fetcher: typeof fetch = (i, o) => fetch(i, o), clock = () => Date.now()) { this.storage = storage; this.env = env; this.handlers = handlers; this.fetcher = fetcher; this.clock = clock; }
  private serial<T>(fn: () => Promise<T>): Promise<T> { const task = this.queue.then(fn, fn); this.queue = task.catch(() => {}); return task; }
  private async load(): Promise<RecurringState> {
    const state = await this.storage.get<RecurringState>("recurring:v1") || initial(this.clock());
    const today = new Date(this.clock()).toISOString().slice(0, 10);
    if (state.quota.day !== today) state.quota = { day: today, manual: 0, emails: 0 };
    return state;
  }
  private async save(state: RecurringState): Promise<void> {
    state.runs = state.runs.slice(-80);
    const completed = state.deliveries.filter(d => !pending(d.status)).slice(-30);
    state.deliveries = [...completed, ...state.deliveries.filter(d => pending(d.status))];
    state.externalEvents = state.externalEvents.slice(-100);
    if (JSON.stringify(state).length > 1000000) throw new RuntimeError("Workspace history limit reached. Pause agents and review retained data.", 409);
    // A single write commits finding transitions and their outbox events together.
    await this.storage.put("recurring:v1", state);
    const times = [
      ...state.jobs.filter(j => j.status === "active").map(j => j.nextRun || this.clock()),
      ...state.deliveries.filter(d => pending(d.status)).map(d => d.due),
      ...(state.jobs.some(j => j.status === "active") && state.notifications.weeklySummary ? [state.nextSummary] : []),
    ];
    if (times.length) await this.storage.setAlarm(Math.max(this.clock() + 1000, Math.min(...times))); else await this.storage.deleteAlarm();
  }
  async recover(): Promise<void> {
    const state = await this.load();
    for (const run of state.runs.filter(r => r.status === "running")) {
      run.status = "interrupted"; run.finishedAt = this.clock(); run.summary = "Execution interrupted; result unknown. The next scheduled check will observe current state.";
      const job = state.jobs.find(j => j.id === run.jobId);
      if (job) this.failure(state, job, run.summary);
    }
    for (const delivery of state.deliveries.filter(d => d.status === "sending")) {
      delivery.status = delivery.attempts >= 5 ? "failed" : "pending";
      delivery.error = "Delivery interrupted; provider acceptance unknown. A retry may duplicate this email.";
      delivery.due = this.clock() + 60000;
    }
    await this.save(state);
  }
  async handle(request: Request): Promise<Response> {
    return this.serial(async () => {
      try {
        const state = await this.load(), action = new URL(request.url).pathname.slice(1), role = request.headers.get("x-runtime-role"), actor = request.headers.get("x-runtime-actor") || "";
        if (!["owner", "operator", "viewer"].includes(role || "")) throw new RuntimeError("Workspace membership required.", 403);
        if (request.method === "GET" && action === "state") return Response.json(this.snapshot(state));
        if (request.method !== "POST") throw new RuntimeError("Operation not found.", 404);
        if (role === "viewer") throw new RuntimeError("An operator or owner is required.", 403);
        if (["create", "activate", "settings", "route", "delete", "test-email"].includes(action) && role !== "owner") throw new RuntimeError("Only owners may change scope, schedules and notification destinations.", 403);
        const body = object(JSON.parse(await boundedText(new Response(request.body), 16000)));
        let value: unknown = {};
        if (action === "create") {
          if (state.jobs.length >= 8) throw new RuntimeError("At most eight recurring agents per workspace.", 409);
          const handler = this.handler(String(body.handler)), config = handler.validate(object(body.config));
          const intervalMinutes = Number(body.intervalMinutes);
          if (![5, 15, 60, 1440].includes(intervalMinutes)) throw new RuntimeError("Choose a 5-minute, 15-minute, hourly or daily interval.");
          const job: RecurringJob = { id: crypto.randomUUID(), handler: handler.id, handlerVersion: handler.version, title: textField(body.title, "agent name", 120), config, intervalMinutes, status: "draft", createdAt: this.clock(), state: {}, recipients: null };
          state.jobs.push(job); value = { jobId: job.id };
        } else if (action === "settings") {
          state.notifications = notificationSettings(body);
          for (const d of state.deliveries.filter(d => pending(d.status))) {
            if (!state.notifications.recipients.includes(d.recipient)) d.status = "cancelled";
            else d.due = afterQuietHours(d.due, state.notifications);
          }
          for (const job of state.jobs) if (job.recipients) job.recipients = job.recipients.filter(r => state.notifications.recipients.includes(r));
        } else if (action === "test-email") {
          if (++state.quota.manual > 40) throw new RuntimeError("Daily manual action limit reached.", 429);
          if (!state.notifications.recipients.length) throw new RuntimeError("Configure a recipient first.", 409);
          enqueue(state, { id: crypto.randomUUID(), jobId: "workspace", kind: "test", severity: "info", at: this.clock(), title: "AgentAction notification test", detail: "Your workspace email destination is configured. This test was requested by a workspace owner." });
        } else if (action === "acknowledge") {
          const finding = state.findings.find(f => f.id === body.findingId);
          if (!finding || finding.status !== "open") throw new RuntimeError("Open finding not found.", 404);
          finding.status = "acknowledged"; finding.updatedAt = this.clock();
        } else {
          const job = state.jobs.find(j => j.id === body.jobId);
          if (!job) throw new RuntimeError("Agent not found in this workspace.", 404);
          if (action === "run") {
            if (++state.quota.manual > 40) throw new RuntimeError("Daily manual action limit reached.", 429);
            await this.check(state, job, !job.baselineAt ? "baseline" : "manual");
          } else if (action === "activate") {
            this.handler(job.handler, job.handlerVersion);
            if (!job.baselineAt || body.reviewed !== true) throw new RuntimeError("Run and review a complete baseline before authorizing recurring reads.", 409);
            const last = state.runs.filter(r => r.jobId === job.id).at(-1);
            if (!last || last.status !== "completed") throw new RuntimeError("The latest check must complete before activation.", 409);
            job.status = "active"; job.approvedBy = actor; job.approvedAt = this.clock(); job.nextRun = this.clock() + job.intervalMinutes * 60000;
          } else if (action === "pause") { job.status = "paused"; delete job.nextRun; }
          else if (action === "route") {
            const selected = body.recipients === null ? null : recipients(body.recipients);
            if (selected?.some(r => !state.notifications.recipients.includes(r))) throw new RuntimeError("Agent routing must use configured workspace recipients.", 403);
            job.recipients = selected;
            for (const d of state.deliveries.filter(d => pending(d.status))) {
              d.events = d.events.filter(e => e.jobId !== job.id || (selected ?? state.notifications.recipients).includes(d.recipient));
              if (!d.events.length) d.status = "cancelled";
            }
          } else if (action === "delete") {
            if (job.status === "active") throw new RuntimeError("Pause this agent before removing it.", 409);
            state.jobs = state.jobs.filter(j => j.id !== job.id); state.findings = state.findings.filter(f => f.jobId !== job.id); state.runs = state.runs.filter(r => r.jobId !== job.id);
            for (const d of state.deliveries.filter(d => pending(d.status))) { d.events = d.events.filter(e => e.jobId !== job.id); if (!d.events.length) d.status = "cancelled"; }
          } else throw new RuntimeError("Operation not found.", 404);
        }
        await this.save(state);
        return Response.json(value);
      } catch (error) { return Response.json({ error: error instanceof RuntimeError ? error.message : "The operation could not be completed. No success was recorded." }, { status: error instanceof RuntimeError ? error.status : 500 }); }
    });
  }
  private snapshot(state: RecurringState): unknown {
    return { ...state, recipes: this.handlers.map(({ id, version, title, description, inputs }) => ({ id, version, title, description, inputs })), emailAvailable: Boolean(this.env.NOTIFICATION_EMAIL && this.env.NOTIFICATION_FROM_EMAIL), jobs: state.jobs.map(job => {
      const last = state.runs.filter(r => r.jobId === job.id).at(-1);
      const stale = job.status === "active" && (!job.lastRun || this.clock() - job.lastRun > job.intervalMinutes * 120000 + 60000);
      return { ...job, health: stale || !last || last.status !== "completed" ? "unknown" : state.findings.some(f => f.jobId === job.id && f.status !== "resolved") ? "findings" : "checks complete", stale };
    }) };
  }
  private handler(id: string, version?: string): Handler {
    const handler = this.handlers.find(h => h.id === id && (!version || h.version === version));
    if (!handler) throw new RuntimeError("Recipe handler/version is unavailable. Review the agent before continuing.", 409);
    return handler;
  }
  private apply(state: RecurringState, job: RecurringJob, result: CheckResult): void {
    if (JSON.stringify(result.state).length > 8000 || result.observations.length > 16 || result.summary.length > 700) throw new RuntimeError("Recipe result exceeds runtime limits.");
    // Validate the entire handler result before changing any finding/outbox state.
    for (const obs of result.observations) {
      if (!/^[a-z0-9_.-]{1,80}$/.test(obs.key) || obs.title.length > 180 || obs.detail.length > 900 || !["present", "absent", "unknown"].includes(obs.state) || !["info", "warning", "critical"].includes(obs.severity)) throw new RuntimeError("Invalid recipe observation.");
    }
    for (const obs of result.observations) {
      if (obs.state === "unknown") continue;
      let finding = state.findings.find(f => f.jobId === job.id && f.key === obs.key);
      if (obs.state === "present") {
        const transition = !finding || finding.status === "resolved";
        if (!finding) {
          if (state.findings.length >= 128) { const i = state.findings.findIndex(f => f.status === "resolved"); if (i < 0) throw new RuntimeError("Finding limit reached."); state.findings.splice(i, 1); }
          finding = { ...obs, id: crypto.randomUUID(), jobId: job.id, status: "open", openedAt: this.clock(), updatedAt: this.clock(), occurrences: 0, episode: 0, recipients: [] }; state.findings.push(finding);
        }
        Object.assign(finding, obs, { updatedAt: this.clock(), occurrences: finding.occurrences + 1 });
        if (transition) {
          finding.status = "open"; finding.openedAt = this.clock(); finding.episode++;
          finding.recipients = enqueue(state, { id: `${finding.id}:${finding.episode}:open`, jobId: job.id, kind: obs.key === "runtime.execution" ? "execution_failed" : "finding", severity: obs.severity, title: `${job.title}: ${obs.title}`.slice(0, 180), detail: obs.detail, at: this.clock() }, job.recipients);
        }
      } else if (finding && finding.status !== "resolved") {
        finding.status = "resolved"; finding.state = "absent"; finding.updatedAt = this.clock();
        enqueue(state, { id: `${finding.id}:${finding.episode}:resolved`, jobId: job.id, kind: "recovery", severity: finding.severity, title: `${job.title}: resolved — ${finding.title}`.slice(0, 180), detail: obs.detail, at: this.clock() }, finding.recipients.filter(r => (job.recipients ?? state.notifications.recipients).includes(r)));
      }
    }
    job.state = result.state;
  }
  private failure(state: RecurringState, job: RecurringJob, detail: string) {
    this.apply(state, job, { state: job.state, summary: detail, complete: false, observations: [{ key: "runtime.execution", state: "present", severity: "critical", title: "Monitoring result unknown", detail }] });
  }
  private async check(state: RecurringState, job: RecurringJob, kind: CheckRun["kind"]): Promise<void> {
    const run: CheckRun = { id: crypto.randomUUID(), jobId: job.id, startedAt: this.clock(), status: "running", summary: "Check in progress; outcome unknown.", kind, findings: 0 };
    state.runs.push(run);
    // Install watchdog before the durable claim; interruption cannot strand all future work.
    await this.storage.setAlarm(this.clock() + 60000);
    await this.storage.put("recurring:v1", state);
    try {
      const result = await this.handler(job.handler, job.handlerVersion).check(job.config, structuredClone(job.state), { now: this.clock(), fetcher: this.fetcher, baseline: kind === "baseline", previousComplete: state.runs.filter(r => r.jobId === job.id).at(-2)?.status === "completed" });
      this.apply(state, job, result);
      run.observations = result.observations.map(({ key, state, severity }) => ({ key, state, severity }));
      run.evidenceDigest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(result))))].map(b => b.toString(16).padStart(2, "0")).join("");
      if (result.complete) this.apply(state, job, { state: job.state, summary: "", complete: true, observations: [{ key: "runtime.execution", state: "absent", severity: "critical", title: "Check recovered", detail: "A complete check has succeeded again." }] });
      else this.failure(state, job, "The recipe returned incomplete evidence; check coverage is unknown.");
      run.status = result.complete ? "completed" : "partial"; run.summary = result.summary;
      if (result.complete && !job.baselineAt) job.baselineAt = this.clock();
    } catch (error) {
      run.status = "partial"; run.summary = error instanceof RuntimeError ? error.message : "Check failed; current condition is unknown. Retry or inspect the configured target.";
      this.failure(state, job, run.summary);
    }
    run.finishedAt = this.clock(); job.lastRun = this.clock(); run.findings = state.findings.filter(f => f.jobId === job.id && f.status !== "resolved").length;
    await this.save(state);
  }
  /** Trusted server-side integration for other agent runtimes, never a browser event-ingestion route. */
  async notify(event: Notice): Promise<void> {
    return this.serial(async () => {
      if (event.id.length > 200 || event.title.length > 180 || event.detail.length > 900 || !["approval_required", "execution_failed", "recovery"].includes(event.kind)) throw new RuntimeError("Unsupported runtime notification.");
      const state = await this.load(); if (state.externalEvents.includes(event.id)) return;
      state.externalEvents.push(event.id); enqueue(state, { ...event, at: this.clock() }); await this.save(state);
    });
  }
  async alarm(): Promise<void> {
    return this.serial(async () => {
      const state = await this.load();
      // Alarm deliveries can repeat. Persist next slot before invoking any handler.
      for (const job of state.jobs.filter(j => j.status === "active" && (j.nextRun || 0) <= this.clock()).slice(0, 2)) {
        job.nextRun = this.clock() + job.intervalMinutes * 60000;
        await this.check(state, job, "scheduled");
      }
      if (state.notifications.weeklySummary && state.jobs.some(j => j.status === "active") && state.nextSummary <= this.clock()) {
        const slot = state.nextSummary; state.nextSummary = this.clock() + week;
        enqueue(state, { id: `summary:${slot}`, kind: "summary", jobId: "workspace", severity: "info", at: this.clock(), title: "Weekly agent monitoring summary", detail: state.jobs.map(j => `${j.title}: ${j.status}; last check ${j.lastRun ? new Date(j.lastRun).toISOString() : "never"}; ${state.findings.filter(f => f.jobId === j.id && f.status !== "resolved").length} unresolved findings.`).join("\n").slice(0, 900) });
      }
      await this.save(state);
      for (const delivery of state.deliveries.filter(d => d.status === "pending" && d.due <= this.clock()).slice(0, 5)) {
        if (!state.notifications.recipients.includes(delivery.recipient)) { delivery.status = "cancelled"; continue; }
        if (state.quota.emails >= 100) { delivery.due = Date.parse(state.quota.day) + day; delivery.error = "Workspace daily email limit reached; deferred until tomorrow."; continue; }
        delivery.status = "sending"; delivery.attempts++; state.quota.emails++; delivery.due = this.clock() + 60000;
        await this.storage.setAlarm(delivery.due); await this.storage.put("recurring:v1", state);
        try {
          if (!this.env.NOTIFICATION_EMAIL || !this.env.NOTIFICATION_FROM_EMAIL) throw new Error("unavailable");
          const result = await withDeadline(this.env.NOTIFICATION_EMAIL.send({ from: this.env.NOTIFICATION_FROM_EMAIL, to: delivery.recipient, subject: delivery.events.length > 1 ? `AgentAction: ${delivery.events.length} updates` : delivery.events[0].title.replace(/[\r\n]/g, " "), text: deliveryText(delivery), headers: { "X-AgentAction-Delivery-ID": delivery.id } }));
          delivery.status = "accepted"; delivery.acceptedAt = this.clock(); delivery.messageId = result.messageId?.slice(0, 200); delete delivery.error;
        } catch {
          delivery.status = delivery.attempts >= 5 ? "failed" : "pending";
          delivery.error = this.env.NOTIFICATION_EMAIL ? "Email was not confirmed by the provider. Check sender/recipient configuration; retries may duplicate delivery." : "Email service is not configured.";
          delivery.due = this.clock() + Math.min(day, 60000 * 5 ** delivery.attempts);
        }
        await this.save(state);
      }
      await this.save(state);
    });
  }
}
