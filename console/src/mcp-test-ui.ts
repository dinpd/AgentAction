import { boundedJSON, isObject, parsePlan, parseTestReport, runSample, samplePlan, type TestPlan, type TestReport, type TestTool } from './mcp-test-plan.ts';

const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const node=(tag:string,text:string)=>{const n=document.createElement(tag);n.textContent=text;return n;};
const local=document.body.dataset.localRunner==='true';
let tools:TestTool[]=[],advanced=false,lastReport:TestReport|undefined,busy=false;
let sessionToken=new URLSearchParams(location.hash.slice(1)).get('token')||'';
if(local)history.replaceState(null,'',location.pathname);
const status=(text:string)=>{el('test-status').textContent=text;};
function showTests(){el('behavior-tests').hidden=false;const inspect=el('inspect-mode');if(inspect)inspect.hidden=true;const sample=el('try-behavior');if(sample)sample.hidden=true;el('mode-test')?.setAttribute('aria-pressed','true');el('mode-inspect')?.setAttribute('aria-pressed','false');el('behavior-tests').scrollIntoView({block:'start',behavior:'smooth'});}
function own(){showTests();el('test-editor').hidden=false;el('test-source').textContent=local?'Local runner':'Plan setup · runs locally';}
function download(name:string,value:string,type='application/json') {
  const url=URL.createObjectURL(new Blob([value],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function setTools(values:TestTool[],selected?:string){
  tools=values.slice(0,80).map(t=>({name:t.name,description:t.description,inputSchema:t.inputSchema,...(t.outputSchema?{outputSchema:t.outputSchema}:{})}));
  const select=el<HTMLSelectElement>('test-tool');select.replaceChildren();
  if(!tools.length)select.append(new Option('No tools loaded',''));
  for(const t of tools)select.append(new Option(t.name,t.name));
  if(selected&&tools.some(t=>t.name===selected))select.value=selected;
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
  own();el<HTMLInputElement>('test-endpoint').value=p.endpoint;el<HTMLSelectElement>('test-protocol').value=p.protocol;el<HTMLInputElement>('test-name').value=p.name;
  setTools([p.tool],p.tool.name);buildFields(p.arguments);
  el<HTMLInputElement>('test-deadline').value=String(p.deadlineMs);el<HTMLInputElement>('test-negative').checked=p.missingArgument;
  el<HTMLTextAreaElement>('test-error-arguments').value=p.errorArguments?JSON.stringify(p.errorArguments,null,2):'';el<HTMLInputElement>('test-expected').value=p.expectedText||'';preview();
}
function preview(){
  const name=el<HTMLSelectElement>('test-tool').value,endpoint=el<HTMLInputElement>('test-endpoint').value;
  const count=1+Number(el<HTMLInputElement>('test-negative').checked)+Number(!!el<HTMLTextAreaElement>('test-error-arguments').value.trim());
  el('test-call-preview').textContent=name?`${name} → ${endpoint||'choose an endpoint'} · Up to ${count} tool ${count===1?'call':'calls'}. Calls may have side effects. Use a staging fixture. No automatic retries.`:'Select a tool to review the target and call count.';
}
function renderReport(value:unknown,imported=false){
  const r=parseTestReport(value);lastReport=r;showTests();el('test-results').hidden=false;
  const labels={passed:'Passed',failed:'Failed',inconclusive:'Inconclusive','not-run':'Not run'};
  el('test-source').textContent=imported?'Imported report · not verified':r.source==='sample'?'Synthetic sample · no provider calls':'Local run';
  el('test-result-title').textContent=`${labels[r.status]} · ${r.checks.filter(c=>c.status==='passed').length} of 5 checks passed`;
  el('test-result-context').textContent=`${r.tool} · ${new Date(r.checkedAt).toLocaleString()} · ${r.calls===null?'Unknown':r.calls} tool calls · ${r.durationMs} ms. Business outcome unverified.`;
  const list=el('test-checks');list.replaceChildren();
  for(const c of r.checks){const card=node('article','');card.className='test-check';card.dataset.status=c.status;card.append(node('span',labels[c.status]),node('strong',c.title),node('p',c.detail));list.append(card);}
  const heading=el('test-result-title');heading.tabIndex=-1;heading.focus({preventScroll:true});el('test-results').scrollIntoView({block:'start',behavior:'smooth'});
}
async function perform(work:()=>Promise<void>){
  if(busy)return;busy=true;
  const controls=[...el('behavior-tests').querySelectorAll<HTMLButtonElement>('button')];for(const c of controls)c.disabled=true;
  try{await work();}catch(error){status(error instanceof Error?error.message:'The test could not finish. No automatic retry was sent.');}
  finally{busy=false;for(const c of controls)c.disabled=false;}
}
async function api(path:string,body:unknown){
  const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json','x-agentaction-runner':sessionToken},body:JSON.stringify(body)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'The local runner is unavailable.');return result;
}
const storageKey='agentaction.mcp-test-plans.v1';
function saved():TestPlan[]{try{const raw=localStorage.getItem(storageKey);if(!raw)return [];const items=boundedJSON(raw);if(!Array.isArray(items)||items.length>12)throw new Error();return items.map(parsePlan);}catch{status('Saved plans could not be read. Import a saved JSON plan or export your current plan.');return [];}}
function savedList(selected?:string){const select=el<HTMLSelectElement>('test-saved');select.replaceChildren(new Option('Choose a saved plan',''));for(const p of saved())select.add(new Option(p.name,p.name));if(selected)select.value=selected;}
function guard(work:()=>void){try{work();}catch(error){status(error instanceof Error?error.message:'This operation could not finish.');}}
el('test-sample').addEventListener('click',()=>perform(async()=>{showTests();status('Running the synthetic sample…');renderReport(await runSample());status('Sample complete. These are synthetic results, not a check of your server.');}));
el('test-timeout-sample').addEventListener('click',()=>perform(async()=>{showTests();status('Trying a controlled timeout…');renderReport(await runSample(true));status('The sample stopped after one uncertain call and sent no retry.');}));
el('test-own').addEventListener('click',()=>{own();status(local?'Enter a staging endpoint, load tools, then click Run tests.':'Download the local tester to execute calls on your own server. Plans and imports stay in your browser.');});
el('test-tool').addEventListener('change',()=>buildFields({}));
el('test-arguments').addEventListener('input',()=>{advanced=true;preview();});
el('test-json-details').addEventListener('toggle',()=>{if(el<HTMLDetailsElement>('test-json-details').open&&!advanced)el<HTMLTextAreaElement>('test-arguments').value=JSON.stringify(argumentsValue(),null,2);});
el('test-json-details').querySelector('summary')!.addEventListener('click',()=>{if(!advanced)el<HTMLTextAreaElement>('test-arguments').value=JSON.stringify(argumentsValue(),null,2);});
for(const id of ['test-endpoint','test-negative','test-error-arguments'])el(id).addEventListener('input',preview);
el('test-download').addEventListener('click',()=>perform(async()=>{
  let setup:Record<string,unknown>={endpoint:el<HTMLInputElement>('test-endpoint').value,protocol:el<HTMLSelectElement>('test-protocol').value};
  if(tools.some(t=>t.name===el<HTMLSelectElement>('test-tool').value))setup={...setup,plan:plan()};
  const response=await fetch('/downloads/mcp-test-runner.mjs');if(!response.ok)throw new Error('The tester download is unavailable. Please try again.');
  download('agentaction-mcp-tester.mjs',`globalThis.AGENTACTION_TEST_SETUP=${JSON.stringify(setup)};\n`+await response.text(),'text/javascript');
  el('download-status').textContent='Downloaded. Run node agentaction-mcp-tester.mjs in that folder. A local page opens automatically.';
}));
el('test-discover').addEventListener('click',()=>perform(async()=>{
  status('Loading tools from your local runner…');const result=await api('/api/discover',{endpoint:el<HTMLInputElement>('test-endpoint').value,protocol:el<HTMLSelectElement>('test-protocol').value,token:el<HTMLInputElement>('test-token').value});
  setTools(result.tools);el<HTMLSelectElement>('test-protocol').value=result.protocol;status('Tools loaded. Fill in sample inputs, review the call count, then click Run tests.');
}));
el('test-run').addEventListener('click',()=>perform(async()=>{const p=plan();status('Running the selected checks locally…');const r=await api('/api/run',{plan:p,token:el<HTMLInputElement>('test-token').value});renderReport(r);status('Run complete. Review Not run and Inconclusive checks before drawing conclusions.');}));
el('test-save').addEventListener('click',()=>guard(()=>{const p=plan(),items=saved().filter(v=>v.name!==p.name);if(items.length>=12)throw new Error('Delete a saved plan before adding another. The limit is 12.');items.push(p);const raw=JSON.stringify(items);if(new TextEncoder().encode(raw).length>PLAN_STORAGE_LIMIT)throw new Error('Saved plans exceed this browser’s plan budget. Export the plan instead.');localStorage.setItem(storageKey,raw);savedList(p.name);status('Plan saved in this browser. Connection token excluded.');}));
const PLAN_STORAGE_LIMIT=120000;
el('test-load').addEventListener('click',()=>guard(()=>{const p=saved().find(v=>v.name===el<HTMLSelectElement>('test-saved').value);if(!p)throw new Error('Choose a saved plan.');applyPlan(p);status('Plan loaded. No tests have run.');}));
el('test-delete').addEventListener('click',()=>guard(()=>{const name=el<HTMLSelectElement>('test-saved').value;if(!name)throw new Error('Choose a saved plan.');localStorage.setItem(storageKey,JSON.stringify(saved().filter(p=>p.name!==name)));savedList();status('Saved plan deleted. The current editor remains available.');}));
el('test-export-plan').addEventListener('click',()=>guard(()=>download('mcp-test-plan.json',JSON.stringify(plan(),null,2))));
el('test-export-report').addEventListener('click',()=>{if(lastReport)download('mcp-test-report.json',JSON.stringify(lastReport,null,2));});
async function readFile(input:HTMLInputElement){const file=input.files?.[0];if(!file)return;if(file.size>128*1024)throw new Error('Choose a JSON file smaller than 128 KiB.');return boundedJSON(await file.text());}
el('test-import-plan').addEventListener('change',()=>perform(async()=>{const value=await readFile(el('test-import-plan'));if(value){applyPlan(parsePlan(value));status('Plan imported locally. No tests have run.');}}));
el('test-import-report').addEventListener('change',()=>perform(async()=>{const value=await readFile(el('test-import-report'));if(value){renderReport(value,true);status('Imported report. This evidence has not been independently verified.');}}));
window.addEventListener('agentaction:catalog',event=>{if(local)return;const value=(event as CustomEvent).detail;el<HTMLInputElement>('test-endpoint').value=value.endpoint;el<HTMLSelectElement>('test-protocol').value=value.protocol;setTools(value.tools);});
el('mode-test')?.addEventListener('click',showTests);
el('mode-inspect')?.addEventListener('click',()=>{el('behavior-tests').hidden=true;el('inspect-mode').hidden=false;el('try-behavior').hidden=false;el('mode-inspect').setAttribute('aria-pressed','true');el('mode-test').setAttribute('aria-pressed','false');});
el('try-behavior')?.addEventListener('click',()=>el('test-sample').click());
savedList();
if(local){el('behavior-tests').hidden=false;el('local-setup').hidden=true;el('local-connect').hidden=false;el('test-run').hidden=false;el('test-own').hidden=true;el('test-sample').classList.add('secondary');el('test-heading').textContent='Test your MCP server';own();void perform(async()=>{const setup=await api('/api/setup',{});if(setup.plan)applyPlan(parsePlan(setup.plan));else{el<HTMLInputElement>('test-endpoint').value=setup.endpoint||'';el<HTMLSelectElement>('test-protocol').value=setup.protocol||'2025-11-25';}status('Local tester ready. Load tools or run your saved plan.');});}
