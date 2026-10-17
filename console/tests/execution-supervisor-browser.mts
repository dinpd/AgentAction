import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import worker from '../src/worker.ts';
import { DEFAULT_SUPERVISOR_LIMITS } from '../src/execution-supervisor.ts';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const env={CONSOLE_ENABLE_MOCK_IDENTITY:'true',CONSOLE_ENVIRONMENT:'development',CONSOLE_MOCK_SUBJECT:'test',CONSOLE_MOCK_TENANT_ID:'acme'};
let role='owner',version=0,saves=0,fail=false;
let limits={...DEFAULT_SUPERVISOR_LIMITS};
const agent={id:'agent',title:'Synthetic refund',goal:'Refund one synthetic payment',success:'Provider result',status:'draft',connectionId:'server',tools:['refund']};
const connection={id:'server',label:'Synthetic provider',status:'connected',endpoint:'https://example.com/mcp',tools:[{name:'refund',inputSchema:{type:'object'}}],suggestions:[]};
const run={id:'run',agentId:'agent',kind:'trial',status:'interrupted',startedAt:new Date().toISOString(),events:[{actionId:'action-1',tool:'refund',arguments:{amount:10},status:'uncertain'}],summary:'Provider result unknown; automatic redispatch blocked.',supervisor:{policyVersion:0,limits:{...limits,maxCalls:1},actions:[{id:'action-1',state:'uncertain',expiresAt:'2026-10-18T00:00:00Z'}],journal:[{sequence:1,actionId:'action-1',state:'dispatch_claimed',at:new Date().toISOString()},{sequence:2,actionId:'action-1',state:'uncertain',reason:'restart',at:new Date().toISOString()}]}};
const server=createServer(async(req,res)=>{
  const url=new URL(req.url!,'http://localhost');
  if(!url.pathname.startsWith('/api/')){const out=await worker.fetch(new Request('https://console.test'+url.pathname+url.search),env);res.statusCode=out.status;out.headers.forEach((value,key)=>res.setHeader(key,value));res.end(Buffer.from(await out.arrayBuffer()));return;}
  let value:any={};
  if(url.pathname==='/api/console/session')value={tenant_id:'acme',email:'owner@example.com',memberships:[{tenant:{tenant_id:'acme',display_name:'Acme'},membership:{role}}]};
  else if(url.pathname==='/api/agents/acme/state')value={connections:[connection],agents:[agent],runs:[run],supervisorPolicy:{version,limits}};
  else if(url.pathname.endsWith('/state'))value={jobs:[],runs:[],settings:{}};
  else if(url.pathname.endsWith('/supervisor-settings')){
    let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body);
    assert.equal(input.scope,'workspace');assert.equal(input.expectedVersion,version);saves++;
    if(fail){res.statusCode=409;value={error:'Supervisor settings changed; refresh the current version.'};}
    else {limits={...limits,...input.limits};version++;value={version,limits};}
  }
  else if(url.pathname.endsWith('/setup'))value={membership:{role},sources:[]};
  else if(url.pathname.endsWith('/evals'))value={schema_version:'agentaction.tenant-evals.v1',definitions:[],assignments:[]};
  res.setHeader('content-type','application/json');res.end(JSON.stringify(value));
});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1050}}),errors:string[]=[];
page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
const base=`http://127.0.0.1:${(server.address() as any).port}`;
try {
  await page.goto(base+'/agents?workspace=acme#run');await page.getByText('Execution supervisor settings',{exact:true}).click();
  await page.locator('#supervisor-settings').getByLabel('Maximum tool calls',{exact:true}).fill('2');await page.locator('#supervisor-settings').getByLabel('Approval lifetime (seconds)',{exact:true}).fill('30');
  await page.getByRole('button',{name:'Save supervisor settings',exact:true}).click();
  await page.getByText('Supervisor settings saved. Pending supervised actions were cancelled.',{exact:true}).waitFor();assert.equal(saves,1);assert.equal(limits.maxCalls,2);
  await page.getByText('Execution supervisor settings',{exact:true}).click();
  fail=true;await page.getByRole('button',{name:'Save supervisor settings',exact:true}).click();await page.getByText('Supervisor settings changed; refresh the current version.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Save supervisor settings',exact:true}).isEnabled(),true);
  await page.locator('[data-run-group] > summary').click();
  await page.getByText('Execution supervisor evidence',{exact:true}).click();
  assert.match(await page.locator('[data-execution-supervisor=run]').innerText(),/Action action-1: uncertain/);
  assert.match(await page.locator('[data-supervised-run=run]').innerText(),/1\/1 tool calls/);
  assert.doesNotMatch(await page.locator('[data-supervised-run=run]').innerText(),/1\/4 tool calls/);
  assert.equal(await page.getByRole('button',{name:'Approve and execute',exact:true}).count(),0);
  await page.screenshot({path:'/tmp/agentaction-372-supervisor-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'/tmp/agentaction-372-supervisor-mobile.png',fullPage:true});
  role='viewer';await page.reload();await page.getByText('Execution supervisor settings',{exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Save supervisor settings',exact:true}).isDisabled(),true);assert.equal(await page.locator('#supervisor-settings').getByLabel('Maximum tool calls',{exact:true}).isDisabled(),true);
  assert.deepEqual(errors,[]);console.log('Supervisor browser acceptance passed: owner settings, versioned saves, conflict feedback, viewer restrictions, action/recovery evidence and mobile layout.');
} finally {await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
