import { mcpFailureReason, RuntimeError } from '../src/mcp-client.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentRuntime, type RuntimeStorage, type Connection, type Agent, type Run } from '../src/agent-runtime.ts';
import { WorkspaceOAuth, oauthProviders, oauthStateWorkspace, oauthClientMetadata, type OAuthProvider } from '../src/mcp-oauth.ts';
import worker from '../src/worker.ts';

class Storage implements RuntimeStorage {
  data = new Map<string, unknown>(); alarm?: number;
  async get<T>(key: string) { return structuredClone(this.data.get(key)) as T | undefined; }
  async put<T>(key: string, value: T) { this.data.set(key, structuredClone(value)); }
  async delete(key: string) { return this.data.delete(key); }
  async list<T>({ prefix }: { prefix: string }): Promise<Map<string, T>> { return new Map([...this.data].filter(([k]) => k.startsWith(prefix)).map(([k,v]) => [k, structuredClone(v) as T])); }
  async setAlarm(n: number) { this.alarm = n; }
  async deleteAlarm() { this.alarm = undefined; }
}
const endpoint = 'https://mcp.notion.com/mcp';
const provider: OAuthProvider = { id: 'notion', label: 'Notion', endpoint, resource: 'https://mcp.notion.com', resourceMetadata: 'https://mcp.notion.com/.well-known/oauth-protected-resource', issuer: 'https://mcp.notion.com', scopes: ['default'] };
const origin = 'https://console.agentaction.dev';
const key = btoa('a'.repeat(32));
const tool = { name: 'search', description: 'Search workspace pages', inputSchema: { type: 'object', properties: {}, additionalProperties: false } };
function harness() {
  const storage = new Storage();
  const env = { AGENT_OAUTH_ENABLED: 'true', AGENT_OAUTH_ORIGIN: origin, AGENT_OAUTH_ACTIVE_KEY: 'one', AGENT_OAUTH_KEYS: JSON.stringify({one:key}), AGENT_OAUTH_PROVIDERS: JSON.stringify([provider]), AGENT_MCP_ENDPOINTS: endpoint, AGENT_AI: { async run(_: string, input: unknown) { prompts.push(JSON.stringify(input)); return { response: outputs.shift(), usage: { total_tokens: 1 } }; } } };
  const requests: Array<{url: string; init: RequestInit}> = [], prompts: string[] = [], outputs: unknown[] = [];
  let sequence = 0, tokenCalls = 0, refreshCalls = 0, revokeCalls = 0, calls = 0, rejectToken = false, rejectMcp = false, malicious = false, scopeChanged = false, failRevoke = false, authCode = 'valid-code', expectedChallenge = '', metadataOverrides: Record<string, unknown> = {}, tokenOverrides: Record<string, unknown> = {};
  const token = () => `ACCESS-SECRET-${sequence}`;
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = String(input); requests.push({ url, init });
    assert.equal(init.redirect, 'manual');
    if (url.startsWith('https://cloudflare-dns.com/')) return Response.json({ Status: 0, Answer: [{type: 1, data: malicious ? '127.0.0.1' : '104.18.1.1'}] });
    if (url === provider.resourceMetadata) return Response.json({ resource: provider.resource, authorization_servers: [provider.issuer] });
    if (url.includes('/.well-known/oauth-authorization-server')) return Response.json({ issuer: provider.issuer, authorization_endpoint: `${provider.issuer}/authorize`, token_endpoint: `${provider.issuer}/token`, revocation_endpoint: `${provider.issuer}/revoke`, code_challenge_methods_supported: ['S256'], response_types_supported: ['code'], client_id_metadata_document_supported: true, authorization_response_iss_parameter_supported: true, token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'], ...metadataOverrides });
    if (url.endsWith('/token')) {
      tokenCalls++;
      const body = new URLSearchParams(String(init.body));
      assert.equal(body.get('resource'), provider.resource);
      assert.equal(body.get('client_id'), JSON.parse(env.AGENT_OAUTH_PROVIDERS)[0].clientId || oauthClientMetadata(env).client_id);
      if (rejectToken) return Response.json({ error: 'invalid_grant', detail: 'DO-NOT-LEAK' }, {status: 400});
      if (body.get('grant_type') === 'authorization_code') {
        assert.equal(body.get('code'), authCode); assert.equal(body.get('redirect_uri'), `${origin}/oauth/mcp/callback`);
        const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.get('code_verifier')!))).toString('base64url');
        if (challenge !== expectedChallenge) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      } else { refreshCalls++; assert.equal(body.get('refresh_token'), `REFRESH-SECRET-${sequence}`); }
      sequence++;
      return Response.json({ token_type: 'Bearer', access_token: token(), refresh_token: `REFRESH-SECRET-${sequence}`, expires_in: 3600, scope: scopeChanged ? 'admin' : 'default', ...tokenOverrides });
    }
    if (url.endsWith('/revoke')) { revokeCalls++; return new Response(null, {status: failRevoke ? 500 : 200}); }
    if (url === endpoint) {
      assert.equal(new Headers(init.headers).get('authorization'), `Bearer ${token()}`);
      if (rejectMcp) return new Response(null, {status: 401});
      if (init.method === 'DELETE') return new Response(null, {status: 204});
      const rpc = JSON.parse(String(init.body));
      if (rpc.method === 'notifications/initialized') return new Response(null, {status: 202});
      if (rpc.method === 'tools/call') calls++;
      const result = rpc.method === 'initialize' ? {protocolVersion: '2025-03-26', capabilities: {tools: {}}} : rpc.method === 'tools/list' ? {tools: [tool]} : {content: [{type: 'text', text: `Pages found ${token()} REFRESH-SECRET-${sequence}`} ]};
      return Response.json({jsonrpc: '2.0', id: rpc.id, result});
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const runtime = new AgentRuntime(storage, env, fetcher);
  const request = async (path: string, body: unknown, role = 'owner', actor = 'owner-a', workspace = 'team-a') => {
    const response = await runtime.handle(new Request(`https://runtime.internal/${path}`, { method: 'POST', headers: {'x-runtime-role':role,'x-runtime-actor':actor,'x-runtime-workspace':workspace}, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() as any };
  };
  const start = async (connectionId?: string) => {
    const result = await request('oauth-start', {providerId:'notion', shared:true, ...(connectionId ? {connectionId} : {})});
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const url = new URL(result.body.authorizationUrl); expectedChallenge = url.searchParams.get('code_challenge')!;
    return url;
  };
  const complete = (url: URL, extra = {}, actor = 'owner-a') => request('oauth-complete', {state:url.searchParams.get('state'), code:authCode, iss:provider.issuer, ...extra}, 'owner', actor);
  const connect = async () => { const url = await start(); const r = await complete(url); assert.equal(r.status,200,JSON.stringify(r.body)); return r.body.connectionId as string; };
  const vault = () => new WorkspaceOAuth(storage,env,'team-a',fetcher);
  const grantRecord = async () => [...(await storage.list<any>({prefix:'oauth-grant:'})).keys()][0];
  const editGrant = async (values: Record<string,unknown>) => { const record=await grantRecord(), grant=await vault().read<any>(record); await storage.put(record,await vault().seal(record,{...grant,...values})); };
  const seedAgent = async (connectionId: string) => {
    const agent: Agent = { id:'agent-1', connectionId, title:'Workspace search',goal:'Find pages',setup:'Read only',success:'Pages found',tools:['search'],status:'active',nextRun:Date.now()-1,createdAt:new Date().toISOString(),lastTrial:'old-trial' };
    await storage.put('agent:agent-1',agent); return agent;
  };
  return {storage,env,runtime,fetcher,request,start,complete,connect,vault,editGrant,seedAgent,requests,prompts,outputs, counts:()=>({tokenCalls,refreshCalls,revokeCalls,calls}), rejectToken:()=>rejectToken=true,rejectMcp:()=>rejectMcp=true,privateDns:()=>malicious=true,changeScopes:()=>scopeChanged=true,failRevoke:()=>failRevoke=true,metadata:(v:Record<string,unknown>)=>metadataOverrides=v,tokens:(v:Record<string,unknown>)=>tokenOverrides=v,badPkce:()=>expectedChallenge='wrong'};
}

test('owner OAuth callback encrypts shared credentials and discovers the actual account; no secrets in snapshots', async()=>{
 const h=harness(); const url=await h.start();
 assert.equal(url.origin, provider.issuer); assert.equal(url.searchParams.get('resource'),provider.resource);
 assert.equal(url.searchParams.get('code_challenge_method'),'S256'); assert.equal(oauthStateWorkspace(url.searchParams.get('state')!), 'team-a');
 assert.equal((await h.complete(url)).status,200);
 const snapshot=await h.runtime.snapshot() as any; assert.equal(snapshot.connections[0].oauth.ownership,'workspace');assert.equal(snapshot.connections[0].tools[0].name,'search');
 assert.ok(!JSON.stringify([...h.storage.data]).includes('ACCESS-SECRET'));assert.ok(!JSON.stringify([...h.storage.data]).includes('REFRESH-SECRET'));
 assert.ok(!JSON.stringify(snapshot).includes('SECRET')); assert.equal(snapshot.connections[0].token,undefined);
 assert.equal((await h.complete(url)).status,400);assert.equal(h.counts().tokenCalls,1);
});

test('owner-only lifecycle and state bound to subject/workspace; member role must remain owner at callback',async()=>{
 const h=harness();
 for(const role of ['operator','viewer']) assert.equal((await h.request('oauth-start',{providerId:'notion',shared:true},role)).status,403);
 const url=await h.start();assert.equal((await h.complete(url,{},'owner-b')).status,403);
 assert.equal((await h.request('oauth-complete',{state:url.searchParams.get('state'),code:'valid-code',iss:provider.issuer},'operator')).status,403);
 assert.equal((await h.request('oauth-complete',{state:url.searchParams.get('state'),code:'valid-code',iss:provider.issuer},'owner','owner-a','team-b')).status,403);
 const result=await h.complete(url);assert.equal(result.status,200);
 assert.equal((await h.request('disconnect',{connectionId:result.body.connectionId},'operator')).status,403);
 assert.equal((await h.request('connect',{connectionId:result.body.connectionId,token:'replacement'},'operator')).status,409);
 assert.equal((await h.request('disconnect',{connectionId:result.body.connectionId},'owner','owner-b')).status,200);
});

test('rejects expired, incorrect, replayed state, issuer substitution/missing issuer and denied consent before token exchange',async()=>{
 for(const extra of [{iss:'https://evil.com'},{iss:undefined},{error:'access_denied'},{state:'invalid'}]) {
  const h=harness();const u=await h.start(); const r=await h.complete(u,extra);assert.equal(r.status,400);assert.equal(h.counts().tokenCalls,0);assert.ok(!JSON.stringify(r.body).includes('evil.com'));
 }
 const h=harness();const u=await h.start(), record=`oauth-pending:${u.searchParams.get('state')}`;
 const pending=await h.vault().read<any>(record);await h.storage.put(record,await h.vault().seal(record,{...pending,expires:Date.now()-1}));
 assert.equal((await h.complete(u)).status,400);assert.equal(h.counts().tokenCalls,0);
});

test('PKCE failure, unsafe discovery and incompatible client registration fail closed',async()=>{
 const h=harness();const u=await h.start();h.badPkce();assert.equal((await h.complete(u)).status,409);
 for(const metadata of [{issuer:'https://evil.com'},{code_challenge_methods_supported:['plain']},{client_id_metadata_document_supported:false},{token_endpoint:'https://127.0.0.1/token'},{authorization_endpoint:'https://evil.internal/authorize'}]) {
  const x=harness();x.metadata(metadata);assert.notEqual((await x.request('oauth-start',{providerId:'notion',shared:true})).status,200);assert.equal(x.counts().tokenCalls,0);
 }
 const x=harness();x.privateDns();assert.notEqual((await x.request('oauth-start',{providerId:'notion',shared:true})).status,200);
});

test('workspace operators can use a shared account after connector departure; schedules use it and results are redacted',async()=>{
 const h=harness(), id=await h.connect();await h.seedAgent(id);
 h.outputs.push({type:'call',tool:'search',arguments:{}});
 await h.runtime.alarm();
 const run=[...(await h.storage.list<Run>({prefix:'run:'})).values()][0];assert.equal(run.kind,'scheduled');assert.equal(run.status,'awaiting_approval');
 h.outputs.push({type:'finish',summary:'Pages found',outcome:'met',reason:'Search returned pages'});
 const response=await h.request('approve',{runId:run.id,approvalId:run.pending!.id},'operator','different-member');assert.equal(response.status,200,JSON.stringify(response.body));
 assert.equal(h.counts().calls,1);assert.ok(h.prompts.every(p=>!p.includes('SECRET')));
 assert.ok(!JSON.stringify(await h.runtime.snapshot()).includes('SECRET'));
});

test('expired credentials refresh once under concurrent workspace requests; rotation persists encrypted',async()=>{
 const h=harness(),id=await h.connect();await h.editGrant({expires:0});
 const results=await Promise.all([h.request('refresh-capabilities',{connectionId:id},'operator'),h.request('refresh-capabilities',{connectionId:id},'operator')]);
 assert.ok(results.every(r=>r.status===200));assert.equal(h.counts().refreshCalls,1);assert.ok(!JSON.stringify([...h.storage.data]).includes('SECRET'));
});

test('refresh failure, changed scope and interrupted refresh stop use and invalidate trials without a tool replay',async()=>{
 for(const failure of ['reject','scope','interrupted']) {
  const h=harness(),id=await h.connect();await h.seedAgent(id);await h.editGrant({expires:0,...(failure==='interrupted'?{refreshing:true}:{})});
  if(failure==='reject')h.rejectToken();if(failure==='scope')h.changeScopes();
  const r=await h.request('refresh-capabilities',{connectionId:id},'operator');assert.notEqual(r.status,200);assert.ok(!JSON.stringify(r).includes('DO-NOT-LEAK'));
  const agent=await h.storage.get<Agent>('agent:agent-1');assert.equal(agent?.status,'paused');assert.equal(agent?.lastTrial,undefined);assert.equal(h.counts().calls,0);
  const count=h.counts().tokenCalls;await h.request('refresh-capabilities',{connectionId:id});assert.equal(h.counts().tokenCalls,count);
 }
});

test('provider 401 invalidates grant; disconnect always removes local credential even when revocation fails',async()=>{
 const h=harness(),id=await h.connect();await h.seedAgent(id);h.rejectMcp();assert.notEqual((await h.request('refresh-capabilities',{connectionId:id})).status,200);
 h.failRevoke();const r=await h.request('disconnect',{connectionId:id});assert.equal(r.status,200);assert.equal(r.body.revoked,false);
 assert.equal((await h.storage.list({prefix:'oauth-grant:'})).size,0);assert.equal((await h.storage.get<Agent>('agent:agent-1'))?.status,'paused');
});

test('replacing a grant cancels pending approvals, pauses agents, revokes old grant and cancels sibling pending callbacks',async()=>{
 const h=harness(),id=await h.connect();await h.seedAgent(id);h.outputs.push({type:'call',tool:'search',arguments:{}});await h.runtime.alarm();
 const sibling=await h.start(id);const url=await h.start(id);assert.equal((await h.complete(url)).status,200);
 assert.equal((await h.storage.get<Agent>('agent:agent-1'))?.status,'paused');assert.equal([...(await h.storage.list<Run>({prefix:'run:'})).values()][0].status,'cancelled');
 assert.equal((await h.storage.list({prefix:'oauth-grant:'})).size,1);assert.equal(h.counts().revokeCalls,1);assert.equal((await h.complete(sibling)).status,400);
});

test('encryption binds ciphertext to workspace and record; key rotation rewrites old records',async()=>{
 const h=harness();await h.connect();const record=[...(await h.storage.list({prefix:'oauth-grant:'})).keys()][0];
 const other=new WorkspaceOAuth(h.storage,h.env,'team-b',h.fetcher);await assert.rejects(other.read(record));
 await h.storage.put('oauth-grant:copy',await h.storage.get(record));await assert.rejects(h.vault().read('oauth-grant:copy'));await h.storage.delete('oauth-grant:copy');
 h.env.AGENT_OAUTH_KEYS=JSON.stringify({one:key,two:btoa('b'.repeat(32))});h.env.AGENT_OAUTH_ACTIVE_KEY='two';await h.vault().read(record);
 assert.equal((await h.storage.get<any>(record)).key,'two');h.env.AGENT_OAUTH_KEYS=JSON.stringify({two:btoa('b'.repeat(32))});assert.ok(await h.vault().read(record));
});

test('feature flag, exact provider/resource config and endpoint approval remain mandatory',async()=>{
 const h=harness();h.env.AGENT_OAUTH_ENABLED='false';assert.deepEqual(oauthProviders(h.env),[]);assert.equal((await h.request('oauth-start',{providerId:'notion',shared:true})).status,400);
 h.env.AGENT_OAUTH_ENABLED='true';h.env.AGENT_MCP_ENDPOINTS='';assert.equal((await h.request('oauth-start',{providerId:'notion',shared:true})).status,403);
 h.env.AGENT_OAUTH_PROVIDERS=JSON.stringify([{...provider,resource:'https://unrelated.com'}]);assert.throws(()=>oauthProviders(h.env));
});

test('public client metadata is credential-free and restricted to configured origin; demo has no OAuth',async()=>{
 const h=harness();const r=await worker.fetch(new Request(`${origin}/.well-known/oauth-client.json`),h.env);assert.equal(r.status,200);assert.equal((await r.json() as any).redirect_uris[0],`${origin}/oauth/mcp/callback`);
 assert.equal((await worker.fetch(new Request('https://wrong.com/.well-known/oauth-client.json'),h.env)).status,404);
 const demo=await worker.fetch(new Request(`${origin}/.well-known/oauth-client.json`),{...h.env,CONSOLE_PUBLIC_DEMO:'true'});assert.notEqual(demo.status,200);
});


test('preregistered public and confidential clients work without client metadata discovery',async()=>{
 for (const method of ['none','client_secret_post','client_secret_basic']) {
  const h=harness();h.env.AGENT_OAUTH_PROVIDERS=JSON.stringify([{...provider,clientId:'registered-client',clientAuth:method,...(method==='none'?{}:{clientSecret:'CLIENT-SECRET'})}]);
  h.metadata({client_id_metadata_document_supported:false});await h.connect();
  const req=h.requests.find(r=>r.url.endsWith('/token'))!;const body=new URLSearchParams(String(req.init.body));
  assert.equal(body.get('client_secret'),method==='client_secret_post'?'CLIENT-SECRET':null);
  assert.equal(new Headers(req.init.headers).has('authorization'),method==='client_secret_basic');
  assert.ok(!JSON.stringify(await h.runtime.snapshot()).includes('CLIENT-SECRET'));
  assert.ok(!(await h.vault().scrub('CLIENT-SECRET')).includes('CLIENT-SECRET') || method==='none');
 }
});

test('endpoint approval removed during consent blocks token exchange and provider settings changed during consent require restart',async()=>{
 const h=harness(),url=await h.start();h.env.AGENT_MCP_ENDPOINTS='';assert.equal((await h.complete(url)).status,403);assert.equal(h.counts().tokenCalls,0);
 const x=harness(),pending=await x.start();x.env.AGENT_OAUTH_PROVIDERS=JSON.stringify([{...provider,scopes:['changed']}]);assert.equal((await x.complete(pending)).status,409);assert.equal(x.counts().tokenCalls,0);
});

test('metadata/token redirects never receive forwarded credentials',async()=>{
 for(const target of ['/.well-known/oauth-protected-resource','/token']) {
  const h=harness();const fetcher:typeof fetch=async(input,init)=>String(input).endsWith(target)?new Response(null,{status:302,headers:{location:'https://evil.com/token'}}):h.fetcher(input,init);
  const runtime=new AgentRuntime(h.storage,h.env,fetcher);
  const call=async(path:string,body:unknown)=>runtime.handle(new Request('https://runtime.internal/'+path,{method:'POST',headers:{'x-runtime-role':'owner','x-runtime-actor':'owner-a','x-runtime-workspace':'team-a'},body:JSON.stringify(body)}));
  const start=await call('oauth-start',{providerId:'notion',shared:true});
  if(target==='/token') {assert.equal(start.status,200);const u=new URL((await start.json() as any).authorizationUrl);assert.equal((await call('oauth-complete',{state:u.searchParams.get('state'),code:'valid-code',iss:provider.issuer})).status,409);}else assert.notEqual(start.status,200);
  assert.ok(!h.requests.some(r=>r.url.includes('evil.com')));
 }
});

test('owner can remove a grant and pending states even after its encryption key is lost',async()=>{
 const h=harness(),id=await h.connect();await h.start(id);
 h.env.AGENT_OAUTH_KEYS=JSON.stringify({two:btoa('b'.repeat(32))});h.env.AGENT_OAUTH_ACTIVE_KEY='two';
 const result=await h.request('disconnect',{connectionId:id});assert.equal(result.status,200);assert.equal(result.body.revoked,false);
 assert.equal((await h.storage.list({prefix:'oauth-grant:'})).size,0);assert.equal((await h.storage.list({prefix:'oauth-pending:'})).size,0);
 const u=await h.start(id);assert.equal((await h.complete(u)).status,200);
});


test('optional and long token lifetimes use bounded leases and still rotate on expiry',async()=>{
 for(const expiry of [undefined, 315360000]) {
  const h=harness();h.tokens({expires_in:expiry});const before=Date.now(),id=await h.connect();
  const record=[...(await h.storage.list({prefix:'oauth-grant:'})).keys()][0];
  const grant=await h.vault().read<any>(record), lease=expiry===undefined?3600000:31536000000;
  assert.ok(grant.expires>=before+lease && grant.expires<=Date.now()+lease);
  await h.editGrant({expires:0});assert.equal((await h.request('refresh-capabilities',{connectionId:id})).status,200);assert.equal(h.counts().refreshCalls,1);
 }
});

test('invalid explicit expiry remains rejected and callback stages expose no provider text',async()=>{
 for(const expiry of [null,0,-1,'3600']) {
  const h=harness();h.tokens({expires_in:expiry});const r=await h.complete(await h.start());
  assert.equal(r.status,409);assert.equal(r.body.oauthFailure,'response');assert.equal((await h.storage.list({prefix:'oauth-grant:'})).size,0);
 }
 for(const stage of ['authorization','exchange','discovery']) {
  const h=harness(),u=await h.start();
  if(stage==='exchange')h.rejectToken();if(stage==='discovery')h.rejectMcp();
  const r=await h.complete(u,stage==='authorization'?{error:'SECRET-PROVIDER-ERROR'}:{});
  assert.equal(r.body.oauthFailure,stage);assert.ok(!JSON.stringify(r).includes('SECRET'));assert.ok(!JSON.stringify(r).includes('DO-NOT-LEAK'));
 }
});


test('discovery diagnostics only allow fixed local categories',()=>{
 assert.equal(mcpFailureReason(new RuntimeError('A tool schema is too large.')),'schema_limit');
 for(const value of [new Error('PRIVATE-CODE'), new RuntimeError('SECRET-TOKEN'), new RuntimeError('__proto__'), null]) assert.equal(mcpFailureReason(value),'unexpected');
});
