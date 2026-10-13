import assert from 'node:assert/strict';
import test from 'node:test';
import { createProductNewsLoader, RELEASES_URL, selectProductNews } from '../app/product-news.mjs';

const release = (fields = {}) => ({
  tag_name: 'v0.50.0-rc.1', draft: false, prerelease: true,
  published_at: '2026-10-11T03:10:14Z',
  body: '### Website highlight\n\n- Automatic refunds: Handle eligible refunds within your limit, then check the outcome. Synthetic preview.\n\n### Added\n\n- Technical RS256 details.',
  ...fields,
});
const fallback = selectProductNews([release()]);

test('selects newest public feature, excluding patches, drafts, maintenance and raw technical notes', () => {
  const selected = selectProductNews([
    release(),
    release({ tag_name: 'v0.51.0', prerelease: false, published_at: '2026-10-12T00:00:00Z' }),
    release({ tag_name: 'v0.51.1', published_at: '2026-10-13T00:00:00Z' }),
    release({ tag_name: 'v0.52.0', draft: true, published_at: '2026-10-14T00:00:00Z' }),
    release({ tag_name: 'v0.53.0', body: '### Fixed\n\n- Bug.', published_at: '2026-10-15T00:00:00Z' }),
    release({ tag_name: 'v0.54.0', body: '### Added\n\n- Technical notes.', published_at: '2026-10-16T00:00:00Z' }),
  ]);
  assert.equal(selected.tag, 'v0.51.0');
  assert.equal(selected.prerelease, false);
  assert.equal(selected.title, 'Automatic refunds');
  assert.match(selected.summary, /Synthetic preview/);
  assert.doesNotMatch(JSON.stringify(selected), /RS256/);
  assert.equal(selected.href, 'https://github.com/dinpd/AgentAction/releases/tag/v0.51.0');
  assert.equal(fallback.prerelease, true);
  assert.equal(selectProductNews([release({ prerelease: false })]).prerelease, true);
  assert.equal(selectProductNews([release({ tag_name: 'v1.0.0' })]).tag, 'v1.0.0');
});

test('rejects malformed data, bounds public copy and constructs source links independently', () => {
  for (const entry of [null, {}, release({ tag_name: '../../evil' }), release({ published_at: 'invalid' }), release({ body: '' }), release({ body: 'x'.repeat(300_000) }), release({ body: `### Website highlight\n\n- Title: ${'word '.repeat(100)}\n\n### Added\n\n- Feature.` })]) assert.equal(selectProductNews([entry]), null);
  assert.equal(selectProductNews({ message: 'rate limit' }), null);
  const selected = selectProductNews([release({ html_url: 'https://evil.example', body: '### Website highlight\n\n- **New feature**: [Useful](https://evil.example) <b>text</b>.\n\n### Added\n\n- Details.' })]);
  assert.equal(selected.title, 'New feature');
  assert.equal(selected.summary, 'Useful text.');
  assert.ok(selected.href.startsWith('https://github.com/dinpd/AgentAction/releases/tag/'));
});

test('refreshes, coalesces, caches for an hour and retains last good content with failure backoff', async () => {
  let time = 0;
  let calls = 0;
  const load = createProductNewsLoader(fallback, {
    now: () => time,
    fetcher: async (url, options) => {
      assert.equal(url, RELEASES_URL);
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, undefined);
      if (++calls > 1) throw new Error('unavailable');
      return Response.json([release({ tag_name: 'v0.51.0', published_at: '2026-10-12T00:00:00Z' })]);
    },
  });
  assert.ok((await Promise.all([load(), load(), load()])).every((news) => news.tag === 'v0.51.0'));
  assert.equal(calls, 1);
  time = 3_599_999;
  assert.equal((await load()).tag, 'v0.51.0');
  assert.equal(calls, 1);
  time = 3_600_001;
  assert.equal((await load()).tag, 'v0.51.0');
  assert.equal(calls, 2);
  await load();
  assert.equal(calls, 2);
});

test('falls back on rate limits, malformed or oversized feeds and older features', async () => {
  for (const response of [new Response('', { status: 429 }), new Response('{'), Response.json({ message: 'error' }), Response.json([release({ published_at: '2026-10-01T00:00:00Z' })]), new Response('x'.repeat(300_000)), new Response('small', { headers: { 'content-length': '300000' } })]) {
    assert.deepEqual(await createProductNewsLoader(fallback, { fetcher: async () => response })(), fallback);
  }
});

test('aborts slow requests and retains fallback', async () => {
  let aborted = false;
  const load = createProductNewsLoader(fallback, {
    timeoutMs: 10,
    fetcher: async (_, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => { aborted = true; reject(new Error('timeout')); });
    }),
  });
  assert.deepEqual(await load(), fallback);
  assert.equal(aborted, true);
});
