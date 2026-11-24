import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import worker from '../src/worker.ts';
import demoWorker from '../src/demo-worker.ts';
import { bindRecipeEval, issueHostedContract, evaluateHostedRun, rubricAssessment } from '../src/recipe-evaluation.ts';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const env={CONSOLE_ENABLE_MOCK_IDENTITY:'true',CONSOLE_ENVIRONMENT:'development',CONSOLE_MOCK_SUBJECT:'test',CONSOLE_MOCK_TENANT_ID:'acme'};
let mode='success',isDemo=false,posts=0,delayed=false,recurringError=false,privateReads=0,role='owner';
const stamp=Date.now();
const recurring=(tenant:string)=>({jobs:tenant==='beta'||mode==='empty'?[]:[{id:'watch',title:'Website <img src=x onerror=alert(1)>',status:'active',health:mode==='stale'?'unknown':'checks complete',stale:mode==='stale',intervalMinutes:5,lastRun:stamp,nextRun:stamp+300000}],runs:tenant==='beta'||mode==='empty'?[]:Array.from({length:45},(_,i)=>({id:'check-'+i,jobId:'watch',startedAt:stamp+i*1000,finishedAt:stamp+i*1000+250,evidenceDigest:'digest-'+i,observations:[{key:'availability',state:'absent'}],status:i===43?'partial':i===42?'interrupted':'completed',kind:'scheduled',findings:i===41?1:0,summary:'Check '+i+'; HTTP 200'}))});
const connection={id:'c',status:'connected',label:'Test account',endpoint:'https://example.com/mcp',tools:[],suggestions:[{id:'s',title:'Daily check',goal:'Check a page',success:'Report changes',tools:[],setupHints:[],setup:'Page URL'}]};
const agent={id:'agent',title:'Daily check',goal:'Check a page',success:'Report changes',status:'draft',connectionId:'c'};
const baseState=(tenant:string)=>({connections:tenant==='beta'||mode==='empty'||mode==='recurring'?[]:[{...connection,hasCredential:mode==='success'}],agents:['draft','pending','success'].includes(mode)&&tenant!=='beta'?[agent]:[],runs:tenant==='beta'?[]:mode==='pending'?[{id:'run',agentId:'agent',kind:'trial',status:'awaiting_approval',startedAt:new Date(stamp-100000).toISOString(),events:[],pending:{id:'p',tool:'read',arguments:{}}}]:mode==='success'?[{id:'run',agentId:'agent',kind:'trial',status:'completed',outcome:'met',startedAt:new Date(stamp-100000).toISOString(),events:[]}]:[],endpointAccess:{deployment:[],workspace:[]},inspections:[]});
let statusRuns:any[]=[];
// Run detail fixtures are produced by the hosted evaluator itself, so the page is tested against the shape the runtime stores.
const scannerDefinition={title:'Social media scanner',goal:'Find recent posts that ask about retirement planning tools',inputGuide:'Topic',instructions:'Search, then read the most relevant post.',boundaries:'Read only; never reply or post.',success:'A short list of relevant posts with links',tools:['search_posts','get_post','publish_reply'],evaluation:{version:1 as const,
 checks:[{id:'searched',label:'Search ran successfully',kind:'tool_succeeded' as const,tool:'search_posts'},{id:'found',label:'At least 3 posts returned',kind:'result_field' as const,tool:'search_posts',path:'total',operator:'gte' as const,value:3},{id:'no_reply',label:'Nothing was posted',kind:'tool_not_called' as const,tool:'publish_reply'}],
 rubrics:[{id:'relevant',label:'Relevant findings',criterion:'At least 80% of reported posts ask about retirement planning tools.',measurement:{method:'Relevant reported posts divided by all reported posts.',evidence:'Final answer and search results.'}}]}};
const scannerBinding=(await bindRecipeEval(scannerDefinition))!;
const scanner={id:'scanner',title:scannerDefinition.title,goal:scannerDefinition.goal,success:scannerDefinition.success,status:'draft',connectionId:'c',evaluationBinding:scannerBinding};
async function scannerRun(id:string,minutesAgo:number,total:number,note:string,assessment?:{status:string;reason:string;observed:string},outcome:[string,string]=['met','Found posts that match the topic.']) {
 const at=(seconds:number)=>new Date(stamp-minutesAgo*60000+seconds*1000).toISOString(),approval=(n:number)=>({id:'approval-'+n,actor:'owner@example.com',at:at(n)});
 const run:any={id,agentId:'scanner',kind:'trial',actor:'owner@example.com',status:'completed',startedAt:at(0),finishedAt:at(9),tokens:1840,summary:`Found ${total} posts about retirement planning tools; the most relevant asks for a comparison of calculators.`,outcome:outcome[0],reason:outcome[1],events:[
  {tool:'search_posts',arguments:{query:'retirement planning tools',limit:10},status:'succeeded',durationMs:812,approval:approval(1),result:JSON.stringify({content:[{type:'text',text:'Search results'+note}],structuredContent:{total}})},
  {tool:'get_post',arguments:{id:'post-1'},status:'succeeded',durationMs:240,approval:approval(4),result:JSON.stringify({content:[{type:'text',text:'Which retirement calculator do you trust?'}]})}]};
 run.contract=await issueHostedContract(scannerBinding,run,{id:'scanner',goal:scannerDefinition.goal,setup:'retirement planning tools',connectionId:'c'});
 if(assessment)run.rubricAssessment=await rubricAssessment({criteria:[{id:'relevant',...assessment,calls:[0]}]},run);
 run.evaluation=await evaluateHostedRun(run);return run;
}
const detailRuns=[
 await scannerRun('scan-undetermined',-4,5,' [truncated]'),
 await scannerRun('scan-failed',-3,2,'',{status:'fail',reason:'Only one of the two reported posts asks about retirement planning tools.',observed:'1 / 2 relevant (50%)'},['not_met','Too few relevant posts were found.']),
 await scannerRun('scan-met',-2,5,'',{status:'pass',reason:'All five reported posts ask about retirement planning tools.',observed:'5 / 5 relevant (100%)'}),
];
let detail=false;
const state=(tenant:string)=>{const data:any=baseState(tenant);if(tenant==='acme'){data.runs.push(...statusRuns);if(detail){data.agents.push(scanner);data.runs.push(...detailRuns);}}return data;};
const tenantSetup=JSON.parse(await readFile(new URL('../fixtures/tenant-setup.v1.json',import.meta.url),'utf8'));
const setup=(tenant:string)=>({...tenantSetup,tenant_id:tenant,membership:{role}});
const receipt=JSON.parse(await readFile(new URL('../fixtures/support-refund-job-detail.json',import.meta.url),'utf8'));
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
 else if(url.pathname.includes('/intent-quality/jobs/'))value=receipt;
 else if(url.pathname.includes('/intent-quality/jobs'))value={schema_version:'agentpass.intent-quality-jobs.v1',tenant_id:url.pathname.split('/')[4],jobs:url.pathname.includes('/acme/')?[receipt.job]:[],matched_records:1,pagination:{next_cursor:null}};
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
 assert.equal(await page.locator('#runs [data-run-at]').count(),41,'Recent checks also retain the latest result for every agent');
 assert.equal(await page.locator('#runs [data-run-group][open]').count(),0);
 assert.match(await page.locator('#runs article').first().textContent(),/Check 44/);
 await page.screenshot({path:'/tmp/agentaction-217-run.png',fullPage:false});
 mode='pending';await page.reload();await page.getByRole('button',{name:'Approve and execute',exact:true}).waitFor();
 assert.equal(await page.locator('#runs [data-run-at]').count(),41,'Keep an older pending approval beyond recent checks');
 assert.equal(await page.locator('#runs article').first().getAttribute('data-pending-approval'),'true');
 assert.equal(await page.locator('#runs [data-run-attention] button').filter({hasText:'Approve and execute'}).isVisible(),true);
 delayed=true;await page.locator('#refresh').click();await page.locator('#workspace').selectOption('beta');
 await page.getByText('Choose an agent template or an AI suggestion in Create to build your first agent.',{exact:true}).waitFor();
 await page.waitForTimeout(650);assert.equal(await page.locator('#agents [data-recurring-agent]').count(),0);
 delayed=false;mode='recurring';await page.goto(base+'/?workspace=acme#overview');
 await page.getByRole('heading',{name:'Your recurring agents are checking in',exact:true}).waitFor();
 assert.match(await page.locator('.journey-track').innerText(),/1 agent/);
 await page.locator('[data-journey-next]').click();await page.locator('[data-agent-key]').waitFor();
 assert.equal(await page.locator('[data-agent-key]').count(),1);
 assert.equal(await page.locator('[data-agent-key][open]').count(),0,'History starts collapsed');
 assert.equal(await page.locator('[data-agent-key] summary').getByText('completed',{exact:true}).count(),1);
 await page.locator('[data-agent-key] > summary').click();
 assert.equal(await page.locator('[data-agent-key] tbody tr').count(),10);
 assert.match(await page.locator('[data-agent-key] tbody tr').first().innerText(),/Check 44/);
 assert.match(await page.locator('[data-agent-key] tbody tr').first().innerText(),/250 ms/);
 await page.locator('[data-agent-key]').getByRole('button',{name:'Next',exact:true}).click();
 assert.match(await page.locator('[data-agent-key] tbody tr').first().innerText(),/Check 34/);
 await page.getByLabel('Execution status',{exact:true}).selectOption('attention');
 await page.locator('[data-agent-key] > summary').click();
 assert.equal(await page.locator('[data-agent-key] tbody tr').count(),3,'Partial, interrupted and finding checks');
 await page.getByLabel('Layout',{exact:true}).selectOption('list');
 assert.equal(await page.locator('[data-hosted-runs] tbody tr').count(),3);
 await page.getByLabel('Execution status',{exact:true}).selectOption('');
 await page.locator('[data-hosted-runs]').getByRole('button',{name:'Next',exact:true}).click();
 assert.match(await page.locator('[data-hosted-runs] tbody tr').first().innerText(),/Check 34/);
 await page.locator('[data-hosted-runs]').getByRole('button',{name:'Previous',exact:true}).click();
 await page.locator('[data-hosted-runs] tbody tr').first().getByRole('link',{name:'View job →',exact:true}).click();
 await page.locator('[data-job-detail="recurring:check-44"]').waitFor();
 assert.equal(await page.locator('[data-job-detail="recurring:check-44"]').getAttribute('open'),'');
 assert.match(await page.locator('[data-hosted-jobs]').innerText(),/Recorded check/);
 assert.match(await page.locator('[data-hosted-jobs]').innerText(),/digest-44/);
 assert.match(await page.locator('[data-hosted-jobs]').innerText(),/No signed gateway receipt/);
 assert.equal(await page.locator('[data-hosted-jobs] tbody tr').count(),1);
 assert.equal(new URL(page.url()).searchParams.get('execution'),'recurring:check-44');
 await page.reload();await page.locator('[data-job-detail="recurring:check-44"]').waitFor();
 await page.getByLabel('Exact hosted job ID',{exact:true}).fill('recurring:no-longer-retained');
 await page.getByText('No executions match these filters.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();
 assert.equal(await page.locator('[data-hosted-jobs] tbody tr').count(),10);assert.equal(new URL(page.url()).searchParams.has('execution'),false);
 await page.getByLabel('Execution status',{exact:true}).selectOption('partial');
 await page.locator('[data-job-detail="recurring:check-43"] > summary').click();
 assert.match(await page.locator('[data-job-detail="recurring:check-43"]').innerText(),/Coverage is unknown/);
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();
 await page.screenshot({path:'/tmp/agentaction-219-jobs.png',fullPage:false});
 await page.locator('[data-jobs-list]').getByRole('link',{name:'Open finalized detail for job '+receipt.job.job_id,exact:true}).click();await page.locator('[data-job-detail-content]').waitFor();assert.equal(new URL(page.url()).hash,'#job-detail');
 await page.goto(base+'/?workspace=acme#jobs');await page.locator('[data-hosted-jobs] tbody tr').first().waitFor();
 delayed=true;await page.getByRole('button',{name:'Refresh hosted jobs',exact:true}).click();await page.locator('[data-tenant-select]').selectOption('beta');
 await page.getByText('No executions recorded yet. Create an agent and run a baseline or trial.',{exact:true}).waitFor();
 await page.waitForTimeout(650);assert.equal(await page.locator('[data-hosted-jobs] tbody tr').count(),0);delayed=false;
 mode='pending';await page.goto(base+'/?workspace=acme#activity');await page.locator('[data-agent-key]').first().waitFor();
 assert.equal(await page.locator('[data-approval-count]').innerText(),'1');
 const approvalLink=page.locator('[data-agent-key="supervised:agent"] > summary').getByRole('link',{name:'Review action →',exact:true});
 assert.equal(await approvalLink.getAttribute('href'),'/agents?workspace=acme&approval=run#approvals');
 await approvalLink.click();await page.getByRole('button',{name:'Approve and execute',exact:true}).waitFor();
 assert.equal(new URL(page.url()).hash,'#approvals');
 assert.equal(await page.locator('#runs article:visible').count(),1);
 await page.goto(base+'/?workspace=acme#activity');await page.locator('[data-agent-key]').first().waitFor();
 assert.equal(await page.locator('[data-agent-key]').count(),2);
 assert.match(await page.locator('[data-agent-key] > summary').first().innerText(),/Awaiting your approval/);
 await page.getByLabel('Hosted agent',{exact:true}).selectOption('recurring:watch');assert.equal(await page.locator('[data-agent-key]').count(),1);
 assert.equal(await page.locator('[data-hosted-history] img').count(),0);
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();
 await page.screenshot({path:'/tmp/agentaction-219-activity.png',fullPage:false});
 await page.route('**/activity/events?**', route=>route.fulfill({status:503,json:{error:'External feed unavailable'}}));
 await page.reload();await page.getByText('External activity is unavailable',{exact:true}).waitFor();
 await page.locator('[data-agent-key]').first().waitFor();assert.equal(await page.locator('[data-agent-key]').count(),2);
 await page.unroute('**/activity/events?**');
 delayed=true;await page.getByRole('button',{name:'Refresh agent runs',exact:true}).click();await page.locator('[data-tenant-select]').selectOption('beta');
 await page.getByText('No executions recorded yet. Create an agent and run a baseline or trial.',{exact:true}).waitFor();
 await page.waitForTimeout(650);assert.equal(await page.locator('[data-agent-key]').count(),0);delayed=false;
 await page.locator('[data-tenant-select]').selectOption('acme');await page.locator('[data-agent-key]').first().waitFor();
 recurringError=true;await page.getByRole('button',{name:'Refresh agent runs',exact:true}).click();
 await page.getByText(/Recurring execution history is unavailable/).waitFor();
 assert.equal(await page.locator('[data-agent-key]').count(),1,'A failed recurring source preserves supervised results');
 await page.goto(base+'/?workspace=acme#jobs');await page.getByText(/Recurring execution history is unavailable/).waitFor();assert.equal(await page.locator('[data-hosted-jobs] tbody tr').count(),1);
 await page.goto(base+'/agents?workspace=acme#run');await page.getByText('Recurring agents are unavailable. Refresh to retry.',{exact:true}).waitFor();
 recurringError=false;mode='stale';await page.goto(base+'/?workspace=acme#activity');await page.locator('[data-agent-key]').first().waitFor();assert.match(await page.locator('[data-agent-key] > summary').innerText(),/Coverage unknown/);
 mode='success';await page.goto(base+'/?workspace=acme#jobs');await page.locator('[data-hosted-jobs] tbody tr').first().waitFor();
 await page.getByLabel('Hosted agent',{exact:true}).selectOption('supervised:agent');
 assert.equal(await page.locator('[data-hosted-jobs] tbody tr').count(),1);assert.match(await page.locator('[data-hosted-jobs]').innerText(),/Recorded tool execution/);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('[data-hosted-jobs]').screenshot({path:'/tmp/agentaction-219-jobs-mobile.png'});
 await page.goto(base+'/?workspace=acme#activity');await page.locator('[data-agent-key]').first().waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('[data-hosted-history]').screenshot({path:'/tmp/agentaction-219-activity-mobile.png'});
 statusRuns=[
  {id:'cancelled',status:'cancelled',outcome:'not_met',evaluation:{status:'fail'}},
  {id:'executing',status:'executing'},
  {id:'planning',status:'planning'},
  {id:'insufficient',status:'completed',evaluation:{status:'insufficient_evidence'}},
  {id:'failed-checks',status:'completed',evaluation:{status:'fail'}},
 ].map((r,i)=>({...r,agentId:'agent',kind:'trial',startedAt:new Date(stamp+i*1000).toISOString(),events:[]}));
 await page.goto(base+'/?workspace=acme#activity');await page.locator('[data-agent-key]').first().waitFor();
 await page.getByLabel('Layout',{exact:true}).selectOption('list');
 await page.getByLabel('Hosted agent',{exact:true}).selectOption('supervised:agent');
 for(const [id,label] of [['cancelled','Cancelled'],['executing','Executing approved action'],['planning','Preparing next action'],['insufficient','Insufficient evidence'],['failed-checks','Checks failed']]) {
  assert.equal(await page.locator(`[data-execution-id="supervised:${id}"] .execution-status`).innerText(),label);
 }
 assert.equal(await page.locator('[data-execution-id="supervised:cancelled"]').getAttribute('data-attention'),'false');
 assert.equal(await page.locator('[data-execution-id="supervised:insufficient"]').getAttribute('data-attention'),'true');
 statusRuns=[];
 detail=true;mode='success';await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/agents?workspace=acme&run=scan-undetermined#run');
 const group=page.locator('[data-run-group="supervised:scanner"]');await group.waitFor();await group.evaluate((el:HTMLDetailsElement)=>el.open=true);
 assert.match(await group.locator('> summary').innerText(),/3 runs · Latest: completed · outcome could not be determined/,'The collapsed group already separates execution from outcome');
 const card=page.locator('[data-supervised-run=scan-undetermined]'),result=card.locator('[data-run-result]'),contract=detailRuns[0].contract.intent,evaluation=detailRuns[0].evaluation;
 assert.equal(evaluation.status,'insufficient_evidence');assert.equal(await result.getAttribute('data-run-result'),'undetermined');
 assert.match(await card.locator('.pill').innerText(),/^run finished$/i);
 const facts=await result.locator('.run-facts').innerText();
 assert.match(facts,/Outcome could not be determined\s*The run finished, but 1 of 10 checks could not be measured\./);
 assert.match(facts,/Relevant findings: The AI assessment was skipped or returned nothing usable; a tool result may have been an error or truncated\. Check the tool calls, then run another trial\./);
 assert.match(facts,/2 recorded tool calls: search_posts, get_post\. All succeeded\./);assert.match(facts,/Found 5 posts/);
 assert.equal(await result.locator('.run-checks li').count(),evaluation.criteria.length+1,'Every recorded check and the agent’s own assessment have a row');
 for(const [id,status,trust] of [['run_completed','pass','Runtime-recorded'],['found','pass','Provider-reported'],['relevant','not_measured','AI-assessed'],['outcome','pass','AI-assessed']]) {
  const row=result.locator(`[data-check=${id}]`);assert.equal(await row.getAttribute('data-check-status'),status);assert.equal(await row.locator('.check-trust').innerText(),trust);
 }
 assert.equal(await result.locator('.run-checks li').first().getAttribute('data-check'),'relevant','The check that needs attention is listed first');
 assert.equal(await result.locator('[data-run-audit]').getAttribute('open'),null,'Audit material starts collapsed');
 const firstRead=await card.innerText();
 for(const hidden of [contract.intent_digest,contract.profile_digest,evaluation.evidence_digest,evaluation.source_digest,contract.intent_id,'selected evidence','"expected"','not a signed gateway receipt']) assert.ok(!firstRead.includes(hidden),'Not in the first read: '+hidden);
 await page.screenshot({path:'/tmp/agentaction-434-run-detail.png',fullPage:true});
 await result.locator('summary').filter({hasText:'Audit details'}).click();const audit=await result.locator('[data-run-audit]').innerText();
 for(const kept of ['Contract & evaluation · insufficient evidence','Contract: '+contract.intent_id,'Profile: '+contract.profile,'Contract digest: '+contract.intent_digest,'Profile digest: '+contract.profile_digest,'Evidence digest: '+evaluation.evidence_digest,'Recorded source digest: '+evaluation.source_digest,'not a signed gateway receipt','any selected evidence satisfied gte','The required evidence is missing, incomplete or unavailable.','Pass threshold / rule: At least 80%','Observed measurement: Unavailable','Inspect frozen contract']) assert.ok(audit.includes(kept),'Audit details keep: '+kept);
 assert.match(audit,/"expected": 3,\s+"actual": 5/);assert.equal(await result.locator('[data-run-audit] .evaluation-criterion').count(),evaluation.criteria.length);
 await card.screenshot({path:'/tmp/agentaction-434-run-audit.png'});
 const failed=page.locator('[data-supervised-run=scan-failed] [data-run-result=not_met]');
 assert.match(await failed.locator('.run-facts').innerText(),/Outcome not met\s*The run finished, but 3 of 10 checks failed\./);
 assert.match(await failed.locator('.run-facts').innerText(),/At least 3 posts returned: Expected at least 3; search_posts reported 2\./);
 assert.match(await failed.locator('[data-check=relevant]').innerText(),/Only one of the two reported posts.*Measured: 1 \/ 2 relevant \(50%\)/s);
 assert.match(await page.locator('[data-supervised-run=scan-met] [data-run-result=met] .run-facts').innerText(),/Outcome met\s*The run finished and all 10 checks passed\./);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Run detail and open audit fit a phone');
 await card.screenshot({path:'/tmp/agentaction-434-run-detail-mobile.png'});await page.setViewportSize({width:1440,height:1000});
 await page.goto(base+'/?workspace=acme&execution='+encodeURIComponent('supervised:scan-undetermined')+'#jobs');const job=page.locator('[data-job-detail="supervised:scan-undetermined"]');
 await job.locator('[data-run-result=undetermined]').waitFor();assert.match(await job.innerText(),/2 recorded tool calls\./);assert.ok(!(await job.innerText()).includes(contract.intent_digest));
 await job.locator('summary').filter({hasText:'Audit details'}).click();assert.ok((await job.innerText()).includes(contract.intent_digest));
 await page.goto(base+'/?workspace=acme#evals');await page.locator('[data-hosted-evals] [data-run-result=undetermined]').waitFor();
 role='viewer';await page.goto(base+'/agents?workspace=acme#run');await page.getByText('Workspace ready · viewer',{exact:true}).waitFor();await group.evaluate((el:HTMLDetailsElement)=>el.open=true);
 assert.match(await page.locator('[data-supervised-run=scan-undetermined] .run-facts').innerText(),/Outcome could not be determined/);assert.equal(await page.locator('#runs .run-result').locator('button,input,textarea,select').count(),0,'The result is read-only for every role');
 detail=false;await page.reload(); // the next step opens this same URL, which would not reload the fixture
 role='viewer';await page.goto(base+'/agents?workspace=acme#run');await page.getByText('Workspace ready · viewer',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Run a trial',exact:true}).isDisabled(),true);assert.equal(await page.locator('#agents [data-recurring-agent]').count(),1);
 isDemo=true;const before=privateReads;await page.goto(base+'/#activity');await page.locator('[data-console-view=activity]').waitFor();
 assert.equal(await page.locator('[data-hosted-history]').isHidden(),true);assert.equal(privateReads,before,'Demo never reads private runtime data');
 await page.goto(base+'/#jobs');await page.locator('[data-console-view=jobs]').waitFor();assert.equal(await page.locator('[data-hosted-jobs]').isHidden(),true);assert.equal(privateReads,before);
 assert.equal(posts,0,'Viewing and refreshing never executes a check or mutates agents');assert.deepEqual(errors,[]);
 console.log('Compact execution and hosted Jobs acceptance passed: mixed and recurring-only workspaces, ordering, approvals, stale coverage, isolation, failure, mobile, demo and read-only navigation.');
}catch(error){console.error({mode,errors,body:await page.locator('body').innerText()});throw error;}finally{await browser.close();server.close();}
