import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { samplePlan } from '../src/mcp-test-plan.ts';
import { request as httpRequest } from 'node:http';
import { behaviorFixture } from './mcp-test-fixture.mts';

execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/build-test-runner.mjs',import.meta.url))],{stdio:'pipe'});
const dir=await mkdtemp(join(tmpdir(),'agentaction-tester-')),runner=join(dir,'standalone tester.mjs');
await writeFile(runner,await readFile(new URL('../generated/test-runner.txt',import.meta.url)));
const provider=await behaviorFixture(),child=spawn(process.execPath,[runner,'--no-open','--port','0'],{stdio:['ignore','pipe','pipe']});
let output='';const ready=await new Promise<string>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Runner startup timed out')),10000);child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/http:\/\/127\.0\.0\.1:\d+\/#token=[a-f0-9]{64}/);if(match){clearTimeout(timer);resolve(match[0]);}});child.once('exit',()=>reject(new Error('Runner exited')));});
const url=new URL(ready),origin=url.origin,token=new URLSearchParams(url.hash.slice(1)).get('token')!;
const post=async(path:string,body:unknown,override:Record<string,string>={})=>{const response=await fetch(origin+path,{method:'POST',headers:{origin,'content-type':'application/json','x-agentaction-runner':token,...override},body:JSON.stringify(body)});return {status:response.status,body:await response.json() as any};};
try {
  assert.equal((await fetch(origin)).status,200);
  assert.equal((await post('/api/setup',{})).status,200);
  assert.equal((await post('/api/setup',{}, {'x-agentaction-runner':''})).status,403);
  assert.equal((await post('/api/setup',{}, {origin:'https://evil.example'})).status,403);
  const hostileHost=await new Promise<number>((resolve,reject)=>{const req=httpRequest(origin+'/api/setup',{method:'POST',headers:{host:'evil.example',origin,'content-type':'application/json','content-length':'2','x-agentaction-runner':token}},res=>{res.resume();resolve(res.statusCode!);});req.on('error',reject);req.end('{}');});assert.equal(hostileHost,403);
  assert.equal((await post('/api/setup',{token:'SECRET'})).status,400);
  assert.equal((await post('/api/setup',{padding:'x'.repeat(150000)})).status,400);
  const discovered=await post('/api/discover',{endpoint:provider.endpoint,protocol:'2025-11-25',token:'TEST-CREDENTIAL'});
  assert.equal(discovered.status,200);assert.ok(!JSON.stringify(discovered).includes('TEST-CREDENTIAL'));assert.equal(provider.calls(),0);
  const plan={...samplePlan(),endpoint:provider.endpoint,tool:discovered.body.tools[0]};
  const run=await post('/api/run',{plan,token:'TEST-CREDENTIAL'});assert.equal(run.status,200);assert.equal(run.body.status,'passed');assert.equal(run.body.calls,3);assert.equal(provider.calls(),3);assert.ok(!JSON.stringify(run).includes('TEST-CREDENTIAL'));
  provider.setSse(true);const streamed=await post('/api/run',{plan,token:'TEST-CREDENTIAL'});assert.equal(streamed.body.status,'passed');provider.setSse(false);
  const beforeDrift=provider.calls();provider.setDrift(true);const drift=await post('/api/run',{plan,token:'TEST-CREDENTIAL'});assert.equal(drift.body.status,'inconclusive');assert.equal(drift.body.calls,0);assert.equal(provider.calls(),beforeDrift);provider.setDrift(false);
  const slow={...plan,arguments:{query:'slow'},deadlineMs:50};const beforeSlow=provider.calls();
  const pending=post('/api/run',{plan:slow,token:'TEST-CREDENTIAL'});await new Promise(r=>setTimeout(r,10));assert.equal((await post('/api/discover',{endpoint:provider.endpoint,protocol:'2025-11-25',token:'TEST-CREDENTIAL'})).status,409);
  const timed=await pending;assert.equal(timed.body.status,'inconclusive');assert.equal(provider.calls()-beforeSlow,1);assert.equal(timed.body.calls,1);
  const redirect=await post('/api/discover',{endpoint:provider.endpoint.replace('/mcp','/redirect'),protocol:'2025-11-25',token:'TEST-CREDENTIAL'});assert.equal(redirect.status,400);assert.equal(provider.sinkCalls(),0);
  const file=join(dir,'saved plan.json'),report=join(dir,'report.json');await writeFile(file,JSON.stringify(plan));
  const cli=spawn(process.execPath,[runner,'--plan',file,'--run','--out',report],{env:{...process.env,MCP_TEST_TOKEN:'TEST-CREDENTIAL'},stdio:['ignore','pipe','pipe']});let stdout='';cli.stdout.on('data',c=>stdout+=c);
  const code=await new Promise(resolve=>cli.once('exit',resolve));assert.equal(code,0);assert.equal(JSON.parse(stdout).status,'passed');assert.equal(JSON.parse(await readFile(report,'utf8')).businessOutcome,'unverified');assert.ok(!stdout.includes('TEST-CREDENTIAL'));
  for(const [changed,expected] of [[{...plan,expectedText:'absent fixture text'},1],[{...plan,arguments:{query:'slow'},deadlineMs:50},2]] as const){
    await writeFile(file,JSON.stringify(changed));const proc=spawn(process.execPath,[runner,'--plan',file,'--run'],{env:{...process.env,MCP_TEST_TOKEN:'TEST-CREDENTIAL'},stdio:['ignore','pipe','pipe']});proc.stdout.resume();proc.stderr.resume();assert.equal(await new Promise(resolve=>proc.once('exit',resolve)),expected);
  }
  console.log('Local runner acceptance passed: standalone download, loopback origin/Host/token checks, discovery, five checks, credential redaction, SSE, contract drift, timeout halt, concurrency, redirect refusal and CI saved-plan execution.');
} finally {child.kill();await provider.close();await rm(dir,{recursive:true,force:true});}
