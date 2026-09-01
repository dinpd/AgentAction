import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import demoWorker from "../src/demo-worker.ts";

function demoRequest(path: string, init: RequestInit = {}): Request {
  return new Request(`https://demo.test${path}`, init);
}

test("serves the public console shell without an Access token", async () => {
  const response = await demoWorker.fetch(demoRequest("/", { headers: { accept: "text/html" } }));

  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /AgentAction Observability/);
  assert.match(body, /Loading synthetic console data/);
  assert.match(body, /Public synthetic fixtures/);
  assert.match(body, /Public synthetic demo/);
  assert.match(body, /<h2 id="lifecycle-title" class="visually-hidden">Synthetic run lifecycle<\/h2>/);
  assert.match(body, /<summary>[\s\S]*Show 9-stage flow[\s\S]*Hide 9-stage flow[\s\S]*<\/summary>/);
  assert.match(body, /aria-label="Synthetic execution lifecycle"/);
  assert.doesNotMatch(body, /Cloudflare Access/);
  assert.doesNotMatch(body, /Authenticated and tenant-scoped/);
});

test("uses an explicitly synthetic public session and health source", async () => {
  const session = await demoWorker.fetch(demoRequest("/api/console/session"));
  assert.equal(session.status, 200);
  assert.deepEqual(await session.json(), {
    authenticated: true,
    public_demo: true,
    tenant_id: "acme",
    subject: "public-demo",
  });

  const health = await demoWorker.fetch(demoRequest("/api/console/health"));
  assert.equal(health.status, 200);
  assert.equal((await health.json() as any).tenant_id, "acme");
});

test("serves only synthetic overview, activity, jobs, and job-detail records", async () => {
  const overview = await demoWorker.fetch(demoRequest(
    "/api/console/tenants/acme/intent-quality/rollups?from=2026-08-01T00%3A00%3A00Z&to=2026-08-08T00%3A00%3A00Z",
  ));
  assert.equal(overview.status, 200);
  assert.ok((await overview.json() as any).rollups.length > 0);

  const jobs = await demoWorker.fetch(demoRequest(
    "/api/console/tenants/acme/intent-quality/jobs?from=2026-08-01T00%3A00%3A00Z&to=2026-08-08T00%3A00%3A00Z&verdict=partial",
  ));
  assert.equal(jobs.status, 200);
  assert.ok((await jobs.json() as any).jobs.every((job: any) => job.verdict === "partial"));

  const detail = await demoWorker.fetch(demoRequest(
    "/api/console/tenants/acme/intent-quality/jobs/job-refund-partial",
  ));
  assert.equal(detail.status, 200);
  assert.equal((await detail.json() as any).job.job_id, "job-refund-partial");

  const activity = await demoWorker.fetch(demoRequest(
    "/api/console/tenants/acme/activity/events?intent_binding=bound&limit=50",
  ));
  assert.equal(activity.status, 200);
  const activityBody = await activity.json() as any;
  assert.equal(activityBody.events.length, 1);
  assert.equal(activityBody.events[0].intent.binding_status, "bound");
  assert.equal(JSON.stringify(activityBody).includes("raw_prompt"), false);
});

test("does not expose operator-only gateway routes", async () => {
  for (const path of [
    "/api/console/tenants/acme/intent-profiles",
    "/api/console/tenants/acme/intent-contracts",
    "/api/console/tenants/acme/audit/events",
    "/api/console/tenants/acme/approvals",
  ]) {
    const response = await demoWorker.fetch(demoRequest(path));
    assert.equal(response.status, 404, path);
    assert.equal((await response.json() as any).error.code, "public_demo_route_not_found");
  }
});

test("does not expose tenant onboarding or source lifecycle routes", async () => {
  for (const [path, method] of [
    ["/api/console/onboarding/session", "GET"],
    ["/api/console/onboarding/tenants", "POST"],
    ["/api/console/onboarding/tenants/acme/setup", "GET"],
    ["/api/console/onboarding/tenants/acme/sources", "POST"],
  ] as const) {
    const response = await demoWorker.fetch(demoRequest(path, { method }));
    assert.equal(response.status, 404, path);
    assert.equal((await response.json() as any).error.code, "public_demo_route_not_found");
  }
});

test("ignores deployment-supplied bindings and credentials", async () => {
  let externalCalls = 0;
  const injectedEnv = {
    ACCESS_AUD: "should-not-be-read",
    AGENTID_GATEWAY_TOKEN: "should-not-be-read",
    AGENTID_GATEWAY: {
      async fetch() {
        externalCalls += 1;
        return Response.json({ leaked: true });
      },
    },
  };

  const response = await (demoWorker.fetch as any)(
    demoRequest("/api/console/tenants/acme/intent-quality/rollups"),
    injectedEnv,
  );
  assert.equal(response.status, 200);
  assert.ok((await response.json() as any).rollups.length > 0);
  assert.equal(externalCalls, 0);
});

test("public deployment configuration contains no production binding or runtime secret", async () => {
  const config = await readFile(new URL("../wrangler.demo.toml", import.meta.url), "utf8");

  assert.doesNotMatch(config, /\[\[services\]\]/);
  assert.doesNotMatch(config, /AGENTID_GATEWAY/);
  assert.doesNotMatch(config, /ACCESS_/);
  assert.doesNotMatch(config, /secret/i);
});
