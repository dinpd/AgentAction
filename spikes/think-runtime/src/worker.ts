import { getAgentByName } from 'agents';
import { HookProbe } from './hook-probe.ts';
import { SupervisedAgent } from './supervised-agent.ts';
import { GatewayAgent } from './gateway-agent.ts';
import { LiveModelAgent } from './live-model-agent.ts';
import { AgentIdJitGrants } from '../../../cloudflare/src/worker.ts';

export { HookProbe, SupervisedAgent, GatewayAgent, LiveModelAgent, AgentIdJitGrants };

type Env = Record<string, unknown>;

/** Test-only RPC bridge: POST /rpc {agent, method, args}. Never deployed. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { agent, method, args = [] } = (await request.json()) as { agent: string; method: string; args?: unknown[] };
    const namespace = env[agent] as DurableObjectNamespace | undefined;
    if (!namespace) return Response.json({ error: `Unknown agent ${agent}` }, { status: 404 });
    try {
      const stub = (await getAgentByName(namespace as never, 'spike')) as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
      return Response.json({ value: (await stub[method](...args)) ?? null });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? `${error.message}\n${error.stack}` : String(error) }, { status: 500 });
    }
  },
};
