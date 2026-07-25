import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker, { consoleApp } from "../src/worker.ts";

const fixture = JSON.parse(
  await readFile(new URL("../fixtures/support-refund-overview.json", import.meta.url), "utf8"),
) as Record<string, any>;
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
      "[data-subject]",
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
    ]) {
      this.nodes.set(selector, new FakeElement(selector.includes("filters") ? "form" : "div"));
    }
    this.get("[data-filter-window]").value = "7";
    this.get("[data-filter-verdict]").value = "";
    this.get("[data-filter-constraint]").value = "";
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
  dataState?: "fresh" | "stale";
  payload?: Record<string, any>;
  rollupStatus?: number;
  search?: string;
  sessionStatus?: number;
};

function makeRuntime(options: RuntimeOptions = {}) {
  const document = new FakeDocument();
  const requests: string[] = [];
  const pageUrls: string[] = [];
  const payload = structuredClone(options.payload || fixture);
  const runtime = {
    Date: FixedDate,
    document,
    location: { pathname: "/", search: options.search || "" },
    history: {
      replaceState(_data: unknown, _unused: string, url?: string | URL | null): void {
        pageUrls.push(String(url || ""));
      },
    },
    async fetch(input: string | URL | Request): Promise<Response> {
      const path = input instanceof Request ? input.url : String(input);
      requests.push(path);
      if (path === "/api/console/session") {
        const status = options.sessionStatus || 200;
        return response(
          status === 200
            ? { authenticated: true, tenant_id: "acme", subject: "operator-1", email: "operator@example.com" }
            : { error: { code: "access_token_missing", message: "Authentication is required." } },
          status,
        );
      }
      if (path === "/api/console/health") {
        return response({ ok: true, data_state: options.dataState || "fresh" });
      }
      if (path.startsWith("/api/console/tenants/acme/intent-quality/rollups?")) {
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
      throw new Error(`Unexpected console request: ${path}`);
    },
  };
  return {
    controller: consoleApp(runtime as any),
    document,
    pageUrls,
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
