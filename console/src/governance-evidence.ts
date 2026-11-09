import type { Run, RuntimeStorage } from './agent-runtime.ts';
import type { ClaimDecisionInput } from './execution-supervisor.ts';

type RejectionReason = 'tool_out_of_scope' | 'call_budget_exhausted' | 'invalid_arguments';
export type GovernanceRejection = {
  version: 1;
  at: string;
  reason: RejectionReason;
  tool?: string;
};
const MAX_REJECTIONS = 16;
const MAX_RUNS = 80;

export function recordGovernanceRejection(run: Run, reason: RejectionReason, tool?: string): boolean {
  if (!run.supervisor || (run.governanceRejections?.length ?? 0) >= MAX_REJECTIONS) return false;
  const rejection: GovernanceRejection = {version: 1, at: new Date().toISOString(), reason, ...(tool ? {tool} : {})};
  const rejections = [...(run.governanceRejections ?? []), rejection];
  // Leave room for subsequent approval, claim and completion evidence. A
  // rejection never displaces the execution fence or existing evidence.
  if (new TextEncoder().encode(JSON.stringify({...run, governanceRejections: rejections})).byteLength > 100_000) return false;
  run.governanceRejections = rejections;
  return true;
}

export type GovernanceEvidence = {
  schemaVersion: 'agentaction.governance-decision.v1';
  id: string;
  workspace: string;
  path: 'hosted' | 'hermes';
  agentId: string;
  jobId: string;
  actionId?: string;
  tool?: string;
  resource?: string;
  at: string;
  policyVersion: number;
  agentPolicyVersion?: number;
  maxCalls: number;
  kind: 'proposal' | 'claim' | 'rejection' | 'execution' | 'outcome';
  decision?: 'allow' | 'deny' | 'challenge';
  reason: string;
  approvalId?: string;
  approvalExpired?: boolean;
  executionRef?: string;
  outcomeRef?: string;
  trust: 'runtime_recorded' | 'adapter_reported' | 'provider_reported' | 'ai_assessed';
  coverage: 'claim_inputs' | 'partial' | 'observation';
};

type ClaimEvidence = {
  evidence: GovernanceEvidence;
  sequence: number;
  input?: ClaimDecisionInput;
};
export type GovernanceRun = {
  evidence: GovernanceEvidence[];
  claims: ClaimEvidence[];
  rejectionLimitReached: boolean;
};

export function projectGovernanceRun(workspace: string, run: Run, now: number): GovernanceRun | undefined {
  const state = run.supervisor;
  if (!state || run.research || state.schemaVersion !== 'agentaction.execution-supervisor.v1') return;
  const path = run.external ? 'hermes' : 'hosted';
  const base = {
    schemaVersion: 'agentaction.governance-decision.v1' as const, workspace, path,
    agentId: run.agentId, jobId: run.id, policyVersion: state.policyVersion,
    agentPolicyVersion: state.agentPolicyVersion, maxCalls: state.limits.maxCalls,
  };
  const evidence: GovernanceEvidence[] = [], claims: ClaimEvidence[] = [];
  const actions = new Map(state.actions.map(action => [action.id, action]));
  const events = new Map(run.events.map(event => [event.actionId, event]));
  const proposals = new Map(Object.values(run.external?.proposals ?? {}).map(proposal => [proposal.approvalId, proposal]));
  const history = new Map<string, {state: string; at: string}>();
  let journalComplete = true;
  let priorClaims = 0;

  for (const [index, entry] of state.journal.entries()) {
    const action = actions.get(entry.actionId), event = events.get(entry.actionId);
    const prior = history.get(entry.actionId);
    const at = Date.parse(entry.at);
    const ordered = entry.sequence === index + 1 && Number.isFinite(at) && at <= now &&
      (!prior || at >= Date.parse(prior.at));
    journalComplete &&= ordered && Boolean(action);
    history.set(entry.actionId, {state: entry.state, at: entry.at});
    if (!action) {
      if (entry.state === 'dispatch_claimed') priorClaims++;
      continue;
    }
    const target = action.target;
    const common = {
      ...base, id: `${run.id}:journal:${entry.sequence}`, at: entry.at, actionId: action.id,
      tool: target?.tool ?? event?.tool ?? proposals.get(action.approvalId)?.tool ??
        (run.pending?.id === action.approvalId ? run.pending.tool : undefined),
      resource: target?.resource ?? event?.source?.connectionId, approvalId: action.approvalId,
    };
    if (entry.state === 'awaiting_approval') {
      evidence.push({...common, kind: 'proposal', decision: 'challenge', reason: 'operator_approval_required', approvalExpired: now >= Date.parse(action.expiresAt) && action.state === 'awaiting_approval', trust: 'runtime_recorded', coverage: 'partial'});
    } else if (entry.state === 'dispatch_claimed') {
      const expiresAt = Date.parse(action.expiresAt);
      const complete = journalComplete && entry.claimDecision?.version === 1 &&
        entry.claimDecision.policyVersion === state.policyVersion &&
        prior?.state === 'awaiting_approval' && prior.at === action.createdAt &&
        action.claimedAt === entry.at && Boolean(action.bindingDigest && action.approvedBy) &&
        event?.approval?.id === action.approvalId && event.approval.actor === action.approvedBy &&
        Number.isSafeInteger(state.limits.maxCalls) && state.limits.maxCalls > 0 &&
        Number.isFinite(expiresAt) && expiresAt > Date.parse(action.createdAt);
      const input = complete ? {
        approvalPending: true, bindingMatches: true, policyMatches: true,
        expiresAt, at, priorClaims, maxCalls: state.limits.maxCalls,
      } : undefined;
      const item: GovernanceEvidence = {...common, kind: 'claim', decision: 'allow', reason: 'exact_approval',
        executionRef: `${run.id}:action:${action.id}`, trust: 'runtime_recorded', coverage: input ? 'claim_inputs' : 'partial'};
      evidence.push(item);
      claims.push({evidence: item, sequence: entry.sequence, input});
      priorClaims++;
    } else if (['failed', 'succeeded', 'uncertain'].includes(entry.state)) {
      evidence.push({...common, kind: 'execution', reason: entry.reason === 'provider_reconciliation' ? 'provider_reconciliation' : entry.state,
        executionRef: `${run.id}:action:${action.id}`,
        trust: entry.reason === 'provider_reconciliation' ? 'provider_reported' : path === 'hermes' && entry.state === 'succeeded' ? 'adapter_reported' : 'runtime_recorded',
        coverage: 'observation'});
    }
  }

  // A latest durable claim with no settlement is an unresolved dispatch, even
  // when the external adapter has yet to report a timeout.
  for (const {evidence: claim} of claims) if (history.get(claim.actionId!)?.state === 'dispatch_claimed') {
    evidence.push({...claim, id: `${claim.id}:unsettled`, kind: 'execution', decision: undefined,
      reason: now >= Date.parse(claim.at) + state.limits.executionTimeoutMs ? 'dispatch_overdue' : 'dispatch_in_flight', coverage: 'observation'});
  }
  const rejections = run.governanceRejections ?? [];
  for (const [index, item] of rejections.entries()) if (item.version === 1) {
    evidence.push({...base, id: `${run.id}:rejection:${index}`, kind: 'rejection', at: item.at, tool: item.tool,
      decision: 'deny', reason: item.reason, trust: 'runtime_recorded', coverage: 'partial'});
  }

  if (claims.length && ['completed', 'failed', 'interrupted', 'cancelled'].includes(run.status)) {
    const evaluation = run.evaluation;
    const independent = Boolean(evaluation?.criteria.length && evaluation.criteria.every(criterion => criterion.trust !== 'ai_assessed' && criterion.status !== 'insufficient_evidence'));
    evidence.push({...base, id: `${run.id}:outcome`, kind: 'outcome',
      at: run.finishedAt ?? state.journal.at(-1)?.at ?? run.startedAt,
      reason: !evaluation || evaluation.status === 'insufficient_evidence' || !independent ? 'missing_outcome_assurance' : evaluation.status,
      ...(evaluation ? {outcomeRef: evaluation.evidence_digest} : {}),
      trust: path === 'hermes' ? 'adapter_reported' : evaluation && !independent ? 'ai_assessed' : 'runtime_recorded', coverage: 'observation'});
  }
  return {evidence, claims, rejectionLimitReached: rejections.length >= MAX_REJECTIONS};
}

export async function readGovernance(storage: Pick<RuntimeStorage, 'list'>, workspace: string, now: number) {
  const runs = await storage.list<Run>({prefix: 'run:', limit: MAX_RUNS + 1});
  const projected = [...runs.values()].slice(0, MAX_RUNS).flatMap(run => {
    const result = projectGovernanceRun(workspace, run, now);
    return result ? [result] : [];
  });
  return {runs: projected, scannedRuns: Math.min(runs.size, MAX_RUNS), truncated: runs.size > MAX_RUNS};
}
