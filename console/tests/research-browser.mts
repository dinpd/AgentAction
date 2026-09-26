import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import worker from '../src/worker.ts';
import {RESEARCH_ENDPOINT} from '../src/research-digest.ts';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const env={CONSOLE_ENABLE_MOCK_IDENTITY:'true',CONSOLE_ENVIRONMENT:'development',CONSOLE_MOCK_SUBJECT:'owner',CONSOLE_MOCK_TENANT_ID:'acme'};
const agent:any={id:'agent',title:'Social research',goal:'Relevant X and Reddit conversations for a retirement planning app',setup:'Saved website brief',success:'Sourced digest',status:'draft',connectionId:'apify',tools:[]};
const connections:any[]=[{id:'apify',label:'Existing Apify account',status:'connected',endpoint:'https://mcp.apify.com/?tools=harshmaur/reddit-scraper',tools:[],suggestions:[]}];
connections.push({...connections[0],id:'other-apify',label:'Other Apify account'});
let runs:any[]=[],role='owner',saved=0,connected=0,activated=0,failSave=true;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url!,'http://localhost');
 if(!url.pathname.startsWith('/api/')){const out=await worker.fetch(new Request(url),env);res.statusCode=out.status;out.headers.forEach((v,k)=>res.setHeader(k,v));res.end(Buffer.from(await out.arrayBuffer()));return;}
 let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):{};let data:any={};
 if(url.pathname==='/api/console/session')data={tenant_id:'acme',email:'owner@example.com',memberships:[{tenant:{tenant_id:'acme',display_name:'acme'},membership:{role}}]};
 else if(url.pathname==='/api/agents/acme/state')data={connections,agents:[agent],runs};
 else if(url.pathname==='/api/automations/acme/state')data={jobs:[],runs:[],notifications:{recipients:['reports@example.com']}};
 else if(url.pathname.endsWith('/research-draft'))data={topics:'Brand mentions and retirement planning tools; exclude promotions.',queries:{x:['Example','retirement planning'],reddit:['Example','financial scenarios']}};
 else if(url.pathname.endsWith('/research-connect')){assert.equal(body.connectionId,'apify');assert.equal(body.reviewed,true);connected++;connections.push({...connections[0],id:'research',endpoint:RESEARCH_ENDPOINT});data={connectionId:'research'};}
 else if(url.pathname.endsWith('/research-save')){if(failSave){failSave=false;res.statusCode=409;res.setHeader('content-type','application/json');res.end(JSON.stringify({error:'Provider temporarily unavailable; retry saving.'}));return;}saved++;assert.equal(body.config.connectionId,'research');assert.equal(body.config.freePlan,true);agent.research={config:body.config,digest:'digest',tools:[]};}
 else if(url.pathname.endsWith('/trial')){const run={id:'trial',agentId:agent.id,kind:'trial',startedAt:new Date().toISOString(),status:'awaiting_approval',events:[],research:{definition:agent.research,sources:[{platform:'x',stage:'ready'},{platform:'reddit',stage:'ready'}]},pending:{id:'approval',tool:'research-scan',arguments:{scope:agent.research.config}}};runs=[run];agent.lastTrial=run.id;data={runId:run.id};}
 else if(url.pathname.endsWith('/approve')){assert.equal(body.approvalId,'approval');const r=runs[0];r.pending=undefined;r.status='completed';r.outcome='met';r.summary='2/2 platforms retrieved. Email: accepted.';r.research.sources.forEach((s:any)=>s.stage='done');r.research.checks=[{label:'Both platforms retrieved',status:'pass',observed:'2/2 platforms',method:'Check completed Actor runs and matching dataset rows.'}];r.research.report='Actual sourced report\nhttps://x.com/alice/status/123\nWhy relevant: retirement planning';r.research.delivery={status:'accepted'};}
 else if(url.pathname.endsWith('/activate')){assert.equal(body.reviewed,true);activated++;agent.status='active';agent.nextRun=Date.now()+86400000;}
 else if(url.pathname.endsWith('/pause'))agent.status='paused';
 else if(url.pathname.endsWith('/catalog'))data={servers:[],total:0,capabilities:[],authTypes:[]};
 res.setHeader('content-type','application/json');res.end(JSON.stringify(data));
});
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
const page=await browser.newPage({viewport:{width:1200,height:1000}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{errors.push('Unexpected native '+d.type()+' dialog');void d.dismiss();});
const base=`http://127.0.0.1:${(server.address() as any).port}`;
try{
 page.setDefaultTimeout(10000);await page.goto(base+'/agents?workspace=acme#run');
 await page.getByText('Set up daily X + Reddit research',{exact:true}).click();const editor=page.locator('[data-research-editor]');
 await editor.getByRole('button',{name:'Suggest phrases from saved brief'}).click();await editor.getByText('Review the suggested scope and phrases, then save.',{exact:true}).waitFor();
 assert.equal(await editor.getByLabel('Email report to',{exact:true}).inputValue(),'reports@example.com');
 assert.equal(await editor.getByLabel('Morning scan time',{exact:true}).inputValue(),'08:00');
 await editor.getByRole('checkbox',{name:'Keep the existing Apify Free plan.',exact:false}).check();
 await editor.getByRole('button',{name:'Save research settings'}).click();assert.equal(saved,0);assert.equal(connected,0);
 const reuse=editor.getByRole('checkbox',{name:'Use this account’s existing server-side credential',exact:false});await reuse.check();
 await editor.getByLabel('Apify research account').selectOption('other-apify');assert.equal(await reuse.isChecked(),false);
 await editor.getByLabel('Apify research account').selectOption('apify');await reuse.check();await editor.getByRole('button',{name:'Save research settings'}).click();
 await editor.getByText('Provider temporarily unavailable; retry saving.',{exact:true}).waitFor();assert.equal(saved,0);assert.match(await editor.getByLabel('Reddit search phrases · one per line',{exact:true}).inputValue(),/financial scenarios/);assert.equal(await reuse.isChecked(),true);
 await editor.getByRole('button',{name:'Save research settings'}).click();await page.getByText('Research settings saved. Next:',{exact:false}).waitFor();assert.equal(saved,1);assert.equal(connected,2);
 await page.reload();await page.getByText('Daily research · saved · edit scope and delivery',{exact:true}).click();
 assert.equal(await editor.getByRole('button',{name:'Saved',exact:true}).isDisabled(),true);
 assert.match(await editor.getByLabel('Reddit search phrases · one per line',{exact:true}).inputValue(),/financial scenarios/);
 await editor.getByLabel('Relevance scope and exclusions',{exact:true}).fill('Updated scope');assert.equal(await editor.getByRole('button',{name:'Save research settings'}).isEnabled(),true);assert.match(await editor.locator('summary').innerText(),/unsaved/);
 await editor.getByRole('button',{name:'Save research settings'}).click();await page.getByText('Research settings saved. Next:',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Run a trial',exact:true}).click();await page.getByText('Approve research trial and email report',{exact:true}).waitFor();
 await page.goto(base+'/agents?workspace=acme#approvals');await page.getByText('Approve research trial and email report',{exact:true}).waitFor();
 assert.equal(await page.getByText('Adjust tool arguments',{exact:true}).count(),0);assert.match(await page.locator('#runs').innerText(),/reports@example.com/);
 await page.getByRole('button',{name:'Approve and execute',exact:true}).click();await page.getByRole('link',{name:'View updated run →',exact:true}).click();
 await page.getByText('Research report · email accepted',{exact:true}).click();assert.match(await page.locator('#runs').innerText(),/Actual sourced report/);assert.ok(!(await page.locator('#runs').innerText()).includes('No bound evaluation'));
 await page.getByText('PASS · Both platforms retrieved · 2/2 platforms',{exact:true}).click();assert.match(await page.locator('#runs').innerText(),/Measured by: Check completed/);
 await page.getByRole('button',{name:'Activate daily',exact:true}).click();
 const review=page.getByRole('region',{name:'Review daily research activation'});await review.waitFor();
 assert.match(await review.innerText(),/08:00 America\/Los_Angeles/);assert.match(await review.innerText(),/reports@example.com/);assert.match(await review.innerText(),/\$0.05 per Actor/);assert.equal(activated,0);
 await review.getByRole('button',{name:'Cancel activation'}).click();assert.equal(activated,0);assert.equal(await review.isVisible(),false);
 await page.getByRole('button',{name:'Activate daily',exact:true}).click();await review.getByRole('button',{name:'Confirm daily research'}).click();await page.getByText('Daily research activated within the reviewed bounds.',{exact:true}).waitFor();assert.equal(agent.status,'active');assert.equal(activated,1);
 await page.getByRole('button',{name:'Pause',exact:true}).click();await page.getByText('Agent paused. Pending calls were cancelled.',{exact:true}).waitFor();assert.equal(agent.status,'paused');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'/tmp/aa275-research-mobile.png',fullPage:true});
 role='viewer';await page.reload();await page.getByText('Daily research · saved · edit scope and delivery',{exact:true}).click();assert.equal(await editor.getByRole('button',{name:'Saved',exact:true}).isDisabled(),true);
 assert.deepEqual(errors,[]);console.log('Research browser acceptance passed: saved-brief phrases, explicit save/reload, reviewed credential reuse, existing approval queue, measurable report, activation, pause and mobile.');
}finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
