/** External provisioning, approvals and token lifecycle against the real runtime. */
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

const form=()=>page.getByRole('form',{name:'Connect Hermes agent'});
const openSetup=async()=>{const d=page.locator('#external-agent-setup details');if(await d.getAttribute('open')===null)await d.locator('summary').click();};
const refreshed=async()=>{const previous=await page.locator('#external-agent-setup details').elementHandle();await page.locator('#refresh').click();await page.waitForFunction(e=>!e!.isConnected,previous);};
try {
  await page.goto(base+'/agents?workspace=acme#run');await openSetup();
  await form().getByLabel('Hermes agent name').fill('Hermes support');
  await form().getByLabel('Allowed Hermes tools (comma separated)').fill('refund, lookup');
  await form().getByRole('button',{name:'Register Hermes agent'}).click();
  const secret=page.getByLabel('Execution token',{exact:true});await secret.waitFor();
  const token=await secret.inputValue();assert.match(token,/^aae_/);assert.equal(await secret.getAttribute('type'),'password');
  const current=(await runtimes.acme.snapshot()).agents as Agent[],external=current.find(a=>a.external)!;assert.ok(external);
  const card=()=>page.locator(`[data-external-agent="${external.id}"]`);
  assert.equal(await card().getByRole('button',{name:'Run a trial',exact:true}).count(),0);
  assert.equal(await card().locator('[data-trial-limits]').count(),0);
  assert.equal(await card().locator('[data-agent-limits]').count(),1);
  assert.ok(!JSON.stringify(await runtimes.acme.snapshot()).includes(token));
  await refreshed();assert.equal(await secret.count(),0);
  const machine=async(action:string,body:unknown)=>{
    const response=await runtimes.acme.handle(new Request('https://runtime.test/external/'+action,{method:'POST',headers:{'x-runtime-workspace':'acme',authorization:'Bearer '+token},body:JSON.stringify({agentId:external.id,...body as object})}));
    assert.equal(response.status,200);return response.json() as Promise<any>;
  };
  const run=await machine('start',{sessionId:'browser-session'});
  const p=await machine('propose',{runId:run.runId,tool:'refund',arguments:{paymentId:'synthetic',amount:10}});
  await refreshed();
  // Existing Run history shows the exact external proposal and its arguments.
  const runCard=page.locator(`[data-supervised-run="${run.runId}"]`);await runCard.waitFor();
  assert.match(await runCard.innerText(),/External Hermes tool/);assert.match(await runCard.innerText(),/synthetic/);
  assert.equal(await runCard.getByRole('button',{name:'Save revised call'}).count(),0);
  await runCard.getByRole('button',{name:'Approve Hermes call'}).click();
  await page.getByText('Approval saved. Retry this exact call in Hermes to claim and execute it once.',{exact:true}).waitFor();
  assert.equal((await machine('propose',{runId:run.runId,tool:'refund',arguments:{amount:10,paymentId:'synthetic'}})).approved,true);
  assert.equal(effects,0);
  assert.equal((await stores.acme.get<Run>('run:'+run.runId))!.status,'executing');
  assert.equal(await page.locator('[data-approval-count]').first().innerText(),'0');
  assert.match(await runCard.innerText(),/approved · awaiting Hermes claim/i);
  assert.equal(await runCard.getByRole('button',{name:'Approve Hermes call'}).count(),0);
  await runCard.getByRole('button',{name:'Cancel approved Hermes call'}).click();
  await page.getByText('Hermes approval cancelled.',{exact:true}).waitFor();
  assert.equal((await stores.acme.get<Run>('run:'+run.runId))!.status,'cancelled');
  // Navigate back to agents for owner-only credential lifecycle.
  await page.evaluate(()=>{location.hash='run';});
  page.on('dialog',dialog=>dialog.accept());
  await card().getByRole('button',{name:'Rotate execution token'}).click();await secret.waitFor();
  const replacement=await secret.inputValue();assert.notEqual(replacement,token);
  await card().getByRole('button',{name:'Revoke execution token'}).click();
  await page.locator('#status').filter({hasText:'Execution token revoked.'}).waitFor();assert.equal(await secret.count(),0);
  const revoked=await runtimes.acme.handle(new Request('https://runtime.test/external/start',{method:'POST',headers:{'x-runtime-workspace':'acme',authorization:'Bearer '+replacement},body:JSON.stringify({agentId:external.id,sessionId:'another'})}));assert.equal(revoked.status,401);
  role='operator';await page.reload();await card().waitFor();await openSetup();assert.equal(await form().getByRole('button',{name:'Register Hermes agent'}).isDisabled(),true);assert.equal(await card().getByRole('button',{name:'Rotate execution token'}).isDisabled(),true);
  role='viewer';await page.reload();await card().waitFor();await openSetup();assert.equal(await form().getByLabel('Hermes agent name').isDisabled(),true);assert.equal(await card().getByRole('button',{name:'Revoke execution token'}).isDisabled(),true);
  role='owner';await page.reload();await card().waitFor();await openSetup();await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  assert.deepEqual(errors,[]);console.log('Hermes browser acceptance passed: owner provisioning, one-time masked token, existing agent limits, exact approval with zero provider effects, rotation/revocation, roles, secret clearing and mobile layout.');
} finally {await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
