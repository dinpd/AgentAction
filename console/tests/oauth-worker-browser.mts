/** Controlled OAuth provider against the real bundled Worker and Durable Object. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { Miniflare, convertV4MiniflareOptions } from '../node_modules/miniflare/dist/src/index.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin='https://console.agentaction.dev', issuer='https://mcp.notion.com';
const provider=JSON.parse(readFileSync(new URL('../examples/oauth-notion.json',import.meta.url),'utf8'));
let challenge='',tokenCalls=0,revocations=0;
const token='WORKER-OAUTH-ACCESS-SECRET',refresh='WORKER-OAUTH-REFRESH-SECRET';
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'oauth-test',modules:true,script:readFileSync(process.env.CONSOLE_BUNDLE || '/tmp/agentpass-console-worker-dist/entry.js','utf8'),compatibilityDate:'2026-07-20',
 bindings:{CONSOLE_ENVIRONMENT:'development',CONSOLE_ENABLE_MOCK_IDENTITY:'true',CONSOLE_MOCK_TENANT_ID:'acme',CONSOLE_MOCK_SUBJECT:'test-owner',AGENT_MCP_ENDPOINTS:provider[0].endpoint,AGENT_OAUTH_ENABLED:'true',AGENT_OAUTH_ORIGIN:origin,AGENT_OAUTH_ACTIVE_KEY:'test',AGENT_OAUTH_KEYS:JSON.stringify({test:Buffer.alloc(32,7).toString('base64')}),AGENT_OAUTH_PROVIDERS:JSON.stringify(provider)},
 durableObjects:{AGENT_WORKSPACES:{className:'AgentWorkspace',useSQLite:true}},
 outboundService:async request=>{
  const url=new URL(request.url);
  if(url.hostname==='cloudflare-dns.com')return Response.json({Status:0,Answer:[{type:1,data:'104.18.1.1'}]});
  if(url.pathname==='/.well-known/oauth-protected-resource')return Response.json({resource:issuer,authorization_servers:[issuer]});
  if(url.pathname==='/.well-known/oauth-authorization-server')return Response.json({issuer,authorization_endpoint:`${issuer}/authorize`,token_endpoint:`${issuer}/token`,revocation_endpoint:`${issuer}/revoke`,code_challenge_methods_supported:['S256'],response_types_supported:['code'],client_id_metadata_document_supported:true});
  if(url.pathname==='/token'){
   tokenCalls++;const body=new URLSearchParams(await request.text());
   assert.equal(body.get('resource'),issuer);assert.equal(body.get('redirect_uri'),`${origin}/oauth/mcp/callback`);
   const actual=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body.get('code_verifier')!))).toString('base64url');assert.equal(actual,challenge);
   return Response.json({token_type:'Bearer',access_token:token,refresh_token:refresh,scope:'default'});
  }
  if(url.pathname==='/revoke'){revocations++;return new Response(null,{status:200});}
  if(url.pathname==='/mcp'){
   if (!request.headers.has('authorization')) return new Response(null,{status:401,headers:{'www-authenticate':`Bearer resource_metadata="${issuer}/.well-known/oauth-protected-resource"`}});
   assert.equal(request.headers.get('authorization'),`Bearer ${token}`);
   const rpc=await request.json() as any;
   if(rpc.method==='notifications/initialized')return new Response(null,{status:202});
   const result=rpc.method==='initialize'?{protocolVersion:'2025-03-26',capabilities:{tools:{}}}:{tools:Array.from({length:4},(_,i)=>({name:`search_${i}`,description:'Search workspace pages',inputSchema:{type:'object',properties:{query:{type:'string',description:'Provider schema documentation. '.repeat(1500)}},required:['query']}}))};
   return Response.json({jsonrpc:'2.0',id:rpc.id,result});
  }
  throw new Error(`Unexpected outbound ${url}`);
 }
}]}));
// Local HTTP bridge preserves the configured public origin inside the Worker.
// This lets the browser follow genuine 303 responses without external DNS.
const server=createServer(async(req,res)=>{
 const url=new URL(req.url!,origin);
 if(url.pathname.startsWith('/api/automations/')){res.setHeader('content-type','application/json');res.end(JSON.stringify({agents:[],runs:[],settings:{}}));return;}
 let body='';for await(const chunk of req)body+=chunk;
 const headers=new Headers(Object.entries(req.headers).flatMap(([k,v])=>v===undefined?[]:[[k,Array.isArray(v)?v.join(','):v]]));
 if(headers.has('origin'))headers.set('origin',origin);
 const response=await mf.dispatchFetch(url.href,{method:req.method,headers,...(body?{body}:{}),redirect:'manual'});
 res.statusCode=response.status;response.headers.forEach((v,k)=>{if(!['content-length','transfer-encoding','content-encoding'].includes(k))res.setHeader(k,k==='location'?v.replace(origin,local):v);});
 if(url.pathname==='/oauth/mcp/callback'){assert.equal(response.status,303);assert.match(response.headers.get('location')!,/oauth=connected#connect$/);}
 res.end(Buffer.from(await response.arrayBuffer()));
});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const local=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors:string[]=[];
page.setDefaultTimeout(45000);
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await page.route(`${issuer}/authorize?**`,async route=>{
 const url=new URL(route.request().url());challenge=url.searchParams.get('code_challenge')!;
 assert.equal(url.searchParams.get('redirect_uri'),`${origin}/oauth/mcp/callback`);
 const callback=new URL(`${local}/oauth/mcp/callback`);callback.searchParams.set('state',url.searchParams.get('state')!);callback.searchParams.set('code','controlled-code');callback.searchParams.set('iss',issuer);
 await route.fulfill({contentType:'text/html',body:`<h1>Controlled provider consent</h1><a href="${callback.href.replaceAll('&','&amp;')}">Allow workspace sharing</a>`});
});
try {
 await page.goto(`${local}/agents?workspace=acme#connect`);
 await page.locator('#builder').waitFor();
 await page.locator('#manual-connect').click();
 await page.locator('#connect [name=endpoint]').fill(provider[0].endpoint);
 await page.getByText('Review: Tool catalog requires authentication',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Connect with Notion',exact:true}).click();
 await page.getByRole('link',{name:'Allow workspace sharing'}).click();
 await page.locator('#oauth-feedback').filter({hasText:'Notion · https://mcp.notion.com/mcp: Connected'}).waitFor();
 assert.equal(await page.locator('#precheck-endpoint').inputValue(),provider[0].endpoint);
 assert.equal(await page.locator('#connections-feedback').innerText(),'');
 assert.equal(await page.locator('#oauth-options + #oauth-feedback').count(),1);
 assert.ok((await page.locator('#connection-target').innerText()).includes('Notion'));
 assert.ok((await page.locator('#inspection-target').innerText()).includes(provider[0].endpoint));
 assert.equal(await page.locator('#precheck-heading').innerText(),'Connection status');
 assert.equal(await page.getByText('Connected · 4 tools discovered',{exact:true}).isVisible(),true);
 assert.equal(await page.getByText('Review: Tool catalog requires authentication',{exact:true}).isVisible(),false);
 assert.equal(await page.locator('[data-anonymous-history]').getAttribute('open'),null);
 assert.match(await page.locator('#precheck-status').innerText(),/Connected to Notion/);
 assert.equal(tokenCalls,1);assert.match(await page.locator('#connections').innerText(),/Shared workspace OAuth/);
 assert.ok(!(await page.content()).includes(token));assert.ok(!(await page.content()).includes(refresh));
 await mf.unsafeEvictDurableObject('oauth-test','AgentWorkspace',{name:'workspace:acme'});
 await page.reload();await page.locator('#manage-connections').click();await page.getByRole('button',{name:'Reconnect shared OAuth account'}).waitFor();
 assert.match(await page.locator('#connections').innerText(),/test-owner/);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'/tmp/agentaction-oauth-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Disconnect',exact:true}).click();
 await page.locator('#connections-feedback').filter({hasText:'provider revocation accepted'}).waitFor();assert.equal(revocations,1);
 assert.equal(await page.locator('#precheck-heading').innerText(),'Connection status');
 assert.equal(await page.getByText('Disconnected · 4 cached tools',{exact:true}).isVisible(),true);
 assert.equal(await page.getByText('Connected · 4 tools discovered',{exact:true}).count(),0);
 assert.equal(await page.getByText('Review: Tool catalog requires authentication',{exact:true}).isVisible(),false);
 assert.match(await page.locator('#precheck-results').innerText(),/Access is disconnected; reconnect/);
 await page.reload();await page.locator('#manage-connections').click();
 assert.equal(await page.getByText('Disconnected · 4 cached tools',{exact:true}).isVisible(),true);
 await page.goto(`${local}/agents?workspace=acme&oauth=failed&oauth_failure=discovery&oauth_provider=notion#connect`);
 await page.locator('#oauth-feedback').filter({hasText:'OAuth authorization succeeded, but MCP tool discovery failed.'}).waitFor();
 assert.ok(!page.url().includes('oauth_failure'));
 assert.match(await page.locator('#oauth-feedback').innerText(),/Notion · https:\/\/mcp.notion.com\/mcp/);
 await page.locator('#precheck-endpoint').fill('https://another.example/mcp');
 assert.equal(await page.locator('#oauth-feedback').isVisible(),false);
 await page.goto(`${local}/agents?workspace=acme&oauth=failed&oauth_failure=PRIVATE-PROVIDER-ERROR&oauth_provider=untrusted-provider#connect`);
 await page.locator('#oauth-feedback').filter({hasText:'OAuth callback failed or expired.'}).waitFor();
 assert.ok(!(await page.locator('body').innerText()).includes('PRIVATE-PROVIDER-ERROR'));
 await page.screenshot({path:'/tmp/agentaction-257-inline-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS OAuth Worker/browser: PKCE consent redirect, authenticated callback, durable grant across eviction, shared ownership UI, mobile, disconnect and no credential leakage.');
} catch(error) {console.error({url:page.url(),errors,body:(await page.locator('body').innerText()).slice(-7000)});throw error;}
finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));await mf.dispose();}
