import { Validator } from '@cfworker/json-schema';

export type TestTool = {name:string;description?:string;inputSchema:Record<string,unknown>;outputSchema?:Record<string,unknown>};
export type TestPlan = {schemaVersion:'agentaction.mcp-test-plan.v1';name:string;endpoint:string;protocol:string;tool:TestTool;arguments:Record<string,unknown>;deadlineMs:number;missingArgument:boolean;errorArguments?:Record<string,unknown>;expectedText?:string};
export type TestCheck = {id:'call'|'arguments'|'output'|'error'|'deadline';title:string;status:'passed'|'failed'|'not-run'|'inconclusive';detail:string};
export type TestReport = {schemaVersion:'agentaction.mcp-test-report.v1';source:'sample'|'local';checkedAt:string;endpoint:string;tool:string;status:'passed'|'failed'|'inconclusive';calls:number|null;durationMs:number;checks:TestCheck[];businessOutcome:'unverified'};
export type TestOutcome = {kind:'result';value:Record<string,unknown>}|{kind:'rpc-error';code:number}|{kind:'transport-error'};
export const isObject=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export const PLAN_LIMIT=128*1024;
export function boundedJSON(raw:string):any {
  if(new TextEncoder().encode(raw).length>PLAN_LIMIT)throw new Error('Choose a JSON file smaller than 128 KiB.');
  let value:unknown;try{value=JSON.parse(raw);}catch{throw new Error('Provide valid JSON.');}
  let nodes=0;
  const visit=(v:unknown,depth:number)=>{if(depth>24||++nodes>12000)throw new Error('JSON is too deeply nested or complex.');if(v&&typeof v==='object')for(const x of Object.values(v))visit(x,depth+1);};
  visit(value,0);return value;
}
export function testEndpoint(value:unknown):string {
  if(typeof value!=='string'||value.length>2048)throw new Error('Enter your staging MCP endpoint.');
  let u:URL;try{u=new URL(value);}catch{throw new Error('Enter a valid MCP URL.');}
  if(u.username||u.password||u.search||u.hash||(u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname))))throw new Error('Use HTTPS, or HTTP on loopback, without credentials, query parameters or fragments.');
  return u.href;
}
export const canonical=(v:any):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':isObject(v)?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
export function parsePlan(input:unknown):TestPlan {
  const p=boundedJSON(JSON.stringify(input));
  const keys=['schemaVersion','name','endpoint','protocol','tool','arguments','deadlineMs','missingArgument','errorArguments','expectedText'];
  if(!isObject(p)||p.schemaVersion!=='agentaction.mcp-test-plan.v1'||Object.keys(p).some(k=>!keys.includes(k)))throw new Error('Choose an AgentAction test plan. Connection tokens are not plan fields.');
  if(typeof p.name!=='string'||!p.name.trim()||p.name.length>80)throw new Error('Name this plan using up to 80 characters.');
  if(!['2025-03-26','2025-06-18','2025-11-25','2026-07-28'].includes(p.protocol))throw new Error('Choose a supported MCP protocol.');
  if(!isObject(p.tool)||Object.keys(p.tool).some(k=>!['name','description','inputSchema','outputSchema'].includes(k))||typeof p.tool.name!=='string'||!/^[a-zA-Z0-9_.:-]{1,128}$/.test(p.tool.name)||!isObject(p.tool.inputSchema)||p.tool.inputSchema.type!=='object'||(p.tool.outputSchema!==undefined&&!isObject(p.tool.outputSchema)))throw new Error('Select a tool with an object input schema.');
  if(JSON.stringify(p.tool).length>40000)throw new Error('Use a tool contract smaller than 40,000 characters.');
  if(p.tool.description!==undefined&&(typeof p.tool.description!=='string'||p.tool.description.length>1200))throw new Error('Tool description exceeds the plan limit.');
  if(!isObject(p.arguments)||typeof p.missingArgument!=='boolean'||(p.errorArguments!==undefined&&!isObject(p.errorArguments)))throw new Error('Sample inputs must be JSON objects.');
  if(!Number.isInteger(p.deadlineMs)||p.deadlineMs<50||p.deadlineMs>10000)throw new Error('Choose a deadline from 50 to 10,000 milliseconds.');
  if(p.expectedText!==undefined&&(typeof p.expectedText!=='string'||p.expectedText.length>500))throw new Error('Expected text must be at most 500 characters.');
  return {...p,name:p.name.trim(),endpoint:testEndpoint(p.endpoint)} as TestPlan;
}
export function samplePlan():TestPlan {
  return {schemaVersion:'agentaction.mcp-test-plan.v1',name:'Sample document search',endpoint:'https://sample.invalid/mcp',protocol:'2025-11-25',tool:{name:'search_documents',description:'Synthetic search fixture. No provider requests.',inputSchema:{type:'object',properties:{query:{type:'string',minLength:1}},required:['query'],additionalProperties:false},outputSchema:{type:'object',properties:{found:{type:'boolean'}},required:['found']}},arguments:{query:'hello'},deadlineMs:500,missingArgument:true,errorArguments:{query:'missing'},expectedText:'Found'};
}
export function initialReport(p:TestPlan,source:'sample'|'local'):TestReport {
  return {schemaVersion:'agentaction.mcp-test-report.v1',source,checkedAt:new Date().toISOString(),endpoint:p.endpoint,tool:p.tool.name,status:'inconclusive',calls:0,durationMs:0,businessOutcome:'unverified',checks:[['call','Valid call'],['arguments','Argument rejection'],['output','Structured output'],['error','Tool error handling'],['deadline','Response deadline']].map(([id,title])=>({id:id as TestCheck['id'],title,status:'not-run',detail:'Not run.'}))};
}
export function parseTestReport(input:unknown):TestReport {
  const r=boundedJSON(JSON.stringify(input));
  if(!isObject(r)||Object.keys(r).some(k=>!['schemaVersion','source','checkedAt','endpoint','tool','status','calls','durationMs','checks','businessOutcome'].includes(k))||r.schemaVersion!=='agentaction.mcp-test-report.v1'||!['sample','local'].includes(r.source)||!['passed','failed','inconclusive'].includes(r.status)||r.businessOutcome!=='unverified'||typeof r.tool!=='string'||!/^[a-zA-Z0-9_.:-]{1,128}$/.test(r.tool)||!Number.isFinite(Date.parse(r.checkedAt))||(r.calls!==null&&(!Number.isInteger(r.calls)||r.calls<0||r.calls>3))||(r.calls===null&&r.status!=='inconclusive')||!Number.isFinite(r.durationMs)||r.durationMs<0||!Array.isArray(r.checks)||r.checks.length!==5)throw new Error('Choose a valid behavior-test report.');
  testEndpoint(r.endpoint);const ids=new Set<string>();
  for(const c of r.checks){if(!isObject(c)||Object.keys(c).some(k=>!['id','title','status','detail'].includes(k))||!['call','arguments','output','error','deadline'].includes(c.id)||ids.has(c.id)||!['passed','failed','not-run','inconclusive'].includes(c.status)||typeof c.title!=='string'||c.title.length>80||typeof c.detail!=='string'||c.detail.length>1000)throw new Error('Report checks are invalid.');ids.add(c.id);}
  return r as TestReport;
}
export async function runTestPlan(input:unknown,dispatch:(args:Record<string,unknown>,signal:AbortSignal)=>Promise<TestOutcome>,source:'sample'|'local'='local'):Promise<TestReport> {
  const p=parsePlan(input),r=initialReport(p,source),start=performance.now();
  const set=(id:TestCheck['id'],status:TestCheck['status'],detail:string)=>Object.assign(r.checks.find(c=>c.id===id)!,{status,detail});
  const validate=(schema:Record<string,unknown>,value:unknown):boolean=>{
    const uri=schema.$schema;
    const draft=uri===undefined||String(uri).includes('2020-12')?'2020-12':String(uri).includes('2019-09')?'2019-09':String(uri).includes('draft-07')?'7':String(uri).includes('draft-04')?'4':undefined;
    if(!draft)throw new Error('Unsupported schema draft.');
    return new Validator(schema as any,draft).validate(value).valid;
  };
  let stop=false;
  async function call(args:Record<string,unknown>):Promise<TestOutcome|'timeout'> {
    r.calls!++;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    try{return await Promise.race([dispatch(args,controller.signal),new Promise<'timeout'>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve('timeout');},p.deadlineMs);})]);}
    catch{return controller.signal.aborted?'timeout':{kind:'transport-error'};}
    finally{clearTimeout(timer!);}
  }
  const usable=(v:any)=>isObject(v)&&(v.isError===undefined||typeof v.isError==='boolean')&&Array.isArray(v.content)&&v.content.every((c:any)=>isObject(c)&&typeof c.type==='string');
  try {
    if(!validate(p.tool.inputSchema,p.arguments)){set('call','failed','Sample inputs do not match inputSchema. No tool calls sent.');return finish();}
  }catch{set('call','inconclusive','The input schema could not be validated locally. No tool calls sent.');return finish();}
  const outcome=await call(p.arguments);
  if(outcome==='timeout'||outcome.kind==='transport-error') {
    set('call','inconclusive','No confirmed result. The action may have occurred. Further tool calls stopped; no retry was sent.');
    set('deadline',outcome==='timeout'?'failed':'inconclusive',outcome==='timeout'?'The configured deadline was reached. Provider effects remain unknown.':'A transport failure prevented measuring completion.');return finish();
  }
  set('deadline','passed','The first response arrived within the configured deadline. No slow-server fault was injected.');
  if(outcome.kind!=='result'||!usable(outcome.value)||outcome.value.isError===true){set('call','failed','The valid-input fixture did not return a usable successful tool result. Further calls stopped.');return finish();}
  const texts=(outcome.value.content as any[]).filter(c=>c.type==='text'&&typeof c.text==='string').map(c=>c.text).join('\n');
  set('call',p.expectedText&&!texts.includes(p.expectedText)?'failed':'passed',p.expectedText&&!texts.includes(p.expectedText)?'The expected text was absent. Raw results are excluded from this report.':'A usable tool result was returned. This does not prove business completion.');
  if(!p.tool.outputSchema)set('output','not-run','No outputSchema was declared.');
  else if(!isObject(outcome.value.structuredContent))set('output','failed','outputSchema is declared, but structuredContent is missing or is not an object.');
  else {try{set('output',validate(p.tool.outputSchema,outcome.value.structuredContent)?'passed':'failed','Checked structuredContent against the declared outputSchema. Raw results are excluded.');}catch{set('output','inconclusive','The output schema could not be evaluated locally.');}}
  if(p.missingArgument) {
    const required=p.tool.inputSchema.required;
    if(!Array.isArray(required)||!required.length||typeof required[0]!=='string')set('arguments','not-run','No required field is available for the selected negative-input probe.');
    else {
      const args=structuredClone(p.arguments);delete args[required[0]];const negative=await call(args);
      if(negative==='timeout'||negative.kind==='transport-error'){set('arguments','inconclusive','No confirmed rejection. Effects may have occurred; remaining tool calls stopped.');stop=true;}
      else set('arguments',(negative.kind==='rpc-error'&&negative.code===-32602)||(negative.kind==='result'&&usable(negative.value)&&negative.value.isError===true)?'passed':'failed','Sent one explicitly selected missing-required-field probe and checked for an error response.');
    }
  }else set('arguments','not-run','Enable the negative-input probe only for a controlled staging fixture.');
  if(p.errorArguments&&!stop) {
    try {
      if(!validate(p.tool.inputSchema,p.errorArguments))set('error','not-run','The error fixture must satisfy inputSchema. Use the separate negative-input probe for invalid arguments.');
      else {const e=await call(p.errorArguments);if(e==='timeout'||e.kind==='transport-error')set('error','inconclusive','No confirmed tool-error response. Effects may have occurred; no retry was sent.');else set('error',e.kind==='result'&&usable(e.value)&&e.value.isError===true?'passed':'failed','Checked the selected error fixture for MCP isError: true. No provider error text is retained.');}
    }catch{set('error','inconclusive','The selected error fixture could not be validated.');}
  }else if(!stop)set('error','not-run','Provide an optional staging input that is expected to return isError: true.');
  return finish();
  function finish(){r.durationMs=Math.round(performance.now()-start);r.status=r.checks.some(c=>c.status==='inconclusive')?'inconclusive':r.checks.some(c=>c.status==='failed')?'failed':'passed';return r;}
}
export async function runSample(timeout=false):Promise<TestReport> {
  const p=samplePlan();if(timeout)p.deadlineMs=50;
  return runTestPlan(p,async(args,signal)=>{
    if(timeout)await new Promise<void>((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('timeout')),{once:true}));
    if(!Object.hasOwn(args,'query'))return {kind:'rpc-error',code:-32602};
    return {kind:'result',value:args.query==='missing'?{isError:true,content:[{type:'text',text:'Synthetic missing record'}]}:{content:[{type:'text',text:'Found a synthetic document'}],structuredContent:{found:true}}};
  },'sample');
}
