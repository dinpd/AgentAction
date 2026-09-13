// Optional real-browser acceptance suite. Install Playwright and its Chromium
// browser, or point PLAYWRIGHT_MODULE at an existing installation.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import worker from '../src/worker.ts';
import { RegistryCatalog, parseCatalogQuery } from '../src/mcp-registry.ts';
const db = new DatabaseSync(':memory:');
let alarm: number | null = null;
const storage = { sql: { exec(q: string,...v: any[]) { const a=db.prepare(q).all(...v); return {toArray:()=>a}; } }, transactionSync(fn:()=>unknown){return fn();},async setAlarm(n:number){alarm=n;},async getAlarm(){return alarm;} };
const entry=(name:string,description:string, remotes:unknown[]=[{type:'streamable-http',url:`https://${name}.example/mcp`}])=>({server:{name:`org.example/${name}`,title:name,description,version:'1',remotes,websiteUrl:'https://example.com/docs'},_meta:{'io.modelcontextprotocol.registry/official':{status:'active',isLatest:true}}});
const catalog=new RegistryCatalog(storage,async()=>Response.json({servers:[entry('letters','Deliver messages to email accounts'), entry('warehouse','Query a SQL database'),entry('local-files','Read documents from local files',[]),entry('markup','<img src=x onerror=alert(1)> Email'),...Array.from({length:22},(_,i)=>entry(`mail${i}`,'Email delivery'))], metadata:{}}));
await catalog.alarm();
let posts=0, failure=false, delayed=false, approvalFailure=false, connectDelay=false;
const approvals: any[] = [], posted: any[] = [];
const endpointAccess = {deployment:['https://manual.example/mcp'],workspace:approvals};
const server=createServer(async(req,res)=>{
 const u=new URL(req.url!,'http://127.0.0.1');
 let value:any;
 if(['/agents','/assets/agents.css','/assets/agents.js','/favicon.png','/favicon.ico','/csp-probe'].includes(u.pathname)){
   const response=await worker.fetch(new Request(new URL(u.pathname==='/csp-probe'?'/agents':u.pathname,u.origin)),{CONSOLE_ENVIRONMENT:'development',CONSOLE_ENABLE_MOCK_IDENTITY:'true',CONSOLE_MOCK_TENANT_ID:'a',CONSOLE_MOCK_SUBJECT:'fixture-owner'});
   res.statusCode=response.status;response.headers.forEach((v,k)=>res.setHeader(k,v));
   if(u.pathname==='/csp-probe')res.end((await response.text()).replace('</head>','<link rel="stylesheet" href="/assets/csp-probe.css"><script src="https://example.invalid/probe.js"></script></head>'));
   else res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 if(u.pathname==='/assets/csp-probe.css'){res.setHeader('content-type','text/css');res.end('@font-face{font-family:Probe;src:url(data:font/woff2;base64,d09GMg==)}body{font-family:Probe}');return;}
 if(u.pathname==='/api/console/session')value={tenant_id:'a',memberships:[{tenant:{tenant_id:'a',display_name:'Test workspace'},membership:{role:'owner'}},{tenant:{tenant_id:'b',display_name:'Second workspace'},membership:{role:'viewer'}},{tenant:{tenant_id:'c',display_name:'Operator workspace'},membership:{role:'operator'}}]};
 else if(u.pathname.endsWith('/state'))value={connections:[],agents:[],runs:[],endpointAccess:u.pathname.includes('/a/')?endpointAccess:{deployment:endpointAccess.deployment,workspace:[]}};
 else if(u.pathname.endsWith('/catalog')){if(delayed)await new Promise(r=>setTimeout(r,300)); if(failure){res.statusCode=503;value={error:'Registry discovery is unavailable. Enter an endpoint manually.'};}else value=await catalog.search(parseCatalogQuery(u.searchParams));}
 else if(req.method==='POST'){
   if(connectDelay&&u.pathname.endsWith('/connect'))await new Promise(r=>setTimeout(r,350));
   posts++;let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);posted.push({path:u.pathname,body});value={};
   if(u.pathname.endsWith('/approve-endpoint')){if(approvalFailure){res.statusCode=400;value={error:'This endpoint could not be verified as public.'};}else approvals.push({endpoint:body.endpoint,approvedBy:'owner@example.com',approvedAt:new Date().toISOString()});}
   if(u.pathname.endsWith('/remove-endpoint'))approvals.splice(approvals.findIndex(a=>a.endpoint===body.endpoint),1);
 }
 else{res.statusCode=404;value={};}
 res.setHeader('content-type','application/json');res.end(JSON.stringify(value));
});
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>{(window as any).cspViolations=[];document.addEventListener('securitypolicyviolation',e=>(window as any).cspViolations.push({directive:e.effectiveDirective,uri:e.blockedURI}));});
try {
const address = server.address() as {port:number};
await page.goto(`http://127.0.0.1:${address.port}/agents`);await page.locator('#catalog-status').filter({hasText:'26 matching servers'}).waitFor();
await page.getByRole('button',{name:'Show more servers'}).click();await page.waitForFunction(()=>document.querySelectorAll('#catalog-results article').length===26);
await page.locator('#catalog-query').fill('send emails');await page.getByRole('button',{name:'Search registry'}).click();await page.locator('#catalog-status').filter({hasText:'24 matching servers'}).waitFor();
assert.equal(await page.locator('#catalog-results img').count(),0);
await page.locator('#catalog-query').fill('letters');await page.getByRole('button',{name:'Search registry'}).click();await page.locator('#catalog-status').filter({hasText:'1 matching servers'}).waitFor();
await page.locator('[name=token]').fill('OLD-CREDENTIAL');await page.locator('[name=consent]').check();
await page.getByRole('button',{name:'Use this server'}).click();
assert.equal(await page.locator('[name=endpoint]').inputValue(),'https://letters.example/mcp');assert.equal(await page.locator('[name=label]').inputValue(),'letters');assert.equal(await page.locator('[name=token]').inputValue(),'');assert.equal(await page.locator('[name=consent]').isChecked(),false);assert.equal(posts,0);
const connectButton=page.locator('#connect button[type=submit]'), approveButton=page.getByRole('button',{name:'Approve endpoint for workspace'});
assert.equal(await connectButton.isDisabled(),true);assert.equal(await connectButton.evaluate(el=>getComputedStyle(el).cursor),'not-allowed');assert.equal(await connectButton.getAttribute('aria-busy'),null);assert.match(await page.locator('#connect-readiness').innerText(),/Connection blocked:.*Review its exact URL/);assert.equal(await page.locator('#connect-readiness').getAttribute('data-state'),'blocked');assert.match(await page.locator('[data-endpoint-access]').innerText(),/Owner approval required/i);
await page.locator('#endpoint-reviewed').check();await page.locator('[name=endpoint]').fill('https://letters.example/mcp/other');assert.equal(await page.locator('#endpoint-reviewed').isChecked(),false);assert.equal(await approveButton.isDisabled(),true);
await page.setViewportSize({width:390,height:844});await page.locator('[name=endpoint]').fill('https://letters.example/'+ 'long-path-'.repeat(80));await page.locator('#endpoint-review').scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'/tmp/agentaction-endpoint-approval-mobile.png'});await page.setViewportSize({width:1440,height:1000});
await page.locator('[name=endpoint]').fill('https://letters.example/mcp');await page.locator('#endpoint-review').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/agentaction-endpoint-approval-desktop.png'});await page.locator('#endpoint-reviewed').check();approvalFailure=true;await approveButton.click();await page.locator('#status').filter({hasText:'could not be verified'}).waitFor();assert.equal(await connectButton.isDisabled(),true);assert.equal(await approveButton.getAttribute('aria-busy'),null);approvalFailure=false;
await page.locator('[name=token]').fill('DO-NOT-SEND-ON-APPROVAL');await approveButton.click();await page.locator('#status').filter({hasText:'Endpoint approved'}).waitFor();assert.deepEqual(posted.at(-1).body,{endpoint:'https://letters.example/mcp',reviewed:true});assert.equal(await connectButton.isEnabled(),true);assert.equal(await page.locator('#endpoint-review').isHidden(),true);assert.match(await page.locator('[data-endpoint-access]').innerText(),/Enabled for this workspace/i);assert.match(await page.locator('#catalog-results option').innerText(),/— enabled/);
connectDelay=true;await page.locator('[name=consent]').check();await connectButton.click();assert.equal(await connectButton.getAttribute('aria-busy'),'true');assert.equal(await connectButton.innerText(),'Connecting…');assert.equal(await connectButton.evaluate(el=>getComputedStyle(el).cursor),'wait');assert.match(await page.locator('#connect-readiness').innerText(),/Connecting to the server/);await page.locator('#status').filter({hasText:'Connected. Choose'}).waitFor();assert.equal(await connectButton.getAttribute('aria-busy'),null);connectDelay=false;
await page.getByText('Workspace endpoint approvals',{exact:true}).click();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Remove workspace approval'}).click();await page.locator('#status').filter({hasText:'Workspace approval removed'}).waitFor();assert.equal(await connectButton.isDisabled(),true);assert.equal(approvals.length,0);
await page.getByRole('button',{name:'Enter an endpoint manually'}).click();assert.equal(await page.locator('[name=endpoint]').inputValue(),'');
await page.locator('[name=label]').fill('Manual');await page.locator('[name=endpoint]').fill('https://manual.example/mcp');await page.locator('[name=consent]').check();await page.getByRole('button',{name:'Connect server',exact:true}).click();await page.locator('#status').filter({hasText:'Connected. Choose'}).waitFor();assert.equal(posts,5);
await page.locator('#catalog-query').fill('query a database');await page.getByRole('button',{name:'Search registry'}).click();await page.locator('#catalog-results h3').filter({hasText:'warehouse'}).waitFor();assert.equal(await page.locator('#catalog-results article').count(),1);
await page.locator('#catalog-query').fill('');await page.locator('#catalog-capability').selectOption('files');await page.getByRole('button',{name:'Search registry'}).click();await page.locator('#catalog-results h3').filter({hasText:'local-files'}).waitFor();assert.equal(await page.locator('#catalog-results button').count(),0);assert.match(await page.locator('#catalog-results').innerText(),/Setup required outside/i);
await page.locator('#catalog-capability').selectOption('');await page.locator('#catalog-query').fill('nothing-matches');await page.getByRole('button',{name:'Search registry'}).click();await page.getByText('No matching servers.',{exact:false}).waitFor();
failure=true;await page.getByRole('button',{name:'Search registry'}).click();await page.locator('#catalog-status').filter({hasText:'unavailable'}).waitFor();assert.equal(await page.locator('[name=endpoint]').isEnabled(),true);failure=false;
await page.locator('#catalog-query').fill('send emails');await page.getByRole('button',{name:'Search registry'}).click();await page.locator('#catalog-status').filter({hasText:'24 matching servers'}).waitFor();await page.screenshot({path:'/tmp/agentaction-registry-desktop.png',fullPage:false});
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/agentaction-registry-mobile.png',fullPage:false});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await page.locator('#workspace').selectOption('c');await page.locator('#status').filter({hasText:'Workspace ready · operator'}).waitFor();await page.locator('[name=endpoint]').fill('https://unapproved.example/mcp');assert.equal(await page.locator('#endpoint-review').isHidden(),true);assert.equal(await connectButton.isDisabled(),true);assert.match(await page.locator('#connect-readiness').innerText(),/Ask a workspace owner/);await page.locator('[name=endpoint]').fill('https://manual.example/mcp');assert.equal(await connectButton.isEnabled(),true);
await page.locator('#workspace').selectOption('a');await page.locator('#status').filter({hasText:'Workspace ready · owner'}).waitFor();
delayed=true;await page.getByRole('button',{name:'Search registry'}).click();await page.locator('#workspace').selectOption('b');await page.waitForTimeout(500);assert.equal(await page.locator('#catalog-results article').count(),0);assert.equal(await page.locator('[name=endpoint]').isDisabled(),true);
await page.getByRole('button',{name:'Search registry'}).click();await page.locator('#catalog-status').filter({hasText:'24 matching servers'}).waitFor();assert.equal(await page.getByRole('button',{name:'Use this server'}).first().isDisabled(),true);
assert.match(await page.locator('#connect-readiness').innerText(),/view-only access/);
assert.deepEqual(errors,[
  'Failed to load resource: the server responded with a status of 400 (Bad Request)',
  'Failed to load resource: the server responded with a status of 503 (Service Unavailable)'
]);assert.deepEqual(await page.evaluate(()=>(window as any).cspViolations),[]);
assert.equal(await page.evaluate(async()=>{const icon=new Image();icon.src='/favicon.png';await icon.decode();return icon.naturalWidth>0;}),true);
delayed=false;await page.goto(`http://127.0.0.1:${address.port}/csp-probe`);await page.waitForFunction(()=>(window as any).cspViolations.length>=2);
await page.locator('#catalog-status').filter({hasText:'26 matching servers'}).waitFor();
const violations=await page.evaluate(()=>(window as any).cspViolations);assert.ok(violations.some((v:any)=>v.directive==='font-src'&&v.uri==='data'));assert.ok(violations.some((v:any)=>v.directive==='script-src-elem'&&v.uri==='https://example.invalid/probe.js'));
console.log('PASS: name/capability search, pagination, safe metadata, selection without connection, cleared secrets/consent, manual connect, unsupported setup, empty/error states, workspace races, viewer/operator access, explicit owner approval without credentials, approval failures, removal, clear blocked/busy states, real CSP headers, decoded favicon, blocked external scripts/data fonts and mobile overflow.');
} finally { await browser.close();await new Promise<void>(r=>server.close(()=>r()));db.close(); }
