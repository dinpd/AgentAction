import assert from 'node:assert/strict';
import test from 'node:test';
import type { Run } from '../src/agent-runtime.ts';
import { claimAction, DEFAULT_SUPERVISOR_LIMITS, proposeAction, settleAction, supervisorRecord } from '../src/execution-supervisor.ts';
import { projectGovernanceRun } from '../src/governance-evidence.ts';
import { governanceInsights } from '../src/governance-insights.ts';
import { proposePolicyCandidate, replayPolicy } from '../src/policy-replay.ts';

async function history() {
  const clock = Date.now() - 1_000;
  const limits = {...DEFAULT_SUPERVISOR_LIMITS, maxCalls: 4};
  const state = supervisorRecord({version: 5, limits}, limits);
  state.agentPolicyVersion = 2;
  const run: Run = {id: 'run', agentId: 'support', kind: 'trial', actor: 'operator', startedAt: new Date(clock).toISOString(),
    status: 'interrupted', tokens: 0, supervisor: state, events: []};
  for (let i = 0; i < 4; i++) {
    const action = proposeAction(state, 'approval' + i, 'digest' + i, clock + i * 2);
    claimAction(state, action.approvalId, action.bindingDigest, 5, 'operator', clock + i * 2 + 1);
    const status = i === 3 ? 'uncertain' : 'succeeded';
    run.events.push({actionId: action.id, tool: 'refund', arguments: {}, status,
      approval: {id: action.approvalId, actor: 'operator', at: action.claimedAt!}});
    // The shared transition uses real time. Rebase the synthetic settlement to
    // its chronological place in the historical fixture.
    settleAction(state, action.id, status);
    state.journal.at(-1)!.at = action.claimedAt!;
  }
  const window = {from: clock, to: Date.now()};
  const runs = [projectGovernanceRun('workspace', run, window.to)!];
  const finding = (await governanceInsights(runs, window)).findings.find(item => item.category === 'execution_uncertainty')!;
  const candidate = (await proposePolicyCandidate(finding, runs))!;
  return {run, runs, window, candidate};
}

test('replay compares ordered live claims and keeps rejected arguments and expired approvals denied', async () => {
  const {run, runs, window, candidate} = await history();
  const copy = structuredClone({run, runs, candidate});
  const result = replayPolicy({...candidate, change: {maxCalls: 2}}, runs, window);
  assert.deepEqual(result.observed, {allow: 4, deny: 0, challenge: 4});
  assert.deepEqual(result.original, {allow: 3, deny: 0, challenge: 0});
  assert.deepEqual(result.proposed, {allow: 2, deny: 1, challenge: 0});
  assert.equal(result.limits.earlierDecisionChanged, 1);
  assert.equal(result.inconclusive, 5);
  assert.equal(result.newlyAllowed, 0);
  assert.equal(result.approvedClaimsDelta, -1);
  assert.ok(result.negativeCases.length && result.negativeCases.every(item => item.decision === 'deny'));
  assert.deepEqual({run, runs, candidate}, copy);
  assert.throws(() => replayPolicy({...candidate, change: {maxCalls: 5}}, runs, window), /within/);
  assert.throws(() => replayPolicy({...candidate, change: {maxCalls: 2, autoApprove: true} as never}, runs, window), /Unknown/);
  assert.equal(replayPolicy({...candidate, scope: {...candidate.scope, policyVersion: 6}}, runs, window).eligible, 0);
});

test('untrusted, legacy or inconsistent prefixes make subsequent claims inconclusive', async () => {
  const {run, runs, window, candidate} = await history();
  const claims = runs[0].claims;
  claims[0].evidence.trust = 'adapter_reported';
  assert.equal(replayPolicy(candidate, runs, window).limits.earlierDecisionInconclusive, 3);
  delete run.supervisor!.journal[1].claimDecision;
  const partial = replayPolicy(candidate, [projectGovernanceRun('workspace', run, window.to)!], window);
  assert.equal(partial.eligible, 0);
  assert.equal(partial.limits.earlierDecisionInconclusive, 3);
  claims[0].evidence.trust = 'runtime_recorded';
  claims[0].input = {...claims[0].input!, at: claims[0].input!.expiresAt};
  assert.equal(replayPolicy(candidate, runs, window).limits.baselineMismatch, 1);
});
