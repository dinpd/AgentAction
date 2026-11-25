/** Bundles the spike Worker and runs it in Miniflare with a synthetic MCP provider. */
import { mkdtemp, rm } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

export const PROVIDER_URL = 'https://provider.spike.test/mcp';
export type Tool = { name: string; description: string; inputSchema: Record<string, unknown> };
export type Provider = {
  tools: Tool[];
  /** Count of `tools/call` requests that reached the provider. */
  calls: number;
  /** Name and arguments of each `tools/call`, in order. */
  called: Array<{ name?: string; arguments?: unknown }>;
  /** What the provider does after committing a call. */
  behavior: 'respond' | 'lose-response' | 'hang';
  requests: string[];
};

export async function bundle(): Promise<string> {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../src/worker.ts', import.meta.url))],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    conditions: ['workerd', 'worker', 'browser'],
    external: ['cloudflare:*', 'node:*'],
    write: false,
    logLevel: 'error',
    plugins: [{
      name: 'workerd-node-builtins',
      setup(b) {
        // Think's dependencies import Node built-ins without the `node:` prefix.
        b.onResolve({ filter: new RegExp(`^(${builtinModules.join('|')})$`) }, args => ({ path: `node:${args.path}`, external: true }));
        // Optional skill-runner dependency that this spike never loads.
        b.onResolve({ filter: /^just-bash$/ }, () => ({ path: 'just-bash', namespace: 'spike-stub' }));
        b.onLoad({ filter: /.*/, namespace: 'spike-stub' }, () => ({ contents: 'export class Bash {} export const defineCommand = () => { throw new Error("just-bash is not bundled in the spike"); };', loader: 'js' }));
      },
    }],
  });
  return result.outputFiles[0].text;
}

/** A throwaway RS256 key so the gateway signs provider-authorization receipts as it does in production. */
async function receiptKey(): Promise<string> {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  return JSON.stringify({ ...(await crypto.subtle.exportKey('jwk', pair.privateKey)), kid: 'spike-receipt-key', alg: 'RS256' });
}

/**
 * `agents` maps binding names to agent classes. The gateway's own Durable Object (`GATEWAY_STATE`) is always bound,
 * so agents that call the in-process gateway keep its approvals, grants and audit across restarts.
 * `aiProxy` is a wrangler remote-proxy connection string for a real Workers AI binding (model evaluation only).
 */
export async function createRuntime(script: string, provider: Provider, agents: Record<string, string>, { aiProxy }: { aiProxy?: unknown } = {}) {
  const persist = await mkdtemp(join(tmpdir(), 'agentaction-think-spike-'));
  const RECEIPT_JWK = await receiptKey();
  const create = () =>
    new Miniflare({
      modules: true,
      script,
      compatibilityDate: '2026-07-20',
      compatibilityFlags: ['nodejs_compat'],
      durableObjects: {
        ...Object.fromEntries(Object.entries(agents).map(([binding, className]) => [binding, { className, useSQLite: true }])),
        GATEWAY_STATE: { className: 'AgentIdJitGrants', useSQLite: true },
      },
      durableObjectsPersist: persist,
      bindings: { RECEIPT_JWK },
      ...(aiProxy ? { ai: { binding: 'AI', remoteProxyConnectionString: aiProxy as never } } : {}),
      outboundService: async (request: Request) => {
        const url = new URL(request.url);
        if (url.origin !== new URL(PROVIDER_URL).origin) return new Response('Spike blocks all other egress.', { status: 403 });
        if (request.method === 'GET') return new Response(null, { status: 405 });
        if (request.method === 'DELETE') return new Response(null, { status: 204 });
        const rpc = (await request.json()) as { id?: number; method: string; params?: { protocolVersion?: string } };
        provider.requests.push(rpc.method);
        if (rpc.id === undefined) return new Response(null, { status: 202 });
        const reply = (result: unknown) => Response.json({ jsonrpc: '2.0', id: rpc.id, result });
        if (rpc.method === 'initialize')
          return reply({ protocolVersion: rpc.params?.protocolVersion || '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'synthetic-provider', version: '1.0.0' } });
        if (rpc.method === 'tools/list') return reply({ tools: provider.tools });
        if (rpc.method === 'tools/call') {
          provider.calls++; // The independent provider has committed its effect.
          provider.called.push((rpc.params as { name?: string; arguments?: unknown }) || {});
          if (provider.behavior === 'lose-response') return new Response('Synthetic response loss', { status: 502 });
          if (provider.behavior === 'hang') return new Promise<Response>(() => {});
          return reply({ content: [{ type: 'text', text: provider.called.at(-1)?.name === 'refund' ? 'Synthetic refund retained' : `Synthetic ${provider.called.at(-1)?.name} result` }] });
        }
        return Response.json({ jsonrpc: '2.0', id: rpc.id, error: { code: -32601, message: 'Method not found' } });
      },
    });
  let mf = create();
  return {
    async rpc(agent: string, method: string, ...args: unknown[]): Promise<any> {
      const response = await mf.dispatchFetch('https://spike.test/rpc', { method: 'POST', body: JSON.stringify({ agent, method, args }) });
      const body = (await response.json()) as { value?: unknown; error?: string };
      if (!response.ok) throw new Error(body.error || `RPC ${method} failed`);
      return body.value;
    },
    /** Destroy the process and start a new one over the same durable storage. */
    async restart() {
      await mf.dispose();
      mf = create();
    },
    async close() {
      await mf.dispose();
      await rm(persist, { recursive: true, force: true });
    },
  };
}

export const refundTool: Tool = {
  name: 'refund',
  description: 'Synthetic refund',
  inputSchema: { type: 'object', properties: { paymentId: { type: 'string' }, amount: { type: 'number' } }, required: ['paymentId', 'amount'], additionalProperties: false },
};
export const newProvider = (tools: Tool[] = [refundTool]): Provider => ({ tools: structuredClone(tools), calls: 0, called: [], behavior: 'respond', requests: [] });
