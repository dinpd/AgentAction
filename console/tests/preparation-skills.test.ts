import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPANY_SKILL, preparationDefinition, briefFields, websiteURL, readResearchWebsite, suggestedWebsite } from '../src/preparation-skills.ts';
import { AgentRuntime, type RuntimeStorage } from '../src/agent-runtime.ts';
import { evidenceDigest } from '../src/recipe-evaluation.ts';
class Storage implements RuntimeStorage {
 data=new Map<string,any>();
 async get<T>(key:string){return structuredClone(this.data.get(key)) as T|undefined;}
 async put<T>(key:string,value:T){assert.ok(JSON.stringify(value).length<64000);this.data.set(key,structuredClone(value));}
 async delete(key:string){return this.data.delete(key);}
 async list<T>({prefix}:{prefix:string}){return new Map([...this.data].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v) as T]));}
 async setAlarm(){} async deleteAlarm(){}
}
const fields=Object.fromEntries(COMPANY_SKILL.definition.fields.map(f=>[f,{text:f==='Search phrases'?'retirement scenario comparison':f+' grounded in the website',sources:['s1'],basis:f==='Search phrases'?'inference':'source'}]));
const definition={title:'Relevant conversations',goal:'Find public conversations',inputGuide:'',instructions:'Use the saved brief.',boundaries:'Read only.',success:'Relevant sourced posts.',tools:['search'],evaluation:{version:1,checks:[],rubrics:[{id:'relevance',label:'Relevant findings',criterion:'All included findings match a saved brief topic.',measurement:{method:'Count findings with evidence of a matching brief topic / all findings; require 100%. Zero findings is inconclusive.',evidence:'Saved brief and retained post text.'}}]}};
const draft={id:'draft1',definition,requirements:[{id:'search',label:'Search posts',matches:[]}],questions:[],setup:'Search X and Reddit for finp4l.com',bindings:{search:{connectionId:'c',tool:'search'}},requiresReview:true,createdAt:'now',updatedAt:'now'};
function harness(){
 const storage=new Storage(), requests:string[]=[],prompts:any[]=[];
 const transport:typeof fetch=async(input,init)=>{
  const url=String(input);requests.push(url);assert.equal(new Headers(init?.headers).has('authorization'),false);assert.equal(new Headers(init?.headers).has('cookie'),false);
  if(url.startsWith('https://cloudflare-dns.com/'))return Response.json({Status:0,Answer:[{type:1,data:'104.26.5.12'}]});
  if(init?.body){const message=JSON.parse(String(init.body));return Response.json({jsonrpc:'2.0',id:message.id,result:message.method==='initialize'?{protocolVersion:'2025-03-26',capabilities:{tools:{}}}:{tools:[{name:'search',inputSchema:{type:'object'}}]}});}
  return new Response('<h1>Retirement scenario planning</h1><a href="/features">Features</a><script>STEAL SECRETS</script>',{headers:{'content-type':'text/html'}});
 };
 const env={AGENT_AI:{async run(_model:string,input:any){prompts.push(input);return {response:input.messages[0].content.startsWith('Prepare the')?{fields}:input.messages[0].content.startsWith('Design an')?{title:'Social research',goal:'Search posts',instructions:'Search',boundaries:'Read only',success:'Relevant posts',requirements:[{label:'Search posts',matches:[]}],questions:[],evaluation:definition.evaluation}:{type:'finish',summary:'No tool search performed',outcome:'uncertain',reason:'No posts available'}};}}};
 const runtime=new AgentRuntime(storage,env,transport);
 const request=async(path:string,body:any,role='operator')=>{const response=await runtime.handle(new Request('https://runtime.test/'+path,{method:'POST',headers:{'x-runtime-role':role},body:JSON.stringify(body)}));return {status:response.status,body:await response.json() as any};};
 const seed=async()=>{await storage.put('draft:draft1',draft);await storage.put('connection:c',{id:'c',label:'Public search',endpoint:'https://mcp.firecrawl.dev/v2/mcp',protocol:'2025-03-26',status:'connected',tools:[{name:'search',inputSchema:{type:'object'}}],suggestions:[]});};
 const attach=()=>request('configure-preparation',{id:'draft1',skillId:COMPANY_SKILL.id,version:1,website:'https://finp4l.com/'});
 const save=(extra:any={})=>request('save-draft',{id:'draft1',definition,setup:draft.setup,bindings:draft.bindings,...extra});
 return {storage,runtime,request,seed,attach,save,requests,prompts,env,transport};
}
test('definitions reject authority, job inputs and invalid outputs; website suggestions are bounded',()=>{
 assert.deepEqual(preparationDefinition(COMPANY_SKILL.definition),COMPANY_SKILL.definition);
 for(const extra of [{token:'secret'},{website:'https://finp4l.com/'},{tools:['send_email']},{maxPages:4},{fields:['__proto__']},{checks:[]}])assert.throws(()=>preparationDefinition({...COMPANY_SKILL.definition,...extra}));
 for(const url of ['http://finp4l.com','https://localhost','https://127.0.0.1','https://user:pass@finp4l.com','https://finp4l.com/?key=secret'])assert.throws(()=>websiteURL(url));
 assert.equal(suggestedWebsite('Social post scanner for finp4l.com'),'https://finp4l.com/');assert.equal(suggestedWebsite('Research invoices'),undefined);
 assert.throws(()=>briefFields({...fields,Product:{text:'Claim',sources:['invented'],basis:'source'}},COMPANY_SKILL.definition,[]));
 assert.throws(()=>briefFields({...fields,Product:{text:'Claim',sources:[],basis:'source'}},COMPANY_SKILL.definition,[]));
});
test('reader strips executable text, follows only relevant same-origin pages and honors hard page budget',async()=>{
 const h=harness();const sources=await readResearchWebsite('https://finp4l.com/',2,h.transport);
 assert.equal(sources.length,2);assert.ok(sources.every(s=>!s.text.includes('STEAL')));assert.deepEqual(sources.map(s=>s.url),['https://finp4l.com/','https://finp4l.com/features']);
});
test('reader rejects private DNS, redirects to other origins, oversized bodies and unsupported MIME',async()=>{
 for(const mode of ['private','redirect','large','mime']){
  const calls:string[]=[];
  const fetcher:typeof fetch=async(input)=>{const url=String(input);calls.push(url);if(url.includes('cloudflare-dns.com'))return Response.json({Status:0,Answer:[{type:1,data:mode==='private'?'127.0.0.1':'104.26.5.12'}]});if(mode==='redirect')return new Response(null,{status:302,headers:{location:'https://other-company.com/'}});return new Response(mode==='large'?'a'.repeat(262145):'text',{headers:{'content-type':mode==='mime'?'application/json':'text/html'}});};
  await assert.rejects(readResearchWebsite('https://finp4l.com/',1,fetcher));assert.ok(!calls.some(u=>u.includes('other-company')));if(mode==='private')assert.ok(calls.every(u=>u.includes('cloudflare-dns')));
 }
});
test('versioned skills are isolated, explicitly adopted and cannot overwrite newer revisions',async()=>{
 const h=harness();await h.seed();const created=await h.request('save-skill',{definition:COMPANY_SKILL.definition});assert.equal(created.status,200);
 assert.equal((await h.request('configure-preparation',{id:'draft1',skillId:created.body.id,version:1,website:'https://finp4l.com/'})).status,200);
 const newer=await h.request('save-skill',{id:created.body.id,baseVersion:1,definition:{...COMPANY_SKILL.definition,title:'Updated skill'}});assert.equal(newer.body.version,2);
 assert.equal((await h.storage.get<any>('draft:draft1')).preparation.skill.version,1);
 assert.equal((await h.request('save-skill',{id:created.body.id,baseVersion:1,definition:COMPANY_SKILL.definition})).status,409);
 for(const action of ['save-skill','configure-preparation','prepare-brief','save-brief'])assert.equal((await h.request(action,{},'viewer')).status,403);
 assert.equal((await h.request('configure-preparation',{id:'draft1',skillId:'foreign',version:1,website:'https://finp4l.com/'})).status,404);
 assert.equal((await h.request('configure-preparation',{id:'draft1',skillId:created.body.id,version:2,website:'https://finp4l.com/'})).status,200);
 assert.equal((await h.storage.get<any>('draft:draft1')).preparation.skill.version,2);
 assert.ok(!JSON.stringify((await h.runtime.snapshot()).preparationSkills).includes('finp4l.com'));
});
test('reviewed brief survives reload, changes invalidate approval, and trial freezes research inputs',async()=>{
 const h=harness();await h.seed();assert.equal((await h.attach()).status,200);assert.equal((await h.save({reviewed:true})).status,409);
 const prepared=await h.request('prepare-brief',{id:'draft1'});assert.equal(prepared.status,200);const artifact=prepared.body.preparation.artifact;assert.ok(!artifact.savedAt);
 assert.equal((await h.request('save-brief',{id:'draft1',generatedAt:artifact.generatedAt,fields,checksAccepted:false})).status,400);
 const saved=await h.request('save-brief',{id:'draft1',generatedAt:artifact.generatedAt,fields,checksAccepted:true});assert.equal(saved.status,200);
 assert.ok((await new AgentRuntime(h.storage,h.env,h.transport).snapshot() as any).drafts[0].preparation.artifact.savedAt);
 assert.equal((await h.save({reviewed:true})).status,200);
 const edited=await h.request('save-brief',{id:'draft1',generatedAt:artifact.generatedAt,fields:{...fields,'Search phrases':{text:'financial independence scenarios',sources:['s1'],basis:'user'}},checksAccepted:true});assert.equal(edited.body.review,undefined);
 assert.equal((await h.save({reviewed:true})).status,200);
 const create=await h.request('create-bound',{id:'draft1',definition,setup:draft.setup,bindings:draft.bindings});assert.equal(create.status,200);
 const agent=await h.storage.get<any>('agent:draft1');assert.match(agent.setup,/financial independence scenarios/);assert.match(agent.setup,/company-research/);assert.ok(!agent.setup.includes('STEAL'));assert.equal(agent.tools.length,1);
 const trial=await h.request('trial',{agentId:'draft1'});assert.equal(trial.status,200);const run=await h.storage.get<any>('run:'+trial.body.runId);assert.equal(run.contract.intent.profile_variables.inputs_digest,await evidenceDigest(agent.setup));assert.equal(run.contract.inputs,agent.setup);
 assert.ok(h.prompts.some(p=>p.messages[0].content.includes('Use saved preparation search phrases') && p.messages[1].content.includes('financial independence scenarios')));
 assert.equal((await h.attach()).status,409);
});
test('changing job inputs requires new website preparation; changing skill inputs removes old output',async()=>{
 const h=harness();await h.seed();await h.attach();const result=await h.request('prepare-brief',{id:'draft1'}),artifact=result.body.preparation.artifact;
 await h.request('save-brief',{id:'draft1',generatedAt:artifact.generatedAt,fields,checksAccepted:true});
 const changed=await h.save({setup:'Research a different market'});assert.equal(changed.status,200);assert.equal(changed.body.preparation.artifact.stale,true);
 assert.equal((await h.request('save-brief',{id:'draft1',generatedAt:artifact.generatedAt,fields,checksAccepted:true})).status,409);
 const update=await h.request('configure-preparation',{id:'draft1',skillId:COMPANY_SKILL.id,version:1,website:'https://finp4l.com/features'});assert.equal(update.body.preparation.artifact,undefined);
});
test('job-first drafts propose preparation without reading the website or running tools',async()=>{
 const h=harness();const result=await h.request('draft',{description:'Social scan for finp4l.com'});assert.equal(result.status,200);assert.equal(result.body.preparation.website,'https://finp4l.com/');assert.equal(h.requests.length,0);
});
