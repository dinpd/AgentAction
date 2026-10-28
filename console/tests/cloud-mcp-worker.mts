/** Real AgentWorkspace, SQLite persistence and a provider counter outside the Worker. */
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from '../node_modules/esbuild/lib/main.js';
import {Miniflare,convertV4MiniflareOptions} from '../node_modules/miniflare/dist/src/index.js';
import {cloudPlan,cloudRequest} from './cloud-mcp-fixture.mts';
const plan=cloudPlan(),input=cloudRequest();
const bundle=await build({stdin:{contents:`
import {AgentWorkspace} from './agent-runtime-do.ts';
export class TestWorkspace extends AgentWorkspace{
 async seed(){await this.ctx.storage.put('connection:provider',{id:'provider',label:'Staging fixture',endpoint:${JSON.stringify(plan.endpoint)},protocol:${JSON.stringify(plan.protocol)},token:'WORKER-CLOUD-SECRET',tools:[${JSON.stringify(plan.tool)}],suggestions:[],status:'connected',createdAt:'2026-10-28T00:00:00Z'});}
 async simulate(id){const key='mcp-test:'+id,record=await this.ctx.storage.get(key);await this.ctx.storage.put(key,{...record,state:'running'});}
 async records(){return [...(await this.ctx.storage.list({prefix:'mcp-test:'})).values()];}
}
export default {async fetch(request,env){const stub=env.AGENT_WORKSPACES.getByName('workspace:acme'),url=new URL(request.url);
 if(url.pathname==='/seed'){await stub.seed();return Response.json({ok:true});}
 if(url.pathname==='/simulate'){await stub.simulate((await request.json()).id);return Response.json({ok:true});}
 if(url.pathname==='/records')return Response.json(await stub.records());
 return stub.request(new Request(request,{headers:{'content-type':'application/json','x-runtime-workspace':'acme','x-runtime-role':'owner'}}));
}};
`,resolveDir:fileURLToPath(new URL('../src/',import.meta.url))},bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers'],write:false});
const persistence=await mkdtemp(join(tmpdir(),'agentaction-cloud-worker-'));let effects=0,loseResponse=true;
const create=()=>new Miniflare(convertV4MiniflareOptions({resourcePersistencePath:persistence,workers:[{name:'cloud-test',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-07-20',durableObjects:{AGENT_WORKSPACES:{className:'TestWorkspace',useSQLite:true}},outboundService:async request=>{
 if(request.url.startsWith('https://cloudflare-dns.com/'))return Response.json({Status:0,Answer:new URL(request.url).searchParams.get('type')==='A'?[{type:1,data:'1.1.1.1'}]:[]});
 assert.equal(request.url,plan.endpoint);assert.equal(request.headers.get('authorization'),'Bearer WORKER-CLOUD-SECRET');
 if(request.method==='DELETE')return new Response(null,{status:204});const rpc=await request.json() as any;
 if(rpc.method==='notifications/initialized')return new Response(null,{status:202});
 if(rpc.method==='tools/call'){effects++;if(loseResponse)return new Response('lost after provider commit',{status:502});if(!Object.hasOwn(rpc.params.arguments,'query'))return Response.json({jsonrpc:'2.0',id:rpc.id,error:{code:-32602,message:'WORKER-CLOUD-SECRET'}});}
 const result=rpc.method==='initialize'?{protocolVersion:plan.protocol}:rpc.method==='tools/list'?{tools:[plan.tool]}:rpc.params.arguments.query==='missing'?{isError:true,content:[{type:'text',text:'WORKER-CLOUD-SECRET'}]}:{content:[{type:'text',text:'Found WORKER-CLOUD-SECRET'}],structuredContent:{found:true}};
 return Response.json({jsonrpc:'2.0',id:rpc.id,result});
}}]}));
let mf=create();const request=async(path:string,body?:unknown)=>{const response=await mf.dispatchFetch('https://runtime.test/'+path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json() as any;assert.ok(!JSON.stringify(data).includes('WORKER-CLOUD-SECRET'));return {status:response.status,body:data};};
const restart=async()=>{await mf.dispose();mf=create();};
try{
 await request('seed');const lost=await request('test-run',input);assert.equal(lost.body.status,'inconclusive');assert.equal(effects,1);assert.equal(lost.body.calls,1);
 await restart();assert.deepEqual((await request('test-run',input)).body,lost.body);assert.equal(effects,1);
 await request('simulate',{id:input.requestId});await restart();const recovered=await request('test-run',input);assert.equal(recovered.body.status,'inconclusive');assert.equal(recovered.body.calls,null);assert.equal(effects,1);
 loseResponse=false;const next=cloudRequest(),results=await Promise.all([request('test-run',next),request('test-run',next)]);assert.ok(results.every(r=>r.body.status==='passed'));assert.deepEqual(results[0].body,results[1].body);assert.equal(effects,4);
 await restart();assert.equal((await request('test-run',next)).body.status,'passed');assert.equal(effects,4);const records=await request('records');assert.ok(!JSON.stringify(records).includes('"query"'));
 console.log('Hosted Worker acceptance passed: real SQLite claims, independent provider commits, lost response, full restarts, unknown interrupted effects, concurrent duplicate suppression, retained reports and no raw inputs/results or credentials.');
}finally{await mf.dispose();await rm(persistence,{recursive:true,force:true});}
