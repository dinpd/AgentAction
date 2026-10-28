import test from 'node:test';
import assert from 'node:assert/strict';
import { handleJsonRpc } from '../src/proxy.js';
import { observationReport, observationText, observationHtml } from '../src/observation-report.js';
import type { AdapterConfig, ObservationDecisionLog } from '../src/types.js';

const config: AdapterConfig={mode:'observe',agent:{id:'demo'},agentid:{base_url:'https://unused.example'},downstream:{url:'https://provider.example'},tools:{}};
const request={jsonrpc:'2.0' as const,id:'request-sensitive',method:'tools/call',params:{name:'refund',arguments:{secret:'DO-NOT-EXPORT'}}};

test('observation distinguishes tool, protocol, malformed and transport responses without changing forwarding', async()=>{
  for(const [body,expected] of [
    [{jsonrpc:'2.0',id:request.id,result:{content:[]}},'result_returned'],
    [{jsonrpc:'2.0',id:request.id,result:{isError:true,content:[{type:'text',text:'DO-NOT-EXPORT'}]}},'tool_error'],
    [{jsonrpc:'2.0',id:request.id,error:{code:-1,message:'DO-NOT-EXPORT'}},'json_rpc_error'],
    [{jsonrpc:'2.0',id:request.id,result:{}},'invalid_response'],
    [{jsonrpc:'2.0',id:'wrong',result:{content:[]}},'invalid_response'],
    [null,'invalid_response'],
  ] as const) {
    const logs:ObservationDecisionLog[]=[];
    const response=await handleJsonRpc(request,config,{logger:e=>logs.push(e as ObservationDecisionLog)},async(_url,init)=>{
      assert.deepEqual(JSON.parse(String(init?.body)),request);return Response.json(body);
    });
    assert.deepEqual(response,body);assert.equal(logs[0].result_class,expected);
    assert.equal(logs[0].downstream_outcome,expected==='result_returned'?'success':'error');
    assert.equal(logs[0].business_outcome,'unverified');assert.ok(logs[0].duration_ms!>=0);assert.match(logs[0].observation_id!,/^[a-f0-9-]{36}$/);
    assert.ok(!JSON.stringify(logs).includes('DO-NOT-EXPORT'));assert.ok(!JSON.stringify(logs).includes('request-sensitive'));
  }
  for(const [error,expected] of [[new Error('DO-NOT-EXPORT'),'transport_unknown'],[new SyntaxError('DO-NOT-EXPORT'),'invalid_response']] as const) {
    const logs:ObservationDecisionLog[]=[];
    await assert.rejects(()=>handleJsonRpc(request,config,{logger:e=>logs.push(e as ObservationDecisionLog)},async()=>{throw error;}));
    assert.equal(logs[0].result_class,expected);assert.ok(!JSON.stringify(logs).includes('DO-NOT-EXPORT'));
  }
  for(const body of [{jsonrpc:'2.0',id:request.id,result:{content:[]}},'DO-NOT-EXPORT']) {
    const logs:ObservationDecisionLog[]=[];
    await handleJsonRpc(request,config,{logger:e=>logs.push(e as ObservationDecisionLog)},async()=>Response.json(body,{status:500}));
    assert.equal(logs[0].result_class,'http_error');assert.equal(logs[0].downstream_http_status,500);assert.equal(logs[0].downstream_outcome,'error');
  }
});

const event=(overrides:Record<string,unknown>={})=>({event:'agentaction.mcp.observation',mode:'observe',tool:'refund',evaluation_status:'evaluated',counterfactual_decision:'allow',findings:[],result_class:'result_returned',duration_ms:12,...overrides});
test('report prioritizes findings and distinguishes missing coverage, uncertainty and legacy evidence',()=>{
  const report=observationReport([
    event(),event({counterfactual_decision:'deny',findings:['idempotencyKey was already used','externalDomain is not allowed: DO-NOT-EXPORT'],result_class:'tool_error'}),
    event({evaluation_status:'skipped',findings:['No mapping: DO-NOT-EXPORT'],result_class:'transport_unknown'}),
    event({evaluation_status:'error',result_class:'invalid_response'}),event({result_class:undefined,arguments:{secret:'DO-NOT-EXPORT'},resource:'DO-NOT-EXPORT'}),
    {event:'other',secret:'DO-NOT-EXPORT'},
  ]);
  assert.equal(report.observedCalls,5);assert.equal(report.evaluations.skipped,1);assert.equal(report.evaluations.error,1);
  assert.equal(report.results.transport_unknown,1);assert.equal(report.results.unclassified,1);
  assert.equal(report.policy.deny,1);assert.equal(report.businessOutcome,'unverified');
  for(const text of [JSON.stringify(report),observationText(report),observationHtml(report)]) assert.ok(!text.includes('DO-NOT-EXPORT'));
  assert.match(observationText(report),/What needs attention/);assert.match(observationText(report),/provider state/i);
  assert.match(observationHtml(report),/viewport/);
});
test('bounded reports disclose omitted calls, reject invalid timing and never execute provider text',()=>{
  const report=observationReport(Array.from({length:1002},()=>event({tool:'<script>bad</script>',duration_ms:-1,findings:['DO-NOT-EXPORT']})));
  assert.equal(report.observedCalls,1000);assert.equal(report.omittedEntries,2);assert.equal(report.timing.samples,0);
  assert.ok(!observationHtml(report).includes('<script>'));assert.ok(!observationHtml(report).includes('DO-NOT-EXPORT'));
});
