import assert from 'node:assert/strict';
import test from 'node:test';
import type { Run, RuntimeStorage } from '../src/agent-runtime.ts';
import { claimAction, DEFAULT_SUPERVISOR_LIMITS, proposeAction, settleAction, supervisorRecord } from '../src/execution-supervisor.ts';
import { projectGovernanceRun, readGovernance, recordGovernanceRejection } from '../src/governance-evidence.ts';

test('workspace projection separates challenge, claim, dispatch and outcome without copying payloads', async () => {
  const supervisor = supervisorRecord({version: 2, limits: DEFAULT_SUPERVISOR_LIMITS}, DEFAULT_SUPERVISOR_LIMITS);
  const run: Run = {id: 'run', agentId: 'agent', kind: 'trial', actor: 'owner', startedAt: new Date(1000).toISOString(),
    status: 'interrupted', tokens: 0, supervisor, events: []};
  const action = proposeAction(supervisor, 'approval', 'private-digest', 1000);
  action.target = {tool: 'refund', resource: 'connection-id'};
  claimAction(supervisor, 'approval', 'private-digest', 2, 'operator', 2000);
  run.events.push({actionId: action.id, tool: 'refund', arguments: {customer: 'PRIVATE'}, status: 'uncertain',
    approval: {id: 'approval', actor: 'operator', at: new Date(2000).toISOString()}});
  settleAction(supervisor, action.id, 'uncertain');
  recordGovernanceRejection(run, 'tool_out_of_scope');
  const projected = projectGovernanceRun('workspace', run, Date.now())!;
  assert.deepEqual(projected.evidence.map(item => [item.kind, item.reason]), [
    ['proposal', 'operator_approval_required'], ['claim', 'exact_approval'], ['execution', 'uncertain'],
    ['rejection', 'tool_out_of_scope'], ['outcome', 'missing_outcome_assurance'],
  ]);
  assert.ok(projected.evidence.every(item => item.workspace === 'workspace'));
  assert.equal(projected.claims[0].input?.priorClaims, 0);
  assert.equal(projected.claims[0].evidence.resource, 'connection-id');
  assert.doesNotMatch(JSON.stringify(projected), /PRIVATE|private-digest|"actor"/);
  delete supervisor.journal[1].claimDecision;
  const legacy = projectGovernanceRun('workspace', run, Date.now())!;
  assert.equal(legacy.claims[0].input, undefined);
  assert.equal(legacy.claims[0].evidence.coverage, 'partial');
  const store: Pick<RuntimeStorage, 'list'> = {async list({prefix, limit}) {
    assert.equal(prefix, 'run:');
    assert.equal(limit, 81);
    return new Map();
  }};
  assert.deepEqual(await readGovernance(store, 'other-workspace', Date.now()), {runs: [], scannedRuns: 0, truncated: false});
});

test('rejection observations are bounded and never persist rejected values', () => {
  const supervisor = supervisorRecord({version: 0, limits: DEFAULT_SUPERVISOR_LIMITS}, DEFAULT_SUPERVISOR_LIMITS);
  const run: Run = {id: 'run', agentId: 'agent', kind: 'trial', actor: 'owner', startedAt: new Date(1000).toISOString(),
    status: 'failed', tokens: 0, supervisor, events: []};
  for (let i = 0; i < 16; i++) assert.equal(recordGovernanceRejection(run, 'invalid_arguments'), true);
  assert.equal(recordGovernanceRejection(run, 'invalid_arguments'), false);
  assert.equal(projectGovernanceRun('workspace', run, Date.now())!.rejectionLimitReached, true);
});
