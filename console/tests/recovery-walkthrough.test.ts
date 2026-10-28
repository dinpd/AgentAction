import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

test('recovery walkthrough restarts persisted processes and recovers the independent provider result without redispatch',()=>{
  const run=spawnSync(process.execPath,['--experimental-strip-types',new URL('../examples/recovery-walkthrough.mts',import.meta.url).pathname,'--json'],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);const report=JSON.parse(run.stdout);
  assert.equal(report.synthetic,true);assert.equal(report.outcome,'confirmed');assert.equal(report.providerEffects,1);
  assert.equal(report.steps.length,9);assert.ok(report.steps.every((s:any)=>s.evidence.providerEffects<=1));
  assert.equal(report.steps[2].evidence.state,'uncertain');assert.equal(report.steps[3].evidence.blocked,true);
  assert.equal(report.steps[4].evidence.state,'uncertain');assert.equal(report.steps[5].evidence.state,'uncertain');
  assert.equal(report.steps[8].evidence.originalResult.refundId,'synthetic-refund-1');
  assert.equal(report.steps[8].evidence.journal.at(-1).reason,'provider_reconciliation');
});
test('ambiguous recovery walkthrough remains uncertain and never fabricates completion',()=>{
  const run=spawnSync(process.execPath,['--experimental-strip-types',new URL('../examples/recovery-walkthrough.mts',import.meta.url).pathname,'--json','--ambiguous'],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);const report=JSON.parse(run.stdout);
  assert.equal(report.outcome,'uncertain');assert.equal(report.steps.at(-1).evidence.state,'uncertain');
  assert.equal(report.steps.at(-1).evidence.originalResult,undefined);assert.equal(report.providerEffects,1);
});
