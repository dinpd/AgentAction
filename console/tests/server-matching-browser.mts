import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { normalizeDirectory } from '../src/mcp-directory.ts';
import { RegistryCatalog,parseCatalogQuery,catalogSearchText } from '../src/mcp-registry.ts';
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
const endpoint='https://mcp.firecrawl.dev/v2/mcp', ownEndpoint='https://own.example/mcp';
const connection={endpoint,tools:[{name:'lookup_license',description:'Look up a contractor license record.',inputSchema:{type:'object'}},{name:'license_history',description:'Read contractor licensing history.',inputSchema:{type:'object'}}]};
const laborTools=[{name:'employment_trends',description:'Read regional workforce and employment statistics.',inputSchema:{type:'object'}}];
const db=new DatabaseSync(':memory:');let alarm:number|null=null;
const registryStorage={sql:{exec(q:string,...v:any[]){const rows=db.prepare(q).all(...v);return {toArray:()=>rows};}},transactionSync(fn:()=>unknown){return fn();},async setAlarm(n:number){alarm=n;},async getAlarm(){return alarm;}};
const entry=(name:string,title:string,description:string,url?:string)=>({server:{name:'org.example/'+name,title,description,version:'1',websiteUrl:'https://example.com/details',remotes:url?[{type:'streamable-http',url}]:[]},_meta:{'io.modelcontextprotocol.registry/official':{status:'active',isLatest:true}}});
const registry=new RegistryCatalog(registryStorage as any,async()=>Response.json({servers:[
 entry('licenses','License Records','Contractor license history and records.',endpoint),
 entry('employment','Employment Statistics','Workforce and labour market statistics.',ownEndpoint),
 entry('contacts','Contact Directory','CRM people and contact information.'),
 entry('markup','License <img src=x onerror="window.injected=true">','Only license metadata.',undefined),
 entry('licenses-two','Licensing Archive','Contractor licensing archives.'),entry('licenses-three','Licensing Lookup','Contractor licensing lookup.'),
 entry('unrelated','Email Tools','Send email messages.','https://email.example/mcp')
],metadata:{}}));await registry.alarm();
// Provider response fixture flows through normalization and the same SQL index.
const listing={namespace:'org.example',slug:'records',name:'Records API',description:'A public records interface.',connection:{transport:'streamable_http',url:endpoint}};
const indexed=normalizeDirectory('glama',listing,{...listing,toolCount:2,tools:[{name:'lookup_record',description:'Retrieve records. <img src=x onerror="window.injected=true">',inputSchema:{type:'object',properties:{contact_id:{type:'string'}}},outputSchema:{type:'object',properties:{contact_email:{type:'string'}}}}]},'2026-01-01T00:00:00.000Z')!;
const indexedGeneration=db.prepare('SELECT generation FROM registry_servers LIMIT 1').get()!.generation;
db.prepare('INSERT INTO registry_servers VALUES (?,?,?,?,?,?)').run(indexedGeneration,indexed.name,indexed.title.toLowerCase(),catalogSearchText(indexed),'|auth:unspecified|catalog:tools|',JSON.stringify(indexed));

let failSuggestions=false,delaySuggestions=false,releaseSuggestions:(()=>void)|undefined;
const searches:any[]=[];

const ai={async run(_model:any,input:any){
 if(input.messages[0].content.startsWith('Rank candidate')) return {response:{recommendations:JSON.parse(input.messages[1].content).candidates.slice(0,4).map((c:any)=>({id:c.id,reason:'Declared capability fits the requested source; access remains unverified.'}))}};

 if(input.messages[0].content.startsWith('Design an agent')) {
  return {response:{boundaries:'Use supplied sources only; stop if evidence is unavailable.',evaluation:{version:1,checks:[],rubrics:[{id:'grounded',label:'Grounded result',criterion:'Support the requested result with retrieved source evidence.'}]},title:'Contractor market monitoring',goal:'Review licensing and workforce changes',instructions:'Look up the license history and labour data, then identify contacts.',success:'A sourced report',requirements:[{label:'License History',matches:[]},{label:'Labor Market Data',matches:[]},{label:'Contact Information',matches:[]}],questions:[]}};
 }
 throw new Error('Unexpected AI call during setup');
}};
const methods:string[]=[];
const transport=async (_url:any,init:any)=>{
 if(!init?.body)return Response.json({Status:0,Answer:[{type:1,data:'104.26.5.12'}]});
 if(init.method==='DELETE')return new Response(null,{status:204});const message=JSON.parse(init.body);methods.push(message.method);
 if(message.method==='notifications/initialized')return new Response(null,{status:202});
 const discovered=String(_url)===ownEndpoint?laborTools:connection.tools;
 const result=message.method==='initialize'?{protocolVersion:'2025-03-26',capabilities:{tools:{}}}:message.method==='tools/list'?{tools:discovered}:{structuredContent:{price:20}};
 return Response.json({jsonrpc:'2.0',id:message.id,result});
};
const runtimes = { acme: new AgentRuntime(storage, {AGENT_AI:ai,AGENT_MCP_ENDPOINTS:endpoint+','+ownEndpoint},transport as typeof fetch), beta: new AgentRuntime(beta, {AGENT_AI:ai,AGENT_MCP_ENDPOINTS:endpoint+','+ownEndpoint},transport as typeof fetch) };
let viewer = false;
const posts: any[] = [];
const env = { CONSOLE_ENABLE_MOCK_IDENTITY:'true', CONSOLE_ENVIRONMENT:'development', CONSOLE_MOCK_SUBJECT:'test', CONSOLE_MOCK_TENANT_ID:'acme' };
const server = createServer(async (req, res) => {
 const url = new URL(req.url!, 'http://localhost');
 if (!url.pathname.startsWith('/api/')) { const out = await worker.fetch(new Request(url), env); res.statusCode = out.status; out.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await out.arrayBuffer())); return; }
 let value: any = {};
 if (url.pathname === '/api/console/session') value = {tenant_id:'acme', email:'owner@example.com', memberships:['acme','beta'].map(id=>({tenant:{tenant_id:id,display_name:id},membership:{role:viewer?'viewer':'owner'}}))};
 else if (url.pathname.endsWith('/catalog')) {
   searches.push({tenant:url.pathname.split('/')[3],query:url.searchParams.get('q'),mode:url.searchParams.get('mode')});
   if(delaySuggestions && url.searchParams.get('q')==='Delayed license') await new Promise<void>(resolve=>releaseSuggestions=resolve);
   if(failSuggestions){res.statusCode=503;value={error:'Unavailable'};}else value=await registry.search(parseCatalogQuery(url.searchParams));
 }
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
const latest = async () => (await runtimes.acme.snapshot() as any);
try {
 page.setDefaultTimeout(10000);await page.goto(base+'/agents');
 await page.locator('#job-description').fill('Track contractor licensing, labour trends and contacts for PRIVATE-JOB-123');
 await page.locator('#generate-draft').click();
 const license=page.locator('[data-capability-step=step_1]'),labor=page.locator('[data-capability-step=step_2]'),contact=page.locator('[data-capability-step=step_3]');
 await license.locator('[data-registry-server="org.example/licenses"]').waitFor();await labor.locator('[data-registry-server="org.example/employment"]').waitFor();
 await contact.locator('[data-registry-server="org.example/contacts"]').waitFor();
 const indexedCard=contact.locator('[data-registry-server="glama:org.example/records"]');await indexedCard.waitFor();await indexedCard.getByText('Provider details & limitations',{exact:true}).click();
 assert.match(await indexedCard.innerText(),/Potential matching tool: lookup_record/);
 assert.match(await indexedCard.innerText(),/contact_id/);assert.match(await indexedCard.innerText(),/contact_email/);
 assert.match(await indexedCard.innerText(),/partial metadata/);assert.match(await indexedCard.innerText(),/may be stale/);
 assert.equal(await indexedCard.getByRole('link',{name:'Tool catalog data from Glama ↗'}).getAttribute('href'),'https://glama.ai/mcp/connectors/org.example/records');
 assert.equal(await indexedCard.getByRole('button',{name:'Use this tool',exact:true}).count(),0);
 await contact.locator('[data-registry-server="org.example/contacts"]').getByText('Provider details & limitations',{exact:true}).click();
 assert.match(await contact.locator('[data-registry-server="org.example/contacts"]').innerText(),/tool catalog unknown/i);
 await indexedCard.locator('.capability-details > summary').click();await indexedCard.getByText('lookup_record',{exact:true}).click();
 assert.match(await indexedCard.innerText(),/Result fields: \/contact_email/);assert.equal(await indexedCard.locator('img').count(),0);
 await contact.locator('.catalog-sources > summary').click();assert.match(await contact.innerText(),/1 of 8 indexed listings have tool metadata/);
 await indexedCard.screenshot({path:'/tmp/aa245-catalog-desktop.png'});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await indexedCard.screenshot({path:'/tmp/aa245-catalog-mobile.png'});await page.setViewportSize({width:1440,height:1050});

 assert.equal(await page.locator('[data-coverage-report]:visible').count(),0);assert.equal(await page.locator('.field-check-editor:visible').count(),0);
 assert.equal(await page.locator('[data-tool-mapping]:visible').count(),0);assert.equal(await page.locator('.server-suggestions img').count(),0);
 assert.ok(!JSON.stringify(searches).includes('PRIVATE-JOB-123'));assert.equal(await license.locator('[data-registry-server="org.example/unrelated"]').count(),0);
 assert.match(await contact.innerText(),/Setup outside this console/);
 await page.locator('#configure').screenshot({path:'/tmp/aa-243-empty-desktop.png'});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await license.screenshot({path:'/tmp/aa-243-empty-mobile.png'});await page.setViewportSize({width:1440,height:1050});
 await license.locator('[data-registry-server="org.example/licenses"]').getByRole('button',{name:'Review & connect',exact:true}).click();
 await page.getByRole('heading',{name:'Connect a server for License History',exact:true}).waitFor();
 await page.getByRole('link',{name:'← Back to License History',exact:true}).click();await license.getByRole('button',{name:'Browse more matches',exact:true}).click();
 await page.locator('#catalog-results article').filter({has:page.getByRole('heading',{name:'License Records',exact:true})}).getByRole('button',{name:'Use this server',exact:true}).click();
 await page.getByRole('heading',{name:'Connect a server for License History',exact:true}).waitFor();
 assert.equal(await page.locator('#connect [name=endpoint]').inputValue(),endpoint);assert.equal(await page.locator('#connect [name=consent]').isChecked(),false);
 await page.locator('#connect [name=token]').fill('PRIVATE-ACCOUNT-TOKEN');await page.locator('#connect [name=consent]').check();
 await page.getByRole('button',{name:'Connect server',exact:true}).click();await license.locator('[data-connected-tool=license_history]').waitFor();
 assert.equal(await page.locator('#connect [name=token]').inputValue(),'');assert.equal(await license.locator('[data-tool-mapping]').inputValue(),'');
 assert.equal(await license.locator('[data-connected-tool]').count(),2);
 await contact.locator('[data-registry-server="glama:org.example/records"]').getByText('Provider details & limitations',{exact:true}).click();
 assert.match(await contact.locator('[data-registry-server="glama:org.example/records"]').innerText(),/Account catalog comparison: 0 of 1/);
 assert.match(await contact.locator('[data-registry-server="glama:org.example/records"]').innerText(),/Not discovered: lookup_record/);assert.equal(await labor.locator('[data-tool-mapping]').inputValue(),'');
 await license.locator('[data-connected-tool=license_history]').getByRole('button',{name:'Use this tool',exact:true}).click();
 assert.match(await license.locator('.selected-tool').innerText(),/license_history/);
 await license.locator('.field-check-editor > summary').click();await license.getByLabel('Required result fields',{exact:true}).fill('/id');
 await labor.getByRole('button',{name:'Connect your own MCP server',exact:true}).click();await page.getByRole('heading',{name:'Connect a server for Labor Market Data',exact:true}).waitFor();
 assert.equal(await page.locator('#connect [name=endpoint]').inputValue(),'');
 await page.locator('#connect [name=label]').fill('My workforce server');await page.locator('#connect [name=endpoint]').fill(ownEndpoint);await page.locator('#connect [name=consent]').check();
 await page.getByRole('button',{name:'Connect server',exact:true}).click();await labor.locator('[data-connected-tool=employment_trends]').waitFor();
 assert.equal(await labor.locator('[data-tool-mapping]').inputValue(),'');assert.match(await license.locator('.selected-tool').innerText(),/license_history/);
 await labor.locator('[data-connected-tool=employment_trends]').getByRole('button',{name:'Use this tool',exact:true}).click();
 await page.getByRole('button',{name:'Save draft only',exact:true}).click();await page.getByText('Agent draft saved.',{exact:false}).waitFor();
 const saved=(await latest()).drafts[0];assert.equal(saved.bindings.step_1.tool,'license_history');assert.equal(saved.bindings.step_2.tool,'employment_trends');assert.equal(saved.fieldChecks.step_1.required_outputs[0],'/id');assert.equal(saved.bindings.step_3,undefined);
 await page.reload();await page.getByRole('button',{name:'Continue setup',exact:true}).click();assert.match(await license.locator('.selected-tool').innerText(),/license_history/);
 // Connected recommendations can be selected without another provider connection.
 await license.getByRole('button',{name:'Clear selection',exact:true}).click();await license.locator('[data-connected-tool=lookup_license]').getByRole('button',{name:'Use this tool',exact:true}).click();
 assert.match(await license.locator('.selected-tool').innerText(),/lookup_license/);
 // Refining one capability cannot replace another capability's suggestions.
 await contact.getByLabel('Find servers for Contact Information',{exact:true}).fill('UnfindableNeedXYZ');await contact.getByRole('button',{name:'Find servers',exact:true}).click();await contact.getByText('No matching servers found',{exact:false}).waitFor();
 failSuggestions=true;await contact.getByLabel('Find servers for Contact Information',{exact:true}).fill('contact');await contact.getByRole('button',{name:'Find servers',exact:true}).click();await contact.getByText('Server suggestions are unavailable.',{exact:false}).waitFor();
 failSuggestions=false;await contact.getByRole('button',{name:'Retry suggestions',exact:true}).click();await contact.locator('[data-registry-server="org.example/contacts"]').waitFor();
 delaySuggestions=true;await contact.getByLabel('Find servers for Contact Information',{exact:true}).fill('Delayed license');await contact.getByRole('button',{name:'Find servers',exact:true}).click();
 await page.waitForTimeout(100);await contact.getByLabel('Find servers for Contact Information',{exact:true}).fill('employment');await contact.getByRole('button',{name:'Find servers',exact:true}).click();await contact.locator('[data-registry-server="org.example/employment"]').waitFor();
 releaseSuggestions?.();await page.waitForTimeout(100);assert.equal(await contact.locator('[data-registry-server="org.example/licenses"]').count(),0);
 // A response for a departed workspace cannot populate the next workspace.
 await contact.getByLabel('Find servers for Contact Information',{exact:true}).fill('Delayed license');await contact.getByRole('button',{name:'Find servers',exact:true}).click();await page.waitForTimeout(100);
 await page.locator('#workspace').selectOption('beta');await page.getByText('Workspace ready · owner',{exact:true}).waitFor();releaseSuggestions?.();await page.waitForTimeout(100);assert.equal(await page.locator('[data-registry-server]').count(),0);
 viewer=true;await page.goto(base+'/agents?workspace=acme');await page.getByText('Workspace ready · viewer',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Continue setup',exact:true}).isDisabled(),true);
 assert.ok(!methods.includes('tools/call'));assert.ok(!methods.includes('resources/read'));
 assert.equal(await page.evaluate(()=>(window as any).injected),undefined);assert.deepEqual(errors,[]);assert.ok(posts.every(p=>!['approve','trial','create-bound'].includes(p.action)));
 console.log('Per-capability server browser acceptance passed: empty workspace, registry/own connection, explicit actual-tool choice, preserved mappings/checks, query/workspace races, failures, safe metadata, viewer and mobile.');
} finally {releaseSuggestions?.();await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));db.close();}
