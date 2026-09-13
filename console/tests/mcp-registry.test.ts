import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { RegistryCatalog, normalizeServer, parseCatalogQuery, REGISTRY_URL, MAX_CATALOG_PAGES, type CatalogStorage } from "../src/mcp-registry.ts";
import worker from "../src/worker.ts";
import demo from "../src/demo-worker.ts";

function entry(name: string, description: string, extra: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) {
  return { server: { name: `org.example/${name}`, title: name, description, version: "1", remotes: [{ type: "streamable-http", url: `https://${name}.example/mcp` }], ...extra }, _meta: { "io.modelcontextprotocol.registry/official": { status: "active", isLatest: true, ...meta } } };
}
function harness(pages: unknown[]) {
  const db = new DatabaseSync(":memory:"); let alarm: number | null = null, now = 1000000;
  const storage: CatalogStorage = {
    sql: { exec(query, ...values) { const rows = db.prepare(query).all(...values) as Record<string, unknown>[]; return { toArray: () => rows }; } },
    transactionSync(work) { db.exec("BEGIN"); try { const result = work(); db.exec("COMMIT"); return result; } catch (e) { db.exec("ROLLBACK"); throw e; } },
    async getAlarm() { return alarm; }, async setAlarm(value) { alarm = value; },
  };
  const requests: string[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    requests.push(String(url)); assert.equal(new URL(String(url)).origin, new URL(REGISTRY_URL).origin);
    assert.equal(init?.redirect, "manual"); assert.ok(init?.signal); assert.deepEqual(init?.headers, { accept: "application/json" });
    const page = pages.shift(); if (page instanceof Error) throw page; if (page instanceof Response) return page;
    assert.ok(page); return Response.json(page);
  };
  const catalog = new RegistryCatalog(storage, fetcher, () => now);
  const search = (query = "", capability = "", offset = 0) => catalog.search({ query, capability, offset });
  const tick = async () => { now = alarm || now; alarm = null; await catalog.alarm(); };
  return { catalog, search, tick, requests, pages, storage, db };
}
const page = (servers: unknown[], nextCursor?: string) => ({ servers, metadata: { nextCursor } });

test("indexes all pages, categorizes capabilities, ranks names, paginates and never forwards queries", async () => {
  const h = harness([page([entry("letters", "Deliver messages to email accounts"), entry("database", "SQL queries"), entry("retired", "email", {}, { status: "deleted" }), entry("old", "email", {}, { isLatest: false })], "next/page"), page([entry("warehouse", "Postgres analytics"), ...Array.from({ length: 24 }, (_, i) => entry(`mail${i}`, "Email tools"))])]);
  assert.equal((await h.search()).indexing, true); await h.tick();
  assert.equal((await h.search("send emails")).total, 1); assert.equal((await h.search()).indexing, true);
  // Resume indexing after object eviction.
  const reloaded = new RegistryCatalog(h.storage, async url => { assert.match(String(url), /cursor=next%2Fpage/); return Response.json(h.pages.shift()); });
  await reloaded.alarm();
  assert.equal((await h.search("send emails")).total, 25);
  assert.equal((await h.search("query a database")).total, 2);
  assert.equal((await h.search("database")).servers[0].title, "database");
  const first = await h.search("", "email"); assert.equal(first.servers.length, 20); assert.equal(first.nextOffset, 20);
  const second = await h.search("", "email", 20); assert.equal(second.servers.length, 5); assert.equal(second.nextOffset, null);
  assert.equal((await h.search("nomatch")).total, 0); assert.equal((await h.search("%_'")).total, 0);
  assert.ok((await h.search()).updatedAt); assert.equal((await h.search()).indexing, false);
  assert.equal(h.requests.length, 1); assert.ok(!h.requests[0].includes("search=")); h.db.close();
});

test("hourly atomic refresh removes deleted entries and preserves a last good catalog on failure", async () => {
  const h = harness([page([entry("mail", "Email")]), page([entry("fresh", "Database")], "next"), new Error("SECRET upstream"), page([entry("mail", "Email", {}, { status: "deprecated" }), entry("new", "SQL")])]);
  await h.search(); await h.tick(); const stamp = (await h.search()).updatedAt;
  await h.tick(); assert.equal((await h.search()).servers[0].title, "mail"); assert.equal((await h.search()).indexing, true);
  await h.tick(); const stale = await h.search(); assert.equal(stale.stale, true); assert.equal(stale.updatedAt, stamp); assert.equal(stale.total, 1); assert.doesNotMatch(stale.notice, /SECRET/);
  await h.tick(); assert.equal((await h.search()).stale, false); assert.equal((await h.search()).servers[0].title, "new");
  assert.equal(h.db.prepare("SELECT count(DISTINCT generation) AS n FROM registry_servers").get()!.n, 1); h.db.close();
});

test("malformed pages, redirects, oversized data and repeating cursors fail explicitly", async () => {
  for (const invalid of [new Response(null, { status: 302, headers: { location: "https://evil.test" } }), new Response("x".repeat(1048577)), { servers: [], metadata: { nextCursor: 3 } }, { servers: "bad" }]) {
    const h = harness([invalid]); await h.search(); await h.tick(); const result = await h.search(); assert.equal(result.unavailable, true); assert.equal(result.indexing, false); assert.equal(h.requests.length, 1); h.db.close();
  }
  const h = harness([page([entry("a", "Email")], "same"), page([entry("b", "Email")], "same")]); await h.search(); await h.tick(); await h.tick(); assert.equal((await h.search()).unavailable, true); assert.equal((await h.search()).total, 0); h.db.close();
});

test("normalization bounds metadata and never imports unsafe configuration", () => {
  const server = normalizeServer(entry("x", "Email", { websiteUrl: "javascript:alert(1)", remotes: [{ type: "stdio", url: "https://bad.test" }, { type: "streamable-http", url: "https://safe.test/mcp" }, { type: "streamable-http", url: "https://user:pass@bad.test/mcp" }, { type: "streamable-http", url: "https://bad.test/mcp?token=secret" }, { type: "streamable-http", url: "https://bad.test/{account}" }, { type: "streamable-http", url: "https://headers.test", headers: [{ name: "Authorization", value: "SECRET" }] }] }))!;
  assert.deepEqual(server.endpoints, ["https://safe.test/mcp"]); assert.equal(server.website, undefined); assert.doesNotMatch(JSON.stringify(server), /SECRET|token=secret/);
  assert.equal(normalizeServer(entry("local", "Files", { remotes: [], packages: [{ registryType: "npm" }] }))!.endpoints.length, 0);
  for (const q of ["q=x&q=y", "url=https://evil.test", "offset=-1", "capability=unknown", `q=${"x".repeat(201)}`]) assert.throws(() => parseCatalogQuery(new URLSearchParams(q)));
});

test("discovery requires membership, allows viewer reads, preserves mutation protections and hides public demo", async () => {
  let reads = 0;
  const h = harness([]);
  const env = { CONSOLE_ENVIRONMENT: "development", CONSOLE_ENABLE_MOCK_IDENTITY: "true", CONSOLE_MOCK_TENANT_ID: "workspace-a", CONSOLE_STATIC_TENANT_ROLE: "viewer", CONSOLE_MOCK_SUBJECT: "local-operator", MCP_REGISTRY: { getByName(name: string) { assert.equal(name, "official-v1"); return { async search(query: Parameters<RegistryCatalog["search"]>[0]) { reads++; return h.catalog.search(query); } }; } } };
  const path = "https://console.test/api/agents/workspace-a/catalog?q=send+emails";
  assert.notEqual((await worker.fetch(new Request(path), {})).status, 200);
  assert.equal((await worker.fetch(new Request(path.replace("workspace-a", "workspace-b")), env)).status, 403);
  assert.equal(reads, 0);
  const response = await worker.fetch(new Request(path, { headers: { authorization: "Bearer SECRET" } }), env); assert.equal(response.status, 200); assert.equal(reads, 1); assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.equal((await worker.fetch(new Request(path + "&url=https://evil.test"), env)).status, 400);
  assert.equal((await worker.fetch(new Request(path, { method: "POST" }), env)).status, 405);
  assert.equal((await demo.fetch(new Request(path))).status, 404);
  assert.equal((await worker.fetch(new Request(path), { ...env, MCP_REGISTRY: undefined })).status, 503);
  h.db.close();
});

test("catalog capacity errors preserve the old snapshot and duplicate completed alarms do not recrawl", async () => {
  const h = harness([page([entry("existing", "Email")]), page([entry("overflow", "SQL")], "more")]);
  await h.search(); await h.tick();
  await h.catalog.alarm(); assert.equal(h.requests.length, 1);
  const row = h.db.prepare("SELECT payload FROM registry_state WHERE id=1").get()!;
  const state = JSON.parse(String(row.payload));
  state.pending = { generation: "oversize", pages: MAX_CATALOG_PAGES - 1, cursors: [] };
  h.db.prepare("UPDATE registry_state SET payload=? WHERE id=1").run(JSON.stringify(state));
  await h.tick(); const result = await h.search();
  assert.equal(result.stale, true); assert.equal(result.total, 1); assert.equal(result.servers[0].title, "existing"); h.db.close();
});
