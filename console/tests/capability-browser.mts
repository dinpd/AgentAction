import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
const fixture=JSON.parse(readFileSync(new URL('../../fixtures/mcp-capability-coverage-v1/cases.json',import.meta.url),'utf8'))[0];
const connection = { endpoint:'https://mcp.firecrawl.dev/v2/mcp', tools:structuredClone(fixture.tools) };
connection.tools[0].description='Only id and title are returned. <img src=x onerror="window.injected=true">';
let missingId=true, optionalId=false;


let step=0, failDraft=false, holdDraft=false, releaseDraft:(()=>void)|undefined;
const ai={async run(_model:any,input:any){
 if(input.messages[0].content.startsWith('Rank candidate')) return {response:{recommendations:JSON.parse(input.messages[1].content).candidates.slice(0,4).map((c:any)=>({id:c.id,reason:'Declared capability fits the requested source; access remains unverified.'}))}};

 if(input.messages[0].content.startsWith('Design an agent')) {
  if(holdDraft) await new Promise<void>(resolve=>{releaseDraft=resolve;});
  if(failDraft) throw new Error('offline');
  const {description}=JSON.parse(input.messages[1].content);
  return {response:{boundaries:'Use supplied sources only; stop if evidence is unavailable.',evaluation:{version:1,checks:[],rubrics:[{id:'grounded',label:'Grounded result',criterion:'Support the requested result with retrieved source evidence.'}]},title:'Close a ticket',goal:'Find and close a supplied ticket',instructions:'Find the ticket then close it.',success:'The matching ticket is closed',requirements:[{label:'Find ticket',matches:[]},{label:'Close ticket',matches:[]}],questions:[]}};
 }
 return {response:step++%2===0?{type:'call',tool:'step_1',arguments:{}}:{type:'finish',summary:'The price is 20.',outcome:'met',reason:'Read the structured result.'}};
}};
const transport=async (_url:any,init:any)=>{
 if(!init?.body)return Response.json({Status:0,Answer:[{type:1,data:'104.26.5.12'}]});
 if(init.method==='DELETE')return new Response(null,{status:204});const message=JSON.parse(init.body);
 if(message.method==='notifications/initialized')return new Response(null,{status:202});
 const discovered=structuredClone(connection.tools); const item=discovered[0].outputSchema.properties.tickets.items;
 if(missingId) delete item.properties.id; if(missingId || optionalId) item.required=item.required.filter((k:string)=>k!=='id');
 const result=message.method==='initialize'?{protocolVersion:'2025-03-26',capabilities:{tools:{}}}:message.method==='tools/list'?{tools:discovered}:{structuredContent:{price:20}};
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
 const connected=await runtimes.acme.handle(new Request('https://runtime.test/connect',{method:'POST',body:JSON.stringify({endpoint:connection.endpoint,token:'PRIVATE-FIXTURE-CREDENTIAL'})}));
 assert.equal(connected.status,200);const connectionId=(await connected.json() as any).connectionId;
 await page.goto(base+'/agents#connect');await page.locator('#manage-connections').click();
 await page.locator('#connections .capability-details > summary').click();
 await page.locator('#connections .capability-details details > summary').first().click();
 assert.match(await page.locator('#connections').innerText(),/Connected server snapshot/);
 assert.match(await page.locator('#connections').innerText(),/Declared limit: Only id and title/);
 assert.equal(await page.locator('#connections img').count(),0);assert.equal(await page.evaluate(()=>(window as any).injected),undefined);
 assert.ok(!(await page.locator('body').innerText()).includes('PRIVATE-FIXTURE-CREDENTIAL'));
 await page.locator('#connections').screenshot({path:'/tmp/aa-241-server.png'});
 await page.goto(base+'/agents');await page.locator('#job-description').fill('Find the broken widget ticket and close it');await page.locator('#generate-draft').click();
 await page.locator('[data-tool-mapping]').first().waitFor({state:'attached'});
 for(const [index,name] of ['tickets.search','tickets.update'].entries()) {await page.locator('.other-tools > summary').nth(index).click();await page.locator('[data-tool-mapping]').nth(index).selectOption(JSON.stringify({connectionId,tool:name}));}
 const first=page.locator('[data-capability-step=step_1]'), second=page.locator('[data-capability-step=step_2]');
 assert.equal(await first.locator('[data-coverage-report]').getAttribute('data-coverage-status'),'unknown');
 for(const card of [first,second]) await card.locator('.field-check-editor > summary').click();
 await first.getByLabel('Required result fields',{exact:true}).fill('/tickets/*/title');
 await first.getByRole('button',{name:'Add example input',exact:true}).click();
 await first.getByLabel('Input field',{exact:true}).fill('query');await first.getByLabel('Example value',{exact:true}).fill('broken widget');
 await first.getByRole('button',{name:'Add example input',exact:true}).click();await first.getByLabel('Input field',{exact:true}).nth(1).fill('query');
 assert.equal(await first.locator('[data-coverage-report]').getAttribute('data-coverage-status'),'unknown');
 await first.getByRole('button',{name:'Remove example',exact:true}).nth(1).click();
 assert.equal(await first.locator('[data-coverage-report]').getAttribute('data-coverage-status'),'covered');
 await second.getByRole('button',{name:'Add example input',exact:true}).click();
 await second.getByLabel('Input field',{exact:true}).fill('status');await second.getByLabel('Example value',{exact:true}).fill('closed');
 await second.getByRole('button',{name:'Connect an input to a result',exact:true}).click();
 await second.getByLabel('Input field',{exact:true}).nth(1).fill('/ticket_id');
 await second.getByLabel('From earlier step',{exact:true}).selectOption('step_1');await second.getByLabel('Result field',{exact:true}).fill('/tickets/*/id');
 assert.equal(await first.locator('[data-coverage-report]').getAttribute('data-coverage-status'),'covered');
 assert.equal(await second.locator('[data-coverage-report]').getAttribute('data-coverage-status'),'partial');
 assert.match(await second.locator('[data-coverage-report]').innerText(),/Closed schema does not expose/);
 await page.locator('#configure').screenshot({path:'/tmp/aa-241-fields-desktop.png'});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('#configure').screenshot({path:'/tmp/aa-241-fields-mobile.png'});await page.setViewportSize({width:1440,height:1050});
 await page.getByRole('button',{name:'Save draft only',exact:true}).click();await page.getByText('Agent draft saved.',{exact:false}).waitFor();
 const plan=(await latest()).drafts[0];assert.equal(plan.fieldChecks.step_2.bindings[0].output,'/tickets/*/id');
 await page.reload();await page.getByRole('button',{name:'Continue setup',exact:true}).click();
 assert.equal(await second.locator('[data-coverage-report]').getAttribute('data-coverage-status'),'partial');
 const legacy=await storage.get<any>('connection:'+connectionId);delete legacy.catalog;await storage.put('connection:'+connectionId,legacy);
 await page.reload();await page.getByRole('button',{name:'Continue setup',exact:true}).click();
 assert.equal(await first.locator('[data-coverage-report]').getAttribute('data-coverage-status'),'unknown');
 assert.equal(await second.locator('[data-coverage-report]').getAttribute('data-coverage-status'),'unknown');
 missingId=false;
 await page.locator('#plan-custom').click();await page.locator('#connections .capability-details > summary').click();
 await page.getByRole('button',{name:'Refresh capabilities',exact:true}).click();await page.getByText('Capability catalog refreshed.',{exact:false}).waitFor();
 await page.getByRole('link',{name:'← Continue agent setup',exact:true}).click();
 assert.equal(await second.locator('[data-coverage-report]').getAttribute('data-coverage-status'),'covered');
 optionalId=true;
 await page.locator('#plan-custom').click();await page.locator('#connections .capability-details > summary').click();
 await page.getByRole('button',{name:'Refresh capabilities',exact:true}).click();await page.getByText('Capability catalog refreshed.',{exact:false}).waitFor();
 await page.getByRole('link',{name:'← Continue agent setup',exact:true}).click();
 assert.equal(await second.locator('[data-coverage-report]').getAttribute('data-coverage-status'),'unknown');
 // Removed mapped tools are stale and blocked after refresh.
 connection.tools.pop();
 await page.locator('#plan-custom').click();await page.locator('#connections .capability-details > summary').click();
 await page.getByRole('button',{name:'Refresh capabilities',exact:true}).click();await page.getByText('Capability catalog refreshed.',{exact:false}).waitFor();
 await page.getByRole('link',{name:'← Continue agent setup',exact:true}).click();
 assert.equal(await second.locator('[data-coverage-report]').getAttribute('data-coverage-status'),'not_exposed');
 assert.equal(await page.locator('#review-first-action').isDisabled(),true);
 // Existing viewer policy prevents opening draft editors or refreshing catalogs.
 viewer=true;await page.reload();assert.equal(await page.getByRole('button',{name:'Continue setup',exact:true}).isDisabled(),true);
 await page.goto(base+'/agents#connect');await page.locator('#manage-connections').click();await page.locator('#connections .capability-details > summary').click();
 assert.equal(await page.getByRole('button',{name:'Refresh capabilities',exact:true}).isDisabled(),true);
 await page.locator('#workspace').selectOption('beta');await page.getByText('Workspace ready · viewer',{exact:true}).waitFor();
 assert.equal(await page.locator('#configure').isHidden(),true);assert.equal(await page.locator('[data-capability-step]').count(),0);
 assert.deepEqual(errors,[]);assert.ok(posts.every(p=>!['approve','trial','create-bound'].includes(p.action)));
 console.log('Capability browser acceptance passed: declared/blocked/unknown, persistence, refresh, stale mappings, safe text, viewer/workspace isolation, desktop/mobile.');
} finally {await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
