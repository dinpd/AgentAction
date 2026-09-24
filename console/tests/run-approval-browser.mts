import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import worker from '../src/worker.ts';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const env={CONSOLE_ENABLE_MOCK_IDENTITY:'true',CONSOLE_ENVIRONMENT:'development',CONSOLE_MOCK_SUBJECT:'test',CONSOLE_MOCK_TENANT_ID:'acme'};
const stamp=Date.now();
const agent={id:'agent',title:'Social research',goal:'Research public posts',success:'Sourced findings',status:'draft',connectionId:'server',tools:['search']};
const connection={id:'server',label:'Research server',status:'connected',endpoint:'https://example.com/mcp',tools:[{name:'search',inputSchema:{type:'object'}}],suggestions:[]};
let run:any={id:'run',agentId:agent.id,kind:'trial',status:'awaiting_approval',startedAt:new Date(stamp-86400000).toISOString(),events:[],pending:{id:'approval',tool:'search',arguments:{query:'research'}}};
const pastRuns:any[]=[];
let role='owner',fail=true,changed=false,hold=true,release:(()=>void)|undefined,approvals=0,refreshes=0;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url!,'http://localhost');
 if(!url.pathname.startsWith('/api/')){const out=await worker.fetch(new Request(url),env);res.statusCode=out.status;out.headers.forEach((v,k)=>res.setHeader(k,v));res.end(Buffer.from(await out.arrayBuffer()));return;}
 let value:any={};
 if(url.pathname==='/api/console/session')value={tenant_id:'acme',email:'owner@example.com',memberships:['acme','beta'].map(id=>({tenant:{tenant_id:id,display_name:id},membership:{role}}))};
 else if(url.pathname==='/api/agents/acme/state')value={connections:[connection],agents:[agent],runs:[...pastRuns,run]};
 else if(url.pathname.endsWith('/state'))value=url.pathname.includes('/automations/acme/')?{jobs:[{id:'watch',title:'Website health',status:'active',intervalMinutes:5}],runs:Array.from({length:45},(_,i)=>({id:'check-'+i,jobId:'watch',startedAt:stamp+i*1000,status:'completed',kind:'scheduled',findings:0,summary:'Check '+i}))}:{connections:[],agents:[],runs:[],jobs:[]};
 else if(url.pathname.endsWith('/approve')){
  let body='';for await(const chunk of req)body+=chunk;assert.deepEqual(JSON.parse(body),{runId:'run',approvalId:'approval'});approvals++;
  if(hold){hold=false;await new Promise<void>(resolve=>{release=resolve;});}
  if(fail){res.statusCode=409;value={error:changed?'No tool call was sent. The tool definition changed (outputSchema). Open MCP servers and refresh this server’s capabilities, then review a new trial. Refreshing pauses affected agents and cancels their pending approvals.':'No tool call was sent. Temporary provider preflight failure. Try again.'};}
  else {run={...run,status:'completed',pending:undefined,summary:'Found three relevant posts.',events:[{tool:'search',status:'succeeded',arguments:{query:'research'},result:'Three posts'}]};value={runId:'run'};}
 }
 else if(url.pathname.endsWith('/refresh-capabilities')){
  let body='';for await(const chunk of req)body+=chunk;assert.deepEqual(JSON.parse(body),{connectionId:'server'});refreshes++;
  agent.status='paused';run={...run,status:'cancelled',pending:undefined};value={connectionId:'server'};
 }
 else if(url.pathname.endsWith('/trial')){pastRuns.push({...run});run={...run,id:'fresh',status:'awaiting_approval',pending:{id:'fresh-approval',tool:'search',arguments:{query:'research'}},startedAt:new Date().toISOString()};value={runId:'fresh'};}
 else if(url.pathname.endsWith('/catalog'))value={servers:[],total:0,capabilities:[],authTypes:[],nextOffset:null};
 else if(url.pathname.endsWith('/setup'))value={membership:{role},sources:[]};
 else if(url.pathname.endsWith('/evals'))value={schema_version:'agentaction.tenant-evals.v1',definitions:[],assignments:[]};
 res.setHeader('content-type','application/json');res.end(JSON.stringify(value));
});
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
const base=`http://127.0.0.1:${(server.address() as any).port}`;
const card=()=>page.locator('[data-supervised-run=run]');
const feedback=()=>card().locator('[data-run-feedback]');
const refresh=async()=>{const previous=await card().elementHandle();await page.locator('#refresh').click();await page.waitForFunction(el=>!el!.isConnected,previous);};
try {
 page.setDefaultTimeout(10000);
 await page.goto(base+'/agents?workspace=acme#run');await page.getByRole('button',{name:'Approve and execute',exact:true}).waitFor();
 assert.equal(await page.locator('#runs article').first().getAttribute('data-supervised-run'),'run');
 assert.equal(await page.locator('#runs [data-run-at]').count(),41);
 assert.equal(await page.locator('[data-run-group]').count(),1);
 assert.match(await page.locator('[data-run-group] > summary').innerText(),/Website health · 40 runs · Latest: completed/);
 assert.equal(await page.locator('[data-run-group]').getAttribute('open'),null);
 assert.equal(await page.locator('[data-run-group] article').first().isVisible(),false);
 assert.equal(await page.evaluate(()=>Boolean(document.querySelector('#runs')!.compareDocumentPosition(document.querySelector('#agents')!)&Node.DOCUMENT_POSITION_FOLLOWING)),true);
 await card().getByRole('button',{name:'Approve and execute',exact:true}).click();
 await feedback().filter({hasText:'Executing the approved call'}).waitFor();
 assert.equal(await card().getByRole('button',{name:'Executing…',exact:true}).isDisabled(),true);
 assert.equal(await card().getByRole('button',{name:'Cancel run',exact:true}).isDisabled(),true);
 assert.equal(await card().getByRole('button',{name:'Executing…',exact:true}).getAttribute('aria-busy'),'true');
 await refresh();await feedback().filter({hasText:'Executing the approved call'}).waitFor();
 assert.equal(await card().getByRole('button',{name:'Executing…',exact:true}).isDisabled(),true);
 assert.equal(approvals,1);assert.ok(release);release!();release=undefined;
 await feedback().filter({hasText:'No tool call was sent'}).waitFor();
 assert.equal(await feedback().getAttribute('data-error'),'true');
 assert.equal(await card().getByRole('button',{name:'Approve and execute',exact:true}).isEnabled(),true);
 assert.equal(await card().getByRole('link',{name:'Manage MCP server',exact:true}).getAttribute('href'),'#connect');
 await refresh();await feedback().filter({hasText:'No tool call was sent'}).waitFor();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await card().screenshot({path:'/tmp/aa286-approval-mobile.png'});
 fail=false;await card().getByRole('button',{name:'Approve and execute',exact:true}).click();
 await feedback().filter({hasText:'Action processed'}).waitFor();
 assert.match(await card().innerText(),/Found three relevant posts/);assert.equal(await card().isVisible(),true);assert.equal(approvals,2);
 assert.equal(await card().getByRole('button',{name:'Approve and execute',exact:true}).count(),0);
 await page.reload();await page.locator('[data-run-group="supervised:agent"]').waitFor();
 assert.equal(await page.locator('[data-run-group="supervised:agent"]').getAttribute('open'),null);
 await page.locator('[data-run-group="supervised:agent"] > summary').click();assert.equal(await card().isVisible(),true);
 fail=true;changed=true;run={...run,status:'awaiting_approval',pending:{id:'approval',tool:'search',arguments:{}},events:[]};
 await page.reload();await card().getByRole('button',{name:'Approve and execute',exact:true}).click();
 await feedback().filter({hasText:'tool definition changed (outputSchema)'}).waitFor();
 assert.equal(await card().getByRole('button',{name:'Approval blocked',exact:true}).isDisabled(),true);
 await card().getByRole('button',{name:'Refresh server capabilities',exact:true}).click();
 await feedback().filter({hasText:'Server capabilities refreshed.'}).waitFor();
 assert.equal(refreshes,1);assert.equal(approvals,3);assert.equal(run.status,'cancelled');
 assert.equal(await card().getByRole('button',{name:'Approve and execute',exact:true}).count(),0);
 await page.getByRole('button',{name:'Run a trial',exact:true}).click();
 await page.locator('[data-supervised-run=fresh]').waitFor();
 assert.equal(await card().isVisible(),false);assert.equal(await page.locator('[data-run-group=\"supervised:agent\"]').getAttribute('open'),null);
 pastRuns.length=0;
 role='viewer';run={...run,id:'run',status:'awaiting_approval',pending:{id:'approval',tool:'search',arguments:{}},events:[]};
 await page.reload();await page.getByText('Workspace ready · viewer',{exact:true}).waitFor();assert.equal(await card().getByRole('button',{name:'Approve and execute',exact:true}).isDisabled(),true);
 await page.locator('#workspace').selectOption('beta');await page.getByText('Workspace ready · viewer',{exact:true}).waitFor();assert.equal(await page.locator('[data-run-feedback]').count(),0);
 assert.deepEqual(errors,[]);console.log('Run approval acceptance passed: priority, grouped history, local progress/errors, busy refresh, retry, visible result, mobile, viewer and workspace isolation.');
}finally{release?.();await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
