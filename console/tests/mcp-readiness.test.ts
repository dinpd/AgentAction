import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createReadinessProfile, readinessStale, READINESS_RULESET } from '../src/mcp-readiness.ts';
import { ReadinessStore, parseCheck } from '../src/readiness-store.ts';
import { enrichReadiness } from '../src/readiness-discovery.ts';
import type { PrecheckReport } from '../src/mcp-precheck.ts';
import type { CatalogResult } from '../src/mcp-registry.ts';

const endpoint = 'https://mcp.vendor.com/mcp';
const tool = {name:'send_message',description:'Send a message',inputSchema:{type:'object',properties:{text:{type:'string'}}},annotations:{readOnlyHint:true}};
const report = (): PrecheckReport => ({endpoint,checkedAt:new Date().toISOString(),protocol:'2026-07-28',requestedProtocol:'2026-07-28',authentication:'not-observed',visibility:'public-tools',toolCount:1,tools:[],providers:[],scopes:[],challengedScopes:[],evidence:[],findings:[]});
function database() {
  const db=new DatabaseSync(':memory:');
  const storage={sql:{exec(q:string,...args:(string|number)[]){const rows=db.prepare(q).all(...args);return {toArray:()=>rows};}},transactionSync<T>(fn:()=>T):T{db.exec('BEGIN');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}}};
  return {db,storage};
}

test('profiles separate guidance, requirements and untested behavior; declarations never verify writes',async()=>{
  const p=await createReadinessProfile(report(),[tool,{...tool,name:'bad',description:'',inputSchema:{type:'string'}}]);
  assert.equal(p.findings.find(f=>f.id==='input-object')?.basis,'requirement');
  assert.equal(p.findings.find(f=>f.id==='result-contract')?.status,'review');
  assert.equal(p.findings.find(f=>f.id==='consequential')?.basis,'heuristic');
  assert.equal(p.coverage.execution,'untested');assert.equal(p.coverage.permissions,'untested');
  assert.ok(p.findings.every(f=>f.evidence&&f.remediation&&f.source.startsWith('https://')));
  assert.ok(!p.findings.some(f=>(f.status as string)==='verified'));
});

test('fingerprint stable across catalog/key order, changes with schema, and vanishes on failure',async()=>{
  const a=await createReadinessProfile(report(),[tool,{...tool,name:'second'}]);
  const b=await createReadinessProfile(report(),[{...tool,name:'second'},{annotations:{readOnlyHint:true},inputSchema:{properties:{text:{type:'string'}},type:'object'},description:tool.description,name:tool.name}]);
  assert.equal(a.catalogFingerprint,b.catalogFingerprint);
  const c=await createReadinessProfile(report(),[{...tool,inputSchema:{type:'object',required:['text']}}]);assert.notEqual(c.catalogFingerprint,a.catalogFingerprint);
  const failed=await createReadinessProfile({...report(),visibility:'authentication-required'},[tool]);assert.equal(failed.catalogFingerprint,null);assert.equal(failed.tools.length,0);assert.equal(failed.coverage.discovery,'incomplete');
  assert.equal(readinessStale(a),false);assert.equal(readinessStale(a,Date.parse(a.expiresAt)),true);assert.equal(readinessStale({...a,ruleset:'older'}),true);assert.equal(readinessStale({...a,expiresAt:'invalid'}),true);
});

test('large catalogs bound persisted output and always disclose omitted tools/findings and untested behavior',async()=>{
  const tools=Array.from({length:80},(_,i)=>({...tool,name:'send_'+i,inputSchema:{type:'string',description:'x'.repeat(1100)}}));
  const p=await createReadinessProfile(report(),tools);
  assert.equal(p.toolCount,80);assert.ok(p.tools.length<=20);assert.ok(p.findings.length<=32);assert.ok(p.coverage.findingsOmitted>0);
  assert.ok(p.findings.some(f=>f.id==='behavior'));assert.ok(new TextEncoder().encode(JSON.stringify(p)).length<100000);
});

test('only explicit publication persists; exact endpoint lookup survives restart, and latest failed check supersedes success',async()=>{
  const {storage,db}=database();let now=Date.now(), failed=false;
  const inspect=async()=>{const r={...report(),checkedAt:new Date(now).toISOString(),...(failed?{visibility:'unavailable' as const}:{})};r.readiness=await createReadinessProfile(r,[tool]);return r;};
  let store=new ReadinessStore(storage,inspect,()=>now);
  const input={endpoint,protocol:'2026-07-28',publish:false};
  const hidden=await store.check(input);assert.equal(hidden.id,null);assert.equal(store.lookup([endpoint]).length,0);
  const published=await store.check({...input,publish:true});assert.ok(published.id);assert.equal(store.lookup([endpoint+'/other']).length,0);
  store=new ReadinessStore(storage,inspect,()=>now);assert.equal(store.get(published.id!)?.report.readiness?.toolCount,1);
  now+=1000;failed=true;await store.check({...input,publish:true});assert.equal(store.lookup([endpoint])[0].visibility,'unavailable');assert.equal(store.lookup([endpoint])[0].catalogFingerprint,null);
  now+=86400001;assert.equal(store.lookup([endpoint])[0].stale,true);db.close();
});

test('public quota persists, rejects extra credentials and rolls over by UTC day',async()=>{
  const {storage,db}=database();let now=Date.now(), calls=0;
  const inspect=async()=>{calls++;return report();};const input={endpoint,protocol:'2026-07-28',publish:false};
  const store=new ReadinessStore(storage,inspect,()=>now);
  for(let i=0;i<100;i++)await store.check(input);
  await assert.rejects(()=>new ReadinessStore(storage,inspect,()=>now).check(input),/daily limit/);assert.equal(calls,100);
  now+=86400000;await store.check(input);assert.equal(calls,101);
  for(const bad of [{...input,token:'secret'},{...input,publish:undefined},{...input,endpoint:'https://127.0.0.1/mcp'},{...input,endpoint:endpoint+'?key=secret'},{...input,protocol:'draft'}])assert.throws(()=>parseCheck(bad));
  db.close();
});

test('discovery reads exact public endpoints only; failure preserves results and never grants access',async()=>{
  const catalog={servers:[{name:'vendor',endpoints:[endpoint],inspectableEndpoints:[endpoint]}],notice:'Listings.'} as CatalogResult;
  let body='';const profile=await createReadinessProfile(report(),[tool]);
  const service={async fetch(req:Request){body=await req.text();assert.equal(req.headers.has('authorization'),false);return Response.json([{...profile,id:'a'.repeat(64),reviewCount:1,failureCount:0,toolNames:[tool.name]},{...profile,endpoint:endpoint+'/other',id:'b'.repeat(64)}]);}};
  const enriched=await enrichReadiness(catalog,service);assert.equal(body,JSON.stringify([endpoint]));assert.equal(enriched.servers[0].readiness?.length,1);assert.equal(enriched.servers[0].readiness?.[0].ruleset,READINESS_RULESET);
  assert.equal(enriched.servers[0].endpoints,catalog.servers[0].endpoints);
  const failure=await enrichReadiness(catalog,{async fetch(){throw new Error('offline');}});assert.deepEqual(failure.servers,catalog.servers);assert.match(failure.notice,/unavailable/);
});

test('publication retention and concurrency remain bounded',async()=>{
  const {storage,db}=database();let release!:()=>void;
  const blocked=new Promise<void>(resolve=>{release=resolve;});
  const inspect=async()=>{await blocked;const r=report();r.readiness=await createReadinessProfile(r,[tool]);return r;};
  const store=new ReadinessStore(storage,inspect);
  for(let i=0;i<1000;i++)storage.sql.exec('INSERT INTO readiness_reports VALUES (?, ?, ?, ?)',String(i).padStart(64,'0'),endpoint,1,JSON.stringify(report()));
  const input={endpoint,protocol:'2026-07-28',publish:true};
  const checks=[store.check(input),store.check(input),store.check(input)];
  await assert.rejects(()=>store.check(input),/busy/);release();const results=await Promise.all(checks);
  assert.equal(storage.sql.exec('SELECT count(*) as n FROM readiness_reports').toArray()[0].n,1000);
  assert.ok(store.get(results[0].id!));assert.equal(store.get('0'.repeat(64)),null);db.close();
});
