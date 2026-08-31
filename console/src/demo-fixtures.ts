import jobDetailFixture from "../fixtures/support-refund-job-detail.json" with { type: "json" };
import jobsFixture from "../fixtures/support-refund-jobs.json" with { type: "json" };
import overviewFixture from "../fixtures/support-refund-overview.json" with { type: "json" };

import type { Env } from "./worker.ts";

export const PUBLIC_DEMO_TENANT_ID = "acme";

type FixtureRecord = Record<string, any>;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function overviewPayload(url: URL): FixtureRecord {
  const payload = structuredClone(overviewFixture) as FixtureRecord;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (from && to) {
    payload.filters.time_window.from = from;
    payload.filters.time_window.to = to;
    for (const rollup of payload.rollups) {
      rollup.time_window.from = from;
      rollup.time_window.to = to;
    }
  }
  for (const name of ["profile_key", "profile_version", "agent_id", "verdict", "constraint_compliance"]) {
    const value = url.searchParams.get(name);
    if (value) payload.filters[name] = value;
  }
  payload.rollups = payload.rollups.filter((rollup: FixtureRecord) => {
    const profileKey = url.searchParams.get("profile_key");
    const profileVersion = url.searchParams.get("profile_version");
    return (!profileKey || rollup.profile_key === profileKey)
      && (!profileVersion || rollup.profile_version === profileVersion);
  });
  payload.matched_records = payload.rollups.reduce(
    (total: number, rollup: FixtureRecord) => total + Number(rollup.sample.finalized_jobs || 0),
    0,
  );
  payload.pagination.total_groups = payload.rollups.length;
  payload.pagination.returned_groups = payload.rollups.length;
  return payload;
}

function jobsPayload(url: URL): FixtureRecord {
  const payload = structuredClone(jobsFixture) as FixtureRecord;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (from && to) {
    payload.filters.time_window.from = from;
    payload.filters.time_window.to = to;
  }
  const filters = {
    profile_key: (job: FixtureRecord, value: string) => job.profile_binding?.key === value,
    profile_version: (job: FixtureRecord, value: string) => job.profile_binding?.version === value,
    agent_id: (job: FixtureRecord, value: string) => Array.isArray(job.agent_ids) && job.agent_ids.includes(value),
    verdict: (job: FixtureRecord, value: string) => job.verdict === value,
    constraint_compliance: (job: FixtureRecord, value: string) => job.constraint_compliance === value,
    confidence: (job: FixtureRecord, value: string) => job.confidence_band === value,
    job_id: (job: FixtureRecord, value: string) => job.job_id === value,
    intent_id: (job: FixtureRecord, value: string) => job.intent_id === value,
  };
  payload.jobs = payload.jobs.filter((job: FixtureRecord) =>
    Object.entries(filters).every(([name, matches]) => {
      const value = url.searchParams.get(name);
      return !value || matches(job, value);
    })
  );
  payload.matched_records = payload.jobs.length;
  payload.pagination.returned_jobs = payload.jobs.length;
  payload.pagination.next_cursor = null;
  return payload;
}

function activityPayload(url: URL): FixtureRecord {
  const events: FixtureRecord[] = [
    {
      schema_version: "agentaction.hermes-observation.v1",
      event_id: "obs_demo_tool_1",
      event_type: "tool_action",
      observed_at: "2026-08-31T18:00:00.000Z",
      source_id: "hermes-demo",
      agent_id: "refund-agent",
      correlation: { session_id: "session-demo", task_id: "job-refund-partial", turn_id: "turn-4", tool_call_id: "tool-7" },
      intent: { binding_status: "bound", intent_id: "intent-refund-partial", intent_digest: "synthetic-demo-digest" },
      tool: { name: "stripe.create_refund", action: "write" },
      evaluation: { status: "evaluated", counterfactual_decision: "challenge_required", findings: ["approval_required"] },
      execution: { status: "ok", duration_ms: 184 },
    },
    {
      schema_version: "agentaction.hermes-observation.v1",
      event_id: "obs_demo_model_1",
      event_type: "model_request_completed",
      observed_at: "2026-08-31T17:59:58.000Z",
      source_id: "hermes-demo",
      agent_id: "refund-agent",
      correlation: { session_id: "session-demo", task_id: "job-refund-partial", turn_id: "turn-4", api_request_id: "api-4" },
      intent: { binding_status: "unbound" },
      model: { provider: "synthetic", model: "demo-model" },
      execution: { status: "ok", duration_ms: 920 },
      usage: { input_tokens: 340, output_tokens: 88, total_tokens: 428 },
    },
  ];
  const filtered = events.filter((event) => {
    const checks = [
      ["agent_id", event.agent_id],
      ["event_type", event.event_type],
      ["tool", event.tool?.name],
      ["decision", event.evaluation?.counterfactual_decision],
      ["execution_status", event.execution?.status],
      ["intent_binding", event.intent?.binding_status],
    ];
    return checks.every(([name, actual]) => !url.searchParams.get(String(name)) || url.searchParams.get(String(name)) === actual);
  });
  return {
    schema_version: "agentaction.activity-page.v1",
    tenant_id: PUBLIC_DEMO_TENANT_ID,
    events: filtered,
    count: filtered.length,
    next_cursor: null,
  };
}

export function createPublicDemoEnv(options: { stale?: boolean } = {}): Env {
  return {
    CONSOLE_ENVIRONMENT: "development",
    CONSOLE_ENABLE_MOCK_IDENTITY: "true",
    CONSOLE_MOCK_TENANT_ID: PUBLIC_DEMO_TENANT_ID,
    CONSOLE_MOCK_SUBJECT: "public-demo",
    CONSOLE_PUBLIC_DEMO: "true",
    CONSOLE_STALE_AFTER_SECONDS: "300",
    AGENTID_GATEWAY: {
      async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const generatedAt = new Date(
          Date.now() - (options.stale ? 20 * 60 * 1000 : 0),
        ).toISOString();
        const freshnessHeaders = { "x-agentpass-generated-at": generatedAt };
        const tenantPrefix = `/tenants/${PUBLIC_DEMO_TENANT_ID}`;

        if (url.pathname === `${tenantPrefix}/health`) {
          return json({ ok: true, tenant_id: PUBLIC_DEMO_TENANT_ID, data_source: "synthetic-fixtures" }, 200, freshnessHeaders);
        }
        if (url.pathname === `${tenantPrefix}/intent-quality/rollups`) {
          return json(overviewPayload(url), 200, freshnessHeaders);
        }
        if (url.pathname === `${tenantPrefix}/intent-quality/jobs`) {
          return json(jobsPayload(url), 200, freshnessHeaders);
        }
        if (url.pathname === `${tenantPrefix}/activity/events`) {
          return json(activityPayload(url), 200, freshnessHeaders);
        }
        const detailMatch = url.pathname.match(new RegExp(`^${tenantPrefix}/intent-quality/jobs/([^/]+)$`));
        if (detailMatch) {
          const jobId = decodeURIComponent(detailMatch[1]);
          return jobId === (jobDetailFixture as FixtureRecord).job.job_id
            ? json(structuredClone(jobDetailFixture), 200, freshnessHeaders)
            : json({ error: { code: "intent_quality_job_not_found", message: "Synthetic finalized Job receipt not found." } }, 404);
        }
        return json({ error: { code: "public_demo_route_not_found", message: "This route is not available in the public demo." } }, 404);
      },
    },
  };
}
