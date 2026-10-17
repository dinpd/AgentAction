import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentRuntime, type Agent, type Connection, type Run, type RuntimeStorage } from '../src/agent-runtime.ts';
import { DEFAULT_SUPERVISOR_LIMITS, supervisorLimits, supervisorRecord, proposeAction, claimAction, recoverActions, reconcileAction } from '../src/execution-supervisor.ts';
import { testTransaction } from './transaction-storage.ts';

class Storage implements RuntimeStorage {
  data = new Map<string, unknown>(); alarm?: number; failClaim = false; failResult = false;
  async get<T>(key: string) { return structuredClone(this.data.get(key)) as T | undefined; }
  async put<T>(key: string, value: T) {
    if (this.failResult && key.startsWith('run:') && (value as Run).events?.some(e => e.status === 'succeeded')) throw new Error('Result persistence unavailable');
    assert.ok(JSON.stringify(value).length < 128000); this.data.set(key, structuredClone(value));
  }
  async delete(key: string) { return this.data.delete(key); }
  async list<T>({prefix}: {prefix: string}) { return new Map([...this.data].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key, structuredClone(value) as T])); }
  async setAlarm(time: number) { this.alarm = time; }
  async deleteAlarm() { this.alarm = undefined; }
  transaction<T>(work: (tx: Pick<RuntimeStorage, 'get' | 'put'>) => Promise<T>) {
    return testTransaction(this, async tx => {
      const result = await work(tx);
      if (this.failClaim) throw new Error('Transaction commit unavailable');
      return result;
    });
  }
}
const tool = { name: 'refund', description: 'Synthetic USD refund', inputSchema: {type:'object',properties:{paymentId:{type:'string'},amount:{type:'number'}},required:['paymentId','amount'],additionalProperties:false} };
const args = {paymentId:'synthetic-payment', amount:10};
const call = {type:'call',tool:'refund',arguments:args};
const finish = {type:'finish',summary:'Synthetic refund recorded.',outcome:'met',reason:'Provider result retained.'};
async function fixture() {
  const storage = new Storage(); let effects = 0, loseResponse = false, hang = false, tokenSeen = false, timeout = false;
  const outputs: unknown[] = [call, finish];
  const env = {AGENT_AI:{async run() { return {response:outputs.shift() || finish}; }}};
  const connection: Connection = {id:'provider',label:'Synthetic provider',endpoint:'https://mcp.firecrawl.dev/v2/mcp',token:'PROVIDER-SECRET',protocol:'2025-03-26',tools:[tool],suggestions:[],status:'connected',createdAt:'2026-10-17T00:00:00Z'};
  const agent: Agent = {id:'agent',connectionId:connection.id,title:'Refund agent',goal:'Refund one synthetic payment',setup:'Synthetic test',success:'Provider refund result',tools:['refund'],status:'draft',createdAt:connection.createdAt};
  await storage.put('connection:provider', connection); await storage.put('agent:agent', agent);
  const fetcher: typeof fetch = async (_url, init = {}) => {
    if (init.method === 'DELETE') return new Response(null,{status:204});
    const rpc = JSON.parse(String(init.body));
    if (rpc.method === 'notifications/initialized') return new Response(null,{status:202});
    if (rpc.method === 'tools/call') {
      assert.deepEqual(rpc.params.arguments, args);
      tokenSeen = new Headers(init.headers).get('authorization') === 'Bearer PROVIDER-SECRET';
      const persisted = [...(await storage.list<Run>({prefix:'run:'})).values()][0];
      assert.equal(persisted.supervisor!.actions.at(-1)!.state,'dispatch_claimed'); assert.equal(persisted.pending,undefined);
      effects++;
      if (hang) await new Promise<void>((_, reject) => init.signal!.addEventListener('abort', () => { timeout = true; reject(new Error('aborted')); }, {once:true}));
      if (loseResponse) throw new Error('Provider committed, response lost');
    }
    const result = rpc.method === 'initialize' ? {protocolVersion:'2025-03-26'} : rpc.method === 'tools/list' ? {tools:[tool]} : {content:[{type:'text',text:'refund-created PROVIDER-SECRET'}]};
    return Response.json({jsonrpc:'2.0',id:rpc.id,result});
  };
  let runtime = new AgentRuntime(storage, env, fetcher);
  const request = async (path: string, body: unknown = {}, role = 'owner', workspace = 'workspace') => {
    const response = await runtime.handle(new Request(`https://runtime.test/${path}`,{method:'POST',headers:{'x-runtime-workspace':workspace,'x-runtime-role':role,'x-runtime-actor':'reviewer'},body:JSON.stringify(body)}));
    return {status:response.status,body:await response.json() as any};
  };
  const trial = async (limits?: unknown) => { const response = await request('trial',{agentId:'agent',...(limits ? {supervisorLimits:limits} : {})}); assert.equal(response.status,200); return (await storage.get<Run>(`run:${response.body.runId}`))!; };
  const read = (id: string) => storage.get<Run>(`run:${id}`) as Promise<Run>;
  const approve = (run: Run) => request('approve',{runId:run.id,approvalId:run.pending!.id});
  return {storage,request,trial,read,approve,outputs,env,fetcher,effects:()=>effects,tokenSeen:()=>tokenSeen,timeout:()=>timeout,lose:()=>loseResponse=true,hang:()=>hang=true,
    async restart() { runtime = new AgentRuntime(storage,env,fetcher); await runtime.recover(); },
  };
}

test('acceptance: approval survives restart; lost refund response and replay preserve exactly one provider effect', async () => {
  const h = await fixture(), run = await h.trial();
  assert.equal(h.effects(),0); const pending = structuredClone(run.pending), supervisor = structuredClone(run.supervisor);
  await h.restart(); assert.deepEqual((await h.read(run.id)).pending,pending); assert.deepEqual((await h.read(run.id)).supervisor,supervisor);
  h.lose(); assert.equal((await h.approve(run)).status,502); await h.restart();
  assert.equal((await h.approve(run)).status,409); assert.equal(h.effects(),1); assert.equal(h.tokenSeen(),true);
  const retained = await h.read(run.id); assert.equal(retained.events[0].status,'uncertain'); assert.equal(retained.supervisor!.actions[0].state,'uncertain');
  assert.deepEqual(retained.supervisor!.journal.map(e=>e.state),['awaiting_approval','dispatch_claimed','uncertain']);
  assert.ok(!JSON.stringify(retained).includes('PROVIDER-SECRET'));
});
test('concurrent approvals consume the durable action once and completed replay is rejected', async () => {
  const h = await fixture(), run = await h.trial();
  const results = await Promise.all([h.approve(run),h.approve(run),h.approve(run)]);
  assert.deepEqual(results.map(r=>r.status),[200,409,409]); assert.equal(h.effects(),1);
  const retained = await h.read(run.id); assert.equal(retained.supervisor!.actions[0].state,'succeeded'); assert.equal(retained.events[0].actionId,retained.supervisor!.actions[0].id);
});
test('claim commit failure rolls back approval consumption and sends no provider call', async () => {
  const h = await fixture(), run = await h.trial(); h.storage.failClaim = true;
  assert.equal((await h.approve(run)).status,502); assert.equal(h.effects(),0); assert.deepEqual((await h.read(run.id)).pending,run.pending);
  h.storage.failClaim = false; await h.restart(); assert.equal((await h.approve(run)).status,200); assert.equal(h.effects(),1);
});
test('independent runtime instances still compete for one transactional claim', async () => {
  const h = await fixture(), run = await h.trial(), second = new AgentRuntime(h.storage,h.env,h.fetcher);
  const other = second.handle(new Request('https://runtime.test/approve',{method:'POST',headers:{'x-runtime-workspace':'workspace','x-runtime-role':'owner'},body:JSON.stringify({runId:run.id,approvalId:run.pending!.id})}));
  const results = await Promise.all([h.approve(run),other]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]); assert.equal(h.effects(),1);
});
test('result persistence failure cannot manufacture a successful action', async () => {
  const h = await fixture(), run = await h.trial(); h.storage.failResult = true;
  assert.equal((await h.approve(run)).status,502); await h.restart(); assert.equal((await h.approve(run)).status,409);
  const retained = await h.read(run.id); assert.equal(retained.supervisor!.actions[0].state,'uncertain'); assert.equal(retained.events[0].status,'uncertain'); assert.equal(h.effects(),1);
});
test('restart after durable result resumes only planning without redispatch', async () => {
  for (const status of ['executing','planning'] as const) {
    const h = await fixture(), run = await h.trial(); assert.equal((await h.approve(run)).status,200);
    const retained = await h.read(run.id); retained.status = status; delete retained.finishedAt; await h.storage.put(`run:${run.id}`,retained);
    await h.restart(); assert.equal((await h.read(run.id)).status,'completed'); assert.equal(h.effects(),1); assert.equal((await h.approve(run)).status,409);
  }
});
test('claimed-but-unsent recovery is uncertain and never automatically dispatches', async () => {
  const h = await fixture(), run = await h.trial(), action = run.supervisor!.actions[0];
  claimAction(run.supervisor!,run.pending!.id,action.bindingDigest,0,'reviewer'); run.status='executing'; delete run.pending;
  await h.storage.put(`run:${run.id}`,run); await h.restart();
  assert.equal((await h.read(run.id)).supervisor!.actions[0].state,'uncertain'); assert.equal(h.effects(),0);
  const journal = (await h.read(run.id)).supervisor!.journal; await h.restart(); assert.deepEqual((await h.read(run.id)).supervisor!.journal,journal);
});
test('revision, cancellation, expiry, tampered payload and changed connection cannot reuse approval', async () => {
  for (const scenario of ['revision','cancel','expiry','payload','connection','agent','policy','legacy']) {
    const h = await fixture(), run = await h.trial();
    if (scenario === 'revision') assert.equal((await h.request('revise',{runId:run.id,approvalId:run.pending!.id,arguments:args})).status,200);
    if (scenario === 'cancel') await h.request('cancel',{runId:run.id});
    if (scenario === 'expiry') { run.supervisor!.actions[0].expiresAt='2000-01-01T00:00:00Z'; await h.storage.put(`run:${run.id}`,run); }
    if (scenario === 'payload') { const changed=structuredClone(run); changed.pending!.arguments.amount=20; await h.storage.put(`run:${run.id}`,changed); }
    if (scenario === 'connection') { const c=(await h.storage.get<Connection>('connection:provider'))!; c.createdAt='2026-10-17T01:00:00Z'; await h.storage.put('connection:provider',c); }
    if (scenario === 'agent') { const a=(await h.storage.get<Agent>('agent:agent'))!; a.setup='Changed scope'; await h.storage.put('agent:agent',a); }
    if (scenario === 'policy') await h.storage.put('supervisor-policy',{version:1,limits:DEFAULT_SUPERVISOR_LIMITS});
    if (scenario === 'legacy') { delete run.supervisor; await h.storage.put(`run:${run.id}`,run); }
    assert.equal((await h.approve(run)).status,409,scenario); assert.equal(h.effects(),0,scenario);
  }
});
test('workspace, agent and run configuration only narrows limits and records policy versions', async () => {
  const h=await fixture();
  const settings={scope:'workspace',expectedVersion:0,limits:{maxCalls:3,approvalTtlMs:10000,executionTimeoutMs:2000}};
  assert.equal((await h.request('supervisor-settings',settings,'operator')).status,403);
  assert.equal((await h.request('supervisor-settings',settings,'viewer')).status,403);
  assert.equal((await h.request('supervisor-settings',settings)).status,200);
  const audit = await h.storage.get<any>('supervisor-policy:1'); assert.equal(audit.configuredBy,'reviewer'); assert.equal(audit.limits.maxCalls,3);
  assert.equal((await h.request('supervisor-settings',settings)).status,409);
  assert.equal((await h.request('supervisor-settings',{scope:'agent',agentId:'agent',expectedVersion:0,limits:{maxCalls:4}})).status,400);
  assert.equal((await h.request('supervisor-settings',{scope:'agent',agentId:'agent',expectedVersion:0,limits:{maxCalls:2}})).status,200);
  assert.equal((await h.storage.get<any>('supervisor-agent-policy:agent:1')).configuredBy,'reviewer');
  assert.equal((await h.request('trial',{agentId:'agent',supervisorLimits:{maxCalls:3}})).status,400);
  const run=await h.trial({maxCalls:1}); assert.equal(run.supervisor!.policyVersion,1); assert.equal(run.supervisor!.limits.maxCalls,1);
  h.outputs.unshift(call); assert.equal((await h.approve(run)).status,200); assert.equal((await h.read(run.id)).status,'failed'); assert.equal(h.effects(),1);
});
test('configuration invalidates pending actions, rejects unsafe settings and stays workspace isolated', async () => {
  const h=await fixture(), run=await h.trial();
  for (const limits of [{maxCalls:5},{approvalTtlMs:0},{executionTimeoutMs:1.5},{recoveryPolicy:'retry'},{recoveryPolicy:'reconcile'},{disableApproval:true}]) assert.equal((await h.request('supervisor-settings',{scope:'workspace',expectedVersion:0,limits})).status,400);
  assert.equal((await h.request('supervisor-settings',{scope:'workspace',expectedVersion:0,limits:{maxCalls:2}},'owner','other')).status,403);
  assert.equal((await h.request('supervisor-settings',{scope:'workspace',expectedVersion:0,limits:{maxCalls:2}})).status,200);
  assert.equal((await h.read(run.id)).status,'cancelled'); assert.equal((await h.approve(run)).status,409); assert.equal(h.effects(),0);
});
test('partial agent overrides inherit workspace changes and empty settings restore inheritance', async () => {
  const h=await fixture();
  assert.equal((await h.request('supervisor-settings',{scope:'workspace',expectedVersion:0,limits:{maxCalls:3,approvalTtlMs:10000,executionTimeoutMs:2000}})).status,200);
  assert.equal((await h.request('supervisor-settings',{scope:'agent',agentId:'agent',expectedVersion:0,limits:{maxCalls:2}})).status,200);
  assert.deepEqual((await h.storage.get<Agent>('agent:agent'))!.supervisorLimits,{maxCalls:2});
  assert.equal((await h.request('supervisor-settings',{scope:'workspace',expectedVersion:1,limits:{maxCalls:4,approvalTtlMs:20000,executionTimeoutMs:4000}})).status,200);
  const run=await h.trial();
  assert.deepEqual(run.supervisor!.limits,{maxCalls:2,approvalTtlMs:20000,executionTimeoutMs:4000,recoveryPolicy:'review'});
  assert.equal((await h.request('supervisor-settings',{scope:'agent',agentId:'agent',expectedVersion:1,limits:{}})).status,200);
  assert.deepEqual((await h.storage.get<Agent>('agent:agent'))!.supervisorLimits,{});
  h.outputs.unshift(call); const inherited=await h.trial();
  assert.deepEqual(inherited.supervisor!.limits,{maxCalls:4,approvalTtlMs:20000,executionTimeoutMs:4000,recoveryPolicy:'review'});
  assert.deepEqual((await h.storage.get<any>('supervisor-agent-policy:agent:1')).limits,{maxCalls:2});
  assert.equal((await h.request('supervisor-settings',{scope:'workspace',expectedVersion:2,limits:{maxCalls:3}})).status,200);
  assert.deepEqual((await h.storage.get<any>('supervisor-policy')).limits,{maxCalls:3,approvalTtlMs:20000,executionTimeoutMs:4000,recoveryPolicy:'review'});
});
test('configured dispatch timeout records uncertainty and never retries', async () => {
  const h=await fixture(),run=await h.trial({executionTimeoutMs:5}); h.hang();
  assert.equal((await h.approve(run)).status,502); assert.equal(h.timeout(),true); assert.equal(h.effects(),1); assert.equal((await h.read(run.id)).supervisor!.actions[0].state,'uncertain');
});
test('operators can tighten agent restrictions but only owners can widen or reset them', async () => {
  const h=await fixture();
  assert.equal((await h.request('supervisor-settings',{scope:'agent',agentId:'agent',expectedVersion:0,limits:{maxCalls:1,approvalTtlMs:5000,executionTimeoutMs:1000}})).status,200);
  for(const limits of [{maxCalls:4},{},{maxCalls:1},{maxCalls:1,approvalTtlMs:6000,executionTimeoutMs:1000}]) {
    assert.equal((await h.request('supervisor-settings',{scope:'agent',agentId:'agent',expectedVersion:1,limits},'operator')).status,403);
    assert.equal((await h.storage.get<Agent>('agent:agent'))!.supervisorVersion,1);
  }
  assert.equal((await h.request('supervisor-settings',{scope:'agent',agentId:'agent',expectedVersion:1,limits:{maxCalls:1,approvalTtlMs:4000,executionTimeoutMs:800}},'operator')).status,200);
  assert.equal((await h.request('supervisor-settings',{scope:'agent',agentId:'agent',expectedVersion:2,limits:{}})).status,200);
  const run=await h.trial();assert.deepEqual(run.supervisor!.limits,DEFAULT_SUPERVISOR_LIMITS);
});
test('supervisor bounds proposal history and provider reconciliation never dispatches', async () => {
  const state=supervisorRecord({version:0,limits:DEFAULT_SUPERVISOR_LIMITS},{...DEFAULT_SUPERVISOR_LIMITS,recoveryPolicy:'reconcile'});
  const action=proposeAction(state,'approval','digest'); claimAction(state,'approval','digest',0,'reviewer'); recoverActions(state);
  let reads=0; await reconcileAction(state,action.id,async()=>{reads++;return 'succeeded';}); assert.equal(reads,1);assert.equal(action.state,'succeeded');
  assert.throws(()=>claimAction(state,'approval','digest',0,'reviewer'));
  const bounded=supervisorRecord({version:0,limits:DEFAULT_SUPERVISOR_LIMITS},DEFAULT_SUPERVISOR_LIMITS);
  for(let i=0;i<24;i++)proposeAction(bounded,String(i),'digest');
  assert.throws(()=>proposeAction(bounded,'overflow','digest')); assert.ok(bounded.journal.length<128);
  assert.throws(()=>supervisorLimits({maxCalls:Infinity}));
});
