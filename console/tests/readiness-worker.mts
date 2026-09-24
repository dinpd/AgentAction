import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readinessFixture } from './readiness-fixture.mts';
const {mf,calls,headers,post}=await readinessFixture();
const endpoint='https://mcp.vendor.com/mcp';
try {
  const html=await mf.dispatchFetch('https://mcpcheck.agentaction.dev/');assert.equal(html.status,200);assert.match(html.headers.get('content-security-policy')!,/script-src 'self'/);assert.match(await html.text(),/MCP READINESS CHECK/);
  const script=await (await mf.dispatchFetch('https://mcpcheck.agentaction.dev/assets/check.js')).text();
  const listeners:string[]=[];
  runInNewContext(script,{URLSearchParams,document:{getElementById:(id:string)=>({addEventListener:(event:string)=>listeners.push(id+':'+event)})},location:{pathname:'/'}},{timeout:1000});
  assert.deepEqual(listeners,['check-form:submit','export:click']);
  const css=await (await mf.dispatchFetch('https://mcpcheck.agentaction.dev/assets/check.css')).text();
  assert.doesNotMatch(css,/Soleil|@font-face|\/res\//i);
  let response=await post('/api/check',{endpoint,protocol:'2026-07-28',publish:false});assert.equal(response.status,200);const hidden=await response.json() as any;assert.equal(hidden.published,false);assert.equal(hidden.id,null);assert.equal(hidden.report.readiness.coverage.execution,'untested');
  assert.deepEqual(await (await post('/api/lookup',[endpoint])).json(),[]);
  response=await post('/api/check',{endpoint,protocol:'2025-11-25',publish:true});assert.equal(response.status,200);const published=await response.json() as any;assert.ok(published.id);assert.equal(published.report.readiness.server.version,'1.2.3');
  await mf.unsafeEvictDurableObject('readiness-test','McpReadiness',{name:'public-v1'});
  response=await mf.dispatchFetch('https://mcpcheck.agentaction.dev/api/reports/'+published.id);assert.equal(response.status,200);assert.deepEqual(await response.json(),published);
  assert.equal((await mf.dispatchFetch('https://mcpcheck.agentaction.dev/reports/'+published.id)).status,200);
  const legacy=await mf.dispatchFetch('https://agentaction-mcp-check.drisw.workers.dev/api/reports/'+published.id);
  assert.deepEqual(await legacy.json(),published);
  assert.equal((await mf.dispatchFetch('https://mcpcheck.agentaction.dev/api/check',{method:'POST',headers:{...headers,origin:'https://agentaction-mcp-check.drisw.workers.dev'},body:'{}'})).status,403);
  const lookup=await (await post('/api/lookup',[endpoint,endpoint+'/other'])).json() as any[];assert.equal(lookup.length,1);assert.equal(lookup[0].id,published.id);assert.equal(lookup[0].stale,false);
  for(const host of ['auth','private','redirect','bad','empty']){
    const r=await (await post('/api/check',{endpoint:`https://${host}.vendor.com/mcp`,protocol:'2026-07-28',publish:false})).json() as any;
    assert.ok(r.report,JSON.stringify(r));const p=r.report.readiness;
    if(host==='auth')assert.equal(p.visibility,'authentication-required');
    if(['private','redirect'].includes(host))assert.equal(p.visibility,'unavailable');
    if(host==='bad')assert.ok(p.findings.some((f:any)=>f.status==='fail'));
    if(host==='empty'){assert.equal(p.toolCount,0);assert.equal(p.coverage.discovery,'observed');}
  }
  assert.ok(!calls.some(url=>['127.0.0.1','private.vendor.com'].includes(new URL(url).hostname)));
  const count=calls.length;
  for(const body of [{endpoint,protocol:'2026-07-28',publish:true,token:'DO-NOT-SEND'},{endpoint:'https://127.0.0.1/mcp',protocol:'2026-07-28',publish:true}])assert.equal((await post('/api/check',body)).status,400);
  assert.equal(calls.length,count);
  assert.equal((await mf.dispatchFetch('https://mcpcheck.agentaction.dev/api/check',{method:'POST',headers:{...headers,origin:'https://elsewhere.test'},body:'{}'})).status,403);
  assert.equal((await mf.dispatchFetch('https://mcpcheck.agentaction.dev/api/check')).status,404);
  assert.equal((await mf.dispatchFetch('https://mcpcheck.agentaction.dev/api/reports/'+'a'.repeat(64))).status,404);
  assert.equal((await mf.dispatchFetch('https://mcpcheck.agentaction.dev/api/check',{method:'POST',headers,body:'x'.repeat(4097)})).status,413);
  for(let i=0;i<5;i++)assert.equal((await mf.dispatchFetch('https://mcpcheck.agentaction.dev/api/check',{method:'POST',headers:{...headers,'cf-connecting-ip':'192.0.2.200'},body:JSON.stringify({endpoint,protocol:'2026-07-28',publish:false})})).status,200);
  assert.equal((await mf.dispatchFetch('https://mcpcheck.agentaction.dev/api/check',{method:'POST',headers:{...headers,'cf-connecting-ip':'192.0.2.200'},body:JSON.stringify({endpoint,protocol:'2026-07-28',publish:false})})).status,429);
  const beforePages=calls.length;
  const directory=await mf.dispatchFetch('https://mcpcheck.agentaction.dev/servers?q=vendor');assert.equal(directory.status,200);assert.match(await directory.text(),/Review server profile/);
  const profile=await mf.dispatchFetch('https://mcpcheck.agentaction.dev/servers/io.github.vendor%2Fserver');assert.equal(profile.status,200);const profileHTML=await profile.text();assert.match(profileHTML,/Vendor &lt;script&gt;/);assert.match(profileHTML,new RegExp(published.id));assert.match(profileHTML,/Suggest a correction/);
  assert.ok(calls.slice(beforePages).every(u=>new URL(u).hostname==='registry.modelcontextprotocol.io'),'Browsing must never probe a provider');
  assert.equal((await mf.dispatchFetch('https://mcpcheck.agentaction.dev/servers/io.github.vendor%2Fmissing')).status,404);
  assert.equal((await mf.dispatchFetch('https://mcpcheck.agentaction.dev/servers?q=a&q=b')).status,400);
  console.log('PASS readiness Worker: real RPC/storage/eviction, optional publication, exact lookup, auth/private/redirect/empty/malformed fixtures, no credentials/tool calls, CSP/origin/body/quota controls.');
} finally {await mf.dispose();}
