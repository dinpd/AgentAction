import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { capabilityEngine } from '../src/mcp-capabilities.ts';
import { McpClient } from '../src/mcp-client.ts';

const engine=capabilityEngine();
const cases=JSON.parse(readFileSync(new URL('../../fixtures/mcp-capability-coverage-v1/cases.json',import.meta.url),'utf8'));
for(const fixture of cases) test(`shared CLI/console coverage: ${fixture.name}`,()=>{
  const result=engine.evaluate(fixture.tools,fixture.profile.steps,fixture.complete);
  assert.equal(result.status,fixture.expected.status);
  if(fixture.expected.steps) assert.deepEqual(result.steps.map(s=>s.status),fixture.expected.steps);
  if(fixture.expected.code) assert.ok(result.steps.some(s=>s.findings.some(f=>f.code===fixture.expected.code)));
  assert.equal(result.behavior_verified,false); assert.equal(result.account_access,'unknown');
});

test('draft field checks reject forward references, duplicate sources and non-scalar values',()=>{
  for(const checks of [
    {alien:{}}, {one:{secret:true}}, {one:{required_outputs:['bad']}},
    {one:{arguments:{x:{nested:true}}}}, {one:{arguments:{x:Infinity}}},
    {one:{bindings:[{input:'/x',from_step:'two',output:'/id'}]}},
    {two:{arguments:{x:'literal'},bindings:[{input:'/x',from_step:'one',output:'/id'}]}},
    {two:{bindings:[{input:'/x',from_step:'one',output:'/id'},{input:'/x',from_step:'one',output:'/id'}]}},
  ]) assert.throws(()=>engine.validateChecks(checks,['one','two']));
  const checks=JSON.parse('{"one":{"arguments":{"__proto__":"literal","constructor":"safe"}}}');
  assert.deepEqual(engine.validateChecks(checks,['one']),checks);
  assert.equal(({} as any).literal,undefined);
});

test('unspecified UI inputs stay unknown and malformed schemas never assert coverage',()=>{
  const tool={name:'read',description:'Read only one record.',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id']}};
  assert.equal(engine.evaluate([tool],[{id:'one',tool:'read'}],true,true).status,'unknown');
  for(const schema of [{type:'object',properties:[]},{type:'object',required:'id'},{$ref:'https://example.com/schema'}])
    assert.equal(engine.field(schema,'/id').state,'unknown');
  const report=engine.inventory([tool])[0];
  assert.deepEqual(report.operations,['read']);assert.equal(report.restrictions.length,1);
  assert.ok(report.findings.some(f=>f.includes('Result schema is missing')));
});

test('catalog retains bounded declarations and distinguishes incomplete resource discovery',async()=>{
  const methods:string[]=[];
  const client=new McpClient({endpoint:'https://example.com/mcp',protocol:'2025-11-25',tools:[]},async(_url,init)=>{
    const message=JSON.parse(String(init?.body));methods.push(message.method);
    if(message.method==='notifications/initialized') return new Response(null,{status:202});
    const result=message.method==='initialize'?{protocolVersion:'2025-11-25',serverInfo:{name:'fixture',version:'1'},capabilities:{tools:{},resources:{}}}:
      message.method==='tools/list'?{tools:[{name:'read',inputSchema:{type:'object'},outputSchema:{type:'object',properties:{id:{type:'string'}}},annotations:{readOnlyHint:true}},
        {name:'bad',inputSchema:{type:'object'},outputSchema:[],annotations:{large:'x'.repeat(2001)}}]}:
      message.method==='resources/list'?{resources:[{uri:'record:one',description:'Only one record.'}],nextCursor:'repeat'}:{resourceTemplates:[{uriTemplate:'record:{id}',name:'Record'}]};
    return Response.json({jsonrpc:'2.0',id:message.id,result});
  });
  const tools=await client.discover(),catalog=await client.discoverMetadata();
  assert.deepEqual(tools[0].annotations,{readOnlyHint:true});assert.ok(tools[0].outputSchema);
  assert.equal(tools[1].outputSchema,undefined);assert.equal(tools[1].annotations,undefined);assert.equal(tools[1].capabilityMetadataIssues?.length,2);
  assert.equal(catalog.server?.name,'fixture');assert.equal(catalog.resources.status,'incomplete');assert.equal(catalog.resources.items.length,1);
  assert.equal(catalog.resourceTemplates.status,'complete');assert.equal(catalog.resourceTemplates.items[0].uriTemplate,'record:{id}');
  assert.ok(!methods.includes('tools/call'));assert.ok(!methods.includes('resources/read'));
});
