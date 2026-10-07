import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROME_PATH });
const origin = process.env.BLOG_ORIGIN ?? 'http://localhost:3000';
const errors = [];
const page = await browser.newPage({ reducedMotion: 'reduce' });
page.on('pageerror', (error) => errors.push(error.message));
const permalink = '/blog/agentic-iam-digest-2026-10-07';
try {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(origin);
    assert.equal(await page.locator('#mcp-directory').count(), 0);
    const directory = page.locator('#platform').getByRole('link', { name: 'Browse MCP servers', exact: true });
    assert.equal(await directory.getAttribute('href'), 'https://mcpcheck.agentaction.dev/servers');
    assert.ok(await directory.isVisible());
    const highlight = page.locator('#iam-digest');
    assert.match(await highlight.textContent(), /bounded delegation/);
    await highlight.getByRole('link', { name: 'Read the digest and outlook' }).click();
    await page.waitForURL(`**${permalink}`);
    assert.match(await page.locator('h1').textContent(), /Identity moves into/);
    assert.ok(await page.locator('.blog-hero img').evaluate((img) => img.complete && img.naturalWidth > 0));
    await page.getByRole('link', { name: 'Longer-term vector', exact: true }).click();
    assert.equal(new URL(page.url()).hash, '#vector');
    for (const route of ['/', '/blog', permalink]) {
      await page.goto(`${origin}${route}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}px on ${route}`);
    }
    assert.ok(await page.locator('.blog-body').evaluate((body) => parseFloat(getComputedStyle(body).fontSize) >= 16));
    await page.screenshot({ path: `/private/tmp/agentaction-digest-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'text zoom overflow');
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const plainPage = await noScript.newPage();
  await plainPage.goto(`${origin}${permalink}`);
  assert.match(await plainPage.locator('#vector').textContent(), /Editorial outlook/);
  await noScript.close();
  assert.deepEqual(errors, []);
  console.log('Blog and homepage browser acceptance passed at desktop, mobile, 200% text size and without JavaScript.');
} finally {
  await browser.close();
}
