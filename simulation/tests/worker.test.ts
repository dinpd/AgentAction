import assert from "node:assert/strict";
import test from "node:test";

import worker, {
  runScheduledBatch,
  scheduleBucket,
  SyntheticRunState,
  type Env,
} from "../src/worker.ts";
import gateway, { AgentIdJitGrants } from "../../cloudflare/src/worker.ts";

type GatewayCall = {
  body: Record<string, any>;
  headers: Headers;
  path: string;
};

test("builds deterministic UTC schedule buckets", () => {
  assert.equal(scheduleBucket("2026-07-25T17:29:59.999Z", 15), "20260725t171500z");
  assert.equal(scheduleBucket("2026-07-25T17:30:00.000Z", 15), "20260725t173000z");
  assert.throws(() => scheduleBucket("not-a-date", 15), /scheduled_at_invalid/);
});

test("runs a bounded profile-issued lifecycle only through the service binding", async () => {
  const calls: GatewayCall[] = [];
  const env = baseEnv(calls);
  const results = await runScheduledBatch(env, "2026-07-25T17:30:00.000Z");

  assert.equal(results.length, 2);
  assert.deepEqual(results.map((result) => result.profile_version), ["v1", "v2"]);
  assert.equal(calls.filter((call) => call.path.endsWith("/intent-profiles")).length, 2);
  assert.equal(calls.filter((call) => call.path.includes("/issue")).length, 2);
  assert.equal(calls.filter((call) => call.path.includes("/evaluate")).length, 2);
  assert.equal(calls.filter((call) => call.path.includes("/finalize")).length, 2);
  assert.equal(calls.some((call) => call.path.includes("/observations")), false);
  assert.equal(calls.every((call) => call.headers.get("authorization") === "Bearer internal-test-token"), true);
  assert.equal(calls.every((call) => call.headers.get("user-agent") === "agentpass-synthetic-runner/0.1"), true);
  assert.equal(calls.every((call) => call.path.startsWith("/tenants/refund-demo-agent/")), true);

  const profiles = calls
    .filter((call) => call.path.endsWith("/intent-profiles"))
    .map((call) => call.body);
  assert.equal(profiles.every((profile) => profile.trusted_observation_requirements === undefined), true);
  assert.equal(profiles.every((profile) => profile.evidence_requirements.includes("job")), true);
});

test("produces completed and partial immutable receipts through the real gateway implementation", async () => {
  const namespace = new MemoryGatewayNamespace();
  const gatewayContext = new GatewayContext();
  const gatewayEnv = {
    AGENTID_INTERNAL_SERVICE_TOKEN: "integration-service-token",
    AGENTID_MANIFEST_JSON: JSON.stringify(syntheticManifest()),
    JIT_GRANTS: namespace,
  };
  const env: Env = {
    ...baseEnv([]),
    AGENTID_GATEWAY_TOKEN: "integration-service-token",
    AGENTID_GATEWAY: {
      async fetch(request: Request): Promise<Response> {
        return gateway.fetch(request, gatewayEnv as never, gatewayContext as never);
      },
    },
  };

  const results = await runScheduledBatch(env, "2026-07-25T00:15:00.000Z");
  await gatewayContext.flush();

  assert.deepEqual(
    results.map((result) => [result.scenario, result.verdict, result.constraint]),
    [
      ["completed", "completed", "pass"],
      ["partial", "partial", "pass"],
    ],
  );
  const rollupWindow = new URLSearchParams({
    from: new Date(Date.now() - 86_400_000).toISOString(),
    to: new Date(Date.now() + 86_400_000).toISOString(),
  });
  const rollups = await gateway.fetch(
    new Request(
      `https://gateway.test/tenants/refund-demo-agent/intent-quality/rollups?${rollupWindow}`,
      { headers: { authorization: "Bearer integration-service-token" } },
    ),
    gatewayEnv as never,
    gatewayContext as never,
  );
  const rollupBody = await rollups.json() as any;
  assert.equal(rollups.status, 200);
  assert.equal(rollupBody.matched_records, 2);
  assert.equal(rollupBody.rollups.length, 2);
  assert.equal(rollupBody.rollups.every((group: any) => group.sample.finalized_jobs === 1), true);
});

test("fails closed before gateway traffic when the credential or tenant is invalid", async () => {
  const calls: GatewayCall[] = [];
  await assert.rejects(
    () => runScheduledBatch({ ...baseEnv(calls), AGENTID_GATEWAY_TOKEN: "" }, "2026-07-25T17:30:00Z"),
    /gateway_token_missing/,
  );
  await assert.rejects(
    () => runScheduledBatch({ ...baseEnv(calls), SIMULATION_TENANT_ID: "../other" }, "2026-07-25T17:30:00Z"),
    /simulation_tenant_invalid/,
  );
  assert.equal(calls.length, 0);
});

test("kill switch prevents all synthetic gateway calls", async () => {
  const calls: GatewayCall[] = [];
  const results = await runScheduledBatch(
    { ...baseEnv(calls), SIMULATION_ENABLED: "false" },
    "2026-07-25T17:30:00Z",
  );
  assert.deepEqual(results, []);
  assert.equal(calls.length, 0);
});

test("durable state replays a completed schedule bucket and exposes only redacted health", async () => {
  const calls: GatewayCall[] = [];
  const storage = new Map<string, unknown>();
  const env = baseEnv(calls);
  const state = new SyntheticRunState({
    storage: {
      async get<T>(key: string): Promise<T | undefined> {
        return storage.get(key) as T | undefined;
      },
      async put<T>(key: string, value: T): Promise<void> {
        storage.set(key, value);
      },
    },
  }, env);
  const runRequest = () => new Request("https://state.test/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scheduled_at: "2026-07-25T17:30:00Z" }),
  });

  const first = await state.fetch(runRequest());
  assert.equal(first.status, 201);
  const callCount = calls.length;
  const replay = await state.fetch(runRequest());
  assert.equal(replay.status, 200);
  assert.equal((await replay.json() as any).replayed, true);
  assert.equal(calls.length, callCount);

  const health = await state.fetch(new Request("https://state.test/health"));
  const text = await health.text();
  assert.match(text, /"status":"completed"/);
  assert.match(text, /"tenant_id":"refund-demo-agent"/);
  assert.doesNotMatch(text, /intent_id|intent_digest|job_id|jit_grant|internal-test-token|evidence/);
});

test("public worker surface is read-only health", async () => {
  const stateResponse = new Response(JSON.stringify({ status: "completed" }));
  const env = {
    ...baseEnv([]),
    SYNTHETIC_RUN_STATE: {
      idFromName(name: string): string {
        return name;
      },
      get(): { fetch(request: Request): Promise<Response> } {
        return {
          async fetch(request: Request): Promise<Response> {
            assert.equal(new URL(request.url).pathname, "/health");
            return stateResponse;
          },
        };
      },
    },
  };
  assert.equal((await worker.fetch(new Request("https://runner.test/health"), env)).status, 200);
  assert.equal((await worker.fetch(new Request("https://runner.test/run", { method: "POST" }), env)).status, 404);
});

function baseEnv(calls: GatewayCall[]): Env {
  return {
    AGENTID_GATEWAY_TOKEN: "internal-test-token",
    SIMULATION_CADENCE_MINUTES: "15",
    SIMULATION_ENABLED: "true",
    SIMULATION_JOB_CAP: "2",
    SIMULATION_TENANT_ID: "refund-demo-agent",
    SYNTHETIC_RUN_STATE: {
      idFromName(name: string): string {
        return name;
      },
      get(): never {
        throw new Error("state binding should not be used by runScheduledBatch");
      },
    },
    AGENTID_GATEWAY: {
      async fetch(request: Request): Promise<Response> {
        const path = new URL(request.url).pathname;
        const body = await request.json() as Record<string, any>;
        calls.push({ body, headers: new Headers(request.headers), path });
        if (path.endsWith("/intent-profiles")) {
          return json({ profile_key: `${body.profile}.${body.version}`, profile_digest: "a".repeat(64) }, 201);
        }
        if (path.endsWith("/issue")) {
          return json({
            intent_digest: "b".repeat(64),
            intent_id: body.intent_id,
            job_id: body.job_id,
          }, 201);
        }
        if (path.endsWith("/approval-requests")) return json({ status: "pending" }, 201);
        if (path.endsWith("/approve")) return json({ status: "approved" });
        if (path.endsWith("/jit-grants")) return json({ jit_grant_id: "jit-test" }, 201);
        if (path.endsWith("/authorize")) {
          if (body.tool === "synthetic.external_side_effect") return json({ allow: false }, 403);
          return json({ allow: true, replayed: body.decision_id?.includes("execute") && calls.filter((call) => call.path.endsWith("/authorize") && call.body.idempotency_key === body.idempotency_key).length > 1 });
        }
        if (path.endsWith("/execution-results")) return json({ receipt: { status: "executed" } }, 201);
        if (path.endsWith("/evaluate")) return json({ verdict: "completed" });
        if (path.endsWith("/finalize")) {
          return json({
            evaluation: {
              constraint_compliance: "pass",
              verdict: "completed",
            },
          }, 201);
        }
        return json({ error_code: "unexpected_test_route" }, 404);
      },
    },
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

class MemoryGatewayNamespace {
  private readonly objects = new Map<string, AgentIdJitGrants>();

  idFromName(name: string): string {
    return name;
  }

  get(id: string): AgentIdJitGrants {
    let object = this.objects.get(id);
    if (!object) {
      const values = new Map<string, unknown>();
      object = new AgentIdJitGrants({
        storage: {
          async get<T>(key: string): Promise<T | undefined> {
            return values.get(key) as T | undefined;
          },
          async put<T>(keyOrEntries: string | Record<string, unknown>, value?: T): Promise<void> {
            if (typeof keyOrEntries === "string") {
              values.set(keyOrEntries, value);
              return;
            }
            for (const [key, entry] of Object.entries(keyOrEntries)) values.set(key, entry);
          },
        },
      });
      this.objects.set(id, object);
    }
    return object;
  }
}

class GatewayContext {
  private readonly promises: Promise<unknown>[] = [];

  waitUntil(promise: Promise<unknown>): void {
    this.promises.push(promise);
  }

  async flush(): Promise<void> {
    await Promise.all(this.promises.splice(0));
  }
}

function syntheticManifest(): Record<string, unknown> {
  return {
    agent: {
      id: "refund-demo-agent",
      name: "Synthetic refund agent",
      owner: "agentpass",
      environment: "production",
      purpose: "Synthetic observability integration tests",
    },
    jit_authorization: {
      enabled: true,
      default_ttl_seconds: 300,
      bind_token_to: ["agent_id", "user_id", "tool", "action", "resource", "approval_id"],
      revoke_after_use: true,
    },
    tools: [
      { name: "zendesk.search_tickets", access: "read", auth_mode: "delegated", approval: "none" },
      {
        name: "stripe.create_refund",
        access: "write",
        auth_mode: "just_in_time",
        approval: "human_confirm",
        constraints: { max_amount_usd: 100, token_ttl_seconds: 300 },
      },
    ],
    data_flows: [
      { from: "zendesk", to: "agent_context", allowed: true },
    ],
    runtime: { enforce_manifest: true },
  };
}
