import assert from 'node:assert/strict';
import test from 'node:test';
import type { GovernanceEvidence } from '../src/governance-evidence.ts';
import { governanceInsights } from '../src/governance-insights.ts';

const at = new Date(2_000).toISOString();
const base = {schemaVersion: 'agentaction.governance-decision.v1', workspace: 'ws', path: 'hermes',
  agentId: 'support', jobId: 'job', at, policyVersion: 3, agentPolicyVersion: 1, maxCalls: 4,
  trust: 'runtime_recorded', coverage: 'partial'} as const;
const evidence: GovernanceEvidence[] = [
  {...base, id: 'deny1', kind: 'rejection', reason: 'tool_out_of_scope', decision: 'deny'},
  {...base, id: 'deny2', kind: 'rejection', reason: 'tool_out_of_scope', decision: 'deny', jobId: 'job2'},
  {...base, id: 'allow1', kind: 'claim', tool: 'billing.refund', reason: 'exact_approval', decision: 'allow'},
  {...base, id: 'allow2', kind: 'claim', tool: 'billing.refund', reason: 'exact_approval', decision: 'allow'},
  {...base, id: 'uncertain', kind: 'execution', tool: 'billing.refund', reason: 'uncertain'},
  {...base, id: 'invalid', kind: 'rejection', tool: 'lookup', reason: 'invalid_arguments', decision: 'deny'},
  {...base, id: 'provider', kind: 'execution', tool: 'lookup', reason: 'failed'},
  {...base, id: 'outcome', kind: 'outcome', reason: 'missing_outcome_assurance'},
  {...base, id: 'inflight', kind: 'execution', reason: 'dispatch_in_flight'},
];
const filters = {from: 0, to: 3_000};

test('findings rank uncertainty first and distinguish workflow correction from policy review', async () => {
  const result = await governanceInsights([{evidence: [...evidence, evidence[0]], claims: [], rejectionLimitReached: false}], filters);
  assert.equal(result.findings.length, 5);
  assert.equal(result.findings[0].category, 'execution_uncertainty');
  assert.match(result.findings[0].recommendation.action, /Reconcile/);
  assert.equal(result.metrics.uncertainExecutions, 1);
  const denials = result.findings.find(f => f.category === 'repeated_denials')!;
  assert.equal(denials.frequency, 2);
  assert.equal(denials.recommendation.kind, 'agent');
  assert.deepEqual(denials.jobIds, ['job', 'job2']);
  const approval = result.findings.find(f => f.category === 'approval_friction')!;
  assert.match(approval.recommendation.action, /below \$25.*duplicate protection.*monetary budget/);
  assert.equal(approval.recommendation.kind, 'governance');
  const filtered = await governanceInsights([{evidence: [...evidence].reverse(), claims: [], rejectionLimitReached: false}],
    {...filters, from: 1_000, agentId: 'support', category: 'repeated_denials'});
  assert.deepEqual(filtered.findings.map(f => f.id), [denials.id]);
  assert.equal((await governanceInsights([{evidence, claims: [], rejectionLimitReached: false}], {...filters, from: 2_001})).findings.length, 0);
});
