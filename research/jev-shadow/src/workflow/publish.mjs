import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repository = resolve(root, '../..');
const source = resolve(root, 'results/workflow-live-v2-1');
const prefix = '/research/jev';
const github = 'https://github.com/dinpd/AgentAction/tree/main/research/jev-shadow';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// An explicit allowlist keeps credentials, journals and local run directories out.
export function publication() {
  const inputs = Object.fromEntries(['summary.json', 'corpus.json', 'raw.jsonl'].map(name => [name, readFileSync(resolve(source, name), 'utf8')]));
  const bundle = {
    data: JSON.parse(inputs['summary.json']),
    corpus: JSON.parse(inputs['corpus.json']),
    rows: inputs['raw.jsonl'].trim().split('\n').map(JSON.parse),
    provenance: Object.fromEntries(Object.entries(inputs).map(([name, bytes]) => [name, digest(bytes)])),
  };
  assert.equal(bundle.data.complete, true);
  assert.equal(bundle.data.fixture, false);
  assert.equal(bundle.data.version, 'workflow-v2.1');
  const snapshot = JSON.stringify(bundle) + '\n';
  const snapshotName = `recorded-${digest(snapshot).slice(0, 16)}.json`;
  let html = readFileSync(resolve(root, 'workflow-dashboard.html'), 'utf8');
  let script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  let style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const replace = (value, before, after) => {
    assert(value.includes(before), `Dashboard template changed: ${before.slice(0, 60)}`);
    return value.replace(before, after);
  };
  script = replace(script, "data.thresholds[engine]?`Pass ≥ ${data.thresholds[engine].selected.pass}; fail ≤ ${data.thresholds[engine].selected.fail} · selected on development`", "stage?.threshold?`Pass ≥ ${stage.threshold.pass}; fail ≤ ${stage.threshold.fail} · ${phase==='development'?'initial development thresholds':'selected on development'}`");
  script = replace(script, "&&(cohort==='all'||c.cohort===cohort)", "&&(phase!=='load'||c.cohort==='routine')&&(cohort==='all'||c.cohort===cohort)");
  script = replace(script, "const c=corpus.cases.find", "const repeats=[...new Set(rows.filter(w=>w.phase===phase&&w.case_id===$('#scenario').value).map(w=>w.repeat))].sort((a,b)=>a-b),previous=$('#repeat').value;$('#repeat').replaceChildren(...repeats.map(n=>{const o=el('option',String(n+1));o.value=String(n);return o}));if(repeats.includes(Number(previous)))$('#repeat').value=previous;const c=corpus.cases.find");
  script = replace(script, "if(c){$('#rationale')", "if(!c){$('#rationale').textContent='No recorded workflows in this phase/cohort.';$('#payload').textContent='';}if(c){$('#rationale')");
  script = replace(script, ' Video remains paused.', '');
  const refreshStart = script.indexOf('async function refresh()');
  assert(refreshStart > 0);
  script = script.slice(0, refreshStart) + `
async function refresh() {
  try {
    const response = await fetch('${prefix}/${snapshotName}');
    if (!response.ok) throw new Error('Snapshot unavailable');
    bundle = await response.json();
    if (!bundle.data?.complete || bundle.data.fixture || bundle.data.version !== 'workflow-v2.1' || !Array.isArray(bundle.rows) || !Array.isArray(bundle.corpus?.cases)) throw new Error('Invalid snapshot');
    $('#status').textContent = 'Recorded experiment · September 27, 2026';
    render();
  } catch {
    $('#status').textContent = 'Report unavailable';
    $('#method').textContent = 'The recorded results could not be loaded. Reload this page or use the Source & methodology link above.';
  }
}
for (const id of ['phase','cohort','scenario','repeat']) $('#'+id).onchange=render;
refresh();
`;
  style += '\nheader,.controls{flex-wrap:wrap;gap:12px}.report-links{display:flex;flex-wrap:wrap;gap:12px 24px;margin:18px 0}.inspector select{max-width:100%}.card{min-width:0}.recorded-note{max-width:90ch}@media(max-width:650px){.cards,.flow{grid-template-columns:1fr}h1{font-size:30px}.controls{align-items:flex-start}.inspector{padding:14px}.brand{line-height:1.7}}\n';
  html = html.replace(/<style>[\s\S]*?<\/style>/, `<link rel="stylesheet" href="${prefix}/dashboard.css">`);
  html = html.replace(/<script>[\s\S]*?<\/script>/, `<script src="${prefix}/dashboard.js" defer></script>`);
  html = replace(html, '<title>AgentAction — Workflow approval evaluation</title>', `<title>Jev vs LLMs: authorization experiment | AgentAction</title><meta name="description" content="Explore recorded Jev, GPT-4.1 mini and Groq GPT-OSS 20B results across synthetic approval workflows, with payloads, criteria and decision traces."><link rel="canonical" href="https://agentaction.dev/research/jev"><meta property="og:title" content="Jev vs LLMs: authorization experiment"><meta property="og:description" content="528 synthetic workflows. Three models. Explore decision quality, latency and unnecessary reviews."><meta property="og:type" content="article"><meta property="og:url" content="https://agentaction.dev/research/jev"><meta property="og:image" content="https://agentaction.dev/og.png">`);
  html = replace(html, 'id="status" class="badge">Waiting for results', 'id="status" role="status" class="badge">Recorded experiment · September 27, 2026');
  html = replace(html, '<h1>From request to approved action.</h1>', `<nav class="report-links" aria-label="Report links"><a href="/">AgentAction home</a><a href="${github}">Source &amp; methodology ↗</a><a href="${github}/results/workflow-live-v2-1/FINDINGS.md">Read the findings ↗</a></nav><h1>From request to approved action.</h1><p class="recorded-note">Explore a saved experiment using live model APIs and synthetic approval workflows. No new model calls or real actions run on this page. Jev was tested through the independent jevtypesafeai.com service. This is not a production safety or maximum-throughput claim.</p><noscript><p>This report needs JavaScript for interactive comparisons. Read the findings or source and methodology using the links above.</p></noscript>`);
  html = replace(html, '<option value="all">', '<option value="all" selected>');
  html = replace(html, '<html lang="en">', '<html lang="en"><head>');
  return { html, script, style, snapshot, snapshotName };
}

export function artifacts() {
  const p = publication();
  // The original local dashboard has an implicit head/body; make them explicit.
  p.html = p.html.replace('</head>', '').replace('<main>', '</head><body><main>').replace('</html>', '</body></html>');
  return new Map([
    ['website/app/research/jev/report.generated.ts', '// Generated by research/jev-shadow/src/workflow/publish.mjs; do not edit.\nconst report = ' + JSON.stringify(p.html) + ';\nexport default report;\n'],
    ['website/public/research/jev/dashboard.js', p.script],
    ['website/public/research/jev/dashboard.css', p.style],
    [`website/public/research/jev/${p.snapshotName}`, p.snapshot],
  ]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  for (const [name, bytes] of artifacts()) {
    const path = resolve(repository, name);
    if (check) assert.equal(readFileSync(path, 'utf8'), bytes, `Regenerate ${name}`);
    else { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); }
  }
  console.log(check ? 'Published report matches recorded source files.' : 'Generated static recorded report.');
}
