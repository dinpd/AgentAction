import test from "node:test";
import assert from "node:assert/strict";
import worker, {
  AgentIdJitGrants,
  WorkatoRefunds,
  MockRefundProvider,
  sha256,
  type Env,
} from "../src/worker.ts";

class MemoryStorage {
  values = new Map<string, any>();
  async get(key: string | string[]): Promise<any> {
    return Array.isArray(key)
      ? new Map(
          key
            .filter((k) => this.values.has(k))
            .map((k) => [k, structuredClone(this.values.get(k))]),
        )
      : structuredClone(this.values.get(key));
  }
  async put(key: string | Record<string, any>, value?: any): Promise<void> {
    if (typeof key === "string") this.values.set(key, structuredClone(value));
    else
      for (const [k, v] of Object.entries(key))
        this.values.set(k, structuredClone(v));
  }
  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }
  async list(options?: { prefix?: string }): Promise<Map<string, any>> {
    return new Map(
      [...this.values]
        .filter(([k]) => !options?.prefix || k.startsWith(options.prefix))
        .map(([k, v]) => [k, structuredClone(v)]),
    );
  }
}
class Namespace {
  stores = new Map<string, MemoryStorage>();
  objects = new Map<string, any>();
  factory: (state: any) => any;
  constructor(factory: (state: any) => any) {
    this.factory = factory;
  }
  idFromName(name: string): string {
    return name;
  }
  get(name: string): any {
    if (!this.stores.has(name)) this.stores.set(name, new MemoryStorage());
    if (!this.objects.has(name))
      this.objects.set(name, this.factory({ storage: this.stores.get(name)! }));
    return this.objects.get(name);
  }
  restart(name: string): void {
    this.objects.delete(name);
  }
}
const recipe = "r".repeat(40),
  reviewer = "v".repeat(40),
  other = "o".repeat(40);
async function setup() {
  const jit = new Namespace((state) => new AgentIdJitGrants(state));
  const provider = new Namespace((state) => new MockRefundProvider(state));
  const refunds = new Namespace((state) => new WorkatoRefunds(state, env));
  const env: Env = {
    JIT_GRANTS: jit,
    MOCK_PROVIDER: provider,
    REFUNDS: refunds,
    WORKATO_CLIENTS_JSON: JSON.stringify([
      {
        token_sha256: await sha256(recipe),
        tenant_id: "demo",
        subject: "workato",
        agent_id: "support",
        role: "recipe",
      },
      {
        token_sha256: await sha256(reviewer),
        tenant_id: "demo",
        subject: "human",
        agent_id: "support",
        role: "reviewer",
      },
      {
        token_sha256: await sha256(other),
        tenant_id: "other",
        subject: "workato",
        agent_id: "support",
        role: "recipe",
      },
    ]),
  };
  async function call(
    path: string,
    method = "GET",
    input?: unknown,
    token = recipe,
    headers = {},
  ) {
    const response = await worker.fetch(
      new Request(`https://demo.test${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          ...headers,
        },
        body: input === undefined ? undefined : JSON.stringify(input),
      }),
      env,
    );
    return { status: response.status, body: (await response.json()) as any };
  }
  const scope = {
    request_id: "case-1",
    payment_id: "pi_demo_1",
    amount_cents: 4900,
    currency: "USD",
    reason: "duplicate_charge",
  };
  async function submit(input = scope) {
    const out = await call("/requests", "POST", input);
    assert.equal(out.status, 201, JSON.stringify(out.body));
    return out.body;
  }
  async function approve(r: any) {
    return call(
      `/requests/${r.request_id}/approve`,
      "POST",
      {
        scope_digest: r.scope_digest,
        decision_reason: "Synthetic duplicate charge verified",
      },
      reviewer,
    );
  }
  return { env, call, scope, submit, approve, refunds, provider, jit };
}

test("automatic policy executes once with JIT and signed evidence without a reviewer or approval", async () => {
  const f = await setup();
  const result = await f.call("/automatic/requests", "POST", f.scope);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.status, "succeeded");
  assert.equal(result.body.authorization_mode, "automatic");
  assert.equal(result.body.policy_decision, "allowed");
  assert.equal(result.body.approval_id, "");
  assert.equal(result.body.approval_url, "");
  assert.equal(result.body.mutation_count, 1);
  assert.equal(result.body.qualified_success, true);
  const evidence = (await f.call("/requests/case-1/evidence")).body;
  assert.equal(evidence.authorization.approved, false);
  assert.equal(evidence.authorization.jit_grant_valid, true);
  assert.equal(evidence.observation.provenance.verification_method, "jws");
  assert.ok(evidence.timeline.some((e: any) => e.type === "policy.allowed"));
  assert.equal((await f.jit.stores.get("demo")!.list({ prefix: "approval:" })).size, 0);
});

test("automatic policy denies over-cap and unauthorized requests without mutation", async () => {
  const f = await setup();
  const denied = await f.call("/automatic/requests", "POST", { ...f.scope, amount_cents: 10100 });
  assert.equal(denied.body.status, "denied");
  assert.equal(denied.body.policy_decision, "denied");
  assert.equal(denied.body.mutation_count, 0);
  assert.equal((await f.call("/automatic/requests", "POST", f.scope, reviewer)).status, 403);
  assert.equal((await f.call("/automatic/requests", "POST", f.scope, "x".repeat(40))).status, 401);
  assert.equal(f.provider.stores.size, 0);
});

test("automatic proposals reject invalid scope and caller-supplied authority before mutation", async () => {
  const f = await setup();
  for (const invalid of [
    { amount_cents: "4900" },
    { amount_cents: 49.5 },
    { amount_cents: 0 },
    { currency: "EUR" },
    { reason: "arbitrary" },
    { approved: true },
    { authorization_mode: "automatic" },
    { tenant_id: "other" },
    { simulate_response_loss: "false" },
  ]) {
    assert.equal((await f.call("/automatic/requests", "POST", { ...f.scope, ...invalid })).status, 400);
  }
  assert.equal(f.provider.stores.size, 0);
});

test("automatic accepted request survives lost response and resumes without review", async () => {
  const f = await setup();
  const scope = { ...f.scope, simulate_response_loss: true };
  assert.equal((await f.call("/automatic/requests", "POST", scope)).status, 504);
  assert.equal(f.provider.stores.size, 0);
  f.refunds.restart("demo");
  const result = await f.call("/automatic/requests", "POST", scope);
  assert.equal(result.body.status, "succeeded");
  assert.equal(result.body.replayed, true);
  assert.equal(result.body.mutation_count, 1);
  assert.equal(result.body.approval_id, "");
});

test("caller cannot change manual policy through flags, headers, or reuse across paths", async () => {
  const f = await setup();
  const manual = await f.call("/requests", "POST", f.scope, recipe, { "x-policy-mode": "automatic" });
  assert.equal(manual.body.status, "pending");
  assert.equal(manual.body.authorization_mode, "human");
  assert.equal((await f.call("/automatic/requests", "POST", f.scope)).status, 409);
  assert.equal((await f.call("/requests", "POST", { ...f.scope, authorization_mode: "automatic" })).status, 400);
  assert.equal((await f.call("/requests/case-1/execute", "POST", {})).status, 409);
  const automatic = { ...f.scope, request_id: "auto-1" };
  await f.call("/automatic/requests", "POST", automatic);
  assert.equal((await f.call("/requests", "POST", automatic)).status, 409);
});

test("concurrent automatic retries preserve one refund, original final evidence, and immutable scope", async () => {
  const f = await setup();
  const runs = await Promise.all(Array.from({ length: 8 }, () => f.call("/automatic/requests", "POST", f.scope)));
  assert.equal(runs.filter(r => r.status === 201).length, 1);
  assert.equal(new Set(runs.map(r => r.body.refund_id)).size, 1);
  assert.ok(runs.every(r => r.body.mutation_count === 1));
  const before = (await f.call("/requests/case-1/evidence")).body.finalization;
  const replay = await f.call("/automatic/requests", "POST", f.scope);
  assert.equal(replay.body.replayed, true);
  assert.deepEqual((await f.call("/requests/case-1/evidence")).body.finalization, before);
  assert.equal((await f.call("/automatic/requests", "POST", { ...f.scope, amount_cents: 5000 })).status, 409);
});

test("automatic request recovers original refund after provider-success crash and restart", async () => {
  const f = await setup();
  f.refunds.get("demo").failpoint = (name: string) => { if (name === "after_provider") throw Error("crash"); };
  assert.equal((await f.call("/automatic/requests", "POST", f.scope)).status, 503);
  const original = await f.provider.stores.get("demo")!.get("refund:case-1");
  f.refunds.restart("demo");
  const recovered = await f.call("/automatic/requests", "POST", f.scope);
  assert.equal(recovered.body.status, "succeeded");
  assert.equal(recovered.body.refund_id, original.refund_id);
  assert.equal(recovered.body.mutation_count, 1);
  assert.equal(recovered.body.qualified_success, true);
});

test("pending -> human approval -> one refund -> signed outcome -> final snapshot", async () => {
  const f = await setup();
  const pending = await f.submit();
  assert.equal(pending.status, "pending");
  assert.equal(pending.mutation_count, 0);
  const approved = await f.approve(pending);
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.status, "succeeded");
  assert.equal(approved.body.mutation_count, 1);
  assert.equal(approved.body.outcome_verdict, "completed");
  assert.equal(approved.body.qualified_success, true);
  const evidence = (await f.call("/requests/case-1/evidence")).body;
  assert.equal(evidence.observation.provenance.verification_method, "jws");
  const attestation = evidence.provider_attestation;
  const [header, payload, signature] = attestation.jws.split(".");
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    attestation.public_jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  assert.equal(
    await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      Buffer.from(signature, "base64url"),
      new TextEncoder().encode(`${header}.${payload}`),
    ),
    true,
  );
  assert.equal(
    JSON.parse(Buffer.from(payload, "base64url").toString()).observation
      .intent_digest,
    evidence.intent_digest,
  );
  assert.equal(evidence.finalization.evaluation.evaluation_mode, "final");
  assert.ok(evidence.finalization.snapshot.evidence_digest);
  assert.equal(
    evidence.finalization.snapshot.evidence.execution_receipts.length,
    1,
  );
});
test("recipe token cannot approve, deny, or list reviewer requests", async () => {
  const f = await setup();
  const r = await f.submit();
  assert.equal((await f.call("/requests")).status, 403);
  for (const action of ["approve", "deny"])
    assert.equal(
      (
        await f.call(`/requests/case-1/${action}`, "POST", {
          scope_digest: r.scope_digest,
          decision_reason: "spoofed",
        })
      ).status,
      403,
    );
  assert.equal(
    (await f.call("/requests/case-1/execute", "POST", {})).status,
    409,
  );
  assert.equal((await f.call("/requests/case-1")).body.mutation_count, 0);
});
test("over-limit request is denied with zero provider mutations", async () => {
  const f = await setup();
  const r = await f.submit({ ...f.scope, amount_cents: 10100 });
  assert.equal(r.status, "denied");
  assert.equal(r.mutation_count, 0);
  assert.equal(f.provider.stores.size, 0);
});
test("immutable request rejects changed amount, payment, reason, and currency under same business key", async () => {
  const f = await setup();
  const r = await f.submit();
  for (const change of [
    { amount_cents: 5000 },
    { payment_id: "pi_other" },
    { reason: "service_failure" },
  ])
    assert.equal(
      (await f.call("/requests", "POST", { ...f.scope, ...change })).status,
      409,
    );
  assert.equal(
    (await f.call("/requests", "POST", { ...f.scope, currency: "EUR" })).status,
    400,
  );
  assert.equal(
    (
      await f.call(
        "/requests/case-1/approve",
        "POST",
        { scope_digest: "changed", decision_reason: "wrong scope" },
        reviewer,
      )
    ).status,
    409,
  );
  assert.equal((await f.approve(r)).body.mutation_count, 1);
  assert.equal(
    (await f.call("/requests", "POST", { ...f.scope, amount_cents: 5000 }))
      .status,
    409,
  );
});
test("concurrent submits and execution retries keep the original refund and final receipt", async () => {
  const f = await setup();
  const requests = await Promise.all(
    Array.from({ length: 8 }, () => f.call("/requests", "POST", f.scope)),
  );
  assert.equal(requests.filter((r) => r.status === 201).length, 1);
  const approved = await f.approve(requests[0].body);
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  const retries = await Promise.all(
    Array.from({ length: 8 }, () =>
      f.call("/requests/case-1/execute", "POST", {}),
    ),
  );
  for (const retry of retries) {
    assert.equal(retry.body.refund_id, approved.body.refund_id);
    assert.equal(retry.body.replayed, true);
    assert.equal(retry.body.mutation_count, 1);
  }
  assert.equal(f.provider.stores.get("demo")!.values.size, 2);
});
test("crash after provider success survives Durable Object restart without second mutation", async () => {
  const f = await setup();
  const pending = await f.submit();
  f.refunds.get("demo").failpoint = (name: string) => {
    if (name === "after_provider") throw Error("crash");
  };
  assert.equal((await f.approve(pending)).status, 503);
  f.refunds.restart("demo");
  f.provider.restart("demo");
  f.jit.restart("demo");
  const recovered = await f.call("/requests/case-1/execute", "POST", {});
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  assert.equal(recovered.body.status, "succeeded");
  assert.equal(recovered.body.mutation_count, 1);
  assert.equal(recovered.body.qualified_success, true);
});
test("crash before provider mutation enters uncertainty and never blindly retries", async () => {
  const f = await setup();
  const pending = await f.submit();
  f.refunds.get("demo").failpoint = (name: string) => {
    if (name === "before_provider") throw Error("crash");
  };
  assert.equal((await f.approve(pending)).status, 503);
  f.refunds.restart("demo");
  for (let i = 0; i < 3; i++) {
    const retry = await f.call("/requests/case-1/execute", "POST", {});
    assert.equal(retry.body.status, "unknown");
    assert.equal(retry.body.mutation_count, 0);
  }
  assert.equal(f.provider.stores.get("demo")!.values.size, 0);
});
test("crash after execution-result storage recovers one receipt", async () => {
  const f = await setup();
  const pending = await f.submit();
  f.refunds.get("demo").failpoint = (name: string) => {
    if (name === "after_execution_result") throw Error("crash");
  };
  assert.equal((await f.approve(pending)).status, 503);
  f.refunds.restart("demo");
  const recovered = await f.call("/requests/case-1/execute", "POST", {});
  assert.equal(
    recovered.body.status,
    "succeeded",
    JSON.stringify(recovered.body),
  );
  assert.equal(recovered.body.mutation_count, 1);
});
test("simulated lost response retries the durable accepted request", async () => {
  const f = await setup();
  assert.equal(
    (
      await f.call("/requests", "POST", {
        ...f.scope,
        simulate_response_loss: true,
      })
    ).status,
    504,
  );
  const retry = await f.call("/requests", "POST", {
    ...f.scope,
    simulate_response_loss: true,
  });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.replayed, true);
  assert.equal(retry.body.status, "pending");
  assert.equal((await f.approve(retry.body)).body.mutation_count, 1);
});
for (const boundary of [
  "after_verified_observation",
  "after_observation",
  "after_finalize",
]) {
  test(`crash at ${boundary} resumes the same frozen evidence and refund`, async () => {
    const f = await setup();
    const pending = await f.submit();
    f.refunds.get("demo").failpoint = (name: string) => {
      if (name === boundary) throw Error("crash");
    };
    assert.equal((await f.approve(pending)).status, 503);
    f.refunds.restart("demo");
    f.jit.restart("demo");
    const recovered = await f.call("/requests/case-1/execute", "POST", {});
    assert.equal(
      recovered.body.status,
      "succeeded",
      JSON.stringify(recovered.body),
    );
    assert.equal(recovered.body.mutation_count, 1);
    assert.equal(recovered.body.qualified_success, true);
  });
}
test("expired and denied approvals cannot mutate", async () => {
  for (const expired of [true, false]) {
    const f = await setup();
    const r = await f.submit();
    if (expired) {
      const record = await f.refunds.stores.get("demo")!.get("request:case-1");
      record.approval.expires_at = "2000-01-01T00:00:00Z";
      await f.refunds.stores.get("demo")!.put("request:case-1", record);
      assert.equal((await f.call("/requests/case-1")).body.status, "expired");
      assert.equal((await f.approve(r)).status, 409);
    } else
      assert.equal(
        (
          await f.call(
            "/requests/case-1/deny",
            "POST",
            {
              scope_digest: r.scope_digest,
              decision_reason: "Denied synthetic test",
            },
            reviewer,
          )
        ).body.status,
        "denied",
      );
    assert.equal(
      (await f.call("/requests/case-1/execute", "POST", {})).status,
      409,
    );
    assert.equal(f.provider.stores.size, 0);
  }
});
test("tenant and subject come from authentication; caller identity fields and headers cannot override", async () => {
  const f = await setup();
  await f.submit();
  assert.equal(
    (await f.call("/requests/case-1", "GET", undefined, other)).status,
    404,
  );
  assert.equal(
    (await f.call("/requests", "POST", { ...f.scope, tenant_id: "other" }))
      .status,
    400,
  );
  assert.equal(
    (
      await f.call("/requests/case-1", "GET", undefined, other, {
        "x-principal": JSON.stringify({ tenant_id: "demo", role: "reviewer" }),
      })
    ).status,
    404,
  );
  const second = await f.call("/requests", "POST", f.scope, other);
  assert.equal(second.status, 201);
  assert.equal(second.body.tenant_id, "other");
});
test("missing and bad credentials fail closed", async () => {
  const f = await setup();
  assert.equal(
    (await f.call("/requests", "POST", f.scope, "wrong")).status,
    401,
  );
  delete f.env.WORKATO_CLIENTS_JSON;
  assert.equal((await f.call("/requests", "POST", f.scope)).status, 503);
  assert.equal(f.refunds.stores.size, 0);
});
test("bounded and validated inputs reject before durable mutations", async () => {
  const f = await setup();
  for (const amount of [0, -1, 1.5, "4900", 1000001])
    assert.equal(
      (await f.call("/requests", "POST", { ...f.scope, amount_cents: amount }))
        .status,
      400,
    );
  for (const change of [
    { request_id: "../escape" },
    { reason: "anything" },
    { simulate_response_loss: "true" },
  ])
    assert.equal(
      (await f.call("/requests", "POST", { ...f.scope, ...change })).status,
      400,
    );
  assert.equal(
    (
      await f.call("/requests", "POST", {
        ...f.scope,
        reason: "x".repeat(9000),
      })
    ).status,
    413,
  );
  assert.equal(
    (await f.call("/requests?tenant_id=other", "POST", f.scope)).status,
    400,
  );
  assert.equal(
    (await f.call("/requests", "POST", f.scope, reviewer)).status,
    403,
  );
  assert.equal(f.refunds.stores.get("demo")?.values.size || 0, 0);
  f.env.WORKATO_CLIENTS_JSON = "[]";
  assert.equal((await f.call("/requests", "POST", f.scope)).status, 503);
});
test("provider cannot be called through public routes; no tokens or private keys in evidence", async () => {
  const f = await setup();
  const r = await f.submit();
  await f.approve(r);
  for (const path of [
    "/refund",
    "/authorize",
    "/jit-grants",
    "/gateway/authorize",
  ])
    assert.equal((await f.call(path, "POST", {})).status, 404);
  const out = JSON.stringify((await f.call("/requests/case-1/evidence")).body);
  for (const secret of [
    recipe,
    reviewer,
    "token_sha256",
    "private_jwk",
    "signing-key",
  ])
    assert.ok(!out.includes(secret));
});
test("provider signatures are checked before accepting outcome evidence", async () => {
  const f = await setup();
  const r = await f.submit();
  const original = f.provider.get("demo").handle.bind(f.provider.get("demo"));
  f.provider.get("demo").handle = async (request: Request) => {
    const response = await original(request);
    if (new URL(request.url).pathname === "/observation") {
      const out = await response.json();
      out.jws = out.jws.slice(0, -12) + "AAAAAAAAAAAA";
      return Response.json(out);
    }
    return response;
  };
  assert.equal((await f.approve(r)).status, 503);
  assert.equal(
    (await f.call("/requests/case-1")).body.status,
    "evidence_pending",
  );
  assert.equal(
    (await f.call("/requests/case-1/evidence")).body.qualified_success,
    false,
  );
});
