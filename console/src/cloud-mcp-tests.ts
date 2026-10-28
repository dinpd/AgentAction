import { McpClient, McpRpcError, RuntimeError } from './mcp-client.ts';
import { canonical, initialReport, isObject, parsePlan, runTestPlan, type TestPlan, type TestReport, type TestTool } from './mcp-test-plan.ts';
import type { RuntimeStorage } from './agent-runtime.ts';

type Record = {id:string;digest:string;createdAt:number;state:'running'|'complete'|'interrupted';report:TestReport};
const DAY=86_400_000, REQUEST_WINDOW=600_000;
export const CLOUD_PLAN_BYTES=18_000;
export function cloudSchemaSupported(plan:TestPlan):boolean {
  let nodes=0;
  const scalar=(v:unknown)=>v===null||['string','number','boolean'].includes(typeof v);
  const check=(value:unknown,depth=0):boolean=>{
    if(++nodes>160||depth>8)return false;
    if(typeof value==='boolean')return true;
    if(!isObject(value))return false;
    const allowed=['$schema','type','properties','required','additionalProperties','items','enum','const','minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf','minLength','maxLength','minItems','maxItems','uniqueItems','minProperties','maxProperties','title','description','default','examples'];
    if(Object.keys(value).some(k=>!allowed.includes(k)))return false;
    if(value.type!==undefined){const types=Array.isArray(value.type)?value.type:[value.type];if(types.length>7||!types.every(t=>['object','array','string','number','integer','boolean','null'].includes(t)))return false;}
    if(value.enum!==undefined&&(!Array.isArray(value.enum)||value.enum.length>40||!value.enum.every(scalar)))return false;
    if(value.const!==undefined&&!scalar(value.const))return false;
    if(value.properties!==undefined&&(!isObject(value.properties)||Object.keys(value.properties).length>24||!Object.values(value.properties).every(v=>check(v,depth+1))))return false;
    if(value.required!==undefined&&(!Array.isArray(value.required)||value.required.length>24||!value.required.every(v=>typeof v==='string')))return false;
    return ['items','additionalProperties'].every(k=>value[k]===undefined||check(value[k],depth+1));
  };
  return check(plan.tool.inputSchema)&&(!plan.tool.outputSchema||check(plan.tool.outputSchema));
}
function cloudInputsSupported(plan:TestPlan):boolean {
  let nodes=0;
  const check=(value:unknown,depth=0):boolean=>{
    if(++nodes>2000||depth>8||(typeof value==='string'&&value.length>4000))return false;
    if(Array.isArray(value))return value.length<=64&&value.every(v=>check(v,depth+1));
    if(isObject(value))return Object.keys(value).length<=64&&Object.values(value).every(v=>check(v,depth+1));
    return true;
  };
  return check(plan.arguments)&&(!plan.errorArguments||check(plan.errorArguments));
}
function unknownReport(report:TestReport,detail:string):TestReport {
  return {...report,status:'inconclusive',calls:null,durationMs:Math.max(0,Date.now()-Date.parse(report.checkedAt)),checks:report.checks.map(c=>({...c,status:c.id==='call'?'inconclusive':'not-run',detail:c.id==='call'?detail:'Not run or not retained.'}))};
}
const toTool=(t:TestTool):TestTool=>({name:t.name,...(t.description?{description:t.description}:{}),inputSchema:t.inputSchema,...(t.outputSchema?{outputSchema:t.outputSchema}:{})});
export class CloudMcpTests {
  storage:RuntimeStorage;
  constructor(storage:RuntimeStorage){this.storage=storage;}
  async reports():Promise<Array<{id:string;state:Record['state'];report:TestReport}>> {
    const records=await this.storage.list<Record>({prefix:'mcp-test:'});
    const kept:Record[]=[];
    for(const [key,r]of records)if(Date.now()-r.createdAt>=DAY)await this.storage.delete(key);else kept.push(r);
    return kept.sort((a,b)=>b.createdAt-a.createdAt).map(({id,state,report})=>({id,state,report}));
  }
  async nextExpiry():Promise<number|undefined>{
    await this.reports();const records=await this.storage.list<Record>({prefix:'mcp-test:'});
    return records.size?Math.min(...[...records.values()].map(r=>r.createdAt+DAY)):undefined;
  }
  async recover():Promise<void> {
    for(const {id,state,report}of await this.reports())if(state==='running'){
      const entry=(await this.storage.get<Record>('mcp-test:'+id))!;
      await this.storage.put('mcp-test:'+id,{...entry,state:'interrupted',report:unknownReport(report,'The cloud process restarted before retaining completion. Dispatch count and provider effects are unknown; this request will not execute again.')});
    }
  }
  async run(input:unknown,connection:{id:string;createdAt:string;endpoint:string;protocol:string},client:(signal:AbortSignal)=>McpClient,scrub:(v:unknown)=>Promise<string>,beforeClaim:(expiry:number)=>Promise<void>=async()=>{}):Promise<TestReport> {
    if(!isObject(input)||Object.keys(input).some(k=>!['requestId','connectionId','plan','stagingConfirmed'].includes(k))||input.stagingConfirmed!==true||input.connectionId!==connection.id)throw new RuntimeError('Choose a connected staging server and confirm the reviewed fixtures.');
    const requestId=input.requestId;
    if(typeof requestId!=='string'||!/^\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId))throw new RuntimeError('Start a fresh cloud request from the tester.');
    let plan:TestPlan;try{plan=parsePlan(input.plan);}catch{throw new RuntimeError('Choose a valid AgentAction test plan.');}
    if(new TextEncoder().encode(JSON.stringify(plan)).length>CLOUD_PLAN_BYTES)throw new RuntimeError('Cloud plans support up to 18,000 bytes. Use the local runner for this plan.');
    if(plan.endpoint!==connection.endpoint)throw new RuntimeError('The plan does not match this workspace connection. Load its tools again.',409);
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical({plan,connection:{id:connection.id,createdAt:connection.createdAt}})))),b=>b.toString(16).padStart(2,'0')).join('');
    await this.reports();
    const key='mcp-test:'+requestId,at=Date.now();
    // Arm cleanup before persisting a claim, including if the process stops
    // between that durable claim and provider dispatch. Never postpone earlier work.
    await beforeClaim(at+DAY);
    const claim=await this.storage.transaction(async tx=>{
      const existing=await tx.get<Record>(key);
      if(existing){if(existing.digest!==digest)throw new RuntimeError('This request ID belongs to a different reviewed plan.',409);return {existing};}
      const issued=Number(requestId.slice(0,13));
      if(at-issued>REQUEST_WINDOW||issued-at>30_000)throw new RuntimeError('This cloud request expired. Review the current plan before creating a new request.',410);
      const quota='quota:mcp-tests',day=new Date(at).toISOString().slice(0,10),previous=await tx.get<{day:string;count:number}>(quota),count=previous?.day===day?previous.count:0;
      if(count>=20)throw new RuntimeError('This workspace has reached its daily limit of 20 cloud test runs.',429);
      const report=unknownReport(initialReport(plan,'cloud'),'This request is in progress or its completion was not retained. No duplicate dispatch is permitted.');
      await tx.put(quota,{day,count:count+1});await tx.put(key,{id:requestId,digest,createdAt:at,state:'running',report} satisfies Record);
      return {};
    });
    if(claim.existing)return claim.existing.report;
    let report=initialReport(plan,'cloud');
    if(!cloudSchemaSupported(plan)||!cloudInputsSupported(plan)){
      report.checks[0].status='inconclusive';report.checks[0].detail='This fixture exceeds the hosted schema or input subset. Use the local runner for references, patterns, compositions or larger fixtures. No tool calls sent.';
    }else {
      const controller=new AbortController(),transport=client(controller.signal);
      let completed:TestReport|undefined;
      let timer:ReturnType<typeof setTimeout>;
      const work=async()=>{
        const preflight=initialReport(plan,'cloud');
        try {
          const tools=JSON.parse(await scrub((await transport.discover({allowEmpty:true})).map(toTool))) as TestTool[];
          const actual=tools.find(t=>t.name===plan.tool.name);
          if(!actual||canonical(actual.inputSchema)!==canonical(plan.tool.inputSchema)||canonical(actual.outputSchema??null)!==canonical(plan.tool.outputSchema??null)||transport.connection.protocol!==plan.protocol){
            preflight.checks[0].status='inconclusive';preflight.checks[0].detail='The current tool contract or protocol differs from this plan. Load tools again. No tool calls sent.';return completed=preflight;
          }
          const result=await runTestPlan(plan,async(args,signal)=>{
            try{return {kind:'result',value:await transport.rpc('tools/call',{name:plan.tool.name,arguments:args},false,plan.deadlineMs+250,signal)};}
            catch(error){return error instanceof McpRpcError?{kind:'rpc-error',code:error.rpcCode}:{kind:'transport-error'};}
          },'cloud');
          if(result.checks.find(c=>c.id==='arguments')!.status==='passed')try{await transport.rpc('tools/list');}catch{result.checks.find(c=>c.id==='arguments')!.status='failed';result.checks.find(c=>c.id==='arguments')!.detail='Discovery failed after the negative-input probe.';if(result.status!=='inconclusive')result.status='failed';}
          return completed=result;
        }catch{
          preflight.checks[0].status='inconclusive';preflight.checks[0].detail='Cloud discovery could not finish. Check the approved connection and its credentials. No tool calls sent.';return completed=preflight;
        }finally{await transport.close();}
      };
      try {report=await Promise.race([work(),new Promise<TestReport>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(completed||unknownReport(report,'The cloud run exceeded its 45-second limit. Dispatch count and provider effects are unknown; no retry was sent.'));},45_000);})]);}
      finally{clearTimeout(timer!);controller.abort();}
    }
    report=JSON.parse(await scrub(report));
    await this.storage.put(key,{id:requestId,digest,createdAt:at,state:'complete',report} satisfies Record);
    return report;
  }
}
