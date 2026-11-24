/** Issue 435 spike checks. Synthetic provider, scripted model, no real accounts. */
import assert from 'node:assert/strict';
import { bundle, createRuntime, newProvider, PROVIDER_URL, type Provider } from './harness.mts';

const script = await bundle();
const results: string[] = [];
const check = async (name: string, run: () => Promise<void>) => {
  await run();
  results.push(`ok  ${name}`);
  console.log(`[THINK-SPIKE] ok  ${name}`);
};
const REFUND = 'use refund {"paymentId":"synthetic-payment","amount":10}';

type Agent = 'HookProbe' | 'SupervisedAgent';
type Ctx = { provider: Provider; runtime: Awaited<ReturnType<typeof createRuntime>>; call: (method: string, ...args: unknown[]) => Promise<any> };
/** A check against one agent: fresh runtime, provider connected unless `connect` is false, always closed. */
const agentCheck = (agent: Agent, name: string, run: (ctx: Ctx) => Promise<void>, { behavior = 'respond' as Provider['behavior'], connect = true } = {}) =>
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
const probe = (name: string, run: (ctx: Ctx) => Promise<void>, options?: { connect?: boolean }) => agentCheck('HookProbe', name, run, options);
const supervised = (name: string, run: (ctx: Ctx) => Promise<void>, options?: { behavior?: Provider['behavior'] }) => agentCheck('SupervisedAgent', name, run, options);

const settle = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
/** Await the attempts and return a loggable summary of each (value, or truncated rejection reason). */
const outcomes = async (attempts: Promise<unknown>[], max: number) =>
  JSON.stringify((await Promise.allSettled(attempts)).map(a => (a.status === 'fulfilled' ? a.value : String(a.reason).slice(0, max))));
/** Run a refund turn so it parks, and return the approval id the supervisor recorded for it. */
const proposeRefund = async (call: Ctx['call']) => {
  await call('turn', REFUND);
  return (await call('report')).supervisor.actions[0].approvalId as string;
};

await probe('hook: beforeToolCall fires for an auto-merged MCP tool and allow reaches the provider once', async ({ provider, call }) => {
  await call('turn', REFUND);
  const report = await call('report');
  console.log('[THINK-SPIKE] probe allow', JSON.stringify(report), 'provider', provider.requests.join(','));
  assert.equal(report.hookLog.length, 1);
  assert.match(report.hookLog[0].toolName, /refund$/);
  assert.deepEqual(report.hookLog[0].input, { paymentId: 'synthetic-payment', amount: 10 });
  assert.equal(provider.calls, 1);
});

await probe('hook: a block decision results in zero tools/call requests', async ({ provider, call }) => {
  await call('setDeny', true);
  await call('turn', REFUND);
  const report = await call('report');
  assert.equal(report.hookLog.length, 1);
  assert.equal(report.hookLog[0].decision, 'block');
  assert.equal(provider.calls, 0);
  assert.ok(!provider.requests.includes('tools/call'));
});

await supervised('supervised: a proposal parks without contacting the provider, and approval dispatches exactly once', async ({ provider, call }) => {
  await call('turn', REFUND);
  const parked = await call('report');
  console.log('[THINK-SPIKE] parked', JSON.stringify(parked));
  assert.equal(provider.calls, 0);
  assert.equal(parked.pending.length, 1);
  assert.equal(parked.supervisor.actions[0].state, 'awaiting_approval');
  const approvalId = parked.supervisor.actions[0].approvalId;
  console.log('[THINK-SPIKE] concurrent approvals', await outcomes([call('operatorApprove', approvalId, 'reviewer'), call('operatorApprove', approvalId, 'reviewer')], 120));
  assert.equal(provider.calls, 1);
  const done = await call('report');
  assert.equal(done.supervisor.actions[0].state, 'succeeded');
  assert.equal(done.supervisor.actions[0].approvedBy, 'reviewer');
  assert.deepEqual(done.supervisor.journal.map((j: any) => j.state), ['awaiting_approval', 'dispatch_claimed', 'succeeded']);
  assert.equal(done.pending.length, 0);
});

await supervised('supervised: a policy deny results in zero provider tool calls and no proposal', async ({ provider, call }) => {
  await call('setDenyTools', ['refund']);
  await call('turn', REFUND);
  const report = await call('report');
  assert.equal(provider.calls, 0);
  assert.equal(report.pending.length, 0);
  assert.equal(report.supervisor, null);
});

await supervised('supervised: a pending approval survives process restart with the same binding and expiry', async ({ provider, runtime, call }) => {
  await call('turn', REFUND);
  const before = await call('report');
  await runtime.restart();
  const after = await call('report');
  assert.deepEqual(after.supervisor, before.supervisor);
  assert.deepEqual(after.pending, before.pending);
  assert.equal(provider.calls, 0);
  await call('operatorApprove', after.supervisor.actions[0].approvalId, 'reviewer');
  assert.equal(provider.calls, 1);
  assert.equal((await call('report')).supervisor.actions[0].state, 'succeeded');
});

await supervised('supervised: a lost provider response is recorded uncertain and never replayed, across restart', async ({ provider, runtime, call }) => {
  const approvalId = await proposeRefund(call);
  console.log('[THINK-SPIKE] lost response approve', await outcomes([call('operatorApprove', approvalId, 'reviewer')], 160));
  assert.equal(provider.calls, 1);
  assert.equal((await call('report')).supervisor.actions[0].state, 'uncertain');
  await assert.rejects(call('operatorApprove', approvalId, 'reviewer'), /consumed or invalidated/);
  await runtime.restart();
  await assert.rejects(call('operatorApprove', approvalId, 'reviewer'), /consumed or invalidated/);
  await call('thinkApproveDirectly');
  await settle(3000); // let any Think recovery alarms run
  assert.equal(provider.calls, 1);
  assert.equal((await call('report')).supervisor.actions[0].state, 'uncertain');
}, { behavior: 'lose-response' });

await supervised('supervised: process death during dispatch leaves the action uncertain and is not re-run', async ({ provider, runtime, call }) => {
  const approvalId = await proposeRefund(call);
  void call('operatorApprove', approvalId, 'reviewer').catch(() => {});
  for (let i = 0; i < 100 && provider.calls === 0; i++) await settle(50);
  assert.equal(provider.calls, 1);
  await runtime.restart();
  provider.behavior = 'respond';
  const recovered = await call('report');
  console.log('[THINK-SPIKE] after death', JSON.stringify(recovered));
  assert.equal(recovered.supervisor.actions[0].state, 'uncertain');
  assert.equal(recovered.supervisor.journal.at(-1).reason, 'restart');
  await settle(4000); // let any Think recovery alarms run
  await call('thinkApproveDirectly');
  assert.equal(provider.calls, 1);
}, { behavior: 'hang' });

await supervised('supervised: a changed tool definition after proposal denies the claim and dispatches nothing', async ({ provider, runtime, call }) => {
  const approvalId = await proposeRefund(call);
  provider.tool.description = 'Synthetic refund with a silently widened meaning';
  await runtime.restart(); // rediscovery picks up the drifted definition
  console.log('[THINK-SPIKE] drift approve', await outcomes([call('operatorApprove', approvalId, 'reviewer')], 160));
  assert.equal(provider.calls, 0);
  assert.equal((await call('report')).supervisor.actions[0].state, 'cancelled');
});

await supervised('supervised: a policy revision after proposal denies the claim and dispatches nothing', async ({ provider, call }) => {
  const approvalId = await proposeRefund(call);
  await call('setPolicy', { maxCalls: 2 });
  await Promise.allSettled([call('operatorApprove', approvalId, 'reviewer')]);
  assert.equal(provider.calls, 0);
  assert.equal((await call('report')).supervisor.actions[0].state, 'cancelled');
});

await supervised('supervised: Think\'s own client-callable approval cannot dispatch without an operator approval', async ({ provider, call }) => {
  await call('turn', REFUND);
  const direct = await call('thinkApproveDirectly');
  console.log('[THINK-SPIKE] direct approve', JSON.stringify(direct).slice(0, 300));
  assert.equal(provider.calls, 0);
  const report = await call('report');
  console.log('[THINK-SPIKE] after direct approve', JSON.stringify({ state: report.supervisor.actions[0].state, pending: report.pending.length }));
  assert.equal(report.supervisor.actions[0].state, 'cancelled');
});

await supervised('supervised: an expired approval denies the claim and dispatches nothing', async ({ provider, call }) => {
  await call('setPolicy', { approvalTtlMs: 1 });
  const approvalId = await proposeRefund(call);
  await settle(20);
  const outcome = await call('operatorApprove', approvalId, 'reviewer');
  assert.match(JSON.stringify(outcome), /expired/);
  assert.equal(provider.calls, 0);
});

await supervised('supervised: the call budget is enforced at claim time across turns', async ({ provider, call }) => {
  await call('setPolicy', { maxCalls: 1 });
  await call('operatorApprove', await proposeRefund(call), 'reviewer');
  assert.equal(provider.calls, 1);
  await call('turn', 'use refund {"paymentId":"synthetic-payment-2","amount":5}');
  const second = (await call('report')).supervisor.actions.at(-1);
  const outcome = await call('operatorApprove', second.approvalId, 'reviewer');
  assert.match(JSON.stringify(outcome), /budget exhausted/);
  assert.equal(provider.calls, 1);
});

await probe('control: Think offers workspace file tools by default and a forced write succeeds', async ({ call }) => {
  await call('turn', 'force write {"path":"/spike.txt","content":"written by the model"}');
  console.log('[THINK-SPIKE] control write', JSON.stringify(await call('report')));
  assert.equal(await call('readWorkspaceFile', '/spike.txt'), 'written by the model');
}, { connect: false });

await supervised('supervised: the model is offered supervised actions only, and a forced workspace write does not run', async ({ provider, call }) => {
  await call('turn', REFUND);
  assert.deepEqual((await call('report')).offeredTools, ['refund']);
  await call('turn', 'force write {"path":"/spike.txt","content":"written by the model"}');
  const report = await call('report');
  console.log('[THINK-SPIKE] forced write', JSON.stringify({ hookSeen: report.hookSeen, offered: report.offeredTools }));
  assert.equal(await call('readWorkspaceFile', '/spike.txt'), null);
  assert.equal(provider.calls, 0);
});

console.log(`[THINK-SPIKE] ${results.length} checks passed`);
