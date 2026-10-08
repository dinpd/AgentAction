import { researchConfig, type ResearchDefinition, type ResearchRun } from './research-digest.ts';
import { researchWorkflow, type WorkflowStep } from './research-workflow.ts';
import { canonical } from './recipe-evaluation.ts';
import { RuntimeError } from './mcp-client.ts';

export type ValueReference = { path: string };
export type InputReference = { config: string[] } | { from: string; output: string; value: ValueReference };
export type StepRecord = {
  sequence: number; step: string; kind: 'step' | 'tool' | 'handoff'; status: 'started' | 'succeeded' | 'failed' | 'uncertain' | 'cancelled'; at: string;
  inputs?: Record<string, InputReference>; outputs?: Record<string, ValueReference>; call?: number; attempt?: number; observation?: string;
};
export type ResearchExecution = { schemaVersion: 'agentaction.research-execution.v1'; digest: string; cursor: number; outputs: Record<string, Record<string, ValueReference>>; journal: StepRecord[]; handoffAttempts?: number };

export function executableResearch(definition: ResearchDefinition): WorkflowStep[] {
  const config = researchConfig(definition.config);
  if (canonical(config) !== canonical(definition.config) || canonical(definition.workflow) !== canonical(researchWorkflow(config)))
    throw new RuntimeError('Unsupported or changed executable research definition. Save settings and review a fresh trial.', 409);
  return definition.workflow!.steps;
}
export function executionState(definition: ResearchDefinition): ResearchExecution {
  executableResearch(definition);
  return { schemaVersion: 'agentaction.research-execution.v1', digest: definition.digest, cursor: 0, outputs: {}, journal: [] };
}

// References point to bounded retained evidence rather than duplicate post text in every step.
const outputPaths: Record<string, Record<string, string>> = {
  schedule: { window: 'window' }, retrieve: { datasets: 'sources' }, validate: { candidates: 'candidates', coverage: 'coverage' },
  classify: { decisions: 'decisions' }, checks: { checks: 'checks' }, compose: { report: 'report' }, deliver: { delivery: 'delivery' }, outcome: { outcome: 'outcome' },
};
export function validateExecution(research: ResearchRun, pending=false): void {
  const execution=research.execution,steps=executableResearch(research.definition);
  if(!execution||execution.schemaVersion!=='agentaction.research-execution.v1'||execution.digest!==research.definition.digest||!Number.isInteger(execution.cursor)||execution.cursor<(pending?0:1)||execution.cursor>=steps.length||(pending&&execution.cursor!==0)||!Array.isArray(execution.journal)||execution.journal.length>160)
    throw new RuntimeError('Invalid retained workflow execution state.',409);
  const outputs=Object.fromEntries(steps.slice(0,execution.cursor).map(step=>[step.id,Object.fromEntries(Object.entries(outputPaths[step.id]).map(([name,path])=>[name,{path}]))]));
  if(canonical(outputs)!==canonical(execution.outputs))throw new RuntimeError('Invalid retained workflow output bindings.',409);
  for(const [index,event] of execution.journal.entries()){
    if(event.sequence!==index+1||!steps.some(step=>step.id===event.step)||!Number.isFinite(Date.parse(event.at))||!['step','tool','handoff'].includes(event.kind)||!['started','succeeded','failed','uncertain','cancelled'].includes(event.status))throw new RuntimeError('Invalid retained workflow journal.',409);
  }
  for(const step of steps.slice(0,execution.cursor))if(!execution.journal.some(event=>event.step===step.id&&event.kind==='step'&&['succeeded','failed'].includes(event.status)&&canonical(event.outputs)===canonical(outputs[step.id])))throw new RuntimeError('Missing retained workflow completion.',409);
}
export function inputReferences(research: ResearchRun, step: WorkflowStep): Record<string, InputReference> {
  return Object.fromEntries(step.inputs.map(port => {
    if (port.config) return [port.name, { config: port.config }];
    const from = port.from!, value = research.execution!.outputs[from.step]?.[from.output];
    if (!value) throw new RuntimeError(`Missing retained input ${from.step}.${from.output}.`, 409);
    return [port.name, { from: from.step, output: from.output, value }];
  }));
}
export function resolvedInputs(research: ResearchRun, step: WorkflowStep, startedAt: string, outcome?: string): Record<string, any> {
  const observedPosts=()=>research.sources.flatMap(s=>s.posts.map(({platform,url,at,text})=>({platform,url,at,text})));
  const read = (ref: ValueReference) => {
    switch (ref.path) {
      case 'window': return { start: new Date(Date.parse(startedAt) - Number(research.definition.workflow!.steps[0].settings.lookbackHours) * 3600000).toISOString(), end: startedAt };
      case 'sources': return research.sources.map(source=>({...source,posts:source.posts.map(({platform,url,at,text})=>({platform,url,at,text}))}));
      case 'candidates': return observedPosts();
      case 'coverage': return research.sources.map(({ posts, ...source }) => source);
      case 'decisions': return { classification: research.classification, posts: research.sources.flatMap(s => s.posts) };
      case 'checks': return research.checks;
      case 'report': return research.report;
      case 'delivery': return research.delivery;
      case 'outcome': return outcome;
      default: throw new RuntimeError('Unsupported retained output reference.', 409);
    }
  };
  return Object.fromEntries(Object.entries(inputReferences(research, step)).map(([name, ref]) => [name,
    'config' in ref ? Object.fromEntries(ref.config.map(key => [key, research.definition.config[key as keyof typeof research.definition.config]])) : read(ref.value)]));
}
export function recordStep(research: ResearchRun, step: string, status: StepRecord['status'], extra: Partial<Pick<StepRecord, 'kind' | 'inputs' | 'outputs' | 'call' | 'attempt' | 'observation'>> = {}): void {
  const execution = research.execution!;
  if (execution.journal.length >= 160) throw new RuntimeError('The bounded workflow journal is exhausted.', 409);
  execution.journal.push({ sequence: execution.journal.length + 1, step, kind: 'step', status, at: new Date().toISOString(), ...extra });
}
export function completeStep(research: ResearchRun, step: WorkflowStep, status: 'succeeded' | 'failed' = 'succeeded'): void {
  const outputs = Object.fromEntries(step.outputs.map(port => [port.name, { path: outputPaths[step.id][port.name] }]));
  research.execution!.outputs[step.id] = outputs;
  recordStep(research, step.id, status, { outputs });
  research.execution!.cursor++;
}
export function startedStep(research: ResearchRun, step: string): boolean {
  return research.execution!.journal.some(entry => entry.kind === 'step' && entry.step === step && entry.status === 'started');
}
