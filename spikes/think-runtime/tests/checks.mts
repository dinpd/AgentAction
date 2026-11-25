/** Shared check runner: one fresh Miniflare runtime per check, always closed, results counted. */
import { bundle, createRuntime, newProvider, PROVIDER_URL, type Provider } from './harness.mts';

const script = await bundle();
const results: string[] = [];

export const check = async (name: string, run: () => Promise<void>) => {
  await run();
  results.push(`ok  ${name}`);
  console.log(`[THINK-SPIKE] ok  ${name}`);
};
export const summary = () => console.log(`[THINK-SPIKE] ${results.length} checks passed`);

export const REFUND = 'use refund {"paymentId":"synthetic-payment","amount":10}';

export type Ctx = { provider: Provider; runtime: Awaited<ReturnType<typeof createRuntime>>; call: (method: string, ...args: unknown[]) => Promise<any> };
export type CheckOptions = { behavior?: Provider['behavior']; connect?: boolean };

/** A check against one agent: fresh runtime, provider connected unless `connect` is false, always closed. */
export const agentCheck = (agent: string, name: string, run: (ctx: Ctx) => Promise<void>, { behavior = 'respond', connect = true }: CheckOptions = {}) =>
  check(name, async () => {
    const provider = newProvider();
    provider.behavior = behavior;
    const runtime = await createRuntime(script, provider, { [agent]: agent });
    try {
      const call = (method: string, ...args: unknown[]) => runtime.rpc(agent, method, ...args);
      if (connect) await call('connectProvider', PROVIDER_URL);
      await run({ provider, runtime, call });
    } finally {
      await runtime.close();
    }
  });

export const settle = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
/** Await the attempts and return a loggable summary of each (value, or truncated rejection reason). */
export const outcomes = async (attempts: Promise<unknown>[], max: number) =>
  JSON.stringify((await Promise.allSettled(attempts)).map(a => (a.status === 'fulfilled' ? a.value : String(a.reason).slice(0, max))));
/** Run a refund turn so it parks, and return the approval id the supervisor recorded for it. */
export const proposeRefund = async (call: Ctx['call']) => {
  await call('turn', REFUND);
  return (await call('report')).supervisor.actions[0].approvalId as string;
};
