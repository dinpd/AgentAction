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
