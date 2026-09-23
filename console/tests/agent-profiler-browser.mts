import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import worker from '../src/worker.ts';
import { AgentRuntime, type RuntimeStorage } from '../src/agent-runtime.ts';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
class Storage implements RuntimeStorage {
 data = new Map<string, any>();
 async get<T>(key: string) { return structuredClone(this.data.get(key)) as T | undefined; }
 async put<T>(key: string, value: T) { this.data.set(key, structuredClone(value)); }
 async delete(key: string) { return this.data.delete(key); }
 async list<T>({prefix}: {prefix:string}) { return new Map([...this.data].filter(([k]) => k.startsWith(prefix)).map(([k,v]) => [k,structuredClone(v) as T])); }
 async setAlarm() {} async deleteAlarm() {}
}
const storage = new Storage(), beta = new Storage();
const connection = { id:'server', label:'Research server', status:'connected', endpoint:'https://mcp.firecrawl.dev/v2/mcp', protocol:'2025-03-26', tools:[{name:'firecrawl_scrape',description:'',inputSchema:{type:'object'}},{name:'search',description:'',inputSchema:{type:'object'}}], suggestions:[{id:'suggested',title:'Suggested brief',goal:'Research a market',setup:'Provide a market',success:'Cite sources',tools:['search']}] };

let failProfile=false, holdProfile=false, releaseProfile:(()=>void)|undefined;
const ai={async run(_model:any,input:any){
 if(input.messages[0].content.startsWith('Rank candidate')) return {response:{recommendations:JSON.parse(input.messages[1].content).candidates.slice(0,4).map((c:any)=>({id:c.id,reason:'Declared capability fits the requested source; access remains unverified.'}))}};

 const data=JSON.parse(input.messages[1].content);
 if(input.messages[0].content.startsWith('Suggest useful agents')) {
  if(holdProfile) await new Promise<void>(resolve=>{releaseProfile=resolve;});
  if(failProfile) throw new Error('offline');
  assert.ok(data.area); assert.deepEqual(Object.keys(data).sort(),['area','context']);
  return {response:{ideas:[
   {title:data.area+' research brief',benefit:'Prepare a sourced brief for your team.',description:'Research the '+data.context+' topic I supply and prepare a brief for my review.',capabilities:[{label:'Read source pages',matches:[]}]},
   {title:'Vendor comparison',benefit:'Compare alternatives before a team decision.',description:'Compare vendors I provide, cite sources and prepare a table for my review.',capabilities:[{label:'Search vendor pages',matches:[]}]},
   {title:'Release digest',benefit:'Identify changes that may need attention.',description:'Summarize supplied release notes for my review.',capabilities:[{label:'Read release notes',matches:[]}]}
  ]}};
 }
 return {response:{boundaries:'Use supplied sources only; stop if evidence is unavailable.',evaluation:{version:1,checks:[],rubrics:[{id:'grounded',label:'Grounded result',criterion:'Support the requested result with retrieved source evidence.',measurement:{method:'Count sourced claims / all claims; require 100%. No retained search evidence is inconclusive.',evidence:'Final answer claims and retained source results.'}}]},title:'Research brief',goal:data.description,instructions:'Read supplied pages.',success:'A sourced brief',requirements:[{label:'Read source pages',matches:[]}],questions:[]}};
}};
const transport=async (_url:any,init:any)=>{
 if(!init?.body)return Response.json({Status:0,Answer:[{type:1,data:'104.26.5.12'}]});
 if(init.method==='DELETE')return new Response(null,{status:204});const message=JSON.parse(init.body);
 if(message.method==='notifications/initialized')return new Response(null,{status:202});
 const result=message.method==='initialize'?{protocolVersion:'2025-03-26',capabilities:{tools:{}}}:message.method==='tools/list'?{tools:connection.tools}:{structuredContent:{price:20}};
 return Response.json({jsonrpc:'2.0',id:message.id,result});
};
const runtimes = { acme: new AgentRuntime(storage, {AGENT_AI:ai},transport as typeof fetch), beta: new AgentRuntime(beta, {AGENT_AI:ai},transport as typeof fetch) };
let viewer = false, signedOut = false;
const posts: any[] = [];
const env = { CONSOLE_ENABLE_MOCK_IDENTITY:'true', CONSOLE_ENVIRONMENT:'development', CONSOLE_MOCK_SUBJECT:'test', CONSOLE_MOCK_TENANT_ID:'acme' };
const server = createServer(async (req, res) => {
 const url = new URL(req.url!, 'http://localhost');
 if (!url.pathname.startsWith('/api/')) { const out = await worker.fetch(new Request(url), env); res.statusCode = out.status; out.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await out.arrayBuffer())); return; }
 if(signedOut) {res.statusCode=401;res.setHeader('content-type','application/json');res.end('{}');return;}
 let value: any = {};
 if (url.pathname === '/api/console/session') value = {tenant_id:'acme', email:'owner@example.com', memberships:['acme','beta'].map(id=>({tenant:{tenant_id:id,display_name:id},membership:{role:viewer?'viewer':'owner'}}))};
 else if (url.pathname.endsWith('/catalog')) value = {servers:[],total:0,capabilities:[],authTypes:[],nextOffset:null};
 else if (url.pathname.endsWith('/evals')) value={schema_version:'agentaction.tenant-evals.v1',definitions:[],assignments:[]};
 else if (url.pathname.endsWith('/setup')) value={membership:{role:viewer?'viewer':'owner'},sources:[]};
 else if (url.pathname.startsWith('/api/agents/')) {
  const [, , , tenant, action] = url.pathname.split('/');
  let body = ''; for await (const chunk of req) body += chunk;
  if (body) posts.push({tenant,action,body:JSON.parse(body)});
  const out = await runtimes[tenant as keyof typeof runtimes].handle(new Request('https://runtime.test/'+action, {method:req.method,headers:{'x-runtime-role':viewer?'viewer':'owner'},...(body?{body}:{})}));
  res.statusCode = out.status; value = await out.json();
 } else if (url.pathname.startsWith('/api/automations/')) value = {jobs:[],runs:[],findings:[]};
 res.setHeader('content-type','application/json'); res.end(JSON.stringify(value));
});
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
const page = await browser.newPage({viewport:{width:1440,height:1050}}), errors: string[]=[];
page.on('pageerror', e=>errors.push(e.message));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
const field = (name:string) => page.locator(`#create [name=${name}]`);
const latest = async () => (await runtimes.acme.snapshot() as any);
try {
 page.setDefaultTimeout(10000);
 const open=async()=>{await page.locator('#agent-profiler > summary').click();};
 const suggest=async()=>{await page.locator('#suggest-ideas').click();await page.getByText('Choose a starting point.',{exact:false}).waitFor();};
 await page.goto(base+'/agents');await page.getByText('Workspace ready · owner',{exact:true}).waitFor();
 assert.equal(await page.getByText('Try an example',{exact:true}).count(),0);
 assert.equal(await page.locator('#agent-profiler').getAttribute('open'),null);
 await open();await page.locator('#profile-area').fill('Product');await page.locator('#profile-context').fill('customer onboarding');await suggest();
 assert.equal(await page.locator('#agent-ideas article').count(),3);
 assert.match(await page.locator('#agent-ideas').innerText(),/Product research brief/);
 assert.match(await page.locator('#agent-ideas').innerText(),/customer onboarding/);
 assert.equal(await page.getByText('Capability: Read source pages',{exact:true}).count(),1);
 assert.equal((await latest()).drafts.length,0);assert.equal((await latest()).agents.length,0);assert.equal((await latest()).runs.length,0);
 await page.locator('#guided-create').screenshot({path:'/tmp/aa-233-profiler-desktop.png'});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('#agent-profiler').screenshot({path:'/tmp/aa-233-profiler-mobile.png'});
 await page.setViewportSize({width:1440,height:1050});
 const before=posts.length;await page.getByRole('button',{name:'Use this idea',exact:true}).first().click();
 assert.equal(posts.length,before);assert.match(await page.locator('#job-description').inputValue(),/customer onboarding/);
 assert.equal(await page.locator('#job-description').evaluate((el:any)=>document.activeElement===el),true);
 assert.equal(await page.locator('#agent-profiler').getAttribute('open'),null);
 await page.locator('#job-description').fill('Research onboarding for my review with source links');await page.locator('#generate-draft').click();await page.getByText('AI-drafted · untested.',{exact:false}).waitFor();
 assert.equal(await field('setup').inputValue(),'Research onboarding for my review with source links');assert.equal((await latest()).drafts.length,1);
 // Unrelated connected economic-data tools never reach the profiler or appear as matches.
 await storage.put('connection:server',{...connection,tools:[{name:'get_unemployment',description:'Research labor markets and inflation',inputSchema:{type:'object'}}]});await page.goto(base+'/agents');await page.getByText('Workspace ready · owner',{exact:true}).waitFor();
 await open();await page.locator('#profile-area').fill('Engineering');await suggest();
 assert.match(await page.locator('#agent-ideas').innerText(),/Engineering research brief/);
 assert.doesNotMatch(await page.locator('#agent-profiler').innerText(),/Possible match|Needs an MCP tool|connected tool descriptions|unemployment|inflation/);
 assert.match(await page.locator('#profile-feedback').innerText(),/choose its tools when drafting/);
 // Workspace changes clear all profiler inputs and results.
 await page.locator('#workspace').selectOption('beta');await page.getByText('Workspace ready · owner',{exact:true}).waitFor();
 assert.equal(await page.locator('#profile-area').inputValue(),'');assert.equal(await page.locator('#profile-context').inputValue(),'');assert.equal(await page.locator('#agent-ideas article').count(),0);
 await open();await page.locator('#profile-area').fill('Operations');
 // Model failure leaves manual entry available and permits retry.
 failProfile=true;await page.locator('#suggest-ideas').click();await page.getByText('Try again or describe your own job above.',{exact:false}).waitFor();
 assert.equal(await page.locator('#generate-draft').isEnabled(),true);failProfile=false;await suggest();
 // Edits made while inference is pending invalidate the result.
 holdProfile=true;releaseProfile=undefined;await page.locator('#suggest-ideas').click();
 while(!releaseProfile) await new Promise(r=>setTimeout(r,10));
 await page.locator('#profile-area').fill('Research');releaseProfile!();
 await page.waitForFunction(()=>!document.querySelector('#suggest-ideas')?.hasAttribute('aria-busy'));
 assert.equal(await page.locator('#agent-ideas article').count(),0);assert.match(await page.locator('#profile-feedback').innerText(),/Details changed/);
 releaseProfile=undefined;await page.locator('#suggest-ideas').click();while(!releaseProfile) await new Promise(r=>setTimeout(r,10));
 await page.locator('#job-description').fill('Keep my own edited job');releaseProfile!();
 await page.waitForFunction(()=>!document.querySelector('#suggest-ideas')?.hasAttribute('aria-busy'));
 assert.equal(await page.locator('#agent-ideas article').count(),0);assert.equal(await page.locator('#job-description').inputValue(),'Keep my own edited job');
 // A forced workspace change during a request also rejects the old response.
 releaseProfile=undefined;await page.locator('#suggest-ideas').click();while(!releaseProfile) await new Promise(r=>setTimeout(r,10));
 await page.locator('#workspace').evaluate((el:any)=>{el.disabled=false;});await page.locator('#workspace').selectOption('acme');await page.getByText('Workspace ready · owner',{exact:true}).waitFor();releaseProfile!();
 await page.waitForFunction(()=>!document.querySelector('#suggest-ideas')?.hasAttribute('aria-busy'));
 assert.equal(await page.locator('#profile-area').inputValue(),'');assert.equal(await page.locator('#agent-ideas article').count(),0);holdProfile=false;
 // Viewer cannot submit; expired sessions remove private profile state.
 viewer=true;await page.goto(base+'/agents');await page.getByText('Workspace ready · viewer',{exact:true}).waitFor();await open();
 for(const id of ['profile-area','profile-context','suggest-ideas']) assert.equal(await page.locator('#'+id).isDisabled(),true);
 viewer=false;await page.goto(base+'/agents');await page.getByText('Workspace ready · owner',{exact:true}).waitFor();await open();await page.locator('#profile-area').fill('Private area');
 signedOut=true;await page.locator('#suggest-ideas').click();await page.getByText('Your session has expired or you are signed out.',{exact:false}).first().waitFor();
 assert.equal(await page.locator('#profile-area').inputValue(),'');assert.equal(await page.locator('#agent-ideas article').count(),0);
 assert.deepEqual(errors,[]);console.log('Profiler browser checks passed: replacement entry, custom area/context, three ideas, prefill only, draft handoff, independence from unrelated connected tools, stale responses, workspace/session isolation, errors, viewers and mobile.');
} finally { await browser.close();await new Promise<void>(r=>server.close(()=>r())); }
