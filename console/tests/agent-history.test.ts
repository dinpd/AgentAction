import assert from 'node:assert/strict';
import test from 'node:test';
import { executionRecords, runResult } from '../src/agent-history.ts';
import { bindRecipeEval, issueHostedContract, evaluateHostedRun, type EvaluationRun } from '../src/recipe-evaluation.ts';
const start = Date.parse('2026-09-17T10:00:00Z');
test('hosted jobs retain original identities with source namespaces, chronology and measured duration', () => {
 const recurring = { jobs:[{id:'a',title:'Site'}], runs:[{id:'same',jobId:'a',status:'completed',kind:'scheduled',startedAt:start,finishedAt:start+1234,summary:'HTTP 200',findings:1,evidenceDigest:'abc',observations:[{key:'availability',state:'present'}]}] };
 const supervised = { agents:[{id:'a',title:'Research'}], runs:[{id:'same',agentId:'a',status:'completed',kind:'trial',startedAt:new Date(start+5000).toISOString(),finishedAt:new Date(start+5000).toISOString(),outcome:'not_met',reason:'Missing evidence',events:[{arguments:{secret:'never copy'},result:'private'}]}] };
 const rows = executionRecords(supervised,recurring);
 assert.deepEqual(rows.map(r=>r.id),['supervised:same','recurring:same']);
 assert.deepEqual(rows.map(r=>r.durationMs),[0,1234]);
 assert.equal(rows[0].evidence,'Recorded tool execution'); assert.equal(rows[0].toolCalls,1);
 assert.equal(rows[1].evidence,'Recorded check'); assert.equal(rows[1].evidenceDigest,'abc');
 assert.ok(rows.every(r=>r.attention)); assert.equal(rows[1].outcome,undefined);
 assert.doesNotMatch(JSON.stringify(rows),/never copy|private|signature/);
 assert.deepEqual(executionRecords(supervised,recurring),rows,'Projection does not create new execution identities');
});
test('nonterminal and incomplete executions retain unknown duration and explicit status', () => {
 const states=['awaiting_approval','failed','partial','interrupted','executing','cancelled'];
 const source={agents:[],runs:states.map((status,i)=>({id:String(i),agentId:'deleted',startedAt:start,status,kind:'trial',finishedAt:i===0?start-1:undefined}))};
 const rows=executionRecords(source,null);
 assert.equal(rows.length,states.length);assert.ok(rows.every(r=>r.durationMs===undefined));
 assert.equal(rows.find(r=>r.status==='awaiting_approval')?.attention,true);
 assert.equal(rows.find(r=>r.status==='executing')?.attention,false);
 assert.equal(rows[0].agent,'Unknown agent');assert.deepEqual(executionRecords(null,null),[]);
});

test('only live exact proposals are actionable; cancelled evaluation failures stay historical', () => {
 const source = {agents:[],runs:[
  {id:'pending',status:'awaiting_approval',pending:{id:'p',tool:'search'}},
  {id:'incomplete',status:'awaiting_approval'},
  {id:'cancelled',status:'cancelled',pending:{id:'old',tool:'search'},outcome:'not_met',evaluation:{status:'fail'}},
  {id:'insufficient',status:'completed',evaluation:{status:'insufficient_evidence'}},
 ].map(r=>({...r,agentId:'a',startedAt:start,kind:'trial'}))};
 const rows=executionRecords(source,null);
 assert.deepEqual(rows.filter(r=>r.approvalPending).map(r=>r.runId),['pending']);
 assert.equal(rows.find(r=>r.runId==='cancelled')?.attention,false);
 assert.equal(rows.find(r=>r.runId==='insufficient')?.attention,true);
});

// Run results are built from evaluations the hosted evaluator really produces, so a change to its
// built-in checks or wording fails here instead of leaking evaluator phrasing back into the console.
const definition = {title:'Scanner',goal:'Find relevant posts',inputGuide:'Topic',instructions:'Search once',boundaries:'Read only',success:'Relevant findings',tools:['search','write'],evaluation:{version:1 as const,
 checks:[{id:'searched',label:'Search succeeded',kind:'tool_succeeded' as const,tool:'search'},{id:'no_write',label:'Nothing was posted',kind:'tool_not_called' as const,tool:'write'},{id:'found',label:'At least 3 posts found',kind:'result_field' as const,tool:'search',path:'total',operator:'gte' as const,value:3}],
 rubrics:[{id:'relevant',label:'Relevant findings',criterion:'Every reported post matches the topic.'}]}};
async function evaluated(change:(run:EvaluationRun)=>void=()=>{},rubrics=definition.evaluation.rubrics) {
 const binding=(await bindRecipeEval({...definition,evaluation:{...definition.evaluation,rubrics}}))!;
 const run:EvaluationRun&{outcome?:string;reason?:string}={id:'r',agentId:'a',status:'completed',startedAt:'2026-11-24T10:00:00.000Z',finishedAt:'2026-11-24T10:00:05.000Z',summary:'Three posts found.',
  events:[{tool:'search',arguments:{q:'topic'},status:'succeeded',result:JSON.stringify({structuredContent:{total:3}}),approval:{id:'p',actor:'owner',at:'2026-11-24T10:00:01.000Z'}}]};
 run.contract=await issueHostedContract(binding,run,{id:'a',goal:definition.goal,setup:'topic',connectionId:'c'});
 change(run);run.evaluation=await evaluateHostedRun(run);return run;
}
const internal=/selected evidence|satisfied|predicate|The required evidence is missing/;
test('a completed run whose check could not be measured reads as finished but undetermined, with a next step', async () => {
 const run=await evaluated(),before=structuredClone(run),result=runResult(run);
 assert.equal(run.evaluation!.status,'insufficient_evidence');assert.deepEqual(run,before,'Reading a run never alters its record');
 assert.equal(result.execution,'Run finished');assert.equal(result.verdict,'undetermined');assert.equal(result.label,'Outcome could not be determined');
 assert.equal(result.statement,'The run finished, but 1 of 9 checks could not be measured.');
 assert.match(result.reason,/^Relevant findings: .*AI assessment.*run another trial\.$/);
 assert.equal(result.activity,'1 recorded tool call: search. It succeeded.');
 assert.deepEqual(result.checks.map(c=>[c.id,c.status,c.trust]),run.evaluation!.criteria.map(c=>[c.id,c.status==='insufficient_evidence'?'not_measured':c.status,c.trust]),'Every recorded check keeps its status and provenance');
 assert.equal(result.checks.find(c=>c.id==='budget')?.reason,'1 of 4 allowed calls used.');assert.equal(result.checks.find(c=>c.id==='found')?.reason,'search reported 3.');
 assert.ok(result.checks.every(c=>!internal.test(c.reason)));
});
test('failed checks give the reason in operator terms and decide the outcome', async () => {
 const run=await evaluated(r=>{r.events[0].result=JSON.stringify({structuredContent:{total:1}});r.events.push({...r.events[0],tool:'write'});delete r.events[1].approval;});
 const result=runResult({...run,outcome:'met',reason:'Found posts.'});
 assert.equal(result.verdict,'not_met');assert.equal(result.statement,'The run finished, but 3 of 10 checks failed.');
 assert.equal(result.reason,'At least 3 posts found: Expected at least 3; search reported 1.');
 assert.deepEqual(Object.fromEntries(result.checks.filter(c=>c.status==='fail').map(c=>[c.id,c.reason])),{found:'Expected at least 3; search reported 1.',approval:'At least one tool call has no recorded approval.',no_write:'write was called.'});
 assert.equal(result.activity,'2 recorded tool calls: search, write. All succeeded.');assert.ok(result.checks.every(c=>!internal.test(c.reason)));
 const interrupted=runResult({...await evaluated(r=>{r.status='interrupted';r.events[0].status='uncertain';}),outcome:'uncertain'});
 assert.equal(interrupted.verdict,'not_met');assert.equal(interrupted.statement,'The run was interrupted and 2 of 10 checks failed.');assert.equal(interrupted.reason,'Run completed successfully: The run was interrupted.');
 assert.match(interrupted.checks.find(c=>c.id==='searched')!.reason,/interrupted, so its result is unknown\. Confirm with the provider/);
 assert.match(interrupted.checks.find(c=>c.id==='found')!.reason,/did not return a usable “total” value/);
 assert.equal(interrupted.checks.at(-1)!.reason,'The run was interrupted before the agent assessed its result.');assert.ok(interrupted.checks.every(c=>!internal.test(c.reason)));
});
test('a pass needs every measured check and the assessment; pending, unbound and legacy records never imply one', async () => {
 const passing=await evaluated(()=>{},[]);
 const met=runResult({...passing,outcome:'met',reason:'Three matching posts.'});
 assert.equal(met.verdict,'met');assert.equal(met.statement,'The run finished and all 9 checks passed.');assert.equal(met.reason,'Three matching posts.');
 assert.equal(runResult({...passing,outcome:'not_met',reason:'Posts were off topic.'}).reason,'Goal met, in the agent’s own assessment: Posts were off topic.');
 assert.equal(runResult({...passing,outcome:'uncertain'}).verdict,'undetermined');
 const pending=runResult({status:'awaiting_approval',events:[],contract:passing.contract});
 const rubricRun=await evaluated();
 assert.deepEqual(runResult({status:'planning',contract:rubricRun.contract}).checks.map(c=>[c.id,c.trust]),rubricRun.evaluation!.criteria.map(c=>[c.id,c.trust]),'Pending checks carry the provenance the evaluator will record');
 assert.equal(pending.verdict,'pending');assert.equal(pending.label,'Not judged yet');assert.ok(pending.checks.length===8&&pending.checks.every(c=>c.status==='pending'));assert.equal(pending.activity,'No tool has been called yet.');
 assert.equal(runResult({status:'completed',events:[],contract:passing.contract}).verdict,'undetermined','A finished run without a recorded evaluation is not a pass');
 assert.equal(runResult({status:'completed',toolCalls:2}).verdict,'not_evaluated');assert.equal(runResult({status:'completed',toolCalls:2}).activity,'2 recorded tool calls.');
 assert.equal(runResult({status:'cancelled',evaluation:{status:'fail'}}).statement,'The run was cancelled and its checks failed.');
 assert.equal(runResult({status:'completed',evaluation:{status:'insufficient_evidence'}}).verdict,'undetermined');
 const research=runResult({status:'completed',outcome:'not_met',events:[],research:{checks:[{label:'Both platforms retrieved',status:'fail',observed:'1 of 2'}]}});
 assert.equal(research.reason,'Research checks passed and the report was accepted for delivery: Both platforms retrieved: 1 of 2');assert.equal(research.checks[0].trust,'runtime_recorded');
});
