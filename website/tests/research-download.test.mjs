import assert from "node:assert/strict";
import test from "node:test";
import { handleResearchDownload, default as worker } from "../dist/server/index.js";

const env = { CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_EMAIL_API_TOKEN: "test-token" };
const valid = () => ({ email: "reader@example.com", name: "", organization: "", website: "", startedAt: Date.now() - 5000 });
const request = (body = valid(), headers = {}, method = "POST") => new Request("https://agentaction.dev/api/research-download", {
  method, headers: { origin: "https://agentaction.dev", "content-type": "application/json", ...headers },
  ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
});

test("registers email-only readers privately with fixed destination and paper identity", async () => {
  let message;
  const response = await handleResearchDownload(request({ ...valid(), to: "attacker@example.com", paper: "fake" }), env, async (url, init) => {
    assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${"a".repeat(32)}/email/sending/send`);
    assert.ok(init.signal instanceof AbortSignal);
    message = JSON.parse(init.body);
    return Response.json({ success: true });
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { received: true });
  assert.equal(message.to, "info@agentaction.dev");
  assert.equal(message.reply_to.address, "reader@example.com");
  assert.match(message.text, /Name: Not provided/);
  assert.match(message.text, /No mailing-list subscription/);
  assert.doesNotMatch(message.text, /attacker|fake/);
  assert.equal(message.subject, "[Research reader] Can We Trust 'Done'?");
});

test("optional reader details are plain text, not rendered HTML", async () => {
  let message;
  const response = await handleResearchDownload(request({ ...valid(), name: "A <script>", organization: "Lab & Partners" }), env, async (_url, init) => {
    message = JSON.parse(init.body); return Response.json({ success: true });
  });
  assert.equal(response.status, 200);
  assert.match(message.text, /Name: A <script>/);
  assert.match(message.text, /Organization: Lab & Partners/);
  assert.equal(message.html, undefined);
});

test("invalid and abusive reader requests never invoke the email provider", async () => {
  let calls = 0;
  const send = async () => { calls++; throw new Error("must not send"); };
  const cases = [
    [request(valid(), {}, "GET"), 405],
    [request(valid(), { origin: "https://other.example" }), 403],
    [request(valid(), { "content-type": "text/plain" }), 415],
    [request(valid(), { "content-type": "application/json-evil" }), 415],
    [request("{"), 400], [request("null"), 400], [request("[]"), 400],
    [request({ ...valid(), email: "bad" }), 400],
    [request({ ...valid(), email: "reader@example.com\nBcc: bad@example.com" }), 400],
    [request({ ...valid(), name: "x".repeat(81) }), 400],
    [request({ ...valid(), organization: "x".repeat(121) }), 400],
    [request({ ...valid(), name: "Injected\nSubject: x" }), 400],
    [request({ ...valid(), website: "https://bot.example" }), 400],
    [request({ ...valid(), startedAt: Date.now() }), 400],
    [request({ ...valid(), startedAt: Date.now() - 86_500_000 }), 400],
    [request({ ...valid(), startedAt: "5000" }), 400],
    [request({ ...valid(), organization: "x".repeat(4100) }), 413],
    [request(valid(), { "content-length": "4100" }), 413],
  ];
  for (const [req, status] of cases) assert.equal((await handleResearchDownload(req, env, send)).status, status);
  assert.equal(calls, 0);
});

test("reader registration fails honestly on missing configuration, rejected delivery and transport errors", async () => {
  let calls = 0;
  const response = await handleResearchDownload(request(), {}, async () => { calls++; return Response.json({ success: true }); });
  assert.equal(response.status, 503);
  assert.equal(calls, 0);
  for (const send of [
    async () => Response.json({ success: false }),
    async () => Response.json({ success: true }, { status: 500 }),
    async () => new Response("not json"),
    async () => { throw new Error("private provider error"); },
  ]) {
    const failed = await handleResearchDownload(request(), env, send);
    assert.equal(failed.status, 503);
    const body = await failed.text();
    assert.match(body, /download the paper directly/);
    assert.doesNotMatch(body, /reader@example.com|test-token|private provider error/);
  }
  const routed = await worker.fetch(request(), {}, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(routed.status, 503);
});
