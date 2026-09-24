import assert from 'node:assert/strict';
import test from 'node:test';
import { McpClient } from '../src/mcp-client.ts';

const connection = { endpoint: 'https://mcp.example.com/mcp', protocol: '2025-03-26', tools: [] };
const bytes = new TextEncoder();
function streamClient(chunks: Uint8Array[], close = false) {
  let canceled = false, requests = 0;
  const client = new McpClient(connection, async () => {
    requests++;
    return new Response(new ReadableStream({
      start(controller) { for (const chunk of chunks) controller.enqueue(chunk); if (close) controller.close(); },
      cancel() { canceled = true; },
    }), { headers: { 'content-type': 'text/event-stream' } });
  });
  return { client, canceled: () => canceled, requests: () => requests };
}

test('returns a matching streamed response without waiting for EOF; handles split UTF-8, CRLF, multiline data and progress', async () => {
  const source = ': heartbeat\r\n\r\ndata: {"jsonrpc":"2.0","method":"notifications/progress","params":{}}\r\n\r\n'
    + 'data: {"jsonrpc":"2.0","id":999,"result":{}}\r\n\r\n'
    + 'data: {"jsonrpc":"2.0","id":1,"method":"server/request"}\r\n\r\n'
    + 'event: message\r\ndata: {"jsonrpc":"2.0","id":1,\r\ndata: "result":{"text":"café ✓"}}\r\n\r\n';
  const h = streamClient(Array.from(bytes.encode(source), byte => new Uint8Array([byte])));
  assert.deepEqual(await h.client.rpc('tools/call', { name: 'search' }), { text: 'café ✓' });
  assert.equal(h.canceled(), true); assert.equal(h.requests(), 1);
});

test('accepts batched SSE responses and bare CR event delimiters', async () => {
  const h = streamClient([bytes.encode('data: [{"jsonrpc":"2.0","method":"notifications/progress"},{"jsonrpc":"2.0","id":1,"result":{"done":true}}]\r\r')]);
  assert.deepEqual(await h.client.rpc('tools/list'), { done: true });
});

test('invalid, missing, failed and oversized responses fail closed without replay or provider disclosure', async () => {
  for (const [body, expected] of [
    ['data: {"jsonrpc":"2.0","id":1,"error":{"message":"SECRET-provider"}}\n\n', /invalid or failed/],
    ['data: {"jsonrpc":"1.0","id":1,"result":{}}\n\n', /invalid or failed/],
    ['data: {"jsonrpc":"2.0","id":2,"result":{}}\n\n', /invalid or failed/],
    ['data: SECRET-provider\n\n', /could not be read/],
    ['data: ' + 'x'.repeat(524288), /size limit/],
  ] as const) {
    const h = streamClient([bytes.encode(body)], true);
    await assert.rejects(h.client.rpc('tools/call'), error => {
      assert.match((error as Error).message, expected);
      assert.ok(!(error as Error).message.includes('SECRET-provider')); return true;
    });
    assert.equal(h.requests(), 1);
  }
});

test('a normal 30-second tool response completes; stalled calls abort at the bounded deadline without retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let requests = 0, received!: () => void;
  let ready = new Promise<void>(resolve => { received = resolve; });
  let signal: AbortSignal | undefined;
  const client = new McpClient(connection, async (_url, init) => {
    requests++; signal = init?.signal as AbortSignal;
    const request = JSON.parse(init?.body as string);
    const response = new Response(new ReadableStream({ start(controller) {
      signal!.addEventListener('abort', () => controller.error(new Error('SECRET-abort')), { once: true });
      if (requests === 1) setTimeout(() => {
        controller.enqueue(bytes.encode(`data: ${JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { status: 'RUNNING' } })}\n\n`));
      }, 30000);
    } }), { headers: { 'content-type': 'text/event-stream' } });
    received(); return response;
  });
  const first = client.rpc('tools/call'); await ready;
  t.mock.timers.tick(20001); assert.equal(signal!.aborted, false);
  t.mock.timers.tick(10000); assert.deepEqual(await first, { status: 'RUNNING' });
  ready = new Promise<void>(resolve => { received = resolve; });
  const stalled = assert.rejects(client.rpc('tools/call'), /could not be read/); await ready;
  t.mock.timers.tick(59999); assert.equal(signal!.aborted, false);
  t.mock.timers.tick(1); await stalled; assert.equal(requests, 2);
  ready = new Promise<void>(resolve => { received = resolve; });
  const discovery = assert.rejects(client.rpc('tools/list'), /could not be read/); await ready;
  t.mock.timers.tick(20000); await discovery; assert.equal(requests, 3);
});
