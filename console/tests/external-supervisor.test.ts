import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentRuntime, type Run, type Agent, type RuntimeStorage } from '../src/agent-runtime.ts';
import worker from '../src/worker.ts';
import { testTransaction } from './transaction-storage.ts';

export class Storage implements RuntimeStorage {
  data=new Map<string,unknown>();fail=false;
  async get<T>(key:string){return structuredClone(this.data.get(key)) as T|undefined;}
  async put<T>(key:string,value:T){this.data.set(key,structuredClone(value));}
  async delete(key:string){return this.data.delete(key);}
  async list<T>({prefix}:{prefix:string}){return new Map([...this.data].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v) as T]));}
  async setAlarm(){}async deleteAlarm(){}
  transaction<T>(work:(tx:Pick<RuntimeStorage,'get'|'put'>)=>Promise<T>){return testTransaction(this,async tx=>{const value=await work(tx);if(this.fail)throw new Error('Synthetic commit loss');return value;});}
}
export async function fixture(){
  const storage=new Storage();let runtime=new AgentRuntime(storage,{});
  const request=async(path:string,body:unknown={},role='owner',token='',workspace='acme')=>{
    const response=await runtime.handle(new Request('https://runtime.test/'+path,{method:'POST',headers:{'x-runtime-workspace':workspace,'x-runtime-role':role,'x-runtime-actor':'operator-a',authorization:token?'Bearer '+token:''},body:JSON.stringify(body)}));
    return {status:response.status,body:await response.json() as any};
  };
  const registered=await request('external-register',{title:'Hermes refunds',tools:['refund','lookup']});assert.equal(registered.status,200);
  const {agentId,token}=registered.body;
  const external=(path:string,body:unknown={})=>request('external/'+path,{agentId,...body as object},'external',token);
  const start=async(session='session-one',limits:unknown={})=>{const r=await external('start',{sessionId:session,supervisorLimits:limits});assert.equal(r.status,200);return r.body.runId as string;};
  const propose=(runId:string,args:unknown={paymentId:'synthetic',amount:10},tool='refund')=>external('propose',{runId,tool,arguments:args});
  const read=(runId:string)=>storage.get<Run>('run:'+runId) as Promise<Run>;
  const approve=async(runId:string)=>request('approve',{runId,approvalId:(await read(runId)).pending!.id});
  const claim=(runId:string,p:any)=>external('claim',{runId,actionId:p.actionId,bindingDigest:p.bindingDigest});
  return {storage,request,agentId,token,external,start,propose,read,approve,claim,snapshot:()=>runtime.snapshot(),async restart(){runtime=new AgentRuntime(storage,{});await runtime.recover();}};
}

test('owner provisions execution-only hashed credentials; observer tokens and viewers have no authority',async()=>{
  const f=await fixture();
  for(const role of ['operator','viewer'])assert.equal((await f.request('external-register',{title:'bad',tools:['refund']},role)).status,403);
  assert.ok(!JSON.stringify(await f.snapshot()).includes(f.token));assert.ok(!JSON.stringify([...f.storage.data]).includes(f.token));
  assert.equal((await f.request('external/start',{agentId:f.agentId,sessionId:'s'},'owner','source-token')).status,401);
  assert.equal((await f.request('external/start',{agentId:f.agentId,sessionId:'s',approved:true},'external',f.token)).status,400);
  assert.equal((await f.request('external-register',{title:'unsupported',tools:['execute_code']})).status,400);
});

test('approval restart and single-use claim: synthetic provider is reached exactly once',async()=>{
  const f=await fixture(),id=await f.start();let effects=0;
  const p=(await f.propose(id)).body;assert.equal(p.approved,false);assert.equal((await f.claim(id,p)).status,409);
  const pending=(await f.read(id)).pending;await f.restart();assert.deepEqual((await f.read(id)).pending,pending);
  assert.equal((await f.approve(id)).status,200);await f.restart();
  assert.equal((await f.propose(id)).body.approved,true);
  const attempts=await Promise.all([f.claim(id,p),f.claim(id,p)]);assert.deepEqual(attempts.map(a=>a.status).sort(),[200,409]);
  for(const response of attempts)if(response.status===200){assert.equal((await f.read(id)).supervisor!.actions[0].state,'dispatch_claimed');effects++;}
  await f.restart();assert.equal((await f.read(id)).supervisor!.actions[0].state,'uncertain');
  assert.ok((await f.claim(id,p)).body.blocked);assert.ok((await f.propose(id,{amount:20})).body.blocked);assert.equal(effects,1);
});

test('successful completion is self-reported; identical retries are never reissued and budget is frozen',async()=>{
  const f=await fixture(),id=await f.start('s',{maxCalls:1}),p=(await f.propose(id)).body;
  await f.approve(id);assert.equal((await f.claim(id,p)).status,200);
  assert.equal((await f.external('complete',{runId:id,actionId:p.actionId,status:'succeeded'})).status,200);
  await f.restart();assert.equal((await f.propose(id)).body.state,'succeeded');assert.equal((await f.claim(id,p)).status,409);
  assert.equal((await f.propose(id,{amount:99})).status,409);assert.match((await f.read(id)).events[0].result!,/Adapter-reported/);
  assert.equal((await f.external('start',{sessionId:'s',supervisorLimits:{maxCalls:2}})).status,409);
});

test('changed args cancel old approval, tampered digest cannot claim, cancellation blocks all calls',async()=>{
  const f=await fixture(),id=await f.start(),old=(await f.propose(id)).body;await f.approve(id);
  const next=(await f.propose(id,{amount:11})).body;assert.notEqual(next.actionId,old.actionId);
  assert.equal((await f.claim(id,old)).status,409);await f.approve(id);
  assert.equal((await f.claim(id,{...next,bindingDigest:'tampered'})).status,409);
  assert.equal((await f.request('revise',{runId:id,approvalId:(await f.read(id)).pending!.id,arguments:{}})).status,409);
  await f.request('cancel',{runId:id});assert.equal((await f.claim(id,next)).status,409);
});

test('expiration, agent/workspace revisions, allowlist and scope fence external claims',async()=>{
  const f=await fixture(),id=await f.start(),p=(await f.propose(id)).body;
  const run=await f.read(id);run.supervisor!.actions[0].expiresAt=new Date(0).toISOString();await f.storage.put('run:'+id,run);
  assert.equal((await f.approve(id)).status,409);
  assert.equal((await f.propose(id,{},'terminal')).status,403);
  assert.equal((await f.request('supervisor-settings',{scope:'agent',agentId:f.agentId,expectedVersion:0,limits:{maxCalls:2}})).status,200);
  assert.equal((await f.claim(id,p)).status,409);
  const other=await f.start('other');await f.propose(other);await f.approve(other);
  assert.equal((await f.request('supervisor-settings',{scope:'workspace',expectedVersion:0,limits:{maxCalls:2}})).status,200);
  assert.equal((await f.propose(other)).status,409);
  assert.equal((await f.request('external/start',{agentId:f.agentId,sessionId:'s'},'external',f.token,'wrong')).status,403);
});

test('call limits inherit agent settings, only narrow, and reject extra credential disclosures',async()=>{
  const f=await fixture();await f.request('supervisor-settings',{scope:'agent',agentId:f.agentId,expectedVersion:0,limits:{maxCalls:2}});
  assert.equal((await f.external('start',{sessionId:'wide',supervisorLimits:{maxCalls:3}})).status,400);
  const id=await f.start('narrow',{maxCalls:1});assert.equal((await f.read(id)).supervisor!.limits.maxCalls,1);
  assert.equal((await f.propose(id,{secret:f.token})).status,400);
  assert.equal((await f.propose(id,{value:'a'.repeat(8100)})).status,400);
  assert.equal((await f.request('trial',{agentId:f.agentId})).status,409);
  assert.equal((await f.request('activate',{agentId:f.agentId,reviewed:true})).status,409);
});

test('transaction failure grants no claim and timed-out completions become uncertain',async()=>{
  const f=await fixture(),id=await f.start(),p=(await f.propose(id)).body;await f.approve(id);
  f.storage.fail=true;assert.equal((await f.claim(id,p)).status,502);assert.equal((await f.read(id)).supervisor!.actions[0].state,'awaiting_approval');
  f.storage.fail=false;await f.claim(id,p);
  const r=await f.read(id);r.supervisor!.actions[0].claimedAt=new Date(0).toISOString();await f.storage.put('run:'+id,r);
  assert.ok((await f.external('complete',{runId:id,actionId:p.actionId,status:'succeeded'})).body.blocked);
  assert.equal((await f.read(id)).supervisor!.actions[0].state,'uncertain');
});

test('token rotation/revocation cancels approvals and cannot resurrect sessions',async()=>{
  const f=await fixture(),id=await f.start(),p=(await f.propose(id)).body;await f.approve(id);
  assert.equal((await f.request('external-rotate',{agentId:f.agentId},'operator')).status,403);
  const rotated=await f.request('external-rotate',{agentId:f.agentId});assert.equal(rotated.status,200);assert.notEqual(rotated.body.token,f.token);
  assert.equal((await f.claim(id,p)).status,401);
  const newRequest=(path:string,body:unknown)=>f.request('external/'+path,{agentId:f.agentId,...body as object},'external',rotated.body.token);
  assert.equal((await newRequest('propose',{runId:id,tool:'refund',arguments:{}})).status,409);
  await f.request('external-revoke',{agentId:f.agentId});assert.equal((await newRequest('start',{sessionId:'new'})).status,401);
});

test('machine ingress discards forged identity, scopes workspace and excludes approvals/public demo',async()=>{
  const f=await fixture();let forwarded:Request|undefined;
  const env={AGENT_WORKSPACES:{getByName(name:string){assert.equal(name,'workspace:acme');return {async request(r:Request){forwarded=r;return f.request('external/start',await r.json(),'external',r.headers.get('authorization')!.slice(7)).then(x=>Response.json(x.body,{status:x.status}));}};}}};
  const call=(path:string,extra={},overrides={})=>worker.fetch(new Request('https://console.test/api/external-agents/acme/'+path,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+f.token,'x-runtime-role':'owner','x-runtime-actor':'forged','x-runtime-workspace':'other',...extra},body:JSON.stringify({agentId:f.agentId,sessionId:'s'})}),{...env,...overrides} as any);
  assert.equal((await call('start')).status,200);assert.equal(forwarded!.headers.get('x-runtime-role'),null);assert.equal(forwarded!.headers.get('x-runtime-actor'),null);assert.equal(forwarded!.headers.get('x-runtime-workspace'),'acme');
  assert.equal((await call('approve')).status,404);assert.equal((await call('start',{authorization:'Bearer observation-token'})).status,401);
  assert.equal((await call('start',{}, {CONSOLE_PUBLIC_DEMO:'true'})).status,404);
});

test('expired evidence retains a permanent replay tombstone; unknown runs are not pruned',async()=>{
  const f=await fixture(),id=await f.start('old-session');
  for(let n=0;n<79;n++)await f.storage.put('run:held-'+n,{id:'held-'+n,external:{},status:'interrupted'});
  const fresh=await f.start('new-session');assert.notEqual(fresh,id);
  assert.equal(await f.storage.get('run:'+id),undefined);
  assert.equal((await f.external('start',{sessionId:'old-session'})).status,410);
  assert.equal((await f.external('start',{sessionId:'another'})).status,200); // Only the new completed/idle record can be pruned.
  assert.equal((await f.storage.list({prefix:'external-session:'})).size,3);
  await f.storage.delete('run:'+fresh);
  for(let n=0;n<1000;n++)await f.storage.put('external-session:capacity-'+n,'retired');
  assert.equal((await f.external('start',{sessionId:'full'})).status,409);
});

test('credential revision cap never prevents final revocation',async()=>{
  const f=await fixture();const a=(await f.storage.get<Agent>('agent:'+f.agentId))!;a.external!.revision=100;await f.storage.put('agent:'+f.agentId,a);
  assert.equal((await f.request('external-rotate',{agentId:f.agentId})).status,409);
  assert.equal((await f.request('external-revoke',{agentId:f.agentId})).status,200);
  assert.equal((await f.request('external-revoke',{agentId:f.agentId})).status,200);
  assert.equal((await f.external('start',{sessionId:'revoked'})).status,401);
});
