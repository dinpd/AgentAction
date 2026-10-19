/** Real Worker handlers + real browser; no mocked authorization responses. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { startIndependentStack } from './independent-stack.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const shots = process.env.SCREENSHOT_DIR || '/tmp/agentaction-390-browser';
await mkdir(shots, { recursive: true });
const stack = process.env.DEMO_ORIGIN ? null : await startIndependentStack();
const origin = process.env.DEMO_ORIGIN || stack.origin('frontend');
const refundOrigin = process.env.REFUND_ORIGIN || origin;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(15000);
const errors = [], outbound = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (![origin, refundOrigin].some(base => request.url().startsWith(base + '/'))) outbound.push(request.url()); });
async function run(scenario) {
  const oldRun = await page.locator('#run-status').getAttribute('data-run-id');
  await page.locator(scenario === 'happy_path' ? '#run-authorized' : `[data-scenario="${scenario}"]`).click();
  await page.waitForFunction(previous => {
    const current = document.querySelector('#run-status').dataset.runId;
    return current && current !== previous;
  }, oldRun);
  assert.equal(await page.locator('#run-authorized').isDisabled(), false);
}
try {
  await page.goto(refundOrigin + '/');
  await page.getByRole('link', { name: 'Open the shared authority demo' }).click();
  await page.getByRole('heading', { name: 'One task. Two providers. Shared authority.' }).waitFor();
  for (const viewport of [{ width: 1440, height: 1050 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await run('happy_path');
    assert.equal(await page.locator('#refund-total').textContent(), '$40');
    assert.equal(await page.locator('#refund-count').textContent(), '1');
    assert.equal(await page.locator('#case-state').textContent(), 'Closed');
    assert.equal(await page.locator('#grant-list .grant').count(), 2);
    assert.equal(await page.getByRole('link', {name:'Independent payment service ↗'}).count(),1);
    assert.match(await page.locator('#service-evidence').textContent(), /independent-services/);
    assert.match(await page.locator('#service-evidence').textContent(), /authorityFingerprint/);
    assert.equal(await page.locator('.execution-receipt').count(), 2);
    await page.locator('.execution-receipt summary').first().click();
    assert.match(await page.locator('.execution-receipt').first().textContent(), /"status": "executed"/);
    await page.locator('#grant-list .grant summary').first().click();
    assert.match(await page.locator('#grant-list .grant').first().textContent(), /agentaction-demo-payments\.drisw\.workers\.dev/);
    assert.match(await page.locator('#grant-list .grant pre').first().textContent(), /"amountCents": 4000/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: `${shots}/${viewport.width > 1000 ? 'desktop' : 'mobile'}.png`, fullPage: true });
    for (const scenario of ['changed_amount', 'replay', 'wrong_provider', 'impostor', 'revoked', 'untrusted_issuer', 'expired', 'provider_policy']) {
      await run(scenario);
      assert.equal(await page.locator(`[data-scenario="${scenario}"]`).getAttribute('aria-pressed'), 'true');
      assert.match(await page.locator('#run-status').textContent(), /blocked/i);
      assert.equal(await page.locator('#refund-count').textContent(), scenario === 'replay' ? '1' : '0');
      assert.equal(await page.locator('#refund-total').textContent(), scenario === 'replay' ? '$40' : '$0');
      assert.equal(await page.locator('#case-state').textContent(), scenario === 'replay' ? 'Closed' : 'Open');
      assert.ok(await page.locator('#evidence-timeline .deny').count() > 0);
      if (scenario === 'impostor') assert.equal(await page.locator('#payload-count').textContent(), '0');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), scenario);
    }
    await page.locator('#reset-authority').click();
    assert.equal(await page.locator('#refund-count').textContent(), '0');
    assert.equal(await page.locator('#grant-list .grant').count(), 0);
    assert.equal(await page.locator('#case-state').textContent(), 'Open');
    assert.equal(await page.locator('#run-status').getAttribute('data-run-id'), null);
  }
  // Render a partial-outcome response distinctly from a zero-effect rejection.
  const partial=await (await page.request.post(origin+'/api/shared-authority/run',{data:{scenario:'happy_path'}})).json();
  partial.blocked=true;partial.workflowComplete=false;partial.effects.caseClosed=false;
  await page.route('**/api/shared-authority/run',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(partial)}));
  await page.locator('#run-authorized').click();
  await page.waitForFunction(()=>document.querySelector('#run-status').textContent.includes('Workflow stopped after a verified refund'));
  assert.equal(await page.locator('#refund-total').textContent(),'$40');
  assert.equal(await page.locator('#case-state').textContent(),'Open');
  assert.doesNotMatch(await page.locator('#run-status').textContent(),/No refund executed/);
  await page.unroute('**/api/shared-authority/run');

  // An interrupted request clears previous effects and leaves controls usable.
  await page.route('**/api/shared-authority/run', route => route.abort());
  await page.locator('#run-authorized').click();
  await page.waitForFunction(() => document.querySelector('#run-status').textContent.includes('could not complete'));
  assert.equal(await page.locator('#refund-count').textContent(), 'Unknown');
  assert.equal(await page.locator('#case-state').textContent(), 'Unknown');
  assert.equal(await page.locator('#run-authorized').isDisabled(), false);
  await page.unroute('**/api/shared-authority/run');
  await run('happy_path');
  await page.getByRole('link', { name: '← Original refund demo' }).click();
  assert.equal(await page.locator('#run').count(), 1);
  assert.deepEqual(errors, []);
  assert.deepEqual(outbound, []);
  console.log('Shared authority browser acceptance passed: both providers, all eight break controls, effect counts, readable proofs, repeat/reset, network failure recovery and desktop/mobile layout.');
} finally {
  await browser.close();
  if (stack) await stack.close();
}
