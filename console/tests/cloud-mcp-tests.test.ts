import test from 'node:test';
import assert from 'node:assert/strict';
import { cloudFixture, cloudPlan, cloudRequest } from './cloud-mcp-fixture.mts';
import { cloudSchemaSupported } from '../src/cloud-mcp-tests.ts';

test('cloud tests execute five reviewed checks, retain no raw data and replay no calls',async()=>{
  const h=await cloudFixture(),input=cloudRequest();
  const discovery=await h.request('test-discover',{connectionId:'provider'});assert.equal(discovery.status,200);assert.equal(h.state.calls.length,0);
  const r=await h.request('test-run',input);assert.equal(r.status,200);assert.equal(r.body.source,'cloud');assert.equal(r.body.status,'passed');assert.equal(r.body.calls,3);assert.equal(h.state.calls.length,3);
  assert.equal(h.state.closed,2);assert.deepEqual((await h.request('test-run',input)).body,r.body);assert.equal(h.state.calls.length,3);assert.equal(h.state.closed,2);
  assert.equal((await h.request('test-run',{...input,plan:{...input.plan,arguments:{query:'changed'}}})).status,409);
  const reports=await h.request('test-reports');assert.equal(reports.body.reports.length,1);assert.ok(!JSON.stringify(reports).includes('CLOUD-PROVIDER-SECRET'));
  const stored=JSON.stringify([...h.storage.data].filter(([key])=>key.startsWith('mcp-test:')));assert.ok(!stored.includes('"query"'));assert.ok(!stored.includes('CLOUD-PROVIDER-SECRET'));
});
test('freshly negotiated protocol can be reviewed without rewriting the saved connection',async()=>{
  const h=await cloudFixture();h.state.protocol='2025-06-18';
  const old=await h.request('test-run',cloudRequest());assert.equal(old.body.status,'inconclusive');assert.equal(h.state.calls.length,0);
  const discovery=await h.request('test-discover',{connectionId:'provider'});assert.equal(discovery.body.protocol,'2025-06-18');
  const current=await h.request('test-run',cloudRequest({...cloudPlan(),protocol:discovery.body.protocol}));assert.equal(current.body.status,'passed');assert.equal(h.state.calls.length,3);
});
test('cloud execution requires current workspace role, connection, approval and fixture review',async()=>{
  const h=await cloudFixture(),input=cloudRequest();
  assert.equal((await h.request('test-run',input,'viewer')).status,403);
  assert.equal((await h.request('test-run',{...input,stagingConfirmed:false})).status,400);
  assert.equal((await h.request('test-run',{...input,token:'EXTRA'})).status,400);
  assert.equal((await h.request('test-run',{...input,connectionId:'foreign'})).status,404);
  assert.equal((await h.request('test-run',{...input,plan:{...input.plan,arguments:{query:'CLOUD-PROVIDER-SECRET'}}})).status,400);
  assert.equal((await h.request('test-run',input,'owner','beta')).status,403);
  const c=(await h.storage.get<any>('connection:provider'))!;await h.storage.put('connection:provider',{...c,status:'disconnected'});assert.equal((await h.request('test-run',input)).status,409);
  await h.storage.put('connection:provider',{...c,endpoint:'https://unapproved.com/mcp'});assert.equal((await h.request('test-run',input)).status,403);assert.equal(h.state.calls.length,0);
});
test('hosted schema limits, private DNS, contract drift and redirects never dispatch tools',async()=>{
  for(const change of ['schema','dns','drift','redirect']){
    const h=await cloudFixture(),input=cloudRequest();
    if(change==='schema')input.plan.tool.inputSchema={type:'object',properties:{query:{type:'string',pattern:'(a+)+$'}}};
    if(change==='dns')h.state.privateDNS=true;if(change==='drift')h.state.drift=true;if(change==='redirect')h.state.redirect=true;
    const r=await h.request('test-run',input);assert.equal(r.status,200);assert.equal(r.body.status,'inconclusive');assert.equal(r.body.calls,0);assert.equal(h.state.calls.length,0);
  }
  assert.equal(cloudSchemaSupported(cloudPlan()),true);
  for(const key of ['$ref','allOf','patternProperties','format'])assert.equal(cloudSchemaSupported({...cloudPlan(),tool:{...cloudPlan().tool,inputSchema:{type:'object',[key]:'unsupported'}}}),false);
});
test('cloud deadlines halt subsequent probes and cannot dispatch after delayed preflight',async()=>{
  const h=await cloudFixture(),slow=cloudRequest({...cloudPlan(),arguments:{query:'slow'},deadlineMs:50});const r=await h.request('test-run',slow);assert.equal(r.body.status,'inconclusive');assert.equal(r.body.calls,1);assert.equal(h.state.calls.length,1);
  const delayed=await cloudFixture();delayed.state.delayAfterCatalog=100;const result=await delayed.request('test-run',cloudRequest({...cloudPlan(),deadlineMs:50}));assert.equal(result.body.status,'inconclusive');await new Promise(r=>setTimeout(r,200));assert.equal(delayed.state.calls.length,0);
});
test('retained cloud claims survive recovery and expired IDs cannot become new calls',async()=>{
  const h=await cloudFixture(),input=cloudRequest();await h.request('test-run',input);const key='mcp-test:'+input.requestId,record=(await h.storage.get<any>(key))!;await h.storage.put(key,{...record,state:'running'});await h.restart();
  const r=await h.request('test-run',input);assert.equal(r.body.status,'inconclusive');assert.equal(r.body.calls,null);assert.equal(h.state.calls.length,3);
  const expired={...cloudRequest(),requestId:(Date.now()-1_200_000)+'-'+crypto.randomUUID()};assert.equal((await h.request('test-run',expired)).status,410);
  assert.ok(h.storage.alarm!>Date.now());await h.storage.put(key,{...record,createdAt:Date.now()-86_400_001});await h.runtime.alarm();assert.equal((await h.request('test-reports')).body.reports.length,0);assert.equal(h.storage.alarm,undefined);assert.equal(h.state.calls.length,3);
});
test('cloud daily quota and request body budgets fail without tool calls',async()=>{
  const h=await cloudFixture();await h.storage.put('quota:mcp-tests',{day:new Date().toISOString().slice(0,10),count:20});assert.equal((await h.request('test-run',cloudRequest())).status,429);assert.equal(h.state.calls.length,0);
  const huge={...cloudPlan(),arguments:{query:'x'.repeat(18500)}};assert.equal((await h.request('test-run',cloudRequest(huge))).status,400);assert.equal(h.state.calls.length,0);
  const separate=await cloudFixture();const bounded=await separate.request('test-run',cloudRequest({...cloudPlan(),arguments:{query:'hello',items:Array(65).fill(1)}}));assert.equal(bounded.body.status,'inconclusive');assert.equal(separate.state.calls.length,0);
});
test('report expiry scheduling preserves an earlier active-agent alarm',async()=>{
  const h=await cloudFixture(),nextRun=Date.now()+60_000;await h.storage.put('agent:scheduled',{id:'scheduled',status:'active',nextRun});
  await h.request('test-run',cloudRequest());assert.equal(h.storage.alarm,nextRun);
});
