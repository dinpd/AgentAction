import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlan, samplePlan, runSample, runTestPlan, boundedJSON, parseTestReport } from '../src/mcp-test-plan.ts';

test('one-click sample executes all five checks with three synthetic calls',async()=>{
  const r=await runSample();assert.equal(r.source,'sample');assert.equal(r.status,'passed');assert.equal(r.calls,3);
  assert.ok(r.checks.every(c=>c.status==='passed'));assert.equal(r.businessOutcome,'unverified');assert.deepEqual(parseTestReport(r),r);
  assert.throws(()=>parseTestReport({...r,checks:r.checks.map(c=>({...c,rawResult:'PRIVATE'}))}),/invalid/);
});
test('timeout stops remaining calls and never claims a confirmed outcome',async()=>{
  const r=await runSample(true);assert.equal(r.status,'inconclusive');assert.equal(r.calls,1);
  assert.equal(r.checks.find(c=>c.id==='call')!.status,'inconclusive');assert.equal(r.checks.find(c=>c.id==='deadline')!.status,'failed');
  assert.equal(r.checks.find(c=>c.id==='error')!.status,'not-run');
});
test('plans are bounded and reject credentials, invalid endpoints and unexpected control fields',()=>{
  for(const p of [{...samplePlan(),token:'SECRET'},{...samplePlan(),endpoint:'https://u:secret@host.test/mcp'},{...samplePlan(),endpoint:'https://host.test/mcp?token=secret'},{...samplePlan(),deadlineMs:0},{...samplePlan(),protocol:'draft'},{...samplePlan(),tool:{...samplePlan().tool,code:'execute'}},{...samplePlan(),arguments:[]}])assert.throws(()=>parsePlan(p));
  assert.throws(()=>boundedJSON(' '.repeat(131073)),/128/);assert.throws(()=>boundedJSON('['.repeat(30)+'0'+']'.repeat(30)),/nested/);
  assert.equal(parsePlan({...samplePlan(),endpoint:'http://127.0.0.1:9001/mcp'}).endpoint,'http://127.0.0.1:9001/mcp');
});
test('invalid baseline inputs cause no tool calls; optional cases remain Not run',async()=>{
  let calls=0;const p=samplePlan();p.arguments={};
  const r=await runTestPlan(p,async()=>{calls++;return {kind:'transport-error'};});assert.equal(calls,0);assert.equal(r.status,'failed');
  const plain={...samplePlan(),missingArgument:false,errorArguments:undefined,tool:{...samplePlan().tool,outputSchema:undefined}};
  const success=await runTestPlan(plain,async()=>({kind:'result',value:{content:[{type:'text',text:'Found'}]}}));
  assert.equal(success.calls,1);assert.equal(success.checks.filter(c=>c.status==='not-run').length,3);
});
test('output, text and tool-error checks fail accurately without exporting provider data',async()=>{
  const p=samplePlan();const r=await runTestPlan(p,async args=>!Object.hasOwn(args,'query')?{kind:'rpc-error',code:-32602}:{kind:'result',value:{content:[{type:'text',text:'PRIVATE-RESULT'}],structuredContent:{found:'wrong'}}});
  assert.equal(r.status,'failed');assert.equal(r.checks.find(c=>c.id==='output')!.status,'failed');assert.equal(r.checks.find(c=>c.id==='error')!.status,'failed');assert.ok(!JSON.stringify(r).includes('PRIVATE-RESULT'));
});
test('transport failure and invalid result halt execution; unsupported schemas remain inconclusive',async()=>{
  const r=await runTestPlan(samplePlan(),async()=>({kind:'transport-error'}));assert.equal(r.calls,1);assert.equal(r.status,'inconclusive');
  const invalid=await runTestPlan(samplePlan(),async()=>({kind:'result',value:{content:'malformed'}}));assert.equal(invalid.status,'failed');assert.equal(invalid.calls,1);
  const p=samplePlan();p.tool.inputSchema={$ref:'https://unresolved.example/schema',type:'object'};
  const unknown=await runTestPlan(p,async()=>{throw new Error('must not execute');});assert.equal(unknown.status,'inconclusive');assert.equal(unknown.calls,0);
});
