import { factorNames, cases } from "./corpus.mjs";
import { percentile } from "../metrics.mjs";
const labels=["allow","deny","challenge_required"];
function classification(rows,predicted,expected) {
  const confusion=Object.fromEntries(labels.map(a=>[a,Object.fromEntries(labels.map(b=>[b,rows.filter(r=>r.expected[expected]===a&&r[predicted]===b).length]))]));
  const exact=rows.filter(r=>r[predicted]===r.expected[expected]).length;
  const per_class=Object.fromEntries(labels.map(label=>{const tp=confusion[label][label],fp=labels.reduce((n,x)=>n+(x===label?0:confusion[x][label]),0),fn=labels.reduce((n,x)=>n+(x===label?0:confusion[label][x]),0);return [label,{support:labels.reduce((n,x)=>n+confusion[label][x],0),precision:tp+fp?tp/(tp+fp):0,recall:tp+fn?tp/(tp+fn):0,f1:2*tp+fp+fn?2*tp/(2*tp+fp+fn):0}]}));
  return {count:rows.length,exact,accuracy:rows.length?exact/rows.length:null,macro_f1:labels.reduce((s,l)=>s+per_class[l].f1,0)/3,confusion,per_class,
    unsafe_allows:rows.filter(r=>r.expected[expected]!=="allow"&&r[predicted]==="allow").length,
    false_denies:rows.filter(r=>r.expected[expected]==="allow"&&r[predicted]==="deny").length,
    unnecessary_reviews:rows.filter(r=>r.expected[expected]==="allow"&&r[predicted]==="challenge_required").length,
    review_count:rows.filter(r=>r[predicted]==="challenge_required").length};
}
export function evaluate(rows) {
  const completed=rows.filter(r=>!r.dropped),valid=completed.filter(r=>r.provider?.status==="ok");
  const per_factor=Object.fromEntries(factorNames.map(f=>{const scored=valid.filter(r=>r.expected.factors[f]!==null),n=scored.length;return [f,{scored:n,correct:scored.filter(r=>Number(r.provider.answers[f]>=.5)===r.expected.factors[f]).length,accuracy:n?scored.filter(r=>Number(r.provider.answers[f]>=.5)===r.expected.factors[f]).length/n:null,brier:n?scored.reduce((s,r)=>s+(r.provider.answers[f]-r.expected.factors[f])**2,0)/n:null}]}));
  const groups=Object.groupBy(completed,r=>r.case_id);
  const inconsistent_cases=Object.entries(groups).filter(([,rs])=>new Set(rs.map(r=>r.final)).size>1).map(([id])=>id);
  const factor_unstable_cases=Object.entries(groups).filter(([,rs])=>new Set(rs.filter(r=>r.provider.status==="ok").map(r=>factorNames.map(f=>r.provider.answers[f]>=.5).join())).size>1).map(([id])=>id);
  const paired=[];
  for(const c of cases.filter(c=>c.pair))for(const r of completed.filter(r=>r.case_id===c.id)){const base=completed.find(b=>b.case_id===c.pair&&b.repeat===r.repeat);if(base)paired.push({case_id:c.id,repeat:r.repeat,correct:base.final===base.expected.final&&r.final===r.expected.final});}
  return {unique_cases:Object.keys(groups).length,semantic:classification(completed,"advisory","semantic"),combined:classification(completed,"final","final"),per_factor,inconsistent_cases,factor_unstable_cases,paired:{count:paired.length,correct:paired.filter(p=>p.correct).length},failures:completed.filter(r=>r.final!==r.expected.final||r.advisory!==r.expected.semantic||r.provider.status!=="ok").map(r=>({case_id:r.case_id,repeat:r.repeat,expected:r.expected.final,actual:r.final,expected_semantic:r.expected.semantic,advisory:r.advisory,status:r.provider.status}))};
}
export function summarize(rows,elapsed_ms) {
  const completed=rows.filter(r=>!r.dropped),valid=completed.filter(r=>r.provider?.status==="ok"),costs=completed.map(r=>r.provider?.cost_usd??null),known=costs.filter(c=>c!==null);
  return {offered:rows.length,completed:completed.length,successful:valid.length,dropped:rows.length-completed.length,elapsed_ms,successful_rps:valid.length/(elapsed_ms/1000),
    latency_ms:Object.fromEntries([.5,.95,.99].map(q=>['p'+q*100,percentile(completed.map(r=>r.latency_ms),q)])),
    successful_latency_ms:Object.fromEntries([.5,.95,.99].map(q=>['p'+q*100,percentile(valid.map(r=>r.latency_ms),q)])),
    schedule_lag_p99_ms:percentile(rows.map(r=>r.schedule_lag_ms??0),.99),
    errors:Object.fromEntries([...new Set(completed.filter(r=>r.provider.status!=="ok").map(r=>r.provider.status))].map(s=>[s,completed.filter(r=>r.provider.status===s).length])),
    provider_requests:completed.length,questions_attempted:completed.length*factorNames.length,input_tokens:completed.reduce((s,r)=>s+(r.provider.usage?.input_tokens??0),0),output_tokens:completed.reduce((s,r)=>s+(r.provider.usage?.output_tokens??0),0),
    observed_cost_usd:known.length?known.reduce((a,b)=>a+b,0):null,unknown_cost_requests:costs.length-known.length,cost_per_1000_successful:valid.length&&known.length===completed.length?known.reduce((a,b)=>a+b,0)/valid.length*1000:null,
    evals:evaluate(completed)};
}
