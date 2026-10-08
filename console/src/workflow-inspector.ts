import type { ResearchDefinition } from './research-digest.ts';
import type { Run } from './agent-runtime.ts';

export function researchStepEvidence(step: string, run: Run): { status: string; trust: string; data: unknown } {
  const research = run.research!;
  const calls = run.events.map((event, index) => ({ index, ...event }));
  const sources = research.sources;
  const data = (status: string, trust: string, value: unknown) => ({ status, trust, data: value });
  switch (step) {
    case 'schedule': return data(research.approval ? 'Approved' : run.status === 'cancelled' ? 'Cancelled' : 'Awaiting approval', 'Runtime-recorded', {
      kind: run.kind, startedAt: run.startedAt, actor: run.actor, approval: research.approval || null,
      scopeDigest: research.definition.digest, reservationRecorded: research.reserved === true,
      window: { start: new Date(Date.parse(run.startedAt) - 86400000).toISOString(), end: run.startedAt },
    });
    case 'retrieve': return data(sources.every(s => s.stage === 'done') ? 'Retrieved' : sources.some(s => s.stage === 'unavailable') ? 'Coverage gap' : 'Pending', 'Runtime-recorded calls / provider-reported results', {
      calls, sources: sources.map(({ posts, ...source }) => source),
    });
    case 'validate': return data(sources.some(s => s.stage === 'done') ? 'Recorded validation' : 'Evidence unavailable', 'Runtime-recorded', sources.map(s => ({
      platform: s.platform, stage: s.stage, received: s.received, retained: s.posts.length, invalid: s.invalid, outsideWindow: s.outsideWindow, duplicates: s.duplicates, total: s.total ?? 'Unknown', gap: s.gap || null,
    })));
    case 'classify': return data(research.classification?.status.replaceAll('_', ' ') || 'Decision snapshot unavailable', 'AI-assessed', {
      classification: research.classification || null,
      candidates: sources.flatMap(s => s.posts.map(p => ({ ...p, decision: p.assessment ? (p.assessment.relevant ? 'Selected' : 'Rejected') : 'Unknown', explanation: p.assessment ? p.assessment.reason || p.reason || 'No decision explanation retained.' : 'No decision explanation retained.' }))),
    });
    case 'checks': return data(research.checks ? (research.checks.every(c => c.status === 'pass') ? 'Checks passed' : 'Checks failed') : 'Checks unavailable', 'Runtime checks over provider-reported and AI-assessed evidence', research.checks || null);
    case 'compose': return data(research.report ? 'Report recorded' : 'Report unavailable', 'Runtime-recorded', { report: research.report || null });
    case 'deliver': return data(research.delivery?.status || 'Delivery not recorded', 'Provider-reported acceptance; inbox receipt unverified', { recipient: research.definition.config.recipient, identity: `research:${run.id}`, delivery: research.delivery || null, handoffAttempts: research.deliveryAttempts || 0 });
    case 'outcome': return data(run.outcome?.replaceAll('_', ' ') || 'Outcome unavailable', 'Runtime assessment; not independent verification', { status: run.status, outcome: run.outcome || null, summary: run.summary || null, finishedAt: run.finishedAt || null });
    default: return data('Evidence unavailable', 'Unknown', null);
  }
}

export function workflowInspector(runtime: Pick<Window, 'document'>, evidence = researchStepEvidence) {
  const doc = runtime.document;
  const node = (tag: string, text = '', css = '') => { const element = doc.createElement(tag); element.textContent = text; if (css) element.className = css; return element; };
  function append(parent: HTMLElement, definition: ResearchDefinition, run?: Run) {
    const section = node('details', '', 'workflow-inspector') as HTMLDetailsElement;
    section.dataset.workflowInspector = run ? 'run' : 'definition';
    section.append(node('summary', run ? 'Workflow & evidence' : 'Workflow definition'));
    const workflow = definition.workflow;
    section.append(node('p', `${run ? 'Frozen run' : 'Saved definition'} digest: ${definition.digest}`, 'workflow-meta'));
    if (!workflow) {
      section.append(node('p', 'Workflow snapshot unavailable for this legacy definition. Saved settings and recorded calls remain available.', 'workflow-gap'));
      parent.append(section); return;
    }
    if (!((workflow.schemaVersion === 'agentaction.workflow-contract.v1' && workflow.implementationVersion === 1 && workflow.mode === 'descriptive') || (workflow.schemaVersion === 'agentaction.workflow-contract.v2' && workflow.implementationVersion === 2 && workflow.mode === 'executable'))) {
      section.append(node('p', 'This workflow contract version is unsupported by this inspector.', 'workflow-gap')); parent.append(section); return;
    }
    section.append(node('p', `Social research / implementation ${workflow.implementationVersion} / ${workflow.schemaVersion} / ${workflow.mode}`, 'workflow-meta'));
    if(run&&!run.research?.execution)section.append(node('p','Step journal unavailable for this legacy run. Evidence below is a projection of retained records, not reconstructed execution events.','workflow-gap'));
    const steps = node('ol', '', 'workflow-steps');
    for (const step of workflow.steps) {
      const row = node('li');
      const detail = node('details') as HTMLDetailsElement;
      detail.dataset.workflowStep = step.id;
      const summary = node('summary'), observed = run ? evidence(step.id, run) : undefined;
      summary.append(node('strong', step.label), node('span', `${step.kind === 'ai' ? 'AI assessment' : step.kind === 'external' ? 'External action' : 'Deterministic'}${observed ? ' / ' + observed.status : ''}`, 'workflow-kind'));
      detail.append(summary);
      const ports = node('dl', '', 'workflow-ports');
      for (const port of step.inputs) {
        ports.append(node('dt', port.name), node('dd', `${port.from ? `${port.from.step}.${port.from.output}` : `Saved ${port.config?.join(', ')}`} → ${port.name} (${port.type})`));
      }
      for (const port of step.outputs) ports.append(node('dt', 'Output'), node('dd', `${step.id}.${port.name} (${port.type})`));
      detail.append(ports, node('h4', 'Settings'), node('pre', JSON.stringify(step.settings, null, 2)), node('h4', 'Failure behavior'), node('p', step.failure));
      const configured = step.inputs.flatMap(port => port.config || []);
      if (configured.length) detail.append(node('h4', 'Saved inputs'), node('pre', JSON.stringify(Object.fromEntries(configured.map(key => [key, definition.config[key] ?? null])), null, 2)));
      if (observed) {
        const execution=run!.research!.execution;
        if(execution){
          const journal=execution.journal.filter(entry=>entry.step===step.id);
          detail.append(node('h4','Step journal'),node('p',`Runtime-recorded / frozen digest ${execution.digest}`,'workflow-meta'),node('pre',JSON.stringify(journal,null,2)));
          if(!journal.length)detail.append(node('p','No execution transition retained for this step.','workflow-gap'));
        }
        detail.append(node('h4', 'Recorded evidence'), node('p', observed.trust, 'workflow-meta'), node('pre', JSON.stringify(observed.data, null, 2)));
        if (step.id === 'classify') {
          const candidates = run!.research!.sources.flatMap(source => source.posts);
          const label = node('label', 'Candidate decisions'), filter = doc.createElement('select');
          filter.setAttribute('aria-label', 'Candidate decisions');
          for (const choice of ['All', 'Selected', 'Rejected', 'Unknown']) { const option = doc.createElement('option'); option.value = choice; option.textContent = choice; filter.append(option); }
          label.append(filter); detail.append(label);
          const list = node('div', '', 'workflow-candidates');
          const render = () => {
            list.replaceChildren();
            for (const post of candidates) {
              const decision = post.assessment ? (post.assessment.relevant ? 'Selected' : 'Rejected') : 'Unknown';
              if (filter.value !== 'All' && filter.value !== decision) continue;
              const item = node('article', '', 'workflow-candidate'); item.dataset.candidateDecision = decision;
              item.append(node('strong', `${post.platform.toUpperCase()} / ${decision} / ${post.at}`), node('p', post.text), node('p', post.assessment ? post.assessment.reason || post.reason || 'No decision explanation retained.' : 'No decision explanation retained.'));
              const url = node('p');
              // Source URLs are untrusted even though new runtime records validate them.
              try { const parsed = new URL(post.url); if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) { const link = node('a', post.url) as HTMLAnchorElement; link.href = parsed.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; url.append(link); } else url.textContent = post.url; } catch { url.textContent = post.url; }
              item.append(url); list.append(item);
            }
            if (!list.children.length) list.append(node('p', candidates.length ? 'No candidates in this category.' : 'No candidate evidence retained.', 'workflow-gap'));
          };
          filter.addEventListener('change', render); render(); detail.append(list);
        }
      }
      row.append(detail); steps.append(row);
    }
    section.append(steps); parent.append(section);
  }
  return { append };
}

export const WORKFLOW_FACTORY_JS = `(runtime) => (${workflowInspector.toString()})(runtime, ${researchStepEvidence.toString()})`;
export const WORKFLOW_CSS = `#agents>.card:has(.workflow-inspector){grid-column:1/-1}.workflow-inspector{margin:18px 0;border-top:1px solid #cbd0c4;padding-top:14px;min-width:0}.workflow-inspector>summary{cursor:pointer;font-weight:600}.workflow-meta{font-size:12px;color:#596150;overflow-wrap:anywhere}.workflow-gap{font-size:13px;color:#88540b}.workflow-steps{padding:0;list-style:none;counter-reset:workflow}.workflow-steps>li{counter-increment:workflow;border-bottom:1px solid #d6dccf}.workflow-steps summary{display:flex;align-items:center;gap:12px;padding:14px 0;cursor:pointer;list-style:none;font-size:14px}.workflow-steps summary:before{content:counter(workflow);flex:0 0 24px;text-align:center;color:#596150}.workflow-steps summary strong{flex:1;min-width:0;overflow-wrap:anywhere}.workflow-kind{font-size:12px;max-width:44%;overflow-wrap:anywhere;color:#596150}.workflow-steps details[open]>summary{border-bottom:1px solid #d6dccf}.workflow-steps h4{font-size:14px;margin:18px 0 8px}.workflow-steps p{font-size:13px;overflow-wrap:anywhere}.workflow-steps pre{font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:260px;overflow:auto;background:#f5f7f3;padding:12px}.workflow-ports{display:grid;grid-template-columns:100px minmax(0,1fr);gap:8px;font-size:12px}.workflow-ports dt{font-weight:600;overflow-wrap:anywhere}.workflow-ports dd{margin:0;overflow-wrap:anywhere}.workflow-candidate{padding:14px 0;border-top:1px solid #d6dccf}.workflow-candidate strong{font-size:13px;overflow-wrap:anywhere}.workflow-steps summary:focus-visible{outline:2px solid #46775a;outline-offset:2px}@media(max-width:600px){.workflow-steps summary{gap:8px;flex-wrap:wrap}.workflow-kind{max-width:100%;margin-left:32px;flex-basis:100%}.workflow-ports{grid-template-columns:75px minmax(0,1fr)}}`;
