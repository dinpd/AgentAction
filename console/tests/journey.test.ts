import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {journeyProgress, JOURNEY_NAV, JOURNEY_STAGES, stageEyebrow} from '../src/journey.ts';
// The gateway's real setup document. cloudflare/tests/worker.test.ts checks the handler against the same file.
const tenantSetup = JSON.parse(readFileSync(new URL('../fixtures/tenant-setup.v1.json', import.meta.url), 'utf8'));
const setup = {...tenantSetup, tenant_id:'a'};
const state = {connections:[],agents:[],runs:[]};
test('journey distinguishes onboarding, connected account, draft and successful trial',()=>{
 const onboarding=journeyProgress('',null,null);
 assert.equal(onboarding.href,'/#setup');assert.equal(onboarding.next,-1);assert.equal(onboarding.action,'Set up your workspace');
 assert.equal(journeyProgress('a',setup,state).next,0);
 const connected={...state,connections:[{status:'connected'}]};
 assert.equal(journeyProgress('a',setup,connected).next,0);
 const draft={...connected,agents:[{status:'draft'}]};
 assert.equal(journeyProgress('a',setup,draft).next,1);
 assert.equal(journeyProgress('a',setup,{...draft,runs:[{status:'completed',outcome:'uncertain'}]}).next,1);
 const success=journeyProgress('a',setup,{...draft,runs:[{status:'completed',outcome:'met'}]});
 assert.equal(success.next,3);assert.match(success.detail,/not independent verification/);
});
test('pending approval and interrupted runs take priority over onboarding',()=>{
 const pending=journeyProgress('a',setup,{...state,runs:[{status:'awaiting_approval',pending:{id:'p',tool:'search'}}]});
 assert.equal(pending.attention,true);assert.equal(pending.href,'/agents#approvals');
 assert.equal(journeyProgress('a',setup,{...state,runs:[{status:'interrupted'}]}).attention,true);
});
test('external activity does not assert a successful run and disabled sources do not count',()=>{
 const external=journeyProgress('a',{...setup,sources:[{enabled:true,agent_ids:['external']}],ingestion:{observed:true}},state);
 assert.equal(external.next,3);assert.equal(external.states[1],'External activity received');
 assert.equal(journeyProgress('a',{...setup,sources:[{enabled:false}]},state).next,0);
 assert.equal(journeyProgress('a',setup,{...state,connections:[{status:'disconnected'}]}).next,0);
});
test('unavailable data never asserts completion',()=>{
 const malformed = [
  [null,state],[setup,null],[null,null],
  [{...setup,tenant_id:'other'},state], // a document for a different workspace
  [{...setup,sources:null},state],[{...setup,sources:['x']},state],
  [setup,{...state,runs:null}],[setup,{...state,agents:[null]}],[setup,{...state,connections:{}}],
 ];
 for(const [a,b] of malformed) {
  const result=journeyProgress('a',a,b);assert.equal(result.href,'/#setup');assert.ok(result.states.every(s=>s==='Status unavailable'));
 }
 for (const recurring of [{jobs:null,runs:[]},{jobs:[],runs:['x']}]) assert.equal(journeyProgress('a',setup,state,recurring).next,-1);
});
test('the gateway setup document is accepted as loaded progress',()=>{
 // Regression for #431: the page required setup.tenant.tenant_id, which the gateway never sends.
 const result=journeyProgress('acme',tenantSetup,{...state,connections:[{status:'connected'}],agents:[{status:'active'}],runs:[{status:'completed',outcome:'met'}]});
 assert.notEqual(result.title,'Check your workspace connection');
 assert.deepEqual(result.states.slice(0,3),['1 agent','Successful run recorded','Run history available']);
});
test('recurring-only workspaces show agents and activity without requiring MCP', () => {
 const checks = {jobs:[{status:'active',health:'checks complete'}],runs:[{status:'completed'}]};
 const result = journeyProgress('a', setup, state, checks);
 assert.equal(result.next,2); assert.equal(result.href,'/#activity'); assert.equal(result.states[0],'1 agent');
 assert.equal(result.states[1],'Monitoring checks recorded'); assert.equal(result.states[2],'Run history available');
 assert.equal(journeyProgress('a',setup,state,{jobs:[{status:'draft'}],runs:[]}).next,1);
 for (const job of [{status:'active',stale:true},{status:'active',health:'unknown'},{status:'active',health:'findings'}]) {
  assert.equal(journeyProgress('a',setup,state,{jobs:[job],runs:[]}).attention,true);
 }
 assert.equal(journeyProgress('a',setup,state,null).next,-1);
});
test('stage numbers have one source across navigation and page headings',()=>{
 // Regression for #432: the nav, the / headings and the /agents headings each hard-coded their own numbers.
 const numbered=[...JOURNEY_NAV.matchAll(/<span>(\d\d)<\/span><strong>([^<]+)<\/strong>/g)].map(m=>`${m[1]} / ${m[2]}`);
 assert.deepEqual(numbered,JOURNEY_STAGES.map(stageEyebrow));
 assert.deepEqual(numbered,['01 / Create','02 / Run','03 / Monitor','04 / Improve']);
 // Page sources may only spell out a stage label that matches the shared list.
 for(const file of ['worker.ts','agent-builder.ts','recurring-ui.ts','policy-lab-ui.ts']){
  const source=readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
  for(const [label] of source.matchAll(/\b0\d \/ [A-Z][a-z]+(?: [a-z]+)*/g)) assert.ok(numbered.includes(label),`${file} shows "${label}", which is not a navigation stage`);
 }
});
