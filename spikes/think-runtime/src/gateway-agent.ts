/**
 * Issue 446: the hosted Think agent gets the same gateway decision, approval evidence,
 * signed receipt and execution result that an external adapter gets.
 *
 * The gateway calls follow `integrations/refund-reference/src/worker.ts`, the in-repo reference
 * for a gateway-integrated provider call:
 *
 *   proposal  -> preflight /authorize (unapproved, ungranted; only approval/JIT findings may remain)
 *             -> /approval-requests, bound to the supervisor digest through `call_fingerprint`
 *             -> supervisor proposal, Think parks the call
 *   approval  -> /approval-requests/<id>/approve (decided_by = operator) -> Think resumes
 *   dispatch  -> supervisor claim -> /jit-grants -> /authorize (consumes the grant, signs a receipt)
 *             -> provider -> /execution-results
 *
 * The gateway Worker module runs in-process, as the refund reference does. In the console it would
 * be the existing `AGENTID_GATEWAY` service binding with the internal service token.
 */
import gateway from '../../../cloudflare/src/worker.ts';
import { RuntimeError } from '../../../console/src/mcp-client.ts';
import { SupervisedAgent, type Link, type McpTool } from './supervised-agent.ts';

type Json = Record<string, any>;
type GatewayReply = { status: number; body: Json };
type Execution = { event: Json; receipt?: Json };
/** `grant-error` fails only `/jit-grants`, i.e. the gateway goes down after the operator approved. */
type Fault = 'none' | 'error' | 'timeout' | 'grant-error';

export const TENANT = 'spike-workspace';
const GATEWAY_TIMEOUT_MS = 2000;
const gatewayTool = (tool: McpTool) => `provider.${tool.name}`;
/** Per-approval records in Durable Object storage. */
const key = {
  event: (approvalId: string) => `gateway-event:${approvalId}`,
  execution: (approvalId: string) => `gateway-execution:${approvalId}`,
  result: (approvalId: string) => `gateway-result:${approvalId}`,
  gap: (approvalId: string) => `gateway-gap:${approvalId}`,
};
const withApproval = (event: Json, approvalId: string, extra: Json = {}): Json => ({ ...event, approval_id: approvalId, ...extra });
const refusal = (reply: GatewayReply) => reply.body.error || reply.status;

export class GatewayAgent extends SupervisedAgent {
  getSystemPrompt() {
    return 'Spike gateway agent.';
  }

  /**
   * The manifest the gateway evaluates, derived from the connected MCP catalog. The gateway holds
   * one manifest per tenant with a single `agent.id`, so each hosted agent needs its own tenant.
   */
  private async manifest(): Promise<Json> {
    const blocked = (await this.ctx.storage.get<string[]>('gateway-block-tools')) || [];
    const { limits } = await this.policy();
    return {
      agent: { id: this.name },
      jit_authorization: { enabled: true, default_ttl_seconds: 300, revoke_after_use: true },
      tools: (await this.liveTools()).map(tool => ({
        name: gatewayTool(tool),
        access: 'write', // MCP tools carry no trustworthy read/write marking, so all are treated as writes.
        auth_mode: 'just_in_time',
        approval: blocked.includes(tool.name) ? 'block' : 'human_confirm',
        constraints: { approval_ttl_seconds: Math.ceil(limits.approvalTtlMs / 1000), token_ttl_seconds: 300 },
      })),
    };
  }

  private async gateway(path: string, body?: unknown, method = 'POST'): Promise<GatewayReply> {
    const fault = (await this.ctx.storage.get<Fault>('gateway-fault')) || 'none';
    const manifest = await this.manifest();
    const env = this.env as unknown as { GATEWAY_STATE: unknown; RECEIPT_JWK: string };
    const tasks: Promise<unknown>[] = [];
    const call = async (): Promise<GatewayReply> => {
      if (fault === 'error' || (fault === 'grant-error' && path === '/jit-grants')) throw new Error('Synthetic gateway outage');
      if (fault === 'timeout') return new Promise<never>(() => {});
      const response = await gateway.fetch(
        new Request(`https://gateway.internal/tenants/${TENANT}${path}`, {
          method,
          headers: { 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        {
          JIT_GRANTS: env.GATEWAY_STATE,
          AGENTID_MANIFESTS: { get: async () => JSON.stringify(manifest), put: async () => { throw new Error('read-only manifest'); } },
          AGENTID_RECEIPT_PRIVATE_JWK: env.RECEIPT_JWK,
        } as never,
        { waitUntil: (task: Promise<unknown>) => void tasks.push(task), passThroughOnException() {} } as never,
      );
      await Promise.all(tasks);
      return { status: response.status, body: (await response.json()) as Json };
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Gateway timed out')), GATEWAY_TIMEOUT_MS); });
    try {
      return await Promise.race([call(), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** The gateway's view of one call. `call_fingerprint` is part of the approval request digest. */
  private event(tool: McpTool, approvalId: string, bindingDigest: string): Json {
    return {
      agent_id: this.name,
      tool: gatewayTool(tool),
      action: 'write',
      resource: `mcp/${tool.serverId}/${tool.name}`,
      requested_by: `agent:${this.name}`,
      user_id: `agent:${this.name}`,
      reason: 'Proposed by the hosted agent',
      job_id: `hosted-${this.name}`,
      idempotency_key: approvalId,
      call_fingerprint: bindingDigest,
    };
  }

  protected async admit(tool: McpTool, input: unknown, approvalId: string, bindingDigest: string): Promise<string | void> {
    const local = await super.admit(tool, input, approvalId, bindingDigest);
    if (local) return local;
    const event = this.event(tool, approvalId, bindingDigest);
    try {
      return await this.propose(event, approvalId);
    } catch (error) {
      return `Gateway unavailable, so the action was not proposed: ${(error as Error).message}.`;
    }
  }

  /** Preflight, then the approval request. Returns a denial reason, or nothing once the request is recorded. */
  private async propose(event: Json, approvalId: string): Promise<string | void> {
    const preflight = await this.gateway('/authorize', event);
    // Preflight is deliberately unapproved and ungranted. Only the missing approval and JIT findings may
    // remain (the same set the refund reference accepts); any other finding denies.
    const expected = new Set([
      'missing jit_grant_id',
      'event[0]: JIT grant is marked invalid',
      `event[0]: ${event.tool} requires approval but event is not approved`,
      `event[0]: ${event.tool} requires JIT authorization but no jit_grant_id is present`,
    ]);
    const findings: string[] = preflight.body.findings || [];
    if (preflight.status >= 500 || preflight.body.allow || !findings.length || !findings.every(f => expected.has(f))) {
      const reasons = findings.filter(f => !expected.has(f)).map(f => f.replace(/^event\[0\]: /, ''));
      return `Denied by policy, so this action will not run: ${reasons.join('; ') || `gateway status ${preflight.status}`}.`;
    }
    const created = await this.gateway('/approval-requests', withApproval(event, approvalId));
    if (created.status !== 201) return `Gateway refused the approval request: ${refusal(created)}`;
    await this.ctx.storage.put(key.event(approvalId), event);
  }

  protected async recordOperatorApproval(approvalId: string, actor: string): Promise<void> {
    const decided = await this.gateway(`/approval-requests/${encodeURIComponent(approvalId)}/approve`, { decided_by: actor, decision_reason: 'Approved in the console' });
    if (decided.status !== 200) throw new RuntimeError(`Gateway refused the approval: ${refusal(decided)}`, 409);
  }

  protected async beforeProvider(link: Link): Promise<void> {
    const event = await this.ctx.storage.get<Json>(key.event(link.approvalId));
    if (!event) throw new RuntimeError('No gateway approval request is recorded for this action.', 409);
    const grant = await this.gateway('/jit-grants', withApproval(event, link.approvalId));
    if (grant.status !== 201) throw new RuntimeError(`Gateway refused the grant: ${refusal(grant)}`, 403);
    const decision = await this.gateway('/authorize', withApproval(event, link.approvalId, { jit_grant_id: grant.body.jit_grant_id, approved: true }));
    if (!decision.body.allow) throw new RuntimeError(`Gateway denied dispatch: ${(decision.body.findings || []).join('; ')}`, 403);
    const execution: Execution = { event: decision.body.event, receipt: decision.body.authorization_receipt };
    await this.ctx.storage.put(key.execution(link.approvalId), execution);
  }

  protected async afterProvider(link: Link, outcome: 'succeeded' | 'failed' | 'uncertain', content: unknown): Promise<void> {
    const execution = await this.ctx.storage.get<Execution>(key.execution(link.approvalId));
    if (!execution) return;
    // The gateway records results only; it has no state for "the provider may or may not have acted".
    if (outcome === 'uncertain') {
      await this.ctx.storage.put(key.gap(link.approvalId), 'uncertain outcome has no gateway representation');
      return;
    }
    try {
      const recorded = await this.gateway('/execution-results', { ...execution.event, result: { outcome, content } });
      await this.ctx.storage.put(key.result(link.approvalId), recorded);
    } catch (error) {
      await this.ctx.storage.put(key.gap(link.approvalId), `execution result not recorded: ${(error as Error).message}`);
    }
  }

  // ---- Host API for checks. ----

  async setGatewayFault(fault: Fault) {
    await this.ctx.storage.put('gateway-fault', fault);
  }
  async setGatewayBlockTools(tools: string[]) {
    await this.ctx.storage.put('gateway-block-tools', tools);
  }
  async gatewayCall(path: string, body?: unknown, method = 'POST') {
    return this.gateway(path, body, method);
  }
  async gatewayReport(approvalId: string) {
    const audit = await this.gateway(`/audit/events?approval_id=${encodeURIComponent(approvalId)}&limit=50`, undefined, 'GET');
    return {
      event: (await this.ctx.storage.get<Json>(key.event(approvalId))) || null,
      execution: (await this.ctx.storage.get<Execution>(key.execution(approvalId))) || null,
      result: (await this.ctx.storage.get<GatewayReply>(key.result(approvalId))) || null,
      gap: (await this.ctx.storage.get<string>(key.gap(approvalId))) || null,
      audit: (audit.body.events || []) as Json[],
    };
  }
}
