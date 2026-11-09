import { actionDigest, evaluateClaim, supervisorLimits, type ClaimDecisionInput } from './execution-supervisor.ts';
import type { GovernanceEvidence, GovernanceRun } from './governance-evidence.ts';
import type { Finding } from './governance-insights.ts';
import { RuntimeError } from './mcp-client.ts';

type Scope = {
  workspace: string;
  path: GovernanceEvidence['path'];
  agentId: string;
  policyVersion: number;
  agentPolicyVersion: number;
};
export type PolicyCandidate = {
  id: string;
  findingId: string;
  scope: Scope;
  current: { maxCalls: number[] };
  change: { maxCalls: number };
  benefit: string;
  risk: string;
  requirements: string;
};

const matches = (item: GovernanceEvidence, scope: Scope) =>
  item.workspace === scope.workspace && item.path === scope.path && item.agentId === scope.agentId && item.policyVersion === scope.policyVersion &&
  item.agentPolicyVersion === scope.agentPolicyVersion;

export async function proposePolicyCandidate(finding: Finding, runs: GovernanceRun[]): Promise<PolicyCandidate | undefined> {
  if (finding.category !== 'execution_uncertainty' || finding.agentPolicyVersion === undefined) return;
  const scope: Scope = {workspace: finding.workspace, path: finding.path, agentId: finding.agentId, policyVersion: finding.policyVersion,
    agentPolicyVersion: finding.agentPolicyVersion};
  const from = Date.parse(finding.window.from), to = Date.parse(finding.window.to);
  const caps = [...new Set(runs.flatMap(run => run.claims.filter(({evidence, input}) =>
    input && matches(evidence, scope) && Date.parse(evidence.at) >= from && Date.parse(evidence.at) <= to)
    .map(({input}) => input!.maxCalls)))].sort((a, b) => a - b);
  const highest = caps.at(-1);
  if (!highest || highest < 2) return;
  const change = {maxCalls: supervisorLimits({maxCalls: highest - 1}).maxCalls};
  return {
    id: await actionDigest(['agentaction.policy-lab.candidate.v1', finding.id, caps, change]), findingId: finding.id,
    scope, current: {maxCalls: caps}, change,
    benefit: 'Limit the number of tool dispatches a run can claim and reduce exposure to subsequent effects.',
    risk: 'A tighter cap adds no authority. It may block legitimate work and cannot resolve an uncertain effect.',
    requirements: 'Applies across all tools for this agent and these historical policy revisions. Replay requires retained, trusted claim inputs in journal order.',
  };
}

function negativeCases(input: ClaimDecisionInput, maxCalls: number) {
  const cases: Array<[string, Partial<ClaimDecisionInput>]> = [
    ['Approval unavailable or consumed', {approvalPending: false}],
    ['Changed exact action arguments', {bindingMatches: false}],
    ['Changed policy version', {policyMatches: false}],
    ['Expired approval', {at: input.expiresAt}],
    ['Exhausted candidate call budget', {priorClaims: maxCalls}],
  ];
  return cases.map(([name, overrides]) => ({name, ...evaluateClaim({...input, maxCalls, ...overrides})}));
}

export function replayPolicy(candidate: PolicyCandidate, runs: GovernanceRun[], window: {from: number; to: number}) {
  const cap = supervisorLimits(candidate.change).maxCalls;
  if (Object.keys(candidate.change).length !== 1 || !Object.hasOwn(candidate.change, 'maxCalls') ||
      cap >= Math.max(...candidate.current.maxCalls) || !candidate.current.maxCalls.length) {
    throw new RuntimeError('Choose a supported lower supervisor call cap.');
  }
  const observed = {allow: 0, deny: 0, challenge: 0};
  const original = {...observed}, proposed = {...observed};
  const changed: Array<{evidence: GovernanceEvidence; from: 'allow'; to: 'deny'; reason: string}> = [];
  const limits = {partialEvidence: 0, earlierDecisionInconclusive: 0, earlierDecisionChanged: 0, baselineMismatch: 0};
  const inWindow = (item: GovernanceEvidence) => {
    const at = Date.parse(item.at);
    return at >= window.from && at <= window.to;
  };
  let fixture: ClaimDecisionInput | undefined;
  for (const run of runs) {
    for (const item of run.evidence) if (item.decision && matches(item, candidate.scope) && inWindow(item)) {
      observed[item.decision]++;
      if (item.kind !== 'claim') limits.partialEvidence++;
    }
    let prefix: 'valid' | 'inconclusive' | 'changed' = 'valid';
    for (const {evidence, input} of [...run.claims].sort((a, b) => a.sequence - b.sequence)) {
      if (!matches(evidence, candidate.scope)) continue;
      const at = Date.parse(evidence.at);
      if (at > window.to) continue;
      const counted = inWindow(evidence);
      if (prefix !== 'valid') {
        if (counted) limits[prefix === 'changed' ? 'earlierDecisionChanged' : 'earlierDecisionInconclusive']++;
        continue;
      }
      if (!input || evidence.trust !== 'runtime_recorded' || evidence.coverage !== 'claim_inputs') {
        prefix = 'inconclusive';
        if (counted) limits.partialEvidence++;
        continue;
      }
      const baseline = evaluateClaim(input);
      if (baseline.decision !== evidence.decision || baseline.reason !== evidence.reason) {
        prefix = 'inconclusive';
        if (counted) limits.baselineMismatch++;
        continue;
      }
      const result = evaluateClaim({...input, maxCalls: Math.min(cap, input.maxCalls)});
      if (result.decision === 'deny') prefix = 'changed';
      if (!counted) continue;
      fixture ??= input;
      original.allow++;
      proposed[result.decision]++;
      if (result.decision === 'deny') changed.push({evidence, from: 'allow', to: 'deny', reason: result.reason});
    }
  }
  const eligible = original.allow;
  const inconclusive = Object.values(limits).reduce((a, b) => a + b, 0);
  return {
    candidate, observed, original, proposed, eligible, inconclusive, limits,
    newlyAllowed: 0, newlyDenied: changed.length, newlyChallenged: 0,
    changed: changed.slice(0, 80),
    approvedClaimsDelta: proposed.allow - original.allow,
    negativeCases: fixture ? negativeCases(fixture, Math.min(cap, fixture.maxCalls)) : [],
    approvalVolume: 'The cap affects claim eligibility. Future approval requests and operator workload cannot be estimated from these records.',
    limitations: [
      'Only claim decisions with reconstructable exact approval inputs are compared. Proposal challenges and recorded rejects remain visible as observations.',
      'Replay preserves tighter historical overrides. Later decisions after a changed or incomplete claim are inconclusive.',
      'Replay does not infer dispatch, provider effects or job success.',
    ],
  };
}
