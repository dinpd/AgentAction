import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { artifacts, publication } from '../src/workflow/publish.mjs';

const repository = new URL('../../../', import.meta.url);
const recorded = new URL('../results/workflow-live-v2-1/', import.meta.url);

test('public report preserves the exact recorded corpus, summary and all attempts', () => {
  const p = publication(), bundle = JSON.parse(p.snapshot);
  for (const name of ['summary.json', 'corpus.json', 'raw.jsonl']) {
    const bytes = readFileSync(new URL(name, recorded), 'utf8');
    assert.equal(bundle.provenance[name], createHash('sha256').update(bytes).digest('hex'));
    const expected = name === 'raw.jsonl' ? bytes.trim().split('\n').map(JSON.parse) : JSON.parse(bytes);
    assert.deepEqual(bundle[name === 'summary.json' ? 'data' : name === 'corpus.json' ? 'corpus' : 'rows'], expected);
  }
  assert.equal(bundle.rows.length, 528);
  assert.equal(bundle.rows.flatMap(r => r.attempts).length, 678);
  assert.equal(bundle.corpus.cases.length, 44);
  assert.match(p.html, /Recorded experiment · September 27, 2026/);
  assert.doesNotMatch(p.script, /setInterval|fetch\('\/data'\)|LIVE API RUN/);
  assert.equal([...p.script.matchAll(/fetch\(/g)].length, 1);
  assert.match(p.script, /Report unavailable/);
});

test('committed website assets exactly match the reproducible publication', () => {
  for (const [path, bytes] of artifacts()) assert.equal(readFileSync(new URL(path, repository), 'utf8'), bytes, path);
});

test('missing or invalid saved results show a useful error without retrying', async () => {
  const { runInNewContext } = await import('node:vm');
  for (const response of [{ ok: false }, { ok: true, json: async () => ({ data: { fixture: true } }) }]) {
    const elements = new Map();
    let calls = 0;
    runInNewContext(publication().script, {
      document: { querySelector(selector) {
        if (!elements.has(selector)) elements.set(selector, { textContent: '' });
        return elements.get(selector);
      } },
      fetch: async () => { calls++; return response; },
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
    assert.equal(elements.get('#status').textContent, 'Report unavailable');
    assert.match(elements.get('#method').textContent, /Reload this page or use the Source & methodology link/);
  }
});
