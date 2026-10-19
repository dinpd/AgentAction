/** Real Worker handlers + real browser; no mocked authorization responses. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import worker from '../src/worker.ts';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const shots = process.env.SCREENSHOT_DIR || '/tmp/agentaction-388-browser';
await mkdir(shots, { recursive: true });
const server = process.env.DEMO_ORIGIN ? null : createServer(async (req, res) => {
  try {
    let body = ''; for await (const chunk of req) body += chunk;
    const response = await worker.fetch(new Request(new URL(req.url, 'http://localhost'), {
      method: req.method, headers: req.headers, ...(body ? { body } : {}),
    }), {});
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500); res.end('Test bridge failed'); }
});
if (server) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = process.env.DEMO_ORIGIN || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(15000);
const errors = [], outbound = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (!request.url().startsWith(origin + '/')) outbound.push(request.url()); });
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
  await page.goto(origin + '/');
  await page.getByRole('link', { name: 'Open the shared authority demo' }).click();
  await page.getByRole('heading', { name: 'One task. Two providers. Shared authority.' }).waitFor();
  for (const viewport of [{ width: 1440, height: 1050 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await run('happy_path');
    assert.equal(await page.locator('#refund-total').textContent(), '$40');
    assert.equal(await page.locator('#refund-count').textContent(), '1');
    assert.equal(await page.locator('#case-state').textContent(), 'Closed');
    assert.equal(await page.locator('#grant-list .grant').count(), 2);
    assert.equal(await page.locator('.execution-receipt').count(), 2);
    await page.locator('.execution-receipt summary').first().click();
    assert.match(await page.locator('.execution-receipt').first().textContent(), /"status": "executed"/);
    await page.locator('#grant-list .grant summary').first().click();
    assert.match(await page.locator('#grant-list .grant').first().textContent(), /payments\.demo\.agentaction\.local/);
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
  // An interrupted request clears previous effects and leaves controls usable.
  await page.route('**/api/shared-authority/run', route => route.abort());
  await page.locator('#run-authorized').click();
  await page.waitForFunction(() => document.querySelector('#run-status').textContent.includes('could not complete'));
  assert.equal(await page.locator('#refund-count').textContent(), '0');
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
  if (server) await new Promise(resolve => server.close(resolve));
}
