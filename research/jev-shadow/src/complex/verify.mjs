import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {summarize} from "./evals.mjs";
import {researchControl,semanticDecision,compose} from "./corpus.mjs";
import {report} from "./run.mjs";
import {validateDecisionBasis} from "../../../../cloudflare/src/decision-basis.ts";
export function verify(dir){
 const read=f=>readFileSync(resolve(dir,f),"utf8"),data=JSON.parse(read("summary.json")),manifest=JSON.parse(read("manifest.json")),corpus=JSON.parse(read("corpus.json"));
 const hash=s=>createHash("sha256").update(s).digest("hex");
 assert(data.complete,"partial run");assert.equal(data.corpus_sha256,hash(JSON.stringify(corpus.cases)));assert.equal(data.questions_sha256,hash(JSON.stringify(corpus.questions)));assert.deepEqual(data.sources,manifest.sources);
 for(const source of data.sources)assert.equal(hash(read(source.snapshot)),source.sha256,source.path);
 const rows=read("raw.jsonl").trim().split("\n").filter(Boolean).map(JSON.parse),journal=read("gateway-journal.jsonl").trim().split("\n").filter(Boolean).map(JSON.parse),completed=rows.filter(r=>!r.dropped);
 assert.equal(new Set(completed.map(r=>r.id)).size,completed.length);
 assert.equal(rows.length,data.stages.reduce((n,s)=>n+s.summary.offered,0));
 for(const s of data.stages){const rs=rows.filter(r=>r.stage===s.id);assert.equal(new Set(rs.map(r=>r.index)).size,rs.length);assert.deepEqual(s.summary,summarize(rs,s.summary.elapsed_ms));if(s.phase==="quality"){assert.equal(rs.length,corpus.cases.length*data.options.qualityRepeats);assert.equal(new Set(rs.filter(r=>!r.dropped).map(r=>r.case_id)).size,corpus.cases.length);}}
 for(const r of completed){const c=corpus.cases.find(c=>c.id===r.case_id);assert(c);assert.deepEqual(r.expected,c.expected);assert.deepEqual(r.control,researchControl(c.state));assert.equal(r.advisory,semanticDecision(r.provider));assert.equal(r.actual_decision,r.gateway_decision);assert.equal(r.final,compose(r.gateway_decision,r.control.decision,r.advisory));
 const basis=journal.find(j=>j.operation==="research_basis"&&j.id===r.id);assert(basis);assert.equal(basis.basis.basis_id,r.basis_id);assert.deepEqual(validateDecisionBasis(basis.basis),[]);assert.equal(basis.basis.conclusion.code,r.actual_decision);
 assert(journal.some(j=>j.operation==="put"&&Object.values(j.entries).some(v=>v?.payload?.event?.decision_id===r.id)));
 const advice=journal.find(j=>j.operation==="complex_advice"&&j.id===r.id);assert(advice);assert.equal(advice.final,r.final);assert.equal(advice.actual_decision,r.actual_decision);
 }
 assert.equal(read("REPORT.md"),report(data));return {rows:rows.length,completed:completed.length,stages:data.stages.length,unique_cases:corpus.cases.length,live:!data.fixture};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(verify(process.argv[2])));
