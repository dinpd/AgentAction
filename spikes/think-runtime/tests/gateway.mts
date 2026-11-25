/** Issue 446 checks: hosted Think actions against the real gateway Worker code. Synthetic provider, scripted model. */
import assert from 'node:assert/strict';
import { agentCheck, REFUND, outcomes, proposeRefund, summary, type Ctx, type CheckOptions } from './checks.mts';

const gatewayCheck = (name: string, run: (ctx: Ctx) => Promise<void>, options?: CheckOptions) => agentCheck('GatewayAgent', name, run, options);
const jwsPayload = (jws: string) => JSON.parse(Buffer.from(jws.split('.')[1], 'base64url').toString()).receipt;
const types = (audit: Array<{ type: string }>) => audit.map(e => e.type);

await gatewayCheck('gateway: an approved hosted action records the reference integration evidence trail', async ({ provider, call }) => {
  const approvalId = await proposeRefund(call);
  const parked = await call('gatewayReport', approvalId);
  assert.equal(provider.calls, 0);
  assert.deepEqual(types(parked.audit), ['agentid.approval.created']);
  console.log('[THINK-SPIKE] concurrent gateway approvals', await outcomes([call('operatorApprove', approvalId, 'reviewer'), call('operatorApprove', approvalId, 'reviewer')], 160));
  assert.equal(provider.calls, 1);
  const report = await call('report');
  assert.equal(report.supervisor.actions[0].state, 'succeeded');
  const gateway = await call('gatewayReport', approvalId);
  // Newest first. Same sequence as the gateway's own "hosted approval" test, plus the recorded result.
  assert.deepEqual(types(gateway.audit), ['agentid.provider.executed', 'agentid.decision', 'agentid.jit.issued', 'agentid.approval.decided', 'agentid.approval.created']);
  assert.equal(gateway.audit.find((e: any) => e.type === 'agentid.approval.decided').payload.approval.decided_by, 'reviewer');
  const receipt = jwsPayload(gateway.execution.receipt.jws);
  console.log('[THINK-SPIKE] authorization receipt', JSON.stringify(receipt));
  assert.equal(receipt.approval_id, approvalId);
  assert.equal(gateway.result.status, 201);
  assert.equal(gateway.result.body.receipt.status, 'executed');
  assert.equal(gateway.result.body.request_digest, receipt.request_digest);
  // The supervisor's binding digest (tool definition, arguments, policy) is inside the gateway's approval digest.
  assert.equal(gateway.event.call_fingerprint, report.supervisor.actions[0].bindingDigest);
});

await gatewayCheck('gateway: a manifest block denies at proposal with zero provider calls and no proposal', async ({ provider, call }) => {
  await call('setGatewayBlockTools', ['refund']);
  await call('turn', REFUND);
  const report = await call('report');
  console.log('[THINK-SPIKE] gateway block', JSON.stringify(report.denials));
  assert.match(report.denials[0], /^refund: Denied by policy, so this action will not run: provider.refund is blocked by manifest policy.$/);
  assert.equal(report.supervisor, null);
  assert.equal(report.pending.length, 0);
  assert.equal(provider.calls, 0);
});

for (const fault of ['error', 'timeout'] as const) {
  await gatewayCheck(`gateway: a gateway ${fault} at proposal fails closed`, async ({ provider, call }) => {
    await call('setGatewayFault', fault);
    await call('turn', REFUND);
    const report = await call('report');
    assert.match(report.denials[0], /Gateway unavailable/);
    assert.equal(report.supervisor, null);
    assert.equal(report.pending.length, 0);
    assert.equal(provider.calls, 0);
  });
}

await gatewayCheck('gateway: a gateway failure after approval stops dispatch, settles failed, and cannot be retried', async ({ provider, call }) => {
  const approvalId = await proposeRefund(call);
  await call('setGatewayFault', 'grant-error');
  console.log('[THINK-SPIKE] grant outage approve', await outcomes([call('operatorApprove', approvalId, 'reviewer')], 200));
  assert.equal(provider.calls, 0);
  const report = await call('report');
  assert.equal(report.supervisor.actions[0].state, 'failed');
  assert.equal(report.pending.length, 0);
  await call('setGatewayFault', 'none');
  await assert.rejects(call('operatorApprove', approvalId, 'reviewer'), /consumed or invalidated/);
  assert.equal(provider.calls, 0);
  assert.deepEqual(types((await call('gatewayReport', approvalId)).audit), ['agentid.approval.decided', 'agentid.approval.created']);
});

await gatewayCheck('gateway: a lost provider response leaves an authorization with no result, and the grant cannot be reused', async ({ provider, call }) => {
  const approvalId = await proposeRefund(call);
  await call('operatorApprove', approvalId, 'reviewer').catch(() => {});
  assert.equal(provider.calls, 1);
  assert.equal((await call('report')).supervisor.actions[0].state, 'uncertain');
  const gateway = await call('gatewayReport', approvalId);
  assert.equal(gateway.result, null);
  assert.match(gateway.gap, /uncertain/);
  assert.deepEqual(types(gateway.audit), ['agentid.decision', 'agentid.jit.issued', 'agentid.approval.decided', 'agentid.approval.created']);
  const reuse = await call('gatewayCall', '/authorize', { ...gateway.event, approval_id: approvalId, jit_grant_id: gateway.execution.event.jit_grant_id, approved: true });
  console.log('[THINK-SPIKE] grant reuse', JSON.stringify(reuse.body.findings));
  assert.equal(reuse.body.allow, false);
  // Without the supervisor, can a caller holding the same gateway approval get a second grant?
  const second = await call('gatewayCall', '/jit-grants', { ...gateway.event, approval_id: approvalId });
  const again = second.status === 201
    ? await call('gatewayCall', '/authorize', { ...gateway.event, approval_id: approvalId, jit_grant_id: second.body.jit_grant_id, approved: true })
    : null;
  console.log('[THINK-SPIKE] second grant for the same approval', second.status, 'authorize with it', JSON.stringify(again?.body && { allow: again.body.allow, findings: again.body.findings }));
  assert.equal(provider.calls, 1);
}, { behavior: 'lose-response' });

await gatewayCheck('gateway: the gateway approval refuses a grant for different arguments', async ({ call }) => {
  const approvalId = await proposeRefund(call);
  await call('operatorApprove', approvalId, 'reviewer');
  const event = (await call('gatewayReport', approvalId)).event;
  const changed = await call('gatewayCall', '/jit-grants', { ...event, approval_id: approvalId, call_fingerprint: 'sha256:different-arguments' });
  console.log('[THINK-SPIKE] grant with changed fingerprint', changed.status, JSON.stringify(changed.body).slice(0, 240));
  assert.notEqual(changed.status, 201);
});

summary();
