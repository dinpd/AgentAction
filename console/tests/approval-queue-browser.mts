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
let unavailable=false, delayState=false;
let role='owner',fail=true,changed=false,hold=true,release:(()=>void)|undefined,approvals=0,refreshes=0;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url!,'http://localhost');
 if(!url.pathname.startsWith('/api/')){const out=await worker.fetch(new Request(url),env);res.statusCode=out.status;out.headers.forEach((v,k)=>res.setHeader(k,v));res.end(Buffer.from(await out.arrayBuffer()));return;}
 let value:any={};
 if(url.pathname==='/api/console/session')value={tenant_id:'acme',email:'owner@example.com',memberships:['acme','beta'].map(id=>({tenant:{tenant_id:id,display_name:id},membership:{role}}))};
 else if(url.pathname==='/api/agents/acme/state'){value={connections:[connection],agents:[agent],runs:[...pastRuns,run]};if(unavailable)res.statusCode=503;if(delayState)await new Promise(r=>setTimeout(r,500));}
 else if(url.pathname.endsWith('/state'))value=url.pathname.includes('/automations/acme/')?{jobs:[{id:'watch',title:'Website health',status:'active',intervalMinutes:5}],runs:Array.from({length:45},(_,i)=>({id:'check-'+i,jobId:'watch',startedAt:stamp+i*1000,status:'completed',kind:'scheduled',findings:0,summary:'Check '+i}))}:{connections:[],agents:[],runs:[],jobs:[]};
 else if(url.pathname.endsWith('/approve')){
  let body='';for await(const chunk of req)body+=chunk;assert.deepEqual(JSON.parse(body),{runId:'run',approvalId:run.pending.id});approvals++;
  if(hold){hold=false;await new Promise<void>(resolve=>{release=resolve;});}
  if(fail){res.statusCode=409;value={error:changed?'No tool call was sent. The tool definition changed (outputSchema). Open MCP servers and refresh this server’s capabilities, then review a new trial. Refreshing pauses affected agents and cancels their pending approvals.':'No tool call was sent. Temporary provider preflight failure. Try again.'};}
  else {run={...run,status:'completed',pending:undefined,summary:'Found three relevant posts.',events:[{tool:'search',status:'succeeded',arguments:{query:'research'},result:'Three posts'}]};value={runId:'run'};}
 }
 else if(url.pathname.endsWith('/cancel')){run={...run,status:'cancelled',pending:undefined};value={};}
 else if(url.pathname.endsWith('/revise')){let body='';for await(const chunk of req)body+=chunk;const data=JSON.parse(body);assert.equal(data.approvalId,'approval');run={...run,pending:{...run.pending,id:'revised',arguments:data.arguments}};value={};}
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
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
const base=`http://127.0.0.1:${(server.address() as any).port}`;
const card=()=>page.locator('[data-supervised-run=run]');
const feedback=()=>card().locator('[data-run-feedback]');
const refresh=async()=>{const previous=await card().elementHandle();await page.locator('#refresh').click();await page.waitForFunction(el=>!el!.isConnected,previous);};
const badge=()=>page.locator('[data-approval-count]');
try {
 page.setDefaultTimeout(10000);
 pastRuns.push({...run,id:'cancelled',status:'cancelled',outcome:'not_met',evaluation:{status:'fail'}}, {...run,id:'running',status:'executing',pending:undefined}, {...run,id:'missing',pending:undefined});
 await page.goto(base+'/agents?workspace=acme&approval=run#approvals');
 await page.getByRole('button',{name:'Approve and execute',exact:true}).waitFor();
 assert.equal(await badge().innerText(),'1');
 assert.equal(await page.locator('[data-stage=approvals]').getAttribute('aria-current'),'page');
 assert.equal(await page.locator('#agents').isVisible(),false);
 assert.equal(await page.locator('#runs article:visible').count(),1);
 assert.equal(await page.locator('[data-run-group]:visible').count(),0);
 assert.match(await card().innerText(),/"query": "research"/);
 assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-supervised-run')),'run');
 run={...run,id:'replacement'};await page.locator('#refresh').click();
 await page.getByText('This request is unavailable in this workspace’s retained history.',{exact:false}).waitFor();
 assert.equal(await page.locator('[data-supervised-run=replacement]').isVisible(),true);
 assert.notEqual(await page.evaluate(()=>document.activeElement?.getAttribute('data-supervised-run')),'replacement');
 run={...run,id:'run'};await page.locator('#refresh').click();await card().waitFor();
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'/tmp/aa308-approvals-mobile.png',fullPage:true});
 await card().getByRole('button',{name:'Approve and execute',exact:true}).click();
 await feedback().filter({hasText:'Executing the approved call'}).waitFor();
 assert.equal(await card().getByRole('button',{name:'Executing…',exact:true}).isDisabled(),true);
 assert.ok(release);release!();release=undefined;
 await feedback().filter({hasText:'No tool call was sent'}).waitFor();
 assert.equal(await badge().innerText(),'1');
 await card().getByText('Adjust tool arguments',{exact:true}).click();
 await card().getByRole('textbox',{name:'Revised tool arguments',exact:true}).fill('{"query":"brand mentions"}');
 await card().getByRole('button',{name:'Save revised call',exact:true}).click();
 await feedback().filter({hasText:'Proposal revised'}).waitFor();
 assert.match(await card().innerText(),/brand mentions/);
 fail=false;
 await card().getByRole('button',{name:'Approve and execute',exact:true}).click();
 await page.locator('#queue-status').filter({hasText:'Action processed'}).waitFor();
 assert.equal(await badge().innerText(),'0');
 assert.equal(await page.locator('#runs article:visible').count(),0);
 assert.match(await page.locator('#queue-status').innerText(),/No pending approvals/);
 await page.getByRole('link',{name:'View updated run →',exact:true}).click();
 await card().waitFor();assert.match(await card().innerText(),/Found three relevant posts/);
 await page.reload();await card().waitFor();assert.equal(await card().isVisible(),true);
 await page.goto(base+'/agents?workspace=acme&approval=cancelled#approvals');
 await page.getByText('This request is no longer awaiting approval (cancelled).',{exact:false}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Approve and execute',exact:true}).count(),0);
 await page.getByRole('link',{name:'View this run →',exact:true}).click();
 await page.locator('[data-supervised-run=cancelled]').waitFor();
 assert.equal(await page.locator('[data-supervised-run=cancelled]').isVisible(),true);
 await page.goto(base+'/agents?workspace=acme&approval=absent#approvals');
 await page.getByText('This request is unavailable in this workspace’s retained history.',{exact:false}).waitFor();
 run={...run,status:'awaiting_approval',pending:{id:'approval',tool:'search',arguments:{query:'research'}},events:[]};
 await page.reload();await card().waitFor();
 assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-supervised-run')),null,'Missing request must not focus a different approval');
 await card().getByRole('button',{name:'Cancel run',exact:true}).click();
 await page.locator('#queue-status').filter({hasText:'Run cancelled.'}).waitFor();assert.equal(await badge().innerText(),'0');
 // Read failures are unknown, never a false zero; refresh remains available.
 unavailable=true;await page.locator('#refresh').click();
 await page.getByText('Approvals could not be loaded. Refresh to retry; the queue may contain pending actions.',{exact:true}).waitFor();
 assert.equal(await badge().innerText(),'?');
 assert.equal(await page.locator('#runs article').count(),0);
 await page.reload();await page.getByText('Approvals could not be loaded. Refresh to retry; the queue may contain pending actions.',{exact:true}).waitFor();
 assert.equal(await badge().innerText(),'?');assert.equal(await page.locator('#refresh').isVisible(),true);
 unavailable=false;await page.locator('#refresh').click();await page.getByText('No pending approvals. New proposed actions will appear here.',{exact:true}).waitFor();
 run={...run,status:'awaiting_approval',pending:{id:'approval',tool:'search',arguments:{}}};role='viewer';
 await page.reload();await page.getByText('Workspace ready · viewer',{exact:true}).waitFor();
 assert.equal(await card().getByRole('button',{name:'Approve and execute',exact:true}).isDisabled(),true);
 assert.equal(await card().getByRole('button',{name:'Cancel run',exact:true}).isDisabled(),true);
 assert.match(await page.locator('#runs-description').innerText(),/operator or owner/);
 // A late old-workspace read cannot repopulate either the queue or badge.
 delayState=true;await page.locator('#refresh').click();await page.locator('#workspace').selectOption('beta');
 await page.getByText('Workspace ready · viewer',{exact:true}).waitFor();await page.waitForTimeout(650);
 assert.equal(await badge().innerText(),'0');assert.equal(await page.locator('#runs article').count(),0);
 assert.equal(await page.locator('[data-stage=approvals]').getAttribute('href'),'/agents?workspace=beta#approvals');
 assert.equal(approvals,2);assert.deepEqual(errors,[]);
 console.log('Approval queue acceptance passed: exact deep links, actionable-only queue, revise/approve/cancel feedback, stale and absent requests, role controls, mobile, errors and workspace race isolation.');
} finally {release?.();await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
