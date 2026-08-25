type Fetcher = {
  fetch(request: Request): Promise<Response>;
};

type DurableObjectNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): Fetcher;
};

type DurableObjectState = {
  storage: {
    get<T = unknown>(key: string): Promise<T | undefined>;
    put<T = unknown>(key: string, value: T): Promise<void>;
  };
};

export type Env = {
  AGENTID_GATEWAY?: Fetcher;
  AGENTID_GATEWAY_TOKEN?: string;
  SIMULATION_CADENCE_MINUTES?: string;
  SIMULATION_ENABLED?: string;
  SIMULATION_JOB_CAP?: string;
  SIMULATION_TENANT_ID?: string;
  SYNTHETIC_RUN_STATE: DurableObjectNamespace;
};

type Scenario =
  | "completed"
  | "partial"
  | "failed"
  | "indeterminate"
  | "low-confidence"
  | "denial"
  | "retry"
  | "replay"
  | "missing-runtime"
  | "small-sample";

type RunResult = {
  constraint: string;
  profile_version: string;
  scenario: Scenario;
  verdict: string;
};

type RunSummary = {
  cadence_minutes: number;
  completed_at: string;
  enabled: boolean;
  job_count: number;
  profile_versions: string[];
  schedule_bucket: string;
  scenarios: Scenario[];
  started_at: string;
  status: "completed" | "disabled" | "failed" | "running";
  tenant_id: string;
  verdicts: Record<string, number>;
};

type GatewayResult = {
  body: Record<string, any>;
  status: number;
};

const PROFILE_NAME = "agentpass_synthetic_support_refund";
const PROFILE_VERSIONS = ["v1", "v2"] as const;
const SCENARIOS: readonly Scenario[] = [
  "completed",
  "partial",
  "failed",
  "indeterminate",
  "low-confidence",
  "denial",
  "retry",
  "replay",
  "missing-runtime",
  "small-sample",
];
const TENANT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/health") {
      return json({ error: "not found" }, 404);
    }
    return stateStub(env).fetch(new Request("https://synthetic-state.internal/health"));
  },

  async scheduled(
    controller: { scheduledTime: number },
    env: Env,
    ctx: { waitUntil(promise: Promise<unknown>): void },
  ): Promise<void> {
    const scheduledAt = new Date(controller.scheduledTime).toISOString();
    ctx.waitUntil(
      stateStub(env).fetch(new Request("https://synthetic-state.internal/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scheduled_at: scheduledAt }),
      })).then(async (response) => {
        if (!response.ok) throw new Error(`synthetic run state returned ${response.status}`);
        await response.arrayBuffer();
      }),
    );
  },
};

export default worker;

export class SyntheticRunState {
  private readonly state: DurableObjectState;
  private readonly env: Env;

  constructor(
    state: DurableObjectState,
    env: Env,
  ) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      const stored = await this.state.storage.get<RunSummary>("last_run");
      return json(stored || defaultHealth(this.env));
    }
    if (request.method !== "POST" || url.pathname !== "/run") {
      return json({ error: "not found" }, 404);
    }

    const input = await request.json() as { scheduled_at?: string };
    const scheduledAt = validDate(input.scheduled_at);
    const config = simulationConfig(this.env);
    const bucket = scheduleBucket(scheduledAt, config.cadenceMinutes);
    const previous = await this.state.storage.get<RunSummary>("last_run");
    if (previous?.schedule_bucket === bucket && previous.status === "completed") {
      return json({ ...previous, replayed: true });
    }

    const running: RunSummary = {
      cadence_minutes: config.cadenceMinutes,
      completed_at: "",
      enabled: config.enabled,
      job_count: 0,
      profile_versions: [],
      schedule_bucket: bucket,
      scenarios: [],
      started_at: new Date().toISOString(),
      status: config.enabled ? "running" : "disabled",
      tenant_id: config.tenantId,
      verdicts: {},
    };
    await this.state.storage.put("last_run", running);
    if (!config.enabled) {
      const disabled = { ...running, completed_at: new Date().toISOString() };
      await this.state.storage.put("last_run", disabled);
      return json(disabled);
    }

    try {
      const results = await runScheduledBatch(this.env, scheduledAt);
      const completed: RunSummary = {
        ...running,
        completed_at: new Date().toISOString(),
        job_count: results.length,
        profile_versions: [...new Set(results.map((result) => result.profile_version))],
        scenarios: results.map((result) => result.scenario),
        status: "completed",
        verdicts: countBy(results.map((result) => result.verdict)),
      };
      await this.state.storage.put("last_run", completed);
      return json(completed, 201);
    } catch (error) {
      const failed: RunSummary = {
        ...running,
        completed_at: new Date().toISOString(),
        status: "failed",
        verdicts: { error: 1 },
      };
      await this.state.storage.put("last_run", failed);
      console.error("synthetic run failed", safeErrorCode(error));
      return json(failed, 502);
    }
  }
}

export async function runScheduledBatch(env: Env, scheduledAt: string): Promise<RunResult[]> {
  const config = simulationConfig(env);
  if (!config.enabled) return [];
  if (!env.AGENTID_GATEWAY) throw new Error("gateway_binding_missing");
  if (!env.AGENTID_GATEWAY_TOKEN?.trim()) throw new Error("gateway_token_missing");

  for (const version of PROFILE_VERSIONS) {
    await expectGateway(
      env,
      "POST",
      "intent-profiles",
      intentProfile(version),
      [200, 201],
    );
  }

  const bucketIndex = Math.floor(Date.parse(scheduledAt) / (config.cadenceMinutes * 60_000));
  const results: RunResult[] = [];
  for (let offset = 0; offset < config.jobCap; offset += 1) {
    const version = PROFILE_VERSIONS[offset % PROFILE_VERSIONS.length];
    const scenario = SCENARIOS[(bucketIndex * config.jobCap + offset) % SCENARIOS.length];
    results.push(await runSyntheticJob(env, scheduledAt, version, scenario));
  }
  return results;
}

async function runSyntheticJob(
  env: Env,
  scheduledAt: string,
  version: typeof PROFILE_VERSIONS[number],
  scenario: Scenario,
): Promise<RunResult> {
  const config = simulationConfig(env);
  const bucket = scheduleBucket(scheduledAt, config.cadenceMinutes);
  const stem = `${bucket}-${version}-${scenario}`;
  const intentId = `synthetic-intent-${stem}`;
  const jobId = `synthetic-job-${stem}`;
  const approvalId = `synthetic-approval-${stem}`;
  const idempotencyKey = `synthetic-execution-${stem}`;
  const refundAmount = 29;
  const executionAmount = scenario === "failed" ? 31 : refundAmount;
  const profileKey = `${PROFILE_NAME}.${version}`;
  const issuance = await expectGateway(
    env,
    "POST",
    `intent-profiles/${encodeURIComponent(profileKey)}/issue`,
    {
      expires_at: "2099-12-31T23:59:59.000Z",
      intent_id: intentId,
      issued_at: scheduledAt,
      job_id: jobId,
      variables: {
        currency: "USD",
        payment_id: `pi_${compactBucket(bucket)}${version}`,
        refund_amount: refundAmount,
      },
    },
    [200, 201],
  );
  const intentDigest = requiredString(issuance.body.intent_digest, "intent_digest_missing");
  const binding = { intent_digest: intentDigest, intent_id: intentId, job_id: jobId };
  const shouldExecute = !["indeterminate", "low-confidence"].includes(scenario);

  if (shouldExecute) {
    await authorizedCall(env, {
      ...binding,
      action: "read",
      agent_id: "refund-demo-agent",
      data_from: "zendesk",
      data_to: "agent_context",
      decision_id: `synthetic-read-${stem}`,
      tool: "zendesk.search_tickets",
    });
    if (scenario === "retry") {
      await authorizedCall(env, {
        ...binding,
        action: "read",
        agent_id: "refund-demo-agent",
        data_from: "zendesk",
        data_to: "agent_context",
        decision_id: `synthetic-read-retry-${stem}`,
        prior_attempt_count: 1,
        tool: "zendesk.search_tickets",
      });
    }

    const approvalPayload = {
      ...binding,
      action: "write",
      agent_id: "refund-demo-agent",
      amount: executionAmount,
      approval_id: approvalId,
      currency: "USD",
      idempotency_key: idempotencyKey,
      reason: "duplicate_charge",
      requested_by: "agentaction-synthetic-runner",
      resource: `refund/${stem}`,
      tool: "stripe.create_refund",
      user_id: "agentaction-synthetic-runner",
    };
    await expectGateway(env, "POST", "approval-requests", approvalPayload, [200, 201]);
    await expectGateway(
      env,
      "POST",
      `approval-requests/${encodeURIComponent(approvalId)}/approve`,
      {
        decided_by: "agentaction-synthetic-runner",
        decision_reason: "deterministic synthetic approval",
      },
      [200],
    );
    const grant = await expectGateway(env, "POST", "jit-grants", approvalPayload, [200, 201]);
    const executionAction = {
      ...approvalPayload,
      approved: true,
      decision_id: `synthetic-execute-${stem}`,
      jit_grant_id: requiredString(grant.body.jit_grant_id, "jit_grant_id_missing"),
    };
    await authorizedCall(env, executionAction);
    await expectGateway(
      env,
      "POST",
      "execution-results",
      {
        ...executionAction,
        result: {
          simulation: true,
          status: "succeeded",
        },
      },
      [200, 201],
    );
    if (scenario === "replay") {
      const replay = await expectGateway(env, "POST", "authorize", executionAction, [200]);
      if (replay.body.replayed !== true) throw new Error("expected_provider_replay");
    }
  }

  if (scenario === "denial") {
    const denial = await expectGateway(
      env,
      "POST",
      "authorize",
      {
        ...binding,
        action: "write",
        agent_id: "refund-demo-agent",
        decision_id: `synthetic-denial-${stem}`,
        resource: `external/${stem}`,
        tool: "synthetic.external_side_effect",
      },
      [403],
    );
    if (denial.body.allow !== false) throw new Error("expected_policy_denial");
  }

  const job = jobEvidence(config.tenantId, binding, scheduledAt, scenario);
  await expectGateway(
    env,
    "POST",
    `intent-contracts/${encodeURIComponent(intentId)}/evaluate`,
    job ? { job } : {},
    [200],
  );
  const finalized = await expectGateway(
    env,
    "POST",
    `intent-contracts/${encodeURIComponent(intentId)}/finalize`,
    job ? { job } : {},
    [200, 201],
  );
  const evaluation = record(finalized.body.evaluation);
  return {
    constraint: requiredString(evaluation.constraint_compliance, "constraint_missing"),
    profile_version: version,
    scenario,
    verdict: requiredString(evaluation.verdict, "verdict_missing"),
  };
}

function jobEvidence(
  tenantId: string,
  binding: Record<string, string>,
  scheduledAt: string,
  scenario: Scenario,
): Record<string, unknown> | undefined {
  if (scenario === "indeterminate" || scenario === "low-confidence") return undefined;
  const started = new Date(Date.parse(scheduledAt) - 4_000).toISOString();
  const job: Record<string, unknown> = {
    ...binding,
    agent_id: "refund-demo-agent",
    simulation: true,
    tenant_id: tenantId,
  };
  if (scenario !== "missing-runtime") job.started_at = started;
  if (scenario !== "partial" && scenario !== "failed") job.completed_at = scheduledAt;
  return job;
}

function intentProfile(version: typeof PROFILE_VERSIONS[number]): Record<string, unknown> {
  return {
    schema_version: "agentpass.intent-profile.v1",
    profile: PROFILE_NAME,
    version,
    issuer: "agentaction-synthetic-runner",
    issued_at: "2026-01-01T00:00:00.000Z",
    objective_template: version === "v1"
      ? "Safely simulate refund {{payment_id}} for {{refund_amount}} {{currency}}"
      : "Continuously verify refund control {{payment_id}} for {{refund_amount}} {{currency}}",
    variables: {
      payment_id: { type: "string", required: true, pattern: "^pi_[A-Za-z0-9]+$" },
      refund_amount: { type: "number", required: true, minimum: 0.01, maximum: 100 },
      currency: { type: "string", default: "USD", enum: ["USD"] },
    },
    required_outcomes: [
      {
        id: "refund-amount-correct",
        source: "execution_receipts",
        where: [{ path: "tool", operator: "equals", value: "stripe.create_refund" }],
        assertion: {
          path: "amount",
          operator: "equals",
          quantifier: "all",
          value: { $variable: "refund_amount" },
        },
      },
      {
        id: "job-completed",
        source: "job",
        assertion: { path: "completed_at", operator: "exists" },
      },
    ],
    hard_constraints: [
      {
        id: "no-denied-actions",
        source: "decision_events",
        where: [{ path: "decision", operator: "equals", value: "deny" }],
        assertion: { operator: "count_equals", value: 0 },
      },
    ],
    preferences: {
      max_denied_decisions: 0,
      max_estimated_cost_usd: version === "v1" ? 0.05 : 0.04,
      max_execution_receipts: 1,
      max_replays: 0,
      max_retries: 0,
      max_runtime_ms: 30_000,
      max_tool_calls: 3,
    },
    evidence_requirements: ["decision_events", "execution_receipts", "job"],
  };
}

async function authorizedCall(env: Env, payload: Record<string, unknown>): Promise<GatewayResult> {
  const response = await expectGateway(env, "POST", "authorize", payload, [200]);
  if (response.body.allow !== true) throw new Error("expected_authorization_allow");
  return response;
}

async function expectGateway(
  env: Env,
  method: string,
  endpoint: string,
  body: Record<string, unknown> | undefined,
  acceptedStatuses: number[],
): Promise<GatewayResult> {
  const result = await gatewayJson(env, method, endpoint, body);
  if (!acceptedStatuses.includes(result.status)) {
    const code = requiredString(result.body.error_code, `gateway_status_${result.status}`);
    throw new Error(`gateway_${endpoint.split("/")[0]}_${code}`);
  }
  return result;
}

async function gatewayJson(
  env: Env,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>,
): Promise<GatewayResult> {
  if (!env.AGENTID_GATEWAY) throw new Error("gateway_binding_missing");
  const token = env.AGENTID_GATEWAY_TOKEN?.trim();
  if (!token) throw new Error("gateway_token_missing");
  const tenantId = simulationConfig(env).tenantId;
  const request = new Request(
    `https://agentid-gateway.internal/tenants/${encodeURIComponent(tenantId)}/${endpoint}`,
    {
      method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "agentaction-synthetic-runner/0.1",
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  const response = await env.AGENTID_GATEWAY.fetch(request);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`gateway_${endpoint.split("/")[0]}_invalid_json`);
  }
  return { body: record(payload), status: response.status };
}

export function scheduleBucket(value: string, cadenceMinutes: number): string {
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) throw new Error("scheduled_at_invalid");
  const cadenceMs = cadenceMinutes * 60_000;
  return new Date(Math.floor(instant / cadenceMs) * cadenceMs)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(".000Z", "Z")
    .toLowerCase();
}

function simulationConfig(env: Env): {
  cadenceMinutes: number;
  enabled: boolean;
  jobCap: number;
  tenantId: string;
} {
  const tenantId = env.SIMULATION_TENANT_ID?.trim() || "";
  if (!TENANT_PATTERN.test(tenantId)) throw new Error("simulation_tenant_invalid");
  return {
    cadenceMinutes: boundedInteger(env.SIMULATION_CADENCE_MINUTES, 15, 1, 60, "simulation_cadence_invalid"),
    enabled: env.SIMULATION_ENABLED === "true",
    jobCap: boundedInteger(env.SIMULATION_JOB_CAP, 2, 1, 2, "simulation_job_cap_invalid"),
    tenantId,
  };
}

function defaultHealth(env: Env): RunSummary {
  const config = simulationConfig(env);
  return {
    cadence_minutes: config.cadenceMinutes,
    completed_at: "",
    enabled: config.enabled,
    job_count: 0,
    profile_versions: [],
    schedule_bucket: "",
    scenarios: [],
    started_at: "",
    status: config.enabled ? "running" : "disabled",
    tenant_id: config.tenantId,
    verdicts: {},
  };
}

function stateStub(env: Env): Fetcher {
  if (!env.SYNTHETIC_RUN_STATE) throw new Error("synthetic_state_binding_missing");
  return env.SYNTHETIC_RUN_STATE.get(env.SYNTHETIC_RUN_STATE.idFromName("singleton"));
}

function validDate(value: unknown): string {
  const text = typeof value === "string" ? value : "";
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) throw new Error("scheduled_at_invalid");
  return new Date(timestamp).toISOString();
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  errorCode: string,
): number {
  const parsed = value === undefined || value.trim() === "" ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(errorCode);
  return parsed;
}

function requiredString(value: unknown, errorCode: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(errorCode);
  return value.trim();
}

function record(value: unknown): Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function compactBucket(bucket: string): string {
  return bucket.replace(/[^a-z0-9]/g, "");
}

function safeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown_error";
  return /^[a-z0-9_/-]+$/i.test(message) ? message.slice(0, 160) : "synthetic_run_error";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}
