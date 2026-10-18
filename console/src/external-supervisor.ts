import type { Agent, Run, RuntimeStorage } from './agent-runtime.ts';
import { DEFAULT_SUPERVISOR_LIMITS, actionDigest, supervisorLimits, supervisorRecord, proposeAction, claimAction, settleAction, cancelActions, recoverActions, type SupervisorPolicy } from './execution-supervisor.ts';
import { RuntimeError, object, textField } from './mcp-client.ts';

export type ExternalAgent = { framework: 'hermes'; revision: number };
export type ExternalRun = { sessionDigest: string; agentRevision: number; credentialRevision: number; approved?: { id: string; actor: string; at: string }; overrides?: unknown; proposals: Record<string, { approvalId: string; tool: string; arguments: Record<string, unknown> }> };
type Credential = { agentId: string; hash: string; revision: number; enabled: boolean };
const now = () => new Date().toISOString();
const runKey = (id: string) => `run:${id}`;
const policy = async (s: Pick<RuntimeStorage, 'get'>): Promise<SupervisorPolicy> => await s.get<SupervisorPolicy>('supervisor-policy') || {version: 0, limits: {...DEFAULT_SUPERVISOR_LIMITS}};
const blocked = (message: string): never => { throw new RuntimeError(message, 409); };
function exactNumbers(value: unknown): void {
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) throw new RuntimeError('External numeric arguments must be finite and within the JSON safe integer range; use strings for larger values.');
  if (value && typeof value === 'object') for (const item of Object.values(value)) exactNumbers(item);
}
const allowedTools = (input: unknown): string[] => {
  if (!Array.isArray(input) || !input.length || input.length > 20 || input.some(t => typeof t !== 'string' || !/^[a-zA-Z0-9_.-]{1,128}$/.test(t) || ['delegate_task','execute_code','tool_call'].includes(t))) throw new RuntimeError('Choose 1–20 exact Hermes tool names. Delegation, execute_code and tool_call are unsupported.');
  return [...new Set(input)];
};

/** External agents are cooperative, trusted dispatchers. Tokens may claim, never approve. */
export class ExternalSupervisor {
  private storage: RuntimeStorage;
  constructor(storage: RuntimeStorage) { this.storage = storage; }
  async owner(path: string, body: Record<string, unknown>, role: string, actor: string): Promise<unknown> {
    if (role !== 'owner') throw new RuntimeError('Only an owner can provision or revoke external agents.', 403);
    if (Object.keys(body).some(k => !(path === '/external-register' ? ['title','tools'] : ['agentId']).includes(k))) throw new RuntimeError('Unknown external agent setting.');
    let agent: Agent;
    if (path === '/external-register') {
      if ((await this.storage.list<Agent>({prefix:'agent:'})).size >= 40) blocked('Workspace agent limit reached.');
      agent = {id:crypto.randomUUID(),connectionId:'',title:textField(body.title,'Hermes agent name',100),goal:'Externally planned Hermes session with approval before every allowed tool.',setup:'Hermes plugin execution mode',success:'Adapter-reported tool completion; independent outcome verification unavailable.',tools:allowedTools(body.tools),status:'draft',createdAt:now(),external:{framework:'hermes',revision:1}};
    } else {
      agent = await this.agent(body.agentId);
      if (path === '/external-revoke' && !(await this.storage.get<Credential>(`external-credential:${agent.id}`))?.enabled) return {agentId:agent.id,revoked:true};
      agent.external!.revision++;
      if (agent.external!.revision > 100 && path !== '/external-revoke') blocked('External credential revision limit reached.');
    }
    const token = `aae_${crypto.randomUUID().replaceAll('-','')}${crypto.randomUUID().replaceAll('-','')}`;
    const credential: Credential = {agentId:agent.id,hash:await actionDigest(token),revision:agent.external!.revision,enabled:path !== '/external-revoke'};
    agent.status = credential.enabled ? 'draft' : 'paused';
    await this.storage.transaction(async tx => {
      await tx.put(`agent:${agent.id}`,agent);
      await tx.put(`external-credential:${agent.id}`,credential);
      await tx.put(`external-credential-audit:${agent.id}:${credential.revision}`,{revision:credential.revision,enabled:credential.enabled,actor,at:now()});
    });
    for (const run of (await this.storage.list<Run>({prefix:'run:'})).values()) if (run.agentId === agent.id && run.external && (run.pending || run.supervisor!.actions.some(a => a.state === 'dispatch_claimed'))) {
      cancelActions(run.supervisor!); delete run.pending; delete run.external.approved;
      if (recoverActions(run.supervisor!)) {
        run.status='interrupted'; run.outcome='uncertain';
        for (const event of run.events) if (event.status === 'executing') event.status='uncertain';
      }
      else run.status='cancelled';
      await this.storage.put(runKey(run.id),run);
    }
    return {agentId:agent.id,...(credential.enabled ? {token} : {revoked:true})};
  }
  private async agent(value: unknown, s: Pick<RuntimeStorage,'get'> = this.storage): Promise<Agent> {
    const id=textField(value,'external agent ID',128), agent=await s.get<Agent>(`agent:${id}`);
    if (!agent?.external) throw new RuntimeError('External agent not found.',404);
    return agent;
  }
  async request(path: string, body: Record<string,unknown>, bearer: string): Promise<unknown> {
    // Agent ID is public. Only a separate, opaque, hashed credential authorizes execution.
    const agent=await this.agent(body.agentId), credential=await this.storage.get<Credential>(`external-credential:${agent.id}`);
    if (!credential?.enabled || !bearer.startsWith('Bearer aae_') || await actionDigest(bearer.slice(7)) !== credential.hash) throw new RuntimeError('External execution credential required.',401);
    if (agent.status === 'paused') blocked('External agent is paused.');
    const fields: Record<string,string[]> = {start:['agentId','sessionId','supervisorLimits'],propose:['agentId','runId','tool','arguments'],claim:['agentId','runId','actionId','bindingDigest'],complete:['agentId','runId','actionId','status']};
    const action=path.slice('/external/'.length);
    if (!fields[action] || Object.keys(body).some(k => !fields[action].includes(k))) throw new RuntimeError('Invalid external supervisor request.');
    if (action === 'start') return this.start(agent,credential,body);
    const id=textField(body.runId,'run ID',128);
    return this.storage.transaction(async tx => {
      const current=await this.agent(agent.id,tx), live=await tx.get<Credential>(`external-credential:${agent.id}`);
      const run=await tx.get<Run>(runKey(id));
      if (!run?.external || !run.supervisor || run.agentId !== agent.id) throw new RuntimeError('External run not found.',404);
      if (!live?.enabled || live.hash !== credential.hash || current.status === 'paused') throw new RuntimeError('External credential revoked.',401);
      const p=await policy(tx);
      if (run.supervisor.policyVersion !== p.version || run.external.agentRevision !== (current.supervisorVersion || 0) || run.external.credentialRevision !== live.revision) blocked('External run policy changed. Review a new session.');
      // A deadline is a fence, not a claim that arbitrary remote tools can be killed.
      for (const a of run.supervisor.actions) if (a.state === 'dispatch_claimed' && Date.now() >= Date.parse(a.claimedAt!) + run.supervisor.limits.executionTimeoutMs) {
        settleAction(run.supervisor,a.id,'uncertain');
        const event=run.events.find(e => e.actionId === a.id); if (event) event.status='uncertain';
        run.status='interrupted';run.outcome='uncertain';
      }
      if (run.supervisor.actions.some(a => a.state === 'uncertain')) {
        await tx.put(runKey(id),run);
        return {blocked:true,reason:'Unknown or timed-out effect requires provider review.',runId:id};
      }
      if (['cancelled','interrupted','failed'].includes(run.status)) blocked('External run is closed.');
      let result: unknown;
      if (action === 'propose') {
        const tool=textField(body.tool,'tool name',128), args=object(body.arguments);
        exactNumbers(args);
        if (!current.tools.includes(tool)) throw new RuntimeError('Tool is outside the owner-approved allowlist.',403);
        if (new TextEncoder().encode(JSON.stringify(args)).byteLength > 8000) throw new RuntimeError('External tool arguments exceed the 8 KB approval limit.');
        // Tokens in arguments would disclose authority to readers of approval evidence.
        if (JSON.stringify(args).includes(bearer.slice(7))) throw new RuntimeError('Keep execution credentials out of tool arguments.');
        const fingerprint=await actionDigest({tool,arguments:args});
        const prior=run.external.proposals[fingerprint];
        if (prior) {
          const a=run.supervisor.actions.find(a => a.approvalId === prior.approvalId)!;
          result={runId:id,actionId:a.id,bindingDigest:a.bindingDigest,state:a.state,approved:run.external.approved?.id === a.approvalId};
        } else {
          if (run.supervisor.actions.filter(a => a.claimedAt).length >= run.supervisor.limits.maxCalls) blocked('Supervisor call budget exhausted.');
          const approvalId=crypto.randomUUID();
          const digest=await actionDigest({workspace:await tx.get('oauth-workspace'),runId:id,agentId:agent.id,agentRevision:run.external.agentRevision,credentialRevision:live.revision,tools:current.tools,tool,arguments:args,policyVersion:p.version,limits:run.supervisor.limits});
          const a=proposeAction(run.supervisor,approvalId,digest);
          run.external.proposals[fingerprint]={approvalId,tool,arguments:args}; delete run.external.approved;
          run.pending={id:approvalId,tool,arguments:args};run.status='awaiting_approval';
          result={runId:id,actionId:a.id,bindingDigest:digest,state:a.state,approved:false};
        }
      } else if (action === 'claim') {
        const a=run.supervisor.actions.find(a => a.id === body.actionId);
        if (!a || run.external.approved?.id !== a.approvalId || !run.pending || run.pending.id !== a.approvalId) blocked('Exact operator approval is required before claiming.');
        if (run.supervisor.actions.some(other => other.state === 'dispatch_claimed')) blocked('An external action is already in flight.');
        claimAction(run.supervisor,a.approvalId,String(body.bindingDigest),p.version,run.external.approved!.actor);
        run.events.push({actionId:a.id,tool:run.pending!.tool,arguments:run.pending!.arguments,status:'executing',approval:{id:a.approvalId,actor:run.external.approved!.actor,at:run.external.approved!.at}});
        delete run.pending; delete run.external.approved;run.status='executing';
        result={claimed:true,actionId:a.id,deadline:Date.parse(a.claimedAt!) + run.supervisor.limits.executionTimeoutMs};
      } else {
        if (!['succeeded','uncertain'].includes(String(body.status))) throw new RuntimeError('External completion must be succeeded or uncertain.');
        const a=run.supervisor.actions.find(a => a.id === body.actionId), event=run.events.find(e => e.actionId === body.actionId);
        if (!a || !event) blocked('External action not found.');
        settleAction(run.supervisor,a.id,body.status as 'succeeded'|'uncertain'); event.status=body.status as 'succeeded'|'uncertain';
        event.result='Adapter-reported completion. No independent provider verification or raw result retained.';
        run.status=body.status === 'succeeded' ? 'completed' : 'interrupted';
        run.summary=body.status === 'succeeded' ? 'Hermes reported tool completion. Further distinct tools require a new exact approval within this session’s frozen budget.' : 'Hermes reported an unknown effect. Review the provider before creating a new session.';
        if(body.status === 'uncertain')run.outcome='uncertain';
        result={recorded:true};
      }
      if (new TextEncoder().encode(JSON.stringify(run)).byteLength > 110000) blocked('External session evidence limit reached.');
      await tx.put(runKey(id),run);return result;
    });
  }
  private async start(agent: Agent, credential: Credential, body: Record<string,unknown>): Promise<unknown> {
    const session=textField(body.sessionId,'stable Hermes session ID',200), digest=await actionDigest({agentId:agent.id,session});
    const key=`external-session:${digest}`, existing=await this.storage.get<string>(key);
    if(existing) {
      const run=await this.storage.get<Run>(runKey(existing));
      if(!run) throw new RuntimeError('Session evidence has expired; this session cannot be replayed.',410);
      if(await actionDigest(body.supervisorLimits || {}) !== await actionDigest(run.external.overrides || {})) blocked('Session limits are frozen.');
      return {runId:existing,limits:run.supervisor!.limits};
    }
    if ((await this.storage.list({prefix:'external-session:'})).size >= 1000) blocked('External session tombstone limit reached.');
    const runs=[...(await this.storage.list<Run>({prefix:'run:'})).values()];
    if (runs.length >= 80) {
      const oldest=runs.filter(r => r.external && r.status === 'completed' && !r.pending).sort((a,b) => a.startedAt.localeCompare(b.startedAt))[0];
      if (!oldest) blocked('External session retention limit reached; resolve outstanding runs.');
      // Its permanent session mapping remains a replay fence after evidence expires.
      await this.storage.delete(runKey(oldest.id));
    }
    const p=await policy(this.storage), parent={...p.limits};
    for(const k of ['maxCalls','approvalTtlMs','executionTimeoutMs'] as const) parent[k]=Math.min(parent[k],agent.supervisorLimits?.[k] ?? parent[k]);
    const limits=supervisorLimits(body.supervisorLimits ?? {},parent), id=crypto.randomUUID();
    const run: Run={id,agentId:agent.id,kind:'trial',actor:'hermes-adapter',status:'completed',startedAt:now(),tokens:0,events:[],supervisor:supervisorRecord(p,limits),external:{sessionDigest:digest,agentRevision:agent.supervisorVersion || 0,credentialRevision:credential.revision,proposals:{},overrides:body.supervisorLimits || {}}};
    await this.storage.transaction(async tx => { await tx.put(key,id);await tx.put(runKey(id),run); });
    return {runId:id,limits};
  }
  async approve(run: Run, approvalId: unknown, actor: string): Promise<unknown> {
    if(!run.external || !run.supervisor || !run.pending || run.pending.id !== approvalId || run.status !== 'awaiting_approval') blocked('External proposal is no longer pending.');
    const a=run.supervisor.actions.find(a => a.approvalId === approvalId), agent=await this.agent(run.agentId), p=await policy(this.storage);
    if(!a || a.state !== 'awaiting_approval' || Date.now() >= Date.parse(a.expiresAt) || p.version !== run.supervisor.policyVersion || (agent.supervisorVersion || 0) !== run.external.agentRevision || agent.external!.revision !== run.external.credentialRevision || agent.status === 'paused') blocked('External proposal expired or policy changed.');
    if (run.external.approved?.id === approvalId) return {runId:run.id,approved:true,awaitingAdapter:true};
    run.external.approved={id:String(approvalId),actor,at:now()};
    run.status='executing'; // Waiting for the external dispatcher; no claim or tool effect yet.
    await this.storage.put(runKey(run.id),run);
    return {runId:run.id,approved:true,awaitingAdapter:true};
  }
}
