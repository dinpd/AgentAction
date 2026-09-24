import test from 'node:test';
import assert from 'node:assert/strict';
import { publicServers, profilePath } from '../src/mcp-public-profiles.ts';
import { READINESS_RULESET, type ReadinessSummary } from '../src/mcp-readiness.ts';

const name = 'io.github.example/server';
const raw = {server:{name,title:'Example <script>alert(1)</script>',description:'Search the web & documents',version:'1.2.3',websiteUrl:'javascript:alert(1)',remotes:[{type:'streamable-http',url:'https://mcp.example.com/mcp',headers:[{name:'Authorization',value:'DO-NOT-EXPOSE',isSecret:true}]}]},_meta:{'io.modelcontextprotocol.registry/official':{status:'active',isLatest:true,updatedAt:'2026-09-24T00:00:00Z'}}};
const now = Date.parse('2026-09-24T12:00:00Z');
const report: ReadinessSummary = {id:'a'.repeat(64),endpoint:'https://mcp.example.com/mcp',checkedAt:'2026-09-22T12:00:00Z',expiresAt:'2026-09-23T12:00:00Z',ruleset:READINESS_RULESET,requestedProtocol:'2025-11-25',observedProtocol:'2025-11-25',visibility:'public-tools',catalogFingerprint:null,toolCount:2,stale:false,reviewCount:1,failureCount:0,toolNames:['search']};
const url = (path: string) => new URL('https://mcpcheck.agentaction.dev'+path);
const fake = (body: unknown, status=200) => async () => Response.json(body,{status});

test('anonymous profile uses fixed exact registry URL, escapes metadata, excludes credentials and matches only public endpoint evidence',async()=>{
 const calls:string[]=[];
 const response=await publicServers(url(profilePath(name)),{now:()=>now,fetcher:async(input,init)=>{
   calls.push(String(input));assert.equal(init?.redirect,'manual');assert.deepEqual(init?.headers,{accept:'application/json'});return Response.json(raw);
 },lookup:async endpoints=>{assert.deepEqual(endpoints,['https://mcp.example.com/mcp']);return [report,{...report,id:'b'.repeat(64),endpoint:'https://unrelated.example/mcp'}];}});
 const html=await response.text();assert.equal(response.status,200);
 assert.deepEqual(calls,['https://registry.modelcontextprotocol.io/v0.1/servers/io.github.example%2Fserver/versions/latest']);
 assert.match(html,/Example &lt;script&gt;/);assert.doesNotMatch(html,/<script>|javascript:|DO-NOT-EXPOSE|unrelated\.example|b{64}/);
 assert.match(html,/Stale observation/);assert.match(html,/Execution, account permissions, side effects and retries remain untested/);
 assert.match(html,/has not been verified by the maintainer/);assert.match(html,/Authorization header/);
 const correction=html.match(/href="(https:\/\/github.com\/dinpd\/AgentAction\/issues\/new[^\"]+)"/)!;
 const draft=new URL(correction[1].replaceAll('&amp;','&'));assert.equal(draft.searchParams.get('title'),'[Listing correction] '+name);assert.ok(draft.searchParams.get('body')?.includes('Profile: https://mcpcheck.agentaction.dev'+profilePath(name)));
 assert.match(html,/Check this endpoint/);assert.match(response.headers.get('content-security-policy')!,/default-src 'none'/);
});

test('search preserves query in pagination, filters inactive listings and does not query report storage',async()=>{
 let requests=0;
 const response=await publicServers(url('/servers?q=search%26docs'),{fetcher:async(input)=>{requests++;const u=new URL(String(input));assert.equal(u.searchParams.get('search'),'search&docs');assert.equal(u.searchParams.get('limit'),'20');return Response.json({servers:[raw,{...raw,_meta:{'io.modelcontextprotocol.registry/official':{status:'deleted',isLatest:true}}}],metadata:{nextCursor:'opaque/+='}});},lookup:async()=>{throw Error('Directory must not read reports');}});
 const html=await response.text();assert.equal(requests,1);assert.match(html,/q=search%26docs&amp;cursor=opaque%2F%2B%3D/);assert.equal((html.match(/class="listing"/g)||[]).length,1);assert.match(html,/other directories are not included/);
});

test('input validation runs before any external work and errors do not disclose raw upstream bodies',async()=>{
 let calls=0;const deps={fetcher:async()=>{calls++;throw Error('SECRET-UPSTREAM');},lookup:async()=>[]};
 for(const path of ['/servers?url=https://evil.test','/servers?q=a&q=b','/servers?q='+'x'.repeat(201),'/servers/%ZZ','/servers/example','/servers/'+encodeURIComponent('example/../secret'),'/servers/'+encodeURIComponent(name)+'?token=x'])assert.equal((await publicServers(url(path),deps)).status,400,path);
 assert.equal(calls,0);
 const failed=await publicServers(url(profilePath(name)),deps);assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/SECRET-UPSTREAM/);
 for(const status of [302,401,500])assert.equal((await publicServers(url(profilePath(name)),{...deps,fetcher:fake({error:'SECRET'},status)})).status,503);
 assert.equal((await publicServers(url(profilePath(name)),{...deps,fetcher:fake({},404)})).status,404);
 assert.equal((await publicServers(url(profilePath(name)),{...deps,fetcher:fake({...raw,server:{...raw.server,name:'other/server'}})})).status,502);
 assert.equal((await publicServers(url(profilePath(name)),{...deps,fetcher:fake({...raw,_meta:{}})})).status,404);
 const huge=await publicServers(url('/servers'),{...deps,fetcher:fake({padding:'x'.repeat(1_048_576)})});assert.notEqual(huge.status,200);
});

test('local packages and unavailable evidence remain discoverable without implying provider failure',async()=>{
 const local={...raw,server:{...raw.server,remotes:[],packages:[{registryType:'npm',identifier:'example',version:'1'}]}};
 const r=await publicServers(url(profilePath(name)),{fetcher:fake(local),lookup:async()=>{throw Error('Must not call for local-only listing');}});
 assert.equal(r.status,200);const html=await r.text();assert.match(html,/Local package/);assert.match(html,/No endpoint compatible with the public checker/);assert.match(html,/untested, not unsupported or unsafe/);
 const failed=await publicServers(url(profilePath(name)),{fetcher:fake(raw),lookup:async()=>{throw Error('private storage details');}});
 assert.equal(failed.status,200);const text=await failed.text();assert.match(text,/lookup is temporarily unavailable/);assert.doesNotMatch(text,/private storage details/);
});

test('normalized cache avoids repeated registry reads, expires and does not retain credentials',async()=>{
 const cache=new Map<string,string>();let calls=0,time=now;
 const deps={now:()=>time,fetcher:async()=>{calls++;return Response.json(raw);},lookup:async()=>[],cache:{match:async(r:Request)=>cache.has(r.url)?new Response(cache.get(r.url)):undefined,put:async(r:Request,v:Response)=>{cache.set(r.url,await v.text());}}};
 await publicServers(url(profilePath(name)),deps);await publicServers(url(profilePath(name)),deps);assert.equal(calls,1);assert.ok([...cache.keys()].every(k=>k.startsWith('https://mcpcheck.agentaction.dev/_registry-cache/v1/')));assert.doesNotMatch([...cache.values()].join(''),/DO-NOT-EXPOSE/);
 time+=300_001;await publicServers(url(profilePath(name)),deps);assert.equal(calls,2);
});
