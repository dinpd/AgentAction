import assert from 'node:assert/strict';
import test from 'node:test';
import { claimAction, DEFAULT_SUPERVISOR_LIMITS, evaluateClaim, proposeAction, supervisorRecord } from '../src/execution-supervisor.ts';

test('the pure decision agrees with live claim eligibility and leaves evidence unchanged', () => {
  const limits = {...DEFAULT_SUPERVISOR_LIMITS, maxCalls: 1, approvalTtlMs: 100};
  const state = supervisorRecord({version: 2, limits}, limits);
  const action = proposeAction(state, 'approval', 'binding', 1_000);
  const base = {approvalPending: true, bindingMatches: true, policyMatches: true, expiresAt: 1_100, at: 1_099, priorClaims: 0, maxCalls: 1};
  const original = structuredClone(state);
  assert.deepEqual(evaluateClaim(base), {decision: 'allow', reason: 'exact_approval'});
  assert.deepEqual(evaluateClaim({...base, bindingMatches: false, at: 1_100, priorClaims: 1}), {decision: 'deny', reason: 'binding_or_policy_changed'});
  assert.deepEqual(evaluateClaim({...base, at: 1_100, priorClaims: 1}), {decision: 'deny', reason: 'approval_expired'});
  assert.deepEqual(state, original);
  assert.throws(() => claimAction(state, 'approval', 'changed', 2, 'operator', 1_099), /changed/);
  assert.throws(() => claimAction(state, 'approval', 'binding', 3, 'operator', 1_099), /changed/);
  assert.throws(() => claimAction(state, 'approval', 'binding', 2, 'operator', 1_100), /expired/);
  assert.equal(claimAction(state, 'approval', 'binding', 2, 'operator', 1_099).id, action.id);
  assert.deepEqual(evaluateClaim({...base, approvalPending: false, priorClaims: 1}), {decision: 'deny', reason: 'approval_unavailable'});
  assert.throws(() => claimAction(state, 'approval', 'binding', 2, 'operator', 1_099), /consumed/);
  assert.deepEqual(evaluateClaim({...base, priorClaims: 1}), {decision: 'deny', reason: 'call_budget_exhausted'});
});
