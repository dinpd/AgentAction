import { actionDigest } from './execution-supervisor.ts';
import type { GovernanceEvidence, GovernanceRun } from './governance-evidence.ts';

export const FINDING_CATEGORIES = {
  repeated_denials: 'Repeated denials',
  approval_friction: 'Approval friction',
  execution_uncertainty: 'Execution uncertainty',
  repeated_tool_failures: 'Repeated tool failures',
  missing_outcome_assurance: 'Missing outcome assurance',
};
export type FindingCategory = keyof typeof FINDING_CATEGORIES;
export type ReviewStatus = 'open' | 'reviewed' | 'dismissed' | 'candidate';
export type Finding = {
  id: string;
  category: FindingCategory;
  severity: 'high' | 'medium' | 'low';
  agentId: string;
  jobIds: string[];
  tool?: string;
  resource?: string;
  path: GovernanceEvidence['path'];
  policyVersion: number;
  agentPolicyVersion?: number;
  frequency: number;
  window: { from: string; to: string };
  evidence: GovernanceEvidence[];
  confidence: 'high' | 'moderate';
  limitations: string[];
  hypothesis: string;
  recommendation: {kind: 'agent' | 'governance'; action: string};
  review: ReviewStatus;
};
const RULES = {
  repeated_denials: {
    minimum: 2, severity: 'medium', confidence: 'high',
    hypothesis: 'The workflow may be requesting tools or calls outside the job boundary.',
    recommendation: {kind: 'agent', action: 'Correct tool selection, job instructions or call sequencing and rerun a bounded trial.'},
    limitation: 'Denied attempts do not establish that broader permissions are appropriate.',
  },
  approval_friction: {
    minimum: 2, severity: 'low', confidence: 'high',
    hypothesis: 'Operators repeatedly approve exact calls of the same type.',
    recommendation: {kind: 'governance', action: 'Review the approval workflow and identify which predicates the runtime would have to enforce before any automation.'},
    limitation: 'Claims show approvals were consumed. They cannot establish that future requests will be safe.',
  },
  execution_uncertainty: {
    minimum: 1, severity: 'high', confidence: 'high',
    hypothesis: 'A dispatch was claimed and its effect is unresolved or its completion evidence was lost.',
    recommendation: {kind: 'governance', action: 'Reconcile the prior effect using provider evidence before initiating another mutation. Review how completion evidence is retained.'},
    limitation: 'A claim, timeout or interruption does not establish whether the provider committed an effect.',
  },
  repeated_tool_failures: {
    minimum: 2, severity: 'medium', confidence: 'moderate',
    hypothesis: 'The workflow may be sending invalid arguments or relying on a failing tool or provider.',
    recommendation: {kind: 'agent', action: 'Review the recorded failure stage and correct the arguments or investigate the provider before trying again.'},
    limitation: 'A provider error does not rule out partial effects.',
  },
  missing_outcome_assurance: {
    minimum: 1, severity: 'medium', confidence: 'moderate',
    hypothesis: 'The retained run lacks sufficiently grounded evidence to assess its intended outcome.',
    recommendation: {kind: 'governance', action: 'Define measurable outcome checks and retain an attributable provider receipt or read-back where available.'},
    limitation: 'Tool completion and self-reported assessments alone do not establish job success.',
  },
} satisfies Record<FindingCategory, {
  minimum: number; severity: Finding['severity']; confidence: Finding['confidence'];
  hypothesis: string; recommendation: Finding['recommendation']; limitation: string;
}>;
const SEVERITY = {high: 0, medium: 1, low: 2};
const MAX_FINDINGS = 100;

function classify(item: GovernanceEvidence): FindingCategory | undefined {
  if (item.kind === 'claim') return 'approval_friction';
  if (item.kind === 'rejection') return item.reason === 'invalid_arguments' ? 'repeated_tool_failures' : 'repeated_denials';
  if (item.kind === 'execution' && ['uncertain', 'dispatch_overdue'].includes(item.reason)) return 'execution_uncertainty';
  if (item.kind === 'execution' && item.reason === 'failed') return 'repeated_tool_failures';
  if (item.kind === 'outcome' && item.reason === 'missing_outcome_assurance') return 'missing_outcome_assurance';
}

export async function governanceInsights(runs: GovernanceRun[], filters: {
  from: number; to: number; agentId?: string; category?: FindingCategory;
}) {
  const inWindow = new Map<string, GovernanceEvidence>();
  for (const run of runs) for (const item of run.evidence) {
    const at = Date.parse(item.at);
    if (at >= filters.from && at <= filters.to && (!filters.agentId || item.agentId === filters.agentId)) {
      inWindow.set(item.id, item);
    }
  }
  const groups = new Map<string, {category: FindingCategory; items: GovernanceEvidence[]}>();
  for (const item of inWindow.values()) {
    const category = classify(item);
    if (!category || (filters.category && category !== filters.category)) continue;
    const key = JSON.stringify([item.workspace, item.path, item.agentId, item.policyVersion, item.agentPolicyVersion, item.tool, item.resource, category]);
    const group = groups.get(key) ?? {category, items: []};
    group.items.push(item);
    groups.set(key, group);
  }
  const window = {from: new Date(filters.from).toISOString(), to: new Date(filters.to).toISOString()};
  const qualifying = [...groups.entries()].filter(([, {category, items}]) => items.length >= RULES[category].minimum);
  // Rank before hashing or constructing the returned evidence, so even a
  // workspace with many distinct tools gets bounded analysis and output.
  qualifying.sort(([keyA, a], [keyB, b]) => SEVERITY[RULES[a.category].severity] - SEVERITY[RULES[b.category].severity] ||
    b.items.length - a.items.length || keyA.localeCompare(keyB));
  const findings = await Promise.all(qualifying.slice(0, MAX_FINDINGS).map(async ([key, {category, items}]): Promise<Finding> => {
    items.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
    const first = items[0], rule = RULES[category];
    const refund = category === 'approval_friction' && /(^|[._-])refund([._-]|$)/i.test(first.tool ?? '');
    return {
      id: await actionDigest(['agentaction.policy-lab.finding.v1', key]), category,
      severity: rule.severity, path: first.path, agentId: first.agentId,
      jobIds: [...new Set(items.map(item => item.jobId))].sort(), tool: first.tool, resource: first.resource,
      policyVersion: first.policyVersion, agentPolicyVersion: first.agentPolicyVersion,
      frequency: items.length, window, evidence: items.slice(0, 8), confidence: rule.confidence,
      limitations: [rule.limitation, 'Counts reflect retained observations in the selected window.'],
      hypothesis: rule.hypothesis,
      recommendation: refund ? {kind: 'governance', action: 'Consider a future automatic-approval rule for refunds below $25 only after the runtime can enforce amount and currency, eligible customer and job, exact arguments, provider-backed duplicate protection and a monetary budget. The observed approvals do not establish the refund amounts.'} : rule.recommendation,
      review: 'open',
    };
  }));
  const items = [...inWindow.values()];
  const qualifiedJobs = new Set(items.filter(item => item.kind === 'proposal' || item.kind === 'claim').map(item => item.jobId)).size;
  const claims = items.filter(item => item.kind === 'claim');
  return {
    findings, findingsTruncated: qualifying.length > MAX_FINDINGS,
    metrics: {
      observedDecisions: items.filter(item => item.decision).length,
      replayEligibleClaims: claims.filter(item => item.coverage === 'claim_inputs').length,
      claims: claims.length,
      qualifiedJobs,
      approvedCallsPerJob: qualifiedJobs ? claims.length / qualifiedJobs : null,
      deniedAttempts: items.filter(item => item.kind === 'rejection').length,
      uncertainExecutions: items.filter(item => classify(item) === 'execution_uncertainty').length,
      jobsMissingAssurance: items.filter(item => classify(item) === 'missing_outcome_assurance').length,
      jobsAtRejectionLimit: runs.filter(run => run.rejectionLimitReached && run.evidence.some(item => inWindow.has(item.id))).length,
    },
  };
}
