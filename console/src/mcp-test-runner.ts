import { createServer, type IncomingMessage } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { open, writeFile } from 'node:fs/promises';
import { McpClient, McpRpcError, mcpFailureReason, type McpTool } from './mcp-client.ts';
import { boundedJSON, canonical, initialReport, isObject, parsePlan, runTestPlan, testEndpoint, type TestPlan, type TestTool, type TestReport } from './mcp-test-plan.ts';
import { TEST_PANEL, TEST_CSS } from './mcp-test-shell.ts';
import uiSource from '../generated/test-ui.txt';

type Job={kind:'discover'|'run';endpoint?:string;protocol?:string;plan?:unknown;token?:string};
const protocols=['2025-03-26','2025-06-18','2025-11-25','2026-07-28'];
function safeTool(tool:McpTool,token:string):TestTool {
  let raw=JSON.stringify({name:tool.name,description:tool.description,inputSchema:tool.inputSchema,...(tool.outputSchema?{outputSchema:tool.outputSchema}:{})});
  if(token)for(const secret of [token,JSON.stringify(token).slice(1,-1),encodeURIComponent(token),Buffer.from(token).toString('base64')])raw=raw.split(secret).join('[credential removed]');
  return JSON.parse(raw);
}
async function execute(job:Job):Promise<unknown> {
  const plan=job.kind==='run'?parsePlan(job.plan):undefined;
  const endpoint=testEndpoint(plan?.endpoint||job.endpoint),protocol=plan?.protocol||job.protocol;
  if(!protocols.includes(String(protocol)))throw new Error('Choose a supported protocol.');
  const token=job.token||'';if(typeof token!=='string'||token.length>8192||/[\r\n]/.test(token))throw new Error('Access token is invalid.');
  let callSignal:AbortSignal|undefined,toolCalls=0;
  const connection={endpoint,protocol:String(protocol),tools:[] as McpTool[],...(token?{token}:{})};
  const client=new McpClient(connection,async(input,init={})=>{
    if(String(input)!==endpoint)throw new Error('Unexpected destination.');
    if(init.method==='POST') {
      const rpc=JSON.parse(String(init.body));
      if(!['initialize','notifications/initialized','tools/list','tools/call'].includes(rpc.method))throw new Error('Unexpected MCP method.');
      if(rpc.method==='tools/call'&&(!plan||rpc.params?.name!==plan.tool.name||++toolCalls>3))throw new Error('Tool-call budget exhausted.');
    }else if(init.method!=='DELETE')throw new Error('Unexpected method.');
    return fetch(input,{...init,redirect:'manual',credentials:'omit',signal:callSignal?AbortSignal.any([callSignal,...(init.signal?[init.signal]:[])]):init.signal});
  });
  try {
    let tools:McpTool[];
    try{tools=await client.discover({allowEmpty:true});}
    catch(error){
      if(!plan)throw new Error(mcpFailureReason(error)==='authentication'?'Authentication failed. Check the local access token.':'Discovery failed. Check the endpoint, protocol and local access.');
      const r=initialReport(plan,'local');r.checks[0].status='inconclusive';r.checks[0].detail=mcpFailureReason(error)==='authentication'?'Authentication failed before tool execution. Check the local access token.':'Discovery could not finish. No tool calls sent.';return r;
    }
    const safe=tools.map(t=>safeTool(t,token)).filter(t=>JSON.stringify(t).length<=40000);
    if(!plan)return {tools:safe,protocol:connection.protocol};
    const actual=safe.find(t=>t.name===plan.tool.name);
    if(!actual||canonical(actual.inputSchema)!==canonical(plan.tool.inputSchema)||canonical(actual.outputSchema??null)!==canonical(plan.tool.outputSchema??null)||connection.protocol!==plan.protocol) {
      const r=initialReport(plan,'local');r.checks[0].status='inconclusive';r.checks[0].detail='The current tool contract or protocol differs from this plan. Load tools again before executing. No tool calls sent.';return r;
    }
    const r=await runTestPlan(plan,async(args,signal)=>{
      callSignal=signal;
      try{return {kind:'result',value:await client.rpc('tools/call',{name:plan.tool.name,arguments:args},false,plan.deadlineMs+250,signal)};}
      catch(error){if(error instanceof McpRpcError)return {kind:'rpc-error',code:error.rpcCode};return {kind:'transport-error'};}
      finally{callSignal=undefined;}
    });
    // An expected negative-input rejection must not leave the server unavailable.
    const negative=r.checks.find(c=>c.id==='arguments')!;
    if(negative.status==='passed')try{await client.rpc('tools/list');}catch{negative.status='failed';negative.detail='The server did not answer discovery after the negative-input probe.';r.status='failed';}
    return r;
  } finally {callSignal=undefined;await client.close();}
}
function job(input:Job):Promise<any> {
  if(input.kind==='run')input={...input,plan:parsePlan(input.plan)};
  const began=performance.now();
  return new Promise((resolve,reject)=>{
    const unknown=()=>{const r=initialReport(parsePlan(input.plan),'local');r.calls=null;r.durationMs=Math.round(performance.now()-began);r.checks[0].status='inconclusive';r.checks[0].detail='The local test process stopped before retaining its result. Dispatch count and provider effects are unknown; no retry was sent.';return r;};
    const worker=new Worker(fileURLToPath(import.meta.url),{workerData:input,resourceLimits:{maxOldGenerationSizeMb:96}});
    const timer=setTimeout(()=>{void worker.terminate();if(input.kind==='run'){const r=unknown();r.checks[0].detail='The local run exceeded its overall limit. Dispatch count and provider effects are unknown; no retry was sent.';resolve(r);}else reject(new Error('Discovery exceeded its local time limit.'));},45000);
    worker.once('message',message=>{clearTimeout(timer);void worker.terminate();message.ok?resolve(message.value):reject(new Error(message.error));});
    worker.once('error',()=>{clearTimeout(timer);input.kind==='run'?resolve(unknown()):reject(new Error('The local test process stopped.'));});
    worker.once('exit',code=>{if(code!==0){clearTimeout(timer);input.kind==='run'?resolve(unknown()):reject(new Error('The local test process stopped.'));}});
  });
}
const baseCSS=`:root{font-family:Arial,Helvetica,sans-serif;line-height:1.55;color:#20251d;background:#f5f5ee}*{box-sizing:border-box}body{margin:0}header,main{max-width:1150px;margin:auto;padding:24px}header{font-weight:bold}button{background:#20251d;color:#d5ff5d;border:1px solid #20251d;padding:13px 18px;min-height:44px;font-weight:700;cursor:pointer}.secondary{background:white;color:#20251d}button:disabled{opacity:.55;cursor:wait}label{display:flex;flex-direction:column;gap:7px;font-size:14px}input,select{padding:12px;font:inherit;border:1px solid #9eac90;min-width:0;max-width:100%;background:#fafbf6}h2{font-size:28px;line-height:1.2}h3{font-size:20px}p{overflow-wrap:anywhere}.muted{font-size:13px;color:#596150}.eyebrow{font:12px monospace;color:#526344}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:20px}.consent{flex-direction:row;align-items:start;margin:16px 0}.consent input{width:18px;height:18px;flex:none}details{margin:18px 0;border-bottom:1px solid #bac5ad;padding-bottom:16px}summary{cursor:pointer;font-weight:600}:focus-visible{outline:3px solid #789c35;outline-offset:3px}[hidden]{display:none!important}@media(max-width:760px){header,main{padding:16px}.section-heading{flex-direction:column;align-items:start}}`;
const page=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local MCP tester · AgentAction</title><link rel="stylesheet" href="/assets/test.css"><script defer src="/assets/test.js"></script></head><body data-local-runner="true"><header>AgentAction / Local MCP tester</header><main>${TEST_PANEL}<p class="muted">Runs on your computer. Keep this terminal open; press Ctrl+C to stop. Use synthetic staging inputs. Results are not a conformance or safety certificate.</p></main></body></html>`;
async function fileJSON(path:string){const f=await open(path,'r');try{if(!(await f.stat()).isFile())throw new Error('Choose a regular plan file.');const b=Buffer.alloc(128*1024+1);let n=0;while(n<b.length){const r=await f.read(b,n,b.length-n,null);if(!r.bytesRead)break;n+=r.bytesRead;}if(n>128*1024)throw new Error('Plan exceeds 128 KiB.');return boundedJSON(b.subarray(0,n).toString());}finally{await f.close();}}
async function bodyJSON(req:IncomingMessage){let n=0;const chunks:Buffer[]=[];for await(const chunk of req){n+=chunk.length;if(n>140000)throw new Error('Request exceeds the local body limit.');chunks.push(chunk);}return boundedJSON(Buffer.concat(chunks).toString());}
async function main(){
  if(Number(process.versions.node.split('.')[0])<22)throw new Error('Requires Node 22 or newer.');
  if(process.argv.includes('--help')){console.log('AgentAction local MCP tester (Node 22+)\nnode agentaction-mcp-tester.mjs [--plan plan.json] [--run] [--out new-report.json] [--no-open] [--port 8789]\nWithout --run, opens a local browser page. CI exit codes: 0 passed, 1 failed, 2 inconclusive or startup error. Set MCP_TEST_TOKEN locally for authentication.');return;}
  const args=process.argv.slice(2);let plan:TestPlan|undefined,port=8789,noOpen=false,headless=false,out:string|undefined;
  const setup=(globalThis as any).AGENTACTION_TEST_SETUP||{};
  if(setup.plan)plan=parsePlan(setup.plan);
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--plan'&&args[i+1])plan=parsePlan(await fileJSON(args[++i]));
    else if(args[i]==='--port'&&args[i+1]){port=Number(args[++i]);if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Choose a valid local port.');}
    else if(args[i]==='--out'&&args[i+1])out=args[++i];else if(args[i]==='--run')headless=true;else if(args[i]==='--no-open')noOpen=true;
    else throw new Error('Usage: node agentaction-mcp-tester.mjs [--plan plan.json] [--run] [--out new-report.json] [--no-open] [--port 8789]');
  }
  if(headless){if(!plan)throw new Error('Choose a plan with --plan.');const r=await job({kind:'run',plan,token:process.env.MCP_TEST_TOKEN||''});if(out)await writeFile(out,JSON.stringify(r,null,2),{flag:'wx'});console.log(JSON.stringify(r,null,2));process.exitCode=r.status==='passed'?0:r.status==='failed'?1:2;return;}
  const secret=randomBytes(32).toString('hex');let origin='',running=false;
  const headers={'x-content-type-options':'nosniff','cache-control':'no-store','referrer-policy':'no-referrer','x-frame-options':'DENY','content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"};
  const server=createServer(async(req,res)=>{
    const send=(status:number,value:any,type='application/json; charset=utf-8')=>{res.writeHead(status,{...headers,'content-type':type});res.end(typeof value==='string'?value:JSON.stringify(value));};
    try {
      if(req.headers.host!==origin.slice(7))return send(403,{error:'Local Host is invalid.'});
      if(req.method==='GET') {
        if(req.url==='/')return send(200,page,'text/html; charset=utf-8');
        if(req.url==='/assets/test.css')return send(200,baseCSS+TEST_CSS,'text/css; charset=utf-8');
        if(req.url==='/assets/test.js')return send(200,uiSource,'text/javascript; charset=utf-8');
        if(req.url==='/favicon.ico')return send(204,'');return send(404,{error:'Not found.'});
      }
      const supplied=req.headers['x-agentaction-runner'];
      if(req.method!=='POST'||req.headers.origin!==origin||typeof supplied!=='string'||supplied.length!==secret.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(secret))||!String(req.headers['content-type']).startsWith('application/json'))return send(403,{error:'Use the local tester page opened by this process.'});
      const input=await bodyJSON(req);if(!isObject(input))throw new Error('Provide a JSON object.');
      if(req.url==='/api/setup'){if(Object.keys(input).length)throw new Error('Setup takes no inputs.');return send(200,{...(plan?{plan}:{}),endpoint:typeof setup.endpoint==='string'?setup.endpoint:'',protocol:protocols.includes(setup.protocol)?setup.protocol:'2025-11-25'});}
      const allowed=req.url==='/api/run'?['plan','token']:req.url==='/api/discover'?['endpoint','protocol','token']:[];
      if(!allowed.length)return send(404,{error:'Not found.'});if(Object.keys(input).some(k=>!allowed.includes(k)))throw new Error('Unexpected local request fields.');
      if(running)return send(409,{error:'A local request is already running. Wait for its result.'});
      running=true;try{return send(200,await job({...input,kind:req.url==='/api/run'?'run':'discover',token:input.token||process.env.MCP_TEST_TOKEN||''} as Job));}finally{running=false;}
    }catch{send(400,{error:'The local request could not finish. Check the endpoint, plan and token. Provider effects may be unknown; no retry was sent.'});}
  });
  server.requestTimeout=10000;server.headersTimeout=10000;server.maxConnections=12;
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);}).catch(async(error:any)=>{if(error.code!=='EADDRINUSE'||port===0)throw error;await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});});
  origin=`http://127.0.0.1:${(server.address() as any).port}`;
  const url=origin+'/#token='+secret;console.log('AgentAction local MCP tester\n'+url+'\nKeep this terminal open. Press Ctrl+C to stop.');
  if(!noOpen){const command=process.platform==='darwin'?'open':process.platform==='win32'?'rundll32':'xdg-open';const parameters=process.platform==='win32'?['url.dll,FileProtocolHandler',url]:[url];const child=execFile(command,parameters,()=>{});child.unref();}
}
if(!isMainThread)void execute(workerData).then(value=>parentPort!.postMessage({ok:true,value}),()=>parentPort!.postMessage({ok:false,error:'The local request failed. Check endpoint, protocol, token and plan; no automatic retry was sent.'}));
else void main().catch(()=>{console.error('Local tester could not start or finish. Check the plan, port and output path. Use --plan plan.json --run for CI; credentials belong in MCP_TEST_TOKEN.');process.exitCode=2;});
