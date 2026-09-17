import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import worker from '../src/worker.ts';
import demoWorker from '../src/demo-worker.ts';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const env={CONSOLE_ENABLE_MOCK_IDENTITY:'true',CONSOLE_ENVIRONMENT:'development',CONSOLE_MOCK_SUBJECT:'test',CONSOLE_MOCK_TENANT_ID:'acme'};
let mode='empty',isDemo=false,posts=0,delayed=false;
const connection={id:'c',status:'connected',label:'Test account',endpoint:'https://example.com/mcp',tools:[],suggestions:[{id:'s',title:'Daily check',goal:'Check a page',success:'Report changes',tools:[],setupHints:[],setup:'Page URL'}]};
const agent={id:'agent',title:'Daily check',goal:'Check a page',success:'Report changes',status:'draft',connectionId:'c'};
const state=(tenant:string)=>({connections:tenant==='beta'||mode==='empty'?[]:[{...connection,hasCredential:mode==='success'}],agents:['draft','pending','success'].includes(mode)&&tenant!=='beta'?[agent]:[],runs:mode==='pending'?[{id:'run',agentId:'agent',kind:'trial',status:'awaiting_approval',startedAt:new Date().toISOString(),events:[],pending:{id:'p',tool:'read',arguments:{}}}]:mode==='success'?[{id:'run',agentId:'agent',kind:'trial',status:'completed',outcome:'met',startedAt:new Date().toISOString(),events:[]}]:[],endpointAccess:{deployment:[],workspace:[]},inspections:[]});
const setup=(tenant:string)=>({tenant:{tenant_id:tenant,display_name:tenant},membership:{role:'owner'},sources:[],members:[],ingestion:{observed:false}});
const fixture=JSON.parse(await readFile(new URL('../fixtures/support-refund-overview.json',import.meta.url),'utf8'));
const server=createServer(async(req,res)=>{
 const url=new URL(req.url!,'http://localhost');
 if(isDemo){const out=await demoWorker.fetch(new Request(url));res.statusCode=out.status;out.headers.forEach((v,k)=>res.setHeader(k,v));res.end(Buffer.from(await out.arrayBuffer()));return;}
 if(!url.pathname.startsWith('/api/')) {const out=await worker.fetch(new Request(url),env);res.statusCode=out.status;out.headers.forEach((v,k)=>res.setHeader(k,v));res.end(Buffer.from(await out.arrayBuffer()));return;}
 let value:any={};
 if(req.method==='POST'&&url.pathname.endsWith('/create')){posts++;mode='draft';value={};}
 else if(req.method!=='GET'){posts++;res.statusCode=405;}
 else if(url.pathname==='/api/console/session')value={tenant_id:mode==='new'?'':'acme',email:'owner@example.com',workspace_mode:'directory',memberships:mode==='new'?[]:['acme','beta'].map(id=>({tenant:{tenant_id:id,display_name:id},membership:{role:'owner'}}))};
 else if(url.pathname.endsWith('/setup')) {const tenant=url.pathname.split('/')[5];value=setup(tenant);if(delayed&&tenant==='acme')await new Promise(r=>setTimeout(r,450));}
 else if(url.pathname.startsWith('/api/automations/'))value={jobs:[],runs:[]};
 else if(url.pathname.endsWith('/state')) {value=state(url.pathname.split('/')[3]);if(mode==='error')res.statusCode=503;}
 else if(url.pathname.endsWith('/catalog')) value={servers:[],total:0,capabilities:[],authTypes:[],status:'ready',nextOffset:null};
 else if(url.pathname.includes('intent-quality/rollups')) value={...fixture,tenant_id:'acme'};
 else if(url.pathname.endsWith('/activity'))value={schema_version:'agentaction.activity-page.v1',tenant_id:'acme',events:[],pagination:{}};
 else if(url.pathname.endsWith('/evals'))value={schema_version:'agentaction.tenant-evals.v1',definitions:[],assignments:[]};
 else {res.statusCode=404;value={error:'fixture route unavailable'};}
 res.setHeader('content-type','application/json');res.end(JSON.stringify(value));
});
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
const base=`http://127.0.0.1:${(server.address() as any).port}`;
try {
 for(const [variant,title] of [['new','Start with your workspace'],['empty','Connect your first MCP server'],['connected','Give your agent a job'],['draft','Try your first run'],['pending','A run needs your review'],['success','Make the next run better'],['error','Check your workspace connection']]) {
  mode=variant;await page.goto(base+'/?case='+variant+'#overview');await page.getByRole('heading',{name:title,exact:true}).waitFor();assert.equal(await page.locator('.journey-track li').count(),5);assert.equal(await page.locator('[data-console-view=overview]').isHidden(),true);
  assert.equal(await page.locator('.journey-nav [data-stage]').count(),6);
  assert.equal(await page.locator('.journey-nav [data-utility]').count(),0);
  if(variant==='new') {
   assert.equal(await page.locator('.journey-track li[data-next=true]').count(),0);
   await page.getByRole('link',{name:'Set up your workspace →',exact:true}).click();
   await page.getByRole('heading',{name:'Workspace settings',exact:true}).waitFor();
   assert.equal(await page.locator('[data-utility=settings]').getAttribute('aria-current'),'page');
   assert.equal(await page.locator('[data-stage=connect]').getAttribute('aria-current'),'false');
   assert.equal(await page.locator('[data-create-workspace-card]').isVisible(),true);
  }
 }
 mode='draft';await page.goto(base+'/#overview');await page.getByRole('heading',{name:'Try your first run',exact:true}).waitFor();await page.screenshot({path:'/tmp/agentaction-209-overview-desktop.png',fullPage:true});
 delayed=true;await page.reload();await page.locator('[data-tenant-select]').selectOption('beta');await page.getByRole('heading',{name:'Connect your first MCP server',exact:true}).waitFor();await page.waitForTimeout(550);assert.equal(await page.locator('[data-journey-next]').getAttribute('href'),'/agents?workspace=beta#connect');delayed=false;
 await page.locator('[data-utility=settings]').click();
 await page.getByRole('heading',{name:'Workspace settings',exact:true}).waitFor();
 await page.getByText('Workspace settings are ready',{exact:true}).waitFor();
 assert.equal(await page.locator('[data-tenant-select]').inputValue(),'beta');
 assert.equal(await page.locator('[data-utility=settings]').getAttribute('aria-current'),'page');
 assert.equal(new URL(page.url()).hash,'#setup');
 await page.screenshot({path:'/tmp/agentaction-211-settings-desktop.png',fullPage:true});
 await page.locator('[data-stage=create]').click();await page.getByRole('heading',{name:'Give your agent a job.',exact:true}).waitFor();assert.equal(await page.locator('#workspace').inputValue(),'beta');assert.equal(await page.locator('[data-builder-stage=connect]').isHidden(),true);assert.equal(await page.locator('[data-builder-stage=run]').first().isHidden(),true);
 await page.locator('#workspace').selectOption('acme');await page.locator('#create-connections').getByText('Test account',{exact:true}).waitFor();await page.screenshot({path:'/tmp/agentaction-209-create-desktop.png',fullPage:true});
 assert.equal(posts,0);await page.getByRole('button',{name:'Build this agent',exact:true}).click();await page.locator('#create [name=setup]').fill('Check https://example.com each day');await page.getByRole('button',{name:'Create agent instance',exact:true}).click();
 await page.getByRole('heading',{name:'Put your agent to work.',exact:true}).waitFor();await page.getByRole('button',{name:'Run a trial',exact:true}).waitFor();assert.equal(await page.locator('[data-builder-stage=create]').first().isHidden(),true);assert.equal(await page.locator('[data-stage=run]').getAttribute('aria-current'),'page');await page.screenshot({path:'/tmp/agentaction-209-run-desktop.png',fullPage:true});
 await page.locator('[data-stage=connect]').click();await page.getByRole('heading',{name:'Connect your tools.',exact:true}).waitFor();assert.equal(await page.locator('[data-builder-stage=run]').first().isHidden(),true);
 await page.getByRole('heading',{name:'MCP servers',exact:true}).waitFor();
 assert.equal(await page.locator('[data-builder-stage=connect]').getByRole('link',{name:'Workspace settings',exact:true}).count(),0);
 await page.getByRole('button',{name:'MCP connections',exact:true}).click();
 await page.getByText('Authentication: no stored credential',{exact:true}).waitFor();
 await page.getByText('Server: https://example.com/mcp',{exact:true}).waitFor();
 await page.screenshot({path:'/tmp/agentaction-211-servers-desktop.png',fullPage:true});
 await page.locator('#workspace').selectOption('beta');
 await page.locator('[data-utility=settings]').click();
 await page.getByRole('heading',{name:'Workspace settings',exact:true}).waitFor();
 await page.getByText('Workspace settings are ready',{exact:true}).waitFor();
 assert.equal(await page.locator('[data-tenant-select]').inputValue(),'beta');
 mode='success';await page.goto(base+'/agents?workspace=acme#connect');
 await page.getByRole('button',{name:'MCP connections',exact:true}).click();
 await page.getByText('Connected account: credential stored',{exact:true}).waitFor();
 for(const path of ['/#overview','/agents#connect','/agents#create','/agents#run','/#activity','/#quality','/#evals','/#setup','/#exceptions']) {
  await page.setViewportSize({width:390,height:844});await page.goto(base+path);await page.waitForTimeout(150);const overflow=await page.evaluate(()=>Array.from(document.querySelectorAll('main *')).filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width})));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,path+JSON.stringify(overflow));if(path==='/#setup')await page.screenshot({path:'/tmp/agentaction-211-settings-mobile.png',fullPage:true});if(path==='/#overview'||path==='/agents#create')await page.screenshot({path:'/tmp/agentaction-209-'+(path==='/#overview'?'overview':'create')+'-mobile.png',fullPage:true});
 }
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/#quality');await page.locator('[data-monitor-heading]').waitFor();assert.equal(await page.locator('[data-stage=monitor]').getAttribute('aria-current'),'page');await page.locator('[data-monitor-tabs]').getByRole('link',{name:'Exceptions · planned'}).click();await page.locator('#exceptions').waitFor();assert.equal(await page.locator('[data-console-view=overview]').isHidden(),true);
 await page.locator('[data-stage=home]').click();await page.locator('[data-journey-home]').waitFor();assert.equal(await page.locator('#exceptions').isHidden(),true);
 isDemo=true;await page.goto(base+'/#overview');await page.getByRole('heading',{name:'Explore an agent in action'}).waitFor();assert.equal(await page.locator('[data-stage=create]').isHidden(),true);assert.equal(await page.locator('[data-workspace-navigation]').isHidden(),true);assert.equal(await page.locator('.journey-track a').count(),1);await page.getByRole('link',{name:'Explore Monitor →'}).click();await page.locator('[data-console-view=activity]').waitFor();
 assert.equal(posts,1,'Only the explicit create action may mutate state; navigation never executes tools');assert.deepEqual(errors,[]);console.log('Journey browser acceptance passed: state, isolation, focused stages, navigation, mobile, demo, create-to-run transition and no automatic execution.');
}catch(error){console.error({mode,errors,body:await page.locator("body").innerText()});throw error;}finally{await browser.close();server.close();}
