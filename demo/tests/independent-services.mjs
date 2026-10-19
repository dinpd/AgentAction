import assert from 'node:assert/strict';
import { startIndependentStack } from './independent-stack.mjs';
import { ISSUER, PAYMENT_ENDPOINT, PROFILE, SUPPORT_ENDPOINT, REFUND, canonical, digest, importTrusted, verify } from '../src/shared-authority/protocol.ts';

const stack = process.env.DEMO_ORIGIN ? null : await startIndependentStack();
const frontend = process.env.DEMO_ORIGIN || stack.origin('frontend');
const authority = process.env.AUTHORITY_ORIGIN || (stack ? stack.origin('authority') : ISSUER);
const payments = process.env.PAYMENTS_ORIGIN || (stack ? stack.origin('payments') : new URL(PAYMENT_ENDPOINT).origin);
const support = process.env.SUPPORT_ORIGIN || (stack ? stack.origin('support') : new URL(SUPPORT_ENDPOINT).origin);
const read = async response => {
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
};
const run = async scenario => read(await fetch(frontend + '/api/shared-authority/run', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scenario }),
}));
const direct = async (origin, body) => {
  const response = await fetch(origin + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, challenge: crypto.randomUUID() }) });
  assert.ok([200, 403].includes(response.status), String(response.status));
  return response.json();
};
try {
  if (process.env.REFUND_ORIGIN) {
    const sharedPage = await fetch(frontend + '/', { redirect: 'manual' });
    assert.equal(sharedPage.status, 200);
    const sharedHTML = await sharedPage.text();
    assert.match(sharedHTML, /One task\. Two providers\./);
    assert.ok(sharedHTML.includes('href="' + process.env.REFUND_ORIGIN + '/"'));
    const refundPage = await fetch(process.env.REFUND_ORIGIN + '/', { redirect: 'manual' });
    assert.equal(refundPage.status, 200);
    const refundHTML = await refundPage.text();
    assert.match(refundHTML, /id="run"/);
    assert.ok(refundHTML.includes('href="' + frontend + '/"'));
  }
  for (const [origin, service] of [[authority, 'AgentAction authority'], [payments, 'PaymentsCo'], [support, 'SupportCo']]) {
    const health = await read(await fetch(origin + '/health'));
    assert.equal(health.service, service); assert.equal(health.mode, 'independent-worker');
  }
  const jwks = await read(await fetch(authority + '/.well-known/jwks.json'));
  assert.equal(jwks.issuer, ISSUER);
  const happy = await run('happy_path');
  assert.equal(happy.deployment.mode, 'independent-services');
  assert.deepEqual(happy.deployment.providers, [PAYMENT_ENDPOINT, SUPPORT_ENDPOINT]);
  assert.equal(happy.workflowComplete, true);
  assert.deepEqual(happy.effects, { refundCount: 1, refundedCents: 4000, caseClosed: true, paymentPayloads: 1, supportPayloads: 1 });
  assert.equal(happy.grants.length, 2); assert.equal(happy.receipts.length, 2);
  const root = await importTrusted({ kid: happy.trust.kid, jwk: happy.trust.publicKey });
  assert.equal(jwks.keys[0].x, happy.trust.publicKey.x);
  assert.equal(jwks.keys[0].y, happy.trust.publicKey.y);
  assert.notEqual(happy.trust.providers[0].publicKey.x, happy.trust.providers[1].publicKey.x);
  assert.notEqual(happy.trust.providers[0].publicKey.x, happy.trust.publicKey.x);
  for (const [index, endpoint] of [PAYMENT_ENDPOINT, SUPPORT_ENDPOINT].entries()) {
    const grant = await verify(happy.grants[index].proof, root.publicKey, root.kid, PROFILE);
    assert.equal(grant.issuer, ISSUER); assert.equal(grant.audience, endpoint);
    const identity = happy.trust.providers[index];
    const key = await importTrusted({ kid: identity.kid, jwk: identity.publicKey });
    const receipt = await verify(happy.receipts[index].proof, key.publicKey, key.kid, 'agentaction.demo.execution.v1');
    assert.equal(receipt.grantId, grant.id); assert.equal(receipt.status, 'executed');
    const snapshot = await verify(happy.snapshots[identity.provider].proof, key.publicKey, key.kid, 'agentaction.demo.snapshot.v1');
    assert.equal(snapshot.authorityFingerprint, await digest(happy.trust.publicKey));
  }
  assert.deepEqual(happy.grants.map(g => g.claims.issuer), [ISSUER, ISSUER]);
  assert.notEqual(happy.grants[0].claims.id, happy.grants[1].claims.id);
  assert.ok(happy.transport.some(call => call.provider === 'PaymentsCo' && call.operation === 'execute' && call.status === 200));
  assert.ok(happy.transport.some(call => call.provider === 'SupportCo' && call.operation === 'execute' && call.status === 200));
  const stages = happy.steps.map(step => step.title);
  assert.ok(stages.indexOf('Payment execution receipt verified') < stages.indexOf('Case 1042 closed'));
  assert.ok(!JSON.stringify(happy).includes('"d":'));
  assert.ok(!JSON.stringify(happy).includes('privateKey'));
  const reasons = { changed_amount: 'action_changed', wrong_provider: 'wrong_provider', impostor: 'provider_identity_mismatch',
    revoked: 'revoked', untrusted_issuer: 'invalid_signature_or_profile', expired: 'expired_or_invalid_lifetime', provider_policy: 'provider_business_policy' };
  let unused;
  for (const [scenario, reason] of Object.entries(reasons)) {
    const value = await run(scenario);
    assert.equal(value.workflowComplete, false, scenario);
    assert.equal(value.blocked, true, scenario);
    assert.equal(value.effects.refundedCents, 0, scenario);
    assert.equal(value.effects.caseClosed, false, scenario);
    assert.ok(value.steps.some(step => step.reason === reason), scenario);
    assert.equal(value.receipts.length, 0);
    if (scenario === 'impostor') assert.equal(value.effects.paymentPayloads + value.effects.supportPayloads, 0);
    if (scenario === 'changed_amount') unused = value;
  }
  const replay = await run('replay');
  assert.equal(replay.effects.refundCount, 1); assert.equal(replay.effects.refundedCents, 4000);
  assert.equal(replay.effects.caseClosed, true); assert.equal(replay.blocked, true);

  // Exercise an unconsumed grant directly through the public provider endpoint.
  // No privileged issuance/reset endpoint is exposed to the test client.
  const request = { runId: unused.runId, grant: unused.grants[0].proof, action: REFUND };
  const attempts = await Promise.all(Array.from({ length: 12 }, () => direct(payments, request)));
  assert.equal(attempts.filter(value => value.result.allowed).length, 1);
  const count = await read(await fetch(payments + '/runs/' + unused.runId + '?challenge=before-restart'));
  assert.equal(count.claims.refundCount, 1); assert.equal(count.claims.refundedCents, 4000);
  const wrong = await direct(support, request);
  assert.equal(wrong.result.reason, 'wrong_provider');
  assert.equal(wrong.snapshot.claims.caseClosed, false);
  const forged = await direct(payments, { ...request, grant: unused.grants[0].proof.slice(0, -8) + 'AAAAAAAA' });
  assert.equal(forged.result.allowed, false);

  for (const [origin, path] of [[authority, '/grant'], [authority, '/start'], [authority, '/certificate'], [authority, '/revoke'], [payments, '/reset'], [payments, '/policy'], [support, '/reset']]) {
    assert.equal((await fetch(origin + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 404);
  }
  if (stack) {
    const certBefore = await read(await fetch(payments + '/identity?run=' + unused.runId + '&challenge=before'));
    await stack.stop('payments'); await stack.start('payments');
    const certAfter = await read(await fetch(payments + '/identity?run=' + unused.runId + '&challenge=after'));
    assert.equal(canonical(certBefore.publicKey), canonical(certAfter.publicKey));
    assert.equal((await direct(payments, request)).result.reason, 'already_consumed');
    const after = await read(await fetch(payments + '/runs/' + unused.runId + '?challenge=after-restart'));
    assert.equal(after.claims.refundCount, 1); assert.equal(after.claims.refundedCents, 4000);
    await stack.stop('authority'); await stack.start('authority');
    const keysAfter = await read(await fetch(authority + '/.well-known/jwks.json'));
    assert.equal(canonical(keysAfter), canonical(jwks));
    await stack.stop('support');
    const unavailable = await fetch(frontend + '/api/shared-authority/run', { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scenario: 'happy_path' }) });
    assert.equal(unavailable.status, 503);
    const failure = await unavailable.json(); assert.equal(failure.outcomeUnknown, true);
    assert.equal(failure.effects, undefined);
    assert.match(failure.runId, /^[0-9a-f-]{36}$/);
    assert.equal(failure.recovery.length, 2);
    await stack.start('support');
  }
  console.log('Independent service acceptance passed: distinct Worker processes/endpoints, shared public authority, separate signing keys/state, all eight controls, direct grant verification, 12 concurrent calls, persistent replay/key state across restarts, service-only privilege boundaries and fail-closed outage handling.');
} finally { if (stack) await stack.close(); }
