import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { advertisedTools, directorySource, normalizeDirectory, type Directory } from '../src/mcp-directory.ts';
import { RegistryCatalog, type CatalogStorage } from '../src/mcp-registry.ts';
import { searchCatalogs } from '../src/mcp-catalog-search.ts';
import worker from '../src/worker.ts';
const stamp='2026-09-21T12:00:00.000Z';
const tools=[{name:'lookup_records',description:'Retrieve public records with identifiers.',inputSchema:{type:'object',properties:{license_number:{type:'string'}}},outputSchema:{type:'object',properties:{license_history:{type:'array',items:{type:'object',properties:{status:{type:'string'}}}}}}}];
const smithery={qualifiedName:'publisher/records',displayName:'Records API',description:'Query public records',remote:true,deploymentUrl:'https://records.example/mcp',tools};
const glama={namespace:'org.records',slug:'records',name:'Records API',description:'Query public records',connection:{transport:'streamable_http',url:'https://records.example/mcp',authType:'oauth2'},toolCount:1,tools,lastTestedAt:stamp};
function harness(source?: ReturnType<typeof directorySource>) {
  const db=new DatabaseSync(':memory:');let now=Date.parse(stamp),alarm:number|null=null;
  const storage:CatalogStorage={sql:{exec(q,...p){assert.ok(p.length<=100);const rows=db.prepare(q).all(...p) as Record<string,unknown>[];return {toArray:()=>rows};}},transactionSync(fn){db.exec('BEGIN');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}},async setAlarm(n){alarm=n;},async getAlarm(){return alarm;}};
  const catalog=new RegistryCatalog(storage,async()=>{throw new Error('No official fetch expected');},()=>now,source);
  return {catalog,storage,db,async tick(){now=alarm ?? now;alarm=null;await catalog.alarm();}};
}
function mock(source:Directory,pages:unknown[]) {
 const calls:Array<{url:string;init:RequestInit|undefined}>=[];
 const fetcher:typeof fetch=async(url,init)=>{calls.push({url:String(url),init});assert.equal(new URL(String(url)).origin,source==='smithery'?'https://api.smithery.ai':'https://glama.ai');assert.equal(init?.redirect,'manual');assert.ok(init?.signal);assert.equal(new Headers(init?.headers).get('authorization'),'Bearer directory-key');const page=pages.shift();if(page instanceof Error)throw page;if(page instanceof Response)return page;assert.ok(page,'unexpected request');return Response.json(page);};
 return {source:directorySource(source,'directory-key',fetcher,()=>Date.parse(stamp)),calls};
}
const sPage=(items:unknown[],currentPage=1,totalPages=1)=>({servers:items,pagination:{currentPage,totalPages}});
const gPage=(items:unknown[],endCursor?:string)=>({connectors:items,pageInfo:{hasNextPage:Boolean(endCursor),endCursor:endCursor ?? null}});

test('Smithery fetches deterministic public remote listings and tool schemas without contacting the server',async()=>{
 const m=mock('smithery',[sPage([smithery],1,2),smithery,sPage([],2,2)]);
 const first=await m.source.readPage();assert.equal(first.cursor,'2');const server=first.servers[0];assert.equal(server.catalogEvidence?.source,'smithery');assert.deepEqual(server.catalogEvidence?.tools,tools);assert.equal(server.catalogEvidence?.retrievedAt,stamp);assert.deepEqual(server.endpoints,['https://records.example/mcp']);
 const next=await m.source.readPage(first.cursor);assert.equal(next.cursor,undefined);
 assert.equal(new URL(m.calls[0].url).searchParams.get('seed'),'245');assert.match(m.calls[1].url,/\/servers\/publisher%2Frecords$/);assert.equal(m.calls.length,3);assert.doesNotMatch(JSON.stringify(server),/directory-key/);
});
test('Glama keeps attribution, nullable schemas, observed dates and opaque cursor boundaries',async()=>{
 const m=mock('glama',[gPage([glama],'opaque/+cursor'),{...glama,tools:[{name:'contacts',inputSchema:null,outputSchema:null}]},gPage([])]);
 const page=await m.source.readPage();assert.equal(page.cursor,'opaque/+cursor');const e=page.servers[0].catalogEvidence!;assert.equal(e.url,'https://glama.ai/mcp/connectors/org.records/records');assert.equal(e.status,'partial');assert.equal(e.observedAt,stamp);
 await m.source.readPage(page.cursor);assert.equal(new URL(m.calls[2].url).searchParams.get('after'),'opaque/+cursor');assert.equal(new URL(m.calls[0].url).searchParams.get('sort'),'name:asc');
});
test('missing catalogs mean unknown; retained schemas and catalogs are bounded without fabricated schemas',()=>{
 for(const value of [null,undefined,{},[]]) assert.equal(advertisedTools(value).status,'unknown');
 const missing=advertisedTools([{name:'read',description:'only metadata'}],10);assert.equal(missing.status,'partial');assert.equal(missing.tools[0].inputSchema,undefined);assert.equal(missing.advertisedCount,10);
 assert.equal(advertisedTools([{name:'read',inputSchema:{description:'x'.repeat(9000)}}]).tools[0].inputSchema,undefined);
 const many=advertisedTools(Array.from({length:200},(_,i)=>({name:`tool_${i}`,inputSchema:{type:'object'}})));assert.equal(many.status,'partial');assert.equal(many.tools.length,64);
 const bytes=advertisedTools(Array.from({length:64},(_,i)=>({name:`tool_${i}`,inputSchema:{description:'x'.repeat(7900)}})));assert.ok(bytes.tools.length<10);assert.equal(bytes.status,'partial');
 assert.equal(advertisedTools([{name:'a',inputSchema:{}},{name:'a',inputSchema:{}},null]).tools.length,1);
});
test('directory identity cannot be joined by title or provide unsafe endpoint configuration',()=>{
 assert.throws(()=>normalizeDirectory('smithery',smithery,{...smithery,qualifiedName:'other/records'},stamp),/identity/);
 assert.throws(()=>normalizeDirectory('glama',glama,{...glama,slug:'other'},stamp),/identity/);
 assert.equal(normalizeDirectory('smithery',{qualifiedName:'../evil'},undefined,stamp),undefined);
 assert.equal(normalizeDirectory('glama',{namespace:'org',slug:'../evil'},undefined,stamp),undefined);
 for(const url of ['javascript:alert(1)','https://user:password@example.com/mcp','https://example.com/mcp?token=secret','https://example.com/{account}']) {
   const s=normalizeDirectory('smithery',smithery,{...smithery,deploymentUrl:url},stamp)!;assert.equal(s.endpoints.length,0);assert.doesNotMatch(JSON.stringify(s),/password|token=secret/);
 }
 assert.equal(normalizeDirectory('glama',{...glama,deprecatedAt:stamp},undefined,stamp),undefined);
});
test('redirects, malformed pages, oversized responses, identity mismatches and errors never leak credentials',async()=>{
 for(const response of [new Response(null,{status:302,headers:{location:'https://evil.example'}}),new Response('x'.repeat(1048577)),new Response('PRIVATE ERROR',{status:401}),{servers:'bad'},sPage([],1,2),sPage([],4,4),new Error('secret'),sPage([{...smithery,description:'directory-key'}])]){
   const m=mock('smithery',[response]);await assert.rejects(m.source.readPage());assert.equal(m.calls.length,1);
 }
 const m=mock('smithery',[sPage([smithery]),{...smithery,qualifiedName:'evil/identity'}]);await assert.rejects(m.source.readPage(),/identity/);
 for(const page of [{connectors:[],pageInfo:{}},{connectors:[glama],pageInfo:{hasNextPage:true,endCursor:null}}]) await assert.rejects(mock('glama',[page]).source.readPage());
 await assert.rejects(directorySource('smithery','').readPage(),/not configured/);
});
test('tool and result field metadata are searchable locally; no queries or account data leave the cache',async()=>{
 const m=mock('smithery',[sPage([smithery]),smithery]);const h=harness(m.source);await h.tick();
 const result=await h.catalog.search({query:'License History',mode:'suggest',capability:'',offset:0});assert.equal(result.total,1);assert.equal(result.servers[0].title,'Records API');assert.deepEqual(result.servers[0].matchTerms,['license']);assert.equal(result.sources?.[0].withTools,1);
 assert.equal((await h.catalog.search({query:'license_history',capability:'',offset:0})).total,1);
 await h.catalog.search({query:'PRIVATE WORKFLOW 123',capability:'',offset:0});assert.equal(m.calls.length,2);assert.ok(!JSON.stringify(m.calls).includes('PRIVATE'));h.db.close();
});
test('failed detail refresh preserves the complete prior snapshot and eviction resumes source pagination',async()=>{
 const m=mock('smithery',[sPage([smithery]),smithery,sPage([smithery]),new Response('SECRET UPSTREAM',{status:429})]);const h=harness(m.source);await h.tick();const before=await h.catalog.search({query:'',capability:'',offset:0});await h.tick();
 const after=await h.catalog.search({query:'',capability:'',offset:0});assert.equal(after.total,1);assert.equal(after.updatedAt,before.updatedAt);assert.equal(after.stale,true);assert.doesNotMatch(JSON.stringify(after),/SECRET|directory-key/);h.db.close();
 const m2=mock('glama',[gPage([glama],'next'),glama,gPage([])]);const h2=harness(m2.source);await h2.tick();const reloaded=new RegistryCatalog(h2.storage,fetch,Date.now,m2.source);await reloaded.alarm();assert.equal((await reloaded.search({query:'',capability:'',offset:0})).indexing,false);assert.match(m2.calls.at(-1)!.url,/after=next/);h2.db.close();
});
test('source merging ranks specific tools and advances every source without dropping paginated listings',async()=>{
 const s=normalizeDirectory('smithery',smithery,smithery,stamp)!;const g=normalizeDirectory('glama',glama,glama,stamp)!;
 const h=harness();const empty=await h.catalog.search({query:'',capability:'',offset:0});
 const calls:string[]=[];const ns={getByName(name:string){calls.push(name);return {async search(q:any,source:any){assert.equal(source+'-v1',name);assert.equal(q.offset,20);if(source==='glama')throw new Error('SECRET');return {...empty,servers:source==='smithery'?[s]:[g],total:source==='smithery'?21:50,nextOffset:source==='smithery'?null:40,sources:[{name:source,status:'ready',listings:50,withTools:1,updatedAt:stamp}]};}};}};
 const result=await searchCatalogs(ns,{query:'License History',capability:'',offset:20,mode:'suggest'},['smithery','glama']);assert.equal(result.servers.length,2);assert.equal(result.total,71);assert.equal(result.nextOffset,40);assert.equal(result.sources!.at(-1)!.status,'unavailable');assert.doesNotMatch(JSON.stringify(result),/SECRET/);assert.equal(calls.length,3);
 const single=await searchCatalogs({getByName(){return {async search(){return empty;}};}},{query:'',capability:'',offset:0},[]);assert.equal(single.sources!.filter(s=>s.status==='not configured').length,2);h.db.close();
});
test('configured directory keys stay behind membership checks and never appear in the catalog response',async()=>{
 const h=harness();const empty=await h.catalog.search({query:'',capability:'',offset:0});const names:string[]=[];
 const env={CONSOLE_ENVIRONMENT:'development',CONSOLE_ENABLE_MOCK_IDENTITY:'true',CONSOLE_MOCK_TENANT_ID:'ws',CONSOLE_MOCK_SUBJECT:'test-operator',CONSOLE_STATIC_TENANT_ROLE:'viewer',MCP_SMITHERY_API_KEY:'secret-smithery',MCP_GLAMA_API_KEY:'secret-glama',MCP_REGISTRY:{getByName(name:string){names.push(name);return {async search(){return empty;}};}}};
 assert.equal((await worker.fetch(new Request('https://console.test/api/agents/other/catalog'),env)).status,403);assert.equal(names.length,0);
 const res=await worker.fetch(new Request('https://console.test/api/agents/ws/catalog'),env);assert.equal(res.status,200);assert.deepEqual(names,['official-v1','smithery-v1','glama-v1']);assert.doesNotMatch(await res.text(),/secret-smithery|secret-glama/);h.db.close();
});
