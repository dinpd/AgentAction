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
const draft={title:'Compare reports',goal:'Compare supplied reports',instructions:'Read both reports.',success:'A sourced comparison',requirements:[{label:'Read first report',matches:[]},{label:'Read second report',matches:[]}],questions:[],boundaries:'Read supplied reports only; never modify them.',evaluation:{version:1,checks:[],rubrics:[{id:'comparison',label:'Sourced comparison',criterion:'Compare both supplied reports using their retrieved evidence.',measurement:{method:'Count sourced claims / all claims; require 100%. No retained search evidence is inconclusive.',evidence:'Final answer claims and retained source results.'}}]}};
const schema={name:'read',description:'Read a report',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false}};
function harness(outputs:any[]=[draft]) {
 const storage=new Storage(),calls:any[]=[],prompts:string[]=[];
 const env={AGENT_MCP_ENDPOINTS:'https://one.example/mcp,https://two.example/mcp',AGENT_AI:{async run(_:string,input:any){prompts.push(JSON.stringify(input));if(input.messages[0].content.startsWith('Assess each frozen')) return {response:{criteria:[{id:'outcome_1',status:'pass',reason:'Both reports were retrieved and compared.',observed:'1 / 1 claims supported (100%).',calls:[0]}]}};assert.ok(outputs.length);return {response:outputs.shift()};}}};
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
 const save=async(plan:AgentPlan,bindings={},path='save-draft')=>{const body={id:plan.id,definition:plan.definition,setup:plan.setup,bindings};if(path==='create-bound')await request('save-draft',{...body,reviewed:true});return request(path,body);};
 return {storage,runtime,request,connect,save,calls,prompts,outputs,env,fetcher};
}
test('field checks persist with draft edits, reject invalid sources and protect workspace credentials',async()=>{
 const h=harness();await h.connect(1);
 const plan=(await h.request('draft',{description:'Compare supplied reports'})).body;
 const body={id:plan.id,definition:plan.definition,setup:plan.setup,bindings:{},fieldChecks:{step_1:{arguments:{id:'report-a'},required_outputs:['/value']},step_2:{bindings:[{input:'/id',from_step:'step_1',output:'/value'}]}}};
 assert.equal((await h.request('save-draft',body)).status,200);
 assert.deepEqual((await h.runtime.snapshot() as any).drafts[0].fieldChecks,body.fieldChecks);
 assert.equal((await h.save(plan)).status,200);
 const reloaded=new AgentRuntime(h.storage,h.env,h.fetcher as typeof fetch);
 assert.deepEqual((await reloaded.snapshot() as any).drafts[0].fieldChecks,body.fieldChecks);
 for(const fieldChecks of [{step_1:{arguments:{id:'FIRST-SECRET'}}},{step_1:{bindings:[{input:'/id',from_step:'step_2',output:'/value'}]}},{other:{}}])
   assert.equal((await h.request('save-draft',{...body,fieldChecks})).status,400);
 assert.equal((await h.request('save-draft',body,'viewer')).status,403);
 assert.equal((await harness().request('save-draft',body)).status,404);
 assert.equal(h.calls.length,0);
});
test('assessment example values do not replace separately proposed execution arguments',async()=>{
 const h=harness();const connectionId=await h.connect(1);
 const plan=(await h.request('draft',{description:'Compare supplied reports'})).body;
 await h.request('save-draft',{id:plan.id,definition:plan.definition,setup:'Read supplied reports',bindings:{step_1:{connectionId,tool:'read'},step_2:{connectionId,tool:'read'}},fieldChecks:{step_1:{arguments:{id:'ASSESSMENT-ONLY'}}},reviewed:true});
 const created=await h.request('create-bound',{id:plan.id,definition:plan.definition,setup:'Read supplied reports',bindings:{step_1:{connectionId,tool:'read'},step_2:{connectionId,tool:'read'}},fieldChecks:{step_1:{arguments:{id:'ASSESSMENT-ONLY'}}}});
 assert.equal(created.status,200);
 h.outputs.push({type:'call',tool:'step_1',arguments:{id:'ACTUAL-REVIEWED-INPUT'}});
 const trial=await h.request('trial',{agentId:created.body.agentId});assert.equal(trial.status,200);
 const run=await h.storage.get<Run>('run:'+trial.body.runId);
 assert.equal(run?.status,'awaiting_approval');
 assert.ok(JSON.stringify(run?.pending).includes('ACTUAL-REVIEWED-INPUT'));
 assert.ok(!JSON.stringify(run?.pending).includes('ASSESSMENT-ONLY'));assert.equal(h.calls.length,0);
});
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

test('job-first generation excludes connected inventory and requires complete proposed controls',async()=>{
 const h=harness([{...draft,title:'Social research',requirements:[{label:'Search public social posts',matches:[]}]}]);
 await h.storage.put('connection:notion',{id:'notion',label:'Notion',status:'connected',endpoint:'https://one.example/mcp',tools:[{name:'notion-search',description:'Search workspace pages',inputSchema:{type:'object'}}]});
 const response=await h.request('draft',{description:'social media post scanner for example.com'});
 assert.equal(response.status,200);assert.deepEqual(response.body.bindings,{});assert.equal(response.body.requiresReview,true);
 const input=JSON.parse(h.prompts[0]);assert.deepEqual(JSON.parse(input.messages[1].content),{description:'social media post scanner for example.com'});
 assert.equal(response.body.definition.evaluation.rubrics.length,1);assert.match(response.body.definition.boundaries,/never modify/);
 for(const change of [{boundaries:''},{evaluation:undefined},{evaluation:{version:1,checks:[]}},{evaluation:{version:1,checks:[],rubrics:Array(7).fill({id:'a',label:'A',criterion:'A',measurement:{method:'Count sourced claims / all claims; require 100%. No retained search evidence is inconclusive.',evidence:'Final answer claims and retained source results.'}})}},{permissions:['*']}]) assert.throws(()=>proposedPlan({...draft,...change},[]));
});

test('draft review is bound to definition, inputs and selected sources and cannot authorize actions',async()=>{
 const h=harness();const connectionId=await h.connect(1),plan=(await h.request('draft',{description:'Compare reports'})).body as AgentPlan;
 const body={id:plan.id,definition:plan.definition,setup:plan.setup,bindings:{step_1:{connectionId,tool:'read'},step_2:{connectionId,tool:'read'}}};
 assert.equal((await h.request('create-bound',body)).status,409);
 assert.equal((await h.request('save-draft',{...body,reviewed:true},'viewer')).status,403);
 const reviewed=await h.request('save-draft',{...body,reviewed:true});assert.equal(reviewed.status,200);assert.ok(reviewed.body.review.digest);assert.equal(h.calls.length,0);
 assert.equal((await h.request('create-bound',{...body,setup:'Changed research scope'})).status,409);
 const changed=await h.request('save-draft',{...body,definition:{...body.definition,boundaries:'Changed boundary'}});assert.equal(changed.body.review,undefined);
 assert.equal((await h.request('create-bound',{...body,reviewed:true})).status,400);
 await h.request('save-draft',{...body,reviewed:true});assert.equal((await h.request('create-bound',body)).status,200);assert.equal(h.calls.length,0);
});

test('tool recommendation assessment omits connection state and validates candidate identity',async()=>{
 const h=harness(),plan=(await h.request('draft',{description:'Social research'})).body;
 const body={id:plan.id,requirement:'step_1',candidates:[{id:'a',title:'Notion search',description:'Internal workspace pages'},{id:'b',title:'Social search',description:'Public posts, dates and source links'}]};
 h.outputs.push({recommendations:[{id:'b',reason:'Public source coverage fits; account access is unverified.'}]});
 const result=await h.request('rank-tools',body);assert.equal(result.status,200);assert.equal(result.body.recommendations[0].id,'b');
 const prompt=JSON.parse(h.prompts.at(-1)!);const data=JSON.parse(prompt.messages[1].content);assert.deepEqual(Object.keys(data).sort(),['candidates','capability','goal']);assert.ok(!JSON.stringify(data).includes('connection'));
 for(const recommendations of [[{id:'invented',reason:'Unsupported'}],[{id:'a',reason:'Fit'},{id:'a',reason:'Duplicate'}]]) {h.outputs.push({recommendations});assert.equal((await h.request('rank-tools',body)).status,502);}
 assert.equal((await h.request('rank-tools',body,'viewer')).status,403);
 assert.equal((await h.request('rank-tools',{...body,candidates:[{...body.candidates[0],connected:true}]})).status,400);
 assert.equal((await h.request('rank-tools',{...body,id:'foreign'})).status,404);assert.equal(h.calls.length,0);
});

test('an unavailable outcome assessor leaves a completed trial inconclusive',async()=>{
 const h=harness(),connectionId=await h.connect(1),plan=(await h.request('draft',{description:'Compare'})).body;
 const agent=await h.save(plan,{step_1:{connectionId,tool:'read'},step_2:{connectionId,tool:'read'}},'create-bound');
 h.outputs.push({type:'call',tool:'step_1',arguments:{id:'A'}});
 const trial=await h.request('trial',{agentId:agent.body.agentId}),pending=(await h.storage.get<Run>('run:'+trial.body.runId))!;
 h.env.AGENT_AI.run=async (_:string,input:any)=>{if(input.messages[0].content.startsWith('Assess each frozen'))throw new Error('assessor offline');return {response:{type:'finish',summary:'A result',outcome:'met',reason:'Read succeeded'}};};
 assert.equal((await h.request('approve',{runId:pending.id,approvalId:pending.pending!.id})).status,200);
 const run=(await h.storage.get<Run>('run:'+pending.id))!;assert.equal(run.status,'completed');assert.equal(run.evaluation!.status,'insufficient_evidence');assert.equal(run.evaluation!.criteria.find(c=>c.id==='outcome_1')!.trust,'ai_assessed');
});


test('draft outcome IDs are application-assigned without losing model criteria',()=>{
 for(const ids of [[undefined,undefined],['scope','scope'],['NOT A VALID ID','approval']]) {
  const rubrics=ids.map((id,i)=>({...(id===undefined?{}:{id}),label:'Check '+i,criterion:'Evidence criterion '+i,measurement:{method:'Count sourced claims / all claims; require 100%. No retained search evidence is inconclusive.',evidence:'Final answer claims and retained source results.'}}));
  const plan=proposedPlan({...draft,evaluation:{version:1,checks:[],rubrics}},[]);
  assert.deepEqual(plan.definition.evaluation!.rubrics,rubrics.map((r,i)=>({...r,id:'outcome_'+(i+1)})));
 }
 assert.throws(()=>proposedPlan({...draft,evaluation:{version:1,checks:[],rubrics:[{label:'Check',criterion:'Evidence',measurement:{method:'Count sourced claims / all claims; require 100%. No retained search evidence is inconclusive.',evidence:'Final answer claims and retained source results.'},permissions:['*']}]}},[]));
});

test('new drafts require complete measurement procedures while retaining server-owned IDs',()=>{
 for(const measurement of [undefined,{}, {method:'Count'}, {method:'Count',evidence:''}]) {
  assert.throws(()=>proposedPlan({...draft,evaluation:{version:1,checks:[],rubrics:[{label:'Grounding',criterion:'100% supported',measurement}]}},[]));
 }
 const p=proposedPlan(draft,[]);
 assert.deepEqual(p.definition.evaluation!.rubrics![0].measurement,draft.evaluation.rubrics[0].measurement);
});

test('built-in analysis does not add an external setup dependency to research',()=>{
 const p=proposedPlan({...draft,requirements:[{label:'Text analysis capability',matches:[]},{label:'Social-post search/retrieval capability',matches:[]},{label:'Report writing',matches:[]}]},[]);
 assert.deepEqual(p.requirements,[{id:'step_1',label:'Social-post search/retrieval capability',matches:[]}]);
 assert.deepEqual(p.definition.tools,['step_1']);assert.equal(p.definition.instructions,draft.instructions);
 assert.deepEqual(p.definition.evaluation,proposedPlan(draft,[]).definition.evaluation);
 const specialized=proposedPlan({...draft,requirements:[{label:'Acme specialized text analysis',matches:[]},{label:'Search posts',matches:[]}]},[]);assert.equal(specialized.requirements.length,2);
 const bound=proposedPlan({...draft,requirements:[{label:'Text analysis capability',matches:['actual']},{label:'Search posts',matches:[]}]},[{id:'actual',connectionId:'service',tool:'analyze'}]);assert.equal(bound.requirements.length,2);assert.equal(bound.bindings.step_1.tool,'analyze');
 assert.throws(()=>proposedPlan({...draft,requirements:[{label:'Text analysis',matches:[],permissions:['*']},{label:'Search posts',matches:[]}]},[]));
});


test('combined built-in labels normalize by constituent functions without swallowing external capabilities',()=>{
 for(const label of ['Text analysis and summarization capability','Summarisation & text analysis','Report writing / reasoning','Summarize retrieved content','Analyze retrieved results','Text analysis,  summarization and report generation']) {
  const p=proposedPlan({...draft,requirements:[{label,matches:[]},{label:'Social-post search/retrieval',matches:[]}]},[]);
  assert.deepEqual(p.requirements.map(r=>r.label),['Social-post search/retrieval']);
 }
 for(const label of ['Acme text analysis and summarization','Specialized sentiment analysis','Retrieve source reports','Text report capability','分析 text analysis']) {
  assert.equal(proposedPlan({...draft,requirements:[{label,matches:[]},{label:'Social-post search/retrieval',matches:[]}]},[]).requirements.length,2);
 }
});
