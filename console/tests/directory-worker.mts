/** Exercises actual Worker RPC, SQL storage and alarms against directory fixtures. */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from '../node_modules/esbuild/lib/main.js';
import { Miniflare, convertV4MiniflareOptions } from '../node_modules/miniflare/dist/src/index.js';
const calls:string[]=[];
const tools=[{name:'lookup_records',description:'Retrieve public records.',inputSchema:{type:'object',properties:{license_number:{type:'string'}}}}];
const smithery={qualifiedName:'publisher/records',displayName:'Records API',description:'Public records',remote:true,deploymentUrl:'https://records.example/mcp',tools};
const glama={namespace:'org.records',slug:'records',name:'Records API',description:'Public records',connection:{transport:'streamable_http',url:'https://records.example/mcp'},toolCount:1,tools};
const bundled=await build({stdin:{contents:`
  export { McpRegistry } from './mcp-registry-do.ts';
  import { searchCatalogs } from './mcp-catalog-search.ts';
  import { parseCatalogQuery } from './mcp-registry.ts';
  export default {async fetch(request,env){return Response.json(await searchCatalogs(env.MCP_REGISTRY,parseCatalogQuery(new URL(request.url).searchParams),['smithery','glama']));}};
`,resolveDir:fileURLToPath(new URL('../src/',import.meta.url))},bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers'],write:false});
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'catalog-test',modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-07-20',
  bindings:{CONSOLE_ENVIRONMENT:'development',CONSOLE_ENABLE_MOCK_IDENTITY:'true',CONSOLE_MOCK_TENANT_ID:'ws',CONSOLE_MOCK_SUBJECT:'owner',MCP_SMITHERY_API_KEY:'smithery-secret',MCP_GLAMA_API_KEY:'glama-secret'},
  durableObjects:{MCP_REGISTRY:{className:'McpRegistry',useSQLite:true}},
  outboundService:async request=>{
    const url=new URL(request.url);calls.push(request.url);
    if(url.hostname==='registry.modelcontextprotocol.io') {assert.equal(request.headers.has('authorization'),false);return Response.json({servers:[],metadata:{}});}
    if(url.hostname==='api.smithery.ai') {assert.equal(request.headers.get('authorization'),'Bearer smithery-secret');return Response.json(url.pathname==='/servers'?{servers:[smithery],pagination:{currentPage:1,totalPages:1}}:smithery);}
    if(url.hostname==='glama.ai') {assert.equal(request.headers.get('authorization'),'Bearer glama-secret');return Response.json(url.pathname==='/api/mcp/v1/connectors'?{connectors:[glama],pageInfo:{hasNextPage:false,endCursor:null}}:glama);}
    throw new Error('Unexpected outbound host');
  },
}]}));
const search=async()=>{const response=await mf.dispatchFetch('https://console.test/api/agents/ws/catalog?q=License+History&mode=suggest');assert.equal(response.status,200);const body=await response.text();assert.doesNotMatch(body,/smithery-secret|glama-secret/);return JSON.parse(body);};
try {
  let result=await search();
  for(let i=0;i<30 && (result.indexing || result.servers.length!==2);i++){await new Promise(r=>setTimeout(r,200));result=await search();}
  assert.equal(result.servers.length,2);assert.equal(result.indexing,false);
  assert.deepEqual(result.sources.map((s:any)=>s.withTools),[0,1,1]);assert.equal(calls.length,5);
  await mf.unsafeEvictDurableObject('catalog-test','McpRegistry',{name:'smithery-v1'});
  await mf.unsafeEvictDurableObject('catalog-test','McpRegistry',{name:'glama-v1'});
  const restored=await search();assert.equal(restored.servers.length,2);assert.equal(calls.length,5);
  assert.ok(calls.every(url=>!url.includes('License') && !url.includes('ws')));
  console.log('Worker catalog acceptance passed: isolated sources, authenticated directory fetches, real RPC/SQL/alarms, local field search, eviction persistence and credential-free responses.');
} finally {await mf.dispose();}
