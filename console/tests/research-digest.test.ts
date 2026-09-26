import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentRuntime, type RuntimeStorage, type Agent, type Run, type Connection } from '../src/agent-runtime.ts';
import { researchConfig, nextResearchTime, sourcePosts, RESEARCH_ACTORS, RESEARCH_ENDPOINT, RESEARCH_TOOLS, researchPricing, actorArguments, type SourceProgress } from '../src/research-digest.ts';
import { type McpTool, parseEndpointURL } from '../src/mcp-client.ts';
const config={connectionId:'apify',topics:'Retirement planning tools and brand mentions; exclude generic promotions.',queries:{x:['Example','retirement planning'],reddit:['Example','retirement planning']},recipient:'reports@example.com',time:'08:00',timezone:'America/Los_Angeles',maxItems:20,actorCapUsd:0.05,rollingCapUsd:4,freePlan:true};
class Storage implements RuntimeStorage {
 data=new Map<string,unknown>();alarm?:number;
 async get<T>(key:string){return structuredClone(this.data.get(key)) as T|undefined;}
 async put<T>(key:string,value:T){assert.ok(new TextEncoder().encode(JSON.stringify(value)).length<128000,key);this.data.set(key,structuredClone(value));}
 async delete(key:string){return this.data.delete(key);}
 async list<T>({prefix}:{prefix:string}){return new Map([...this.data].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v) as T]));}
 async setAlarm(t:number){this.alarm=t;}async deleteAlarm(){delete this.alarm;}
}
const schemas:McpTool[]=[
 {name:'call-actor',description:'Start',inputSchema:{type:'object',properties:{actor:{type:'string'},input:{type:'object'},waitSecs:{type:'integer'},callOptions:{type:'object',properties:{maxTotalChargeUsd:{type:'number'}}}},required:['actor','input','callOptions']}},
 {name:'get-actor-run',description:'Status',inputSchema:{type:'object',properties:{runId:{type:'string'},waitSecs:{type:'integer'}},required:['runId']}},
 {name:'get-dataset-items',description:'Rows',inputSchema:{type:'object',properties:{datasetId:{type:'string'},limit:{type:'integer'}},required:['datasetId','limit']}},
 ...Object.values(RESEARCH_ACTORS).map(name=>({name:name.replace('/','--'),description:'Actor',inputSchema:{type:'object'}}))
];
const pricing={data:{pricingInfos:[{startedAt:'2020-01-01',pricingModel:'PAY_PER_EVENT',pricingPerEvent:{actorChargeEvents:{result:{eventTitle:'Result',eventPriceUsd:0.001}}}}]}};
async function harness(){
 const storage=new Storage(),calls:any[]=[],reports:any[]=[];let changed=false,outputChanged=false,providerFailure=false,networkFailure=false,recipient=true,pending=false,missingTool='';
 const agent:Agent={id:'agent',connectionId:'apify',title:'Social research',goal:'Relevant public posts',setup:'Company brief: retirement planning app.',success:'Report',tools:[],status:'draft',createdAt:new Date().toISOString()};
 const connection:Connection={id:'apify',endpoint:RESEARCH_ENDPOINT,token:'SECRET-TOKEN',tools:schemas,protocol:'2025-03-26',label:'Apify',status:'connected',createdAt:new Date().toISOString(),suggestions:[]};
 await storage.put('agent:agent',agent);await storage.put('connection:apify',connection);await storage.put('endpoint-approvals',[{endpoint:RESEARCH_ENDPOINT,approvedBy:'owner',approvedAt:new Date().toISOString()}]);
 const fetcher=(async(input:any,init:any)=>{
  if(String(input).startsWith('https://cloudflare-dns.com/'))return Response.json({Status:0,Answer:[{type:1,data:'93.184.216.34'}]});
  if(String(input).startsWith('https://api.apify.com/')){assert.ok(!init.headers?.authorization);return Response.json(pricing);}
  if(init.method==='DELETE')return new Response(null,{status:204});
  const msg=JSON.parse(init.body);let result:any;
  if(msg.method==='notifications/initialized')return new Response(null,{status:202});
  if(msg.method==='initialize')result={protocolVersion:'2025-03-26',capabilities:{tools:{}}};
  if(msg.method==='tools/list')result={tools:schemas.filter(t=>t.name!==missingTool&&new URL(String(input)).searchParams.get('tools')!.split(',').some(selector=>selector.replace('/','--')===t.name)).map(t=>({...t,...(outputChanged?{outputSchema:{type:'object',description:'changing sample'}}:{}),...(changed&&t.name==='call-actor'?{inputSchema:{type:'object',required:['another']}}:{})}))};
  if(msg.method==='tools/call'){
   calls.push(msg.params);const p=msg.params;
   if(networkFailure&&p.name==='call-actor')throw new Error('timeout SECRET-TOKEN');
   if(providerFailure&&p.name==='call-actor')return Response.json({jsonrpc:'2.0',id:msg.id,result:{isError:true,content:[{type:'text',text:'Quota exhausted SECRET-TOKEN'}]}});
   const platform=p.arguments.actor===RESEARCH_ACTORS.reddit||p.arguments.runId?.startsWith('reddit')||p.arguments.datasetId?.startsWith('reddit')?'reddit':'x';
   if(p.name==='call-actor'||p.name==='get-actor-run')result={_meta:{'com.apify/ActorRun':{usageTotalUsd:0.03}},structuredContent:{runId:platform+'Run123456',status:p.name==='call-actor'||pending?'RUNNING':'SUCCEEDED',storages:{datasets:{default:{id:platform+'Dataset123'}}}}};
   else result={structuredContent:{datasetId:p.arguments.datasetId,items:[{url:platform==='x'?'https://x.com/alice/status/123456':'https://www.reddit.com/r/retirement/comments/abc123/planning',createdAt:new Date(Date.now()-60000).toISOString(),text:'How should I compare retirement planning tools?'}],totalItemCount:1}};
  }
  return Response.json({jsonrpc:'2.0',id:msg.id,result});
 }) as typeof fetch;
 const env={AGENT_MCP_ENDPOINTS:RESEARCH_ENDPOINT,AGENT_AI:{async run(_m:string,input:any){assert.ok(!JSON.stringify(input).includes('SECRET-TOKEN'));return {response:{posts:[{index:0,relevant:true,reason:'Asks about comparing retirement planning tools.'},{index:1,relevant:true,reason:'Seeks a retirement planning tool.'}]}};}}};
 const bridge={async ready(to:string){assert.equal(to,config.recipient);if(!recipient)throw new Error('recipient removed');},async report(input:any){reports.push(input);return {status:'accepted',id:'delivery'};}};
 let runtime=new AgentRuntime(storage,env,fetcher,bridge);
 const request=async(path:string,body:any,role='owner')=>{const r=await runtime.handle(new Request('https://runtime.test/'+path,{method:'POST',headers:{'x-runtime-role':role},body:JSON.stringify(body)}));return {status:r.status,body:await r.json() as any};};
 const save=await request('research-save',{agentId:'agent',config});assert.equal(save.status,200,JSON.stringify(save.body));
 const trial=async()=>{const r=await request('trial',{agentId:'agent'});assert.equal(r.status,200);return (await storage.get<Run>('run:'+r.body.runId))!;};
 const advance=async(count=12)=>{for(let i=0;i<count;i++){for(const run of (await storage.list<Run>({prefix:'run:'})).values())if(run.research?.due){run.research.due=Date.now()-1;await storage.put('run:'+run.id,run);}await runtime.alarm();}};
 return {storage,calls,reports,request,trial,advance,omitTool:(name:string)=>missingTool=name,reload:async()=>{runtime=new AgentRuntime(storage,env,fetcher,bridge);await runtime.recover();},change:()=>changed=true,outputChange:()=>outputChanged=true,fail:()=>providerFailure=true,networkFail:()=>networkFailure=true,removeRecipient:()=>recipient=false,pending:()=>pending=true};
}
test('reviewed scope → two starts → durable status checks → actual rows → measured report → exact wall-clock activation',async()=>{
 const h=await harness(),run=await h.trial();assert.equal(h.calls.length,0);assert.equal(run.pending?.tool,'research-scan');
 assert.equal((await h.request('approve',{runId:run.id,approvalId:run.pending!.id},'viewer')).status,403);
 assert.equal((await h.request('approve',{runId:run.id,approvalId:run.pending!.id})).status,200);
 h.outputChange();await h.advance(1);await h.reload();await h.advance();
 const completed=(await h.storage.get<Run>('run:'+run.id))!;
 assert.equal(completed.outcome,'met',JSON.stringify(completed.research));assert.equal(completed.research?.delivery?.status,'accepted');assert.equal(h.calls.filter(c=>c.name==='call-actor').length,2);assert.equal(h.calls.filter(c=>c.name==='get-dataset-items').length,2);
 assert.match(h.reports[0].detail,/Why relevant/);assert.match(h.reports[0].detail,/Measured by/);assert.equal(h.reports[0].recipient,config.recipient);assert.ok(!JSON.stringify(await h.storage.get('run:'+run.id)).includes('SECRET-TOKEN'));
 for(const c of h.calls.filter(c=>c.name==='call-actor')){assert.equal(c.arguments.callOptions.maxTotalChargeUsd,0.05);assert.equal(c.arguments.callOptions.timeout,180);}
 assert.equal((await h.request('activate',{agentId:'agent',reviewed:true})).status,200);
 const agent=(await h.storage.get<Agent>('agent:agent'))!;assert.equal(agent.nextRun,nextResearchTime(config,Date.now()));
 await h.request('pause',{agentId:'agent'});assert.equal((await h.storage.get<Agent>('agent:agent'))?.research?.approved,undefined);
});
test('scope edits cancel pending approval and invalidate trial; frozen input drift sends no start',async()=>{
 const h=await harness(),run=await h.trial();await h.request('research-save',{agentId:'agent',config:{...config,topics:'Changed relevance'}});
 assert.equal((await h.request('approve',{runId:run.id,approvalId:run.pending!.id})).status,409);assert.equal(h.calls.length,0);
 const fresh=await h.trial();await h.request('approve',{runId:fresh.id,approvalId:fresh.pending!.id});h.change();await h.advance();assert.equal(h.calls.length,0);
 assert.match(h.reports[0].detail,/UNAVAILABLE/);assert.equal((await h.storage.get<Run>('run:'+fresh.id))?.outcome,'not_met');
});
test('provider budget failures and uncertain starts are never empty success or automatically replayed',async()=>{
 for(const mode of ['fail','networkFail'] as const){const h=await harness(),run=await h.trial();await h.request('approve',{runId:run.id,approvalId:run.pending!.id});h[mode]();await h.advance();await h.reload();await h.advance();assert.equal(h.calls.filter(c=>c.name==='call-actor').length,2);assert.equal((await h.storage.get<Run>('run:'+run.id))?.outcome,'not_met');assert.match(h.reports[0].detail,/UNAVAILABLE/);assert.ok(!h.reports[0].detail.includes('SECRET-TOKEN'));}
 const h=await harness();await h.storage.put('research-budget',[{at:Date.now(),amount:4}]);const run=await h.trial();assert.equal((await h.request('approve',{runId:run.id,approvalId:run.pending!.id})).status,429);assert.equal(h.calls.length,0);
});
test('restart at the persisted start boundary never repeats that Actor; disconnect cancels remaining work',async()=>{
 const h=await harness(),run=await h.trial();await h.request('approve',{runId:run.id,approvalId:run.pending!.id});const started=(await h.storage.get<Run>('run:'+run.id))!;started.research!.sources[0].stage='starting';await h.storage.put('run:'+run.id,started);await h.reload();await h.advance(1);assert.equal(h.calls.length,0);await h.request('disconnect',{connectionId:'apify'});await h.advance();assert.equal(h.calls.length,0);assert.equal((await h.storage.get<Run>('run:'+run.id))?.status,'cancelled');
});
test('bounded polling stops with an explicit unavailable report',async()=>{
 const h=await harness(),run=await h.trial();await h.request('approve',{runId:run.id,approvalId:run.pending!.id});h.pending();await h.advance(30);const final=(await h.storage.get<Run>('run:'+run.id))!;assert.equal(final.outcome,'not_met');assert.ok(h.calls.length<=20);assert.match(h.reports[0].detail,/UNAVAILABLE/);
});
test('IANA morning schedule follows spring/fall DST, skipped and repeated minutes',()=>{
 const next=(iso:string,time='08:00')=>new Date(nextResearchTime({...config,time},Date.parse(iso))).toISOString();
 assert.equal(next('2026-03-07T16:01:00Z'),'2026-03-08T15:00:00.000Z');
 assert.equal(next('2026-10-31T15:01:00Z'),'2026-11-01T16:00:00.000Z');
 assert.equal(next('2026-03-08T09:50:00Z','02:30'),'2026-03-08T10:00:00.000Z');
 assert.equal(next('2026-11-01T08:31:00Z','01:30'),'2026-11-02T09:30:00.000Z');
});
test('source normalization rejects missing evidence, stale rows, cross-platform URLs and duplicates',()=>{
 const source:SourceProgress={platform:'x',stage:'reading',datasetId:'dataset123',polls:0,received:0,invalid:0,outsideWindow:0,duplicates:0,posts:[]};
 const at='2026-09-25T15:00:00Z',post={url:'https://x.com/alice/status/123',text:'retirement',createdAt:at};
 sourcePosts(source,{datasetId:'dataset123',totalItemCount:5,items:[post,post,{...post,url:'https://evil.test/status/123'},{...post,createdAt:'2020-01-01'},{}]},at,20);
 assert.equal(source.posts.length,1);assert.equal(source.invalid,2);assert.equal(source.outsideWindow,1);assert.equal(source.duplicates,1);assert.match(source.gap!,/evidence/);
 assert.throws(()=>sourcePosts(source,{datasetId:'foreign',items:[]},at,20));
});
test('configuration and endpoint boundaries reject arbitrary destinations, plans and runaway costs',async()=>{
 assert.equal(parseEndpointURL(RESEARCH_ENDPOINT),RESEARCH_ENDPOINT);
 assert.throws(()=>parseEndpointURL(RESEARCH_ENDPOINT+',arbitrary/write'));
 for(const edit of [{freePlan:false},{actorCapUsd:50},{rollingCapUsd:100},{maxItems:1000},{timezone:'Not/AZone'},{recipient:'a@example.com\nBcc:other@example.com'}])assert.throws(()=>researchConfig({...config,...edit}));
 assert.match(String(actorArguments(researchConfig(config),'x','2026-09-25T00:00:00Z').input.twitterContent),/since_time:/);
 await assert.rejects(()=>researchPricing('x',0.05,(async()=>Response.json({data:{pricingInfos:[{startedAt:'2020-01-01',pricingModel:'PAY_PER_RESULT'}]}})) as typeof fetch),/billing/);
});
test('approved daily slot executes once across duplicate alarms and depleted reservations pause with a failure report',async()=>{
 const h=await harness(),trial=await h.trial();await h.request('approve',{runId:trial.id,approvalId:trial.pending!.id});await h.advance();await h.request('activate',{agentId:'agent',reviewed:true});
 const agent=(await h.storage.get<Agent>('agent:agent'))!;agent.nextRun=Date.now()-1;await h.storage.put('agent:agent',agent);
 await Promise.all([h.advance(1),h.advance(1)]);await h.advance();
 let runs=[...(await h.storage.list<Run>({prefix:'run:'})).values()];assert.equal(runs.filter(r=>r.kind==='scheduled').length,1);assert.equal(h.calls.filter(c=>c.name==='call-actor').length,4);
 await h.storage.put('research-budget',[{at:Date.now(),amount:4}]);const current=(await h.storage.get<Agent>('agent:agent'))!;current.nextRun=Date.now()-1;await h.storage.put('agent:agent',current);await h.advance();
 runs=[...(await h.storage.list<Run>({prefix:'run:'})).values()];assert.equal(runs.filter(r=>r.kind==='scheduled').length,2);assert.equal(h.calls.filter(c=>c.name==='call-actor').length,4);assert.equal((await h.storage.get<Agent>('agent:agent'))?.status,'paused');assert.match(h.reports.at(-1).detail,/reservation limit is exhausted/);
});

test('initial Apify connection selects every helper required for polling and results',async()=>{
 const selected=new URL(RESEARCH_ENDPOINT).searchParams.get('tools')!.split(',');
 assert.deepEqual(selected,[...RESEARCH_TOOLS,...Object.values(RESEARCH_ACTORS)]);
 const h=await harness();
 const original=(await h.storage.get<Connection>('connection:apify'))!;
 original.endpoint='https://mcp.apify.com/?tools=harshmaur/reddit-scraper';await h.storage.put('connection:apify',original);
 h.omitTool('get-dataset-items');
 const missing=await h.request('research-connect',{connectionId:'apify',reviewed:true});assert.equal(missing.status,409);assert.match(JSON.stringify(missing.body),/get-dataset-items/);assert.equal(h.calls.length,0);
 h.omitTool('');const connected=await h.request('research-connect',{connectionId:'apify',reviewed:true});assert.equal(connected.status,200,JSON.stringify(connected.body));
 const saved=await h.request('research-save',{agentId:'agent',config:{...config,connectionId:connected.body.connectionId}});assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(h.calls.length,0);
 assert.throws(()=>parseEndpointURL(RESEARCH_ENDPOINT.replace('get-actor-run,','')));
});
