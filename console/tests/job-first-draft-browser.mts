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
const connection = { id:'server', label:'Notion', status:'connected', endpoint:'https://notion.example/mcp', protocol:'2025-03-26', tools:[{name:'notion-search',description:'Search workspace pages',inputSchema:{type:'object'}}], suggestions:[] };
await storage.put('connection:server',connection);
const researchTool={name:'social_search',description:'Search public social media posts with source links and dates',inputSchema:{type:'object'}};
let step=0;
const ai={async run(_model:any,input:any){
 if(input.messages[0].content.startsWith('Rank candidate')) return {response:{recommendations:JSON.parse(input.messages[1].content).candidates.slice(0,4).map((c:any)=>({id:c.id,reason:'Declared capability fits the requested source; access remains unverified.'}))}};

 if(input.messages[0].content.startsWith('Design an agent')) {
  assert.deepEqual(Object.keys(JSON.parse(input.messages[1].content)),['description']);
  return {response:{title:'Social research',goal:'Research social posts relevant to the supplied company',instructions:'Search the selected platforms and summarize relevant findings with links.',success:'A sourced research brief with coverage gaps',boundaries:'Read public posts only. Do not publish, reply, send messages or purchase data.',requirements:[{label:'Search public social media posts',matches:[]}],questions:['Which platforms and time window should the research cover?'],evaluation:{version:1,checks:[],rubrics:[{id:'relevance',label:'Relevant findings',criterion:'Each finding explains its relevance to the supplied company using retrieved evidence.',measurement:{method:'Count sourced claims / all claims; require 100%. No retained search evidence is inconclusive.',evidence:'Final answer claims and retained source results.'}},{id:'sources',label:'Traceable sources',criterion:'Each finding includes its original source link and date, or explicitly flags missing metadata.',measurement:{method:'Count sourced claims / all claims; require 100%. No retained search evidence is inconclusive.',evidence:'Final answer claims and retained source results.'}}]}}};
 }
 if(input.messages[0].content.startsWith('Assess each frozen')) {assert.match(JSON.parse(input.messages[1].content).task.inputs,/Reddit, last seven days/);return {response:{criteria:[{id:'outcome_1',status:'fail',reason:'The retrieved posts do not establish relevance to the requested company.',observed:'0 / 1 claims supported (0%).',calls:[0]},{id:'outcome_2',status:'pass',reason:'The finding includes the retrieved source URL and date.',observed:'1 / 1 claims supported (100%).',calls:[0]}]}};}
 return {response:step++%2===0?{type:'call',tool:'step_1',arguments:{}}:{type:'finish',summary:'An unrelated post: https://social.example/post/1, dated 2026-09-22.',outcome:'met',reason:'Search succeeded.'}};
}};
const transport=async (_url:any,init:any)=>{
 if(!init?.body)return Response.json({Status:0,Answer:[{type:1,data:'104.26.5.12'}]});
 if(init.method==='DELETE')return new Response(null,{status:204});const message=JSON.parse(init.body);
 if(message.method==='notifications/initialized')return new Response(null,{status:202});
 const result=message.method==='initialize'?{protocolVersion:'2025-03-26',capabilities:{tools:{}}}:message.method==='tools/list'?{tools:[researchTool]}:{structuredContent:{posts:[{url:'https://social.example/post/1',date:'2026-09-22',text:'Unrelated company'}]}};
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
 else if (url.pathname.endsWith('/catalog')) value = {servers:[{name:'research/social',title:'Social post search',website:'https://provider.example/pricing',description:'Search public social media posts with source links and timestamps',version:'1',publisher:'research',endpoints:[],inspectableEndpoints:[],hosting:'Remote server',setup:'Connect',capabilities:[],authTypes:[]}],total:1,capabilities:[],authTypes:[],nextOffset:null};
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
 await page.goto(base+'/agents');await page.getByText('Workspace ready · owner',{exact:true}).waitFor();
 await page.locator('#job-description').fill('social media post scanner for example.com');await page.locator('#generate-draft').click();
 await page.locator('[data-rubric-id=outcome_1]').waitFor();
 assert.equal(await field('boundaries').isVisible(),true);assert.equal(await page.locator('[data-rubric-criterion]').count(),2);
 assert.equal(await page.locator('[data-connected-tool="notion-search"]').count(),0);
 await page.locator('[data-registry-server="research/social"]').waitFor();
 assert.equal(await page.locator('#review-first-action').isDisabled(),true);
 assert.equal((await latest()).drafts[0].bindings.step_1,undefined);
 assert.ok(await page.locator('#draft-policy').evaluate(el=>el.compareDocumentPosition(document.querySelector('#agent-tools')!) & Node.DOCUMENT_POSITION_FOLLOWING));
 await page.locator('#draft-answer-0').fill('Reddit, last seven days');
 await field('boundaries').fill('Read public posts only. No posts, replies, messages or paid data.');
 await page.locator('[data-rubric-id=outcome_1] [data-rubric-criterion]').fill('Every finding must directly concern the supplied company and cite its source.');
 await page.locator('[data-rubric-id=outcome_1] [data-rubric-method]').fill('Count findings supported by sources divided by all findings. Pass at 100%; no search evidence is inconclusive.');
 await page.locator('#create-agent').click();await page.getByText('Agent draft saved. Continue setup whenever you are ready.',{exact:true}).waitFor();
 await page.reload();await page.getByRole('button',{name:'Continue setup',exact:true}).click();
 assert.match(await field('boundaries').inputValue(),/No posts/);assert.match(await page.locator('[data-rubric-id=outcome_1] [data-rubric-criterion]').inputValue(),/directly concern/);
 assert.match(await page.locator('[data-rubric-id=outcome_1] [data-rubric-method]').inputValue(),/divided by all findings/);
 assert.match(await page.locator('#mapping-status').innerText(),/Search public social media posts/);
 await page.locator('#mapping-status').getByRole('button',{name:'Search public social media posts',exact:true}).click();
 assert.equal(await page.locator('[data-capability-step=step_1]').evaluate(el=>el===document.activeElement),true);
 const provider=page.locator('[data-registry-server="research/social"]');
 await provider.getByText('Pricing: not available in this catalog.',{exact:false}).waitFor();
 await provider.getByRole('button',{name:'Select server & review setup',exact:true}).click();
 await page.getByRole('heading',{name:'Connect a server for Search public social media posts',exact:true}).waitFor();
 assert.match(await page.locator('#catalog-selection').innerText(),/Selected for setup: Social post search/);
 assert.match(await page.locator('#catalog-selection').innerText(),/local stdio/);
 assert.equal(await page.locator('#catalog-selection a').getAttribute('href'),'https://provider.example/pricing');
 assert.equal(await page.locator('#precheck-endpoint').inputValue(),'');
 assert.equal((await latest()).drafts[0].bindings.step_1,undefined);
 assert.equal((await latest()).drafts[0].review,undefined);
 await page.locator('#recipe-return a').click();await page.locator('#draft-policy').waitFor();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'/tmp/aa267-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1050});await page.screenshot({path:'/tmp/aa267-desktop.png',fullPage:true});
 // Connecting a research source does not rewrite the job or approve a tool call.
 await storage.put('connection:research',{...connection,id:'research',label:'Research source',endpoint:'https://mcp.firecrawl.dev/v2/mcp',tools:[researchTool]});
 await page.reload();await page.getByRole('button',{name:'Continue setup',exact:true}).click();
 await page.locator('[data-connected-tool=social_search]').getByRole('button',{name:'Use this tool',exact:true}).click();
 await page.locator('#approve-draft').click();await page.getByText('Draft approved. Any edit will require review again.',{exact:true}).waitFor();
 assert.equal(await page.locator('#review-first-action').isEnabled(),true);
 await page.locator('[data-rubric-id=outcome_1] [data-rubric-evidence]').fill('Final findings and original social post results.');assert.equal(await page.locator('#review-first-action').isDisabled(),true);
 await page.locator('#approve-draft').click();await page.getByText('Draft approved. Any edit will require review again.',{exact:true}).waitFor();
 await field('boundaries').fill('Public posts only; never write or buy data.');assert.equal(await page.locator('#review-first-action').isDisabled(),true);
 await page.locator('#approve-draft').click();await page.getByText('Draft approved. Any edit will require review again.',{exact:true}).waitFor();
 await page.locator('#review-first-action').click();await page.getByText('First trial planned. Review its proposed action or result below.',{exact:true}).waitFor();
 const trial=(await latest()).runs[0];assert.equal(trial.status,'awaiting_approval');assert.equal(trial.events.length,0);
 const approved=await runtimes.acme.handle(new Request('https://runtime.test/approve',{method:'POST',headers:{'x-runtime-role':'owner'},body:JSON.stringify({runId:trial.id,approvalId:trial.pending.id})}));assert.equal(approved.status,200);
 await page.locator('#refresh').click();await page.getByText('Relevant findings · fail',{exact:true}).waitFor({state:'attached'});
 assert.equal((await latest()).runs[0].evaluation.status,'fail');assert.equal((await latest()).runs[0].evaluation.criteria.find((c:any)=>c.id==='outcome_1').trust,'ai_assessed');
 assert.match(await page.locator('[data-hosted-evaluation]').first().innerText(),/Observed measurement: 0 \/ 1/);
 assert.match((await latest()).runs[0].contract.binding.specification.rubrics[0].measurement.method,/divided by all findings/);
 assert.deepEqual(errors,[]);console.log('Job-first browser acceptance passed: scope, ranking, editing, persistence, review, mobile, exact-action approval and outcome failure.');
} finally {await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
