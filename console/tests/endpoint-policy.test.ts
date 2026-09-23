import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { publicEndpointURL, validatePublicEndpoint, isPublicAddress, type EndpointApproval } from "../src/endpoint-policy.ts";
import { AgentRuntime, type RuntimeStorage, type Connection, type Agent, type Run } from "../src/agent-runtime.ts";
import { McpClient, endpointURL } from "../src/mcp-client.ts";
const endpoint = "https://mcp.vendor.com/mcp";
const tool = { name: "read", description: "Read a document", inputSchema: { type: "object", properties: {}, additionalProperties: false } };
class Storage implements RuntimeStorage {
  data = new Map<string, unknown>(); alarm: number | undefined;
  async get<T>(key: string) { return structuredClone(this.data.get(key)) as T | undefined; }
  async put<T>(key: string, value: T) { assert.ok(JSON.stringify(value).length < 128000); this.data.set(key, structuredClone(value)); }
  async delete(key: string) { return this.data.delete(key); }
  async list<T>({prefix}: {prefix:string}): Promise<Map<string,T>> { return new Map([...this.data].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v) as T])); }
  async setAlarm(time: number) { this.alarm = time; }
  async deleteAlarm() { this.alarm = undefined; }
}
function harness() {
  const storage = new Storage(), requests: string[] = [], mcp: string[] = [];
  let privateDNS = false, afterDiscovery = false;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); requests.push(url.href); assert.equal(init?.redirect, "manual");
    if (url.hostname === "cloudflare-dns.com") {
      assert.equal(init?.method, undefined); assert.deepEqual(init?.headers, {accept:"application/dns-json"});
      assert.equal(url.searchParams.get("name"), "mcp.vendor.com");
      return Response.json({Status:0,Answer:url.searchParams.get("type")==="A"?[{type:1,data:privateDNS?"127.0.0.1":"93.184.216.34"}]:[]});
    }
    assert.equal(url.href,endpoint);
    if (init?.method === "DELETE") {mcp.push("DELETE");return new Response(null,{status:204});}
    const body=JSON.parse(String(init?.body));mcp.push(body.method);
    const result=body.method==="initialize"?{protocolVersion:"2025-03-26"}:body.method==="tools/list"?{tools:[tool]}:{content:[{type:"text",text:"ok"}]};
    if(body.method==="tools/list"&&afterDiscovery)privateDNS=true;
    return Response.json({jsonrpc:"2.0",id:body.id,result},{headers:{"Mcp-Session-Id":"test-session"}});
  };
  const env={AGENT_AI:{async run(){return {response:{type:"finish",summary:"done",outcome:"met",reason:"Observed result"}};}}};
  const runtime=new AgentRuntime(storage,env,fetcher);
  const request=async(path:string,body:unknown,role="owner", target=runtime)=>{const response=await target.handle(new Request(`https://runtime.test/${path}`,{method:"POST",headers:{"x-runtime-role":role,"x-runtime-actor":"owner-a"},body:JSON.stringify(body)}));return {status:response.status,body:await response.json() as any};};
  return {storage,runtime,fetcher,env,requests,mcp,request,private:()=>{privateDNS=true;},rebind:()=>{afterDiscovery=true;}};
}

test("public endpoint grammar rejects local, literal-IP and ambiguous destinations",()=>{
  for(const value of ["http://vendor.com/mcp","https://127.0.0.1/mcp","https://2130706433/mcp","https://0x7f000001/mcp","https://[::1]/mcp","https://[2606:4700::1111]/mcp","https://localhost/mcp","https://service.local/mcp","https://metadata.google.internal/mcp","https://foo.invalid/mcp","https://host.example/mcp","https://vendor.com./mcp","https://x:pw@vendor.com/mcp","https://vendor.com:8443/mcp","https://vendor.com/mcp?token=secret","https://vendor.com/mcp#x","https://vendor.com/{tenant}","https://vendor.com\\@private/mcp"," https://vendor.com/mcp","https:vendor.com/mcp"])assert.throws(()=>publicEndpointURL(value),value);
  assert.equal(publicEndpointURL("https://MCP.VENDOR.COM:443/mcp"),endpoint);
  assert.equal(publicEndpointURL("https://mcp.vendor.com/mcp/path"),endpoint+"/path");
});

test("IPv4 and IPv6 validation excludes special, private and transition ranges",()=>{
  for(const address of ["0.0.0.0","10.1.1.1","127.1.2.3","100.64.0.1","100.127.255.255","169.254.169.254","172.31.2.1","192.168.1.1","192.0.0.1","192.0.2.1","198.18.0.1","198.51.100.1","203.0.113.1","224.1.1.1","255.255.255.255","999.1.1.1","::","::1","::ffff:127.0.0.1","fc00::1","fe80::1","ff02::1","2001:db8::1","2001::1","2002:7f00:1::","64:ff9b::7f00:1","3fff::1","invalid"])assert.equal(isPublicAddress(address),false,address);
  for(const address of ["1.1.1.1","8.8.8.8","93.184.216.34","2606:4700:4700::1111","2001:4860:4860::8888"])assert.equal(isPublicAddress(address),true,address);
});

test("DNS checks fail closed for private/mixed addresses, aliases, redirects, overflow and outages",async()=>{
  for(const result of [{Status:3},{Status:0,Answer:[]},{Status:0,TC:true,Answer:[{type:1,data:"1.1.1.1"}]},{Status:0,Answer:[{type:1,data:"1.1.1.1"},{type:28,data:"::1"}]},{Status:0,Answer:[{type:5,data:"metadata.google.internal."},{type:1,data:"1.1.1.1"}]},()=>new Response(null,{status:302,headers:{location:"https://evil.test"}}),()=>new Response("x".repeat(33000)),new Error("DNS secret")]){
    await assert.rejects(()=>validatePublicEndpoint(endpoint,async()=>{if(result instanceof Error)throw result;return typeof result === "function"?result():Response.json(result);}),/could not be verified as public/);
  }
  let calls=0;
  assert.equal(await validatePublicEndpoint(endpoint,async()=>{calls++;return Response.json({Status:0,Answer:[{type:5,data:"public.vendor.com."},{type:1,data:"1.1.1.1"}]});}),endpoint);assert.equal(calls,2);
});

test("only explicit owner approval enables a persistent exact endpoint within one workspace",async()=>{
  const h=harness();
  assert.equal((await h.request("connect",{endpoint,label:"Vendor"})).status,403);
  for(const role of ["operator","viewer",""])assert.equal((await h.request("approve-endpoint",{endpoint,reviewed:true},role)).status,403);
  assert.equal((await h.request("approve-endpoint",{endpoint})).status,400);assert.equal(h.requests.length,0);
  assert.equal((await h.request("approve-endpoint",{endpoint,reviewed:true,token:"NEVER-SEND"})).status,200);
  assert.equal(h.mcp.length,0);assert.equal(h.requests.length,2);
  const approval=(await h.storage.get<EndpointApproval[]>("endpoint-approvals"))![0];assert.equal(approval.approvedBy,"owner-a");assert.ok(approval.approvedAt);assert.ok(!JSON.stringify([...h.storage.data.values()]).includes("NEVER-SEND"));
  const restarted=new AgentRuntime(h.storage,h.env,h.fetcher);
  assert.equal((await h.request("connect",{endpoint: endpoint+"/other",label:"Wrong path"},"operator",restarted)).status,403);
  assert.equal((await h.request("connect",{endpoint,label:"Vendor",token:"SECRET"},"operator",restarted)).status,200);
  assert.ok(h.mcp.includes("tools/list"));assert.ok(h.mcp.includes("DELETE"));assert.ok(!JSON.stringify(await restarted.snapshot()).includes("SECRET"));
  const other=new AgentRuntime(new Storage(),h.env,h.fetcher);assert.equal((await h.request("connect",{endpoint,label:"Other workspace"},"owner",other)).status,403);
  h.private();const before=h.mcp.length;assert.equal((await h.request("connect",{endpoint,label:"Now private"})).status,400);assert.equal(h.mcp.length,before);
});

test("revocation disconnects, clears credentials, cancels pending runs and stops schedules",async()=>{
  const h=harness();await h.request("approve-endpoint",{endpoint,reviewed:true});
  const c=await h.request("connect",{endpoint,label:"Vendor",token:"SECRET"});const connectionId=c.body.connectionId;
  await h.storage.put("agent:agent",{id:"agent",connectionId,status:"active",nextRun:Date.now()+10000} as Agent);
  await h.storage.put("run:run",{id:"run",agentId:"agent",status:"awaiting_approval",pending:{id:"call",tool:"read",arguments:{}},events:[]} as Run);
  await h.storage.setAlarm(Date.now()+10000);
  assert.equal((await h.request("remove-endpoint",{endpoint},"operator")).status,403);
  const count=h.mcp.length;assert.equal((await h.request("remove-endpoint",{endpoint})).status,200);assert.equal(h.mcp.length,count);
  const conn=(await h.storage.get<Connection>(`connection:${connectionId}`))!;assert.equal(conn.status,"disconnected");assert.equal(conn.token,undefined);
  assert.equal((await h.storage.get<Agent>("agent:agent"))!.status,"paused");assert.equal((await h.storage.get<Run>("run:run"))!.pending,undefined);assert.equal(h.storage.alarm,undefined);
  assert.equal((await h.request("connect",{endpoint,label:"Vendor"})).status,403);assert.equal((await h.request("approve",{runId:"run",approvalId:"call"})).status,409);
});

test("public DNS is checked again between discovery and tool execution, including cleanup",async()=>{
  const h=harness();await h.request("approve-endpoint",{endpoint,reviewed:true});const c=await h.request("connect",{endpoint,label:"Vendor",token:"SECRET"});
  await h.storage.put("agent:a",{id:"a",connectionId:c.body.connectionId,status:"draft",tools:[tool.name]} as Agent);
  await h.storage.put("run:r",{id:"r",agentId:"a",status:"awaiting_approval",pending:{id:"call",tool:tool.name,arguments:{}},events:[]} as Run);
  h.rebind();const before=h.mcp.filter(m=>m==="DELETE").length;assert.equal((await h.request("approve",{runId:"r",approvalId:"call"})).status,400);
  assert.ok(!h.mcp.includes("tools/call"));assert.equal(h.mcp.filter(m=>m==="DELETE").length,before);
  const run=(await h.storage.get<Run>("run:r"))!;assert.equal(run.events[0].status,"failed");assert.match(run.summary!,/before it was sent/);
});

test("workspace approval count and daily validation attempts are bounded",async()=>{
  const h=harness();await h.storage.put("endpoint-approvals",Array.from({length:32},(_,i)=>({endpoint:`https://v${i}.vendor.com/mcp`,approvedBy:"owner",approvedAt:new Date().toISOString()})));
  assert.equal((await h.request("approve-endpoint",{endpoint,reviewed:true})).status,400);assert.equal(h.requests.length,0);
  await h.storage.put("endpoint-approvals",[]);await h.storage.put("limit:endpoint-approval",{day:new Date().toISOString().slice(0,10),count:30});assert.equal((await h.request("approve-endpoint",{endpoint,reviewed:true})).status,429);
});

test("MCP redirects cannot send credentials to a second destination",async()=>{
  let calls=0;const client=new McpClient({endpoint,token:"SECRET",tools:[],protocol:"2026-07-28"},async(url,init)=>{calls++;assert.equal(url,endpoint);assert.equal(init?.redirect,"manual");return new Response(null,{status:302,headers:{location:"https://other.vendor.com/mcp"}});},async()=>{});
  await assert.rejects(()=>client.discover());assert.equal(calls,1);
});


test("removing a redundant workspace approval preserves deployment-managed access",async()=>{
  const h=harness();await h.request("approve-endpoint",{endpoint,reviewed:true});
  const runtime=new AgentRuntime(h.storage,{...h.env,AGENT_MCP_ENDPOINTS:endpoint},h.fetcher);
  const c=await h.request("connect",{endpoint,label:"Managed",token:"SECRET"},"operator",runtime);
  assert.equal(c.status,200);h.private();
  assert.equal((await h.request("remove-endpoint",{endpoint},"owner",runtime)).status,200);
  const connection=(await h.storage.get<Connection>(`connection:${c.body.connectionId}`))!;assert.equal(connection.status,"connected");assert.equal(connection.token,"SECRET");
  assert.equal((await h.request("connect",{endpoint,label:"Managed"},"operator",runtime)).status,200);
});

test("the production console retains the public global fetch network boundary",()=>{
  const config=readFileSync(new URL("../wrangler.toml",import.meta.url),"utf8");
  assert.match(config.split("[vars]")[0],/compatibility_flags\s*=\s*\["global_fetch_strictly_public"\]/);
});


test('only documented single-Actor Apify configuration passes and approvals stay exact',async()=>{
 const endpoint='https://mcp.apify.com/?tools=harshmaur/reddit-scraper';
 assert.equal(publicEndpointURL(endpoint),endpoint);
 assert.equal(endpointURL(endpoint,endpoint),endpoint);
 assert.throws(()=>endpointURL(endpoint,'https://mcp.apify.com/'),/approval/);
 assert.throws(()=>endpointURL(endpoint.replace('reddit-scraper','other-actor'),endpoint),/approval/);
 for(const invalid of [endpoint+'&token=secret',endpoint+'&tools=other/actor',endpoint+',other/actor',endpoint+'#secret',endpoint.replace('mcp.apify.com','mcp.apify.com.evil.com'),endpoint.replace('/?','/mcp?'),endpoint.replace('tools=','token='),endpoint.replace('tools=','%74ools='),endpoint.replace('/reddit','%2Freddit'),endpoint.replace('harshmaur/reddit-scraper','../actor'),endpoint.replace('https://','https://user:pw@')])assert.throws(()=>publicEndpointURL(invalid),invalid);
 const storage=new Storage(),requests:string[]=[];
 const runtime=new AgentRuntime(storage,{},async(input)=>{requests.push(String(input));return Response.json({Status:0,Answer:[{type:1,data:'1.1.1.1'}]});});
 const post=(action:string,body:unknown)=>runtime.handle(new Request('https://runtime.test/'+action,{method:'POST',headers:{'x-runtime-role':'owner'},body:JSON.stringify(body)}));
 assert.equal((await post('connect',{endpoint,label:'Apify'})).status,403);
 assert.equal(requests.length,0);
 assert.equal((await post('approve-endpoint',{endpoint,reviewed:true})).status,200);
 assert.equal((await post('connect',{endpoint:endpoint.replace('reddit-scraper','other-actor'),label:'Other'})).status,403);
 assert.equal(requests.length,2); // DNS only: no automatic MCP connection.
});
