import { DurableObject } from 'cloudflare:workers';
import { ReadinessStore, type PublishedCheck } from './readiness-store.ts';
import { RuntimeError } from './mcp-client.ts';

export class McpReadiness extends DurableObject<ReadinessEnv> {
  private store: ReadinessStore;
  constructor(ctx: DurableObjectState, env: ReadinessEnv) {
    super(ctx, env);
    this.store = new ReadinessStore(ctx.storage);
  }
  async check(input: unknown): Promise<{ok:true;result:PublishedCheck}|{ok:false;error:string;status:number}> {
    // Platform RPC does not retain custom Error fields.
    try { return { ok:true, result: await this.store.check(input) }; }
    catch (error) { return { ok:false, error: error instanceof RuntimeError ? error.message : 'The check could not complete.', status: error instanceof RuntimeError ? error.status : 502 }; }
  }
  get(id: string) { return this.store.get(id); }
  lookup(endpoints: string[]) { return this.store.lookup(endpoints); }
}
