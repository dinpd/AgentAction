import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from '../node_modules/esbuild/lib/main.js';
import { Miniflare, convertV4MiniflareOptions } from '../node_modules/miniflare/dist/src/index.js';
export async function readinessFixture() {
  const calls:string[]=[];
  const bundled=await build({entryPoints:[fileURLToPath(new URL('../src/readiness-worker.ts',import.meta.url))],bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers'],write:false});
  const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'readiness-test',modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-09-18',
    durableObjects:{MCP_READINESS:{className:'McpReadiness',useSQLite:true}},ratelimits:{CHECK_LIMITER:{namespace_id:"247",simple:{limit:5,period:60}}},
    outboundService:async request=>{
      const url=new URL(request.url);calls.push(request.url);
      assert.equal(request.headers.has('authorization'),false);assert.equal(request.headers.has('cookie'),false);
      if(url.hostname==='cloudflare-dns.com')return Response.json({Status:0,Answer:url.searchParams.get('type')==='A'?[{type:1,data:url.searchParams.get('name')==='private.vendor.com'?'127.0.0.1':'93.184.216.34'}]:[]});
      if(request.method==='DELETE')return new Response(null,{status:204});
      if(request.method==='POST') {
        const body=await request.json() as {id:number;method:string;params?:Record<string,any>};
        if(request.headers.get("mcp-protocol-version")==="2026-07-28")assert.deepEqual(body.params?._meta?.["io.modelcontextprotocol/clientCapabilities"],{});assert.ok(['initialize','notifications/initialized','tools/list'].includes(body.method));
        if(url.hostname==='auth.vendor.com')return new Response(null,{status:401});
        if(url.hostname==='redirect.vendor.com')return new Response(null,{status:302,headers:{location:'https://127.0.0.1/private'}});
        if(body.method==='notifications/initialized')return new Response(null,{status:202});
        const tools=url.hostname==='empty.vendor.com'?[]:[{name:'send_message',description:'Send <img src=x onerror=alert(1)> message',inputSchema:{type:url.hostname==='bad.vendor.com'?'string':'object',properties:{text:{type:'string'}}}}];
        return Response.json({jsonrpc:'2.0',id:body.id,result:body.method==='initialize'?{protocolVersion:'2025-11-25',serverInfo:{name:'Fixture',version:'1.2.3'}}:{tools}});
      }
      return new Response(null,{status:404});
    },
  }]}));
  const headers={'origin':'https://checker.test','x-readiness-request':'mcp-check','content-type':'application/json','cf-connecting-ip':'192.0.2.1'};
  let ip=1;
  const post=(path:string,body:unknown)=>mf.dispatchFetch('https://checker.test'+path,{method:'POST',headers:{...headers,'cf-connecting-ip':`192.0.2.${ip++}`},body:JSON.stringify(body)});
  return {mf,calls,headers,post};
}
