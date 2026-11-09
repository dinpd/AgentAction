import assert from 'node:assert/strict';
import test from 'node:test';
import { policyLabWorkspace, seedPolicyLab } from './policy-lab-fixture.ts';

test('Policy Lab uses live Hermes evidence and isolates reads, replay and review from authority', async () => {
  const acme = policyLabWorkspace(), other = policyLabWorkspace();
  const {runId, token, agentId} = await seedPolicyLab('acme', acme.runtime);
  const original = structuredClone(acme.storage.data);
  const request = async (path: string, role = 'operator', body?: object, workspace = 'acme', host = acme) => {
    const response = await host.runtime.handle(new Request('https://runtime.test/' + path, {
      method: body ? 'POST' : 'GET', ...(body ? {body: JSON.stringify(body)} : {}),
      headers: {'x-runtime-workspace': workspace, 'x-runtime-role': role, 'x-runtime-actor': 'reviewer'},
    }));
    return {status: response.status, value: await response.json() as any};
  };
  const read = await request('policy-lab?days=7&agentId=' + agentId, 'viewer');
  assert.equal(read.status, 200);
  const {findings, metrics} = read.value;
  assert.equal(metrics.replayEligibleClaims, 4);
  assert.equal(metrics.deniedAttempts, 2);
  assert.equal(findings.find((item: any) => item.category === 'repeated_denials').recommendation.kind, 'agent');
  const candidate = findings[0].candidate;
  assert.equal(candidate.scope.agentId, agentId);
  assert.equal(candidate.scope.workspace, 'acme');
  assert.ok(!JSON.stringify(read.value).includes(token));
  assert.doesNotMatch(JSON.stringify(read.value), /PRIVATE/);
  assert.equal((await request('policy-lab', 'external')).status, 403);
  assert.equal((await request('policy-lab', 'owner', undefined, 'wrong')).status, 403);
  assert.equal((await request('policy-lab', 'owner', undefined, 'other', other)).value.findings.length, 0);
  const body = {findingId: findings[0].id, candidateId: candidate.id};
  assert.equal((await request('policy-lab-replay', 'viewer', body)).status, 403);
  assert.equal((await request('policy-lab-replay', 'operator', {...body, candidateId: 'forged'})).status, 409);
  assert.equal((await request('policy-lab-replay', 'operator', {...body, change: {maxCalls: 4}})).status, 400);
  const replay = await request('policy-lab-replay', 'operator', body);
  assert.equal(replay.status, 200);
  assert.equal(replay.value.newlyDenied, 1);
  assert.equal(replay.value.newlyAllowed, 0);
  assert.equal(replay.value.eligible, 4);
  assert.deepEqual(acme.storage.data, original);
  assert.equal(acme.calls(), 0);
  const review = {findingId: findings[0].id, status: 'candidate'};
  assert.equal((await request('policy-lab-review', 'viewer', review)).status, 403);
  assert.equal((await request('policy-lab-review', 'operator', review, 'other', other)).status, 404);
  assert.equal((await request('policy-lab-review', 'owner', review)).status, 200);
  assert.equal((await request('policy-lab', 'viewer')).value.findings[0].review, 'candidate');
  assert.deepEqual(acme.storage.data.get('run:' + runId), original.get('run:' + runId));
  assert.deepEqual([...acme.storage.data.keys()].filter(key => !original.has(key)), ['policy-lab-reviews']);
});
