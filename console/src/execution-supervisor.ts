import { canonical } from './recipe-evaluation.ts';
import { RuntimeError } from './mcp-client.ts';

export type SupervisorLimits = {
  maxCalls: number;
  approvalTtlMs: number;
  executionTimeoutMs: number;
  recoveryPolicy: 'review' | 'reconcile';
};
export type SupervisorPolicy = { version: number; limits: SupervisorLimits };
export const DEFAULT_SUPERVISOR_LIMITS: SupervisorLimits = {
  maxCalls: 4, approvalTtlMs: 86400000, executionTimeoutMs: 60000, recoveryPolicy: 'review',
};
export type ActionState = 'awaiting_approval' | 'dispatch_claimed' | 'succeeded' | 'failed' | 'uncertain' | 'cancelled';
export type SupervisedAction = {
  id: string; approvalId: string; bindingDigest: string; state: ActionState;
  createdAt: string; expiresAt: string; approvedBy?: string; claimedAt?: string;
};
export type SupervisorRecord = {
  schemaVersion: 'agentaction.execution-supervisor.v1'; policyVersion: number; limits: SupervisorLimits;
  actions: SupervisedAction[];
  journal: Array<{ sequence: number; actionId: string; state: ActionState; at: string; reason?: 'restart' | 'revision' | 'cancellation' | 'provider_reconciliation' | 'persistence_failure' }>;
};

/** Child limits can only tighten the parent. Recovery capabilities are supplied by trusted code. */
export function supervisorLimits(value: unknown, parent = DEFAULT_SUPERVISOR_LIMITS, reconciliationAvailable = false): SupervisorLimits {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RuntimeError('Supervisor limits must be an object.');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !Object.hasOwn(DEFAULT_SUPERVISOR_LIMITS, key))) throw new RuntimeError('Unknown supervisor setting.');
  const limits = { ...parent, ...input } as SupervisorLimits;
  for (const key of ['maxCalls', 'approvalTtlMs', 'executionTimeoutMs'] as const) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > parent[key]) throw new RuntimeError(`Supervisor ${key} must be a positive integer within the parent limit.`);
  }
  if (!['review', 'reconcile'].includes(limits.recoveryPolicy) || (limits.recoveryPolicy === 'reconcile' && (!reconciliationAvailable || parent.recoveryPolicy !== 'reconcile'))) throw new RuntimeError('Provider reconciliation is unavailable for this runtime; use review.');
  return limits;
}
export function supervisorRecord(policy: SupervisorPolicy, limits: SupervisorLimits): SupervisorRecord {
  return { schemaVersion: 'agentaction.execution-supervisor.v1', policyVersion: policy.version, limits: structuredClone(limits), actions: [], journal: [] };
}
export async function actionDigest(binding: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(binding)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
function record(state: SupervisorRecord, action: SupervisedAction, reason?: SupervisorRecord['journal'][number]['reason'], at = Date.now()): void {
  // Reserve room for claim, completion and recovery before accepting a proposal.
  if (state.journal.length >= 128) throw new RuntimeError('Supervisor journal exhausted; start a new run.', 409);
  state.journal.push({ sequence: state.journal.length + 1, actionId: action.id, state: action.state, at: new Date(at).toISOString(), ...(reason ? { reason } : {}) });
}
export function proposeAction(state: SupervisorRecord, approvalId: string, bindingDigest: string, at = Date.now()): SupervisedAction {
  if (state.journal.length > 120 || state.actions.length >= 24) throw new RuntimeError('Supervisor proposal limit reached; start a new run.', 409);
  if (state.actions.some(a => a.state === 'dispatch_claimed' || a.state === 'uncertain')) throw new RuntimeError('An unresolved action requires provider review.', 409);
  for (const action of state.actions) if (action.state === 'awaiting_approval') { action.state = 'cancelled'; record(state, action, 'revision', at); }
  const action: SupervisedAction = { id: crypto.randomUUID(), approvalId, bindingDigest, state: 'awaiting_approval', createdAt: new Date(at).toISOString(), expiresAt: new Date(at + state.limits.approvalTtlMs).toISOString() };
  state.actions.push(action); record(state, action, undefined, at); return action;
}
/** Call only inside the host's durable transaction, with the current policy and binding. */
export function claimAction(state: SupervisorRecord, approvalId: string, bindingDigest: string, policyVersion: number, actor: string, at = Date.now()): SupervisedAction {
  const action = state.actions.find(a => a.approvalId === approvalId);
  if (!action || action.state !== 'awaiting_approval') throw new RuntimeError('This action approval has already been consumed or invalidated.', 409);
  if (state.policyVersion !== policyVersion || action.bindingDigest !== bindingDigest) throw new RuntimeError('The approved action or supervisor policy changed. Cancel and review a fresh trial.', 409);
  if (at >= Date.parse(action.expiresAt)) throw new RuntimeError('This action approval expired. Cancel and review a fresh trial.', 409);
  if (state.actions.filter(a => a.claimedAt).length >= state.limits.maxCalls) throw new RuntimeError('Supervisor call budget exhausted.', 409);
  action.state = 'dispatch_claimed'; action.approvedBy = actor; action.claimedAt = new Date(at).toISOString(); record(state, action, undefined, at); return action;
}
export function settleAction(state: SupervisorRecord, actionId: string, result: 'succeeded' | 'failed' | 'uncertain'): void {
  const action = state.actions.find(a => a.id === actionId);
  if (!action || action.state !== 'dispatch_claimed') throw new RuntimeError('Action is no longer eligible for completion.', 409);
  action.state = result; record(state, action);
}
export function recoverActions(state: SupervisorRecord, reason: 'restart' | 'persistence_failure' = 'restart'): boolean {
  let changed = false;
  for (const action of state.actions) if (action.state === 'dispatch_claimed') { action.state = 'uncertain'; record(state, action, reason); changed = true; }
  return changed;
}
export function cancelActions(state: SupervisorRecord): void {
  for (const action of state.actions) if (action.state === 'awaiting_approval') { action.state = 'cancelled'; record(state, action, 'cancellation'); }
}
/** A trusted provider adapter may verify a prior effect; reconciliation never dispatches it. */
export async function reconcileAction(state: SupervisorRecord, actionId: string, verify: (action: Readonly<SupervisedAction>) => Promise<'succeeded' | 'failed' | 'uncertain'>): Promise<void> {
  const action = state.actions.find(a => a.id === actionId);
  if (state.limits.recoveryPolicy !== 'reconcile' || !action || action.state !== 'uncertain') throw new RuntimeError('Provider reconciliation is not available for this action.', 409);
  const result = await verify(Object.freeze(structuredClone(action)));
  if (!['succeeded', 'failed', 'uncertain'].includes(result)) throw new RuntimeError('Invalid provider reconciliation result.', 409);
  if (result !== 'uncertain') { action.state = result; record(state, action, 'provider_reconciliation'); }
}
