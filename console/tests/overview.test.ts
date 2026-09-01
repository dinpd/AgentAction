import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker, { consoleApp } from "../src/worker.ts";

const fixture = JSON.parse(
  await readFile(new URL("../fixtures/support-refund-overview.json", import.meta.url), "utf8"),
) as Record<string, any>;
const JOB_DETAIL_FIXTURE = JSON.parse(
  await readFile(new URL("../fixtures/support-refund-job-detail.json", import.meta.url), "utf8"),
) as Record<string, any>;
const JOBS_FIXTURE = {
  schema_version: "agentpass.intent-quality-jobs.v1",
  tenant_id: "acme",
  records_scanned: 3,
  finalized_records: 2,
  matched_records: 2,
  excluded_records: { total: 1, by_reason: { not_finalized: 1 } },
  data_quality: { findings: ["1 registered intent contract is not finalized"] },
  jobs: [
    {
      schema_version: "agentpass.intent-quality-job.v1",
      tenant_id: "acme",
      finalized_at: "2026-07-25T11:45:00.000Z",
      final_status: "finalized",
      job_id: "job-indeterminate",
      intent_id: "intent-indeterminate",
      agent_id: null,
      agent_ids: [],
      profile_binding: { key: "support_refund.v1", version: "v1", digest: "a".repeat(64) },
      verdict: "indeterminate",
      qualified_success: false,
      constraint_compliance: "indeterminate",
      goal_attainment: 0,
      evidence_confidence: 0.4,
      confidence_band: "low",
      preview_count: 1,
      execution_discipline: { retries: 2, replays: 1, runtime_ms: null },
      data_quality: {
        missing_agent: true,
        missing_runtime: true,
        low_confidence: true,
        indeterminate: true,
        findings: ["agent identity is missing", "runtime metric is missing", "final receipt has low evidence confidence"],
      },
    },
    {
      schema_version: "agentpass.intent-quality-job.v1",
      tenant_id: "acme",
      finalized_at: "2026-07-25T11:30:00.000Z",
      final_status: "finalized",
      job_id: "job-completed",
      intent_id: "intent-completed",
      agent_id: "refund-agent",
      agent_ids: ["refund-agent"],
      profile_binding: { key: "support_refund.v1", version: "v1", digest: "a".repeat(64) },
      verdict: "completed",
      qualified_success: true,
      constraint_compliance: "pass",
      goal_attainment: 1,
      evidence_confidence: 1,
      confidence_band: "high",
      preview_count: 0,
      execution_discipline: { retries: 0, replays: 0, runtime_ms: 850 },
      data_quality: {
        missing_agent: false,
        missing_runtime: false,
        low_confidence: false,
        indeterminate: false,
        findings: [],
      },
    },
  ],
  pagination: { limit: 25, returned_jobs: 2, next_cursor: "opaque-next" },
};
const ACTIVITY_FIXTURE = {
  schema_version: "agentaction.activity-page.v1",
  tenant_id: "acme",
  events: [
    {
      schema_version: "agentaction.hermes-observation.v1",
      event_id: "obs-ui-1",
      event_type: "tool_action",
      observed_at: "2026-07-25T11:59:00.000Z",
      source_id: "hermes-production",
      agent_id: "refund-agent",
      correlation: { session_id: "session-1", task_id: "task-1", tool_call_id: "tool-1" },
      intent: { binding_status: "bound", intent_id: "intent-safe", intent_digest: "digest-safe" },
      tool: { name: "browser.open", action: "read" },
      evaluation: { status: "evaluated", counterfactual_decision: "challenge_required", findings: ["approval_required"] },
      execution: { status: "ok", duration_ms: 42 },
    },
    {
      schema_version: "agentaction.hermes-observation.v1",
      event_id: "obs-ui-2",
      event_type: "model_request_completed",
      observed_at: "2026-07-25T11:58:00.000Z",
      source_id: "hermes-production",
      agent_id: "refund-agent",
      correlation: { session_id: "session-1", api_request_id: "api-1" },
      intent: { binding_status: "unbound" },
      model: { provider: "test", model: "model" },
      execution: { status: "ok", duration_ms: 100 },
    },
  ],
  count: 2,
  next_cursor: "obs-ui-2",
};
const FIXED_NOW = Date.parse("2026-07-25T12:00:00.000Z");
const SHELL_HTML = await (
  await worker.fetch(new Request("https://console.test/"), {
    CONSOLE_ENABLE_MOCK_IDENTITY: "true",
    CONSOLE_ENVIRONMENT: "development",
    CONSOLE_MOCK_SUBJECT: "test-operator",
    CONSOLE_MOCK_TENANT_ID: "tenant-test",
  })
).text();

class FixedDate extends Date {
  static override now(): number {
    return FIXED_NOW;
  }
}

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, Array<(event: { preventDefault(): void }) => unknown>>();
  readonly tagName: string;
  className = "";
  hidden = false;
  href = "";
  id = "";
  max = 0;
  textContent = "";
  value: string | number = "";

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...nodes);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(type: string, listener: (event: { preventDefault(): void }) => unknown): void {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  async dispatch(type: string): Promise<void> {
    const event = { preventDefault(): void {} };
    await Promise.all((this.listeners.get(type) || []).map((listener) => listener(event)));
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

class FakeDocument {
  readonly createdTags: string[] = [];
  readonly nodes = new Map<string, FakeElement>();

  constructor() {
    for (const selector of [
      "[data-status-card]",
      "[data-status-title]",
      "[data-status-detail]",
      "[data-tenant]",
      "[data-tenant-switcher]",
      "[data-tenant-select]",
      "[data-workspace-mode]",
      "[data-workspace-manage]",
      "[data-identity-label]",
      "[data-subject]",
      "[data-logout]",
      "[data-refresh]",
      "[data-overview-filters]",
      "[data-reset-filters]",
      "[data-filter-window]",
      "[data-filter-profile-key]",
      "[data-filter-profile-version]",
      "[data-filter-agent]",
      "[data-filter-verdict]",
      "[data-filter-constraint]",
      "[data-window-summary]",
      "[data-overview-message]",
      "[data-overview-message-title]",
      "[data-overview-message-detail]",
      "[data-overview-content]",
      "[data-overview-summary]",
      "[data-overview-totals]",
      "[data-overview-findings]",
      "[data-overview-findings-list]",
      "[data-rollup-list]",
      "[data-console-view='overview']",
      "[data-console-view='activity']",
      "[data-console-view='jobs']",
      "[data-console-view='job-detail']",
      "[data-console-view='setup']",
      "[data-overview-context='boundaries']",
      "[data-overview-context='lifecycle']",
      "[data-nav-overview]",
      "[data-nav-activity]",
      "[data-nav-jobs]",
      "[data-nav-job-detail]",
      "[data-nav-setup]",
      "[data-job-detail-back]",
      "[data-create-tenant-form]",
      "[data-create-workspace-card]",
      "[data-create-tenant-id]",
      "[data-create-display-name]",
      "[data-create-integration]",
      "[data-create-integration-fields]",
      "[data-create-source-id]",
      "[data-create-agent-id]",
      "[data-redeem-invite-form]",
      "[data-invite-code]",
      "[data-setup-onboarding]",
      "[data-tenant-setup]",
      "[data-setup-role]",
      "[data-setup-message]",
      "[data-setup-message-title]",
      "[data-setup-message-detail]",
      "[data-workspace-migration]",
      "[data-enable-workspace-switching]",
      "[data-ingestion-title]",
      "[data-ingestion-detail]",
      "[data-access-title]",
      "[data-access-detail]",
      "[data-source-list]",
      "[data-create-source-form]",
      "[data-source-integration]",
      "[data-integration-guide]",
      "[data-integration-guide-title]",
      "[data-integration-guide-detail]",
      "[data-integration-guide-steps]",
      "[data-integration-guide-link]",
      "[data-source-id]",
      "[data-source-agent-id]",
      "[data-invite-members-card]",
      "[data-create-invite-form]",
      "[data-member-email]",
      "[data-member-role]",
      "[data-member-list]",
      "[data-invitation-result]",
      "[data-invitation-delivery]",
      "[data-created-invitation-code]",
      "[data-copy-invitation]",
      "[data-secret-panel]",
      "[data-source-token]",
      "[data-hermes-environment]",
      "[data-hermes-yaml]",
      "[data-setup-config-label]",
      "[data-copy-source-token]",
      "[data-copy-hermes-environment]",
      "[data-copy-hermes-yaml]",
      "[data-dismiss-secret]",
      "[data-open-activity]",
      "[data-activity-filters]",
      "[data-reset-activity-filters]",
      "[data-activity-filter-window]",
      "[data-activity-filter-agent]",
      "[data-activity-filter-event]",
      "[data-activity-filter-tool]",
      "[data-activity-filter-decision]",
      "[data-activity-filter-execution]",
      "[data-activity-filter-intent]",
      "[data-activity-window-summary]",
      "[data-activity-message]",
      "[data-activity-message-title]",
      "[data-activity-message-detail]",
      "[data-activity-content]",
      "[data-activity-summary]",
      "[data-activity-list]",
      "[data-activity-page-summary]",
      "[data-activity-next]",
      "[data-jobs-filters]",
      "[data-reset-jobs-filters]",
      "[data-jobs-filter-window]",
      "[data-jobs-filter-profile-key]",
      "[data-jobs-filter-profile-version]",
      "[data-jobs-filter-agent]",
      "[data-jobs-filter-verdict]",
      "[data-jobs-filter-constraint]",
      "[data-jobs-filter-confidence]",
      "[data-jobs-filter-job]",
      "[data-jobs-filter-intent]",
      "[data-jobs-window-summary]",
      "[data-jobs-message]",
      "[data-jobs-message-title]",
      "[data-jobs-message-detail]",
      "[data-jobs-content]",
      "[data-jobs-summary]",
      "[data-jobs-findings]",
      "[data-jobs-list]",
      "[data-jobs-page-summary]",
      "[data-jobs-next]",
      "[data-job-detail-message]",
      "[data-job-detail-message-title]",
      "[data-job-detail-message-detail]",
      "[data-job-detail-content]",
      "[data-job-detail-title]",
      "[data-job-detail-subtitle]",
      "[data-job-detail-status]",
      "[data-job-detail-boundary]",
      "[data-job-detail-evaluation-id]",
      "[data-job-detail-metrics]",
      "[data-job-detail-outcomes]",
      "[data-job-detail-constraints]",
      "[data-job-detail-discipline]",
      "[data-job-detail-timeline-summary]",
      "[data-job-detail-timeline]",
      "[data-job-detail-preview-summary]",
      "[data-job-detail-previews]",
      "[data-job-detail-sources]",
      "[data-job-detail-findings]",
      "[data-job-detail-findings-list]",
    ]) {
      this.nodes.set(selector, new FakeElement(selector.includes("filters") ? "form" : "div"));
    }
    this.get("[data-filter-window]").value = "7";
    this.get("[data-create-integration]").value = "none";
    this.get("[data-source-integration]").value = "hermes";
    this.get("[data-filter-verdict]").value = "";
    this.get("[data-filter-constraint]").value = "";
    this.get("[data-jobs-filter-window]").value = "7";
    this.get("[data-activity-filter-window]").value = "7";
    this.get("[data-activity-filter-event]").value = "";
    this.get("[data-activity-filter-decision]").value = "";
    this.get("[data-activity-filter-execution]").value = "";
    this.get("[data-activity-filter-intent]").value = "";
    this.get("[data-jobs-filter-verdict]").value = "";
    this.get("[data-jobs-filter-constraint]").value = "";
    this.get("[data-jobs-filter-confidence]").value = "";
    this.get("[data-console-view='jobs']").hidden = true;
    this.get("[data-console-view='activity']").hidden = true;
    this.get("[data-console-view='job-detail']").hidden = true;
    this.get("[data-console-view='setup']").hidden = true;
    this.get("[data-create-integration-fields]").hidden = true;
    this.get("[data-setup-onboarding]").hidden = true;
    this.get("[data-workspace-migration]").hidden = true;
    this.get("[data-jobs-content]").hidden = true;
    this.get("[data-activity-content]").hidden = true;
    this.get("[data-job-detail-content]").hidden = true;
  }

  querySelector(selector: string): FakeElement | null {
    return this.nodes.get(selector) || null;
  }

  createElement(tagName: string): FakeElement {
    this.createdTags.push(tagName);
    return new FakeElement(tagName);
  }

  get(selector: string): FakeElement {
    const node = this.nodes.get(selector);
    if (!node) throw new Error(`Missing fake node ${selector}`);
    return node;
  }
}

type RuntimeOptions = {
  activityPayload?: Record<string, any>;
  activityStatus?: number;
  dataState?: "fresh" | "stale";
  hash?: string;
  detailPayload?: Record<string, any>;
  detailStatus?: number;
  jobsPayload?: Record<string, any>;
  jobsStatus?: number;
  payload?: Record<string, any>;
  rollupStatus?: number;
  search?: string;
  sessionStatus?: number;
  sessionPayload?: Record<string, any>;
  setupPayload?: Record<string, any>;
  invitationDelivery?: "failed" | "sent" | "unavailable";
  startSsoFixed?: boolean;
  startUnprovisioned?: boolean;
};

function makeRuntime(options: RuntimeOptions = {}) {
  const document = new FakeDocument();
  const requests: string[] = [];
  const requestBodies: Array<{ body: Record<string, unknown>; path: string }> = [];
  const pageUrls: string[] = [];
  const payload = structuredClone(options.payload || fixture);
  const jobsPayload = structuredClone(options.jobsPayload || JOBS_FIXTURE);
  const activityPayload = structuredClone(options.activityPayload || ACTIVITY_FIXTURE);
  const detailPayload = structuredClone(options.detailPayload || JOB_DETAIL_FIXTURE);
  let provisioned = options.startUnprovisioned !== true;
  let workspaceMigrated = false;
  let invitationJoined = false;
  const runtime = {
    Date: FixedDate,
    document,
    location: { hash: options.hash || "#overview", pathname: "/", search: options.search || "" },
    history: {
      replaceState(_data: unknown, _unused: string, url?: string | URL | null): void {
        pageUrls.push(String(url || ""));
      },
    },
    async fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
      const path = input instanceof Request ? input.url : String(input);
      requests.push(path);
      if (typeof init?.body === "string") requestBodies.push({ path, body: JSON.parse(init.body) });
      if (path === "/api/console/session") {
        const status = options.sessionStatus || 200;
        return response(
          status === 200
            ? options.sessionPayload || (provisioned
              ? { authenticated: true, workspace_mode: options.startSsoFixed && !workspaceMigrated ? "sso_fixed" : "directory", tenant_id: "acme", subject: "operator-1", email: "operator@example.com", memberships: [
                { tenant: { tenant_id: "acme", display_name: "Acme" }, membership: { tenant_id: "acme", role: "owner" } },
                ...(invitationJoined ? [{ tenant: { tenant_id: "beta", display_name: "Beta" }, membership: { tenant_id: "beta", role: "viewer" } }] : []),
              ] }
              : { authenticated: true, workspace_mode: "directory", tenant_id: null, subject: "operator-1", email: "operator@example.com", memberships: [] })
            : { error: { code: "access_token_missing", message: "Authentication is required." } },
          status,
        );
      }
      if (path === "/api/console/onboarding/tenants") {
        provisioned = true;
        return response({
          tenant: { tenant_id: "acme", display_name: "Acme" },
          membership: { tenant_id: "acme", role: "owner" },
          source_token: "aa_src_shown_once",
          hermes: { environment: "AGENTACTION_INGEST_TOKEN=<one-time-token>", yaml: "tenant_id: acme\nsource_id: hermes-production" },
        }, 201);
      }
      if (path === "/api/console/onboarding/tenants/acme/migrate") {
        workspaceMigrated = true;
        return response({ workspace_mode: "directory", membership: { tenant_id: "acme", role: "owner" } }, 201);
      }
      if (path === "/api/console/onboarding/invitations/redeem") {
        invitationJoined = true;
        return response({ membership: { tenant_id: "beta", role: "viewer" } }, 201);
      }
      if (path === "/api/console/onboarding/tenants/acme/invitations") {
        return response({
          invitation: { invitation_id: "invite_test", email: "member@example.com", role: "viewer" },
          invitation_code: "invite_test.aa_inv_secret",
          delivery: { status: options.invitationDelivery || "sent" },
        }, 201);
      }
      if (/^\/api\/console\/onboarding\/tenants\/(?:acme|beta)\/setup$/.test(path)) {
        const role = path.includes("/beta/") ? "viewer" : "owner";
        return response(options.setupPayload || {
          membership: { tenant_id: path.includes("/beta/") ? "beta" : "acme", role },
          sources: [{ source_id: "hermes-production", integration: "hermes", enabled: true, agent_ids: ["support-agent"] }],
          members: [{ email: "operator@example.com", role: "owner" }],
          ingestion: { observed: false, last_observed_at: null },
        });
      }
      if (path === "/api/console/health") {
        return response({ ok: true, data_state: options.dataState || "fresh" });
      }
      if (/^\/api\/console\/tenants\/(?:acme|synthetic)\/intent-quality\/rollups\?/.test(path)) {
        const status = options.rollupStatus || 200;
        if (status !== 200) {
          return response(
            { error: { code: "console_test_failure", message: status === 403 ? "Tenant access denied." : "Gateway unavailable." } },
            status,
          );
        }
        return response(payload, 200, {
          "x-agentpass-console-data-state": options.dataState || "fresh",
          "x-agentpass-console-generated-at": "2026-07-25T11:48:00.000Z",
          "x-agentpass-console-data-age-seconds": options.dataState === "stale" ? "720" : "20",
        });
      }
      if (path.startsWith("/api/console/tenants/acme/activity/events?")) {
        const status = options.activityStatus || 200;
        if (status !== 200) {
          return response({ error: { code: "console_test_failure", message: "Activity unavailable." } }, status);
        }
        return response(activityPayload, 200, {
          "x-agentpass-console-data-state": options.dataState || "fresh",
          "x-agentpass-console-generated-at": "2026-07-25T11:59:00.000Z",
          "x-agentpass-console-data-age-seconds": options.dataState === "stale" ? "720" : "20",
        });
      }
      if (path.startsWith("/api/console/tenants/acme/intent-quality/jobs/")) {
        const status = options.detailStatus || 200;
        if (status !== 200) {
          return response(
            {
              error: {
                code: status === 404 ? "intent_quality_job_not_found" : "console_test_failure",
                message: status === 404
                  ? "Finalized Job receipt not found."
                  : status === 403
                    ? "Tenant access denied."
                    : "Gateway unavailable.",
              },
            },
            status,
          );
        }
        return response(detailPayload, 200, {
          "x-agentpass-console-data-state": options.dataState || "fresh",
          "x-agentpass-console-generated-at": "2026-07-25T11:48:00.000Z",
          "x-agentpass-console-data-age-seconds": options.dataState === "stale" ? "720" : "20",
        });
      }
      if (path.startsWith("/api/console/tenants/acme/intent-quality/jobs?")) {
        const status = options.jobsStatus || 200;
        if (status !== 200) {
          return response(
            { error: { code: "console_test_failure", message: status === 403 ? "Tenant access denied." : "Gateway unavailable." } },
            status,
          );
        }
        return response(jobsPayload, 200, {
          "x-agentpass-console-data-state": options.dataState || "fresh",
          "x-agentpass-console-generated-at": "2026-07-25T11:48:00.000Z",
          "x-agentpass-console-data-age-seconds": options.dataState === "stale" ? "720" : "20",
        });
      }
      throw new Error(`Unexpected console request: ${path}`);
    },
  };
  return {
    controller: consoleApp(runtime as any),
    document,
    pageUrls,
    requestBodies,
    requests,
  };
}

function response(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function textOf(node: FakeElement): string {
  return [node.textContent, ...node.children.map(textOf)].filter(Boolean).join(" ");
}

function countTag(node: FakeElement, tagName: string): number {
  return (node.tagName === tagName ? 1 : 0)
    + node.children.reduce((total, child) => total + countTag(child, tagName), 0);
}

function elementsByTag(node: FakeElement, tagName: string): FakeElement[] {
  return [
    ...(node.tagName === tagName ? [node] : []),
    ...node.children.flatMap((child) => elementsByTag(child, tagName)),
  ];
}

test("builds a bounded allowlisted query and synchronizes practitioner filters", async () => {
  const { controller, document, pageUrls, requests } = makeRuntime();
  await controller.ready;
  document.get("[data-filter-window]").value = "30";
  document.get("[data-filter-profile-key]").value = "support_refund";
  document.get("[data-filter-profile-version]").value = "v2";
  document.get("[data-filter-agent]").value = "refund-agent";
  document.get("[data-filter-verdict]").value = "indeterminate";
  document.get("[data-filter-constraint]").value = "pass";

  const query = controller.buildQualityQuery();
  assert.equal(query.get("from"), "2026-06-25T12:00:00.000Z");
  assert.equal(query.get("to"), "2026-07-25T12:00:00.000Z");
  assert.equal(query.get("limit"), "100");
  assert.equal(query.get("profile_key"), "support_refund");
  assert.equal(query.get("profile_version"), "v2");
  assert.equal(query.get("agent_id"), "refund-agent");
  assert.equal(query.get("verdict"), "indeterminate");
  assert.equal(query.get("constraint_compliance"), "pass");
  assert.deepEqual([...query.keys()].sort(), [
    "agent_id",
    "constraint_compliance",
    "from",
    "limit",
    "profile_key",
    "profile_version",
    "to",
    "verdict",
  ]);

  await controller.loadOverview();
  const latestRequest = requests.at(-1) || "";
  assert.match(latestRequest, /^\/api\/console\/tenants\/acme\/intent-quality\/rollups\?/);
  assert.match(latestRequest, /profile_key=support_refund/);
  assert.match(pageUrls.at(-1) || "", /window=30/);
  assert.match(pageUrls.at(-1) || "", /profile_version=v2/);
});

test("renders separate immutable profile groups with explicit indeterminate and low-confidence values", async () => {
  const { controller, document } = makeRuntime();
  await controller.ready;

  const list = document.get("[data-rollup-list]");
  assert.equal(list.children.length, 2);
  const rendered = textOf(list);
  assert.match(rendered, /support_refund/);
  assert.match(rendered, /v1/);
  assert.match(rendered, /v2/);
  assert.match(rendered, /Indeterminate/);
  assert.match(rendered, /Low/);
  assert.match(rendered, /Small sample/);
  assert.equal(countTag(list, "table") >= 8, true);
  assert.equal(countTag(list, "progress") >= 20, true);
  assert.equal(document.get("[data-status-card]").dataset.state, "partial");
  assert.equal(document.get("[data-overview-message]").hidden, true);
});

test("labels stale data with normalized age and generated-at context", async () => {
  const { controller, document } = makeRuntime({ dataState: "stale" });
  await controller.ready;

  assert.equal(document.get("[data-status-card]").dataset.state, "stale");
  assert.match(document.get("[data-status-detail]").textContent, /12 minutes old/);
  assert.match(document.get("[data-status-detail]").textContent, /2026-07-25T11:48:00.000Z/);
});

test("renders explicit empty, forbidden, and unavailable overview states", async (context) => {
  const emptyPayload = structuredClone(fixture);
  emptyPayload.rollups = [];
  emptyPayload.matched_records = 0;
  emptyPayload.excluded_records.total = 0;
  emptyPayload.data_quality.findings = [];

  await context.test("empty", async () => {
    const { controller, document } = makeRuntime({ payload: emptyPayload });
    await controller.ready;
    assert.equal(document.get("[data-overview-message]").dataset.state, "empty");
    assert.match(document.get("[data-overview-message-title]").textContent, /No finalized profile groups matched/);
  });

  await context.test("forbidden", async () => {
    const { controller, document } = makeRuntime({ rollupStatus: 403 });
    await controller.ready;
    assert.equal(document.get("[data-status-card]").dataset.state, "forbidden");
    assert.equal(document.get("[data-overview-message]").dataset.state, "forbidden");
  });

  await context.test("unavailable", async () => {
    const { controller, document } = makeRuntime({ rollupStatus: 503 });
    await controller.ready;
    assert.equal(document.get("[data-status-card]").dataset.state, "unavailable");
    assert.equal(document.get("[data-overview-message]").dataset.state, "unavailable");
  });
});

test("treats API strings as text and preserves accessible shell controls", async () => {
  const unsafePayload = structuredClone(fixture);
  unsafePayload.rollups[0].profile_key = "<img src=x onerror=alert(1)>";
  const { controller, document } = makeRuntime({ payload: unsafePayload });
  await controller.ready;

  assert.match(textOf(document.get("[data-rollup-list]")), /<img src=x onerror=alert\(1\)>/);
  assert.equal(document.createdTags.includes("img"), false);
  assert.match(SHELL_HTML, /<form class="filter-form" data-overview-filters>/);
  assert.match(SHELL_HTML, /<label>\s*<span>Time window<\/span>/);
  assert.match(SHELL_HTML, /<button class="primary-button" type="submit">Apply filters<\/button>/);
  assert.match(SHELL_HTML, /aria-live="polite"/);
  assert.doesNotMatch(SHELL_HTML, /gateway-secret|AGENTID_GATEWAY_TOKEN/);
});

test("renders role-aware tenant setup and Hermes ingestion health", async () => {
  const { controller, document, requests } = makeRuntime({ hash: "#setup" });
  await controller.ready;

  assert.equal(document.get("[data-console-view='setup']").hidden, false);
  assert.equal(document.get("[data-setup-role]").textContent, "owner");
  assert.equal(document.get("[data-tenant-setup]").hidden, false);
  assert.equal(document.get("[data-create-source-form]").hidden, false);
  assert.equal(document.get("[data-invite-members-card]").hidden, false);
  assert.match(textOf(document.get("[data-source-list]")), /hermes-production support-agent hermes · Enabled/);
  assert.match(document.get("[data-ingestion-title]").textContent, /Waiting for activity/);
  assert.ok(requests.includes("/api/console/onboarding/tenants/acme/setup"));
});

test("shows a Cloudflare Access logout for authenticated identities and hides it in the public demo", async () => {
  const authenticated = makeRuntime();
  await authenticated.controller.ready;
  assert.equal(authenticated.document.get("[data-identity-label]").textContent, "Signed in as");
  assert.equal(authenticated.document.get("[data-subject]").textContent, "operator@example.com");
  assert.equal(authenticated.document.get("[data-logout]").hidden, false);

  const publicDemo = makeRuntime({
    sessionPayload: {
      authenticated: true,
      public_demo: true,
      workspace_mode: "directory",
      tenant_id: "synthetic",
      subject: "public-demo",
      memberships: [],
    },
  });
  await publicDemo.controller.ready;
  assert.equal(publicDemo.document.get("[data-identity-label]").textContent, "Viewing as");
  assert.equal(publicDemo.document.get("[data-logout]").hidden, true);
});

test("changes connection instructions with the selected integration", async () => {
  const { controller, document } = makeRuntime({ hash: "#setup" });
  await controller.ready;

  assert.equal(document.get("[data-integration-guide-title]").textContent, "Hermes Agent");
  assert.match(textOf(document.get("[data-integration-guide-steps]")), /Install the AgentAction plugin/);
  assert.match(document.get("[data-integration-guide-link]").href, /integrations\/hermes-agentaction/);

  document.get("[data-source-integration]").value = "agentaction";
  await document.get("[data-source-integration]").dispatch("change");
  assert.equal(document.get("[data-integration-guide-title]").textContent, "Custom AgentAction source");
  assert.match(textOf(document.get("[data-integration-guide-steps]")), /privacy-safe activity batches/);
  assert.match(document.get("[data-integration-guide-link]").href, /shadow-observability-quickstart/);
});

test("auto-redeems a legacy fragment invitation after sign-in and scrubs its secret from the URL", async () => {
  const code = "invite_test.aa_inv_secret";
  const { controller, document, pageUrls, requestBodies, requests } = makeRuntime({ hash: `#setup?invite=${code}` });
  await controller.ready;

  assert.ok(requests.includes("/api/console/onboarding/invitations/redeem"));
  assert.deepEqual(requestBodies.find((request) => request.path.endsWith("/invitations/redeem"))?.body, { code });
  assert.equal(pageUrls[0], "/#setup");
  assert.equal(pageUrls.some((url) => url.includes(code)), false);
  assert.equal(document.get("[data-tenant-select]").value, "beta");
  assert.equal(document.get("[data-invite-code]").value, "");
  assert.equal(document.get("[data-setup-message-title]").textContent, "Workspace joined");
});

test("auto-redeems an Access-safe invitation ID and scrubs only its query parameter", async () => {
  const invitationId = "invite_0123456789abcdef01234567";
  const { controller, document, pageUrls, requestBodies, requests } = makeRuntime({
    hash: "#activity",
    search: `?window=7&invitation=${invitationId}`,
  });
  await controller.ready;

  assert.ok(requests.includes("/api/console/onboarding/invitations/redeem"));
  assert.deepEqual(requestBodies.find((request) => request.path.endsWith("/invitations/redeem"))?.body, { invitation_id: invitationId });
  assert.equal(pageUrls[0], "/?window=7#setup");
  assert.equal(pageUrls.some((url) => url.includes(invitationId)), false);
  assert.equal(document.get("[data-tenant-select]").value, "beta");
  assert.equal(document.get("[data-invite-code]").value, "");
  assert.equal(document.get("[data-setup-message-title]").textContent, "Workspace joined");
});

test("rejects and scrubs a malformed invitation link without making a redemption request", async () => {
  const { controller, document, pageUrls, requests } = makeRuntime({
    hash: "#overview",
    search: "?window=7&invitation=not-an-invitation",
  });
  await controller.ready;

  assert.equal(requests.includes("/api/console/onboarding/invitations/redeem"), false);
  assert.equal(pageUrls[0], "/?window=7#setup");
  assert.equal(document.get("[data-setup-message-title]").textContent, "Invitation link is invalid");
});

test("shows invitation delivery outcome while preserving a manual fallback code", async () => {
  const { controller, document } = makeRuntime({ hash: "#setup", invitationDelivery: "failed" });
  await controller.ready;

  document.get("[data-member-email]").value = "member@example.com";
  document.get("[data-member-role]").value = "viewer";
  await document.get("[data-create-invite-form]").dispatch("submit");

  assert.equal(document.get("[data-invitation-result]").hidden, false);
  assert.equal(document.get("[data-created-invitation-code]").textContent, "invite_test.aa_inv_secret");
  assert.match(document.get("[data-invitation-delivery]").textContent, /Email delivery failed/);
  assert.match(document.get("[data-setup-message-title]").textContent, /email not sent/);
});

test("adopts an SSO-managed workspace and reveals directory workspace actions", async () => {
  const { controller, document, requests } = makeRuntime({ hash: "#setup", startSsoFixed: true });
  await controller.ready;

  assert.equal(document.get("[data-tenant-switcher]").hidden, false);
  assert.equal((document.get("[data-tenant-select]") as any).disabled, true);
  assert.equal(document.get("[data-workspace-mode]").textContent, "Managed by SSO");
  assert.equal(document.get("[data-workspace-migration]").hidden, false);
  assert.equal(document.get("[data-setup-onboarding]").hidden, true);

  await document.get("[data-enable-workspace-switching]").dispatch("click");

  assert.ok(requests.includes("/api/console/onboarding/tenants/acme/migrate"));
  assert.equal(document.get("[data-workspace-mode]").textContent, "1 workspace");
  assert.equal(document.get("[data-workspace-migration]").hidden, true);
  assert.equal(document.get("[data-setup-onboarding]").hidden, false);
  assert.match(document.get("[data-setup-message-title]").textContent, /switching enabled/);
});

test("keeps generic workspace creation separate from integration setup", async () => {
  const { controller, document } = makeRuntime({ hash: "#setup", startUnprovisioned: true });
  await controller.ready;

  assert.equal(document.get("[data-create-integration]").value, "none");
  assert.equal(document.get("[data-create-integration-fields]").hidden, true);
  document.get("[data-create-integration]").value = "hermes";
  await document.get("[data-create-integration]").dispatch("change");
  assert.equal(document.get("[data-create-integration-fields]").hidden, false);
  assert.match(SHELL_HTML, /Custom AgentAction source/);
  assert.doesNotMatch(SHELL_HTML, /value="hermes-production"/);
});

test("switches only among the authenticated session memberships", async () => {
  const { controller, document, requests } = makeRuntime({
    hash: "#setup",
    sessionPayload: {
      authenticated: true,
      workspace_mode: "directory",
      tenant_id: "acme",
      subject: "operator-1",
      memberships: [
        { tenant: { tenant_id: "acme", display_name: "Acme" }, membership: { tenant_id: "acme", role: "owner" } },
        { tenant: { tenant_id: "beta", display_name: "Beta" }, membership: { tenant_id: "beta", role: "viewer" } },
      ],
    },
  });
  await controller.ready;
  assert.equal(document.get("[data-tenant-switcher]").hidden, false);
  assert.equal(document.get("[data-tenant-select]").children.length, 2);

  document.get("[data-tenant-select]").value = "beta";
  await document.get("[data-tenant-select]").dispatch("change");
  assert.ok(requests.includes("/api/console/onboarding/tenants/beta/setup"));
  assert.equal(document.get("[data-tenant-select]").value, "beta");
  assert.equal(document.get("[data-create-source-form]").hidden, true);
  assert.equal(document.get("[data-invite-members-card]").hidden, true);
});

test("allows workspace creation only for a new identity or an existing workspace owner", async () => {
  const viewer = makeRuntime({
    hash: "#setup",
    sessionPayload: {
      authenticated: true,
      workspace_mode: "directory",
      tenant_id: "beta",
      subject: "viewer-1",
      email: "viewer@example.com",
      memberships: [{ tenant: { tenant_id: "beta", display_name: "Beta" }, membership: { tenant_id: "beta", role: "viewer" } }],
    },
    setupPayload: {
      membership: { tenant_id: "beta", role: "viewer" },
      sources: [],
      members: [],
      ingestion: { observed: false },
    },
  });
  await viewer.controller.ready;
  assert.equal(viewer.document.get("[data-create-workspace-card]").hidden, true);
  assert.equal(viewer.document.get("[data-setup-onboarding]").hidden, false);

  const newcomer = makeRuntime({ hash: "#setup", startUnprovisioned: true });
  await newcomer.controller.ready;
  assert.equal(newcomer.document.get("[data-create-workspace-card]").hidden, false);
});

test("creates an unprovisioned tenant and shows its source secret only in memory", async () => {
  const { controller, document, requests } = makeRuntime({ hash: "#overview", startUnprovisioned: true });
  await controller.ready;
  assert.equal(document.get("[data-console-view='setup']").hidden, false);
  assert.equal(document.get("[data-tenant-setup]").hidden, true);

  document.get("[data-create-tenant-id]").value = "acme";
  document.get("[data-create-display-name]").value = "Acme";
  document.get("[data-create-integration]").value = "hermes";
  document.get("[data-create-source-id]").value = "hermes-production";
  document.get("[data-create-agent-id]").value = "support-agent";
  await document.get("[data-create-tenant-form]").dispatch("submit");

  assert.equal(document.get("[data-secret-panel]").hidden, false);
  assert.equal(document.get("[data-source-token]").textContent, "aa_src_shown_once");
  assert.match(document.get("[data-hermes-environment]").textContent, /aa_src_shown_once/);
  assert.equal(document.get("[data-tenant-setup]").hidden, false);
  assert.ok(requests.includes("/api/console/onboarding/tenants"));
  assert.equal(requests.some((request) => request.includes("aa_src_shown_once")), false);

  await document.get("[data-dismiss-secret]").dispatch("click");
  assert.equal(document.get("[data-source-token]").textContent, "");
  assert.equal(document.get("[data-secret-panel]").hidden, true);
});

test("loads Jobs as a functional second view with URL-persisted allowlisted filters", async () => {
  const { controller, document, pageUrls, requests } = makeRuntime({
    hash: "#jobs",
    search: "?window=30&profile_key=support_refund.v1&agent_id=refund-agent&confidence=low&job_id=job-indeterminate&intent_id=intent-indeterminate",
  });
  await controller.ready;

  assert.equal(document.get("[data-console-view='overview']").hidden, true);
  assert.equal(document.get("[data-console-view='jobs']").hidden, false);
  assert.equal(document.get("[data-overview-context='boundaries']").hidden, true);
  assert.equal(document.get("[data-overview-context='lifecycle']").hidden, true);
  assert.equal(document.get("[data-nav-jobs]").attributes.get("aria-current"), "page");
  const latestRequest = requests.at(-1) || "";
  assert.match(latestRequest, /^\/api\/console\/tenants\/acme\/intent-quality\/jobs\?/);
  assert.match(latestRequest, /confidence=low/);
  assert.match(latestRequest, /job_id=job-indeterminate/);
  assert.equal(requests.some((request) => request.includes("/intent-quality/rollups?")), false);

  const query = controller.buildJobsQuery();
  assert.equal(query.get("from"), "2026-06-25T12:00:00.000Z");
  assert.equal(query.get("to"), "2026-07-25T12:00:00.000Z");
  assert.equal(query.get("limit"), "25");
  assert.equal(query.get("profile_key"), "support_refund.v1");
  assert.equal(query.get("agent_id"), "refund-agent");
  assert.equal(query.get("confidence"), "low");
  assert.equal(query.get("job_id"), "job-indeterminate");
  assert.equal(query.get("intent_id"), "intent-indeterminate");
  assert.deepEqual([...query.keys()].sort(), [
    "agent_id",
    "confidence",
    "from",
    "intent_id",
    "job_id",
    "limit",
    "profile_key",
    "to",
  ]);
  assert.match(pageUrls.at(-1) || "", /#jobs$/);
  assert.match(pageUrls.at(-1) || "", /confidence=low/);
  controller.showView("overview");
  assert.equal(document.get("[data-overview-context='boundaries']").hidden, false);
  assert.equal(document.get("[data-overview-context='lifecycle']").hidden, false);
});

test("loads tenant activity with allowlisted filters and explicit intent binding states", async () => {
  const { controller, document, pageUrls, requests } = makeRuntime({ hash: "#activity" });
  await controller.ready;
  document.get("[data-activity-filter-window]").value = "1";
  document.get("[data-activity-filter-agent]").value = "refund-agent";
  document.get("[data-activity-filter-event]").value = "tool_action";
  document.get("[data-activity-filter-tool]").value = "browser.open";
  document.get("[data-activity-filter-decision]").value = "challenge_required";
  document.get("[data-activity-filter-execution]").value = "ok";
  document.get("[data-activity-filter-intent]").value = "bound";

  const query = controller.buildActivityQuery();
  assert.equal(query.get("agent_id"), "refund-agent");
  assert.equal(query.get("event_type"), "tool_action");
  assert.equal(query.get("tool"), "browser.open");
  assert.equal(query.get("decision"), "challenge_required");
  assert.equal(query.get("execution_status"), "ok");
  assert.equal(query.get("intent_binding"), "bound");
  await controller.loadActivity("");

  assert.ok(requests.some((path) => path.includes("/activity/events?")));
  assert.ok(pageUrls.at(-1)?.endsWith("#activity"));
  const rows = document.get("[data-activity-list]");
  assert.equal(rows.children.length, 2);
  const text = textOf(rows);
  assert.match(text, /Explicitly bound/);
  assert.match(text, /intent-safe/);
  assert.match(text, /No intent was inferred/);
  assert.match(text, /challenge_required/);
  assert.equal(document.get("[data-console-view='activity']").hidden, false);
  assert.equal(document.get("[data-console-view='overview']").hidden, true);
});

test("renders finalized Jobs rows with explicit boundaries findings and stable detail targets", async () => {
  const { controller, document, pageUrls, requests } = makeRuntime({ hash: "#jobs" });
  await controller.ready;

  const list = document.get("[data-jobs-list]");
  assert.equal(list.children.length, 2);
  const rendered = textOf(list);
  assert.match(rendered, /job-indeterminate/);
  assert.match(rendered, /intent-indeterminate/);
  assert.match(rendered, /Missing identity/);
  assert.match(rendered, /low 40%/);
  assert.match(rendered, /Constraint indeterminate/);
  assert.match(rendered, /1 preview/);
  assert.match(rendered, /2 retries · 1 replays/);
  assert.match(rendered, /Finalized/);
  assert.match(rendered, /support_refund\.v1/);
  assert.equal(document.get("[data-jobs-message]").hidden, true);
  assert.equal(document.get("[data-jobs-next]").hidden, false);
  const links = elementsByTag(list, "a");
  assert.equal(links.length, 2);
  assert.equal(links[0].attributes.get("href"), "/?job_id=job-indeterminate#job-detail");
  assert.equal(links[0].attributes.get("href")?.includes("evidence"), false);

  await controller.loadJobs("opaque-next");
  assert.match(requests.at(-1) || "", /cursor=opaque-next/);
  assert.match(pageUrls.at(-1) || "", /cursor=opaque-next/);
  assert.match(document.get("[data-jobs-page-summary]").textContent, /cursor-stable subsequent page/);
});

test("renders explicit empty forbidden and unavailable Jobs states", async (context) => {
  const emptyPayload = structuredClone(JOBS_FIXTURE);
  emptyPayload.jobs = [];
  emptyPayload.matched_records = 0;
  emptyPayload.pagination.next_cursor = null;

  await context.test("empty", async () => {
    const { controller, document } = makeRuntime({ hash: "#jobs", jobsPayload: emptyPayload });
    await controller.ready;
    assert.equal(document.get("[data-jobs-message]").dataset.state, "empty");
    assert.match(document.get("[data-jobs-message-title]").textContent, /No finalized jobs matched/);
  });
  await context.test("forbidden", async () => {
    const { controller, document } = makeRuntime({ hash: "#jobs", jobsStatus: 403 });
    await controller.ready;
    assert.equal(document.get("[data-jobs-message]").dataset.state, "forbidden");
  });
  await context.test("unavailable", async () => {
    const { controller, document } = makeRuntime({ hash: "#jobs", jobsStatus: 503 });
    await controller.ready;
    assert.equal(document.get("[data-jobs-message]").dataset.state, "unavailable");
  });
  await context.test("unauthorized", async () => {
    const { controller, document } = makeRuntime({ hash: "#jobs", sessionStatus: 401 });
    await controller.ready;
    assert.equal(document.get("[data-jobs-message]").dataset.state, "unauthorized");
  });
  await context.test("stale", async () => {
    const { controller, document } = makeRuntime({ dataState: "stale", hash: "#jobs" });
    await controller.ready;
    assert.equal(document.get("[data-status-card]").dataset.state, "stale");
    assert.match(document.get("[data-status-detail]").textContent, /12 minutes old/);
  });
  await context.test("malformed", async () => {
    const malformed = structuredClone(JOBS_FIXTURE);
    malformed.jobs = malformed.jobs.map((job: Record<string, any>) => ({ ...job, profile_binding: {} }));
    const { controller, document } = makeRuntime({ hash: "#jobs", jobsPayload: malformed });
    await controller.ready;
    assert.equal(document.get("[data-jobs-message]").dataset.state, "unavailable");
  });
});

test("loads one finalized Job detail from a stable identifier-only URL", async () => {
  const { controller, document, pageUrls, requests } = makeRuntime({
    hash: "#job-detail",
    search: "?job_id=job-refund-partial",
  });
  await controller.ready;

  assert.equal(document.get("[data-console-view='overview']").hidden, true);
  assert.equal(document.get("[data-console-view='jobs']").hidden, true);
  assert.equal(document.get("[data-console-view='job-detail']").hidden, false);
  assert.equal(document.get("[data-overview-context='boundaries']").hidden, true);
  assert.equal(document.get("[data-overview-context='lifecycle']").hidden, true);
  assert.equal(document.get("[data-nav-job-detail]").attributes.get("aria-current"), "page");
  assert.equal(
    requests.at(-1),
    "/api/console/tenants/acme/intent-quality/jobs/job-refund-partial",
  );
  assert.equal(requests.some((request) => request.includes("/intent-quality/rollups?")), false);
  assert.equal(requests.some((request) => request.includes("/intent-quality/jobs?")), false);
  assert.equal(pageUrls.at(-1), "/?job_id=job-refund-partial#job-detail");
  assert.equal(pageUrls.at(-1)?.includes("tenant"), false);
  assert.equal(pageUrls.at(-1)?.includes("evidence"), false);

  assert.equal(document.get("[data-job-detail-message]").hidden, true);
  assert.equal(document.get("[data-job-detail-content]").hidden, false);
  assert.equal(document.get("[data-job-detail-title]").textContent, "job-refund-partial");
  assert.match(document.get("[data-job-detail-subtitle]").textContent, /intent-refund-partial/);
  assert.match(textOf(document.get("[data-job-detail-boundary]")), /snapshot_support_refund_partial/);
  assert.match(textOf(document.get("[data-job-detail-metrics]")), /Goal attainment 50%/);
  assert.match(textOf(document.get("[data-job-detail-outcomes]")), /customer-notified/);
  assert.match(textOf(document.get("[data-job-detail-constraints]")), /approval-required/);
  assert.match(textOf(document.get("[data-job-detail-discipline]")), /Replays 1/);
  assert.match(textOf(document.get("[data-job-detail-sources]")), /Decision events 2/);
  const timeline = document.get("[data-job-detail-timeline]");
  assert.equal(timeline.children.length, 6);
  assert.match(textOf(timeline), /Authorization decision/);
  assert.match(textOf(timeline), /Execution receipt/);
  assert.match(textOf(timeline), /Verified observation/);
  assert.match(textOf(timeline), /Immutable finalization/);
  assert.match(textOf(timeline), /Timestamp missing/);
  assert.match(textOf(document.get("[data-job-detail-findings-list]")), /timeline event lacks a valid timestamp/);
  assert.equal(document.get("[data-status-card]").dataset.state, "partial");
});

test("renders Job detail API strings as text and rejects malformed detail contracts", async (context) => {
  await context.test("text-only rendering", async () => {
    const unsafe = structuredClone(JOB_DETAIL_FIXTURE);
    unsafe.timeline.entries[0].tool = "<img src=x onerror=alert(1)>";
    const { controller, document } = makeRuntime({
      hash: "#job-detail",
      search: "?job_id=job-refund-partial",
      detailPayload: unsafe,
    });
    await controller.ready;
    assert.match(textOf(document.get("[data-job-detail-timeline]")), /<img src=x onerror=alert\(1\)>/);
    assert.equal(document.createdTags.includes("img"), false);
  });

  await context.test("malformed response", async () => {
    const malformed = structuredClone(JOB_DETAIL_FIXTURE);
    malformed.immutable_boundary.evidence_digest = "not-a-digest";
    const { controller, document } = makeRuntime({
      hash: "#job-detail",
      search: "?job_id=job-refund-partial",
      detailPayload: malformed,
    });
    await controller.ready;
    assert.equal(document.get("[data-job-detail-message]").dataset.state, "unavailable");
    assert.equal(document.get("[data-job-detail-content]").hidden, true);
  });
});

test("renders explicit unselected not-found forbidden unavailable unauthorized and stale Job detail states", async (context) => {
  await context.test("unselected", async () => {
    const { controller, document, requests } = makeRuntime({ hash: "#job-detail" });
    await controller.ready;
    assert.equal(document.get("[data-job-detail-message]").dataset.state, "empty");
    assert.match(document.get("[data-job-detail-message-title]").textContent, /Select a finalized job/);
    assert.equal(requests.some((request) => request.includes("/intent-quality/jobs/")), false);
  });
  await context.test("invalid identifier", async () => {
    const { controller, document, requests } = makeRuntime({
      hash: "#job-detail",
      search: "?job_id=not%20safe",
    });
    await controller.ready;
    assert.match(document.get("[data-job-detail-message-title]").textContent, /not valid/);
    assert.equal(requests.some((request) => request.includes("/intent-quality/jobs/")), false);
  });
  await context.test("not found", async () => {
    const { controller, document } = makeRuntime({
      hash: "#job-detail",
      search: "?job_id=job-missing",
      detailStatus: 404,
    });
    await controller.ready;
    assert.equal(document.get("[data-job-detail-message]").dataset.state, "empty");
    assert.match(document.get("[data-job-detail-message-title]").textContent, /not found/);
  });
  await context.test("forbidden", async () => {
    const { controller, document } = makeRuntime({
      hash: "#job-detail",
      search: "?job_id=job-refund-partial",
      detailStatus: 403,
    });
    await controller.ready;
    assert.equal(document.get("[data-job-detail-message]").dataset.state, "forbidden");
  });
  await context.test("unavailable", async () => {
    const { controller, document } = makeRuntime({
      hash: "#job-detail",
      search: "?job_id=job-refund-partial",
      detailStatus: 503,
    });
    await controller.ready;
    assert.equal(document.get("[data-job-detail-message]").dataset.state, "unavailable");
  });
  await context.test("unauthorized", async () => {
    const { controller, document } = makeRuntime({
      hash: "#job-detail",
      search: "?job_id=job-refund-partial",
      sessionStatus: 401,
    });
    await controller.ready;
    assert.equal(document.get("[data-job-detail-message]").dataset.state, "unauthorized");
  });
  await context.test("stale", async () => {
    const { controller, document } = makeRuntime({
      dataState: "stale",
      hash: "#job-detail",
      search: "?job_id=job-refund-partial",
    });
    await controller.ready;
    assert.equal(document.get("[data-status-card]").dataset.state, "stale");
    assert.match(document.get("[data-status-detail]").textContent, /12 minutes old/);
  });
});
