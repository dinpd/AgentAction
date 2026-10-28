type ResultClass = 'result_returned' | 'http_error' | 'json_rpc_error' | 'tool_error' | 'invalid_response' | 'transport_unknown' | 'unclassified';
export type ObservationReport = {
  schemaVersion: 'agentaction.observation-report.v1';
  observedCalls: number; omittedEntries: number; ignoredEntries: number;
  evaluations: Record<'evaluated'|'skipped'|'error',number>;
  policy: Record<'allow'|'deny'|'challenge_required'|'unknown',number>;
  results: Record<ResultClass,number>;
  timing: {samples:number;p50Ms:number|null;maxMs:number|null};
  findings: Array<{category:string;calls:number;nextStep:string}>;
  tools: Array<{name:string;calls:number}>;
  businessOutcome: 'unverified';
};

// Normalize to fixed categories: policy reasons can contain resource or field values.
const categories=[
  {category:'Idempotency or duplicate action',pattern:/idempotency|duplicate|single.use/i,nextStep:'Bind a stable action key to the exact request and retain the provider result durably. Check provider state before repeating an uncertain mutation.'},
  {category:'Approval required',pattern:/approval|jit.grant/i,nextStep:'Review the exact action and bind approval to its arguments and expiry before enabling enforcement.'},
  {category:'Execution budget or loop',pattern:/budget|exceeds max|thrash|retry|loop/i,nextStep:'Review repeated calls and choose per-job call, retry and runtime ceilings.'},
  {category:'Data-flow restriction',pattern:/domain|field.*block|pii|data.flow|destination/i,nextStep:'Review allowed destinations and sensitive fields in trusted policy.'},
  {category:'Identity or mapping coverage',pattern:/identity|issuer|scope|mapping|local.policy|policy evaluation|local_guard/i,nextStep:'Configure trusted identity and tool mappings, then observe again before relying on policy coverage.'},
];

export function observationReport(entries: unknown[]): ObservationReport {
  const report:ObservationReport={schemaVersion:'agentaction.observation-report.v1',observedCalls:0,omittedEntries:0,ignoredEntries:0,evaluations:{evaluated:0,skipped:0,error:0},policy:{allow:0,deny:0,challenge_required:0,unknown:0},results:{result_returned:0,http_error:0,json_rpc_error:0,tool_error:0,invalid_response:0,transport_unknown:0,unclassified:0},timing:{samples:0,p50Ms:null,maxMs:null},findings:[],tools:[],businessOutcome:'unverified'};
  const times:number[]=[],tools=new Map<string,number>(),findings=new Map<string,{calls:number;nextStep:string}>();
  for(const raw of entries) {
    if(!raw||typeof raw!=='object'||Array.isArray(raw)) {report.ignoredEntries++;continue;}
    const e=raw as Record<string,unknown>;
    if(e.event!=='agentaction.mcp.observation'||e.mode!=='observe'||!['evaluated','skipped','error'].includes(String(e.evaluation_status))) {report.ignoredEntries++;continue;}
    if(report.observedCalls>=1000) {report.omittedEntries++;continue;}
    report.observedCalls++;report.evaluations[e.evaluation_status as keyof typeof report.evaluations]++;
    const decision=e.evaluation_status==='evaluated'&&Object.hasOwn(report.policy,String(e.counterfactual_decision))?String(e.counterfactual_decision) as keyof typeof report.policy:'unknown';
    report.policy[decision]++;
    const result=Object.hasOwn(report.results,String(e.result_class))?String(e.result_class) as ResultClass:'unclassified';report.results[result]++;
    if(typeof e.duration_ms==='number'&&Number.isFinite(e.duration_ms)&&e.duration_ms>=0&&e.duration_ms<=86400000) times.push(e.duration_ms);
    const tool=typeof e.tool==='string'&&/^[a-zA-Z0-9_.:-]{1,128}$/.test(e.tool)?e.tool:'(unmapped tool)';tools.set(tool,(tools.get(tool)||0)+1);
    const seen=new Set<string>();
    for(const reason of Array.isArray(e.findings)?e.findings.slice(0,32):[]) {
      const match=typeof reason==='string'?categories.find(c=>c.pattern.test(reason.slice(0,2000))):undefined;
      const category=match?.category||'Other policy finding';
      if(seen.has(category))continue;seen.add(category);
      const old=findings.get(category);findings.set(category,{calls:(old?.calls||0)+1,nextStep:match?.nextStep||'Review this call in the customer-controlled logs. Raw finding text is excluded from this report.'});
    }
  }
  times.sort((a,b)=>a-b);report.timing={samples:times.length,p50Ms:times.length?times[Math.floor((times.length-1)/2)]:null,maxMs:times.length?times[times.length-1]:null};
  report.findings=[...findings].map(([category,v])=>({category,...v})).sort((a,b)=>b.calls-a.calls||a.category.localeCompare(b.category));
  report.tools=[...tools].map(([name,calls])=>({name,calls})).sort((a,b)=>b.calls-a.calls||a.name.localeCompare(b.name));
  return report;
}

export function observationText(r:ObservationReport):string {
  return [
    'What needs attention',
    `${r.observedCalls} calls observed. ${r.policy.deny} would be denied; ${r.policy.challenge_required} would require approval.`,
    ...r.findings.map(f=>`- ${f.category}: ${f.calls} ${f.calls===1?'call':'calls'}. ${f.nextStep}`),
    `Policy coverage: ${r.evaluations.evaluated} evaluated, ${r.evaluations.skipped} skipped, ${r.evaluations.error} evaluation errors.`,
    `Results: ${r.results.result_returned} returned, ${r.results.http_error} HTTP errors, ${r.results.tool_error} tool errors, ${r.results.json_rpc_error} protocol errors, ${r.results.invalid_response} invalid responses, ${r.results.transport_unknown} transport outcomes unknown, ${r.results.unclassified} unclassified.`,
    'Business outcome: unverified. A returned result does not prove task completion. Check provider state before repeating a consequential call with an unknown result.',
    `Timing: ${r.timing.samples} samples; p50 ${r.timing.p50Ms??'unavailable'} ms; max ${r.timing.maxMs??'unavailable'} ms.`,
    `Coverage: first 1,000 observation events; ${r.omittedEntries} omitted, ${r.ignoredEntries} non-observation or invalid entries ignored. No findings does not establish safety.`,
    'Raw arguments, results, identities and finding values are excluded. Tool names and fixed finding categories remain visible; review before sharing.',
  ].join('\n');
}

export function observationHtml(r:ObservationReport):string {
  const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>MCP observation report · AgentAction</title><style>body{font:16px/1.6 system-ui,sans-serif;background:#f5f5ee;color:#20251d;margin:0}main{max-width:900px;margin:auto;padding:32px 24px}h1{font-size:36px;line-height:1.15}h2{margin-top:32px}p,li{overflow-wrap:anywhere}section{background:white;padding:22px;border:1px solid #bac5ad;margin:20px 0}.muted{color:#596150}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid #bac5ad}</style><main><p class="muted">AgentAction · Passive observation · Reference integration</p><h1>What needs attention</h1><p>${r.observedCalls} calls observed · ${r.policy.deny} would be denied · ${r.policy.challenge_required} would require approval</p><section><h2>Policy findings</h2>${r.findings.length?r.findings.map(f=>`<h3>${esc(f.category)} · ${f.calls} ${f.calls===1?'call':'calls'}</h3><p>${esc(f.nextStep)}</p>`).join(''):'<p>No policy findings in the retained events. Review evaluation coverage before drawing conclusions.</p>'}</section><section><h2>Errors and coverage</h2><pre>${esc(observationText(r).split('\n').filter(l=>!l.startsWith('- ')&&l!=='What needs attention').join('\n\n'))}</pre></section><details><summary>Calls by tool</summary><table><thead><tr><th scope="col">Tool</th><th scope="col">Calls</th></tr></thead><tbody>${r.tools.map(t=>`<tr><td>${esc(t.name)}</td><td>${t.calls}</td></tr>`).join('')}</tbody></table></details></main></html>`;
}
