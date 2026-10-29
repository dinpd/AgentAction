import { boundedJSON, isObject, parsePlan, parseTestReport, runSample, testEndpoint, type TestPlan, type TestReport, type TestTool } from './mcp-test-plan.ts';

const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const node=(tag:string,text:string)=>{const n=document.createElement(tag);n.textContent=text;return n;};
const local=document.body.dataset.localRunner==='true';
const cloud=document.body.dataset.cloudRunner==='true';
let cloudWorkspace='',cloudConnection='',cloudRole='viewer',cloudMemberships:any[]=[],cloudConnections:any[]=[],cloudReports:any[]=[];
const incoming=new URLSearchParams(location.hash.slice(1));
const handoff=cloud?incoming.get('plan'):null;
let requestedEndpoint=cloud?incoming.get('endpoint')||'':'';
let cloudPlan:TestPlan|undefined;
let inspectedEndpoint='',inspectedProtocol='';
let tools:TestTool[]=[],advanced=false,lastReport:TestReport|undefined,busy=false;
let sessionToken=new URLSearchParams(location.hash.slice(1)).get('token')||'';
if(local||cloud)history.replaceState(null,'',location.pathname+location.search);
const status=(text:string)=>{el('test-status').textContent=text;};
function showTests(){el('behavior-tests').hidden=false;const options=el<HTMLDetailsElement>('testing-options');if(options)options.open=true;}
function own(){showTests();el('test-editor').hidden=false;el('test-source').textContent=cloud?'AgentAction cloud':local?'On your computer':'Plan setup';}
function download(name:string,value:string,type='application/json') {
  const url=URL.createObjectURL(new Blob([value],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function setTools(values:TestTool[],selected?:string){
  tools=values.slice(0,80).map(t=>({name:t.name,description:t.description,inputSchema:t.inputSchema,...(t.outputSchema?{outputSchema:t.outputSchema}:{})}));
  const select=el<HTMLSelectElement>('test-tool');select.replaceChildren();
  if(!tools.length)select.append(new Option('No tools loaded',''));
  for(const t of tools)select.append(new Option(t.name,t.name));
  if(selected&&tools.some(t=>t.name===selected))select.value=selected;
  el('test-inputs').hidden=!tools.length;
  if(local){el('test-discover').classList.toggle('secondary',!!tools.length);el('test-run').hidden=!tools.length;}
  buildFields({});
}
function buildFields(args:Record<string,unknown>){
  const tool=tools.find(t=>t.name===el<HTMLSelectElement>('test-tool').value),fields=el('test-fields');fields.replaceChildren();advanced=false;
  el('test-tool-description').textContent=tool?.description||'';
  el<HTMLTextAreaElement>('test-arguments').value=JSON.stringify(args,null,2);
  if(!tool){preview();return;}
  const properties=tool.inputSchema.properties;
  const required=Array.isArray(tool.inputSchema.required)?tool.inputSchema.required:[];
  if(isObject(properties)&&Object.keys(properties).length<=24&&!['oneOf','anyOf','allOf','$ref'].some(k=>k in tool.inputSchema)) {
    // Preserve imported fixtures exactly when guided fields cannot represent them.
    if(Object.entries(args).some(([name,value])=>!isObject(properties[name])||value===''||typeof value!==(properties[name].type==='integer'?'number':properties[name].type)))advanced=true;
    for(const [name,schema] of Object.entries(properties)) {
      if(!isObject(schema)||!['string','number','integer','boolean'].includes(schema.type)){advanced=true;break;}
      const label=node('label',name+(required.includes(name)?' *':''));let input:HTMLInputElement|HTMLSelectElement;
      if(schema.type==='boolean'){input=document.createElement('select');input.add(new Option('Not set',''));input.add(new Option('True','true'));input.add(new Option('False','false'));input.value=args[name]===undefined?'':String(args[name]);}
      else{input=document.createElement('input');input.type=['number','integer'].includes(schema.type)?'number':'text';if(schema.type==='integer')input.step='1';input.value=args[name]===undefined?'':String(args[name]);}
      input.dataset.field=name;input.dataset.kind=schema.type;input.addEventListener('input',preview);label.append(input);fields.append(label);
    }
  }else advanced=true;
  const details=el<HTMLDetailsElement>('test-json-details');details.open=advanced;
  if(advanced){fields.replaceChildren(node('p','This tool uses complex inputs. Edit the JSON sample below.'));}
  preview();
}
function argumentsValue():Record<string,unknown>{
  if(advanced)return boundedJSON(el<HTMLTextAreaElement>('test-arguments').value);
  const pairs:Array<[string,unknown]>=[];
  for(const field of el('test-fields').querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-field]'))if(field.value!=='')pairs.push([field.dataset.field!,field.dataset.kind==='boolean'?field.value==='true':['number','integer'].includes(field.dataset.kind!)?Number(field.value):field.value]);
  return Object.fromEntries(pairs);
}
function plan():TestPlan{
  const tool=tools.find(t=>t.name===el<HTMLSelectElement>('test-tool').value);if(!tool)throw new Error('Load tools and choose the one you want to test.');
  const error=el<HTMLTextAreaElement>('test-error-arguments').value.trim(),expected=el<HTMLInputElement>('test-expected').value;
  return parsePlan({schemaVersion:'agentaction.mcp-test-plan.v1',name:el<HTMLInputElement>('test-name').value,endpoint:el<HTMLInputElement>('test-endpoint').value,protocol:el<HTMLSelectElement>('test-protocol').value,tool,arguments:argumentsValue(),deadlineMs:Number(el<HTMLInputElement>('test-deadline').value),missingArgument:el<HTMLInputElement>('test-negative').checked,...(error?{errorArguments:boundedJSON(error)}:{}),...(expected?{expectedText:expected}:{})});
}
function applyPlan(p:TestPlan){
  if(cloud){const connection=cloudConnections.find(c=>c.endpoint===p.endpoint);if(!connection)throw new Error('This plan needs a matching connected server in the selected workspace. Choose its workspace or manage server connections first.');cloudConnection=connection.id;el<HTMLSelectElement>('cloud-connection').value=cloudConnection;requestedEndpoint=p.endpoint;}
  own();el('test-results').hidden=true;el<HTMLInputElement>('test-endpoint').value=p.endpoint;el<HTMLSelectElement>('test-protocol').value=p.protocol;el<HTMLInputElement>('test-name').value=p.name;
  setTools([p.tool],p.tool.name);buildFields(p.arguments);
  el<HTMLInputElement>('test-deadline').value=String(p.deadlineMs);el<HTMLInputElement>('test-negative').checked=p.missingArgument;
  el<HTMLTextAreaElement>('test-error-arguments').value=p.errorArguments?JSON.stringify(p.errorArguments,null,2):'';el<HTMLInputElement>('test-expected').value=p.expectedText||'';preview();if(cloud)cloudControls();
}
function preview(){
  const name=el<HTMLSelectElement>('test-tool').value,endpoint=el<HTMLInputElement>('test-endpoint').value;
  const count=1+Number(el<HTMLInputElement>('test-negative').checked)+Number(!!el<HTMLTextAreaElement>('test-error-arguments').value.trim());
  el('test-call-preview').textContent=name?`${name} → ${endpoint||'choose an endpoint'} · Up to ${count} tool ${count===1?'call':'calls'}. Calls may have side effects. Use a staging fixture. No automatic retries.`:'Select a tool to review the target and call count.';
}
function renderReport(value:unknown,imported=false){
  const r=parseTestReport(value);lastReport=r;showTests();el('test-results').hidden=false;
  const labels={passed:'Passed',failed:'Failed',inconclusive:'Inconclusive','not-run':'Not run'};
  el('test-source').textContent=imported?'Imported report · not verified':r.source==='sample'?'Synthetic sample · no provider calls':r.source==='cloud'?'AgentAction cloud run':'Local run';
  el('test-result-title').textContent=`${labels[r.status]} · ${r.checks.filter(c=>c.status==='passed').length} of 5 checks passed`;
  el('test-result-context').textContent=`${r.tool} · ${new Date(r.checkedAt).toLocaleString()} · ${r.calls===null?'Unknown':r.calls} tool calls · ${r.durationMs} ms. Business outcome unverified.`;
  const list=el('test-checks');list.replaceChildren();
  for(const c of r.checks){const card=document.createElement('details');card.className='test-check';card.dataset.status=c.status;card.open=['failed','inconclusive'].includes(c.status);const summary=node('summary','');summary.append(node('span',labels[c.status]),node('strong',c.title));card.append(summary,node('p',c.detail));list.append(card);}
  const heading=el('test-result-title');heading.tabIndex=-1;heading.focus({preventScroll:true});el('test-results').scrollIntoView({block:'start',behavior:'smooth'});
}
async function perform(work:()=>Promise<void>){
  if(busy)return;busy=true;
  const controls=[...el('behavior-tests').querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('button,input,select,textarea'),...(cloud?[...el('cloud-controls').querySelectorAll<HTMLSelectElement|HTMLInputElement|HTMLButtonElement>('select,input,button')]:[])];for(const c of controls)c.disabled=true;
  try{await work();}catch(error){status(error instanceof Error?error.message:'The test could not finish. No automatic retry was sent.');}
  finally{busy=false;for(const c of controls)c.disabled=false;if(cloud)cloudControls();}
}
async function api(path:string,body:unknown){
  if(cloud){
    if(!cloudWorkspace||!cloudConnection)throw new Error('Choose a workspace and connected staging server.');
    if(!['owner','operator'].includes(cloudRole))throw new Error('An owner or operator must run cloud tests.');
    if(path==='/api/discover')return cloudRequest('test-discover',{connectionId:cloudConnection});
    if(path==='/api/run'){
      const requestId=Date.now()+'-'+crypto.randomUUID();
      try{const report=await cloudRequest('test-run',{connectionId:cloudConnection,requestId,plan:(body as any).plan,stagingConfirmed:true});try{await refreshCloudReports();}catch{}return report;}
      catch(error){await refreshCloudReports();const retained=cloudReports.find(r=>r.id===requestId);if(retained)return retained.report;throw error;}
    }
    throw new Error('Unsupported cloud operation.');
  }
  const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json','x-agentaction-runner':sessionToken},body:JSON.stringify(body)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'The local runner is unavailable.');return result;
}
let storageKey='agentaction.mcp-test-plans.v1';
function saved():TestPlan[]{try{const raw=localStorage.getItem(storageKey);if(!raw)return [];const items=boundedJSON(raw);if(!Array.isArray(items)||items.length>12)throw new Error();return items.map(parsePlan);}catch{status('Saved plans could not be read. Import a saved JSON plan or export your current plan.');return [];}}
function savedList(selected?:string){const select=el<HTMLSelectElement>('test-saved'),plans=saved();el('test-saved-field').hidden=!plans.length;select.replaceChildren(new Option('New test',''));for(const p of plans)select.add(new Option(p.name,p.name));if(selected)select.value=selected;}
function guard(work:()=>void){try{work();}catch(error){status(error instanceof Error?error.message:'This operation could not finish.');}}
el('test-sample').addEventListener('click',()=>perform(async()=>{showTests();status('Running the synthetic sample…');renderReport(await runSample());status('Sample complete. These are synthetic results, not a check of your server.');}));
el('test-timeout-sample').addEventListener('click',()=>perform(async()=>{showTests();status('Trying a controlled timeout…');renderReport(await runSample(true));status('The sample stopped after one uncertain call and sent no retry.');}));
el('test-tool').addEventListener('change',()=>{buildFields({});el<HTMLInputElement>('test-name').value=el<HTMLSelectElement>('test-tool').value.slice(0,75)+' test';el<HTMLSelectElement>('test-saved').value='';});
el('test-arguments').addEventListener('input',()=>{advanced=true;preview();});
el('test-json-details').addEventListener('toggle',()=>{if(el<HTMLDetailsElement>('test-json-details').open&&!advanced)el<HTMLTextAreaElement>('test-arguments').value=JSON.stringify(argumentsValue(),null,2);});
el('test-json-details').querySelector('summary')!.addEventListener('click',()=>{if(!advanced)el<HTMLTextAreaElement>('test-arguments').value=JSON.stringify(argumentsValue(),null,2);});
for(const id of ['test-endpoint','test-negative','test-error-arguments'])el(id).addEventListener('input',preview);
el('test-download').addEventListener('click',()=>perform(async()=>{
  let setup:Record<string,unknown>={endpoint:el<HTMLInputElement>('test-endpoint').value,protocol:el<HTMLSelectElement>('test-protocol').value};
  if(cloudPlan)setup={endpoint:cloudPlan.endpoint,protocol:cloudPlan.protocol,plan:cloudPlan};
  else if(tools.some(t=>t.name===el<HTMLSelectElement>('test-tool').value))setup={...setup,plan:plan()};
  const response=await fetch('/downloads/mcp-test-runner.mjs');if(!response.ok)throw new Error('The tester download is unavailable. Please try again.');
  download('agentaction-mcp-tester.mjs',`globalThis.AGENTACTION_TEST_SETUP=${JSON.stringify(setup)};\n`+await response.text(),'text/javascript');
  el('download-status').textContent='Downloaded. Run node agentaction-mcp-tester.mjs in that folder. A local page opens automatically.';
}));
function continueInCloud(selected?:TestPlan){
  if(selected&&new TextEncoder().encode(JSON.stringify(selected)).length>18000)throw new Error('This plan is too large for cloud testing. Use the local tester below.');
  const url=new URL('https://observability-console.agentaction.dev/mcp-tests');
  const endpoint=selected?.endpoint||el<HTMLInputElement>('endpoint')?.value.trim()||el<HTMLInputElement>('test-endpoint').value;
  if(selected)url.hash='plan='+encodeURIComponent(JSON.stringify(selected));
  else if(endpoint){const params=new URLSearchParams({endpoint:testEndpoint(endpoint)});if(endpoint===inspectedEndpoint&&inspectedProtocol)params.set('protocol',inspectedProtocol);url.hash=params.toString();}
  location.assign(url.href);
}
el('test-cloud').addEventListener('click',()=>guard(()=>continueInCloud(tools.some(t=>t.name===el<HTMLSelectElement>('test-tool').value)?plan():undefined)));
el('continue-test')?.addEventListener('click',()=>{try{continueInCloud();}catch(error){el('status').textContent=error instanceof Error?error.message:'Check the endpoint or use the local tester below.';el<HTMLDetailsElement>('testing-options').open=true;}});
function nextStep(){
  const endpoint=el<HTMLInputElement>('endpoint')?.value.trim();if(!endpoint)return;
  el('test-next').hidden=false;el('continue-test').classList.add('text-button');
}
el('endpoint')?.addEventListener('input',()=>{el('report').hidden=true;el('run').classList.remove('secondary');el('continue-test').classList.add('text-button');el('test-next').hidden=!el<HTMLInputElement>('endpoint').value.trim();el('test-next-heading').textContent='Need to test a signed-in server?';el('test-next-copy').textContent='Continue with an approved workspace connection to prepare a real tool call.';});
el('test-discover').addEventListener('click',()=>perform(async()=>{
  status('Loading tool definitions…');const result=await api('/api/discover',{endpoint:el<HTMLInputElement>('test-endpoint').value,protocol:el<HTMLSelectElement>('test-protocol').value,token:el<HTMLInputElement>('test-token').value});
  setTools(result.tools);el<HTMLSelectElement>('test-protocol').value=result.protocol;status('Tools loaded. Add staging inputs, then Run test.');
}));
el('test-run').addEventListener('click',()=>perform(async()=>{const p=plan();status(cloud?'Running your test in AgentAction…':'Running your test locally…');const r=await api('/api/run',{plan:p,token:el<HTMLInputElement>('test-token').value});renderReport(r);status('Run complete. Open any failed or inconclusive check for details.');}));
el('test-save').addEventListener('click',()=>guard(()=>{const p=plan(),items=saved().filter(v=>v.name!==p.name);if(items.length>=12)throw new Error('Delete a saved plan before adding another. The limit is 12.');items.push(p);const raw=JSON.stringify(items);if(new TextEncoder().encode(raw).length>PLAN_STORAGE_LIMIT)throw new Error('Saved plans exceed this browser’s plan budget. Export the plan instead.');localStorage.setItem(storageKey,raw);savedList(p.name);status('Plan saved in this browser. Connection token excluded.');}));
const PLAN_STORAGE_LIMIT=120000;
el('test-saved').addEventListener('change',()=>guard(()=>{const p=saved().find(v=>v.name===el<HTMLSelectElement>('test-saved').value);if(!p){buildFields({});el<HTMLInputElement>('test-name').value=el<HTMLSelectElement>('test-tool').value.slice(0,75)+' test';el<HTMLInputElement>('test-negative').checked=false;el<HTMLTextAreaElement>('test-error-arguments').value='';el<HTMLInputElement>('test-expected').value='';preview();status('New test. Nothing has run.');return;}applyPlan(p);status('Plan loaded. No tests have run.');}));
el('test-delete').addEventListener('click',()=>guard(()=>{const name=el<HTMLSelectElement>('test-saved').value;if(!name)throw new Error('Choose a saved plan.');localStorage.setItem(storageKey,JSON.stringify(saved().filter(p=>p.name!==name)));savedList();status('Saved plan deleted. The current editor remains available.');}));
el('test-export-plan').addEventListener('click',()=>guard(()=>download('mcp-test-plan.json',JSON.stringify(plan(),null,2))));
el('test-export-report').addEventListener('click',()=>{if(lastReport)download('mcp-test-report.json',JSON.stringify(lastReport,null,2));});
async function readFile(input:HTMLInputElement){const file=input.files?.[0];if(!file)return;if(file.size>128*1024)throw new Error('Choose a JSON file smaller than 128 KiB.');return boundedJSON(await file.text());}
el('test-import-plan').addEventListener('change',()=>perform(async()=>{const value=await readFile(el('test-import-plan'));if(value){applyPlan(parsePlan(value));status('Plan imported. No tests have run.');}}));
el('test-import-report').addEventListener('change',()=>perform(async()=>{const value=await readFile(el('test-import-report'));if(value){renderReport(value,true);status('Imported report. This evidence has not been independently verified.');}}));
window.addEventListener('agentaction:catalog',event=>{
  if(local||cloud)return;
  const value=(event as CustomEvent).detail;
  inspectedEndpoint=value.endpoint;inspectedProtocol=value.protocol||'';
  el<HTMLInputElement>('endpoint').value=value.endpoint;nextStep();
  el('continue-test').classList.remove('text-button');el('test-next-heading').textContent='Try a real tool call';
  el('test-next-copy').textContent='Choose a tool and staging inputs. Nothing executes until you click Run test.';
  el<HTMLInputElement>('test-endpoint').value=value.endpoint;el<HTMLSelectElement>('test-protocol').value=value.protocol;setTools(value.tools);
});
el('test-load-tools').addEventListener('click',()=>el('test-discover').click());
el('test-refresh-tools').addEventListener('click',()=>el('test-discover').click());
savedList();
if(!cloud&&!local){el('test-refresh-tools').hidden=true;el('behavior-tests').hidden=false;el('test-editor').hidden=false;el('test-cloud').hidden=false;nextStep();}
if(local){el('local-setup').hidden=true;el('local-connect').hidden=false;el('test-run').hidden=false;own();void perform(async()=>{const setup=await api('/api/setup',{});if(setup.plan)applyPlan(parsePlan(setup.plan));else{el<HTMLInputElement>('test-endpoint').value=setup.endpoint||'';el<HTMLSelectElement>('test-protocol').value=setup.protocol||'2025-11-25';setTools([]);}status('Local tester ready. Load tools or choose a saved plan.');});}
async function cloudRequest(action:string,body?:unknown){
  const response=await fetch('/api/agents/'+encodeURIComponent(cloudWorkspace)+'/'+action,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json','x-agentaction-request':'agent-builder'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await response.json();if(!response.ok)throw new Error(value.error||'The cloud request could not finish. Open recent results before attempting another run.');return value;
}
function cloudControls(){
  const connection=cloudConnections.find(c=>c.id===cloudConnection);
  const permitted=['owner','operator'].includes(cloudRole)&&!!connection;
  el<HTMLSelectElement>('test-protocol').disabled=true;el<HTMLButtonElement>('test-run').disabled=busy||!permitted||!tools.length;el<HTMLButtonElement>('test-discover').disabled=busy||!permitted;
  el('test-editor').hidden=!permitted;el('test-load-tools').hidden=!!tools.length;el('test-inputs').hidden=!tools.length;
  el('cloud-target-summary').textContent=connection?connection.label+' · '+connection.endpoint:requestedEndpoint?'Connect '+requestedEndpoint:'Choose a staging server';
  el('cloud-create-workspace').hidden=!!cloudWorkspace;
  el('cloud-connect-setup').hidden=!!connection||cloudRole!=='owner'||!cloudWorkspace;
  el('cloud-access').textContent=!cloudWorkspace?'Create a workspace to connect your staging server.':cloudRole==='viewer'?'You can view recent results. Ask a workspace owner or operator to run a test.':connection?'':requestedEndpoint?'This server isn’t connected in this workspace. Connect it below or choose its workspace.':'Connect a public HTTPS staging server to prepare your first test.';
  el<HTMLDetailsElement>('cloud-controls').open=!connection;
}
async function refreshCloudReports(){
  cloudReports=cloudWorkspace?(await cloudRequest('test-reports')).reports:[];
  const select=el<HTMLSelectElement>('cloud-reports');select.replaceChildren(new Option('Choose a retained result',''));
  for(const r of cloudReports)select.add(new Option(new Date(r.report.checkedAt).toLocaleString()+' · '+r.report.tool+' · '+r.report.status,r.id));
}
function selectCloudConnection(){
  cloudConnection=el<HTMLSelectElement>('cloud-connection').value;const connection=cloudConnections.find(c=>c.id===cloudConnection);
  el('test-results').hidden=true;lastReport=undefined;
  el<HTMLInputElement>('test-negative').checked=false;el<HTMLTextAreaElement>('test-error-arguments').value='';el<HTMLInputElement>('test-expected').value='';
  el<HTMLInputElement>('test-endpoint').value=connection?.endpoint||requestedEndpoint||'';el<HTMLSelectElement>('test-protocol').value=connection?.protocol||'2025-11-25';setTools(connection?.tools||[]);cloudControls();
}
async function selectCloudWorkspace(){
  cloudWorkspace=el<HTMLSelectElement>('cloud-workspace').value;cloudRole=cloudMemberships.find(m=>m.tenant.tenant_id===cloudWorkspace)?.membership.role||'viewer';cloudConnections=[];cloudConnection='';
  el<HTMLSelectElement>('cloud-connection').value='';
  storageKey='agentaction.mcp-test-plans.v1.cloud.'+cloudWorkspace;savedList();selectCloudConnection();
  el<HTMLAnchorElement>('cloud-connections-link').href='/agents'+(cloudWorkspace?'?workspace='+encodeURIComponent(cloudWorkspace):'')+'#connect';
  const state=cloudWorkspace?await cloudRequest('state'):{connections:[]};cloudConnections=(state.connections||[]).filter((c:any)=>{try{return c.status==='connected'&&testEndpoint(c.endpoint).startsWith('https:');}catch{return false;}});
  const select=el<HTMLSelectElement>('cloud-connection');select.replaceChildren();if(!cloudConnections.length)select.add(new Option('No connected servers',''));for(const c of cloudConnections)select.add(new Option(c.label+' · '+c.endpoint,c.id));
  if(requestedEndpoint){const matching=cloudConnections.find(c=>c.endpoint===requestedEndpoint);select.value=matching?.id||'';}
  selectCloudConnection();await refreshCloudReports();
  if(cloudPlan&&cloudConnections.some(c=>c.endpoint===cloudPlan!.endpoint)){applyPlan(cloudPlan);cloudPlan=undefined;status('Plan opened for review. No tests have run. Click Run test when you’re ready.');}
  else status(cloudPlan?'Choose the workspace containing this plan’s connected server. No tests have run.':'Ready. Add staging inputs or choose a saved plan.');
}
if(cloud){
  el('cloud-review').hidden=false;el('local-connect').hidden=false;el('test-token').closest('label')!.hidden=true;el('test-run').hidden=false;el('test-connection-block').hidden=true;own();el('test-editor').hidden=true;
  el<HTMLInputElement>('test-endpoint').readOnly=true;el<HTMLSelectElement>('test-protocol').disabled=true;
  el('cloud-connect-server').addEventListener('click',()=>perform(async()=>{
    if(cloudRole!=='owner')throw new Error('A workspace owner must approve this connection.');
    const endpoint=testEndpoint(el<HTMLInputElement>('cloud-new-endpoint').value);
    if(!endpoint.startsWith('https:'))throw new Error('Cloud testing needs a public HTTPS server. Use the local tester for this endpoint.');
    const token=el<HTMLInputElement>('cloud-new-token').value;el<HTMLInputElement>('cloud-new-token').value='';
    status('Approving this endpoint and loading its tool catalog…');
    await cloudRequest('approve-endpoint',{endpoint,reviewed:true});
    await cloudRequest('connect',{endpoint,protocol:el<HTMLSelectElement>('cloud-new-protocol').value,...(token?{token}:{})});
    requestedEndpoint=endpoint;await selectCloudWorkspace();status('Connected. Add staging inputs, then Run test.');
  }));
  el('cloud-workspace').addEventListener('change',()=>perform(selectCloudWorkspace));el('cloud-connection').addEventListener('change',()=>{requestedEndpoint='';cloudPlan=undefined;selectCloudConnection();});
  el('cloud-refresh-reports').addEventListener('click',()=>perform(refreshCloudReports));el('cloud-reports').addEventListener('change',()=>guard(()=>{const retained=cloudReports.find(r=>r.id===el<HTMLSelectElement>('cloud-reports').value);if(!retained)return;renderReport(retained.report);status('Retained result opened. No new tool calls sent.');}));
  void perform(async()=>{
    if(handoff){cloudPlan=parsePlan(boundedJSON(handoff));requestedEndpoint=cloudPlan.endpoint;}
    el<HTMLSelectElement>('cloud-new-protocol').value=(cloudPlan?.protocol||incoming.get('protocol'))==='2026-07-28'?'2026-07-28':'2025-03-26';
    if(requestedEndpoint){requestedEndpoint=testEndpoint(requestedEndpoint);el<HTMLInputElement>('cloud-new-endpoint').value=requestedEndpoint;}
    const response=await fetch('/api/console/session');if(!response.ok)throw new Error('Sign in to your AgentAction workspace to run a test.');const session=await response.json();cloudMemberships=session.memberships||[];
    const select=el<HTMLSelectElement>('cloud-workspace');select.replaceChildren();for(const m of cloudMemberships)select.add(new Option(m.tenant.display_name||m.tenant.tenant_id,m.tenant.tenant_id));
    if(cloudMemberships.some(m=>m.tenant.tenant_id===session.tenant_id))select.value=session.tenant_id;await selectCloudWorkspace();
  });
}
