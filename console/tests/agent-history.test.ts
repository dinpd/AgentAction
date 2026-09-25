import assert from 'node:assert/strict';
import test from 'node:test';
import { executionRecords } from '../src/agent-history.ts';
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
