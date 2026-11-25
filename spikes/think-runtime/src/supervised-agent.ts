/**
 * Questions 2 and 3 of issue 435: can the existing execution supervisor keep
 * its guarantees when Cloudflare Think owns the agent loop?
 *
 * Think supplies the loop, MCP transport, durable approval pause and transcript
 * continuation. `console/src/execution-supervisor.ts` stays the authority and
 * is imported unchanged:
 *
 *   model proposes -> authorizeAction (policy + proposeAction, persisted)
 *     -> Think parks the call (durable-pause)
 *     -> operatorApprove (actor recorded) -> Think resumes `execute`
 *     -> claimAction inside one storage transaction -> provider I/O -> settle
 */
import { action, type Action, type ActionAuthorizationContext, type ActionAuthorizationDecision, type ActionContext, type ToolCallContext, type ToolCallDecision, type TurnConfig } from '@cloudflare/think';
import { jsonSchema } from 'ai';
import {
  DEFAULT_SUPERVISOR_LIMITS, actionDigest, cancelActions, claimAction, proposeAction, recoverActions, settleAction, supervisorLimits, supervisorRecord,
  type SupervisorPolicy, type SupervisorRecord,
} from '../../../console/src/execution-supervisor.ts';
import { RuntimeError } from '../../../console/src/mcp-client.ts';
import { SpikeAgent } from './spike-agent.ts';

export type McpTool = { serverId: string; name: string; description?: string; inputSchema: Record<string, unknown> };
export type Link = { approvalId: string; actionId: string; tool: string };
type OperatorApproval = { actor: string; at: string };

const SUPERVISOR = 'supervisor';
const POLICY = 'supervisor-policy';

export class SupervisedAgent extends SpikeAgent {
  // MCP tools are exposed only as supervised actions, never as plain tools.
  includeMcpTools = false;
  // A dispatch interrupted by process death is never re-run by Think's ledger.
  actionLedgerPendingRetryLeaseMs = false as const;

  getSystemPrompt() {
    return 'Spike supervised agent.';
  }

  /** Think offers workspace file tools by default; the model sees supervised actions only. */
  async beforeTurn(): Promise<TurnConfig> {
    return { activeTools: Object.keys(await this.getActions()) };
  }
  /** Default deny for anything that is not a supervised action, offered or not. */
  async beforeToolCall(ctx: ToolCallContext): Promise<ToolCallDecision | void> {
    const supervised = (await this.liveTools()).some(tool => tool.name === ctx.toolName);
    const seen = (await this.ctx.storage.get<string[]>('hook-seen')) || [];
    await this.ctx.storage.put('hook-seen', [...seen, `${ctx.toolName}:${supervised ? 'supervised' : 'blocked'}`]);
    if (!supervised) return { action: 'block', reason: 'Only supervised actions may run.' };
  }

  async onStart(): Promise<void> {
    await super.onStart();
    // A claim that was durable before a restart has an unknown provider outcome.
    const state = await this.ctx.storage.get<SupervisorRecord>(SUPERVISOR);
    if (state && recoverActions(state, 'restart')) await this.ctx.storage.put(SUPERVISOR, state);
  }

  protected async liveTools(): Promise<McpTool[]> {
    await this.mcp.waitForConnections({ timeout: 10000 });
    return this.mcp.listTools() as unknown as McpTool[];
  }
  protected async policy(): Promise<SupervisorPolicy> {
    return (await this.ctx.storage.get<SupervisorPolicy>(POLICY)) || { version: 0, limits: { ...DEFAULT_SUPERVISOR_LIMITS } };
  }
  private digest(tool: McpTool, input: unknown, policy: SupervisorPolicy): Promise<string> {
    return actionDigest({
      agent: this.name,
      tool: { name: tool.name, description: tool.description, inputSchema: tool.inputSchema },
      arguments: input, policyVersion: policy.version, limits: policy.limits,
    });
  }

  async getActions(): Promise<Record<string, Action>> {
    const limits = (await this.policy()).limits;
    return Object.fromEntries((await this.liveTools()).map(tool => [tool.name, action({
      description: tool.description || tool.name,
      inputSchema: jsonSchema(tool.inputSchema as never),
      kind: 'durable-pause',
      approval: true,
      approvalSummary: `Call ${tool.name}`,
      timeoutMs: limits.executionTimeoutMs,
      execute: (input: unknown, ctx: ActionContext) => this.dispatch(tool.name, input, ctx),
    })]));
  }

  // ---- Extension points. The supervisor's own checks always run; these add a policy and evidence source. ----

  /** Admission at proposal time. Return a reason to deny; the call is then never proposed or parked. */
  protected async admit(tool: McpTool, _input: unknown, _approvalId: string, _bindingDigest: string): Promise<string | void> {
    const denied = (await this.ctx.storage.get<string[]>('deny-tools')) || [];
    if (denied.includes(tool.name)) return 'Denied by workspace policy.';
  }
  /** Runs when the operator approves, before anything is recorded locally. Throw to refuse the approval. */
  protected async recordOperatorApproval(_approvalId: string, _actor: string): Promise<void> {}
  /** Runs after the claim commits and before provider I/O. Throw to stop the dispatch; the action settles failed. */
  protected async beforeProvider(_link: Link): Promise<void> {}
  /** Runs after the outcome is settled. The provider has already acted, so this must not throw. */
  protected async afterProvider(_link: Link, _outcome: 'succeeded' | 'failed' | 'uncertain', _content: unknown): Promise<void> {}

  /** Policy decision point. Runs at pause time, before Think parks the call. */
  async authorizeAction(ctx: ActionAuthorizationContext): Promise<ActionAuthorizationDecision> {
    if (await this.ctx.storage.get<Link>(`call:${ctx.toolCallId}`)) return true; // already proposed
    const tool = (await this.liveTools()).find(t => t.name === ctx.action);
    if (!tool) return { allowed: false, reason: 'Tool is not in the connected catalog.' };
    const policy = await this.policy();
    const approvalId = crypto.randomUUID();
    const bindingDigest = await this.digest(tool, ctx.input, policy);
    const denial = await this.admit(tool, ctx.input, approvalId, bindingDigest);
    if (denial) {
      const denials = (await this.ctx.storage.get<string[]>('denials')) || [];
      await this.ctx.storage.put('denials', [...denials, `${tool.name}: ${denial}`]);
      return { allowed: false, reason: denial };
    }
    try {
      await this.ctx.storage.transaction(async tx => {
        const state = (await tx.get<SupervisorRecord>(SUPERVISOR)) || supervisorRecord(policy, policy.limits);
        const proposed = proposeAction(state, approvalId, bindingDigest);
        proposed.target = { tool: tool.name, resource: tool.serverId };
        const link: Link = { approvalId, actionId: proposed.id, tool: tool.name };
        await tx.put(SUPERVISOR, state);
        await tx.put(`call:${ctx.toolCallId}`, link);
        await tx.put(`approval:${approvalId}`, ctx.toolCallId);
      });
    } catch (error) {
      if (error instanceof RuntimeError) return { allowed: false, reason: error.message };
      throw error;
    }
    return true;
  }

  /** The only path that reaches the provider. Think calls it after approval. */
  private async dispatch(toolName: string, input: unknown, ctx: ActionContext): Promise<unknown> {
    const link = await this.ctx.storage.get<Link>(`call:${ctx.toolCallId}`);
    if (!link) throw new RuntimeError('This call was never proposed to the supervisor.', 409);
    const tool = (await this.liveTools()).find(t => t.name === toolName);
    if (!tool) throw new RuntimeError('Tool is no longer in the connected catalog.', 409);
    const policy = await this.policy();
    const bindingDigest = await this.digest(tool, input, policy);
    // Approval consumption and the dispatch claim commit together, before any provider I/O.
    try {
      await this.ctx.storage.transaction(async tx => {
        const state = await tx.get<SupervisorRecord>(SUPERVISOR);
        const operator = await tx.get<OperatorApproval>(`operator-approval:${link.approvalId}`);
        if (!state || !operator) throw new RuntimeError('No operator approval is recorded for this action.', 403);
        claimAction(state, link.approvalId, bindingDigest, policy.version, operator.actor);
        await tx.put(SUPERVISOR, state);
      });
    } catch (error) {
      // Think has already consumed its pause, so a denied claim can never be approved again.
      await this.ctx.storage.transaction(async tx => {
        const state = await tx.get<SupervisorRecord>(SUPERVISOR);
        if (state) { cancelActions(state); await tx.put(SUPERVISOR, state); }
      });
      throw error;
    }
    try {
      await this.beforeProvider(link);
    } catch (error) {
      // The provider was never contacted, so the outcome is known: nothing happened.
      await this.settle(link, 'failed');
      throw error;
    }
    let outcome: 'succeeded' | 'failed' | 'uncertain' = 'uncertain';
    let content: unknown;
    try {
      const result = await this.mcp.callTool({ serverId: tool.serverId, name: tool.name, arguments: input as Record<string, unknown> }) as { isError?: boolean; content?: unknown };
      outcome = result.isError ? 'failed' : 'succeeded';
      content = result.content;
      return content;
    } finally {
      // A transport failure after the claim cannot prove the provider did not act.
      await this.settle(link, outcome);
      await this.afterProvider(link, outcome, content);
    }
  }

  private async settle(link: Link, outcome: 'succeeded' | 'failed' | 'uncertain') {
    await this.ctx.storage.transaction(async tx => {
      const state = (await tx.get<SupervisorRecord>(SUPERVISOR))!;
      settleAction(state, link.actionId, outcome);
      await tx.put(SUPERVISOR, state);
    });
  }

  // ---- Host API. In production these sit behind verified workspace membership. ----

  async operatorApprove(approvalId: string, actor: string) {
    const toolCallId = await this.ctx.storage.get<string>(`approval:${approvalId}`);
    const parked = toolCallId && (await this.pendingApprovals()).find(p => p.descriptor.toolCallId === toolCallId);
    if (!parked) throw new RuntimeError('This action approval has already been consumed or invalidated.', 409);
    await this.recordOperatorApproval(approvalId, actor);
    const approval: OperatorApproval = { actor, at: new Date().toISOString() };
    await this.ctx.storage.put(`operator-approval:${approvalId}`, approval);
    return this.approveExecution(parked.executionId);
  }
  /** Think's own approval entry point, which the docs mark client-callable. */
  async thinkApproveDirectly() {
    const [parked] = await this.pendingApprovals();
    return parked ? this.approveExecution(parked.executionId) : { status: 'none' };
  }
  async setPolicy(limits: Record<string, unknown>) {
    const current = await this.policy();
    const next = { version: current.version + 1, limits: supervisorLimits({ ...current.limits, ...limits }) };
    await this.ctx.storage.put(POLICY, next);
    return next;
  }
  async setDenyTools(tools: string[]) {
    await this.ctx.storage.put('deny-tools', tools);
  }
  async report() {
    return {
      offeredTools: (await this.ctx.storage.get<string[]>('offered-tools')) || [],
      hookSeen: (await this.ctx.storage.get<string[]>('hook-seen')) || [],
      denials: (await this.ctx.storage.get<string[]>('denials')) || [],
      supervisor: (await this.ctx.storage.get<SupervisorRecord>(SUPERVISOR)) || null,
      pending: (await this.pendingApprovals()).map(p => ({ executionId: p.executionId, toolCallId: p.descriptor.toolCallId, action: p.descriptor.action, input: p.descriptor.input })),
    };
  }
}
