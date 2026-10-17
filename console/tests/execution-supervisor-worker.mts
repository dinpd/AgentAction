/** Real AgentWorkspace, transactional SQLite and process restart; provider effects live outside the Worker. */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../node_modules/esbuild/lib/main.js';
import { Miniflare, convertV4MiniflareOptions } from '../node_modules/miniflare/dist/src/index.js';

const tool = {name:'refund',description:'Synthetic refund',inputSchema:{type:'object',properties:{paymentId:{type:'string'},amount:{type:'number'}},required:['paymentId','amount'],additionalProperties:false}};
const bundled = await build({stdin:{contents:`
  import { AgentWorkspace } from './agent-runtime-do.ts';
  export class TestWorkspace extends AgentWorkspace {
    constructor(ctx, env) { super(ctx, {...env, AGENT_AI: { async run(_, input) {
      const observed = JSON.parse(input.messages[1].content).observed || [];
      return {response: observed.length ? {type:'finish',summary:'Refund observed',outcome:'met',reason:'Provider result'} : {type:'call',tool:'refund',arguments:{paymentId:'synthetic-payment',amount:10}}};
    }}}); }
    async seed() {
      await this.ctx.storage.put('connection:provider', {id:'provider',label:'Synthetic provider',endpoint:'https://mcp.firecrawl.dev/v2/mcp',token:'WORKER-PROVIDER-SECRET',protocol:'2025-03-26',tools:[${JSON.stringify(tool)}],suggestions:[],status:'connected',createdAt:'2026-10-17T00:00:00Z'});
      await this.ctx.storage.put('agent:agent', {id:'agent',connectionId:'provider',title:'Synthetic refund',goal:'One synthetic refund',setup:'Fixture',success:'Refund result',tools:['refund'],status:'draft',createdAt:'2026-10-17T00:00:00Z'});
    }
    async simulateClaim(runId) {
      await this.ctx.storage.transaction(async tx => {
        const run = await tx.get('run:'+runId), action = run.supervisor.actions[0];
        action.state = 'dispatch_claimed'; action.approvedBy = 'reviewer'; action.claimedAt = new Date().toISOString();
        run.supervisor.journal.push({sequence:2,actionId:action.id,state:'dispatch_claimed',at:action.claimedAt});
        run.status = 'executing'; delete run.pending; await tx.put('run:'+runId,run);
      });
    }
  }
  export default { async fetch(request, env) {
    const url = new URL(request.url), stub = env.AGENT_WORKSPACES.getByName('workspace:acme');
    if (url.pathname === '/seed') { await stub.seed(); return Response.json({ok:true}); }
    if (url.pathname === '/simulate-claim') { await stub.simulateClaim((await request.json()).runId); return Response.json({ok:true}); }
    return stub.request(new Request(request, {headers:{'content-type':'application/json','x-runtime-workspace':'acme','x-runtime-role':'owner','x-runtime-actor':'reviewer'}}));
  }};
`,resolveDir:fileURLToPath(new URL('../src/',import.meta.url))},bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers'],write:false});
const persist=await mkdtemp(join(tmpdir(),'agentaction-supervisor-'));
let effects=0, loseResponse=true;
const create=()=>new Miniflare(convertV4MiniflareOptions({resourcePersistencePath:persist,workers:[{name:'supervisor-test',modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-07-20',
  durableObjects:{AGENT_WORKSPACES:{className:'TestWorkspace',useSQLite:true}},
  outboundService:async request=>{
    if(request.method==='DELETE')return new Response(null,{status:204});
    const rpc=await request.json() as any;
    if(rpc.method==='notifications/initialized')return new Response(null,{status:202});
    if(rpc.method==='tools/call') {
      assert.deepEqual(rpc.params.arguments,{paymentId:'synthetic-payment',amount:10});
      assert.equal(request.headers.get('authorization'),'Bearer WORKER-PROVIDER-SECRET'); effects++;
      // The independent provider committed; the caller receives no usable result.
      if(loseResponse)return new Response('Synthetic response loss',{status:502});
    }
    return Response.json({jsonrpc:'2.0',id:rpc.id,result:rpc.method==='initialize'?{protocolVersion:'2025-03-26'}:rpc.method==='tools/list'?{tools:[tool]}:{content:[{type:'text',text:'Synthetic refund retained'}]}});
  },
}]}));
let mf=create();
const request=async(path:string,body?:unknown)=>{
  const response=await mf.dispatchFetch(`https://runtime.test/${path}`,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await response.json() as any;assert.ok(!JSON.stringify(value).includes('WORKER-PROVIDER-SECRET'));return {status:response.status,body:value};
};
const restart=async()=>{await mf.dispose();mf=create();};
try {
  await request('seed');const trial=await request('trial',{agentId:'agent'});assert.equal(trial.status,200);
  const runId=trial.body.runId, before=(await request('state')).body.runs[0];assert.equal(effects,0);
  await restart();const restored=(await request('state')).body.runs[0];assert.deepEqual(restored.pending,before.pending);assert.deepEqual(restored.supervisor,before.supervisor);
  const approval={runId,approvalId:restored.pending.id};
  const attempts=await Promise.all([request('approve',approval),request('approve',approval)]);
  assert.deepEqual(attempts.map(r=>r.status),[502,409]);assert.equal(effects,1);
  await restart();assert.equal((await request('approve',approval)).status,409);assert.equal(effects,1);
  const uncertain=(await request('state')).body.runs[0];assert.equal(uncertain.supervisor.actions[0].state,'uncertain');assert.equal(uncertain.events[0].status,'uncertain');
  // A committed claim followed by process death before dispatch is equally non-replayable.
  const next=await request('trial',{agentId:'agent'});assert.equal(next.status,200);
  await request('simulate-claim',{runId:next.body.runId});await restart();
  const claimed=(await request('state')).body.runs.find((r:any)=>r.id===next.body.runId);
  assert.equal(claimed.status,'interrupted');assert.equal(claimed.supervisor.actions[0].state,'uncertain');assert.equal(claimed.supervisor.journal.at(-1).reason,'restart');assert.equal(effects,1);
  // A successful later action remains terminal after another process restart.
  loseResponse=false;const success=await request('trial',{agentId:'agent'});
  const successRun=(await request('state')).body.runs.find((r:any)=>r.id===success.body.runId);
  assert.equal((await request('approve',{runId:successRun.id,approvalId:successRun.pending.id})).status,200);
  await restart();assert.equal((await request('state')).body.runs.find((r:any)=>r.id===successRun.id).supervisor.actions[0].state,'succeeded');assert.equal(effects,2);
  console.log('Supervisor Worker acceptance passed: transactional SQLite claims, full process restarts, exact approval recovery, concurrent replay, lost provider result, claimed-but-unsent uncertainty and retained success.');
} finally {await mf.dispose();await rm(persist,{recursive:true,force:true});}
