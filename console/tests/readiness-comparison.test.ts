import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createReadinessProfile } from '../src/mcp-readiness.ts';
import { readinessComparison } from '../src/readiness-comparison.ts';
import type { PrecheckReport } from '../src/mcp-precheck.ts';

const compare = readinessComparison().compare;
const tool = {name:'refund',description:'Issue a refund',inputSchema:{type:'object',properties:{amount:{type:'number'}},required:['amount']},outputSchema:{type:'object'},annotations:{readOnlyHint:false}};
const report = (): PrecheckReport => ({endpoint:'https://vendor.example/mcp',checkedAt:new Date().toISOString(),protocol:'2025-11-25',requestedProtocol:'2025-11-25',authentication:'not-observed',visibility:'public-tools',toolCount:1,tools:[],providers:[],scopes:[],challengedScopes:[],evidence:[],findings:[]});
const profile = (tools = [tool]) => createReadinessProfile(report(),tools);

test('comparison ignores catalog and object key order but identifies specific contract and metadata changes', async () => {
  const baseline = await profile([tool,{...tool,name:'search'}]);
  const same = await profile([{...tool,name:'search'},{...tool,inputSchema:{required:['amount'],properties:{amount:{type:'number'}},type:'object'}}]);
  assert.equal((await compare(baseline,same)).status,'unchanged');
  const changed = await profile([{...tool,inputSchema:{type:'object',required:['paymentId']},description:'Refund a payment',annotations:{readOnlyHint:true}}, {...tool,name:'lookup'}]);
  const result = await compare({readiness:baseline},{report:{readiness:changed}});
  assert.equal(result.status,'changed');
  assert.deepEqual(result.changes.map(c=>[c.tool,c.kind]),[['lookup','added'],['refund','input-schema'],['refund','description'],['refund','annotations'],['search','removed']]);
  assert.equal((await compare(baseline,await profile([{...tool,outputSchema:{type:'object',required:['id']}},{...tool,name:'search'}]))).changes[0].kind,'output-schema');
});

test('full bounded manifest compares tools beyond the 20-tool display without exporting extra raw schemas', async () => {
  const tools=Array.from({length:30},(_,i)=>({...tool,name:`tool_${i}`}));
  const before=await profile(tools), after=await profile(tools.map(t=>t.name==='tool_29'?{...t,inputSchema:{type:'object'}}:t));
  assert.equal(before.tools.length,20);assert.equal(before.comparisonCatalog?.tools.length,30);
  assert.deepEqual((await compare(before,after)).changes.map(c=>c.tool),['tool_29']);
  assert.ok(JSON.stringify(before.comparisonCatalog).length<20000);
});

test('legacy full exports work; incomplete, truncated, duplicated and mismatched evidence never reports unchanged', async () => {
  const p=await profile();const legacy=structuredClone(p);delete legacy.comparisonCatalog;
  assert.equal((await compare(legacy,p)).status,'unchanged');
  const variants = [
    {...p,toolCount:2,comparisonCatalog:undefined}, {...p,visibility:'authentication-required'},
    {...p,endpoint:'https://other.example/mcp'}, {...p,observedProtocol:'2025-03-26'},
    {...p,ruleset:'other'}, {...p,authenticationContext:'authenticated'},
    {...p,checkedAt:'invalid'}, {...p,comparisonCatalog:{...p.comparisonCatalog,complete:false}},
    {...legacy,tools:[tool,tool],toolCount:2}, {...p,comparisonCatalog:{...p.comparisonCatalog,tools:[p.comparisonCatalog!.tools[0],p.comparisonCatalog!.tools[0]]}},
  ];
  for(const variant of variants) assert.equal((await compare(variant,p)).status,'unavailable');
  const truncated=await profile([{...tool,capabilityMetadataIssues:['Description truncated']}]);
  assert.equal((await compare(truncated,truncated)).status,'unavailable');
  assert.equal((await compare(null,p)).status,'unavailable');
});

test('baseline parser bounds size/depth and rejects malformed files with actionable errors', () => {
  const {parse}=readinessComparison();
  assert.throws(()=>parse('{'),/valid JSON/);
  assert.throws(()=>parse(' '.repeat(524289)),/512/);
  assert.throws(()=>parse('['.repeat(70)+'0'+']'.repeat(70)),/nested/);
});

test('offline CLI produces concise output and documented exit codes without probing endpoints', async () => {
  const dir=await mkdtemp(join(tmpdir(),'readiness-compare-'));
  try {
    const before=join(dir,'before.json'),after=join(dir,'after.json');
    await writeFile(before,JSON.stringify({readiness:await profile()}));
    await writeFile(after,await readFile(before));
    const cli=new URL('../scripts/compare-readiness.mts',import.meta.url);
    const run=(extra:string[]=[])=>spawnSync(process.execPath,['--experimental-strip-types',cli.pathname,before,after,...extra],{encoding:'utf8'});
    assert.equal(run().status,0);assert.match(run().stdout,/No observed catalog changes/);
    await writeFile(after,JSON.stringify({readiness:await profile([])}));
    assert.equal(run().status,1);assert.match(run().stdout,/refund.*removed/);
    assert.equal(JSON.parse(run(['--json']).stdout).status,'changed');
    await writeFile(after,'{');assert.equal(run().status,2);assert.match(run().stderr,/valid JSON/);
    assert.equal(run(['--unknown']).status,2);
  } finally {await rm(dir,{recursive:true,force:true});}
});
