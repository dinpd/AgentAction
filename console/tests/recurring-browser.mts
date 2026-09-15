import { createServer } from "node:http";
import assert from "node:assert/strict";
import worker from "../src/worker.ts";
import { RecurringRuntime } from "../src/recurring-runtime.ts";
import { websiteHealth } from "../src/website-health.ts";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const stores = new Map<string, any>(), sent: any[] = [];
let failure = false, role = "owner", unavailable = false;
const runtimes = new Map<string, RecurringRuntime>();
function runtime(tenant: string) {
  if (!runtimes.has(tenant)) runtimes.set(tenant, new RecurringRuntime({ async get() { return structuredClone(stores.get(tenant)); }, async put(_k, v) { stores.set(tenant, structuredClone(v)); }, async setAlarm() {}, async deleteAlarm() {} }, { NOTIFICATION_FROM_EMAIL: "alerts@example.com", NOTIFICATION_EMAIL: { async send(m) { sent.push(m); return { messageId: "accepted-1" }; } } }, [websiteHealth], (async (input: any) => String(input).includes("cloudflare-dns.com") ? Response.json({ Status: 0, Answer: [{ type: 1, data: "93.184.216.34" }] }) : new Response('<title>Example</title><meta name="description" content="Example"><link rel="canonical" href="/">Welcome', { status: failure ? 503 : 200, headers: { "content-type": "text/html" } })) as typeof fetch));
  return runtimes.get(tenant)!;
}
const env = { CONSOLE_ENABLE_MOCK_IDENTITY: "true", CONSOLE_ENVIRONMENT: "development", CONSOLE_MOCK_SUBJECT: "test", CONSOLE_MOCK_TENANT_ID: "acme" };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url!, "http://localhost"); let out: Response;
    if (url.pathname === "/api/console/session") out = Response.json({ email: "owner@example.com", memberships: ["acme", "beta"].map(t => ({ tenant: { tenant_id: t, display_name: t }, membership: { role } })) });
    else if (url.pathname.startsWith("/api/automations/")) {
      let body = ""; for await (const chunk of req) body += chunk;
      const [, , , tenant, action] = url.pathname.split("/");
      out = unavailable ? Response.json({ error: "Session unavailable" }, { status: 401 }) : await runtime(tenant).handle(new Request(`https://runtime.internal/${action}`, { method: req.method, headers: { "x-runtime-role": role, "x-runtime-actor": "fixture" }, ...(req.method === "POST" ? { body } : {}) }));
    } else if (url.pathname.startsWith("/api/")) out = Response.json({});
    else out = await worker.fetch(new Request(url), env);
    res.statusCode = out.status; out.headers.forEach((v, k) => res.setHeader(k, v)); res.end(Buffer.from(await out.arrayBuffer()));
  } catch (e) { res.statusCode = 500; res.end(String(e)); }
});
await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = []; page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
const base = `http://127.0.0.1:${(server.address() as any).port}`;
try {
  await page.goto(base + "/automations#agents"); await page.getByText("Workspace ready · owner", { exact: true }).waitFor();
  await page.locator(".stage-tabs").getByRole("link", { name: "Workspace notifications" }).click();
  await page.locator('[name="recipients"]').fill("alerts@example.com"); await page.locator('[name="warnings"]').selectOption("immediate");
  await page.getByRole("button", { name: "Save workspace notifications", exact: true }).click(); await page.getByText("Saved. Review the updated evidence below.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Send test email", exact: true }).click(); await page.getByText("Test email queued. Refresh delivery history to see provider acceptance.", { exact: true }).waitFor(); await runtime("acme").alarm(); assert.equal(sent.length, 1);
  await page.locator(".stage-tabs").getByRole("link", { name: "Agents", exact: true }).click(); await page.locator("#refresh").click();
  await page.getByText("Create a recurring agent", { exact: true }).click(); await page.getByLabel("Agent name", { exact: true }).fill("Example Website"); await page.getByLabel("Page URL", { exact: true }).fill("https://example.com/");
  await page.getByRole("button", { name: "Create draft", exact: true }).click(); await page.getByRole("heading", { name: "Example Website", exact: true }).waitFor();
  assert.equal(stores.get("acme").jobs[0].status, "draft"); assert.equal(stores.get("acme").runs.length, 0);
  await page.getByRole("button", { name: "Run baseline", exact: true }).click(); await page.getByRole("button", { name: "Enable schedule", exact: true }).waitFor();
  await page.getByRole("button", { name: "Enable schedule", exact: true }).click(); await page.getByRole("button", { name: "Pause", exact: true }).waitFor(); assert.equal(stores.get("acme").jobs[0].status, "active");
  failure = true;
  for (let i = 0; i < 2; i++) { await page.getByRole("button", { name: "Check now", exact: true }).click(); await page.getByText("Saved. Review the updated evidence below.", { exact: true }).waitFor(); }
  await page.locator(".stage-tabs").getByRole("link", { name: "Findings", exact: true }).click(); await page.getByRole("heading", { name: "Page availability problem", exact: true }).waitFor();
  await page.getByRole("button", { name: "Acknowledge", exact: true }).click(); await page.getByText(/critical · acknowledged/).waitFor();
  await page.screenshot({ path: "/tmp/agentaction-215-findings.png", fullPage: true });
  await page.locator(".stage-tabs").getByRole("link", { name: "Agents", exact: true }).click(); failure = false;
  await page.getByRole("button", { name: "Check now", exact: true }).click(); await page.getByText("Saved. Review the updated evidence below.", { exact: true }).waitFor(); assert.equal(stores.get("acme").findings[0].status, "resolved");
  await page.getByRole("button", { name: "Pause", exact: true }).click(); await page.getByRole("button", { name: "Enable schedule", exact: true }).waitFor();
  await page.locator("#workspace").selectOption("beta"); await page.getByText("No recurring agents yet. Create a draft below.", { exact: true }).waitFor(); assert.equal(await page.locator("[name=recipients]").inputValue(), "");
  await page.locator("#workspace").selectOption("acme"); await page.getByRole("heading", { name: "Example Website", exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); await page.screenshot({ path: "/tmp/agentaction-215-mobile.png", fullPage: true });
  role = "viewer"; await page.reload(); await page.getByText("Workspace ready · viewer", { exact: true }).waitFor(); assert.equal(await page.getByRole("button", { name: "Enable schedule", exact: true }).isDisabled(), true);
  unavailable = true; await page.locator("#refresh").click(); await page.getByText("Session unavailable", { exact: true }).waitFor(); assert.equal(await page.locator("#content").isHidden(), true);
  assert.deepEqual(errors, []); console.log("Recurring browser acceptance passed: workspace email, draft, baseline, activation, outage, acknowledgement, recovery, pause, isolation, viewer, session failure, mobile.");
} catch (error) { console.error({ errors, body: await page.locator("body").innerText() }); throw error; }
finally { await browser.close(); server.close(); }
