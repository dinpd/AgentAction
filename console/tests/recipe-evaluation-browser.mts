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
 page.setDefaultTimeout(15000);
 await page.goto(base+'/agents#create'); await page.locator('#manual-options > summary').click(); await page.getByRole('button',{name:'Start from scratch',exact:true}).click();
 await page.locator('#editor-connection').selectOption('server'); await field('title').fill('Measured pricing brief'); await field('goal').fill('Read a supplied pricing page'); await field('success').fill('Sourced price'); await page.locator('#tool-options input[value=firecrawl_scrape]').check();
 assert.equal(await page.locator('#eval-enabled').isChecked(),true);
 await page.getByRole('button',{name:'Add a check',exact:true}).click();
 const check=page.locator('#eval-checks [data-check-id]');
 await check.locator('[data-check-label]').fill('Price equals 20');await check.locator('[data-check-kind]').selectOption('result_field');await check.locator('[data-check-tool]').selectOption('firecrawl_scrape');await check.locator('[data-check-path]').fill('price');await check.locator('[data-check-type]').selectOption('number');await check.locator('[data-check-value]').fill('20');
 await page.getByRole('button',{name:'Save as a template',exact:true}).click();await page.getByText('Saved agent template v1.',{exact:false}).waitFor();
 await page.reload();await page.locator('#example-library').evaluate((el:HTMLDetailsElement)=>el.open=true); await page.getByRole('button',{name:'Use or edit template',exact:true}).click();assert.equal(await check.locator('[data-check-value]').inputValue(),'20');assert.equal(await check.locator('[data-check-type]').inputValue(),'number');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.locator('#draft-customize').evaluate((el:HTMLDetailsElement)=>el.open=true);await page.locator('#eval-editor').screenshot({path:'/tmp/agentaction-223-eval-mobile.png'});await page.setViewportSize({width:1440,height:1050});
 await field('setup').fill('https://example.com/pricing');await page.getByRole('button',{name:'Review first action',exact:true}).click();await page.getByRole('button',{name:'Approve and execute',exact:true}).waitFor();
 let run=(await latest()).runs[0];assert.ok(run.contract);assert.equal(run.evaluation,undefined);
 await page.locator('#runs summary').filter({hasText:'Contract & evaluation · pending'}).click();await page.locator('#runs').getByText('Evaluation will be recorded when this run ends.',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Approve and execute',exact:true}).click();await page.locator('#runs summary').filter({hasText:'Contract & evaluation · pass'}).waitFor();
 run=(await latest()).runs[0];assert.equal(run.evaluation.status,'pass');const digest=run.contract.intent.intent_digest,profile=run.contract.intent.profile;
 await page.locator('#runs summary').filter({hasText:'Contract & evaluation · pass'}).click();await page.locator('#runs').getByText('Price equals 20 · pass',{exact:true}).waitFor();assert.ok((await page.locator('#runs').innerText()).includes(digest));await page.locator('#runs').screenshot({path:'/tmp/agentaction-223-run.png'});
 await page.goto(base+'/?workspace=acme&execution='+encodeURIComponent('supervised:'+run.id)+'#jobs');const jobs=page.locator('[data-hosted-jobs]');await jobs.getByText('Measured checks: pass',{exact:true}).waitFor();await jobs.locator('summary').filter({hasText:'Contract & evaluation · pass'}).click();await jobs.getByText('Price equals 20 · pass',{exact:true}).waitFor();assert.ok((await jobs.innerText()).includes(digest));
 await page.goto(base+'/?workspace=acme#evals');const evals=page.locator('[data-hosted-evals]');await evals.getByRole('heading',{name:'Measured pricing brief',exact:true}).waitFor();assert.ok((await evals.innerText()).includes(profile));await evals.locator('summary').filter({hasText:'Contract & evaluation · pass'}).click();await evals.getByText('Price equals 20 · pass',{exact:true}).waitFor();assert.ok((await evals.innerText()).includes(digest));await evals.screenshot({path:'/tmp/agentaction-223-evals.png'});
 await page.goto(base+'/agents#create');await page.locator('#example-library').evaluate((el:HTMLDetailsElement)=>el.open=true); await page.getByRole('button',{name:'Use or edit template',exact:true}).click();await page.locator('#draft-customize > summary').click();await check.locator('[data-check-path]').fill('__proto__.admin');await page.getByRole('button',{name:'Save new version',exact:true}).click();await page.getByText('Choose a plain field path within structuredContent, without prototype properties.',{exact:true}).waitFor();
 await page.locator('#workspace').selectOption('beta');await page.locator('#status').getByText('Workspace ready · owner').waitFor();assert.equal(await page.locator('#eval-checks').textContent(),'');
 viewer=true;await page.goto(base+'/?workspace=acme#evals');await evals.getByRole('heading',{name:'Measured pricing brief',exact:true}).waitFor();assert.equal((await latest()).runs.length,1);
 assert.deepEqual(errors,[]);console.log('Contract/eval browser acceptance passed: inline typed checks, pinned reuse, approval, identical Run/Jobs/Evals binding and result, validation, mobile, viewer and workspace isolation.');
} catch(error){console.error({errors,body:await page.locator('body').innerText()});throw error;}finally{await browser.close();server.close();}
