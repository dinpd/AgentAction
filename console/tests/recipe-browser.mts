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

let step=0;
const ai={async run(){return {response:step++%2===0?{type:'call',tool:'firecrawl_scrape',arguments:{}}:{type:'finish',summary:'The price is 20.',outcome:'met',reason:'Read the structured result.'}};}};
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
 const path='/agents?recipe=competitor-pricing&recipe_version=1.0.0#create';
 await page.goto(base+path);await page.getByRole('button',{name:'Configure this agent',exact:true}).waitFor();
 assert.equal(posts.length,0);assert.equal(await page.locator('#recipe-connection').count(),0);
 assert.equal(await page.getByRole('button',{name:'Configure this agent',exact:true}).isEnabled(),true);
 await page.getByRole('button',{name:'Configure this agent',exact:true}).click();await page.locator('#agent-tools').waitFor();
 assert.equal(await field('title').inputValue(),'Track competitor pricing changes');assert.equal(await field('setup').inputValue(),'');
 assert.equal(await page.locator('#review-first-action').isDisabled(),true);
 await field('setup').fill('PRIVATE acme input');await page.locator('#create-agent').click();await page.getByText('Agent draft saved.',{exact:false}).waitFor();
 assert.equal((await latest()).agents.length,0);assert.equal((await latest()).drafts.length,1);
 await page.locator('#workspace').selectOption('beta');await page.getByText('Workspace ready · owner',{exact:true}).waitFor();
 assert.equal(await page.locator('#configure').isHidden(),true);assert.equal(await field('setup').inputValue(),'');assert.equal(await page.locator('#agent-drafts').getByText('Track competitor pricing changes').count(),0);
 await page.goto(base+'/agents?recipe=competitor-pricing&recipe_version=0.0.0#create');await page.locator('#recipe-error').waitFor();assert.equal(await page.locator('#recipe-detail').isHidden(),true);
 await page.goto(base+'/agents?recipe=incident-to-ticket&recipe_version=1.0.0#create');await page.getByRole('button',{name:'Configure this agent',exact:true}).click();await page.locator('#agent-tools').waitFor();
 assert.ok(await page.locator('[data-tool-mapping]').count()>1);assert.equal(await page.locator('#review-first-action').isDisabled(),true);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.ok(posts.every(p=>['template-draft','save-draft'].includes(p.action)));assert.deepEqual(errors,[]);
 console.log('Template browser checks passed: compatible deep links, no server prerequisite, saved unbound drafts, multi-server requirements, stale versions, workspace isolation and mobile.');
} catch(error){console.error({errors,body:await page.locator('body').innerText()});throw error;} finally {await browser.close();server.close();}
