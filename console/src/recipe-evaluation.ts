import type { ToolSource, ToolBindings } from './agent-plans.ts';
import { bindIntentProfile, digestIntentProfile, evaluateIntent, issueIntentContract, type IntentProfile, type IntentContract, type IntentEvaluationReceipt, type IntentPredicate } from "../../packages/guard/src/intent.ts";
import { object, RuntimeError, textField } from "./mcp-client.ts";
import type { RecipeDefinition } from "./workspace-recipes.ts";

export type RecipeCheck = { id: string; label: string; kind: "tool_succeeded" | "tool_not_called" | "result_field"; tool: string; path?: string; operator?: "equals" | "gte" | "lte" | "exists"; value?: string | number | boolean };
export type OutcomeRubric = { id: string; label: string; criterion: string; measurement?: { method: string; evidence: string } };
export type RecipeEval = { version: 1; checks: RecipeCheck[]; rubrics?: OutcomeRubric[] };
export type RubricAssessment = { sourceDigest: string; specificationDigest: string; criteria: Array<{id:string; status:'pass'|'fail'|'insufficient_evidence'; reason:string; observed?:string; calls:number[]}> };
export type RecipeEvalBinding = { tool_bindings?: ToolBindings; schema_version: "agentaction.hosted-eval-binding.v1"; definition_digest: string; profile: IntentProfile; specification: RecipeEval; allowed_tools: string[]; recipe?: { id: string; version: number } };
export type HostedContract = { inputs?: string; binding: RecipeEvalBinding; intent: IntentContract };
export type HostedEvaluation = { status: "pass" | "fail" | "insufficient_evidence"; receipt: IntentEvaluationReceipt; evidence_digest: string; source_digest: string; criteria: Array<{ id: string; label: string; status: "pass" | "fail" | "insufficient_evidence"; reason: string; observed?:string; evidence: string; trust: "runtime_recorded" | "provider_reported" | "ai_assessed" }> };
export type EvaluationRun = { id: string; agentId: string; status: string; startedAt: string; finishedAt?: string; summary?:string; rubricAssessment?:RubricAssessment; events: Array<{ source?: ToolSource; tool: string; arguments: Record<string, unknown>; status: string; result?: string; approval?: { id: string; actor: string; at: string } }>; contract?: HostedContract; evaluation?: HostedEvaluation };
const RESERVED = new Set(["__proto__", "prototype", "constructor"]);
const BUILTIN_IDS = new Set(["run_completed", "successful_call", "scope", "budget", "approval"]);

export function validateRecipeEval(value: unknown, tools: string[]): RecipeEval {
  const raw = object(value);
  if (raw.version !== 1 || Object.keys(raw).some(k => !["version", "checks", "rubrics"].includes(k)) || !Array.isArray(raw.checks) || raw.checks.length > 8) throw new RuntimeError("Choose up to eight measurable checks in evaluation version 1.");
  const ids = new Set<string>();
  const checks = raw.checks.map(value => {
    const c = object(value);
    if (Object.keys(c).some(k => !["id", "label", "kind", "tool", "path", "operator", "value"].includes(k))) throw new RuntimeError("Unsupported evaluation check field.");
    const id = textField(c.id, "check ID", 50), label = textField(c.label, "check label", 120), tool = textField(c.tool, "check tool", 200);
    if (!/^[a-z][a-z0-9_]{0,49}$/.test(id) || RESERVED.has(id) || BUILTIN_IDS.has(id) || ids.has(id)) throw new RuntimeError("Check IDs must be unique lowercase identifiers.");
    ids.add(id);
    if (!tools.includes(tool)) throw new RuntimeError("Each check must reference one of the agent's selected tools.");
    if (!["tool_succeeded", "tool_not_called", "result_field"].includes(String(c.kind))) throw new RuntimeError("Unsupported measurable check.");
    const kind = c.kind as RecipeCheck["kind"];
    if (kind !== "result_field") {
      if (["path", "operator", "value"].some(k => k in c)) throw new RuntimeError("Tool checks do not accept result field assertions.");
      return { id, label, kind, tool };
    }
    const path = textField(c.path, "structured result path", 160);
    if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){0,7}$/.test(path) || path.split('.').some(k => RESERVED.has(k))) throw new RuntimeError("Choose a plain field path within structuredContent, without prototype properties.");
    if (!["equals", "gte", "lte", "exists"].includes(String(c.operator))) throw new RuntimeError("Unsupported result field comparison.");
    const operator = c.operator as NonNullable<RecipeCheck["operator"]>;
    if (operator === "exists") {
      if ("value" in c) throw new RuntimeError("An existence check does not accept an expected value.");
      return { id, label, kind, tool, path, operator };
    }
    if (!["string", "number", "boolean"].includes(typeof c.value) || (typeof c.value === "number" && !Number.isFinite(c.value)) || (typeof c.value === "string" && c.value.length > 500)) throw new RuntimeError("Expected values must be bounded text, a finite number or a boolean.");
    if ((operator === "gte" || operator === "lte") && typeof c.value !== "number") throw new RuntimeError("Numeric comparisons need a numeric expected value.");
    return { id, label, kind, tool, path, operator, value: c.value as string | number | boolean };
  });
  let rubrics:OutcomeRubric[]|undefined;
  if(raw.rubrics!==undefined) {
    if(!Array.isArray(raw.rubrics)||raw.rubrics.length>6) throw new RuntimeError('Choose up to six outcome checks.');
    rubrics=raw.rubrics.map(value=>{
      const r=object(value),id=textField(r.id,'outcome check ID',50);
      if(Object.keys(r).some(k=>!['id','label','criterion','measurement'].includes(k))||!/^[a-z][a-z0-9_]{0,49}$/.test(id)||RESERVED.has(id)||BUILTIN_IDS.has(id)||ids.has(id)) throw new RuntimeError('Outcome check IDs must be unique lowercase identifiers.');
      ids.add(id);
      let measurement:OutcomeRubric['measurement'];
      if(r.measurement!==undefined) {
        const m=object(r.measurement);
        if(Object.keys(m).some(k=>!['method','evidence'].includes(k))) throw new RuntimeError('Unsupported measurement settings.');
        measurement={method:textField(m.method,'measurement procedure',500),evidence:textField(m.evidence,'measurement evidence',300)};
      }
      return {id,label:textField(r.label,'outcome check name',120),criterion:textField(r.criterion,'outcome criterion',500),...(measurement?{measurement}:{})};
    });
  }
  return { version: 1, checks, ...(rubrics ? {rubrics} : {}) };
}

export function rubricEvidence(run:EvaluationRun) {
  return {status:run.status,events:run.events,finishedAt:run.finishedAt,summary:run.summary || '',...(run.contract?.inputs!==undefined?{task:{goal:run.contract.intent.objective,inputs:run.contract.inputs}}:{})};
}
export function hasRubricEvidence(run:EvaluationRun):boolean {
  return run.status==='completed' && Boolean(run.summary) && run.events.length>0 && run.events.every(e=>{
    if(e.status!=='succeeded'||!e.result) return false;
    try { const result=JSON.parse(e.result); return result && typeof result==='object' && !result.isError && !/\[.*(?:truncated|omitted).*\]/i.test(e.result); } catch {return false;}
  });
}
export async function rubricAssessment(value:unknown,run:EvaluationRun):Promise<RubricAssessment> {
  const raw=object(value),rubrics=run.contract!.binding.specification.rubrics || [];
  if(rubrics.some(r=>r.measurement) && (run.contract!.inputs===undefined || await evidenceDigest(run.contract!.inputs)!==run.contract!.intent.profile_variables?.inputs_digest)) throw new RuntimeError('Frozen measurement inputs are unavailable or invalid.');
  if(Object.keys(raw).some(k=>k!=='criteria')||!Array.isArray(raw.criteria)||raw.criteria.length!==rubrics.length) throw new RuntimeError('Invalid outcome assessment.');
  const ids=new Set<string>();
  const criteria=raw.criteria.map(value=>{
    const c=object(value),id=textField(c.id,'outcome check ID',50);
    if(Object.keys(c).some(k=>!['id','status','reason','observed','calls'].includes(k))||!rubrics.some(r=>r.id===id)||ids.has(id)||!['pass','fail','insufficient_evidence'].includes(String(c.status))||!Array.isArray(c.calls)||c.calls.length>4||new Set(c.calls).size!==c.calls.length||c.calls.some(i=>!Number.isInteger(i)||Number(i)<0||Number(i)>=run.events.length)||c.status!=='insufficient_evidence'&&!c.calls.length) throw new RuntimeError('Invalid outcome assessment evidence.');
    ids.add(id);
    const measured=rubrics.find(r=>r.id===id)!.measurement;
    const observed=measured || c.observed!==undefined ? textField(c.observed,'observed measurement (or why unavailable)',600) : undefined;
    return {id,status:c.status as 'pass'|'fail'|'insufficient_evidence',reason:textField(c.reason,'outcome reasoning',600),...(observed?{observed}:{}),calls:c.calls as number[]};
  });
  return {sourceDigest:await evidenceDigest(rubricEvidence(run)),specificationDigest:await evidenceDigest(run.contract!.binding.specification),criteria};
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => JSON.stringify(k)+':'+canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
export async function evidenceDigest(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2,'0')).join('');
}
const predicate = (id: string, description: string, path: string, value: unknown = true, operator: "equals" | "gte" | "lte" = "equals"): IntentPredicate => ({ id, description, source: "job", assertion: { path, operator, value } });
export async function bindRecipeEval(definition: RecipeDefinition, recipe?: RecipeEvalBinding['recipe'], toolBindings?: ToolBindings): Promise<RecipeEvalBinding | undefined> {
  if (!definition.evaluation) return undefined;
  const specification = validateRecipeEval(definition.evaluation, definition.tools);
  const digest = await evidenceDigest(definition);
  const profile = bindIntentProfile({
    schema_version: "agentpass.intent-profile.v1", profile: `hosted_recipe_${digest.slice(0,32)}`, version: "v1", issuer: "agentaction-hosted-runtime", issued_at: "2026-09-17T00:00:00.000Z", objective_template: "{{goal}}",
    variables: { goal: { type: "string", required: true }, definition_digest: { type: "string", required: true }, inputs_digest: { type: "string", required: true }, connection_id: { type: "string", required: true }, agent_id: { type: "string", required: true }, specification_digest: { type: "string", required: true }, scope_digest: { type: "string", required: true }, recipe_ref: { type: "string", required: true } },
    required_outcomes: [predicate('run_completed', 'Run completed successfully', 'status', 'completed'), predicate('successful_call', 'At least one successful tool call', 'successful_calls', 1, 'gte'), ...specification.checks.filter(c => c.kind !== 'tool_not_called').map(c => predicate(c.id, c.label, `checks.${c.id}`, c.kind === 'result_field' && c.operator !== 'exists' ? c.value : true, c.operator === 'gte' || c.operator === 'lte' ? c.operator : 'equals')), ...(specification.rubrics || []).map(r=>predicate(r.id,r.label,`checks.${r.id}`))],
    hard_constraints: [predicate('scope', `Only selected tools: ${definition.tools.map(t=>definition.toolLabels?.[t] || t).join(', ')}`, 'scope'), predicate('budget', 'No more than four tool calls', 'calls', 4, 'lte'), predicate('approval', 'Every tool call has recorded approval', 'approved'), ...specification.checks.filter(c => c.kind === 'tool_not_called').map(c => predicate(c.id, c.label, `checks.${c.id}`))],
    evidence_requirements: ['job'],
  });
  return { schema_version: 'agentaction.hosted-eval-binding.v1', definition_digest: digest, profile, specification, allowed_tools: [...definition.tools], ...(toolBindings ? {tool_bindings:structuredClone(toolBindings)} : {}), ...(recipe ? { recipe } : {}) };
}
export async function issueHostedContract(binding: RecipeEvalBinding, run: EvaluationRun, agent: { id: string; goal: string; setup: string; connectionId: string }): Promise<HostedContract> {
  const intent = issueIntentContract(binding.profile, { intent_id: `hosted_intent_${run.id}`, job_id: `supervised:${run.id}`, issued_at: run.startedAt, variables: { goal: agent.goal, definition_digest: binding.definition_digest, inputs_digest: await evidenceDigest(agent.setup), connection_id: agent.connectionId, agent_id: agent.id, specification_digest: await evidenceDigest(binding.specification), scope_digest: await evidenceDigest(binding.tool_bindings ? {tools:binding.allowed_tools,bindings:binding.tool_bindings} : binding.allowed_tools), recipe_ref: canonical(binding.recipe || null) } });
  return { binding: structuredClone(binding), intent, ...(binding.specification.rubrics?.some(r=>r.measurement)?{inputs:agent.setup}:{}) };
}
function ownPath(value: unknown, path: string): { present: boolean; value?: unknown } {
  for (const key of path.split('.')) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key) || RESERVED.has(key)) return { present: false };
    value = (value as Record<string, unknown>)[key];
  }
  return { present: true, value };
}
export async function evaluateHostedRun(run: EvaluationRun): Promise<HostedEvaluation> {
  const { binding, intent } = run.contract!;
  if(run.contract!.inputs!==undefined && await evidenceDigest(run.contract!.inputs)!==intent.profile_variables?.inputs_digest) throw new RuntimeError('The frozen job inputs are invalid.',409);
  if (binding.profile.profile_digest !== digestIntentProfile(binding.profile) || intent.profile_digest !== binding.profile.profile_digest || intent.profile_variables?.definition_digest !== binding.definition_digest || intent.profile_variables?.agent_id !== run.agentId || intent.job_id !== `supervised:${run.id}` || intent.intent_id !== `hosted_intent_${run.id}`) throw new RuntimeError('The frozen contract binding is invalid.', 409);
  if (intent.profile_variables?.specification_digest !== await evidenceDigest(binding.specification) || intent.profile_variables?.scope_digest !== await evidenceDigest(binding.tool_bindings ? {tools:binding.allowed_tools,bindings:binding.tool_bindings} : binding.allowed_tools) || intent.profile_variables?.recipe_ref !== canonical(binding.recipe || null)) throw new RuntimeError('The frozen evaluation specification is invalid.', 409);
  const checks: Record<string, string | number | boolean> = {};
  const refs = new Map<string, string>();
  for (const c of binding.specification.checks) {
    const events = run.events.map((e,i) => ({...e,index:i})).filter(e => e.tool === c.tool);
    refs.set(c.id, events.length ? events.map(e => `run:${run.id}:call:${e.index}`).join(', ') : `run:${run.id}:call-history`);
    if (c.kind === 'tool_succeeded') checks[c.id] = events.some(e => e.status === 'succeeded');
    else if (c.kind === 'tool_not_called') checks[c.id] = events.length === 0;
    else {
      const event = events.at(-1);
      if (!event || event.status !== 'succeeded' || !event.result) continue;
      try {
        const result = JSON.parse(event.result);
        const field = ownPath(result.structuredContent, c.path!);
        if (!field.present) continue;
        refs.set(c.id, `run:${run.id}:call:${event.index}:structuredContent.${c.path}`);
        if (c.operator === 'exists') checks[c.id] = true;
        else if ((typeof field.value === 'string' && field.value.length <= 500) || typeof field.value === 'boolean' || (typeof field.value === 'number' && Number.isFinite(field.value))) checks[c.id] = field.value;
      } catch { /* Truncated or malformed provider output cannot establish a result field. */ }
    }
  }
  // An interrupted call may have succeeded remotely; do not turn uncertainty
  // into proof of success or absence. Runtime completion remains a separate check.
  for (const c of binding.specification.checks) if (c.kind === 'tool_succeeded' && !checks[c.id] && run.events.some(e => e.tool === c.tool && ['executing','uncertain'].includes(e.status))) delete checks[c.id];
  const assessed=hasRubricEvidence(run) && run.rubricAssessment?.sourceDigest===await evidenceDigest(rubricEvidence(run)) && run.rubricAssessment?.specificationDigest===await evidenceDigest(binding.specification);
  for(const r of binding.specification.rubrics || []) {
    const result=assessed ? run.rubricAssessment?.criteria.find(c=>c.id===r.id) : undefined;
    if(result && result.status!=='insufficient_evidence') checks[r.id]=result.status==='pass';
    if(result) refs.set(r.id,result.calls.map(i=>`run:${run.id}:call:${i}`).join(', ') || `run:${run.id}:summary`);
  }
  const sourceDigest = await evidenceDigest({ status: run.status, events: run.events, finishedAt: run.finishedAt, ...(binding.specification.rubrics?.length ? {summary:run.summary,rubricAssessment:run.rubricAssessment} : {}) });
  const job = { job_id: intent.job_id, intent_id: intent.intent_id, intent_digest: intent.intent_digest, agent_id: run.agentId, status: run.status, calls: run.events.length, successful_calls: run.events.filter(e => e.status === 'succeeded').length, scope: run.events.every(e => binding.allowed_tools.includes(e.tool) && (!binding.tool_bindings || canonical(e.source || null) === canonical(binding.tool_bindings[e.tool] || null))), approved: run.events.every(e => e.approval && e.approval.id && e.approval.actor && Number.isFinite(Date.parse(e.approval.at))), checks, source_digest: sourceDigest };
  const receipt = evaluateIntent(intent, { job }, { idGenerator: () => `hosted_eval_${run.id}`, now: () => new Date(run.finishedAt!) });
  const results = [...receipt.outcomes, ...receipt.constraints];
  const criteria = results.map(r => {
    const c = binding.specification.checks.find(c => c.id === r.predicate_id);
    const rubric=binding.specification.rubrics?.find(c=>c.id===r.predicate_id);
    const assessment=rubric && assessed ? run.rubricAssessment?.criteria.find(c=>c.id===r.predicate_id) : undefined;
    const label = [...intent.required_outcomes, ...intent.hard_constraints].find(p => p.id === r.predicate_id)!.description!;
    return { id: r.predicate_id, label, ...(assessment?.observed?{observed:assessment.observed}:{}), status: r.status === 'indeterminate' ? 'insufficient_evidence' as const : r.status, reason: assessment ? assessment.reason : r.status === 'indeterminate' ? 'The required evidence is missing, incomplete or unavailable.' : r.reason, evidence: refs.get(r.predicate_id) || `run:${run.id}:recorded-state`, trust: rubric ? 'ai_assessed' as const : c?.kind === 'result_field' ? 'provider_reported' as const : 'runtime_recorded' as const };
  });
  return { status: criteria.some(c => c.status === 'fail') ? 'fail' : criteria.some(c => c.status === 'insufficient_evidence') ? 'insufficient_evidence' : 'pass', receipt, evidence_digest: await evidenceDigest(job), source_digest: sourceDigest, criteria };
}
