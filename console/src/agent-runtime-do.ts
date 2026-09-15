import { DurableObject } from "cloudflare:workers";
import { AgentRuntime, type RuntimeEnv, type Run, type Agent } from "./agent-runtime.ts";

export class AgentWorkspace extends DurableObject<RuntimeEnv & Cloudflare.Env> {
  private runtime: AgentRuntime;
  constructor(ctx: DurableObjectState, env: RuntimeEnv & Cloudflare.Env) {
    super(ctx, env);
    this.runtime = new AgentRuntime(ctx.storage, env);
    ctx.blockConcurrencyWhile(() => this.runtime.recover());
  }
  async request(request: Request): Promise<Response> {
    const workspace = request.headers.get("x-runtime-workspace");
    if (workspace && request.method === "POST") await this.ctx.storage.put("notification-workspace", workspace);
    const result = await this.runtime.handle(request);
    if (request.method === "POST") await this.publishNotifications();
    return result;
  }
  async alarm(): Promise<void> { await this.runtime.alarm(); await this.publishNotifications(); }
  private async publishNotifications(): Promise<void> {
    const workspace = await this.ctx.storage.get<string>("notification-workspace");
    if (!workspace || !this.env.RECURRING_WORKSPACES) return;
    const receiver = this.env.RECURRING_WORKSPACES.getByName(`workspace:${workspace}`);
    const runs = await this.ctx.storage.list<Run>({ prefix: "run:" });
    const published = await this.ctx.storage.get<string[]>("notification-published") || [];
    for (const run of runs.values()) {
      const kind = run.status === "awaiting_approval" ? "approval_required" : ["failed", "interrupted"].includes(run.status) ? "execution_failed" : undefined;
      if (!kind) continue;
      const id = `${run.id}:${run.pending?.id || run.status}`;
      if (published.includes(id)) continue;
      const agent = await this.ctx.storage.get<Agent>(`agent:${run.agentId}`);
      try {
        await receiver.notify({ id, kind, jobId: run.agentId, severity: kind === "execution_failed" ? "critical" : "warning", title: `${agent?.title || "Agent"}: ${kind === "approval_required" ? "approval required" : "execution needs attention"}`.slice(0, 180), detail: "Open My agents to review the run and any exact proposed action. Tool arguments, credentials and provider results are not included in this email.", at: Date.now() });
        published.push(id); await this.ctx.storage.put("notification-published", published.slice(-200));
      } catch { /* A subsequent agent operation/alarm retries the stable event ID. */ }
    }
  }
}
