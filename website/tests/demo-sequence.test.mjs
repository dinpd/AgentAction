import assert from 'node:assert/strict';
import test from 'node:test';
import { servers, scenarios, initialState, advance, planFor, runScenario } from '../public/demo/engine.js';

test('one sequence crosses five servers and changes the same refund decision over time', () => {
  const state = runScenario('verified');
  assert.equal(servers.length, 5);
  assert.deepEqual(new Set(state.events.map(e => e.server)), new Set(servers.map(s => s.id)));
  const refunds = state.events.filter(e => e.tool === 'refund.create');
  assert.deepEqual(refunds.map(e => e.decision), ['CHALLENGE', 'ALLOW', 'DENY']);
  for (const event of refunds) assert.deepEqual(event.request, refunds[0].request);
  assert.equal(refunds.filter(e => e.executed).length, 1);
  assert.ok(refunds[1].evidence.some(f => f.kind === 'duplicate' && f.source === 'call_06'));
  assert.equal(refunds[2].contextBefore.find(f => f.kind === 'refund').value.status, 'confirmed');
});

test('message access depends on another server outcome and removes internal identifiers', () => {
  const messages = runScenario('verified').events.filter(e => e.tool === 'email.send');
  assert.deepEqual(messages.map(e => e.decision), ['CHALLENGE', 'ALLOW']);
  assert.equal(messages[0].executed, false);
  assert.equal(messages[1].executed, true);
  assert.equal(messages[1].sanitized, true);
  assert.equal(messages[1].after.to, 'alex@example.test');
  assert.equal(messages[1].after.body, 'Your $750 refund is complete.');
  assert.doesNotMatch(JSON.stringify(messages[1].after), /ref_603|internal_902/);
});

test('sanitization removes untrusted notes and sensitive fields from retained evidence', () => {
  const state = runScenario('verified');
  const order = state.events.find(e => e.tool === 'order.get');
  assert.match(order.before.note, /Ignore previous rules/);
  assert.equal(order.after.note, undefined);
  assert.doesNotMatch(JSON.stringify(state.facts), /Ignore previous rules|home_address|date_of_birth|card_number|provider_token|case_notes/);
  assert.equal(state.facts.find(f => f.kind === 'ownership').value.amount, 750);
  assert.equal(state.facts.find(f => f.kind === 'duplicate').value.customer_id, 'cus_104');
});

test('repeated claims challenge for corroboration rather than establishing abuse', () => {
  const state = runScenario('history');
  const refunds = state.events.filter(e => e.tool === 'refund.create');
  assert.deepEqual(refunds.map(e => e.decision), ['CHALLENGE', 'CHALLENGE', 'ALLOW', 'DENY']);
  assert.match(refunds[1].required[0], /corroboration/);
  assert.equal(state.facts.find(f => f.kind === 'corroboration').value.verified_abuse, false);
  assert.ok(refunds[2].evidence.some(f => f.kind === 'corroboration'));
});

test('historical refund in another channel blocks execution in the new session', () => {
  const state = runScenario('refunded');
  assert.equal(state.receipt, null);
  assert.ok(state.events.filter(e => e.tool === 'refund.create').every(e => e.decision === 'DENY' && !e.executed));
  assert.ok(state.events.filter(e => e.tool === 'email.send').every(e => !e.executed));
});

test('expired evidence triggers a new provider read before refund access is granted', () => {
  const state = runScenario('expired');
  const refunds = state.events.filter(e => e.tool === 'refund.create');
  assert.deepEqual(refunds.map(e => e.decision), ['CHALLENGE', 'CHALLENGE', 'ALLOW', 'DENY']);
  assert.equal(refunds[1].timeJump, 90);
  const stale = refunds[1].evidence.find(f => f.kind === 'duplicate');
  const fresh = refunds[2].evidence.find(f => f.kind === 'duplicate');
  assert.ok(stale.expiresAt < refunds[1].at);
  assert.ok(fresh.expiresAt > refunds[2].at);
  assert.notEqual(fresh.source, stale.source);
});

test('mismatched subject and out-of-scope tools never inherit earlier authority', () => {
  const state = runScenario('mismatch');
  assert.equal(state.receipt, null);
  assert.equal(state.events.filter(e => e.tool === 'refund.create' && e.executed).length, 0);
  assert.equal(state.events.find(e => e.tool === 'refund.create' && e.evidence.some(f => f.kind === 'duplicate')).decision, 'DENY');
  for (const scenario of scenarios) {
    const event = runScenario(scenario.id).events.at(-1);
    assert.equal(event.tool, 'customers.export');
    assert.equal(event.decision, 'DENY');
    assert.equal(event.executed, false);
  }
});

test('execution validates exact charge, amount, order and freshness rather than merely presence of evidence', () => {
  for (const [field, value] of [['amount', 751], ['order_id', 'ord_other'], ['duplicate_charge_id', 'chg_other'], ['currency', 'EUR'], ['duplicate_confirmed', false]]) {
    let state = initialState();
    while (state.cursor < 6) state = advance(state);
    state.facts.find(f => f.kind === 'duplicate').value[field] = value;
    state = advance(state);
    assert.equal(state.events.at(-1).decision, 'DENY', field);
    assert.equal(state.receipt, null);
  }
  let state = initialState();
  while (state.cursor < 6) state = advance(state);
  state.facts.find(f => f.kind === 'duplicate').expiresAt = state.now + 6;
  assert.equal(advance(state).events.at(-1).decision, 'CHALLENGE');
});

test('reads fail closed without customer scope, and rewinds produce independent deterministic snapshots', () => {
  let state = advance(initialState());
  const original = structuredClone(state);
  state.facts = [];
  assert.equal(advance(state).events.at(-1).executed, false);
  assert.equal(original.events.length, 1);
  for (const scenario of scenarios) {
    assert.deepEqual(runScenario(scenario.id), runScenario(scenario.id));
    const complete = runScenario(scenario.id);
    assert.equal(advance(complete), complete);
    assert.equal(initialState(scenario.id).receipt, null);
    assert.equal(complete.cursor, planFor(scenario.id).length);
  }
  assert.throws(() => initialState('unknown'));
});
