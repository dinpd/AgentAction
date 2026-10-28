import assert from 'node:assert/strict';
import { AgentRuntime, type RuntimeStorage } from '../src/agent-runtime.ts';
import { samplePlan } from '../src/mcp-test-plan.ts';
import { testTransaction } from './transaction-storage.ts';
export class CloudStorage implements RuntimeStorage {
  data=new Map<string,unknown>();
  transaction<T>(work:(tx:Pick<RuntimeStorage,'get'|'put'>)=>Promise<T>){return testTransaction(this,work);}
  async get<T>(key:string){return structuredClone(this.data.get(key)) as T|undefined;}
  async put<T>(key:string,value:T){this.data.set(key,structuredClone(value));}
  async delete(key:string){return this.data.delete(key);}
  async list<T>({prefix}:{prefix:string}){return new Map([...this.data].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v) as T]));}
  async setAlarm(){} async deleteAlarm(){}
}
export const cloudPlan=()=>({...samplePlan(),endpoint:'https://mcp.firecrawl.dev/v2/mcp'});
export const cloudRequest=(plan=cloudPlan())=>({connectionId:'provider',requestId:Date.now()+'-'+crypto.randomUUID(),plan,stagingConfirmed:true});
export async function cloudFixture(){
  const storage=new CloudStorage(),plan=cloudPlan();
  await storage.put('connection:provider',{id:'provider',label:'Synthetic cloud staging',endpoint:plan.endpoint,protocol:plan.protocol,token:'CLOUD-PROVIDER-SECRET',tools:[plan.tool],suggestions:[],status:'connected',createdAt:'2026-10-28T00:00:00Z'});
  const state={calls:[] as any[],drift:false,redirect:false,privateDNS:false,delayAfterCatalog:0,catalogs:0,protocol:plan.protocol,closed:0};
  const fetcher:typeof fetch=async(input,init={})=>{
    const url=String(input);
    if(url.startsWith('https://cloudflare-dns.com/')){
      if(state.delayAfterCatalog&&state.catalogs)await new Promise(r=>setTimeout(r,state.delayAfterCatalog));
      return Response.json({Status:0,Answer:new URL(url).searchParams.get('type')==='A'?[{type:1,data:state.privateDNS?'10.0.0.1':'1.1.1.1'}]:[]});
    }
    assert.equal(url,plan.endpoint);assert.equal(init.redirect,'manual');if(init.signal?.aborted)throw new Error('aborted');
    assert.equal(new Headers(init.headers).get('authorization'),'Bearer CLOUD-PROVIDER-SECRET');
    if(init.method==='DELETE'){state.closed++;return new Response(null,{status:204});}
    if(state.redirect)return new Response(null,{status:302,headers:{location:'https://unapproved.invalid/sink'}});
    const rpc=JSON.parse(String(init.body));
    if(rpc.method==='notifications/initialized')return new Response(null,{status:202});
    if(rpc.method==='tools/list')state.catalogs++;
    if(rpc.method==='tools/call'){
      state.calls.push(rpc.params);
      if(rpc.params.arguments.query==='slow')await new Promise((_,reject)=>init.signal!.addEventListener('abort',()=>reject(new Error('Synthetic lost response')),{once:true}));
      if(!Object.hasOwn(rpc.params.arguments,'query'))return Response.json({jsonrpc:'2.0',id:rpc.id,error:{code:-32602,message:'CLOUD-PROVIDER-SECRET'}});
    }
    const result=rpc.method==='initialize'?{protocolVersion:state.protocol}:rpc.method==='tools/list'?{tools:[{...plan.tool,...(state.drift?{inputSchema:{type:'object',properties:{changed:{type:'boolean'}}}}:{})}]}:rpc.params.arguments.query==='missing'?{isError:true,content:[{type:'text',text:'CLOUD-PROVIDER-SECRET'}]}:{content:[{type:'text',text:'Found CLOUD-PROVIDER-SECRET'}],structuredContent:{found:true}};
    return Response.json({jsonrpc:'2.0',id:rpc.id,result},{headers:{'Mcp-Session-Id':'cloud-fixture-session'}});
  };
  let runtime=new AgentRuntime(storage,{},fetcher);
  return {storage,state,get runtime(){return runtime;},async restart(){runtime=new AgentRuntime(storage,{},fetcher);await runtime.recover();},async request(path:string,body?:unknown,role='owner',workspace='acme'){
    const response=await runtime.handle(new Request('https://runtime.test/'+path,{method:body===undefined?'GET':'POST',headers:{'x-runtime-workspace':workspace,'x-runtime-role':role},...(body===undefined?{}:{body:JSON.stringify(body)})}));return {status:response.status,body:await response.json() as any};
  }};
}
