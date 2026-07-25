import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";

import worker, { type Env } from "../src/worker.ts";

const fixture = JSON.parse(
  await readFile(new URL("../fixtures/support-refund-overview.json", import.meta.url), "utf8"),
) as Record<string, any>;
const jobsFixture = JSON.parse(
  await readFile(new URL("../fixtures/support-refund-jobs.json", import.meta.url), "utf8"),
) as Record<string, any>;
const configuredPort = Number(process.env.PORT || "8791");
const port = Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort < 65_536
  ? configuredPort
  : 8791;
const stale = process.env.AGENTPASS_FIXTURE_STALE === "true";

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function fixturePayload(url: URL): Record<string, any> {
  const payload = structuredClone(fixture);
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
  const filterNames = ["profile_key", "profile_version", "agent_id", "verdict", "constraint_compliance"];
  for (const name of filterNames) {
    const value = url.searchParams.get(name);
    if (value) payload.filters[name] = value;
  }
  payload.rollups = payload.rollups.filter((rollup: Record<string, any>) => {
    const profileKey = url.searchParams.get("profile_key");
    const profileVersion = url.searchParams.get("profile_version");
    return (!profileKey || rollup.profile_key === profileKey)
      && (!profileVersion || rollup.profile_version === profileVersion);
  });
  payload.matched_records = payload.rollups.reduce(
    (total: number, rollup: Record<string, any>) => total + Number(rollup.sample.finalized_jobs || 0),
    0,
  );
  payload.pagination.total_groups = payload.rollups.length;
  payload.pagination.returned_groups = payload.rollups.length;
  return payload;
}

function jobsFixturePayload(url: URL): Record<string, any> {
  const payload = structuredClone(jobsFixture);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (from && to) {
    payload.filters.time_window.from = from;
    payload.filters.time_window.to = to;
  }
  const filters = {
    profile_key: (job: Record<string, any>, value: string) => job.profile_binding?.key === value,
    profile_version: (job: Record<string, any>, value: string) => job.profile_binding?.version === value,
    agent_id: (job: Record<string, any>, value: string) => Array.isArray(job.agent_ids) && job.agent_ids.includes(value),
    verdict: (job: Record<string, any>, value: string) => job.verdict === value,
    constraint_compliance: (job: Record<string, any>, value: string) => job.constraint_compliance === value,
    confidence: (job: Record<string, any>, value: string) => job.confidence_band === value,
    job_id: (job: Record<string, any>, value: string) => job.job_id === value,
    intent_id: (job: Record<string, any>, value: string) => job.intent_id === value,
  };
  payload.jobs = payload.jobs.filter((job: Record<string, any>) =>
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

const env: Env = {
  CONSOLE_ENVIRONMENT: "development",
  CONSOLE_ENABLE_MOCK_IDENTITY: "true",
  CONSOLE_MOCK_TENANT_ID: "acme",
  CONSOLE_MOCK_SUBJECT: "fixture-operator",
  CONSOLE_MOCK_EMAIL: "fixture-operator@agentpass.test",
  CONSOLE_STALE_AFTER_SECONDS: "300",
  AGENTID_GATEWAY: {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const generatedAt = new Date(
        Date.now() - (stale ? 20 * 60 * 1000 : 0),
      ).toISOString();
      const freshnessHeaders = { "x-agentpass-generated-at": generatedAt };
      if (url.pathname === "/tenants/acme/health") {
        return json({ ok: true, tenant_id: "acme" }, 200, freshnessHeaders);
      }
      if (url.pathname === "/tenants/acme/intent-quality/rollups") {
        return json(fixturePayload(url), 200, freshnessHeaders);
      }
      if (url.pathname === "/tenants/acme/intent-quality/jobs") {
        return json(jobsFixturePayload(url), 200, freshnessHeaders);
      }
      return json({ error: { code: "fixture_route_not_found", message: "Fixture route not found." } }, 404);
    },
  },
};

function requestHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  return headers;
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const origin = `http://127.0.0.1:${port}`;
    const workerRequest = new Request(new URL(request.url || "/", origin), {
      method: request.method || "GET",
      headers: requestHeaders(request),
    });
    const workerResponse = await worker.fetch(workerRequest, env);
    response.statusCode = workerResponse.status;
    workerResponse.headers.forEach((value, name) => response.setHeader(name, value));
    response.end(Buffer.from(await workerResponse.arrayBuffer()));
  } catch {
    response.statusCode = 500;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end("Fixture console unavailable.");
  }
}

const server = createServer((request, response) => {
  void handle(request, response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`AgentPass fixture console: http://127.0.0.1:${port}`);
  if (stale) console.log("Serving rollups older than the console freshness threshold.");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
