/**
 * Deterministic stand-in model for the spike. No inference is performed.
 *
 * The last user message drives it: `use <tool-suffix> <json-arguments>`.
 * Until a tool result for that request is visible, it proposes exactly that
 * call; once any tool result is visible it finishes with fixed text.
 * `force <tool-name> <json-arguments>` emits the call even when the tool was
 * not offered, standing in for a model that ignores its tool list.
 */
type Part = Record<string, unknown>;
type Message = { role: string; content: unknown };

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

function decide(options: { prompt: Message[]; tools?: Array<{ name: string }> }): Part[] {
  const lastUser = options.prompt.findLastIndex(m => m.role === 'user');
  const after = options.prompt.slice(lastUser + 1);
  const sawResult = after.some(m => m.role === 'tool');
  const content = options.prompt[lastUser]?.content;
  const text = Array.isArray(content)
    ? content.map(p => (p as { text?: string }).text || '').join(' ')
    : String(content || '');
  const match = /(use|force) (\S+) (\{.*\})/s.exec(text)?.slice(1) as [string, string, string] | undefined;
  const forced = match?.[0] === 'force';
  if (match) match.shift();
  const tool = match && (forced ? { name: match[0] } : (options.tools || []).find(t => t.name === match[0] || t.name.endsWith(`_${match[0]}`)));
  if (!sawResult && match && tool) {
    return [
      { type: 'tool-call', toolCallId: `call_${crypto.randomUUID()}`, toolName: tool.name, input: match[1] },
      { type: 'finish', usage, finishReason: { unified: 'tool-calls', raw: 'tool_calls' } },
    ];
  }
  const say = sawResult ? 'Observed the tool outcome.' : match ? `Tool ${match[0]} is not available.` : 'Nothing to do.';
  return [
    { type: 'text-start', id: 't1' },
    { type: 'text-delta', id: 't1', delta: say },
    { type: 'text-end', id: 't1' },
    { type: 'finish', usage, finishReason: { unified: 'stop', raw: 'stop' } },
  ];
}

export function scriptedModel(onCall?: (toolNames: string[]) => void): unknown {
  return {
    specificationVersion: 'v4',
    provider: 'agentaction-spike',
    modelId: 'scripted',
    supportedUrls: {},
    async doGenerate(): Promise<never> {
      throw new Error('The spike model only streams.');
    },
    async doStream(options: { prompt: Message[]; tools?: Array<{ name: string }> }) {
      onCall?.((options.tools || []).map(t => t.name));
      const parts = [{ type: 'stream-start', warnings: [] }, ...decide(options)];
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const part of parts) controller.enqueue(part);
            controller.close();
          },
        }),
      };
    },
  };
}
