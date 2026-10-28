import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args=process.argv.slice(2),ambiguous=args.includes('--ambiguous'),json=args.includes('--json'),htmlAt=args.indexOf('--html');
const allowed=args.filter(a=>a!=='--ambiguous'&&a!=='--json');
if(!(allowed.length===0||(allowed.length===2&&allowed[0]==='--html'&&!allowed[1].startsWith('-'))))throw new Error('Usage: npm run demo:recovery -- [--json] [--ambiguous] [--html new-report.html]');
const directory=await mkdtemp(join(tmpdir(),'agentaction-recovery-'));
const steps:Array<{title:string;detail:string;evidence:any}>=[];
function step(phase:string,title:string,detail:string) {
  const child=spawnSync(process.execPath,['--experimental-strip-types',new URL('./recovery-process.mts',import.meta.url).pathname,directory,phase],{encoding:'utf8'});
  assert.equal(child.status,phase==='dispatch'?75:0,child.stderr);
  const evidence=JSON.parse(child.stdout);assert.ok(evidence.providerEffects<=1);
  steps.push({title,detail,evidence});return evidence;
}
try {
  const prepared=step('prepare','Review one synthetic refund','The fixture binds a synthetic approval to the exact payment and USD 49 amount.');assert.equal(prepared.providerEffects,0);
  const lost=step('dispatch','Provider committed and the response was lost','The supervisor persisted its dispatch claim first. The independent provider committed one refund, then this process exited before retaining the result.');assert.equal(lost.providerEffects,1);
  const unknown=step('restart','Outcome unknown — do not retry','A new process restores the persisted supervisor state. Unconfirmed execution requires provider read-back.');assert.equal(unknown.state,'uncertain');
  const blocked=step('retry','Automatic redispatch blocked','The consumed approval cannot dispatch the same action again. The independent provider still contains one effect.');assert.equal(blocked.blocked,true);assert.equal(blocked.providerEffects,1);
  const missing=step('reconcile-missing','Missing evidence stays unresolved','An inconclusive provider lookup is not proof that no refund occurred. No mutation is issued.');assert.equal(missing.state,'uncertain');
  const mismatch=step('reconcile-mismatch','Mismatched evidence stays unresolved','Evidence that does not confirm the exact request cannot close the action.');assert.equal(mismatch.state,'uncertain');
  if(!ambiguous) {
    const confirmed=step('reconcile','Original result confirmed by provider read-back','The trusted fixture reads the separate provider record and matches the exact request. Reconciliation performs no new mutation.');assert.equal(confirmed.state,'succeeded');
    step('restart','Confirmation survives another restart','The reconciled state and original provider result persist.');
    const replay=step('replay','Original result recovered with one refund','The retained original result is returned without invoking the provider mutation again.');assert.deepEqual(replay.originalResult,{refundId:'synthetic-refund-1',paymentId:'synthetic-payment',amount:49,currency:'USD'});assert.equal(replay.providerEffects,1);
  }
  const report={synthetic:true,scope:'Reference walkthrough using production supervisor primitives, separate local SQLite records and fresh subprocesses. No hosted provider reconciliation endpoint or real payment integration.',outcome:ambiguous?'uncertain':'confirmed',providerEffects:1,steps};
  if(htmlAt>=0) {
    const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
    await writeFile(args[htmlAt+1],`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';base-uri 'none'"><title>Recover an interrupted action · AgentAction</title><style>body{font:16px/1.6 system-ui;background:#f5f5ee;color:#20251d;margin:0}main{max-width:850px;margin:auto;padding:32px 24px}h1{font-size:38px;line-height:1.1}h2{font-size:22px}article{background:#fff;border:1px solid #bac5ad;padding:22px;margin:20px 0}strong{color:#455c22}pre{white-space:pre-wrap;overflow-wrap:anywhere}p{overflow-wrap:anywhere}</style><main><p>AgentAction · Synthetic recovery walkthrough</p><h1>Did the retry repeat the action?</h1><p><strong>Provider effects: 1 · ${ambiguous?'Outcome still uncertain':'Original result confirmed'}</strong></p><p>${esc(report.scope)}</p>${steps.map((s,i)=>`<article><p>Step ${i+1} · Provider effects: ${s.evidence.providerEffects}</p><h2>${esc(s.title)}</h2><p>${esc(s.detail)}</p><details><summary>Inspect evidence</summary><pre>${esc(JSON.stringify(s.evidence,null,2))}</pre></details></article>`).join('')}<p>This demonstrates one retained action identity. Production recovery requires durable claims, provider-specific idempotency and trusted read-back. It is not a universal exactly-once guarantee.</p></main></html>`,{flag:'wx'});
  }
  if(json)console.log(JSON.stringify(report,null,2));
  else {console.log('Did the retry repeat the action?\nSynthetic reference walkthrough\n');for(const s of steps)console.log(`${s.title}\n${s.detail}\nProvider effects: ${s.evidence.providerEffects} · State: ${s.evidence.state}\n`);console.log(report.scope);}
} finally {await rm(directory,{recursive:true,force:true});}
