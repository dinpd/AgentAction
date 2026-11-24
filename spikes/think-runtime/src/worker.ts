import { getAgentByName } from 'agents';
import { HookProbe } from './hook-probe.ts';
import { SupervisedAgent } from './supervised-agent.ts';

export { HookProbe, SupervisedAgent };

type Env = Record<string, DurableObjectNamespace>;

/** Test-only RPC bridge: POST /rpc {agent, method, args}. Never deployed. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { agent, method, args = [] } = (await request.json()) as { agent: string; method: string; args?: unknown[] };
    const namespace = env[agent];
    if (!namespace) return Response.json({ error: `Unknown agent ${agent}` }, { status: 404 });
    try {
      const stub = (await getAgentByName(namespace as never, 'spike')) as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
      return Response.json({ value: (await stub[method](...args)) ?? null });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? `${error.message}\n${error.stack}` : String(error) }, { status: 500 });
    }
  },
};
