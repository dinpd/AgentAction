/**
 * Question 1 of issue 435: does Think's `beforeToolCall` hook cover tools that
 * come from a connected MCP server when Think auto-merges them?
 */
import { type ToolCallContext, type ToolCallDecision } from '@cloudflare/think';
import { SpikeAgent } from './spike-agent.ts';

type HookRecord = { toolName: string; input: unknown; dynamic?: boolean; decision: 'allow' | 'block' };

export class HookProbe extends SpikeAgent {
  includeMcpTools = true;

  getSystemPrompt() {
    return 'Spike hook probe.';
  }

  async beforeToolCall(ctx: ToolCallContext): Promise<ToolCallDecision | void> {
    const deny = (await this.ctx.storage.get<boolean>('deny')) === true;
    const log = (await this.ctx.storage.get<HookRecord[]>('hook-log')) || [];
    log.push({ toolName: ctx.toolName, input: ctx.input, dynamic: ctx.dynamic, decision: deny ? 'block' : 'allow' });
    await this.ctx.storage.put('hook-log', log);
    if (deny) return { action: 'block', reason: 'Denied by spike policy.' };
  }

  async setDeny(deny: boolean) {
    await this.ctx.storage.put('deny', deny);
  }
  async report() {
    return {
      hookLog: (await this.ctx.storage.get<HookRecord[]>('hook-log')) || [],
      offeredTools: (await this.ctx.storage.get<string[]>('offered-tools')) || [],
    };
  }
}
