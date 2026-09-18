import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentRuntime, type RuntimeStorage, type Run, type Agent } from '../src/agent-runtime.ts';
import { proposedPlan, type AgentPlan } from '../src/agent-plans.ts';
import { evaluateHostedRun } from '../src/recipe-evaluation.ts';
class Storage implements RuntimeStorage {
 data=new Map<string,any>();
 async get<T>(k:string){return structuredClone(this.data.get(k)) as T|undefined;}
 async put<T>(k:string,v:T){assert.ok(new TextEncoder().encode(JSON.stringify(v)).length<128000);this.data.set(k,structuredClone(v));}
 async delete(k:string){return this.data.delete(k);}
 async list<T>({prefix}:{prefix:string}){return new Map([...this.data].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v) as T]));}
 async setAlarm(){} async deleteAlarm(){}
}
const draft={title:'Compare reports',goal:'Compare supplied reports',instructions:'Read both reports.',success:'A sourced comparison',requirements:[{label:'Read first report',matches:[]},{label:'Read second report',matches:[]}],questions:[]};
const schema={name:'read',description:'Read a report',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false}};
function harness(outputs:any[]=[draft]) {
 const storage=new Storage(),calls:any[]=[],prompts:string[]=[];
 const env={AGENT_MCP_ENDPOINTS:'https://one.example/mcp,https://two.example/mcp',AGENT_AI:{async run(_:string,input:any){prompts.push(JSON.stringify(input));assert.ok(outputs.length);return {response:outputs.shift()};}}};
 const fetcher=async(url:any,init:any)=>{
  if(init.method==='DELETE')return new Response(null,{status:204});
  const message=JSON.parse(init.body);if(message.method==='notifications/initialized')return new Response(null,{status:202});
  if(message.method==='tools/call') calls.push({url,message,auth:init.headers.Authorization});
  const result=message.method==='initialize'?{protocolVersion:'2025-03-26',capabilities:{tools:{}}}:message.method==='tools/list'?{tools:[schema]}:{structuredContent:{value:20},text:'FIRST-SECRET SECOND-SECRET'};
  return Response.json({jsonrpc:'2.0',id:message.id,result});
 };
 const runtime=new AgentRuntime(storage,env,fetcher as typeof fetch);
 const request=async(path:string,body:any,role='owner')=>{const r=await runtime.handle(new Request('https://runtime.test/'+path,{method:'POST',headers:{'x-runtime-role':role},body:JSON.stringify(body)}));return {status:r.status,body:await r.json() as any};};
 const connect=async(n:number)=>{const r=await request('connect',{endpoint:`https://${n===1?'one':'two'}.example/mcp`,label:`Account ${n}`,token:n===1?'FIRST-SECRET':'SECOND-SECRET'});assert.equal(r.status,200);return r.body.connectionId as string;};
 const save=(plan:AgentPlan,bindings={},path='save-draft')=>request(path,{id:plan.id,definition:plan.definition,setup:plan.setup,bindings});
 return {storage,runtime,request,connect,save,calls,prompts,outputs,env,fetcher};
}
test('empty workspace drafts survive reload, accept edits, reject execution with unresolved tools',async()=>{
 const h=harness();const r=await h.request('draft',{description:'Compare the supplied reports'});assert.equal(r.status,200);
 const plan=r.body as AgentPlan;assert.deepEqual(plan.bindings,{});assert.equal((await h.runtime.snapshot() as any).agents.length,0);
 plan.definition.title='My comparison';assert.equal((await h.save(plan)).status,200);
 const reload=new AgentRuntime(h.storage,h.env,h.fetcher as typeof fetch);assert.equal((await reload.snapshot() as any).drafts[0].definition.title,'My comparison');
 assert.equal((await h.save(plan,{},'create-bound')).status,409);assert.equal(h.calls.length,0);
 assert.equal((await h.request('save-draft',{id:'another-workspace',definition:plan.definition,setup:'x',bindings:{}})).status,404);
 assert.equal((await h.request('draft',{description:'x'},'viewer')).status,403);
});
test('ambiguous matches stay unbound; unique verified matches prefill; unknown IDs rejected',()=>{
 const catalog=[{id:'a',connectionId:'first',tool:'read'},{id:'b',connectionId:'second',tool:'read'}];
 const p=proposedPlan({...draft,requirements:[{label:'Read a report',matches:['a','b']}]},catalog);assert.deepEqual(p.bindings,{});
 assert.equal(proposedPlan({...draft,requirements:[{label:'Read',matches:['a']}]},[catalog[0]]).bindings.step_1.connectionId,'first');
 assert.throws(()=>proposedPlan({...draft,requirements:[{label:'Read',matches:['registry-advertisement']}]},catalog));
});
test('same-named tools route to separate servers, freeze bindings and evaluate source provenance',async()=>{
 const h=harness();const one=await h.connect(1),two=await h.connect(2);
 const plan=(await h.request('draft',{description:'Compare report A and report B'})).body as AgentPlan;
 const bindings={step_1:{connectionId:one,tool:'read'},step_2:{connectionId:two,tool:'read'}};
 const created=await h.save(plan,bindings,'create-bound');assert.equal(created.status,200);
 assert.equal((await h.save(plan,bindings,'create-bound')).body.agentId,created.body.agentId);
 h.outputs.push({type:'call',tool:'step_1',arguments:{id:'A'}},{type:'call',tool:'step_2',arguments:{id:'B'}},{type:'finish',summary:'Both reports return 20.',outcome:'met',reason:'Both returned structured values.'});
 const trial=await h.request('trial',{agentId:created.body.agentId});assert.equal(trial.status,200);
 let run=(await h.storage.get<Run>('run:'+trial.body.runId))!;assert.deepEqual(run.contract!.binding.tool_bindings,bindings);assert.equal(h.calls.length,0);
 for(let i=0;i<2;i++) {
  assert.equal((await h.request('approve',{runId:run.id,approvalId:'wrong'})).status,409);
  assert.equal((await h.request('approve',{runId:run.id,approvalId:run.pending!.id})).status,200);
  run=(await h.storage.get<Run>('run:'+run.id))!;
 }
 assert.deepEqual(h.calls.map(c=>c.url),['https://one.example/mcp','https://two.example/mcp']);assert.ok(h.calls.every(c=>c.message.params.name==='read'));
 assert.equal(run.evaluation!.status,'pass');assert.deepEqual(run.events.map(e=>e.source),Object.values(bindings));
 assert.ok(!JSON.stringify(run).includes('SECOND-SECRET'));assert.ok(!JSON.stringify(run).includes('FIRST-SECRET'));assert.ok(h.prompts.every(p=>!p.includes('SECRET')));
 const tampered=structuredClone(run);tampered.events[1].source!.connectionId=one;const evaluation=await evaluateHostedRun(tampered);assert.equal(evaluation.criteria.find(c=>c.id==='scope')!.status,'fail');
 const changed=structuredClone(run);changed.contract!.binding.tool_bindings!.step_2.connectionId=one;await assert.rejects(()=>evaluateHostedRun(changed),/invalid/);
 await h.request('activate',{agentId:created.body.agentId,reviewed:true});
 await h.request('connect',{connectionId:two,token:'REPLACEMENT'});
 const agent=(await h.storage.get<Agent>('agent:'+created.body.agentId))!;assert.equal(agent.status,'paused');assert.equal(agent.lastTrial,undefined);
});
test('secondary disconnect cancels pending calls and credentials never enter drafts or templates',async()=>{
 const h=harness();const one=await h.connect(1),two=await h.connect(2);
 assert.equal((await h.request('draft',{description:'FIRST-SECRET'})).status,400);
 const plan=(await h.request('draft',{description:'Read reports A and B'})).body as AgentPlan;
 const bindings={step_1:{connectionId:one,tool:'read'},step_2:{connectionId:two,tool:'read'}};
 plan.setup='SECOND-SECRET';assert.equal((await h.save(plan,bindings)).status,400);plan.setup='Read A and B';
 const created=await h.save(plan,bindings,'create-bound');h.outputs.push({type:'call',tool:'step_2',arguments:{id:'B'}});
 const trial=await h.request('trial',{agentId:created.body.agentId});const before=(await h.storage.get<Run>('run:'+trial.body.runId))!;
 await h.request('disconnect',{connectionId:two});assert.equal((await h.storage.get<Run>('run:'+before.id))!.status,'cancelled');
 assert.equal((await h.request('approve',{runId:before.id,approvalId:before.pending!.id})).status,409);assert.equal(h.calls.length,0);
});
test('agent templates can be created and adopted without any server',async()=>{
 const h=harness();const definition=proposedPlan(draft,[]).definition;
 const saved=await h.request('save-recipe',{definition});assert.equal(saved.status,200);
 const adopted=await h.request('template-draft',{workspaceRecipeId:saved.body.id});assert.equal(adopted.status,200);assert.deepEqual(adopted.body.bindings,{});
});
test('four-call limit is shared across bound servers and revision requires fresh approval',async()=>{
 const h=harness();const one=await h.connect(1),two=await h.connect(2);const plan=(await h.request('draft',{description:'Read supplied reports'})).body;
 const created=await h.save(plan,{step_1:{connectionId:one,tool:'read'},step_2:{connectionId:two,tool:'read'}},'create-bound');
 h.outputs.push(...Array.from({length:5},(_,i)=>({type:'call',tool:i%2?'step_2':'step_1',arguments:{id:'report'}})));
 const trial=await h.request('trial',{agentId:created.body.agentId});let run=(await h.storage.get<Run>('run:'+trial.body.runId))!;
 const old=run.pending!.id;assert.equal((await h.request('revise',{runId:run.id,approvalId:old,arguments:{id:'reviewed report'}})).status,200);
 assert.equal((await h.request('approve',{runId:run.id,approvalId:old})).status,409);
 for(let i=0;i<4;i++) {run=(await h.storage.get<Run>('run:'+run.id))!;assert.equal((await h.request('approve',{runId:run.id,approvalId:run.pending!.id})).status,200);}
 assert.equal(h.calls.length,4);assert.equal((await h.storage.get<Run>('run:'+run.id))!.status,'failed');
 assert.equal(h.calls[0].message.params.arguments.id,'reviewed report');assert.equal(new Set(h.calls.map(c=>c.url)).size,2);
});
