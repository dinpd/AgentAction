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
await storage.put('connection:server', connection);
let step=0, failDraft=false, holdDraft=false, releaseDraft:(()=>void)|undefined;
const ai={async run(_model:any,input:any){
 if(input.messages[0].content.startsWith('Draft a narrow')) {
  if(holdDraft) await new Promise<void>(resolve=>{releaseDraft=resolve;});
  if(failDraft) throw new Error('offline');
  const {description}=JSON.parse(input.messages[1].content);
  return {response:{title:'Pricing brief',goal:'Summarize a supplied pricing page',instructions:'Read the supplied page and cite it.',success:'A concise pricing summary with sources',tools:['firecrawl_scrape'],questions:description.includes('example.com')?[]:['Which pricing page should I read?']}};
 }
 return {response:step++%2===0?{type:'call',tool:'firecrawl_scrape',arguments:{}}:{type:'finish',summary:'The price is 20.',outcome:'met',reason:'Read the structured result.'}};
}};
const transport=async (_url:any,init:any)=>{
 if(init.method==='DELETE')return new Response(null,{status:204});const message=JSON.parse(init.body);
 if(message.method==='notifications/initialized')return new Response(null,{status:202});
 const result=message.method==='initialize'?{protocolVersion:'2025-03-26',capabilities:{tools:{}}}:message.method==='tools/list'?{tools:connection.tools}:{structuredContent:{price:20}};
 return Response.json({jsonrpc:'2.0',id:message.id,result});
};
const runtimes = { acme: new AgentRuntime(storage, {AGENT_AI:ai},transport as typeof fetch), beta: new AgentRuntime(beta, {}) };
let viewer = false;
const posts: any[] = [];
const env = { CONSOLE_ENABLE_MOCK_IDENTITY:'true', CONSOLE_ENVIRONMENT:'development', CONSOLE_MOCK_SUBJECT:'test', CONSOLE_MOCK_TENANT_ID:'acme' };
const server = createServer(async (req, res) => {
 const url = new URL(req.url!, 'http://localhost');
 if (!url.pathname.startsWith('/api/')) { const out = await worker.fetch(new Request(url), env); res.statusCode = out.status; out.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await out.arrayBuffer())); return; }
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
 await page.goto(base+'/agents#create');
 assert.equal(await page.locator('#draft-connection').inputValue(),'server');
 assert.equal(await page.locator('#draft-connection-field').isHidden(),true);
 await page.locator('#job-description').fill('Summarize https://example.com/pricing in USD with sources');
 await page.getByRole('button',{name:'Draft my agent',exact:true}).click();
 await page.getByText('AI-drafted · untested.',{exact:false}).waitFor();
 assert.equal(await field('title').inputValue(),'Pricing brief');
 assert.equal(await field('setup').inputValue(),'Summarize https://example.com/pricing in USD with sources');
 assert.equal(await page.locator('#draft-customize').getAttribute('open'),null);
 assert.equal(await page.locator('#draft-questions').isHidden(),true);
 assert.equal((await latest()).agents.length,0);assert.equal((await latest()).workspaceRecipes.length,0);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('#configure').screenshot({path:'/tmp/aa-225-guided-mobile.png'});
 await page.setViewportSize({width:1440,height:1050});await page.locator('#configure').screenshot({path:'/tmp/aa-225-guided-desktop.png'});
 await page.locator('#draft-customize > summary').click();await field('success').fill('Prices and billing intervals, with links');
 await page.locator('#draft-customize > summary').click();assert.ok((await page.locator('#draft-preview').innerText()).includes('Prices and billing intervals'));
 await page.getByRole('button',{name:'Review first action',exact:true}).click();
 await page.getByRole('button',{name:'Approve and execute',exact:true}).waitFor();
 let snapshot=await latest();assert.equal(snapshot.agents.length,1);assert.equal(snapshot.runs.length,1);assert.equal(snapshot.runs[0].events.length,0);assert.ok(snapshot.runs[0].contract);
 assert.equal(snapshot.agents[0].success,'Prices and billing intervals, with links');assert.equal(posts.filter(p=>p.action==='approve').length,0);
 // Missing essentials are blank, required, and stored only in instance inputs.
 await page.goto(base+'/agents#create');await page.locator('#job-description').fill('Summarize pricing');await page.getByRole('button',{name:'Draft my agent',exact:true}).click();
 await page.getByLabel('Which pricing page should I read?',{exact:true}).waitFor();
 const count=posts.filter(p=>p.action==='create').length;await page.getByRole('button',{name:'Save draft only',exact:true}).click();assert.equal(posts.filter(p=>p.action==='create').length,count);
 await page.getByLabel('Which pricing page should I read?',{exact:true}).fill('https://example.com/private-pricing');
 await page.locator('#draft-customize > summary').click();await page.getByRole('button',{name:'Save workspace recipe',exact:true}).click();await page.getByText('Saved workspace recipe v1.',{exact:false}).waitFor();
 assert.equal(JSON.stringify((await latest()).workspaceRecipes).includes('private-pricing'),false);
 await page.getByRole('button',{name:'Save draft only',exact:true}).click();await page.getByRole('heading',{name:'Put your agent to work.',exact:true}).waitFor();
 assert.ok((await latest()).agents.some((a:any)=>a.setup.includes('private-pricing')));
 // A trial-start failure retains the created draft and does not replay creation.
 await page.goto(base+'/agents#create');await page.locator('#job-description').fill('Read https://example.com/pricing');await page.getByRole('button',{name:'Draft my agent',exact:true}).click();await page.getByText('AI-drafted · untested.',{exact:false}).waitFor();
 await storage.put('limit:runs',{day:new Date().toISOString().slice(0,10),count:20});const beforeFailure=(await latest()).agents.length;
 await page.getByRole('button',{name:'Review first action',exact:true}).click();await page.locator('#status').getByText('Your agent was created, but its trial could not start.',{exact:false}).waitFor();assert.equal((await latest()).agents.length,beforeFailure+1);assert.equal((await latest()).runs.length,1);await storage.delete('limit:runs');
 // Multiple accounts are not guessed, including saved recipe reuse.
 await storage.put('connection:other',{...connection,id:'other',label:'Second account'});
 await page.goto(base+'/agents#create');assert.equal(await page.locator('#draft-connection').inputValue(),'');assert.equal(await page.locator('#draft-connection-field').isVisible(),true);
 await page.getByRole('button',{name:'Use or edit recipe',exact:true}).click();assert.equal(await page.locator('#editor-connection').inputValue(),'');
 // Generation failure keeps original text and manual authoring available.
 failDraft=true;await page.goto(base+'/agents#create');await page.locator('#draft-connection').selectOption('server');await page.locator('#job-description').fill('Keep these job details');await page.getByRole('button',{name:'Draft my agent',exact:true}).click();
 await page.locator('#draft-feedback').getByText('You can try again or use Start from scratch below.',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Start from scratch',exact:true}).click();assert.equal(await field('setup').inputValue(),'Keep these job details');failDraft=false;
 // Typing while generation is pending invalidates its proposed defaults.
 holdDraft=true;releaseDraft=undefined;await page.goto(base+'/agents#create');await page.locator('#draft-connection').selectOption('server');await page.locator('#job-description').fill('Old https://example.com');await page.getByRole('button',{name:'Draft my agent',exact:true}).click();
 for(let i=0;!releaseDraft&&i<100;i++)await new Promise(r=>setTimeout(r,10));assert.ok(releaseDraft);
 await page.locator('#job-description').fill('Keep my revised job');releaseDraft();holdDraft=false;await page.waitForFunction(()=>!document.querySelector('#generate-draft')?.hasAttribute('aria-busy'));assert.equal(await page.locator('#configure').isHidden(),true);assert.equal(await page.locator('#job-description').inputValue(),'Keep my revised job');
 // A response from another workspace must never restore its text.
 holdDraft=true;releaseDraft=undefined;await page.goto(base+'/agents#create');await page.locator('#draft-connection').selectOption('server');await page.locator('#job-description').fill('PRIVATE https://example.com');await page.getByRole('button',{name:'Draft my agent',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#generate-draft')?.hasAttribute('aria-busy'));
 await page.evaluate(()=>{const s=document.querySelector('#workspace') as HTMLSelectElement;s.value='beta';s.dispatchEvent(new Event('change'));});await page.locator('#status').getByText('Workspace ready · owner').waitFor();
 for(let i=0;!releaseDraft&&i<100;i++)await new Promise(r=>setTimeout(r,10));assert.ok(releaseDraft);releaseDraft();holdDraft=false;
 await page.waitForFunction(()=>!document.querySelector('#generate-draft')?.hasAttribute('aria-busy'));
 assert.equal(await page.locator('#configure').isHidden(),true);assert.equal(await page.locator('#job-description').inputValue(),'');assert.equal(await field('setup').inputValue(),'');assert.equal(await page.locator('#generate-draft').isDisabled(),true);assert.equal(await page.locator('#draft-connect').isVisible(),true);
 viewer=true;await page.goto(base+'/agents#create');await page.locator('#account-role').getByText('viewer',{exact:true}).waitFor();assert.equal(await page.locator('#generate-draft').isDisabled(),true);
 assert.deepEqual(errors,[]);console.log('Guided Create acceptance passed: one prompt to approval, editable defaults, required missing details, instance-only answers, optional save, ambiguous accounts, fallback, stale workspace, viewer and mobile.');
} catch(error){console.error({errors,body:await page.locator('body').innerText()});throw error;}finally{releaseDraft?.();await browser.close();server.close();}
