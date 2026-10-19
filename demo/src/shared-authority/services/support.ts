import { ProviderRuns, providerWorker, type ProviderEnv } from "./provider.ts";
import type { Context } from "./common.ts";
export class SupportRuns extends ProviderRuns {
  constructor(ctx: Context, env: ProviderEnv) { super(ctx, env, "SupportCo"); }
}
export default providerWorker("SupportCo");
