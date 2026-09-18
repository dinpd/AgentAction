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

let step=0, failDraft=false, holdDraft=false, releaseDraft:(()=>void)|undefined;
const ai={async run(_model:any,input:any){
 if(input.messages[0].content.startsWith('Draft a narrow')) {
  if(holdDraft) await new Promise<void>(resolve=>{releaseDraft=resolve;});
  if(failDraft) throw new Error('offline');
  const {description}=JSON.parse(input.messages[1].content);
  return {response:{title:'Pricing brief',goal:'Summarize a supplied pricing page',instructions:'Read the supplied page and cite it.',success:'A concise pricing summary with sources',requirements:[{label:'Read pricing page',matches:JSON.parse(input.messages[1].content).tools.filter((t:any)=>t.tool==='firecrawl_scrape').map((t:any)=>t.id)}],questions:description.includes('example.com')?[]:['Which pricing page should I read?']}};
 }
 return {response:step++%2===0?{type:'call',tool:'step_1',arguments:{}}:{type:'finish',summary:'The price is 20.',outcome:'met',reason:'Read the structured result.'}};
}};
const transport=async (_url:any,init:any)=>{
 if(!init?.body)return Response.json({Status:0,Answer:[{type:1,data:'104.26.5.12'}]});
 if(init.method==='DELETE')return new Response(null,{status:204});const message=JSON.parse(init.body);
 if(message.method==='notifications/initialized')return new Response(null,{status:202});
 const result=message.method==='initialize'?{protocolVersion:'2025-03-26',capabilities:{tools:{}}}:message.method==='tools/list'?{tools:connection.tools}:{structuredContent:{price:20}};
 return Response.json({jsonrpc:'2.0',id:message.id,result});
};
const runtimes = { acme: new AgentRuntime(storage, {AGENT_AI:ai},transport as typeof fetch), beta: new AgentRuntime(beta, {AGENT_AI:ai},transport as typeof fetch) };
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
 await page.goto(base+'/agents');
 await page.getByRole('heading',{name:'Give your agent a job.',exact:true}).waitFor();
 assert.equal(await page.locator('#draft-connection').count(),0);
 assert.equal(await page.locator('.journey-nav a[data-stage]').nth(1).getAttribute('data-stage'),'create');
 assert.equal(await page.locator('.workspace-nav [data-stage=connect]').innerText().then(t=>t.includes('MCP servers')),true);
 await page.locator('#job-description').fill('Summarize https://example.com/pricing in USD with sources');
 await page.getByRole('button',{name:'Draft my agent',exact:true}).click();
 await page.getByText('AI-drafted · untested.',{exact:false}).waitFor();
 assert.equal(await field('title').inputValue(),'Pricing brief');
 assert.equal(await field('setup').inputValue(),'Summarize https://example.com/pricing in USD with sources');
 assert.equal(await page.locator('#draft-customize').getAttribute('open'),null);
 assert.equal(await page.locator('#review-first-action').isDisabled(),true);
 assert.equal((await latest()).agents.length,0);assert.equal((await latest()).drafts.length,1);
 await page.locator('#draft-customize > summary').click();await field('instructions').fill('Read the page and cite billing intervals.');
 await page.locator('#draft-customize > summary').click();
 await page.getByRole('button',{name:'Save draft only',exact:true}).click();await page.getByText('Agent draft saved.',{exact:false}).waitFor();
 await page.reload();await page.getByRole('button',{name:'Continue setup',exact:true}).click();
 assert.equal(await field('instructions').inputValue(),'Read the page and cite billing intervals.');
 // Browsing and custom setup persist edits, including inputs, and never execute a provider call.
 await field('setup').fill('Read https://example.com/pricing for the annual report');
 await page.getByRole('button',{name:'Browse available MCP servers',exact:true}).click();
 await page.locator('#catalog-view').waitFor();await page.getByRole('link',{name:'← Continue agent setup',exact:true}).click();
 assert.equal(await field('setup').inputValue(),'Read https://example.com/pricing for the annual report');
 await page.locator('#plan-custom').click();await page.locator('#setup-view').waitFor();
 await page.locator('#connect [name=label]').fill('Research account');
 await page.locator('#connect [name=endpoint]').fill(connection.endpoint);
 await page.locator('#connect [name=consent]').check();
 await page.getByRole('button',{name:'Connect server',exact:true}).click();
 await page.getByText('Server connected. Review the tool mappings', {exact:false}).waitFor();
 assert.equal(await field('instructions').inputValue(),'Read the page and cite billing intervals.');
 const serverId=(await latest()).connections[0].id;
 await page.locator('[data-tool-mapping]').selectOption(JSON.stringify({connectionId:serverId,tool:'firecrawl_scrape'}));
 assert.equal(await page.locator('#review-first-action').isEnabled(),true);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('#configure').screenshot({path:'/tmp/aa-227-agent-mobile.png'});
 await page.setViewportSize({width:1440,height:1050});await page.locator('#configure').screenshot({path:'/tmp/aa-227-agent-desktop.png'});
 await page.getByRole('button',{name:'Review first action',exact:true}).click();
 await page.getByRole('button',{name:'Approve and execute',exact:true}).waitFor();
 assert.ok((await page.locator('.approval').innerText()).includes('Research account'));
 assert.ok((await page.locator('.approval').innerText()).includes('firecrawl_scrape'));
 let snapshot=await latest();assert.equal(snapshot.agents.length,1);assert.equal(snapshot.runs[0].events.length,0);assert.ok(snapshot.runs[0].contract.binding.tool_bindings);
 await page.getByRole('button',{name:'Approve and execute',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#runs')?.textContent?.includes('The price is 20.'));
 assert.equal((await latest()).runs[0].evaluation.status,'pass');
 // Unique tool matches prefill, equivalent accounts remain explicitly unresolved.
 await page.goto(base+'/agents');await page.locator('#job-description').fill('Read https://example.com/pricing');await page.locator('#generate-draft').click();await page.getByText('AI-drafted · untested.',{exact:false}).waitFor();
 assert.ok(await page.locator('[data-tool-mapping]').inputValue());
 await storage.put('connection:other',{...connection,id:'other',label:'Second account'});
 await page.goto(base+'/agents');await page.locator('#job-description').fill('Read https://example.com/pricing');await page.locator('#generate-draft').click();await page.getByText('AI-drafted · untested.',{exact:false}).waitFor();
 assert.equal(await page.locator('[data-tool-mapping]').inputValue(),'');assert.equal(await page.locator('#review-first-action').isDisabled(),true);
 await page.locator('#create-agent').click();await page.getByText('Agent draft saved.',{exact:false}).waitFor();
 // Switching workspaces clears private editing state; empty workspace can still draft.
 await page.locator('#workspace').selectOption('beta');await page.getByText('Workspace ready · owner',{exact:true}).waitFor();
 assert.equal(await page.locator('#configure').isHidden(),true);assert.equal(await page.locator('#job-description').inputValue(),'');assert.equal(await page.locator('#generate-draft').isEnabled(),true);
 await page.locator('#job-description').fill('Read https://example.com');await page.locator('#generate-draft').click();await page.getByText('AI-drafted · untested.',{exact:false}).waitFor();
 assert.equal(await page.locator('[data-tool-mapping] option').count(),1);
 // Viewer cannot generate or edit drafts.
 viewer=true;await page.goto(base+'/agents?workspace=beta');await page.getByText('Workspace ready · viewer',{exact:true}).waitFor();assert.equal(await page.locator('#generate-draft').isDisabled(),true);
 assert.deepEqual(errors,[]);console.log('Agent-first browser checks passed: empty draft, persistence, MCP detours, ambiguity, source approval, evidence, workspace isolation and mobile layout.');
} finally { await browser.close();await new Promise<void>(r=>server.close(()=>r())); }
