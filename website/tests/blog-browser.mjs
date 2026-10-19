import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROME_PATH });
const origin = process.env.BLOG_ORIGIN ?? 'http://localhost:3000';
const errors = [];
const page = await browser.newPage({ reducedMotion: 'reduce' });
page.on('pageerror', (error) => errors.push(error.message));
const permalink = '/blog/agentic-iam-digest-2026-10-17';
const previousPermalink = '/blog/agentic-iam-digest-2026-10-07';
try {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(origin);
    assert.equal(await page.locator('#mcp-directory').count(), 0);
    const directory = page.locator('#platform').getByRole('link', { name: 'Browse MCP servers', exact: true });
    assert.equal(await directory.getAttribute('href'), 'https://mcpcheck.agentaction.dev/servers');
    assert.ok(await directory.isVisible());
    const highlight = page.locator('#iam-digest');
    assert.match(await highlight.textContent(), /October 7–17, 2026/);
    const digestBox = await highlight.boundingBox();
    const news = page.locator('#product-news');
    assert.match(await news.textContent(), /New in AgentAction/);
    assert.equal(await news.getByRole('link', { name: 'See what changed' }).getAttribute('href'), '/whats-new');
    const newsBox = await news.boundingBox();
    const heroBox = await page.locator('#content').boundingBox();
    assert.ok(digestBox.y + digestBox.height <= heroBox.y + 1, 'digest precedes hero');
    assert.ok(await highlight.locator('p').evaluate((summary) => parseFloat(getComputedStyle(summary).fontSize) >= 14), 'readable summary');
    for (const section of [highlight, news]) {
      assert.ok(await section.locator('.update-label').evaluate((label) => getComputedStyle(label).textTransform === 'uppercase'), 'styled section label');
      assert.ok(await section.locator('h2').evaluate((heading) => parseFloat(getComputedStyle(heading).fontWeight) >= 700), 'strong feature headline');
    }
    assert.ok(await highlight.locator('a').evaluate((link) => parseFloat(getComputedStyle(link).fontSize) >= 14), 'readable digest link');
    if (width === 1440) {
      assert.ok(Math.abs(digestBox.y - newsBox.y) <= 1, 'updates share a desktop row');
      assert.ok(newsBox.x >= digestBox.x + digestBox.width - 1, 'news sits beside digest');
      assert.ok(digestBox.height <= 210, 'compact desktop updates');
      assert.ok(await highlight.locator('h2').evaluate((heading) => parseFloat(getComputedStyle(heading).fontSize) <= 20), 'secondary headline scale');
    }
    else assert.ok(newsBox.y >= digestBox.y + digestBox.height - 1, 'updates stack on mobile');
    await page.screenshot({ path: `/private/tmp/agentaction-updates-${width}.png` });
    const homepageTitle = await news.locator('h2').textContent();
    await news.getByRole('link', { name: 'See what changed' }).click();
    await page.waitForURL('**/whats-new');
    assert.equal(await page.locator('.news-item').count() >= 5, true);
    assert.equal(await page.locator('.news-item h2').first().textContent(), homepageTitle);
    assert.ok(homepageTitle.trim());
    assert.ok(await page.locator('.news-source').first().evaluate((link) => parseFloat(getComputedStyle(link).fontSize) >= 14));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'news page overflow');
    await page.screenshot({ path: `/private/tmp/agentaction-whats-new-${width}.png`, fullPage: true });
    await page.goto(origin);
    await highlight.getByRole('link', { name: 'Read the digest and outlook' }).click();
    await page.waitForURL(`**${permalink}`);
    assert.match(await page.locator('h1').textContent(), /Authority has to hold/);
    assert.match(await page.locator('.blog-byline').textContent(), /October 18, 2026/);
    assert.ok(await page.locator('.blog-hero img').evaluate((img) => img.complete && img.naturalWidth > 0));
    await page.getByRole('link', { name: 'Longer-term vector', exact: true }).click();
    assert.equal(new URL(page.url()).hash, '#vector');
    await page.goto(`${origin}/blog`);
    assert.equal(await page.locator('.blog-preview').count(), 2);
    assert.match(await page.locator('.blog-preview').first().textContent(), /Issue 02/);
    assert.match(await page.locator('.blog-preview').last().textContent(), /Issue 01/);
    await page.goto(`${origin}${previousPermalink}`);
    assert.match(await page.locator('h1').textContent(), /Identity moves into/);
    assert.match(await page.locator('.blog-byline').textContent(), /October 7, 2026/);
    for (const route of ['/', '/blog', previousPermalink, permalink]) {
      await page.goto(`${origin}${route}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}px on ${route}`);
    }
    assert.ok(await page.locator('.blog-body').evaluate((body) => parseFloat(getComputedStyle(body).fontSize) >= 16));
    await page.screenshot({ path: `/private/tmp/agentaction-digest-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto(origin);
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'text zoom overflow');
  await page.goto(`${origin}/whats-new`);
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'news text zoom overflow');
  await page.goto(`${origin}${permalink}`);
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'digest text zoom overflow');
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const plainPage = await noScript.newPage();
  await plainPage.goto(origin);
  assert.match(await plainPage.locator('#product-news').textContent(), /New in AgentAction/);
  assert.ok(await plainPage.locator('#iam-digest a').isVisible());
  await plainPage.getByRole('link', { name: 'See what changed' }).click();
  await plainPage.waitForURL('**/whats-new');
  assert.equal(await plainPage.locator('.news-item').count() >= 5, true);
  await plainPage.goto(`${origin}${permalink}`);
  assert.match(await plainPage.locator('#vector').textContent(), /Editorial outlook/);
  await noScript.close();
  assert.deepEqual(errors, []);
  console.log('Blog and homepage browser acceptance passed at desktop, mobile, 200% text size and without JavaScript.');
} finally {
  await browser.close();
}
