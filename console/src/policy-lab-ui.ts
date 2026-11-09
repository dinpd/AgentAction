import type { governanceInsights, Finding, ReviewStatus } from './governance-insights.ts';
import type { PolicyCandidate, replayPolicy } from './policy-replay.ts';

type Results = Omit<Awaited<ReturnType<typeof governanceInsights>>, 'findings'> & {
  findings: Array<Finding & {candidate?: PolicyCandidate}>;
  scannedRuns: number;
  scanTruncated: boolean;
};

export function policyLabView(
  doc: Document,
  host: HTMLElement,
  request: (path: string, body?: unknown) => Promise<unknown>,
  categories: Record<string, string>,
) {
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => {
    const el = doc.createElement(tag);
    el.textContent = text;
    el.className = className;
    return el;
  };
  const option = (value: string, label: string) => {
    const el = element('option', label);
    el.value = value;
    return el;
  };
  const field = (name: string, control: HTMLElement) => {
    const el = element('label', name);
    control.setAttribute('aria-label', name);
    el.append(control);
    return el;
  };
  const button = (label: string) => {
    const el = element('button', label, 'secondary');
    el.type = 'button';
    return el;
  };
  const format = (value: string) => value.replaceAll('_', ' ');
  const statuses: Record<ReviewStatus, string> = {open: 'Open', reviewed: 'Reviewed', dismissed: 'Dismissed', candidate: 'Candidate for future action'};
  const form = element('form', '', 'actions');
  const agent = element('select'), category = element('select'), days = element('select');
  category.append(option('', 'All categories'), ...Object.entries(categories).map(([value, label]) => option(value, label)));
  days.append(...[7, 30, 90].map(days => option(String(days), `Last ${days} days`)));
  days.value = '30';
  const refresh = button('Refresh findings');
  refresh.type = 'submit';
  form.append(field('Agent', agent), field('Category', category), field('Time window', days), refresh);
  const status = element('p', '', 'note');
  status.setAttribute('role', 'status');
  const results = element('div');
  host.append(form, status, results);
  let workspace = '', role = 'viewer', generation = 0, loaded = false;
  let names = new Map<string, string>();
  const filters = () => ({days: days.value, ...(agent.value ? {agentId: agent.value} : {}), ...(category.value ? {category: category.value} : {})});
  const url = (action: string) => `/api/agents/${encodeURIComponent(workspace)}/${action}`;

  function replayDetails(report: ReturnType<typeof replayPolicy>) {
    const container = element('div');
    container.append(element('h4', 'Replay comparison'));
    container.append(element('p', `${report.eligible} compared · ${report.inconclusive} inconclusive · ${report.newlyDenied} newly denied · ${report.newlyAllowed} newly allowed · ${report.newlyChallenged} newly challenged`));
    for (const [label, counts] of [['Recorded decisions', report.observed], ['Original, compared subset', report.original], ['Proposed, compared subset', report.proposed]] as const) {
      container.append(element('p', `${label} · ${counts.allow} allow · ${counts.deny} deny · ${counts.challenge} challenge`, 'note'));
    }
    container.append(element('p', `Allowed claims changed by ${report.approvedClaimsDelta}. ${report.approvalVolume}`, 'note'));
    if (report.inconclusive) container.append(element('p', `${report.limits.partialEvidence} partial · ${report.limits.baselineMismatch} baseline mismatch · ${report.limits.earlierDecisionChanged + report.limits.earlierDecisionInconclusive} depend on an earlier decision`, 'note'));
    const details = element('details');
    details.append(element('summary', 'Changed decisions, safeguards and limitations'));
    for (const {evidence, reason} of report.changed) {
      details.append(element('p', `${evidence.tool ?? 'Tool'} · ${evidence.jobId} · ${format(reason)}`, 'note'));
    }
    for (const check of report.negativeCases) details.append(element('p', `${check.name} · ${check.decision}`, 'note'));
    for (const limit of report.limitations) details.append(element('p', limit, 'note'));
    container.append(details);
    return container;
  }

  function render(data: Results) {
    const current = generation;
    const metrics = data.metrics;
    status.textContent = `${data.findings.length} findings from ${data.scannedRuns} retained runs. ${metrics.replayEligibleClaims} of ${metrics.claims} claims have replay inputs.`;
    const perJob = metrics.approvedCallsPerJob === null ? '—' : metrics.approvedCallsPerJob.toFixed(1);
    results.append(element('p', `${perJob} approved calls per qualified job · ${metrics.deniedAttempts} denied attempts · ${metrics.uncertainExecutions} uncertain dispatches · ${metrics.jobsMissingAssurance} jobs with missing assurance`, 'note'));
    if (data.scanTruncated || data.findingsTruncated || metrics.jobsAtRejectionLimit) {
      results.append(element('p', 'This view reached a scan, result or retained rejection limit. Counts may be incomplete.', 'note'));
    }
    if (!data.findings.length) results.append(element('p', 'No findings match these filters in the retained evidence.', 'empty'));
    for (const finding of data.findings) {
      const card = element('article', '', 'card');
      card.dataset.findingCategory = finding.category;
      const heading = element('div', '', 'section-heading');
      heading.append(element('h3', categories[finding.category]), element('span', `${finding.severity} severity`, 'pill'));
      const review = element('p', `Review status · ${statuses[finding.review]}`, 'note');
      card.append(heading, element('p', `${names.get(finding.agentId) ?? finding.agentId} · ${finding.tool ?? 'Job or tool scope'} · ${finding.frequency} observations across ${finding.jobIds.length} jobs`),
        element('p', finding.hypothesis), element('p', `${finding.recommendation.kind === 'agent' ? 'Agent improvement' : 'Governance improvement'} · ${finding.recommendation.action}`), review);
      const evidence = element('details');
      evidence.append(element('summary', 'Supporting evidence'), element('p', `${finding.path === 'hermes' ? 'Hermes' : 'Hosted supervisor'} · Workspace policy v${finding.policyVersion} · Agent revision ${finding.agentPolicyVersion ?? 'unavailable'} · ${finding.confidence} confidence`, 'note'));
      evidence.append(element('p', `${new Date(finding.window.from).toLocaleDateString()} to ${new Date(finding.window.to).toLocaleDateString()} · Showing ${finding.evidence.length} evidence records`, 'note'));
      for (const item of finding.evidence) {
        const link = element('a', `Open run ${item.jobId.slice(0, 8)}`);
        link.href = `/agents?workspace=${encodeURIComponent(workspace)}&run=${encodeURIComponent(item.jobId)}#run`;
        const row = element('p', '', 'note');
        row.append(link, ` · ${format(item.reason)} · ${format(item.trust)} · ${format(item.coverage)} · ${new Date(item.at).toLocaleString()}`);
        evidence.append(row);
      }
      for (const limitation of finding.limitations) evidence.append(element('p', limitation, 'note'));
      card.append(evidence);

      const candidate = finding.candidate;
      if (candidate) {
        const proposal = element('details');
        proposal.append(element('summary', 'Policy change candidate'),
          element('p', `Historical caps ${candidate.current.maxCalls.join(', ')} · Proposed cap ${candidate.change.maxCalls} calls per run`),
          element('p', candidate.benefit), element('p', candidate.risk), element('p', candidate.requirements, 'note'));
        if (role !== 'viewer') {
          const run = button('Run historical replay'), output = element('div');
          output.setAttribute('aria-live', 'polite');
          run.addEventListener('click', async () => {
            run.disabled = true;
            output.textContent = 'Comparing historical decisions…';
            try {
              const report = await request(url('policy-lab-replay'), {...filters(), findingId: finding.id, candidateId: candidate.id});
              if (generation === current) output.replaceChildren(replayDetails(report as ReturnType<typeof replayPolicy>));
            } catch (error) {
              if (generation === current) output.textContent = error instanceof Error ? error.message : 'Replay failed.';
            } finally { run.disabled = false; }
          });
          proposal.append(run, output);
        }
        card.append(proposal);
      }

      if (role !== 'viewer') {
        const select = element('select');
        for (const value of ['reviewed', 'dismissed', 'candidate'] as const) select.append(option(value, statuses[value]));
        if (finding.review !== 'open') select.value = finding.review;
        const save = button('Save review'), feedback = element('p', '', 'note');
        feedback.setAttribute('role', 'status');
        save.addEventListener('click', async () => {
          save.disabled = true;
          feedback.textContent = '';
          try {
            const value = await request(url('policy-lab-review'), {...filters(), findingId: finding.id, status: select.value}) as {status: ReviewStatus};
            if (generation === current) {
              review.textContent = `Review status · ${statuses[value.status]}`;
              feedback.textContent = 'Review saved.';
            }
          } catch (error) {
            if (generation === current) feedback.textContent = error instanceof Error ? error.message : 'Review could not be saved.';
          } finally { save.disabled = false; }
        });
        const controls = element('div', '', 'actions');
        controls.append(field('Set review status', select), save);
        card.append(controls, feedback);
      }
      results.append(card);
    }
  }

  async function load() {
    const current = ++generation;
    results.replaceChildren();
    if (!workspace) return;
    status.textContent = 'Loading retained governance evidence…';
    try {
      const data = await request(url('policy-lab') + '?' + new URLSearchParams(filters())) as Results;
      if (generation === current) render(data);
    } catch (error) {
      if (generation === current) status.textContent = error instanceof Error ? error.message : 'Findings could not be loaded.';
    }
  }
  form.addEventListener('submit', event => {event.preventDefault(); void load();});
  form.addEventListener('change', () => {void load();});
  return {
    activate(id: string, membership: string, agents: Array<{id: string; title: string}>) {
      if (id !== workspace || membership !== role) {
        workspace = id;
        role = membership;
        loaded = false;
        results.replaceChildren();
        status.textContent = '';
        agent.value = '';
      }
      names = new Map(agents.map(item => [item.id, item.title]));
      const selected = agent.value;
      agent.replaceChildren(option('', 'All agents'), ...agents.map(item => option(item.id, item.title)));
      if (names.has(selected)) agent.value = selected;
      if (!loaded) {
        loaded = true;
        void load();
      }
    },
  };
}

export const POLICY_LAB_FACTORY_JS = `(${policyLabView.toString()})`;
