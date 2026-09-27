import test from "node:test";
import assert from "node:assert/strict";
import {cases,factorNames,researchControl,semanticDecision,compose} from "../src/complex/corpus.mjs";
import {requestFor,normalize,ask} from "../src/complex/provider.mjs";
import {evaluate,summarize} from "../src/complex/evals.mjs";
import {configuration} from "../src/complex/run.mjs";

test("authored controls and factor labels agree with the explicit oracle for all 24 scenarios",()=>{
 assert.equal(cases.length,24);assert.equal(new Set(cases.map(c=>c.id)).size,24);
 for(const c of cases){assert.deepEqual(Object.keys(c.expected.factors),factorNames);assert.equal(researchControl(c.state).decision,c.expected.control,c.id);const semantic=semanticDecision({status:"ok",answers:c.expected.factors});assert.equal(semantic,c.expected.semantic,c.id);assert.equal(compose("allow",c.expected.control,semantic),c.expected.final,c.id);}
 for(const gateway of ["deny","challenge_required"])for(const advisory of ["allow","deny","challenge_required"])assert.equal(compose(gateway,"allow",advisory),gateway);
 assert.equal(compose("allow","deny","allow"),"deny");assert.equal(compose("allow","challenge_required","allow"),"challenge_required");
});
test("all providers receive identical state, six criteria, and no expected labels",()=>{for(const engine of ["jev","groq","llm"]){const c=cases[22],r=requestFor(engine,c.state);assert.deepEqual(engine==="jev"?r.state:JSON.parse(r.messages[1].content),c.state);assert(!JSON.stringify(r).includes(c.expected.rationale));assert(!Object.hasOwn(r,"expected"));}});
test("complex responses strictly validate all factors and strip extraneous account fields",async()=>{
 const body={model:"jev-1.13.0",answers:Object.fromEntries(factorNames.map(k=>[k,{type:"noul",noul:cases[0].expected.factors[k]}])),usage:{input_tokens:100,cost_usd:.0001,credits_remaining_usd:999}};
 const good=normalize("jev",body);assert(!JSON.stringify(good).includes("credits"));assert.equal(semanticDecision({status:"ok",...good}),"allow");body.answers.subject_scope.noul=2;assert.throws(()=>normalize("jev",body));
 const p=await ask("jev",{}, {key:"test-only",timeoutMs:10,fetchImpl:async()=>({ok:true,json:()=>new Promise(()=>{})})});assert.equal(p.status,"timeout");assert.equal(semanticDecision(p),"challenge_required");
});
test("evals expose unsafe model advice even when research hard controls protect final outcome",()=>{
 const c=cases.find(c=>c.id==="cross-customer");const row={case_id:c.id,repeat:0,expected:c.expected,provider:{status:"ok",answers:cases[0].expected.factors},advisory:"allow",final:"deny"};
 const e=evaluate([row]);assert.equal(e.semantic.unsafe_allows,1);assert.equal(e.combined.unsafe_allows,0);assert.equal(e.per_factor.subject_scope.brier,1);
 const s=summarize([{...row,latency_ms:10,provider:{status:"timeout"}},{dropped:true}],1000);assert.equal(s.successful_rps,0);assert.equal(s.dropped,1);assert.equal(s.unknown_cost_requests,1);assert.equal(s.evals.per_factor.subject_scope.scored,0);
});
test("live eval caps reject unsafe loads and confidence uncertainty escalates",()=>{
 assert.throws(()=>configuration(["--rates","100","--seconds","30"]));assert.throws(()=>configuration(["--quality-repeats","0"]));
 assert.equal(semanticDecision({status:"ok",answers:{...cases[0].expected.factors,purpose_fit:.5}}),"challenge_required");
 assert.equal(semanticDecision({status:"ok",answers:{...cases[0].expected.factors,needs_clarification:.2,subject_scope:0}}),"challenge_required");
});
