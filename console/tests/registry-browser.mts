// Optional real-browser acceptance suite. Install Playwright and its Chromium
// browser, or point PLAYWRIGHT_MODULE at an existing installation.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { AGENT_HTML, AGENT_CSS, AGENT_JS } from '../src/agent-builder.ts';
import { RegistryCatalog, parseCatalogQuery } from '../src/mcp-registry.ts';
const db = new DatabaseSync(':memory:');
let alarm: number | null = null;
const storage = { sql: { exec(q: string,...v: any[]) { const a=db.prepare(q).all(...v); return {toArray:()=>a}; } }, transactionSync(fn:()=>unknown){return fn();},async setAlarm(n:number){alarm=n;},async getAlarm(){return alarm;} };
const entry=(name:string,description:string, remotes:unknown[]=[{type:'streamable-http',url:`https://${name}.example/mcp`}])=>({server:{name:`org.example/${name}`,title:name,description,version:'1',remotes,websiteUrl:'https://example.com/docs'},_meta:{'io.modelcontextprotocol.registry/official':{status:'active',isLatest:true}}});
const catalog=new RegistryCatalog(storage,async()=>Response.json({servers:[entry('letters','Deliver messages to email accounts'), entry('warehouse','Query a SQL database'),entry('local-files','Read documents from local files',[]),entry('markup','<img src=x onerror=alert(1)> Email'),...Array.from({length:22},(_,i)=>entry(`mail${i}`,'Email delivery'))], metadata:{}}));
await catalog.alarm();
let posts=0, failure=false, delayed=false;
const server=createServer(async(req,res)=>{
 const u=new URL(req.url!,'http://127.0.0.1');
 let value:any;
 if(u.pathname==='/agents'){res.setHeader('content-type','text/html');res.end(AGENT_HTML);return;}
 if(u.pathname==='/assets/agents.css'){res.setHeader('content-type','text/css');res.end(AGENT_CSS);return;}
 if(u.pathname==='/assets/agents.js'){res.setHeader('content-type','application/javascript');res.end(AGENT_JS);return;}
 if(u.pathname==='/api/console/session')value={tenant_id:'a',memberships:[{tenant:{tenant_id:'a',display_name:'Test workspace'},membership:{role:'owner'}},{tenant:{tenant_id:'b',display_name:'Second workspace'},membership:{role:'viewer'}}]};
 else if(u.pathname.endsWith('/state'))value={connections:[],agents:[],runs:[]};
 else if(u.pathname.endsWith('/catalog')){if(delayed)await new Promise(r=>setTimeout(r,300)); if(failure){res.statusCode=503;value={error:'Registry discovery is unavailable. Enter an endpoint manually.'};}else value=await catalog.search(parseCatalogQuery(u.searchParams));}
 else if(req.method==='POST'){posts++;value={};}
 else{res.statusCode=404;value={};}
 res.setHeader('content-type','application/json');res.end(JSON.stringify(value));
});
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
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
await page.getByRole('button',{name:'Enter an endpoint manually'}).click();assert.equal(await page.locator('[name=endpoint]').inputValue(),'');
await page.locator('[name=label]').fill('Manual');await page.locator('[name=endpoint]').fill('https://manual.example/mcp');await page.locator('[name=consent]').check();await page.getByRole('button',{name:'Connect server',exact:true}).click();await page.locator('#status').filter({hasText:'Connected. Choose'}).waitFor();assert.equal(posts,1);
await page.locator('#catalog-query').fill('query a database');await page.getByRole('button',{name:'Search registry'}).click();await page.locator('#catalog-results h3').filter({hasText:'warehouse'}).waitFor();assert.equal(await page.locator('#catalog-results article').count(),1);
await page.locator('#catalog-query').fill('');await page.locator('#catalog-capability').selectOption('files');await page.getByRole('button',{name:'Search registry'}).click();await page.locator('#catalog-results h3').filter({hasText:'local-files'}).waitFor();assert.equal(await page.locator('#catalog-results button').count(),0);assert.match(await page.locator('#catalog-results').innerText(),/Setup required outside/i);
await page.locator('#catalog-capability').selectOption('');await page.locator('#catalog-query').fill('nothing-matches');await page.getByRole('button',{name:'Search registry'}).click();await page.getByText('No matching servers.',{exact:false}).waitFor();
failure=true;await page.getByRole('button',{name:'Search registry'}).click();await page.locator('#catalog-status').filter({hasText:'unavailable'}).waitFor();assert.equal(await page.locator('[name=endpoint]').isEnabled(),true);failure=false;
await page.locator('#catalog-query').fill('send emails');await page.getByRole('button',{name:'Search registry'}).click();await page.locator('#catalog-status').filter({hasText:'24 matching servers'}).waitFor();await page.screenshot({path:'/tmp/agentaction-registry-desktop.png',fullPage:false});
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/agentaction-registry-mobile.png',fullPage:false});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
delayed=true;await page.getByRole('button',{name:'Search registry'}).click();await page.locator('#workspace').selectOption('b');await page.waitForTimeout(500);assert.equal(await page.locator('#catalog-results article').count(),0);assert.equal(await page.locator('[name=endpoint]').isDisabled(),true);
await page.getByRole('button',{name:'Search registry'}).click();await page.locator('#catalog-status').filter({hasText:'24 matching servers'}).waitFor();assert.equal(await page.getByRole('button',{name:'Use this server'}).first().isDisabled(),true);
assert.deepEqual(errors,[]);console.log('PASS: name/capability search, pagination, safe metadata, selection without connection, cleared secrets/consent, manual connect, unsupported setup, empty/error states, workspace races, viewer access and mobile overflow.');
} finally { await browser.close();await new Promise<void>(r=>server.close(()=>r()));db.close(); }
