import { boundedText, object } from "./mcp-client.ts";

export const REGISTRY_URL = "https://registry.modelcontextprotocol.io/v0.1/servers";
export const CAPABILITIES = [
  { id: "web", label: "Search & browse the web", terms: ["web", "search engine", "scrape", "crawl", "browser", "research"] },
  { id: "email", label: "Email & messaging", terms: ["email", "emails", "mail", "messaging", "slack", "gmail", "outlook"] },
  { id: "database", label: "Query databases", terms: ["database", "databases", "sql", "postgres", "mysql", "sqlite", "warehouse"] },
  { id: "files", label: "Files & documents", terms: ["file", "files", "document", "documents", "drive", "pdf", "notion"] },
  { id: "development", label: "Code & development", terms: ["code", "github", "gitlab", "repository", "repositories", "deploy", "debug"] },
  { id: "business", label: "CRM & sales", terms: ["crm", "sales", "customer", "customers", "salesforce", "hubspot"] },
  { id: "calendar", label: "Calendar & scheduling", terms: ["calendar", "scheduling", "appointment", "appointments", "meeting", "meetings"] },
] as const;
export type CatalogServer = {
  name: string; title: string; description: string; version: string; publisher: string;
  website?: string; endpoints: string[]; hosting: string; setup: string; capabilities: string[];
};
export type CatalogQuery = { query: string; capability: string; offset: number };
export type CatalogResult = {
  servers: CatalogServer[]; total: number; nextOffset: number | null;
  capabilities: Array<{ id: string; label: string }>; updatedAt: string | null;
  indexing: boolean; stale: boolean; unavailable: boolean; notice: string;
};
type Cursor = { toArray(): Record<string, unknown>[] };
export type CatalogStorage = {
  sql: { exec(query: string, ...bindings: (string | number | null)[]): Cursor };
  transactionSync<T>(work: () => T): T;
  setAlarm(time: number): Promise<void>;
  getAlarm(): Promise<number | null>;
};
type Snapshot = { generation: string; updatedAt: number };
type Pending = { generation: string; pages: number; cursor?: string; cursors: string[] };
type State = { active?: Snapshot; pending?: Pending; nextRefresh: number; error?: string };
const HOUR = 3_600_000;
export const MAX_CATALOG_PAGES = 1000;
const short = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const words = (v: string) => v.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
function contains(text: string, term: string): boolean { return ` ${words(text).join(" ")} `.includes(` ${term} `); }
function safeURL(value: unknown, endpoint = false): string | undefined {
  if (typeof value !== "string" || value.length > 2048 || /[{}]/.test(value)) return;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || (endpoint && (u.search || u.hash || (u.port && u.port !== "443")))) return;
    return u.href;
  } catch { return; }
}
export function normalizeServer(raw: unknown): CatalogServer | undefined {
  const entry = record(raw), server = record(entry.server), meta = record(record(entry._meta)["io.modelcontextprotocol.registry/official"]);
  if (meta.status !== "active" || meta.isLatest !== true) return;
  const name = short(server.name, 200), version = short(server.version, 100), description = short(server.description, 1000);
  if (!name || !version || !description) return;
  const remotes = Array.isArray(server.remotes) ? server.remotes.map(record) : [];
  const packages = Array.isArray(server.packages) ? server.packages.map(record) : [];
  // Only prefill transports the existing client supports. Headers, URL templates,
  // credentials and protocol claims are never copied from registry metadata.
  const endpoints = [...new Set(remotes.filter(r => r.type === "streamable-http" && (!Array.isArray(r.headers) || r.headers.length === 0)).map(r => safeURL(r.url, true)).filter((v): v is string => Boolean(v)))].slice(0, 3);
  const title = short(server.title, 120) || name;
  const text = `${name} ${title} ${description}`;
  return {
    name, title, description, version, publisher: name.split("/")[0],
    website: safeURL(server.websiteUrl) || safeURL(record(server.repository).url), endpoints,
    hosting: remotes.length ? (packages.length ? "Remote and local packages" : "Remote server") : "Local package",
    setup: endpoints.length ? "Administrator must enable the exact URL. Check provider authentication: public or bearer-token access is supported; OAuth-only access is not yet supported."
      : "Requires setup outside this builder: local packages, legacy SSE, custom headers or parameterized URLs are not supported here. Check the provider documentation.",
    capabilities: CAPABILITIES.filter(c => c.terms.some(t => contains(text, t))).map(c => c.id),
  };
}
export function parseCatalogQuery(params: URLSearchParams): CatalogQuery {
  for (const key of params.keys()) if (!["q", "capability", "offset"].includes(key) || params.getAll(key).length !== 1) throw new Error("Invalid catalog search parameters.");
  const query = (params.get("q") || "").trim(), capability = params.get("capability") || "", offsetText = params.get("offset") || "0";
  if (query.length > 200 || (capability && !CAPABILITIES.some(c => c.id === capability)) || !/^\d{1,6}$/.test(offsetText) || Number(offsetText) > MAX_CATALOG_PAGES * 100) throw new Error("Invalid catalog search parameters.");
  return { query, capability, offset: Number(offsetText) };
}

// One coordination object per registry source, separate from all tenant/agent
// state. SQLite keeps searches bounded without loading the catalog into memory.
export class RegistryCatalog {
  private storage: CatalogStorage;
  private fetcher: typeof fetch;
  private clock: () => number;
  constructor(storage: CatalogStorage, fetcher: typeof fetch = (input, init) => fetch(input, init), clock = Date.now) {
    this.storage = storage; this.fetcher = fetcher; this.clock = clock;
    storage.sql.exec("CREATE TABLE IF NOT EXISTS registry_servers (generation TEXT NOT NULL, name TEXT NOT NULL, title TEXT NOT NULL, search TEXT NOT NULL, tags TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(generation, name))");
    storage.sql.exec("CREATE TABLE IF NOT EXISTS registry_state (id INTEGER PRIMARY KEY, payload TEXT NOT NULL)");
  }
  private state(): State { const row = this.storage.sql.exec("SELECT payload FROM registry_state WHERE id = 1").toArray()[0]; return row ? JSON.parse(String(row.payload)) as State : { nextRefresh: 0 }; }
  private save(state: State) { this.storage.sql.exec("INSERT OR REPLACE INTO registry_state VALUES (1, ?)", JSON.stringify(state)); }
  async search(input: CatalogQuery): Promise<CatalogResult> {
    // Validate again at the RPC boundary.
    const { query, capability, offset } = parseCatalogQuery(new URLSearchParams({ q: input.query, capability: input.capability, offset: String(input.offset) }));
    if (await this.storage.getAlarm() === null) await this.storage.setAlarm(Math.max(this.clock() + 1, this.state().nextRefresh));
    // Read the snapshot after the scheduling awaits; no await may split this
    // state read from its SQL queries while a refresh swaps generations.
    const state = this.state();
    const selected = state.active?.generation || state.pending?.generation || "";
    const params: (string | number)[] = [selected];
    let where = "generation = ?";
    if (capability) { where += " AND instr(tags, ?) > 0"; params.push(`|${capability}|`); }
    const stop = new Set(["i", "want", "to", "a", "an", "the", "my", "with", "for", "and", "or", "can", "that", "me", "help"]);
    const tokens = [...new Set(words(query).filter(t => !stop.has(t)))].slice(0, 16);
    const categories = CAPABILITIES.filter(c => c.terms.some(t => contains(query, t)));
    if (query) {
      const alternatives: string[] = [];
      if (tokens.length) { alternatives.push(`(${tokens.map(() => "instr(search, ?) > 0").join(" AND ")})`); params.push(...tokens); }
      for (const c of categories) { alternatives.push("instr(tags, ?) > 0"); params.push(`|${c.id}|`); }
      where += alternatives.length ? ` AND (${alternatives.join(" OR ")})` : " AND 0";
    }
    const total = Number(this.storage.sql.exec(`SELECT count(*) AS count FROM registry_servers WHERE ${where}`, ...params).toArray()[0].count);
    const result = this.storage.sql.exec(`SELECT payload FROM registry_servers WHERE ${where} ORDER BY CASE WHEN title = ? THEN 2 WHEN instr(title, ?) > 0 THEN 1 ELSE 0 END DESC, name ASC LIMIT 20 OFFSET ?`, ...params, query.toLowerCase(), query.toLowerCase(), offset).toArray();
    const indexing = Boolean(state.pending) || (!state.active && !state.error);
    const stale = Boolean(state.active && (state.error || this.clock() - state.active.updatedAt >= HOUR));
    return { servers: result.map(row => JSON.parse(String(row.payload)) as CatalogServer), total, nextOffset: offset + 20 < total ? offset + 20 : null,
      capabilities: CAPABILITIES.map(({ id, label }) => ({ id, label })), updatedAt: state.active ? new Date(state.active.updatedAt).toISOString() : null,
      indexing, stale, unavailable: !state.active && Boolean(state.error),
      notice: state.error || (indexing ? state.active ? "Refreshing the registry catalog in the background." : "The registry catalog is being indexed. Results are incomplete; search again shortly. You can also enter an endpoint manually." : "Capabilities are advertised by publishers and categorized from descriptions. Connect to inspect the actual tools."),
    };
  }
  async alarm(): Promise<void> {
    const state = this.state(), now = this.clock();
    if (!state.pending && state.nextRefresh > now) { await this.storage.setAlarm(state.nextRefresh); return; }
    state.pending ||= { generation: crypto.randomUUID(), pages: 0, cursors: [] };
    const pending = state.pending;
    this.save(state);
    // Watchdog survives interruption between committing a page and rescheduling.
    await this.storage.setAlarm(now + 300_000);
    let servers: CatalogServer[], cursor: unknown;
    try {
      const url = new URL(REGISTRY_URL); url.searchParams.set("limit", "100"); url.searchParams.set("version", "latest");
      if (pending.cursor) url.searchParams.set("cursor", pending.cursor);
      const response = await this.fetcher(url.href, { headers: { accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(15_000) });
      if (!response.ok) { await response.body?.cancel(); throw new Error("Registry unavailable"); }
      const page = object(JSON.parse(await boundedText(response, 1_048_576)));
      if (!Array.isArray(page.servers) || page.servers.length > 100) throw new Error("Invalid registry page");
      const metadata = object(page.metadata); cursor = metadata.nextCursor;
      if (cursor !== undefined && cursor !== null && cursor !== "" && (typeof cursor !== "string" || cursor.length > 2048 || pending.cursors.includes(cursor))) throw new Error("Invalid registry cursor");
      if (pending.pages >= MAX_CATALOG_PAGES || (pending.pages === MAX_CATALOG_PAGES - 1 && cursor)) throw new Error("Catalog limit reached");
      servers = page.servers.map(normalizeServer).filter((s): s is CatalogServer => Boolean(s));
    } catch {
      // Do not publish a partial refresh or leak upstream response/error content.
      this.storage.transactionSync(() => {
        this.storage.sql.exec("DELETE FROM registry_servers WHERE generation = ?", pending.generation);
        state.pending = undefined; state.nextRefresh = this.clock() + HOUR;
        state.error = "Registry refresh failed or exceeded the catalog limit. Showing the last complete catalog when available; retry is scheduled within an hour. Manual connection is still available.";
        this.save(state);
      });
      await this.storage.setAlarm(state.nextRefresh);
      return;
    }
    this.storage.transactionSync(() => {
      for (const server of servers) this.storage.sql.exec("INSERT OR REPLACE INTO registry_servers VALUES (?, ?, ?, ?, ?, ?)", pending.generation, server.name, server.title.toLowerCase(), `${server.name} ${server.title} ${server.description}`.toLowerCase(), `|${server.capabilities.join("|")}|`, JSON.stringify(server));
      pending.pages++;
      if (typeof cursor === "string" && cursor) { pending.cursor = cursor; pending.cursors.push(cursor); }
      else {
        state.active = { generation: pending.generation, updatedAt: this.clock() };
        state.pending = undefined; state.error = undefined; state.nextRefresh = this.clock() + HOUR;
        this.storage.sql.exec("DELETE FROM registry_servers WHERE generation != ?", pending.generation);
      }
      this.save(state);
    });
    await this.storage.setAlarm(state.pending ? this.clock() + 1000 : state.nextRefresh);
  }
}
