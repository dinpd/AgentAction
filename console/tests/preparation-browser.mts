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
 if(input.messages[0].content.startsWith('Prepare the'))return {response:{fields:Object.fromEntries(JSON.parse(input.messages[1].content).definition.fields.map((name:string)=>[name,{text:name==='Search phrases'?'retirement scenario comparison':name+' from website',sources:['s1'],basis:'source'}]))}};
 if(input.messages[0].content.startsWith('Rank candidate')) return {response:{recommendations:JSON.parse(input.messages[1].content).candidates.slice(0,4).map((c:any)=>({id:c.id,reason:'Declared capability fits the requested source; access remains unverified.'}))}};

 if(input.messages[0].content.startsWith('Assess each frozen'))return {response:{criteria:[{id:'outcome_1',status:'pass',reason:'Price supported by source.',observed:'1 / 1 claims supported (100%).',calls:[0]}]}};
 if(input.messages[0].content.startsWith('Design an agent')) {
  if(holdDraft) await new Promise<void>(resolve=>{releaseDraft=resolve;});
  if(failDraft) throw new Error('offline');
  const {description}=JSON.parse(input.messages[1].content);
  return {response:{boundaries:'Use supplied sources only; stop if evidence is unavailable.',evaluation:{version:1,checks:[],rubrics:[{id:'grounded',label:'Grounded result',criterion:'Support the requested result with retrieved source evidence.',measurement:{method:'Count sourced claims / all claims; require 100%. No retained search evidence is inconclusive.',evidence:'Final answer claims and retained source results.'}}]},title:'Pricing brief',goal:'Summarize a supplied pricing page',instructions:'Read the supplied page and cite it.',success:'A concise pricing summary with sources',requirements:[{label:'Read pricing page',matches:[]}],questions:description.includes('example.com')?[]:['Which pricing page should I read?']}};
 }
 return {response:step++%2===0?{type:'call',tool:'step_1',arguments:{}}:{type:'finish',summary:'The price is 20.',outcome:'met',reason:'Read the structured result.'}};
}};
const transport=async (_url:any,init:any)=>{
 if(String(_url).startsWith('https://finp4l.com/'))return new Response('<h1>FinP4l retirement scenario planning</h1>',{headers:{'content-type':'text/html'}});
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
 await page.goto(base+'/agents');await page.getByText('Workspace ready · owner',{exact:true}).waitFor();
 await page.locator('#job-description').fill('Social posts for finp4l.com');await page.locator('#generate-draft').click();await page.locator('#draft-next').waitFor();
 await page.locator('#draft-answer-0').fill('X and Reddit, last day');
 await page.locator('#draft-save-shortcut').click();await page.locator('[data-draft-save-status=top]').filter({hasText:'All changes saved'}).waitFor();
 await page.locator('#setup-preparation > summary').click();
 assert.match(await page.locator('#setup-preparation > summary').innerText(),/Company research brief.*Read and review required/);
 assert.equal(await page.locator('#approve-draft').isDisabled(),true);
 await page.getByRole('button',{name:'Read website & draft brief',exact:true}).click();await page.locator('#brief-0').waitFor();
 assert.equal(await page.locator('#brief-3').inputValue(),'retirement scenario comparison');
 await page.locator('#brief-3').fill('FIRE retirement scenario modeling');
 assert.match(await page.locator('#setup-preparation > summary').innerText(),/Unsaved research edits/);
 await page.locator('#brief-reviewed').check();await page.getByRole('button',{name:'Save reviewed brief',exact:true}).click();
 await page.locator('#preparation-status').filter({hasText:'Research brief saved'}).waitFor();
 await page.reload();await page.getByRole('button',{name:'Continue setup',exact:true}).click();
 await page.locator('#setup-preparation > summary').click();assert.equal(await page.locator('#brief-3').inputValue(),'FIRE retirement scenario modeling');
 assert.match(await page.locator('#setup-preparation > summary').innerText(),/Brief saved/);
 await page.getByText('Define or customize this skill',{exact:true}).click();await page.locator('#skill-title').fill('Audience discovery');
 await page.getByRole('button',{name:'Save as new reusable skill',exact:true}).click();await page.locator('#preparation-status').filter({hasText:'Saved. Continue below.'}).waitFor();
 assert.equal(await page.locator('#brief-0').count(),0);
 assert.equal((await latest()).preparationSkills.length,2);
 assert.ok(!JSON.stringify((await latest()).preparationSkills).includes('finp4l.com'));
 await page.getByRole('button',{name:'Read website & draft brief',exact:true}).click();await page.locator('#brief-0').waitFor();
 await page.locator('#brief-reviewed').check();await page.getByRole('button',{name:'Save reviewed brief',exact:true}).click();await page.locator('#preparation-status').filter({hasText:'Research brief saved'}).waitFor();
 await page.getByText('Define or customize this skill',{exact:true}).click();await page.locator('#skill-instructions').fill('Extract only supported audience and search phrases.');
 await page.getByRole('button',{name:'Save new version of selected skill',exact:true}).click();await page.locator('#preparation-status').filter({hasText:'Saved. Continue below.'}).waitFor();
 assert.match(await page.locator('#setup-preparation > summary').innerText(),/v2.*Read and review required/);
 await page.reload();await page.getByRole('button',{name:'Continue setup',exact:true}).click();await page.locator('#setup-preparation > summary').click();
 assert.equal(await page.locator('#skill-instructions').inputValue(),'Extract only supported audience and search phrases.');
 const current=(await latest()).drafts[0].preparation.skill;
 await runtimes.acme.handle(new Request('https://runtime.test/save-skill',{method:'POST',body:JSON.stringify({id:current.id,baseVersion:2,definition:{...current.definition,title:'Latest audience research'}})}));
 await page.reload();await page.getByRole('button',{name:'Continue setup',exact:true}).click();
 if(await page.locator('#setup-preparation').getAttribute('open')===null)await page.locator('#setup-preparation > summary').click();
 assert.match(await page.locator('#setup-preparation > summary').innerText(),/v2/);
 await page.getByRole('button',{name:'Use version 3',exact:true}).click();await page.locator('#preparation-status').filter({hasText:'Saved. Continue below.'}).waitFor();
 assert.match(await page.locator('#setup-preparation > summary').innerText(),/Latest audience research.*v3/);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 await page.screenshot({path:'/tmp/agentaction-preparation-browser.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('Preparation browser acceptance passed: website → editable brief → explicit save → reload → reusable definition → version update.');
} finally {await browser.close();server.close();}
