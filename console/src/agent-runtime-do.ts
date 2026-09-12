import { DurableObject } from "cloudflare:workers";
import { AgentRuntime, type RuntimeEnv } from "./agent-runtime.ts";

export class AgentWorkspace extends DurableObject<RuntimeEnv> {
  private runtime: AgentRuntime;
  constructor(ctx: DurableObjectState, env: RuntimeEnv) {
    super(ctx, env);
    this.runtime = new AgentRuntime(ctx.storage, env);
    ctx.blockConcurrencyWhile(() => this.runtime.recover());
  }
  async request(request: Request): Promise<Response> { return this.runtime.handle(request); }
  async alarm(): Promise<void> { return this.runtime.alarm(); }
}
