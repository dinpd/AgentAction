import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import worker from '../src/worker.ts';
import {readinessFixture} from './readiness-fixture.mts';
import {cloudFixture,cloudPlan} from './cloud-mcp-fixture.mts';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const fixtures={acme:await cloudFixture(),beta:await cloudFixture()},requests:any[]=[],errors:string[]=[];
const {mf}=await readinessFixture();
const server=createServer(async(req,res)=>{const out=await mf.dispatchFetch('https://mcpcheck.test'+req.url);res.writeHead(out.status,Object.fromEntries(out.headers));res.end(Buffer.from(await out.arrayBuffer()));});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const env={CONSOLE_ENABLE_MOCK_IDENTITY:'true',CONSOLE_ENVIRONMENT:'development',CONSOLE_MOCK_SUBJECT:'test',CONSOLE_MOCK_TENANT_ID:'acme'};
await context.route('https://observability-console.agentaction.dev/**',async route=>{
 const req=route.request(),url=new URL(req.url());let response:Response;
 if(url.pathname==='/api/console/session')response=Response.json({tenant_id:'acme',memberships:['acme','beta'].map(id=>({tenant:{tenant_id:id,display_name:id},membership:{role:id==='acme'?'owner':'viewer'}}))});
 else if(url.pathname.startsWith('/api/agents/')){
  const [,,,workspace,action]=url.pathname.split('/'),body=req.postData()?JSON.parse(req.postData()!):undefined;requests.push({workspace,action,body});
  const r=await fixtures[workspace as keyof typeof fixtures].request(action,body,workspace==='acme'?'owner':'viewer',workspace);response=Response.json(r.body,{status:r.status});
 }else response=await worker.fetch(new Request(req.url()),env);
 await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
});
context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
async function download(p:any,id:string){await p.locator(id).evaluate(el=>{for(let a=el.parentElement;a;a=a.parentElement)if(a.tagName==='DETAILS')(a as HTMLDetailsElement).open=true;});const pending=p.waitForEvent('download');await p.locator(id).click();const stream=await (await pending).createReadStream();let text='';for await(const c of stream)text+=c;return JSON.parse(text);}
try{
 await page.goto(`http://127.0.0.1:${(server.address() as any).port}`);
 assert.equal(await page.locator('button:not(.secondary):not(.text-button):visible').count(),1);
 await page.locator('#endpoint').fill(cloudPlan().endpoint);assert.equal(fixtures.acme.state.calls.length,0);
 await page.locator('#continue-test').click();const cloud=page;
 await cloud.locator('#test-status').filter({hasText:'Ready.'}).waitFor();assert.equal(context.pages().length,1);assert.equal(new URL(cloud.url()).hash,'');assert.equal(fixtures.acme.state.calls.length,0);assert.equal(await cloud.locator('#test-token').isVisible(),false);
 assert.equal(await cloud.locator('button:not(.secondary):not(.text-button):visible').count(),1);
 assert.equal(await cloud.locator('#test-options').getAttribute('open'),null);assert.equal(await cloud.locator('#cloud-controls').getAttribute('open'),null);
 assert.ok((await cloud.locator('#test-run').boundingBox())!.y<950);
 await cloud.locator('[data-field=query]').fill('hello');await cloud.screenshot({path:'/tmp/agentaction-408-cloud-ready-desktop.png',fullPage:true});
 const plan={...cloudPlan(),name:'Cloud staging search'};
 await cloud.locator('#test-extras > summary').click();await cloud.locator('#test-plan-options > summary').click();await cloud.locator('#test-import-plan').setInputFiles({name:'plan.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(plan))});await cloud.locator('#test-status').filter({hasText:'Plan imported'}).waitFor();assert.equal(fixtures.acme.state.calls.length,0);
 await cloud.locator('#test-run').click();await cloud.locator('#test-status').filter({hasText:'Run complete'}).waitFor();assert.match(await cloud.locator('#test-result-title').innerText(),/5 of 5/);assert.equal(fixtures.acme.state.calls.length,3);assert.match(await cloud.locator('#test-source').innerText(),/cloud run/);
 const report=await download(cloud,'#test-export-report');assert.equal(report.source,'cloud');assert.ok(!JSON.stringify(report).includes('CLOUD-PROVIDER-SECRET'));
 await cloud.locator('#test-save').click();await cloud.locator('#test-status').filter({hasText:'Plan saved'}).waitFor();
 const firstId=requests.find(r=>r.action==='test-run').body.requestId;await cloud.locator('#cloud-history > summary').click();await cloud.locator('#cloud-reports').selectOption(firstId);assert.equal(fixtures.acme.state.calls.length,3);
 await cloud.locator('#test-run').focus();await cloud.keyboard.press('Enter');await cloud.locator('#test-status').filter({hasText:'Run complete'}).waitFor();assert.equal(fixtures.acme.state.calls.length,6);
 await cloud.locator('[data-field=query]').fill('revised fixture');await cloud.locator('[data-field=query]').fill('hello');
 await cloud.screenshot({path:'/tmp/agentaction-408-cloud-desktop.png',fullPage:true});await cloud.setViewportSize({width:390,height:844});assert.equal(await cloud.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await cloud.screenshot({path:'/tmp/agentaction-408-cloud-mobile.png',fullPage:true});
 await cloud.locator('#cloud-controls > summary').click();await cloud.locator('#cloud-workspace').selectOption('beta');await cloud.locator('#cloud-access').filter({hasText:'owner or operator'}).waitFor();assert.equal(await cloud.locator('#test-run').isDisabled(),true);assert.equal(await cloud.locator('#test-saved option').count(),1);assert.equal(await cloud.locator('#test-results').isVisible(),false);assert.equal(fixtures.beta.state.calls.length,0);
 await cloud.locator('#cloud-controls > summary').click();await cloud.locator('#cloud-workspace').selectOption('acme');await cloud.locator('#test-status').filter({hasText:'Ready.'}).waitFor();await cloud.locator('#test-saved').selectOption(plan.name);await cloud.locator('#test-status').filter({hasText:'Plan loaded'}).waitFor();assert.equal(await cloud.locator('[data-field=query]').inputValue(),'hello');
 await cloud.goto('about:blank');await cloud.goto('https://observability-console.agentaction.dev/mcp-tests#endpoint='+encodeURIComponent('https://missing.example/mcp')+'&protocol=2026-07-28');
 await cloud.locator('#cloud-access').filter({hasText:'isn’t connected'}).waitFor();assert.equal(await cloud.locator('#cloud-new-protocol').inputValue(),'2026-07-28');assert.equal(await cloud.locator('#test-run').isVisible(),false);assert.equal(await cloud.locator('#cloud-new-endpoint').inputValue(),'https://missing.example/mcp');assert.equal(await cloud.locator('#cloud-connect-server').isVisible(),true);assert.equal(fixtures.acme.state.calls.length,6);assert.equal(await cloud.locator('#cloud-connection').inputValue(),'');
 await cloud.screenshot({path:'/tmp/agentaction-408-cloud-setup-mobile.png',fullPage:true});
 fixtures.acme.state.requiresInitialization=true;const initializedBefore=fixtures.acme.state.initializations;
 await fixtures.acme.storage.delete('connection:provider');await cloud.goto('about:blank');await cloud.goto('https://observability-console.agentaction.dev/mcp-tests#endpoint='+encodeURIComponent(plan.endpoint));
 await cloud.locator('#cloud-connect-server').waitFor();assert.equal(fixtures.acme.state.calls.length,6);assert.equal(await cloud.locator('#cloud-new-protocol').inputValue(),'2025-03-26');
 await cloud.locator('#cloud-connect-setup details > summary').click();await cloud.locator('#cloud-new-token').fill('CLOUD-PROVIDER-SECRET');
 await cloud.locator('#cloud-connect-server').click();await cloud.locator('#test-status').filter({hasText:'Connected.'}).waitFor();
 assert.equal(await cloud.locator('#cloud-new-token').inputValue(),'');assert.equal(fixtures.acme.state.calls.length,6);assert.equal(await cloud.locator('#test-run').isVisible(),true);assert.equal(await cloud.locator('button:not(.secondary):not(.text-button):visible').count(),1);
 assert.ok(fixtures.acme.state.initializations>initializedBefore);assert.equal(requests.find(r=>r.action==='connect').body.protocol,'2025-03-26');
 assert.ok(requests.some(r=>r.action==='approve-endpoint'&&r.body.endpoint===plan.endpoint&&r.body.reviewed===true));assert.ok(!await cloud.evaluate(()=>JSON.stringify(localStorage)).then(v=>v.includes('CLOUD-PROVIDER-SECRET')));
 assert.deepEqual(errors,[]);assert.ok(!JSON.stringify(requests.filter(r=>r.action!=='connect')).includes('CLOUD-PROVIDER-SECRET'));
 console.log('Cloud browser acceptance passed: checker entry, private fragment cleared, no execution on handoff, inline owner-reviewed connection without execution, one-button run, five checks, exports, saved plans, recent results without redispatch, keyboard rerun, workspace isolation, viewer controls and mobile layout.');
}finally{await browser.close();await new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());});await mf.dispose();}
