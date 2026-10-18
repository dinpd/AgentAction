/** Real Hermes processes, native middleware, production machine ingress and durable Worker SQLite. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {build} from '../node_modules/esbuild/lib/main.js';
import {Miniflare,convertV4MiniflareOptions} from '../node_modules/miniflare/dist/src/index.js';

const runtime=process.env.HERMES_RUNTIME,python=process.env.HERMES_PYTHON || 'python3';
assert.ok(runtime,'Set HERMES_RUNTIME to the pinned Hermes checkout. This acceptance must not silently skip.');
const temp=await mkdtemp(join(tmpdir(),'agentaction-hermes-'));
const bundle=await build({stdin:{contents:`
  import worker from './worker.ts';
  export {AgentWorkspace} from './agent-runtime-do.ts';
  export default {async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname.startsWith('/operator/'))return env.AGENT_WORKSPACES.getByName('workspace:acme').request(new Request('https://runtime.test/'+url.pathname.slice(10),{method:request.method,headers:{'x-runtime-role':'owner','x-runtime-actor':'acceptance-reviewer','x-runtime-workspace':'acme','content-type':'application/json'},...(request.method==='POST'?{body:await request.text()}:{})}));
    return worker.fetch(request,env);
  }};`,resolveDir:fileURLToPath(new URL('../src/',import.meta.url))},bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers'],write:false});
const create=()=>new Miniflare(convertV4MiniflareOptions({resourcePersistencePath:join(temp,'sqlite'),workers:[{name:'hermes-supervisor',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-07-20',durableObjects:{AGENT_WORKSPACES:{className:'AgentWorkspace',useSQLite:true}}}]}));
let mf=create(),count=0,loseClaim=false;
const operator=async(action:string,body?:unknown)=>{const r=await mf.dispatchFetch('https://console.test/operator/'+action,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await r.json() as any;assert.equal(r.status,200,JSON.stringify(value));return value;};
const restart=async()=>{await mf.dispose();mf=create();};
const effects=async()=>Number(await readFile(join(temp,'effects'),'utf8').catch(()=> '0'));
const registered=await operator('external-register',{title:'Real Hermes synthetic refunds',tools:['synthetic_refund']});
const invoke=async(session:string,extra:Record<string,unknown>={})=>{
  const home=join(temp,'home-'+(++count));await mkdir(home);
  const child=spawn(python,[fileURLToPath(new URL('./fixtures/hermes-execution.py',import.meta.url))],{env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:['pipe','pipe','pipe']});
  child.stdin.write(JSON.stringify({home,runtime,token:registered.token,agentId:registered.agentId,plugin:fileURLToPath(new URL('../../integrations/hermes-agentaction/',import.meta.url)),effects:join(temp,'effects'),session,...extra})+'\n');
  let output:any,err='';child.stderr.on('data',chunk=>{err+=chunk.toString();});
  const closed=new Promise<number|null>(resolve=>child.on('close',resolve));
  for await(const line of createInterface({input:child.stdout})) {
    let event:any;try{event=JSON.parse(line);}catch{continue;}
    if(event.type==='done')output=event.value;
    if(event.type==='rpc') {
      const r=await mf.dispatchFetch(event.url,{method:'POST',headers:event.headers,body:event.body}),body=await r.json() as any;
      const lost=loseClaim && event.url.endsWith('/claim') && r.status===200;
      if(lost)loseClaim=false;
      child.stdin.write(JSON.stringify({status:lost?502:r.status,body})+'\n');
      assert.ok(!JSON.stringify(body).includes(registered.token));
    }
  }
  assert.equal(await closed,0,err);assert.ok(output,'Hermes returned no result: '+err);return String(output);
};
const pending=async()=>{const state=await operator('state');return state.runs.find((r:any)=>r.pending);};
try {
  assert.match(await invoke('lost-effect',{path:'agent',observe:true}),/blocked/);assert.equal(await effects(),0);
  const before=await pending();await restart();const restored=await pending();assert.deepEqual(restored.pending,before.pending);
  await operator('approve',{runId:restored.id,approvalId:restored.pending.id});await restart();
  assert.match(await invoke('lost-effect',{path:'agent',lostResult:true}),/blocked/);assert.equal(await effects(),1);
  await restart();assert.match(await invoke('lost-effect'),/blocked/);assert.equal(await effects(),1);
  let state=await operator('state');assert.equal(state.runs.find((r:any)=>r.id===restored.id).supervisor.actions[0].state,'uncertain');
  assert.match(await invoke('success',{limits:{maxCalls:1}}),/blocked/);let p=await pending();await operator('approve',{runId:p.id,approvalId:p.pending.id});
  assert.match(await invoke('success',{limits:{maxCalls:1}}),/synthetic-refund/);assert.equal(await effects(),2);
  await restart();assert.match(await invoke('success',{limits:{maxCalls:1}}),/blocked/);assert.equal(await effects(),2);
  assert.match(await invoke('claim-loss'),/blocked/);p=await pending();await operator('approve',{runId:p.id,approvalId:p.pending.id});loseClaim=true;
  assert.match(await invoke('claim-loss'),/blocked/);assert.equal(await effects(),2);await restart();assert.match(await invoke('claim-loss'),/blocked/);assert.equal(await effects(),2);
  assert.match(await invoke('incompatible',{incompatible:true,path:'agent'}),/dedicated profile/);assert.equal(await effects(),2);
  state=await operator('state');assert.ok(!JSON.stringify(state).includes('never-export'));assert.ok(!JSON.stringify(state).includes(registered.token));
  console.log('Hermes acceptance passed: real PluginContext, agent and model_tools dispatch paths, pending approval restoration, single-use claims, independent synthetic refund counter, lost provider result, lost claim response, process/Worker restarts and incompatible-plugin blocking.');
} finally {await mf.dispose();await rm(temp,{recursive:true,force:true});}
