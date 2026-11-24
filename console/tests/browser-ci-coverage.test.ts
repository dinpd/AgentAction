import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';

// A browser acceptance test that no workflow runs keeps asserting an old page after the page changes,
// and nobody is told (#437). Every tests/*-browser.mts must therefore be executed by the console
// workflow, or be listed here with the reason it is not.
const EXCLUDED: Record<string, string> = {};

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const scripts: Record<string, string> = JSON.parse(read('../package.json')).scripts;
const onDisk = readdirSync(new URL('.', import.meta.url)).filter(name => name.endsWith('-browser.mts')).sort();

// The commands of every `run:` step, including `run: |` blocks. Step names, comments and prose do not execute.
// Known limits: a step's `if:` and `continue-on-error:` are not read, and any command that names the file
// (even `echo`) counts as running it. Neither occurs in the workflow today; review a step that adds one.
function workflowCommands(yaml: string): string[] {
  const commands: string[] = [], lines = yaml.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const step = /^(\s*(?:- )?)run:\s*(.*)$/.exec(lines[i]);
    if (!step) continue;
    if (!/^[|>][+-]?$/.test(step[2])) { commands.push(step[2]); continue; }
    // A block belongs to `run:` only while its lines are indented deeper than the key itself.
    const key = step[1].length;
    while (i + 1 < lines.length && (!lines[i + 1].trim() || lines[i + 1].search(/\S/) > key)) commands.push(lines[++i].trim());
  }
  return commands.filter(command => command && !command.startsWith('#'));
}
// Browser tests a command executes, following `npm run <script>` into package.json.
function executed(command: string, seen = new Set<string>()): string[] {
  const direct = [...command.matchAll(/\btests\/([\w-]+-browser\.mts)\b/g)].map(match => match[1]);
  const viaScripts = [...command.matchAll(/\bnpm run ([\w:-]+)/g)].flatMap(([, name]) => {
    if (seen.has(name) || !scripts[name]) return [];
    return executed(scripts[name], new Set(seen).add(name));
  });
  return [...direct, ...viaScripts];
}
const inWorkflow = [...new Set(workflowCommands(read('../../.github/workflows/cloudflare-console.yml')).flatMap(command => executed(command)))].sort();

test('every browser acceptance test runs in the console workflow or is excluded with a reason', () => {
  const unwired = onDisk.filter(name => !inWorkflow.includes(name) && !(name in EXCLUDED));
  assert.deepEqual(unwired, [], `Add a step for each of these to .github/workflows/cloudflare-console.yml, or list it in EXCLUDED with a reason: ${unwired.join(', ')}`);
});

test('the workflow and the exclusion list name only browser tests that exist', () => {
  assert.deepEqual(inWorkflow.filter(name => !onDisk.includes(name)), [], 'The workflow runs a browser test that is not in console/tests');
  assert.deepEqual(Object.keys(EXCLUDED).filter(name => !onDisk.includes(name)), [], 'EXCLUDED names a browser test that is not in console/tests');
});

test('an excluded browser test states its reason and is not also run', () => {
  for (const [name, reason] of Object.entries(EXCLUDED)) {
    assert.ok(reason.trim().length >= 20, `${name}: say why it cannot run in CI`);
    assert.ok(!inWorkflow.includes(name), `${name} runs in the workflow; remove it from EXCLUDED`);
  }
});

test('run steps are read from single-line and block commands, and npm scripts are followed', () => {
  const yaml = ['steps:', '  - name: Mentions tests/named-browser.mts only in prose', '    run: node tests/direct-browser.mts', '  # run: node tests/commented-browser.mts',
    '  - run: |', '      # node tests/block-comment-browser.mts', '      npm install', '      node tests/block-browser.mts', '    env:', '      NOTE: tests/env-browser.mts', '  - run: npm run test:oauth-browser'].join('\n');
  assert.deepEqual(workflowCommands(yaml).flatMap(command => executed(command)), ['direct-browser.mts', 'block-browser.mts', 'oauth-worker-browser.mts']);
});
