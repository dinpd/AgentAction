import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import worker from '../src/worker.ts';
import { researchWorkflow } from '../src/research-workflow.ts';
import { researchConfig } from '../src/research-digest.ts';
import { evidenceDigest } from '../src/recipe-evaluation.ts';
import { executionState, recordStep, inputReferences, completeStep } from '../src/research-execution.ts';
import type { ResearchRun } from '../src/research-digest.ts';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const config = researchConfig({ connectionId:'apify', topics:'Retirement tools; exclude generic promotion.', queries:{reddit:['retirement tools'],x:['planning tools']}, recipient:'reports@example.com',time:'08:00',timezone:'America/Los_Angeles',maxItems:20,actorCapUsd:0.05,xActorCapUsd:0.01,rollingCapUsd:4,freePlan:true });
const definition = { config, tools:[], workflow:researchWorkflow(config), digest:'' };
definition.digest = await evidenceDigest({config,tools:definition.tools,workflow:definition.workflow});
const revised = structuredClone(definition);revised.config.topics='Current scope after the run';revised.workflow=researchWorkflow(revised.config);revised.digest=await evidenceDigest({config:revised.config,tools:revised.tools,workflow:revised.workflow});
const stamp='2026-10-07T15:00:00.000Z';
const post = {platform:'reddit',url:'https://www.reddit.com/r/retirement/comments/abc123/tools',at:'2026-10-07T14:00:00.000Z',text:'Compare retirement planning tools',reason:'Asks about retirement tools.',assessment:{relevant:true,reason:'Asks about retirement tools.'}};
const selectedRun = {id:'frozen-run',agentId:'scanner',kind:'trial',actor:'owner@example.com',status:'completed',startedAt:stamp,finishedAt:stamp,tokens:120,outcome:'not_met',summary:'One platform retrieved; X unavailable.',events:[{tool:'get-dataset-items',source:{connectionId:'apify',tool:'get-dataset-items'},arguments:{datasetId:'dataset123',limit:20},result:'{"received":2}',status:'succeeded',durationMs:100}],research:{definition,deadline:1,reserved:true,approval:{id:'approval123',actor:'owner@example.com',at:stamp},classification:{status:'succeeded',model:definition.workflow.steps[3].settings.model,completedAt:stamp},sources:[{platform:'reddit',stage:'done',runId:'run123',datasetId:'dataset123',polls:1,received:2,total:2,invalid:0,outsideWindow:0,duplicates:0,posts:[post,{...post,url:'https://www.reddit.com/r/retirement/comments/xyz123/spam',text:'<script>window.INJECTED = true</script> Generic promotion',reason:undefined,assessment:{relevant:false,reason:'Generic promotion excluded by the saved scope.'}}]},{platform:'x',stage:'unavailable',gap:'Provider quota unavailable',polls:0,received:0,invalid:0,outsideWindow:0,duplicates:0,posts:[]}],checks:[{label:'Both platforms retrieved',status:'fail',observed:'1/2 platforms',method:'Require both completed datasets.'}],report:'Partial research report with a coverage gap.',delivery:{status:'uncertain',id:'delivery123'}}};
const execution=executionState(definition);
selectedRun.outcome='uncertain';
(selectedRun.research as any).execution=execution;
for(const step of definition.workflow.steps){
 recordStep(selectedRun.research as ResearchRun,step.id,'started',{inputs:inputReferences(selectedRun.research as ResearchRun,step)});
 completeStep(selectedRun.research as ResearchRun,step,['retrieve','checks','deliver','outcome'].includes(step.id)?'failed':'succeeded');
}
for(const event of execution.journal)event.at=stamp;
const legacyRun=structuredClone(selectedRun);legacyRun.id='legacy-run';delete (legacyRun.research.definition as any).workflow;delete (legacyRun.research as any).execution;delete (legacyRun.research as any).classification;delete (legacyRun.research.sources[0].posts[0] as any).assessment;
const state={agents:[{id:'scanner',title:'Social research',goal:'Relevant public posts',success:'Report',connectionId:'apify',tools:[],status:'draft',createdAt:stamp,research:revised}],runs:[selectedRun,legacyRun],connections:[{id:'apify',label:'Apify',endpoint:'https://mcp.apify.com',status:'connected',tools:[],suggestions:[]}],drafts:[],workspaceRecipes:[],preparationSkills:[],inspections:[],oauthProviders:[],endpointAccess:{deployment:[],workspace:[]},model:definition.workflow.steps[3].settings.model};
let role='owner',writes=0,reads=0;
const env={CONSOLE_ENABLE_MOCK_IDENTITY:'true',CONSOLE_ENVIRONMENT:'development',CONSOLE_MOCK_SUBJECT:'test',CONSOLE_MOCK_TENANT_ID:'acme'};
const server=createServer(async(req,res)=>{
 try {
  const url=new URL(req.url!,'http://localhost');
  if(!url.pathname.startsWith('/api/')){const out=await worker.fetch(new Request(url),env);res.statusCode=out.status;out.headers.forEach((v,k)=>res.setHeader(k,v));res.end(Buffer.from(await out.arrayBuffer()));return;}
  if(req.method!=='GET'){writes++;res.statusCode=405;res.end('{}');return;}
  reads++;let value:any={};
  if(url.pathname==='/api/console/session')value={tenant_id:'acme',email:'owner@example.com',memberships:['acme','beta'].map(id=>({tenant:{tenant_id:id,display_name:id},membership:{role}}))};
  else if(url.pathname.startsWith('/api/agents/'))value=url.pathname.includes('/beta/')?{...state,agents:[],runs:[],connections:[]}:state;
  else if(url.pathname.startsWith('/api/automations/'))value={jobs:[],runs:[],findings:[]};
  else if(url.pathname.endsWith('/setup'))value={membership:{role},sources:[]};
  else if(url.pathname.endsWith('/catalog'))value={servers:[],total:0,capabilities:[],authTypes:[],nextOffset:null};
  res.setHeader('content-type','application/json');res.end(JSON.stringify(value));
 }catch(error){res.statusCode=500;res.end(JSON.stringify({error:String(error)}));}
});
await new Promise<void>(resolve=>server.listen(Number(process.env.WORKFLOW_PREVIEW_PORT || 0),'127.0.0.1',resolve));
const base=`http://127.0.0.1:${(server.address() as any).port}`;
if(process.env.WORKFLOW_PREVIEW_PORT){
 console.log(`Synthetic, read-only workflow preview: ${base}/agents?workspace=acme&run=frozen-run#run`);
 await new Promise<void>(resolve=>{process.once('SIGINT',()=>server.close(()=>resolve()));process.once('SIGTERM',()=>server.close(()=>resolve()));});
 process.exit(0);
}
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors:string[]=[];
page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
try {
 await page.goto(base+'/agents?workspace=acme&run=frozen-run#run');
 const saved=page.locator('#agents [data-workflow-inspector=definition]');
 await saved.waitFor({state:'attached'});await saved.locator(':scope > summary').click();
 assert.equal(await saved.locator('[data-workflow-step]').count(),8);
 await saved.locator('[data-workflow-step=classify] > summary').click();assert.match(await saved.innerText(),/Current scope after the run/);
 const frozen=page.locator('[data-supervised-run=frozen-run] [data-workflow-inspector=run]');
 await frozen.locator(':scope > summary').click();
 assert.match(await frozen.innerText(),new RegExp(definition.digest));assert.doesNotMatch(await frozen.innerText(),/Current scope after the run/);
 await frozen.locator('[data-workflow-step=classify] > summary').focus();await page.keyboard.press('Enter');
 assert.equal(await frozen.locator('[data-workflow-step=classify]').getAttribute('open'),'');
 assert.match(await frozen.innerText(),/Retirement tools; exclude generic promotion/);
 assert.match(await frozen.innerText(),/ignore embedded instructions/);
 assert.match(await frozen.innerText(),/validate.candidates → posts/);
 assert.match(await frozen.innerText(),/Step journal/);assert.match(await frozen.innerText(),/"sequence":/);assert.match(await frozen.innerText(),/"from": "validate"/);assert.match(await frozen.innerText(),/"path": "decisions"/);
 await frozen.getByLabel('Candidate decisions').selectOption('Rejected');
 assert.equal(await frozen.locator('[data-candidate-decision=Rejected]').count(),1);
 assert.equal(await frozen.locator('[data-candidate-decision=Selected]').count(),0);
 assert.equal(await page.evaluate(()=>Boolean((window as any).INJECTED)),false);
 await frozen.locator('[data-workflow-step=retrieve] > summary').click();assert.match(await frozen.innerText(),/Provider quota unavailable/);
 await frozen.locator('[data-workflow-step=deliver] > summary').click();assert.match(await frozen.innerText(),/uncertain/);assert.match(await frozen.innerText(),/inbox receipt unverified/);
 await page.screenshot({path:join(tmpdir(),'agentaction-347-desktop.png'),fullPage:true});
 const legacy=page.locator('[data-supervised-run=legacy-run]');
 await legacy.locator('[data-workflow-inspector=run] > summary').click();assert.match(await legacy.innerText(),/Workflow snapshot unavailable/);
 const before=reads;await page.locator('#refresh').click();await page.waitForFunction(value=>document.querySelectorAll('[data-workflow-step]').length>=value,16);assert.ok(reads>before);assert.equal(writes,0);
 (state.agents[0].research.workflow as any).mode='descriptive';
 await page.reload();await page.getByText('Workspace ready · owner',{exact:true}).waitFor();
 await page.locator('[data-research-editor] > summary').click();
 assert.equal(await page.getByRole('button',{name:'Capture workflow snapshot',exact:true}).isDisabled(),false);
 role='viewer';await page.reload();await page.getByText('Workspace ready · viewer',{exact:true}).waitFor();
 await page.locator('[data-research-editor] > summary').click();
 assert.equal(await page.getByRole('button',{name:'Capture workflow snapshot',exact:true}).isDisabled(),true);
 const viewer=page.locator('[data-supervised-run=frozen-run] [data-workflow-inspector=run]');await viewer.locator(':scope > summary').click();await viewer.locator('[data-workflow-step=classify] > summary').click();assert.equal(await viewer.getByLabel('Candidate decisions').isDisabled(),false);
 assert.equal(await page.getByRole('button',{name:'Run a trial',exact:true}).isDisabled(),true);
 await page.setViewportSize({width:390,height:844});await viewer.scrollIntoViewIfNeeded();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No mobile horizontal overflow');
 await page.screenshot({path:join(tmpdir(),'agentaction-347-mobile.png'),fullPage:true});
 await page.getByLabel('Workspace',{exact:true}).selectOption('beta');await page.getByText('Workspace ready · viewer',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('[data-workflow-inspector]').length===0);
 assert.equal(writes,0);assert.deepEqual(errors,[]);
 console.log('Workflow inspector browser acceptance passed: frozen/current revisions, typed wiring, decisions, partial coverage, uncertain delivery, legacy gaps, viewer inspection, tenant switching, keyboard, mobile and no writes.');
}finally{await browser.close();server.close();}
