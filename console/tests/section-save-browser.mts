import { withProviderSetup } from '../src/mcp-registry.ts';
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
 if(new URL(String(_url)).hostname==='mcp.apify.com') {
  assert.equal(new Headers(init?.headers).has('authorization'),false);
  if(init?.method==='POST') {assert.equal(JSON.parse(init.body).method,'initialize');return new Response(null,{status:401,headers:{'www-authenticate':'Bearer'}});}
  return new Response(null,{status:404});
 }
 if(!init?.body)return Response.json({Status:0,Answer:[{type:1,data:'104.26.5.12'}]});
 if(init.method==='DELETE')return new Response(null,{status:204});const message=JSON.parse(init.body);
 if(message.method==='notifications/initialized')return new Response(null,{status:202});
 const result=message.method==='initialize'?{protocolVersion:'2025-03-26',capabilities:{tools:{}}}:message.method==='tools/list'?{tools:[researchTool]}:{structuredContent:{posts:[{url:'https://social.example/post/1',date:'2026-09-22',text:'Unrelated company'}]}};
 return Response.json({jsonrpc:'2.0',id:message.id,result});
};
const runtimes = { acme: new AgentRuntime(storage, {AGENT_AI:ai},transport as typeof fetch), beta: new AgentRuntime(beta, {AGENT_AI:ai},transport as typeof fetch) };
let viewer = false, failSave=false, holdSave=false;
let releaseSave:(()=>void)|undefined, onSaveReceived=()=>{};
const posts: any[] = [];
const env = { CONSOLE_ENABLE_MOCK_IDENTITY:'true', CONSOLE_ENVIRONMENT:'development', CONSOLE_MOCK_SUBJECT:'test', CONSOLE_MOCK_TENANT_ID:'acme' };
const server = createServer(async (req, res) => {
 const url = new URL(req.url!, 'http://localhost');
 if (!url.pathname.startsWith('/api/')) { const out = await worker.fetch(new Request(url), env); res.statusCode = out.status; out.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await out.arrayBuffer())); return; }
 let value: any = {};
 if (url.pathname === '/api/console/session') value = {tenant_id:'acme', email:'owner@example.com', memberships:['acme','beta'].map(id=>({tenant:{tenant_id:id,display_name:id},membership:{role:viewer?'viewer':'owner'}}))};
 else if (url.pathname.endsWith('/catalog')) value = {servers:[{name:'research/social',title:'Social post search',website:'https://provider.example/pricing',description:'Search public social media posts with source links and timestamps',version:'1',publisher:'research',endpoints:[],inspectableEndpoints:[],hosting:'Remote server',setup:'Connect',capabilities:[],authTypes:[]},withProviderSetup({name:'io.github.harshmaur/reddit-scraper',title:'Reddit Scraper (Apify)',website:'https://apify.com/harshmaur/reddit-scraper',description:'Search public social media posts on Reddit',version:'1',publisher:'harshmaur',endpoints:[],inspectableEndpoints:[],hosting:'Remote server',setup:'',capabilities:[],authTypes:['authorization-header']})],total:2,capabilities:[],authTypes:[],nextOffset:null};
 else if (url.pathname.endsWith('/evals')) value={schema_version:'agentaction.tenant-evals.v1',definitions:[],assignments:[]};
 else if (url.pathname.endsWith('/setup')) value={membership:{role:viewer?'viewer':'owner'},sources:[]};
 else if (url.pathname.startsWith('/api/agents/')) {
  const [, , , tenant, action] = url.pathname.split('/');
  let body = ''; for await (const chunk of req) body += chunk;
  if (body) posts.push({tenant,action,body:JSON.parse(body)});
  if(action==='save-draft' && failSave){failSave=false;res.statusCode=503;res.setHeader('content-type','application/json');res.end(JSON.stringify({error:'Temporary save failure'}));return;}
  if(action==='save-draft' && holdSave){holdSave=false;await new Promise<void>(resolve=>{releaseSave=resolve;onSaveReceived();});}
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
const saveStatus=()=>page.locator('[data-draft-save-status=top]');
const open=async(id:string)=>{if(await page.locator('#setup-'+id).getAttribute('open')===null)await page.locator('#setup-'+id+' > summary').click();};
const save=async(id:string)=>{await open(id);await page.locator('[data-section-save='+id+']').click();await page.locator('[data-draft-save-status=top]').filter({hasText:'All changes saved'}).waitFor();};
const reopen=async()=>{await page.reload();await page.getByRole('button',{name:'Continue setup',exact:true}).click();};
try {
 page.setDefaultTimeout(10000);
 await storage.put('connection:research',{...connection,id:'research',label:'Research source',endpoint:'https://mcp.firecrawl.dev/v2/mcp',tools:[researchTool]});
 await page.goto(base+'/agents');await page.getByText('Workspace ready · owner',{exact:true}).waitFor();
 await page.locator('#job-description').fill('Research example.com');await page.locator('#generate-draft').click();await page.locator('#draft-next').waitFor();
 assert.equal(await page.locator('[data-section-save]').count(),4);
 assert.match(await page.locator('#setup-details > summary').innerText(),/1 required answer missing/);
 assert.match(await page.locator('#setup-sources > summary').innerText(),/2. Tools.*No tools selected/s);
 await page.locator('#draft-answer-0').fill('X and Reddit, previous 24 hours');
 assert.equal(await saveStatus().innerText(),'Unsaved changes');
 assert.match(await page.locator('#setup-details > summary').innerText(),/Complete/);
 assert.equal(posts.filter(p=>p.action==='save-draft').length,0); // explicit saving only
 await save('details');await reopen();await open('details');
 assert.equal(await page.locator('#draft-answer-0').inputValue(),'X and Reddit, previous 24 hours');
 assert.equal(await field('setup').inputValue(),'Research example.com');
 await page.locator('#draft-answer-0').fill('');
 assert.match(await page.locator('#setup-details > summary').innerText(),/required answer missing/);
 assert.match(await page.locator('#draft-next-title').innerText(),/Complete the job details/);
 await page.locator('#draft-answer-0').fill('X and Reddit, last seven days');
 await page.locator('#draft-question-fields input[type=checkbox]').check();await save('details');await reopen();await open('details');
 assert.equal(await page.locator('#draft-question-fields input[type=checkbox]').isChecked(),true);
 assert.equal(await page.locator('#draft-answer-0').inputValue(),'X and Reddit, last seven days');
 assert.equal(await page.locator('#draft-answer-0').isDisabled(),true);
 await page.locator('#draft-question-fields input[type=checkbox]').uncheck();
 await open('sources');await page.locator('[data-connected-tool=social_search]').getByRole('button',{name:'Use this tool',exact:true}).click();
 assert.match(await page.locator('#setup-sources > summary').innerText(),/Selected: Research source · social_search/);
 assert.match(await page.locator('#setup-review > summary').innerText(),/Review required/);
 await save('sources');await reopen();
 assert.match(await page.locator('#setup-sources > summary').innerText(),/Selected: Research source · social_search/);
 await open('review');await field('boundaries').fill('Read public posts only; no purchases or publishing.');
 await page.locator('[data-rubric-method]').first().fill('Count supported findings / all findings, require 100%; missing evidence is inconclusive.');
 await save('review');await reopen();await open('review');
 assert.match(await field('boundaries').inputValue(),/no purchases/);
 assert.match(await page.locator('[data-rubric-method]').first().inputValue(),/Count supported findings/);
 await save('trial');assert.equal((await latest()).agents.length,0);assert.equal((await latest()).runs.length,0);
 // Failure retains input and offers the same explicit save as retry.
 await open('details');await page.locator('#draft-answer-0').fill('Latest saved scope');failSave=true;
 await page.locator('[data-section-save=details]').click();await saveStatus().filter({hasText:'Not saved.'}).waitFor();
 assert.equal(await page.locator('#draft-answer-0').inputValue(),'Latest saved scope');
 assert.equal(await page.locator('[data-section-save=details]').isEnabled(),true);
 await save('details');
 // A late save response must not overwrite edits made while the request was pending.
 await page.locator('#draft-answer-0').fill('Older submitted scope');holdSave=true;const received=new Promise<void>(resolve=>{onSaveReceived=resolve;});
 await page.locator('[data-section-save=details]').click();await saveStatus().filter({hasText:'Saving draft'}).waitFor();
 assert.equal(await page.locator('#workspace').isDisabled(),true);
 assert.equal(await page.locator('[data-section-save=review]').isDisabled(),true);
 await page.locator('#draft-answer-0').fill('Newer unsaved scope');
 await received;
 assert.ok(releaseSave);releaseSave!();releaseSave=undefined;
 await saveStatus().filter({hasText:'Unsaved changes'}).waitFor();
 assert.equal(await page.locator('#draft-answer-0').inputValue(),'Newer unsaved scope');
 assert.match((await latest()).drafts[0].setup,/Older submitted scope/);
 await save('details');await reopen();await open('details');
 assert.equal(await page.locator('#draft-answer-0').inputValue(),'Newer unsaved scope');
 // Review changes live, remains separate from saving, and edits require fresh approval.
 await open('review');await page.locator('#approve-draft').click();await page.getByText('Draft approved. Any edit will require review again.',{exact:true}).waitFor();
 assert.match(await page.locator('#setup-review > summary').innerText(),/Approved/);
 assert.match(await page.locator('#setup-trial > summary').innerText(),/Ready to review first action/);
 await field('boundaries').fill('Read only with original post links.');
 assert.match(await page.locator('#setup-review > summary').innerText(),/Review required/);
 assert.equal(await page.locator('#review-first-action').isDisabled(),true);
 await save('review');
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('#configure').screenshot({path:'/tmp/aa282-save-mobile.png'});
 await page.setViewportSize({width:1440,height:1050});
 for(const id of ['details','sources','review','trial']){if(await page.locator('#setup-'+id).getAttribute('open')!==null)await page.locator('#setup-'+id+' > summary').click();}
 await page.locator('#configure').screenshot({path:'/tmp/aa282-collapsed-desktop.png'});
 // Rejecting workspace navigation preserves dirty edits; accepting never copies them to another workspace.
 await open('details');await page.locator('#draft-answer-0').fill('Unsaved workspace-specific scope');
 page.once('dialog',d=>d.dismiss());await page.locator('#workspace').selectOption('beta');
 assert.equal(await page.locator('#workspace').inputValue(),'acme');
 assert.equal(await page.locator('#draft-answer-0').inputValue(),'Unsaved workspace-specific scope');
 page.once('dialog',d=>d.accept());await page.locator('#workspace').selectOption('beta');await page.getByText('Workspace ready · owner',{exact:true}).waitFor();
 assert.equal((await runtimes.beta.snapshot() as any).drafts.length,0);
 assert.equal(await page.locator('#configure').isVisible(),false);
 assert.equal(posts.some(p=>p.tenant==='beta' && p.action==='save-draft'),false);
 assert.equal(posts.some(p=>['create-bound','trial','approve'].includes(p.action)),false);
 assert.deepEqual(errors,[]);
 console.log('Section-save acceptance passed: explicit save in all steps, editable persistence, status/dependencies, error/retry, late response, isolated navigation, mobile.');
} finally {releaseSave?.();await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
