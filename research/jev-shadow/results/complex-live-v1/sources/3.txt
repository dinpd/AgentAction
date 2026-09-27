import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cases, questions, version, thresholds, researchControl, semanticDecision, compose } from "./corpus.mjs";
import { ask, requestFor } from "./provider.mjs";
import { summarize } from "./evals.mjs";
import { createGateway } from "../gateway.mjs";
import { loadStage } from "../metrics.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const hash=b=>createHash("sha256").update(b).digest("hex");
export function configuration(args){
  const options={out:resolve(root,"runs/complex"),fixture:false,qualityRepeats:3,loadRepeats:2,seconds:6,rates:[5,20],concurrency:32,timeoutMs:15000};
  for(let i=0;i<args.length;i++){const key=args[i];if(key==="--fixture"){options.fixture=true;continue;}const value=args[++i];if(!value)throw Error("missing argument");if(key==="--out")options.out=resolve(value);else if(key==="--seconds")options.seconds=Number(value);else if(key==="--load-repeats")options.loadRepeats=Number(value);else if(key==="--quality-repeats")options.qualityRepeats=Number(value);else if(key==="--rates")options.rates=value.split(",").map(Number);else throw Error("unknown argument");}
  if(!Number.isInteger(options.seconds)||options.seconds<1||options.seconds>30||!Number.isInteger(options.qualityRepeats)||options.qualityRepeats<1||options.qualityRepeats>5||!Number.isInteger(options.loadRepeats)||options.loadRepeats<0||options.loadRepeats>3||!options.rates.length||options.rates.some(r=>!Number.isInteger(r)||r<1||r>100))throw Error("invalid bounds");
  const count=3*(cases.length*options.qualityRepeats+options.loadRepeats*options.seconds*options.rates.reduce((a,b)=>a+b,0));if(count>2000)throw Error("2000 provider request cap");return options;
}
export function report(data){
  const f=n=>n==null?"n/a":n.toFixed(2);
  return `# Complex approval evaluation\n\n${data.fixture?"SCRIPTED FIXTURE — no model performance evidence":"Live provider APIs on synthetic authorization scenarios"}. ${data.created_at}. Complete: ${data.complete}. Corpus: ${data.version}.\n\n24 authored cases, six factor questions per request, ${data.options.qualityRepeats} quality repetitions; load ${data.options.rates.join(", ")} offered requests/sec for ${data.options.seconds}s each, ${data.options.loadRepeats} repetitions, concurrency ${data.options.concurrency} per lane. Throughput includes drain. All providers run concurrently; shared local resources may constrain arrivals. No retries, no output cache, no real tools execute.\n\n| Provider / phase / repeat / offered RPS | Successful RPS | Successful p50 / p95 ms | Errors / drops | Combined exact | Unsafe allows | Unnecessary reviews | Cost / 1k successful |\n|---|---:|---|---|---|---:|---:|---:|\n${data.stages.map(s=>{const x=s.summary;return `| ${s.engine} / ${s.phase} / ${s.repeat} / ${s.rate} | ${f(x.successful_rps)} | ${f(x.successful_latency_ms.p50)} / ${f(x.successful_latency_ms.p95)} | ${Object.values(x.errors).reduce((a,b)=>a+b,0)} / ${x.dropped} | ${x.evals.combined.exact}/${x.evals.combined.count} | ${x.evals.combined.unsafe_allows} | ${x.evals.combined.unnecessary_reviews} | ${f(x.cost_per_1000_successful)} |`}).join("\n")}\n\n## Evals and interpretation\n\nsummary.json includes separate model-advice and combined-policy confusion matrices, macro-F1, per-factor accuracy and Brier diagnostics, unnecessary reviews, case consistency, paired-scenario correctness and failure IDs. Brier scores on 24 authored cases are descriptive, not calibration evidence. Repeats are not independent cases. No thresholds are tuned to these results. The oracle is authored policy logic, not an independent human-reviewed dataset. Treat these as development evals, not a held-out production test.\n\nThe real local gateway checks the declared research agent/tool and writes evidence. Refund amounts, approval validity, tenant binding and duplicate prevention are separate **research controls**, not implemented production capabilities. context.verified is synthetic input, not cryptographic verification. Counterfactual composition keeps gateway/research deny or challenge authoritative. Actual gateway authorization is unchanged.\n\nProviders: Jev jev-1.13.0 through independent jevtypesafeai.com; OpenAI requests gpt-4.1-mini and validates gpt-4.1-mini-2025-04-14; Groq openai/gpt-oss-20b replaces inaccessible Llama 8B. Jev uses Noul; LLMs return strict JSON numeric estimates. OpenAI cap 256 output tokens; Groq cap 1536 including low-effort reasoning, whose tokens/cost/latency remain included. Provider wrapper differences and tokenization are unavoidable and disclosed. Models do not receive labels/rationales.\n\nCosts: Jev service-reported; OpenAI estimated input/cached/output $0.40/$0.10/$1.60 per million tokens; Groq $0.075/$0.037/$0.30. Missing cost remains unknown. No reseller-to-direct extrapolation.\n\nRaw rows, source snapshots, frozen corpus, question hash, request byte lengths, gateway journal and model usage accompany this report. The local adapter includes actual Worker/DO handlers and fsync but is not Cloudflare hosting or maximum provider capacity. Video remains paused for user dashboard review.\n`;
}
export async function run(options){
  const keys={jev:process.env.TYPESAFE_API_KEY,groq:process.env.GROQ_API_KEY,llm:process.env.OPENAI_API_KEY};
  if(!options.fixture&&Object.values(keys).some(k=>!k))throw Error("all provider keys required");
  mkdirSync(options.out,{recursive:true});
  const file=name=>resolve(options.out,name);
  writeFileSync(file("raw.jsonl"),"",{flag:"wx"});writeFileSync(file("gateway-journal.jsonl"),"",{flag:"wx"});mkdirSync(file("sources"));
  const paths=["src/complex/corpus.mjs","src/complex/provider.mjs","src/complex/evals.mjs","src/complex/run.mjs","src/gateway.mjs","src/metrics.mjs","src/llm.mjs","src/provider.mjs","src/cases.mjs","../../cloudflare/src/worker.ts","../../cloudflare/src/decision-basis.ts","../../cloudflare/src/intent-observation.ts","../../packages/guard/src/intent.ts"];
  const sources=paths.map((path,index)=>{const bytes=readFileSync(resolve(root,path));const snapshot=`sources/${index}.txt`;writeFileSync(file(snapshot),bytes);return {path,snapshot,sha256:hash(bytes)}});
  const data={version,created_at:new Date().toISOString(),complete:false,fixture:options.fixture,options,engines:["groq","llm","jev"],revision:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),runtime:process.version,thresholds,corpus_sha256:hash(JSON.stringify(cases)),questions_sha256:hash(JSON.stringify(questions)),sources,stages:[]};
  writeFileSync(file("corpus.json"),JSON.stringify({version,cases,questions,thresholds},null,2));writeFileSync(file("manifest.json"),JSON.stringify(data,null,2));
  const save=()=>{writeFileSync(file("summary.json"),JSON.stringify(data,null,2));writeFileSync(file("REPORT.md"),report(data))};save();
  const gateways=Object.fromEntries(data.engines.map(e=>[e,createGateway(file("gateway-journal.jsonl"))]));let sequence=0;
  const plans=[{phase:"quality",repeat:0,rate:3,count:cases.length*options.qualityRepeats},...Array.from({length:options.loadRepeats},(_,repeat)=>options.rates.map(rate=>({phase:"load",repeat,rate,count:rate*options.seconds}))).flat()];
  for(const stage of plans){
    const results=await Promise.all(data.engines.map(async engine=>{
      const id=`${engine}-${stage.phase}-${stage.repeat}-${stage.rate}`;
      const result=await loadStage({count:stage.count,rate:stage.rate,concurrency:options.concurrency,operation:async index=>{
        const c=cases[index%cases.length],rowId=`complex-${engine}-${++sequence}`,started=performance.now();
        const gateway=await gateways[engine]({agent_id:"synthetic-support",tool:"crm.read",action:"read"},rowId);
        const control=researchControl(c.state);
        const provider=options.fixture?{status:"ok",answers:c.expected.factors,latency_ms:0,cost_usd:0,model:"scripted-fixture-NOT-MODEL",usage:{input_tokens:0,output_tokens:0}}:await ask(engine,c.state,{key:keys[engine],timeoutMs:options.timeoutMs});
        const advisory=semanticDecision(provider),final=compose(gateway.decision,control.decision,advisory);
        const row={id:rowId,stage:id,engine,phase:stage.phase,repeat:stage.phase==="quality"?Math.floor(index/cases.length):stage.repeat,case_id:c.id,family:c.family,expected:c.expected,gateway_decision:gateway.decision,actual_decision:gateway.decision,basis_id:gateway.basis.basis_id,control,provider,advisory,final,request_bytes:Buffer.byteLength(JSON.stringify(requestFor(engine,c.state)))};
        appendFileSync(file("gateway-journal.jsonl"),JSON.stringify({operation:"complex_advice",id:rowId,basis_id:row.basis_id,control,advisory,final,actual_decision:row.actual_decision})+"\n",{flush:true});
        row.latency_ms=performance.now()-started;return row;
      }});
      const rows=result.rows.map(r=>({...r,stage:id,engine,phase:stage.phase}));for(const r of rows)appendFileSync(file("raw.jsonl"),JSON.stringify(r)+"\n");
      const summary=summarize(rows,result.elapsed_ms);data.stages.push({id,engine,...stage,summary});save();console.log(JSON.stringify({stage:id,rps:summary.successful_rps,p95:summary.successful_latency_ms.p95,errors:summary.errors,drops:summary.dropped,quality:summary.evals.combined.exact+"/"+summary.evals.combined.count}));return rows;
    }));
    if(!options.fixture&&results.some(rows=>rows.some(r=>["http_401","http_403","http_404","http_429"].includes(r.provider?.status))||!rows.some(r=>r.provider?.status==="ok")))throw Error("Stopped after authentication, quota or completely failed lane; partial evidence retained.");
  }
  data.complete=true;save();return data;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{await run(configuration(process.argv.slice(2)))}catch(e){console.error(e.message);process.exitCode=1}}
