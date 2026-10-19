import { ProviderRuns, providerWorker, type ProviderEnv } from "./provider.ts";
import type { Context } from "./common.ts";
export class PaymentRuns extends ProviderRuns {
  constructor(ctx: Context, env: ProviderEnv) { super(ctx, env, "PaymentsCo"); }
}
export default providerWorker("PaymentsCo");
