import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { RegistryCatalog, normalizeServer, parseCatalogQuery, REGISTRY_URL, MAX_CATALOG_PAGES, type CatalogStorage } from "../src/mcp-registry.ts";
import worker from "../src/worker.ts";
import demo from "../src/demo-worker.ts";
import { mcpMatching } from '../src/mcp-matching.ts';

function entry(name: string, description: string, extra: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) {
  return { server: { name: `org.example/${name}`, title: name, description, version: "1", remotes: [{ type: "streamable-http", url: `https://${name}.example/mcp` }], ...extra }, _meta: { "io.modelcontextprotocol.registry/official": { status: "active", isLatest: true, ...meta } } };
}
function harness(pages: unknown[]) {
  const db = new DatabaseSync(":memory:"); let alarm: number | null = null, now = 1000000;
  const storage: CatalogStorage = {
    sql: { exec(query, ...values) { assert.ok(values.length<=100,'Cloudflare SQL parameter limit');const rows = db.prepare(query).all(...values) as Record<string, unknown>[]; return { toArray: () => rows }; } },
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

test('per-capability suggestions rank published matches, expand terms and exclude generic noise',async()=>{
 const h=harness([page([entry('Contractor license records','License lookup and history for contractors'),entry('License helper','Licensing metadata'),entry('Employment statistics','Workforce and labour trends'),entry('Contact enrichment','CRM people records'),entry('Unrelated storage','Read data and information'),entry('Stock market','Financial market research')])]);await h.tick();
 const suggest=(query:string)=>h.catalog.search({query,capability:'',offset:0,mode:'suggest'});
 const license=await suggest('Contractor License History');assert.equal(license.servers[0].title,'Contractor license records');assert.deepEqual(license.servers[0].matchTerms,['contractor','license']);
 assert.deepEqual((await suggest('Labor Market Data')).servers.map(s=>s.title),['Employment statistics']);
 assert.deepEqual((await suggest('Contact Information')).servers.map(s=>s.title),['Contact enrichment']);
 assert.equal((await suggest('Read data information')).total,0);assert.equal((await suggest('UnfindableNeedXYZ')).total,0);
 assert.equal((await suggest("' OR 1=1 --")).total,0);assert.equal(h.requests.length,1);
 await h.catalog.search({query:'license labor contact email web database document social calendar ticket',capability:'web',auth:'unspecified',offset:20,mode:'suggest'});
 assert.deepEqual(parseCatalogQuery(new URLSearchParams('q=licenses&mode=suggest')).mode,'suggest');
 for(const params of ['mode=all','mode=suggest&mode=suggest','mode=','q='+ 'a'.repeat(201)]) assert.throws(()=>parseCatalogQuery(new URLSearchParams(params)));
 await assert.rejects(()=>h.catalog.search({query:'test',capability:'',offset:0,mode:'invalid' as any}));
});

test('matching is bounded and provider text is treated only as metadata',()=>{
 const matcher=mcpMatching();assert.ok(matcher.groups('x '.repeat(1000)).length<=8);
 assert.equal(matcher.match('License History','send_mail','Send email to a contact').score,0);
 assert.equal(matcher.match('Contact information','get_people','Read CRM records').terms[0],'contact');
 assert.deepEqual(matcher.groups('data information'),[]);
});

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
  const path = "https://console.test/api/agents/workspace-a/catalog?q=send+emails&mode=suggest";
  assert.notEqual((await worker.fetch(new Request(path), {})).status, 200);
  assert.equal((await worker.fetch(new Request(path.replace("workspace-a", "workspace-b")), env)).status, 403);
  assert.equal(reads, 0);
  const response = await worker.fetch(new Request(path, { headers: { authorization: "Bearer SECRET" } }), env); assert.equal(response.status, 200); assert.equal(reads, 1); assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.equal((await worker.fetch(new Request(path + "&url=https://evil.test"), env)).status, 400);
  assert.equal((await worker.fetch(new Request(path + "&auth=api-key"), env)).status, 200);
  for (const suffix of ["&auth=oauth", "&auth=api-key&auth=unspecified"]) assert.equal((await worker.fetch(new Request(path + suffix), env)).status, 400);
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


test("persisted catalog rows use current setup guidance without refreshing provider metadata", async () => {
  const h = harness([page([entry("remote", "Email"), entry("local", "Files", {remotes: []})])]);
  await h.search(); await h.tick(); const before = await h.search();
  for (const row of h.db.prepare("SELECT name,payload FROM registry_servers").all()) {
    const cached = JSON.parse(String(row.payload)); cached.setup = "Administrator must enable the exact URL.";
    h.db.prepare("UPDATE registry_servers SET payload=? WHERE name=?").run(JSON.stringify(cached), String(row.name));
  }
  const restarted = new RegistryCatalog(h.storage, async () => { throw new Error("Search must not refresh upstream"); });
  const result = await restarted.search({query:"",capability:"",offset:0});
  assert.match(result.servers.find(s=>s.title==="remote")!.setup, /Workspace-owner approval/);
  assert.match(result.servers.find(s=>s.title==="local")!.setup, /setup outside this builder/);
  assert.equal(result.updatedAt,before.updatedAt);assert.equal(result.total,before.total);assert.equal(h.requests.length,1);
  assert.deepEqual(result.servers.map(({setup,...metadata})=>metadata),before.servers.map(({setup,...metadata})=>metadata));
  assert.match(String(h.db.prepare("SELECT payload FROM registry_servers LIMIT 1").get()!.payload),/Administrator must enable/);
  h.db.close();
});

test("auth labels use structured declarations without importing secrets or guessing schemes/pricing", () => {
  const normalized = normalizeServer(entry("auth", "Free public OAuth bearer API key email service", {
    remotes: [{ type: "streamable-http", url: "https://auth.example/mcp", headers: [
      { name: "authorization", value: "Basic SECRET-VALUE" },
      { name: "X-Api-Key", isRequired: false, default: "SECRET-DEFAULT" },
      { name: "X-Account", variables: { account: { isSecret: true, value: "SECRET-VARIABLE" } } },
      null,
    ] }],
    packages: [{ environmentVariables: [null, { name: "PROVIDER_API_KEY", isSecret: true }, { name: "PASSWORD", isSecret: true }], transport: { headers: [{ name: "Authorization" }] } }],
  }))!;
  assert.deepEqual(normalized.authTypes, ["api-key", "authorization-header", "other-secret"]);
  assert.equal(normalized.endpoints.length, 0); assert.doesNotMatch(JSON.stringify(normalized), /SECRET-/);
  assert.deepEqual(normalizeServer(entry("unknown", "Free public OAuth bearer API key"))!.authTypes, ["unspecified"]);
  assert.deepEqual(normalizeServer(entry("malformed", "Email", { remotes: [{ headers: "Authorization" }, { headers: [null, { name: {}, isSecret: "true" }, { name: "Accept", value: "application/json" }] }], packages: [null, { environmentVariables: {} }] }))!.authTypes, ["unspecified"]);
  assert.deepEqual(normalizeServer(entry("local", "Email", { remotes: [], packages: [{ environmentVariables: [{ name: "EXAMPLE_APIKEY", isRequired: false }] }] }))!.authTypes, ["api-key"]);
  assert.deepEqual(normalizeServer(entry("secret", "Email", { packages: [{ environmentVariables: [{ name: "ACCESS_TOKEN", isSecret: true }] }] }))!.authTypes, ["other-secret"]);
});

test("auth intersects capability/text and paginates without forwarding filter data", async () => {
  const keyed = { packages: [{ environmentVariables: [{ name: "API_KEY" }] }] };
  const h = harness([page([...Array.from({ length: 24 }, (_, i) => entry(`mail${i}`, "Email", keyed)), entry("sql", "SQL database", keyed), entry("unknown", "Email"), entry("header", "Email", { remotes: [{ headers: [{ name: "Authorization" }] }] }), entry("secret", "Email", { packages: [{ environmentVariables: [{ isSecret: true }] }] })])]);
  await h.search(); await h.tick();
  const search = (auth: string, offset = 0, query = "send emails", capability = "email") => h.catalog.search({ query, capability, auth, offset });
  const first = await search("api-key"); assert.equal(first.total, 24); assert.equal(first.servers.length, 20); assert.equal(first.nextOffset, 20);
  const second = await search("api-key", 20); assert.equal(second.servers.length, 4); assert.equal(second.nextOffset, null);
  assert.equal(new Set([...first.servers, ...second.servers].map(s => s.name)).size, 24);
  assert.equal((await search("api-key", 0, "sql", "database")).total, 1);
  assert.equal((await search("api-key", 0, "no-match")).total, 0);
  for (const auth of ["authorization-header", "other-secret", "unspecified"]) assert.equal((await search(auth)).total, 1);
  assert.equal(first.authTypes.length, 4); assert.equal((await search("")).total, 27);
  assert.equal(h.requests.length, 1); assert.doesNotMatch(h.requests[0], /auth=|q=|capability=/);
  for (const auth of ["oauth", "none", "free", "api-key|", "' OR 1=1 --"]) {
    assert.throws(() => parseCatalogQuery(new URLSearchParams({ auth })));
    await assert.rejects(search(auth), /Invalid catalog/);
  }
  assert.throws(() => parseCatalogQuery(new URLSearchParams("auth=api-key&auth=unspecified")));
  assert.equal(parseCatalogQuery(new URLSearchParams()).auth, ""); h.db.close();
});

test("legacy rows match unspecified until atomic refresh supplies declared authentication", async () => {
  const keyed = entry("mail", "Email", { packages: [{ environmentVariables: [{ name: "API_KEY" }] }] });
  const h = harness([page([keyed]), page([keyed])]); await h.search(); await h.tick();
  const row = h.db.prepare("SELECT payload FROM registry_servers").get()!;
  const legacy = JSON.parse(String(row.payload)); delete legacy.authTypes;
  h.db.prepare("UPDATE registry_servers SET payload=?, tags='|email|'").run(JSON.stringify(legacy));
  const search = (auth: string) => h.catalog.search({ query: "", capability: "email", offset: 0, auth });
  assert.equal((await search("api-key")).total, 0);
  const unknown = await search("unspecified"); assert.equal(unknown.total, 1); assert.deepEqual(unknown.servers[0].authTypes, ["unspecified"]);
  assert.match(unknown.notice, /Authentication details.*awaiting the next registry refresh/);
  assert.match((await search("api-key")).notice, /authentication-filtered results may be incomplete/);
  await h.tick(); assert.equal((await search("api-key")).total, 1); assert.equal((await search("unspecified")).total, 0); assert.doesNotMatch((await search("")).notice, /awaiting the next registry refresh/); h.db.close();
});
