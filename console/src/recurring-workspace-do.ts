import { DurableObject } from "cloudflare:workers";
import { RecurringRuntime } from "./recurring-runtime.ts";
import { websiteHealth } from "./website-health.ts";
import type { Notice } from "./recurring-types.ts";

export class RecurringWorkspace extends DurableObject<Cloudflare.Env> {
  private runtime: RecurringRuntime;
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.runtime = new RecurringRuntime(ctx.storage, env, [websiteHealth]);
    ctx.blockConcurrencyWhile(() => this.runtime.recover());
  }
  async request(request: Request): Promise<Response> { return this.runtime.handle(request); }
  async notify(event: Notice): Promise<void> { return this.runtime.notify(event); }
  async alarm(): Promise<void> { return this.runtime.alarm(); }
}
