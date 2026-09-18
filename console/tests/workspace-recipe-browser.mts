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
const connection = { id:'server', label:'Research server', status:'connected', endpoint:'https://mcp.firecrawl.dev/v2/mcp', protocol:'2025-03-26', tools:[{name:'firecrawl_scrape',inputSchema:{type:'object'}},{name:'search',inputSchema:{type:'object'}}], suggestions:[{id:'suggested',title:'Suggested brief',goal:'Research a market',setup:'Provide a market',success:'Cite sources',tools:['search']}] };
await storage.put('connection:server', connection);
const runtimes = { acme: new AgentRuntime(storage, {}), beta: new AgentRuntime(beta, {}) };
let viewer = false, delayedSave: (() => void) | undefined, holdSave = false;
const posts: any[] = [];
const env = { CONSOLE_ENABLE_MOCK_IDENTITY:'true', CONSOLE_ENVIRONMENT:'development', CONSOLE_MOCK_SUBJECT:'test', CONSOLE_MOCK_TENANT_ID:'acme' };
const server = createServer(async (req, res) => {
 const url = new URL(req.url!, 'http://localhost');
 if (!url.pathname.startsWith('/api/')) { const out = await worker.fetch(new Request(url), env); res.statusCode = out.status; out.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await out.arrayBuffer())); return; }
 let value: any = {};
 if (url.pathname === '/api/console/session') value = {tenant_id:'acme', email:'owner@example.com', memberships:['acme','beta'].map(id=>({tenant:{tenant_id:id,display_name:id},membership:{role:viewer?'viewer':'owner'}}))};
 else if (url.pathname.endsWith('/catalog')) value = {servers:[],total:0,capabilities:[],authTypes:[],nextOffset:null};
 else if (url.pathname.startsWith('/api/agents/')) {
  const [, , , tenant, action] = url.pathname.split('/');
  let body = ''; for await (const chunk of req) body += chunk;
  if (body) posts.push({tenant,action,body:JSON.parse(body)});
  const out = await runtimes[tenant as keyof typeof runtimes].handle(new Request('https://runtime.test/'+action, {method:req.method,headers:{'x-runtime-role':viewer?'viewer':'owner'},...(body?{body}:{})}));
  if (action === 'save-recipe' && holdSave) await new Promise<void>(resolve => { delayedSave = resolve; });
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
 await page.goto(base+'/agents#create'); await page.locator('#manual-options > summary').click(); await page.getByRole('button',{name:'Start from scratch',exact:true}).click();
 await page.locator('#editor-connection').selectOption('server');
 await field('title').fill('Custom pricing brief'); await page.locator('#draft-customize').evaluate((el:HTMLDetailsElement)=>el.open=true); await field('goal').fill('Read prices from a supplied URL'); await field('inputGuide').fill('Supply the target URL');
 await field('instructions').fill('Summarize with citations'); await field('boundaries').fill('Never change account data'); await field('success').fill('Each price has a source');
 await page.locator('#tool-options input[value=firecrawl_scrape]').check();
 await page.getByRole('button',{name:'Save as a template',exact:true}).click(); await page.getByText('Saved agent template v1.',{exact:false}).waitFor();
 assert.equal((await latest()).agents.length,0); assert.equal(posts.filter(p=>p.action==='suggest').length,0);
 await page.reload(); await page.locator('#example-library').evaluate((el:HTMLDetailsElement)=>el.open=true); await page.getByRole('button',{name:'Use or edit template',exact:true}).click(); await page.waitForFunction(()=>!document.querySelector('#workspace-recipes button[aria-busy]')); await page.locator('#configure').waitFor(); assert.equal(await field('setup').inputValue(),'');
 await field('setup').fill('PRIVATE instance URL'); await page.getByRole('button',{name:'Review first action',exact:true}).click(); await page.getByRole('heading',{name:'Put your agent to work.',exact:true}).waitFor();
 const first = (await latest()).agents[0]; assert.equal(first.status,'draft'); assert.equal(first.workspaceRecipe.version,1); assert.equal((await latest()).runs.length,1);
 await page.locator('[data-stage=create]').click(); await page.locator('#example-library').evaluate((el:HTMLDetailsElement)=>el.open=true); await page.getByRole('button',{name:'Use or edit template',exact:true}).click(); await page.waitForFunction(()=>!document.querySelector('#workspace-recipes button[aria-busy]')); await page.locator('#configure').waitFor(); assert.equal(await field('setup').inputValue(),'');
 await page.locator('#draft-customize').evaluate((el:HTMLDetailsElement)=>el.open=true); await field('goal').fill('Compare supplied prices'); await page.getByRole('button',{name:'Save new version',exact:true}).click(); await page.getByText('Saved agent template v2.',{exact:false}).waitFor();
 assert.equal((await latest()).agents[0].definition.goal, first.definition.goal); assert.equal(JSON.stringify((await latest()).workspaceRecipes).includes('PRIVATE'),false);
 await page.getByRole('button',{name:'Save as new template',exact:true}).click(); await page.getByText('Saved agent template v1.',{exact:false}).waitFor(); assert.equal((await latest()).workspaceRecipes.length,2);
 await field('title').fill('<img src=x onerror=alert(1)>'); await page.getByRole('button',{name:'Save new version',exact:true}).click(); await page.getByText('Saved agent template v2.',{exact:false}).waitFor();
 assert.equal(await page.locator('#workspace-recipes img').count(),0);
 await field('title').fill('Custom pricing brief');
 await page.setViewportSize({width:390,height:844}); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('#configure').screenshot({path:'/tmp/agentaction-221-builder-mobile.png'});
 await page.setViewportSize({width:1440,height:1050}); await page.locator('#configure').screenshot({path:'/tmp/agentaction-221-builder-desktop.png'});
 await field('setup').fill('PRIVATE unsaved input'); await page.locator('#workspace').selectOption('beta'); await page.locator('#status').getByText('Workspace ready · owner').waitFor();
 assert.equal(await page.locator('#configure').isHidden(),true); assert.equal(await field('setup').inputValue(),''); assert.equal(await field('goal').inputValue(),''); assert.equal(await page.locator('#tool-options input').count(),0); assert.equal(await page.locator('#workspace-recipes').getByText('Custom pricing brief',{exact:true}).count(),0);
 await page.locator('#workspace').selectOption('acme'); await page.locator('#example-library').evaluate((el:HTMLDetailsElement)=>el.open=true); await page.getByRole('button',{name:'Build this agent',exact:true}).click(); assert.equal(await field('goal').inputValue(),'Research a market'); assert.equal(await field('inputGuide').inputValue(),'Provide a market'); assert.equal(await page.locator('#tool-options input[value=search]').isChecked(),true);
 // A programmatic workspace switch while a save response is delayed must not restore old editor data.
 holdSave = true; await page.locator('#draft-customize > summary').click(); await page.getByRole('button',{name:'Save as a template',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#save-recipe')?.getAttribute('aria-busy')==='true');
 await page.evaluate(()=>{const select=document.querySelector('#workspace') as HTMLSelectElement; select.value='beta'; select.dispatchEvent(new Event('change'));});
 await page.locator('#status').getByText('Workspace ready · owner').waitFor();
 for (let i=0; !delayedSave && i<500; i++) await new Promise(r=>setTimeout(r,10)); assert.ok(delayedSave); delayedSave(); holdSave=false;
 await page.waitForFunction(()=>!document.querySelector('#save-recipe')?.hasAttribute('aria-busy'));
 assert.equal(await page.locator('#configure').isHidden(),true); assert.equal(await field('goal').inputValue(),''); assert.equal(await page.locator('#recipe-save-status').textContent(),'');
 await page.goto(base+'/agents#create'); await page.locator('#example-library').evaluate((el:HTMLDetailsElement)=>el.open=true); await page.getByRole('button',{name:'Use or edit template',exact:true}).first().click(); await page.waitForFunction(()=>!document.querySelector('#workspace-recipes button[aria-busy]')); await page.locator('#configure').waitFor();
 await page.locator('#draft-customize').evaluate((el:HTMLDetailsElement)=>el.open=true); await field('goal').fill('UNSAVED custom revision'); await field('setup').fill('New instance only'); await page.getByRole('button',{name:'Review first action',exact:true}).click(); await page.getByRole('heading',{name:'Put your agent to work.',exact:true}).waitFor();
 const custom = (await latest()).agents.find((a:any)=>a.goal==='UNSAVED custom revision'); assert.ok(custom); assert.equal(custom.workspaceRecipe,undefined);
 await page.locator('[data-stage=create]').click(); await page.locator('#example-library').evaluate((el:HTMLDetailsElement)=>el.open=true); await page.getByRole('button',{name:'Use or edit template',exact:true}).first().click(); await page.waitForFunction(()=>!document.querySelector('#workspace-recipes button[aria-busy]')); await page.locator('#configure').waitFor();
 const before = (await latest()).workspaceRecipes[0];
 await runtimes.acme.mutate('/save-recipe',{connectionId:'server',id:before.id,baseVersion:before.version,definition:{...before.definition,goal:'Saved in another tab'}},'owner','owner');
 await page.locator('#draft-customize').evaluate((el:HTMLDetailsElement)=>el.open=true); await field('goal').fill('Keep my unsaved text'); await page.getByRole('button',{name:'Save new version',exact:true}).click(); await page.getByText('This recipe has a newer version. Reopen it before saving your changes.',{exact:true}).waitFor(); assert.equal(await field('goal').inputValue(),'Keep my unsaved text');
 viewer=true; await page.goto(base+'/agents#create'); await page.locator('#account-role').getByText('viewer',{exact:true}).waitFor(); await page.locator('#manual-options > summary').click(); await page.locator('#example-library > summary').click(); assert.equal(await page.getByRole('button',{name:'Start from scratch',exact:true}).isDisabled(),true); assert.equal(await page.getByRole('button',{name:'Use or edit template',exact:true}).first().isDisabled(),true);
 assert.deepEqual(errors,[]); console.log('Workspace recipe browser acceptance passed: scratch, saved reuse, immutable revisions, duplicate, fresh inputs, safe text, mobile, suggestions, viewer and delayed workspace isolation.');
} catch (error) { console.error({errors,body:await page.locator('body').innerText()}); throw error; } finally { delayedSave?.(); await browser.close(); server.close(); }
