import assert from "node:assert/strict";
import test from "node:test";
import { RecurringRuntime, type Store } from "../src/recurring-runtime.ts";
import { websiteHealth, inspectHtml } from "../src/website-health.ts";
import { afterQuietHours, defaultNotifications } from "../src/notifications.ts";
import type { Handler, RecurringState } from "../src/recurring-types.ts";
import worker from "../src/worker.ts";
import demo from "../src/demo-worker.ts";

class Storage implements Store {
  value?: RecurringState; alarm?: number;
  async get<T>() { return structuredClone(this.value) as T | undefined; }
  async put<T>(_key: string, value: T) { this.value = structuredClone(value) as RecurringState; }
  async setAlarm(n: number) { this.alarm = n; }
  async deleteAlarm() { this.alarm = undefined; }
}
const html = '<html><head><title>Example</title><meta name="description" content="Useful description"><link rel="canonical" href="/"></head><body>Welcome</body></html>';
function harness(handler: Handler = websiteHealth) {
  const store = new Storage(), sent: any[] = [], urls: string[] = []; let time = Date.parse("2026-09-15T12:00:00Z"), status = 200, page = html, privateDns = false, failEmail = false, redirect = "";
  const fetcher = (async (input: any, init: any) => {
    const url = String(input); assert.equal(init.redirect, "manual"); urls.push(url);
    if (url.startsWith("https://cloudflare-dns.com/")) return Response.json({ Status: 0, Answer: [{ type: 1, data: privateDns ? "127.0.0.1" : "93.184.216.34" }] });
    if (redirect) return new Response(null, { status: 302, headers: { location: redirect } });
    return new Response(page, { status, headers: { "content-type": "text/html" } });
  }) as typeof fetch;
  const env = { NOTIFICATION_FROM_EMAIL: "alerts@example.com", NOTIFICATION_EMAIL: { async send(message: any) { sent.push(message); if (failEmail) throw new Error("PRIVATE PROVIDER ERROR"); return { messageId: "message-id" }; } } };
  let runtime = new RecurringRuntime(store, env, [handler], fetcher, () => time);
  const request = async (action: string, body: any = {}, role = "owner") => {
    const response = await runtime.handle(new Request(`https://runtime.internal/${action}`, { method: action === "state" ? "GET" : "POST", headers: { "x-runtime-role": role, "x-runtime-actor": "owner-1" }, ...(action === "state" ? {} : { body: JSON.stringify(body) }) }));
    return { status: response.status, body: await response.json() as any };
  };
  const create = async () => { const result = await request("create", { handler: handler.id, title: "Sample agent", intervalMinutes: 5, config: { url: "https://example.com/", expectedText: "Welcome" } }); assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body.jobId; };
  const settings = async (overrides: any = {}) => { const r = await request("settings", { ...defaultNotifications(), recipients: ["alerts@example.com"], warnings: "immediate", minimumSeverity: "info", ...overrides }); assert.equal(r.status, 200); };
  return { store, sent, urls, request, create, settings, env, fetcher, alarm: () => runtime.alarm(), state: () => store.value!, advance: (ms: number) => time += ms, now: () => time, down: () => status = 503, up: () => status = 200, page: (s: string) => page = s, privateDns: () => privateDns = true, redirect: (s: string) => redirect = s, failEmail: (v: boolean) => failEmail = v, reload: async () => { runtime = new RecurringRuntime(store, env, [handler], fetcher, () => time); await runtime.recover(); }, runtime: () => runtime };
}

test("baseline → explicit activation → outage deduplication → acknowledge → recovery → reopen", async () => {
  const h = harness(); await h.settings(); const jobId = await h.create();
  assert.equal(h.state().jobs[0].status, "draft"); assert.equal(h.urls.length, 0);
  assert.equal((await h.request("activate", { jobId, reviewed: true })).status, 409);
  await h.request("run", { jobId }); assert.ok(h.state().jobs[0].baselineAt); assert.equal(h.state().jobs[0].status, "draft");
  await h.request("activate", { jobId, reviewed: true });
  h.down(); h.advance(300000); await h.alarm(); assert.equal(h.state().findings.length, 0);
  h.advance(300000); await h.alarm(); const f = h.state().findings[0]; assert.equal(f.key, "availability"); assert.equal(f.status, "open"); assert.equal(h.sent.length, 1);
  assert.equal(h.state().runs.at(-1)?.status, "completed"); // an observed outage is not a failed monitoring run
  await h.alarm(); assert.equal(h.sent.length, 1); const runs = h.state().runs.length;
  await h.request("acknowledge", { findingId: f.id }, "operator"); h.advance(300000); await h.alarm(); assert.equal(h.state().runs.length, runs + 1); assert.equal(h.state().findings[0].status, "acknowledged"); assert.equal(h.sent.length, 1);
  h.up(); h.advance(300000); await h.alarm(); assert.equal(h.state().findings[0].status, "resolved"); assert.equal(h.sent.length, 2); assert.match(h.sent[1].text, /recovery/);
  h.down(); h.advance(300000); await h.alarm(); h.advance(300000); await h.alarm(); assert.equal(h.state().findings[0].episode, 2); assert.equal(h.sent.length, 3);
  await h.request("pause", { jobId }); h.advance(300000); const before = h.urls.length; await h.alarm(); assert.equal(h.urls.length, before);
});

test("SEO baseline survives restart and daily noindex regression resolves only after a complete audit", async () => {
  const h = harness(); await h.settings(); const jobId = await h.create(); await h.request("run", { jobId }); await h.reload();
  const baseline = h.state().jobs[0].state.seo;
  h.page(html.replace("</head>", '<meta name="robots" content="noindex"></head>'));
  await h.request("run", { jobId }); assert.equal(h.state().findings.length, 0); // not daily yet
  h.advance(86400000); await h.request("run", { jobId }); assert.equal(h.state().findings.find(f => f.key === "noindex")?.status, "open"); assert.deepEqual(h.state().jobs[0].state.previousSeo, baseline);
  h.page(html); h.advance(86400000); await h.request("run", { jobId }); assert.equal(h.state().findings.find(f => f.key === "noindex")?.status, "resolved");
});

test("public target boundary blocks private DNS, private redirects and out-of-scope origins", async () => {
  for (const url of ["http://example.com/", "https://127.0.0.1/", "https://localhost/", "https://user:secret@example.com/", "https://example.com/?token=secret"]) assert.throws(() => websiteHealth.validate({ url }));
  const h = harness(); const jobId = await h.create(); h.privateDns(); await h.request("run", { jobId }); assert.ok(h.urls.every(u => u.startsWith("https://cloudflare-dns.com/"))); assert.equal((await h.request("state")).body.jobs[0].health, "unknown");
  const g = harness(); const id = await g.create(); g.redirect("https://evil.com/"); await g.request("run", { jobId: id }); assert.ok(!g.urls.includes("https://evil.com/")); assert.equal(g.state().runs[0].status, "partial");
});

test("HTML parser ignores comment/script lookalikes and handles attributes/entities", () => {
  const parsed = inspectHtml('<!-- <meta name="robots" content="noindex"> --><script>"<meta name=robots content=noindex>"</script><title>A &amp; B</title><meta content="quoted > description" name="description"><link href="/preferred" rel="canonical alternate">', new Headers(), "https://example.com/");
  assert.equal(parsed.noindex, false); assert.equal(parsed.title, "A & B"); assert.equal(parsed.description, "quoted > description"); assert.equal(parsed.canonical, "https://example.com/preferred");
  assert.equal(inspectHtml(html, new Headers({ "x-robots-tag": "noindex" }), "https://example.com/").noindex, true);
});

test("generic fixture handler uses the same state, scheduler and findings engine", async () => {
  const handler: Handler = { id: "inventory-watch", version: "1.0.0", title: "Inventory", description: "Fixture only", validate: () => ({ item: "book" }), async check(_config, state) { return { state: { count: Number(state.count || 0) + 1 }, complete: true, summary: "Inventory checked", observations: [{ key: "low-stock", state: "present", severity: "warning", title: "Low stock", detail: "Two books remain" }] }; } };
  const h = harness(handler); await h.settings(); const jobId = await h.create(); await h.request("run", { jobId }); await h.request("activate", { jobId, reviewed: true }); h.advance(300000); await h.alarm(); await h.reload();
  assert.equal(h.state().jobs[0].state.count, 2); assert.equal(h.state().findings.length, 1); assert.equal(h.sent.length, 1);
});

test("email delivery retries persist ID, hide provider errors, stop after five attempts", async () => {
  const h = harness(); await h.settings(); h.failEmail(true); await h.request("test-email"); await h.alarm();
  const id = h.state().deliveries[0].id; assert.equal(h.state().deliveries[0].status, "pending"); assert.equal(h.state().deliveries[0].attempts, 1); assert.ok(!JSON.stringify(h.state()).includes("PRIVATE PROVIDER ERROR"));
  await h.alarm(); assert.equal(h.sent.length, 1);
  for (let i = 0; i < 4; i++) { h.advance(86400000); await h.alarm(); }
  assert.equal(h.state().deliveries[0].status, "failed"); assert.equal(h.sent.length, 5); assert.ok(h.sent.every(s => s.headers["X-AgentAction-Delivery-ID"] === id));
});

test("notification routes are owner-only, inherited, narrowed and revoked before delivery", async () => {
  const h = harness(); assert.equal((await h.request("settings", {}, "operator")).status, 403); assert.equal((await h.request("create", {}, "operator")).status, 403);
  await h.settings(); const jobId = await h.create(); assert.equal(h.state().jobs[0].recipients, null);
  assert.equal((await h.request("route", { jobId, recipients: ["elsewhere@example.com"] })).status, 403);
  await h.request("route", { jobId, recipients: [] }); h.down(); await h.request("run", { jobId }); await h.request("run", { jobId }); await h.alarm(); assert.equal(h.sent.length, 0);
  await h.request("test-email"); await h.settings({ recipients: [] }); await h.alarm(); assert.equal(h.sent.length, 0); assert.equal(h.state().deliveries[0].status, "cancelled");
  assert.equal((await h.request("run", { jobId }, "viewer")).status, 403);
});

test("quiet hours span midnight and digest groups noncritical findings", async () => {
  assert.equal(afterQuietHours(Date.parse("2026-09-15T23:30:00Z"), { ...defaultNotifications(), quietStartUtc: 22, quietEndUtc: 7 }), Date.parse("2026-09-16T07:00:00Z"));
  const h = harness(); await h.settings({ warnings: "digest" }); const jobId = await h.create(); h.page("<html><body>Welcome</body></html>"); await h.request("run", { jobId }); await h.alarm(); assert.equal(h.sent.length, 0); assert.equal(h.state().deliveries.length, 1); assert.equal(h.state().deliveries[0].events.length, 3);
  h.advance(4 * 3600000); await h.alarm(); assert.equal(h.sent.length, 1); assert.match(h.sent[0].subject, /3 updates/);
});

test("restart marks unfinished run unknown and retries uncertain delivery", async () => {
  const h = harness(); await h.settings(); const jobId = await h.create(); await h.request("run", { jobId }); await h.request("activate", { jobId, reviewed: true });
  h.store.value!.runs[0].status = "running"; await h.request("test-email"); h.store.value!.deliveries[0].status = "sending"; h.store.value!.deliveries[0].attempts = 1;
  await h.reload(); assert.equal(h.state().runs[0].status, "interrupted"); assert.equal(h.state().deliveries[0].status, "pending"); assert.match(h.state().deliveries[0].error!, /unknown/); assert.equal((await h.request("state")).body.jobs[0].health, "unknown");
  h.advance(3600000); assert.equal((await h.request("state")).body.jobs[0].stale, true);
});

test("missed slots do not replay backlog; history and manual quotas are bounded", async () => {
  const h = harness(); const jobId = await h.create(); await h.request("run", { jobId }); await h.request("activate", { jobId, reviewed: true });
  h.advance(5 * 86400000); await h.alarm(); assert.equal(h.state().runs.length, 2);
  for (let i = 0; i < 90; i++) { h.advance(300000); await h.alarm(); }
  assert.equal(h.state().runs.length, 80);
  for (let i = 0; i < 40; i++) assert.equal((await h.request("run", { jobId })).status, 200);
  assert.equal((await h.request("run", { jobId })).status, 429);
});

test("other runtimes can emit deduplicated trusted platform events", async () => {
  const h = harness(); await h.settings(); const event = { id: "approval:1", jobId: "mcp-agent", kind: "approval_required" as const, severity: "warning" as const, title: "Review proposed action", detail: "Open My agents to review the exact proposal.", at: h.now() };
  await h.runtime().notify(event); await h.runtime().notify(event); await h.alarm(); assert.equal(h.sent.length, 1);
  assert.equal((await h.request("notify", event)).status, 404);
});

test("concurrent alarm deliveries execute a due slot once and produce evidence digests", async () => {
  const h = harness(); const jobId = await h.create(); await h.request("run", { jobId }); await h.request("activate", { jobId, reviewed: true });
  h.advance(300000); await Promise.all([h.alarm(), h.alarm(), h.alarm()]);
  assert.equal(h.state().runs.length, 2); assert.match(h.state().runs[1].evidenceDigest!, /^[a-f0-9]{64}$/); assert.ok(h.state().runs[1].observations);
});

test("missing email service and oversize HTML never report successful delivery or healthy evidence", async () => {
  const h = harness(); await h.settings(); const jobId = await h.create(); h.page("x".repeat(524289)); await h.request("run", { jobId });
  assert.equal(h.state().runs[0].status, "partial"); assert.equal(h.state().jobs[0].baselineAt, undefined);
  const runtime = new RecurringRuntime(h.store, {}, [websiteHealth], h.fetcher, h.now); await runtime.alarm();
  assert.equal(h.state().deliveries[0].status, "pending"); assert.equal(h.state().deliveries[0].error, "Email service is not configured.");
  assert.equal(h.sent.length, 0);
});

test("an interrupted observation breaks consecutive availability failure confirmation", async () => {
  const h = harness(); const jobId = await h.create(); h.down(); await h.request("run", { jobId });
  h.store.value!.runs[0].status = "interrupted";
  await h.request("run", { jobId }); assert.equal(h.state().findings.find(f => f.key === "availability"), undefined);
  await h.request("run", { jobId }); assert.equal(h.state().findings.find(f => f.key === "availability")?.status, "open");
});

test("notification overflow and weekly summaries are explicit and bounded", async () => {
  const h = harness(); await h.settings(); const jobId = await h.create(); await h.request("run", { jobId }); await h.request("activate", { jobId, reviewed: true });
  h.advance(7 * 86400000); await h.alarm(); assert.match(h.sent[0].text, /Weekly agent monitoring summary/);
  for (let i = 0; i < 65; i++) await h.runtime().notify({ id: `failure:${i}`, jobId: "other-agent", kind: "execution_failed", severity: "critical", title: "Execution failed", detail: "Review the run", at: h.now() });
  assert.equal(h.state().deliveries.filter(d => d.status === "pending").length, 60); assert.equal(h.state().droppedNotifications, 5);
});

test("console enforces tenant, origin and role; public demo exposes no recurring surface", async () => {
  const calls: Request[] = [];
  const env = { CONSOLE_ENABLE_MOCK_IDENTITY: "true", CONSOLE_ENVIRONMENT: "development", CONSOLE_MOCK_TENANT_ID: "acme", CONSOLE_MOCK_SUBJECT: "owner", CONSOLE_STATIC_TENANT_ROLE: "owner", RECURRING_WORKSPACES: { getByName(name: string) { assert.equal(name, "workspace:acme"); return { async request(r: Request) { calls.push(r); return Response.json({}); } }; } } };
  const request = (tenant: string, action = "state", method = "GET", origin = "https://console.example.com") => new Request(`https://console.example.com/api/automations/${tenant}/${action}`, { method, headers: { origin, "content-type": "application/json", "x-agentaction-request": "agent-builder" }, ...(method === "POST" ? { body: "{}" } : {}) });
  assert.equal((await worker.fetch(request("acme"), env)).status, 200);
  assert.equal((await worker.fetch(request("other"), env)).status, 403);
  assert.equal((await worker.fetch(request("acme", "create", "POST", "https://evil.com"), env)).status, 403);
  assert.equal((await worker.fetch(request("acme", "notify", "POST"), env)).status, 405);
  assert.equal((await worker.fetch(request("acme", "state", "POST"), env)).status, 405);
  assert.equal(calls.length, 1);
  for (const path of ["/automations", "/assets/recurring.js", "/api/automations/acme/state"]) assert.equal((await demo.fetch(new Request("https://demo.example.com" + path), {})).status, 404);
});
