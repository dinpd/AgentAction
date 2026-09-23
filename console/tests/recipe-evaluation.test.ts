import test from 'node:test';
import assert from 'node:assert/strict';
import { bindRecipeEval, issueHostedContract, evaluateHostedRun, type EvaluationRun, type RecipeCheck } from '../src/recipe-evaluation.ts';
import type { RecipeDefinition } from '../src/workspace-recipes.ts';
const checks: RecipeCheck[] = [
 {id:'read_done',label:'Read succeeded',kind:'tool_succeeded',tool:'read'},
 {id:'no_write',label:'No write',kind:'tool_not_called',tool:'write'},
 {id:'price',label:'Price at least 20',kind:'result_field',tool:'read',path:'price',operator:'gte',value:20},
 {id:'source',label:'Source exists',kind:'result_field',tool:'read',path:'source.url',operator:'exists'},
];
const definition: RecipeDefinition = {title:'Report',goal:'Read a supplied page',inputGuide:'URL',instructions:'Read once',boundaries:'No changes',success:'Sourced summary',tools:['read','write'],evaluation:{version:1,checks}};
async function run(): Promise<EvaluationRun> {
 const binding=(await bindRecipeEval(definition,{id:'recipe',version:1}))!;
 const run: EvaluationRun={id:'r',agentId:'a',status:'completed',startedAt:'2026-09-17T10:00:00.000Z',finishedAt:'2026-09-17T10:00:01.000Z',events:[{tool:'read',arguments:{url:'https://example.com'},status:'succeeded',result:JSON.stringify({structuredContent:{price:20,source:{url:'https://example.com'}}}),approval:{id:'approved',actor:'owner',at:'2026-09-17T10:00:00.500Z'}}]};
 run.contract=await issueHostedContract(binding,run,{id:'a',goal:definition.goal,setup:'private input',connectionId:'c'});return run;
}
test('shared evaluator checks exact recorded values, tool absence and approvals with stable digests',async()=>{
 const original=await run(); const result=await evaluateHostedRun(original);assert.equal(result.status,'pass');assert.equal(result.criteria.length,9);
 assert.deepEqual(await evaluateHostedRun(original),result);
 const changed=structuredClone(original);changed.events.push({...changed.events[0],tool:'write'});const failure=await evaluateHostedRun(changed);assert.equal(failure.criteria.find(c=>c.id==='no_write')?.status,'fail');assert.notEqual(failure.evidence_digest,result.evidence_digest);
 delete changed.events[0].approval;assert.equal((await evaluateHostedRun(changed)).criteria.find(c=>c.id==='approval')?.status,'fail');
});
test('missing, malformed, non-scalar and uncertain output cannot establish structured predicates',async()=>{
 for(const result of [JSON.stringify({structuredContent:{}}),'truncated',JSON.stringify({structuredContent:{price:{nested:20}}})]){
  const r=await run();r.events[0].result=result;const e=await evaluateHostedRun(r);assert.equal(e.criteria.find(c=>c.id==='price')?.status,'insufficient_evidence');assert.equal(e.criteria.find(c=>c.id==='source')?.status,'insufficient_evidence');
 }
 const r=await run();r.events[0].status='uncertain';assert.equal((await evaluateHostedRun(r)).criteria.find(c=>c.id==='read_done')?.status,'insufficient_evidence');
});
test('latest call drives structured checks and tampered run/profile/specification bindings fail closed',async()=>{
 const r=await run();r.events.push({...r.events[0],result:JSON.stringify({structuredContent:{price:10,source:{url:'x'}}})});assert.equal((await evaluateHostedRun(r)).criteria.find(c=>c.id==='price')?.status,'fail');
 for(const change of [(r:EvaluationRun)=>r.id='foreign',(r:EvaluationRun)=>r.agentId='foreign',(r:EvaluationRun)=>r.contract!.binding.specification.checks[2].path='fake',(r:EvaluationRun)=>r.contract!.binding.allowed_tools.push('evil'),(r:EvaluationRun)=>r.contract!.binding.profile.required_outcomes[0].assertion.value='failed',(r:EvaluationRun)=>r.contract!.intent.required_outcomes[0].assertion.value='failed',(r:EvaluationRun)=>r.contract!.binding.recipe!.version=2]){
  const altered=await run();change(altered);await assert.rejects(()=>evaluateHostedRun(altered));
 }
});
test('profiles are stable across instances, definitions change identity and legacy definitions remain unbound',async()=>{
 const a=(await bindRecipeEval(definition))!, b=(await bindRecipeEval(structuredClone(definition)))!;
 assert.equal(a.profile.profile_digest,b.profile.profile_digest);
 const changed=(await bindRecipeEval({...definition,evaluation:{version:1,checks:[{...checks[2],value:21}]}}))!;assert.notEqual(changed.profile.profile_digest,a.profile.profile_digest);
 assert.equal(await bindRecipeEval({...definition,evaluation:undefined}),undefined);
});

test('outcome rubrics are frozen, AI-labeled, evidence-bound and fail closed',async()=>{
 const {rubricAssessment,hasRubricEvidence}=await import('../src/recipe-evaluation.ts');
 const r=await run();r.summary='The reports support the comparison.';
 r.contract=await issueHostedContract((await bindRecipeEval({...definition,evaluation:{version:1,checks:[],rubrics:[{id:'grounded',label:'Grounded comparison',criterion:'Claims agree with the retrieved reports.'}]}}))!,r,{id:'a',goal:'Compare',setup:'Reports',connectionId:'c'});
 assert.equal((await evaluateHostedRun(r)).criteria.find(c=>c.id==='grounded')?.status,'insufficient_evidence');
 for(const status of ['pass','fail','insufficient_evidence']) {
  r.rubricAssessment=await rubricAssessment({criteria:[{id:'grounded',status,reason:'Evidence-based explanation.',calls:[0]}]},r);
  const criterion=(await evaluateHostedRun(r)).criteria.find(c=>c.id==='grounded')!;
  assert.equal(criterion.status,status);assert.equal(criterion.trust,'ai_assessed');assert.match(criterion.evidence,/call:0/);
 }
 for(const value of [{criteria:[]},{criteria:[{id:'grounded',status:'pass',reason:'Fine',calls:[]}]},{criteria:[{id:'grounded',status:'pass',reason:'Fine',calls:[99]}]}]) await assert.rejects(()=>rubricAssessment(value,r));
 r.rubricAssessment=await rubricAssessment({criteria:[{id:'grounded',status:'pass',reason:'Grounded.',calls:[0]}]},r);
 r.summary='Changed answer';assert.equal((await evaluateHostedRun(r)).criteria.find(c=>c.id==='grounded')?.status,'insufficient_evidence');
 for(const result of ['broken JSON','[Result omitted: retained run evidence exceeded the storage limit.]',JSON.stringify({isError:true}),JSON.stringify({content:[{text:'[truncated]'}]})]) {r.events[0].result=result;assert.equal(hasRubricEvidence(r),false);}
});

test('measurement specifications validate, freeze and require an observed result from the assessor',async()=>{
 const {validateRecipeEval,rubricAssessment}=await import('../src/recipe-evaluation.ts');
 const rubric={id:'grounded',label:'Supported claims',criterion:'100% supported; no source evidence is inconclusive.',measurement:{method:'Count supported claims / all answer claims; report counts and percent.',evidence:'Answer and retained source results.'}};
 for(const measurement of [{method:'Count'},{method:'',evidence:'Results'},{method:'Count',evidence:'Results',code:'execute()'}]) assert.throws(()=>validateRecipeEval({version:1,checks:[],rubrics:[{...rubric,measurement}]},['read']));
 const r=await run();r.summary='Price is 20.';
 r.contract=await issueHostedContract((await bindRecipeEval({...definition,evaluation:{version:1,checks:[],rubrics:[rubric]}}))!,r,{id:'a',goal:'Read',setup:'URL',connectionId:'c'});
 assert.equal(r.contract.inputs,'URL');
 const tampered=structuredClone(r);tampered.contract!.inputs='Different scope';await assert.rejects(()=>evaluateHostedRun(tampered));
 const criterion={id:'grounded',status:'pass',reason:'Price claim matches source.',calls:[0]};
 await assert.rejects(()=>rubricAssessment({criteria:[criterion]},r),/observed measurement/);
 r.rubricAssessment=await rubricAssessment({criteria:[{...criterion,observed:'1 / 1 supported claims (100%).'}]},r);
 const result=(await evaluateHostedRun(r)).criteria.find(c=>c.id==='grounded')!;
 assert.equal(result.status,'pass');assert.equal(result.observed,'1 / 1 supported claims (100%).');
 r.contract.binding.specification.rubrics![0].measurement!.method='Changed procedure';
 await assert.rejects(()=>evaluateHostedRun(r));
});
