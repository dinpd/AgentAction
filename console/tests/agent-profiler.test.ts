import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentRuntime, type RuntimeStorage } from '../src/agent-runtime.ts';
import { agentIdeas } from '../src/agent-profiler.ts';
class Storage implements RuntimeStorage {
  data=new Map<string,any>();
  async get<T>(key:string){return structuredClone(this.data.get(key)) as T|undefined;}
  async put<T>(key:string,value:T){this.data.set(key,structuredClone(value));}
  async delete(key:string){return this.data.delete(key);}
  async list<T>({prefix}:{prefix:string}){return new Map([...this.data].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v) as T]));}
  async setAlarm(){} async deleteAlarm(){}
}
const idea={title:'Support theme brief',benefit:'Spot recurring questions to improve help content.',description:'Summarize themes in the support tickets I provide and draft help article ideas for my review.',capabilities:[{label:'Read support tickets',matches:[] as string[]}]};
function harness(output:any={ideas:[idea]}) {
  const storage=new Storage(),prompts:any[]=[];
  const runtime=new AgentRuntime(storage,{AGENT_MCP_ENDPOINTS:'https://support.example/mcp',AGENT_AI:{async run(_:string,input:any){prompts.push(input);return {response:output};}}},async()=>{throw new Error('Profiler must not call MCP');});
  const request=async(body:any={area:'Customer support'},role='operator')=>{const r=await runtime.handle(new Request('https://runtime.test/profile-agents',{method:'POST',headers:{'x-runtime-role':role},body:JSON.stringify(body)}));return {status:r.status,body:await r.json() as any};};
  const connect=()=>storage.put('connection:support',{id:'support',label:'Private account',status:'connected',endpoint:'https://support.example/mcp',token:'TEST-ONLY-MCP-SECRET',tools:[{name:'read_tickets',description:'Read tickets TEST-ONLY-MCP-SECRET',inputSchema:{type:'object'}},{name:'upload_file',inputSchema:{type:'object',properties:{filePath:{type:'string'}}}}]});
  return {storage,runtime,request,prompts,connect};
}
test('profiler works before connecting servers and persists only quota counters',async()=>{
  const h=harness();const r=await h.request({area:'Customer support',context:'Reduce repeat questions'});
  assert.equal(r.status,200);assert.deepEqual(r.body.ideas,[idea]);
  const prompt=JSON.parse(h.prompts[0].messages[1].content);assert.deepEqual(prompt,{area:'Customer support',context:'Reduce repeat questions'});
  assert.deepEqual([...h.storage.data.keys()].sort(),['limit:inference','limit:suggest']);
  const snapshot=await h.runtime.snapshot();assert.deepEqual(snapshot.drafts,[]);assert.deepEqual(snapshot.agents,[]);assert.deepEqual(snapshot.runs,[]);
});
test('Engineering inference is identical with no servers, unrelated economic tools, disconnected and unapproved endpoints',async()=>{
  const h=harness(),body={area:'Engineering',context:'Improve release quality'};
  assert.equal((await h.request(body)).status,200);
  await h.connect();const c=h.storage.data.get('connection:support');
  c.tools=[{name:'get_unemployment',description:'Analyze unemployment rates',inputSchema:{type:'object'}},{name:'get_cpi',description:'Research inflation and labor trends',inputSchema:{type:'object'}}];
  assert.equal((await h.request(body)).status,200);
  c.status='disconnected';assert.equal((await h.request(body)).status,200);
  c.status='connected';c.endpoint='https://not-approved.example/mcp';assert.equal((await h.request(body)).status,200);
  assert.equal(h.prompts.length,4);
  for(const prompt of h.prompts) {
    assert.deepEqual(JSON.parse(prompt.messages[1].content),body);
    assert.deepEqual(prompt,h.prompts[0]);
    assert.doesNotMatch(JSON.stringify(prompt),/get_unemployment|get_cpi|inflation|TEST-ONLY-MCP-SECRET|Private account|connectionId|not-approved/);
  }
  assert.deepEqual([...(await h.storage.list({prefix:'draft:'})).keys()],[]);
});
test('profiler still rejects input credentials without supplying account context to inference',async()=>{
  const h=harness();await h.connect();assert.equal((await h.request()).status,200);
  assert.equal((await h.request({area:'TEST-ONLY-MCP-SECRET'})).status,400);
  assert.equal((await h.request({area:'Support',context:'TEST-ONLY-MCP-SECRET'})).status,400);
  assert.equal(h.prompts.length,1);
});
test('profiler rejects unauthorized, unbounded and unexpected input before inference',async()=>{
  const h=harness();assert.equal((await h.request(undefined,'viewer')).status,403);
  for(const body of [{},{area:''},{area:'a'.repeat(101)},{area:'Support',context:'x'.repeat(1001)},{area:'Support',connectionId:'foreign'},{area:'Support',context:12},{area:'Support',context:'Bearer fake-credential'}]) assert.equal((await h.request(body)).status,400);
  assert.equal(h.prompts.length,0);
});
test('profiler rejects fabricated matches, duplicates, oversized and executable model output',()=>{
  assert.deepEqual(agentIdeas({ideas:[idea]}),[idea]);
  for(const value of [{ideas:[]},{ideas:Array(4).fill(idea)},{ideas:[idea,idea]},{ideas:[{...idea,title:'x'.repeat(81)}]},{ideas:[{...idea,capabilities:[]}]},{ideas:[{...idea,capabilities:[{label:'Read',matches:['unknown']}]}]},{ideas:[{...idea,capabilities:[{label:'Read',matches:['tool_0','tool_0']}]}]},{ideas:[{...idea,bindings:{step_1:'support'}}]},{ideas:[idea],execute:true}]) assert.throws(()=>agentIdeas(value));
});
test('profiler accepts abstract capabilities but rejects credential output and any server mapping',async()=>{
  const abstract={...idea,capabilities:[{label:'Read support tickets'}]};
  assert.deepEqual(agentIdeas({ideas:[abstract]}),[idea]);
  const secrets=harness({ideas:[{...idea,description:'TEST-ONLY-MCP-SECRET'}]});await secrets.connect();assert.equal((await secrets.request()).status,400);
  const bound=harness({ideas:[{...idea,capabilities:[{label:'Read',matches:['tool_0']}]}]});
  assert.equal((await bound.request()).status,502);await bound.connect();assert.equal((await bound.request()).status,502);
});
test('profiler shares daily suggestion and inference quotas and reports unavailable AI',async()=>{
  for(const [key,limit] of [['suggest',12],['inference',120]] as const) {
    const h=harness();await h.storage.put('limit:'+key,{day:new Date().toISOString().slice(0,10),count:limit});assert.equal((await h.request()).status,429);assert.equal(h.prompts.length,0);
  }
  const h=harness();h.runtime.env.AGENT_AI=undefined;assert.equal((await h.request()).status,503);
});
