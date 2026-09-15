import assert from 'node:assert/strict';
import test from 'node:test';
import {journeyProgress} from '../src/journey.ts';
const setup = {sources:[], ingestion:{observed:false}};
const state = {connections:[],agents:[],runs:[]};
test('journey distinguishes onboarding, connected account, draft and successful trial',()=>{
 const onboarding=journeyProgress('',null,null);
 assert.equal(onboarding.href,'/#setup');assert.equal(onboarding.next,-1);assert.equal(onboarding.action,'Set up your workspace');
 assert.equal(journeyProgress('a',setup,state).next,0);
 const connected={...state,connections:[{status:'connected'}]};
 assert.equal(journeyProgress('a',setup,connected).next,1);
 const draft={...connected,agents:[{status:'draft'}]};
 assert.equal(journeyProgress('a',setup,draft).next,2);
 assert.equal(journeyProgress('a',setup,{...draft,runs:[{status:'completed',outcome:'uncertain'}]}).next,2);
 const success=journeyProgress('a',setup,{...draft,runs:[{status:'completed',outcome:'met'}]});
 assert.equal(success.next,4);assert.match(success.detail,/not independent verification/);
});
test('pending approval and interrupted runs take priority over onboarding',()=>{
 const pending=journeyProgress('a',setup,{...state,runs:[{status:'awaiting_approval'}]});
 assert.equal(pending.attention,true);assert.equal(pending.href,'/agents#run');
 assert.equal(journeyProgress('a',setup,{...state,runs:[{status:'interrupted'}]}).attention,true);
});
test('external activity does not assert a successful run and disabled sources do not count',()=>{
 const external=journeyProgress('a',{sources:[{enabled:true,agent_ids:['external']}],ingestion:{observed:true}},state);
 assert.equal(external.next,4);assert.equal(external.states[2],'External activity received');
 assert.equal(journeyProgress('a',{sources:[{enabled:false}]},state).next,0);
 assert.equal(journeyProgress('a',setup,{...state,connections:[{status:'disconnected'}]}).next,0);
});
test('unavailable data never asserts completion',()=>{
 for(const [a,b] of [[null,state],[setup,null],[null,null]]) {
  const result=journeyProgress('a',a,b);assert.equal(result.href,'/#setup');assert.ok(result.states.every(s=>s==='Status unavailable'));
 }
});
