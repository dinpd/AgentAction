import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import worker from '../src/worker.ts';
import demoWorker from '../src/demo-worker.ts';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const env={CONSOLE_ENABLE_MOCK_IDENTITY:'true',CONSOLE_ENVIRONMENT:'development',CONSOLE_MOCK_SUBJECT:'test',CONSOLE_MOCK_TENANT_ID:'acme'};
let mode='success',isDemo=false,posts=0,delayed=false,recurringError=false,privateReads=0,role='owner';
const stamp=Date.now();
const recurring=(tenant:string)=>({jobs:tenant==='beta'||mode==='empty'?[]:[{id:'watch',title:'Website <img src=x onerror=alert(1)>',status:'active',health:mode==='stale'?'unknown':'checks complete',stale:mode==='stale',intervalMinutes:5,lastRun:stamp,nextRun:stamp+300000}],runs:tenant==='beta'||mode==='empty'?[]:Array.from({length:45},(_,i)=>({id:'check-'+i,jobId:'watch',startedAt:stamp+i*1000,status:i===43?'partial':i===42?'interrupted':'completed',kind:'scheduled',findings:i===41?1:0,summary:'Check '+i+'; HTTP 200'}))});
const connection={id:'c',status:'connected',label:'Test account',endpoint:'https://example.com/mcp',tools:[],suggestions:[{id:'s',title:'Daily check',goal:'Check a page',success:'Report changes',tools:[],setupHints:[],setup:'Page URL'}]};
const agent={id:'agent',title:'Daily check',goal:'Check a page',success:'Report changes',status:'draft',connectionId:'c'};
const state=(tenant:string)=>({connections:tenant==='beta'||mode==='empty'||mode==='recurring'?[]:[{...connection,hasCredential:mode==='success'}],agents:['draft','pending','success'].includes(mode)&&tenant!=='beta'?[agent]:[],runs:mode==='pending'?[{id:'run',agentId:'agent',kind:'trial',status:'awaiting_approval',startedAt:new Date(stamp-100000).toISOString(),events:[],pending:{id:'p',tool:'read',arguments:{}}}]:mode==='success'?[{id:'run',agentId:'agent',kind:'trial',status:'completed',outcome:'met',startedAt:new Date(stamp-100000).toISOString(),events:[]}]:[],endpointAccess:{deployment:[],workspace:[]},inspections:[]});
const setup=(tenant:string)=>({tenant:{tenant_id:tenant,display_name:tenant},membership:{role},sources:[],members:[],ingestion:{observed:false}});
const fixture=JSON.parse(await readFile(new URL('../fixtures/support-refund-overview.json',import.meta.url),'utf8'));
const server=createServer(async(req,res)=>{
 const url=new URL(req.url!,'http://localhost');
 if(url.pathname.startsWith('/api/automations/')||url.pathname.startsWith('/api/agents/'))privateReads++;
 if(isDemo){const out=await demoWorker.fetch(new Request(url));res.statusCode=out.status;out.headers.forEach((v,k)=>res.setHeader(k,v));res.end(Buffer.from(await out.arrayBuffer()));return;}
 if(!url.pathname.startsWith('/api/')) {const out=await worker.fetch(new Request(url),env);res.statusCode=out.status;out.headers.forEach((v,k)=>res.setHeader(k,v));res.end(Buffer.from(await out.arrayBuffer()));return;}
 let value:any={};
 if(req.method==='POST'&&url.pathname.endsWith('/create')){posts++;mode='draft';value={};}
 else if(req.method!=='GET'){posts++;res.statusCode=405;}
 else if(url.pathname==='/api/console/session')value={tenant_id:mode==='new'?'':'acme',email:'owner@example.com',workspace_mode:'directory',memberships:mode==='new'?[]:['acme','beta'].map(id=>({tenant:{tenant_id:id,display_name:id},membership:{role}}))};
 else if(url.pathname.endsWith('/setup')) {const tenant=url.pathname.split('/')[5];value=setup(tenant);if(delayed&&tenant==='acme')await new Promise(r=>setTimeout(r,450));}
 else if(url.pathname.startsWith('/api/automations/')){const tenant=url.pathname.split('/')[3];value=recurring(tenant);if(delayed&&tenant==='acme')await new Promise(r=>setTimeout(r,500));if(recurringError)res.statusCode=503;}
 else if(url.pathname.endsWith('/state')) {value=state(url.pathname.split('/')[3]);if(mode==='error')res.statusCode=503;}
 else if(url.pathname.endsWith('/catalog')) value={servers:[],total:0,capabilities:[],authTypes:[],status:'ready',nextOffset:null};
 else if(url.pathname.includes('intent-quality/rollups')) value={...fixture,tenant_id:'acme'};
 else if(url.pathname.endsWith('/activity/events'))value={schema_version:'agentaction.activity-page.v1',tenant_id:'acme',events:[],pagination:{}};
 else if(url.pathname.endsWith('/evals'))value={schema_version:'agentaction.tenant-evals.v1',definitions:[],assignments:[]};
 else {res.statusCode=404;value={error:'fixture route unavailable'};}
 res.setHeader('content-type','application/json');res.end(JSON.stringify(value));
});
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
page.setDefaultTimeout(15000);
const base=`http://127.0.0.1:${(server.address() as any).port}`;
try {
 await page.goto(base+'/agents?workspace=acme#run');
 await page.locator('#agents [data-recurring-agent]').waitFor();
 assert.equal(await page.locator('#agents article').count(),2);
 assert.match(await page.locator('#agents [data-recurring-agent]').innerText(),/Last check.*Next check/);
 assert.equal(await page.locator('#agents img').count(),0,'Untrusted titles must stay text');
 assert.equal(await page.locator('#runs [data-run-at]').count(),40);
 assert.match(await page.locator('#runs article').first().innerText(),/Check 44/);
 await page.screenshot({path:'/tmp/agentaction-217-run.png',fullPage:false});
 mode='pending';await page.reload();await page.getByRole('button',{name:'Approve and execute',exact:true}).waitFor();
 assert.equal(await page.locator('#runs [data-run-at]').count(),41,'Keep an older pending approval beyond recent checks');
 delayed=true;await page.locator('#refresh').click();await page.locator('#workspace').selectOption('beta');
 await page.getByText('Choose a recipe or an AI suggestion in Create to build your first agent.',{exact:true}).waitFor();
 await page.waitForTimeout(650);assert.equal(await page.locator('#agents [data-recurring-agent]').count(),0);
 delayed=false;mode='recurring';await page.goto(base+'/?workspace=acme#overview');
 await page.getByRole('heading',{name:'Your recurring agents are checking in',exact:true}).waitFor();
 assert.match(await page.locator('.journey-track').innerText(),/1 agent/);
 await page.locator('[data-journey-next]').click();await page.locator('[data-hosted-runs] article').first().waitFor();
 assert.equal(await page.locator('[data-hosted-runs] article').count(),40);
 assert.match(await page.locator('[data-hosted-runs] article').first().innerText(),/Check 44/);
 assert.match(await page.locator('[data-hosted-runs]').innerText(),/partial/);assert.match(await page.locator('[data-hosted-runs]').innerText(),/interrupted/);
 assert.match(await page.locator('[data-hosted-runs]').innerText(),/coverage is unknown/);
 assert.equal(await page.locator('[data-hosted-history] a').first().getAttribute('href'),'/automations?workspace=acme#agents');
 await page.getByText('No external activity received',{exact:true}).waitFor();
 await page.screenshot({path:'/tmp/agentaction-217-monitor.png',fullPage:false});
 await page.route('**/activity/events?**', route=>route.fulfill({status:503,json:{error:'External feed unavailable'}}));
 await page.reload();await page.getByText('External activity is unavailable',{exact:true}).waitFor();
 await page.locator('[data-hosted-runs] article').first().waitFor();assert.equal(await page.locator('[data-hosted-runs] article').count(),40);
 await page.unroute('**/activity/events?**');
 delayed=true;await page.getByRole('button',{name:'Refresh agent runs',exact:true}).click();await page.locator('[data-tenant-select]').selectOption('beta');
 await page.getByText('No agent runs recorded yet. Draft agents need a first run before activation.',{exact:true}).waitFor();
 await page.waitForTimeout(650);assert.equal(await page.locator('[data-hosted-history] article').count(),0);delayed=false;
 await page.locator('[data-tenant-select]').selectOption('acme');await page.locator('[data-hosted-runs] article').first().waitFor();
 recurringError=true;await page.getByRole('button',{name:'Refresh agent runs',exact:true}).click();
 await page.getByText('Recurring run history is unavailable. Refresh to retry.',{exact:true}).waitFor();
 assert.equal(await page.locator('[data-hosted-history] article').count(),0);
 await page.goto(base+'/agents?workspace=acme#run');await page.getByText('Recurring agents are unavailable. Refresh to retry.',{exact:true}).waitFor();
 recurringError=false;mode='stale';await page.goto(base+'/?workspace=acme#overview');await page.getByRole('heading',{name:'Review monitoring coverage and findings',exact:true}).waitFor();
 mode='success';await page.goto(base+'/?workspace=acme#activity');await page.locator('[data-hosted-runs] article').first().waitFor();
 // A smaller recurring history leaves room for supervised history, tested by direct fixture response below.
 await page.route('**/api/automations/acme/state', route=>route.fulfill({json:{...recurring('acme'),runs:recurring('acme').runs.slice(-2)}}));
 await page.getByRole('button',{name:'Refresh agent runs',exact:true}).click();await page.getByText('Supervised run · completed',{exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'/tmp/agentaction-217-mobile.png',fullPage:false});
 role='viewer';await page.goto(base+'/agents?workspace=acme#run');await page.getByText('Workspace ready · viewer',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Run a trial',exact:true}).isDisabled(),true);assert.equal(await page.locator('#agents [data-recurring-agent]').count(),1);
 await page.unroute('**/api/automations/acme/state');
 isDemo=true;const before=privateReads;await page.goto(base+'/#activity');await page.locator('[data-console-view=activity]').waitFor();
 assert.equal(await page.locator('[data-hosted-history]').isHidden(),true);assert.equal(privateReads,before,'Demo never reads private runtime data');
 assert.equal(posts,0,'Viewing and refreshing never executes a check or mutates agents');assert.deepEqual(errors,[]);
 console.log('Unified history acceptance passed: mixed and recurring-only workspaces, ordering, approvals, stale coverage, isolation, failure, mobile, demo and read-only navigation.');
}catch(error){console.error({mode,errors,body:await page.locator('body').innerText()});throw error;}finally{await browser.close();server.close();}
