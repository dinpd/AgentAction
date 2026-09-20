import type { McpTool } from './mcp-client.ts';

export type FieldChecks = {
  required_inputs?: string[]; required_outputs?: string[];
  arguments?: Record<string, string | number | boolean | null>;
  bindings?: Array<{ input: string; from_step: string; output: string }>;
};
export type DraftFieldChecks = Record<string, FieldChecks>;
export type CoverageStep = FieldChecks & { id: string; tool?: string };

/** Self-contained pure factory, shared by the Worker and serialized browser asset.
 * Provider data is never executed; no references, regexes, network or AI calls.
 */
export function capabilityEngine() {
  type Schema = Record<string, any>;
  const record = (v: unknown): v is Schema => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const own = (o: object, k: string) => Object.hasOwn(o, k);
  const meta = ['title','description','default','examples','$comment','$id','$schema','readOnly','writeOnly','deprecated'];
  const structure = ['type','properties','required','additionalProperties','items'];
  const constraints = ['enum','const','minLength','maxLength','minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf','minItems','maxItems','uniqueItems'];
  const kinds = ['object','array','string','number','integer','boolean','null'];
  const parts = (path: string) => path.slice(1).split('/').map(s => s.replaceAll('~1','/').replaceAll('~0','~'));
  const pointer = (key: string) => '/' + key.replaceAll('~','~0').replaceAll('/','~1');
  const pathValid = (v: unknown): v is string => typeof v === 'string' && v.length > 1 && v.length <= 256 && /^\/(?:[^~]|~[01])+$/.test(v);
  const supported = (s: unknown): s is Schema => record(s) && Object.keys(s).every(k => [...meta,...structure,...constraints].includes(k)) &&
    (!s.$schema || ['https://json-schema.org/draft/2020-12/schema','https://json-schema.org/draft/2020-12/schema#'].includes(s.$schema));
  function validSchema(s: unknown, depth = 0): boolean {
    if (typeof s === 'boolean') return true;
    if (!record(s) || depth > 24) return false;
    if (own(s,'type') && !(typeof s.type === 'string' ? kinds.includes(s.type) : Array.isArray(s.type) && s.type.length && s.type.every(t=>kinds.includes(t)))) return false;
    if (own(s,'required') && (!Array.isArray(s.required) || !s.required.every(v=>typeof v==='string') || new Set(s.required).size!==s.required.length)) return false;
    if (own(s,'enum') && (!Array.isArray(s.enum) || !s.enum.length)) return false;
    if (own(s,'properties') && (!record(s.properties) || !Object.values(s.properties).every(v=>validSchema(v,depth+1)))) return false;
    for (const key of ['items','additionalProperties']) if (own(s,key) && !validSchema(s[key],depth+1)) return false;
    for (const key of ['minLength','maxLength','minItems','maxItems']) if (own(s,key) && (!Number.isInteger(s[key]) || s[key]<0)) return false;
    for (const key of ['minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf']) if (own(s,key) && (typeof s[key]!=='number' || !Number.isFinite(s[key]) || key==='multipleOf' && s[key]<=0)) return false;
    return true;
  }
  function field(schema: unknown, path: string, output = false): { state: 'declared'|'absent'|'unknown'; schema?: Schema; reason: string } {
    if (!validSchema(schema)) return {state:'unknown',reason:'Schema is absent, invalid or too complex.'};
    let node: any = schema, required = true;
    for (const key of parts(path)) {
      if (node===false) return {state:'absent',reason:'Schema forbids this field.'};
      if (!supported(node)) return {state:'unknown',reason:'Schema uses unsupported keywords or a different dialect.'};
      if (node.type==='array' && key==='*') node=node.items ?? {};
      else if (node.type==='object') {
        if (!own(node.properties || {},key)) return node.additionalProperties===false
          ? {state:'absent',reason:'Closed schema does not expose this field.'}
          : {state:'unknown',reason:'Open schema does not enumerate this field.'};
        required=required && (node.required || []).includes(key); node=node.properties[key];
      } else if (typeof node.type==='string' && kinds.includes(node.type)) return {state:'absent',reason:'Schema type cannot contain this field path.'};
      else return {state:'unknown',reason:'Object or array type is not explicit.'};
    }
    if (node===false) return {state:'absent',reason:'Schema forbids this field.'};
    if (!supported(node)) return {state:'unknown',reason:'Field schema is open or complex.'};
    if (output && !required) return {state:'unknown',schema:node,reason:'Output field is optional; availability is not guaranteed.'};
    return {state:'declared',schema:node,reason:'Field is declared.'};
  }
  const typeSet = (s: Schema): string[] => typeof s.type==='string' ? [s.type] : s.type || [];
  function scalarValid(s: Schema, value: unknown): boolean | undefined {
    if (!supported(s) || record(value) || Array.isArray(value)) return undefined;
    const matches = (kind: string) => kind==='null' ? value===null : kind==='integer' ? typeof value==='number' && Number.isInteger(value) : kind==='number' ? typeof value==='number' && Number.isFinite(value) : typeof value===kind;
    if (typeSet(s).length && !typeSet(s).some(matches)) return false;
    if (own(s,'const') && JSON.stringify(s.const)!==JSON.stringify(value)) return false;
    if (s.enum && !s.enum.some(v=>JSON.stringify(v)===JSON.stringify(value))) return false;
    if (typeof value==='string' && ((s.minLength!==undefined && [...value].length<s.minLength) || (s.maxLength!==undefined && [...value].length>s.maxLength))) return false;
    if (typeof value==='number') {
      if (s.minimum!==undefined && value<s.minimum || s.maximum!==undefined && value>s.maximum || s.exclusiveMinimum!==undefined && value<=s.exclusiveMinimum || s.exclusiveMaximum!==undefined && value>=s.exclusiveMaximum) return false;
      if (s.multipleOf!==undefined && !Number.isInteger(value/s.multipleOf)) return undefined;
    }
    return true;
  }
  function compatible(source: Schema, target: Schema): {status:string;reason:string} {
    const a=typeSet(source), b=typeSet(target), assign=(k:string)=>b.includes(k)||k==='integer'&&b.includes('number');
    if (!a.length || !b.length) return {status:'unknown',reason:'Binding type is not explicit.'};
    if (!a.some(k=>assign(k)||k==='number'&&b.includes('integer'))) return {status:'partial',reason:'Binding output type cannot satisfy input type.'};
    if (!a.every(assign)) return {status:'unknown',reason:'Some output types cannot satisfy the input.'};
    if ([...a,...b].some(k=>['object','array'].includes(k))) return {status:'unknown',reason:'Compound value compatibility is not assessed.'};
    const restrictions=Object.keys(target).filter(k=>![...meta,'type'].includes(k));
    if (restrictions.length) {
      const values=own(source,'const') ? [source.const] : source.enum;
      if (values) {
        const results=values.map(v=>scalarValid(target,v));
        if (results.every(v=>v===false)) return {status:'partial',reason:'No declared output values satisfy input constraints.'};
        if (!results.every(v=>v===true)) return {status:'unknown',reason:'Only some output values satisfy input constraints.'};
      } else if (restrictions.some(k=>JSON.stringify(source[k])!==JSON.stringify(target[k]))) return {status:'unknown',reason:'Input constraints are not proven by the output schema.'};
    }
    return {status:'covered',reason:'Scalar connection is compatible according to declared schemas.'};
  }
  function validateChecks(value: unknown, ids: string[]): DraftFieldChecks {
    if (!record(value) || Object.keys(value).some(k=>!ids.includes(k))) throw new Error('Field checks must name existing draft steps.');
    const pairs: Array<[string,FieldChecks]> = [];
    for (const [id,raw] of Object.entries(value)) {
      if (!record(raw) || Object.keys(raw).some(k=>!['required_inputs','required_outputs','arguments','bindings'].includes(k))) throw new Error('Unsupported field-check settings.');
      for (const key of ['required_inputs','required_outputs']) if (raw[key]!==undefined && (!Array.isArray(raw[key]) || raw[key].length>16 || !raw[key].every(pathValid) || new Set(raw[key]).size!==raw[key].length)) throw new Error('Use up to 16 unique field paths starting with /.');
      if (raw.arguments!==undefined && (!record(raw.arguments) || Object.keys(raw.arguments).length>16 || Object.entries(raw.arguments).some(([k,v])=>!k || k.length>128 || !(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&v.length<=1000)))) throw new Error('Example inputs accept up to 16 named scalar values.');
      const targets=new Set<string>();
      if (raw.bindings!==undefined) {
        if (!Array.isArray(raw.bindings)||raw.bindings.length>16) throw new Error('Use up to 16 input connections.');
        for (const b of raw.bindings) {
          if (!record(b) || Object.keys(b).sort().join(',')!=='from_step,input,output' || !pathValid(b.input) || parts(b.input).length!==1 || !pathValid(b.output) || !ids.slice(0,ids.indexOf(id)).includes(b.from_step)) throw new Error('Input connections need a top-level input, an earlier step and a result field.');
          const key=parts(b.input)[0];
          if (targets.has(key)||own(raw.arguments || {},key)) throw new Error('Each input can have only one source.');
          targets.add(key);
        }
      }
      pairs.push([id,structuredClone(raw)]);
    }
    return Object.fromEntries(pairs);
  }
  function evaluate(tools: McpTool[], steps: CoverageStep[], complete = true, unspecifiedUnknown = false) {
    const prior=new Map<string,{step:CoverageStep;result:any}>(), results:any[]=[];
    for (const step of steps) {
      const findings:any[]=[];
      const add=(status:string,code:string,detail:string)=>findings.push({status,code,detail,evidence:status==='covered'?'declared':'inferred'});
      const tool=tools.find(t=>t.name===step.tool);
      if (!tool) add(step.tool&&complete?'not_exposed':'unknown',step.tool?'mapped_tool_missing':'unmapped_step','Mapped tool is unavailable or missing; alternate routes are not assessed.');
      else {
        for (const [kind,schema,paths] of [['input',tool.inputSchema,step.required_inputs || []],['output',tool.outputSchema,step.required_outputs || []]] as const) for (const path of paths) {
          const f=field(schema,path,kind==='output'); add(f.state==='declared'?'covered':f.state==='absent'?'partial':'unknown',kind+'_field',`${path}: ${f.reason}`);
        }
        const supplied=new Set([...Object.keys(step.arguments || {}),...(step.bindings || []).map(b=>parts(b.input)[0])]);
        if (!validSchema(tool.inputSchema)||!supported(tool.inputSchema)||tool.inputSchema.type!=='object') add('unknown','input_contract_unknown','Input contract is absent or complex.');
        else {
          const missing=(tool.inputSchema.required as string[] || []).filter(k=>!supplied.has(k));
          if(missing.length) add(unspecifiedUnknown?'unknown':'partial','required_arguments_missing',`Input sources not specified: ${missing.join(', ')}.`);
          if(Object.keys(tool.inputSchema).some(k=>constraints.includes(k))) add('unknown','object_constraints','Object-level constraints need full input verification.');
        }
        for (const [key,value] of Object.entries(step.arguments || {})) {
          const f=field(tool.inputSchema,pointer(key));
          if(f.state!=='declared') add(f.state==='absent'?'partial':'unknown','argument_field',`${pointer(key)}: ${f.reason}`);
          else { const valid=scalarValid(f.schema!,value); if(valid!==true) add(valid===false?'partial':'unknown',valid===false?'argument_invalid':'argument_constraints_unknown',`${pointer(key)}: example input ${valid===false?'does not satisfy':'cannot be checked against'} the declared constraints.`); }
        }
        for (const binding of step.bindings || []) {
          const previous=prior.get(binding.from_step);
          if (!previous) {add('unknown','binding_unknown','Input connection does not name an earlier step.');continue;}
          if(previous.result.status!=='covered') add(['partial','not_exposed'].includes(previous.result.status)?'partial':'unknown','predecessor_unavailable',`${binding.from_step}: prerequisite step is not fully covered.`);
          const source=field(tools.find(t=>t.name===previous.step.tool)?.outputSchema,binding.output,true),target=field(tool.inputSchema,binding.input);
          const label=`${binding.from_step}${binding.output} → ${step.id}${binding.input}`;
          if(source.state==='absent'||target.state==='absent') add('partial','binding_field_missing',`${label}: ${source.reason} ${target.reason}`);
          else if(source.state==='unknown'||target.state==='unknown') add('unknown','binding_unknown',`${label}: ${source.reason} ${target.reason}`);
          else {const c=compatible(source.schema!,target.schema!);add(c.status,'binding_compatibility',`${label}: ${c.reason}`);}
        }
        if(!findings.length) add('covered','mapped_contract','Mapped tool and example inputs are covered by declarations.');
      }
      const result={id:step.id,tool:step.tool,status:['not_exposed','partial','unknown'].find(s=>findings.some(f=>f.status===s)) || 'covered',findings};
      results.push(result);prior.set(step.id,{step,result});
    }
    return {status:results.some(s=>['partial','not_exposed'].includes(s.status))?'blocked':results.some(s=>s.status==='unknown')?'unknown':'declared_coverage',steps:results,behavior_verified:false,account_access:'unknown'};
  }
  function fields(schema: unknown, prefix='', depth=0): string[] {
    if(!record(schema)||depth>8) return [];
    if(schema.type==='array') return fields(schema.items,prefix+'/*',depth+1);
    if(!record(schema.properties)) return [];
    return Object.entries(schema.properties).flatMap(([key,s])=>{const path=prefix+pointer(key);return [path,...fields(s,path,depth+1)];}).filter(p=>p.length<=256).slice(0,40);
  }
  function inventory(tools: McpTool[]) {
    return tools.map(tool=>{
      const description=tool.description || '', words=tool.name.replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().split(/[^a-z]+/);
      const operations=['search','list','get','read','create','update','assign','close','delete','export','import','send','execute','run','manage'].filter(v=>words.includes(v));
      const restrictions=description.split(/(?<=[.!?])\s+|\n/).filter(s=>/\b(only|limits?|maximum|minimum|at most|up to|unsupported|unavailable|omitted|not included|does not|cannot|truncat\w*|restricted)\b/i.test(s)).slice(0,3).map(s=>s.slice(0,400));
      const findings=[...(tool.capabilityMetadataIssues || [])];
      if(description.split(/\s+/).length<4) findings.push('Description does not explain the operation and its boundaries.');
      if(!restrictions.length) findings.push('Limits are not clearly disclosed; actual limits remain unknown.');
      if(!tool.outputSchema) findings.push('Result schema is missing; returned field coverage is unknown.');
      if(!validSchema(tool.inputSchema)||!supported(tool.inputSchema)) findings.push('Input schema is invalid or complex; some field checks remain unknown.');
      if(tool.outputSchema && (!validSchema(tool.outputSchema)||!supported(tool.outputSchema))) findings.push('Result schema is invalid or complex; some field checks remain unknown.');
      return {name:tool.name,description,operations,inputs:fields(tool.inputSchema),outputs:fields(tool.outputSchema),restrictions,findings:findings.slice(0,8),annotations:tool.annotations || {},evidence:'declared'};
    });
  }
  return {validateChecks,evaluate,inventory,fields,field,parts,pointer};
}
export const CAPABILITY_FACTORY_JS = `(${capabilityEngine.toString()})`;
