/** Console controls exercise the real AgentRuntime, with synthetic transport and no provider effects before approval. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import worker from '../src/worker.ts';
import { AgentRuntime, type Agent, type RuntimeStorage, type Run } from '../src/agent-runtime.ts';
import { testTransaction } from './transaction-storage.ts';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
class Storage implements RuntimeStorage {
  data=new Map<string,unknown>();
  transaction<T>(work:(tx:Pick<RuntimeStorage,'get'|'put'>)=>Promise<T>){return testTransaction(this,work);}
  async get<T>(key:string){return structuredClone(this.data.get(key)) as T|undefined;}
  async put<T>(key:string,value:T){this.data.set(key,structuredClone(value));}
  async delete(key:string){return this.data.delete(key);}
  async list<T>({prefix}:{prefix:string}){return new Map([...this.data].filter(([key])=>key.startsWith(prefix)).map(([key,value])=>[key,structuredClone(value) as T]));}
  async setAlarm(){} async deleteAlarm(){}
}
const stores={acme:new Storage(),beta:new Storage()},parent={maxCalls:3,approvalTtlMs:90000,executionTimeoutMs:30000,recoveryPolicy:'review'};
for(const storage of Object.values(stores)) {
  await storage.put('supervisor-policy',{version:0,limits:parent});
  await storage.put('connection:provider',{id:'provider',label:'Synthetic provider',endpoint:'https://mcp.firecrawl.dev/v2/mcp',protocol:'2025-03-26',tools:[{name:'lookup',inputSchema:{type:'object',properties:{},additionalProperties:false}}],suggestions:[],status:'connected',createdAt:'2026-10-17T00:00:00Z'});
  for(const id of ['one','two'])await storage.put('agent:'+id,{id,connectionId:'provider',title:'Agent '+id,goal:'Read synthetic records',setup:'Fixture',success:'Retained records',tools:['lookup'],status:'draft',createdAt:'2026-10-17T00:00:00Z'});
}
let effects=0,role='owner',failTrial=false,failSave=false;
const posts:Array<{tenant:string;action:string;body:any}>=[];
const makeRuntime=(storage:Storage)=>new AgentRuntime(storage,{AGENT_AI:{async run(){return {response:{type:'call',tool:'lookup',arguments:{}}};}}},async()=>{effects++;throw new Error('No provider call is authorized by this test');});
const runtimes={acme:makeRuntime(stores.acme),beta:makeRuntime(stores.beta)};
const env={CONSOLE_ENABLE_MOCK_IDENTITY:'true',CONSOLE_ENVIRONMENT:'development',CONSOLE_MOCK_SUBJECT:'test',CONSOLE_MOCK_TENANT_ID:'acme'};
const server=createServer(async(req,res)=>{
  const url=new URL(req.url!,'https://console.test');
  if(!url.pathname.startsWith('/api/')){const out=await worker.fetch(new Request(url),env);res.statusCode=out.status;out.headers.forEach((value,key)=>res.setHeader(key,value));res.end(Buffer.from(await out.arrayBuffer()));return;}
  let value:any={};
  if(url.pathname==='/api/console/session')value={tenant_id:'acme',email:'test@example.com',memberships:['acme','beta'].map(id=>({tenant:{tenant_id:id,display_name:id},membership:{role}}))};
  else if(url.pathname.endsWith('/setup'))value={membership:{role},sources:[]};
  else if(url.pathname.endsWith('/evals'))value={schema_version:'agentaction.tenant-evals.v1',definitions:[],assignments:[]};
  else if(url.pathname.startsWith('/api/agents/')){
    const [,,,tenant,action]=url.pathname.split('/');let body='';for await(const chunk of req)body+=chunk;
    if(body)posts.push({tenant,action,body:JSON.parse(body)});
    if((action==='trial'&&failTrial)||(action==='supervisor-settings'&&failSave)){res.statusCode=409;value={error:'Synthetic conflict; review the current settings.'};}
    else {const out=await runtimes[tenant as keyof typeof runtimes].handle(new Request('https://runtime.test/'+action,{method:req.method,headers:{'x-runtime-role':role,'x-runtime-actor':'reviewer','x-runtime-workspace':tenant},...(body?{body}:{})}));res.statusCode=out.status;value=await out.json();}
  }
  else if(url.pathname.startsWith('/api/automations/'))value={jobs:[],runs:[],findings:[]};
  res.setHeader('content-type','application/json');res.end(JSON.stringify(value));
});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1050}}),errors:string[]=[];
page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
const base=`http://127.0.0.1:${(server.address() as any).port}`;
const agent=(id='one')=>page.locator(`[data-agent-limits=${id}]`);
const run=(id='one')=>page.locator(`[data-trial-limits=${id}]`);
const card=(id='one')=>agent(id).locator('..');
const open=async(locator:any)=>{if(await locator.getAttribute('open')===null)await locator.locator('summary').first().click();};
const setting=async(locator:any,label:string,value:string)=>{const check=locator.getByLabel('Override '+label.toLowerCase(),{exact:true});if(!await check.isChecked())await check.check();await locator.getByLabel(label,{exact:true}).fill(value);};
const replaced=async(old:any)=>page.waitForFunction(element=>!element!.isConnected,old);
const refresh=async()=>{const old=await agent().elementHandle();await page.locator('#refresh').click();await replaced(old);};
const saved=()=>page.getByText('Agent limits saved. Pending actions for this agent were cancelled.',{exact:true});
const saveAgent=async(name='Save agent limits')=>{const old=await agent().elementHandle();await agent().getByRole('button',{name,exact:true}).click();await replaced(old);await saved().waitFor();};
const startTrial=async(id='one')=>{const old=await agent(id).elementHandle();await card(id).getByRole('button',{name:'Run a trial',exact:true}).click();await replaced(old);};
const switchWorkspace=async(id:string)=>{const old=await agent().elementHandle();await page.locator('#workspace').selectOption(id);await replaced(old);await agent().waitFor();};
const state=()=>runtimes.acme.snapshot() as Promise<any>;
const currentAgent=()=>stores.acme.get<Agent>('agent:one') as Promise<Agent>;
try {
  await page.goto(base+'/agents?workspace=acme#run');await open(agent());await open(run());
  assert.match(await agent().innerText(),/Effective limits: 3 tool calls/);assert.equal(await agent().getByLabel('Maximum tool calls',{exact:true}).isDisabled(),true);
  await setting(agent(),'Maximum tool calls','2');await saveAgent();
  assert.deepEqual((await currentAgent()).supervisorLimits,{maxCalls:2});assert.deepEqual(posts.at(-1)!.body,{scope:'agent',agentId:'one',expectedVersion:0,limits:{maxCalls:2}});
  await open(agent());await setting(agent(),'Approval lifetime (seconds)','45');failSave=true;
  await agent().getByRole('button',{name:'Save agent limits',exact:true}).click();await agent().getByText('Synthetic conflict; review the current settings.',{exact:true}).waitFor();
  assert.equal(await agent().getByLabel('Approval lifetime (seconds)',{exact:true}).inputValue(),'45');assert.deepEqual((await currentAgent()).supervisorLimits,{maxCalls:2});
  failSave=false;await saveAgent();assert.deepEqual((await currentAgent()).supervisorLimits,{maxCalls:2,approvalTtlMs:45000});
  // A real stale version is rejected by the runtime and keeps the edited input.
  await open(agent());await setting(agent(),'Tool timeout (seconds)','10');const stored=await currentAgent();
  const concurrent=await runtimes.acme.handle(new Request('https://runtime.test/supervisor-settings',{method:'POST',headers:{'x-runtime-role':'owner','x-runtime-workspace':'acme'},body:JSON.stringify({scope:'agent',agentId:'one',expectedVersion:stored.supervisorVersion,limits:stored.supervisorLimits})}));assert.equal(concurrent.status,200);
  await agent().getByRole('button',{name:'Save agent limits',exact:true}).click();await agent().getByText('Agent supervisor settings changed; refresh the current version.',{exact:true}).waitFor();
  assert.equal(await agent().getByLabel('Tool timeout (seconds)',{exact:true}).inputValue(),'10');await refresh();await open(agent());
  await open(run());await setting(run(),'Maximum tool calls','1');await saveAgent('Use workspace defaults');await open(run());assert.equal(await run().getByLabel('Override maximum tool calls',{exact:true}).isChecked(),false);assert.deepEqual((await currentAgent()).supervisorLimits,{});
  await open(agent());await setting(agent(),'Maximum tool calls','2');await saveAgent();
  await open(run());await setting(run(),'Maximum tool calls','1');await setting(run(),'Tool timeout (seconds)','0.5');
  // Drafts stay on their agent and workspace across refreshes and switches.
  await open(run('two'));assert.equal(await run('two').getByLabel('Override maximum tool calls',{exact:true}).isChecked(),false);
  await refresh();await open(run());assert.equal(await run().getByLabel('Maximum tool calls',{exact:true}).inputValue(),'1');
  await switchWorkspace('beta');await open(run());assert.equal(await run().getByLabel('Override maximum tool calls',{exact:true}).isChecked(),false);
  await switchWorkspace('acme');await open(run());assert.equal(await run().getByLabel('Maximum tool calls',{exact:true}).inputValue(),'1');
  failTrial=true;await card().getByRole('button',{name:'Run a trial',exact:true}).click();await page.locator('#status').filter({hasText:'Synthetic conflict'}).waitFor();assert.equal(await run().getByLabel('Maximum tool calls',{exact:true}).inputValue(),'1');
  failTrial=false;await startTrial();
  assert.deepEqual(posts.at(-1)!.body,{agentId:'one',supervisorLimits:{maxCalls:1,executionTimeoutMs:500}});
  let snapshot=await state(),trial=snapshot.runs.find((r:Run)=>r.agentId==='one');assert.equal(trial.status,'awaiting_approval');assert.deepEqual(trial.supervisor.limits,{maxCalls:1,approvalTtlMs:90000,executionTimeoutMs:500,recoveryPolicy:'review'});
  assert.deepEqual((await currentAgent()).supervisorLimits,{maxCalls:2});assert.equal(effects,0);
  await open(run());assert.equal(await run().getByLabel('Override maximum tool calls',{exact:true}).isChecked(),false);
  assert.match(await page.locator(`[data-supervised-run="${trial.id}"]`).innerText(),/0\/1 tool calls/);
  // Default trials omit the override payload entirely.
  await startTrial('two');assert.deepEqual(posts.at(-1)!.body,{agentId:'two'});
  // Browser validity blocks widening, invalid fractions and empty selected fields before a request.
  await open(run());await setting(run(),'Maximum tool calls','3');const before=posts.length;await card().getByRole('button',{name:'Run a trial',exact:true}).click();assert.equal(posts.length,before);
  await run().getByLabel('Maximum tool calls',{exact:true}).fill('1.5');await card().getByRole('button',{name:'Run a trial',exact:true}).click();assert.equal(posts.length,before);
  await run().getByLabel('Maximum tool calls',{exact:true}).fill('');await card().getByRole('button',{name:'Run a trial',exact:true}).click();assert.equal(posts.length,before);
  // Owner saves cancel pending actions. Operator controls only permit tightening.
  role='operator';await page.reload();await open(agent());assert.equal(await agent().getByLabel('Override maximum tool calls',{exact:true}).isDisabled(),true);assert.equal(await agent().getByRole('button',{name:'Use workspace defaults',exact:true}).isDisabled(),true);
  assert.equal(await agent().getByLabel('Maximum tool calls',{exact:true}).getAttribute('max'),'2');await agent().getByLabel('Maximum tool calls',{exact:true}).fill('1');await saveAgent();
  assert.equal((await currentAgent()).supervisorLimits!.maxCalls,1);snapshot=await state();assert.equal(snapshot.runs.find((r:Run)=>r.id===trial.id).status,'cancelled');
  await open(run());await setting(run(),'Tool timeout (seconds)','0.5');
  const policyChange=await runtimes.acme.handle(new Request('https://runtime.test/supervisor-settings',{method:'POST',headers:{'x-runtime-role':'owner','x-runtime-workspace':'acme'},body:JSON.stringify({scope:'workspace',expectedVersion:0,limits:{maxCalls:2}})}));assert.equal(policyChange.status,200);
  await refresh();await open(run());assert.equal(await run().getByLabel('Override tool timeout (seconds)',{exact:true}).isChecked(),false);
  role='viewer';await page.reload();await open(agent());await open(run());assert.equal(await agent().getByRole('button',{name:'Save agent limits',exact:true}).isDisabled(),true);assert.equal(await run().getByLabel('Override maximum tool calls',{exact:true}).isDisabled(),true);assert.equal(await card().getByRole('button',{name:'Run a trial',exact:true}).isDisabled(),true);
  role='owner';await page.reload();await open(agent());await open(run());await page.screenshot({path:'/tmp/agentaction-374-overrides-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'/tmp/agentaction-374-overrides-mobile.png',fullPage:true});
  assert.equal(effects,0);assert.deepEqual(errors,[]);console.log('Supervisor override browser/runtime acceptance passed: partial agent settings, inheritance/reset, real conflicts, exact trial payloads/frozen limits, isolation, failed/successful draft handling, validity, roles and mobile.');
} catch(error) {console.error(error);await page.screenshot({path:'/tmp/agentaction-374-failure.png',fullPage:true}).catch(()=>{});throw error;} finally {await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
