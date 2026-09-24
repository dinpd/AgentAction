import { AUTH_TYPES, CAPABILITIES, REGISTRY_URL, normalizeServer, type CatalogServer } from './mcp-registry.ts';
import { boundedText, RuntimeError } from './mcp-client.ts';
import { READINESS_ORIGIN, readinessStale, type ReadinessSummary } from './mcp-readiness.ts';

type PublicServer = { listing: CatalogServer; updatedAt: string | null; remoteCount: number };
type Snapshot = { servers: PublicServer[]; cursor: string | null; retrievedAt: string };
type Dependencies = {
  fetcher?: typeof fetch;
  cache?: { match(request: Request): Promise<Response | undefined>; put(request: Request, response: Response): Promise<void> };
  lookup(endpoints: string[]): Promise<ReadinessSummary[]>;
  now?: () => number;
};
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const validName = (name: string) => name.length <= 200 && /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(name) && !name.split('/').some(p => !p || p === '.' || p === '..');
export const profilePath = (name: string) => '/servers/' + encodeURIComponent(name);
const sourceURL = (name: string) => REGISTRY_URL + '/' + encodeURIComponent(name) + '/versions/latest';

function normalized(raw: unknown): PublicServer | undefined {
  const listing = normalizeServer(raw);
  if (!listing || !validName(listing.name)) return;
  const entry = record(raw), server = record(entry.server), meta = record(record(entry._meta)['io.modelcontextprotocol.registry/official']);
  const updatedAt = typeof meta.updatedAt === 'string' && Number.isFinite(Date.parse(meta.updatedAt)) ? new Date(meta.updatedAt).toISOString() : null;
  return { listing, updatedAt, remoteCount: Array.isArray(server.remotes) ? server.remotes.length : 0 };
}

async function registry(url: string, name: string | undefined, deps: Dependencies): Promise<Snapshot> {
  // Cache only normalized public metadata. Keys and fetch destinations are built
  // here, never supplied as URLs by the browser. No workspace bindings are used.
  const key = new Request(READINESS_ORIGIN + '/_registry-cache/v1/' + encodeURIComponent(url));
  const now = deps.now?.() ?? Date.now();
  try {
    const hit = await deps.cache?.match(key);
    if (hit) {
      const saved = JSON.parse(await boundedText(hit, 1_048_576)) as Snapshot;
      if (now - Date.parse(saved.retrievedAt) < 300_000) return saved;
    }
  } catch { /* Cache availability must not block public metadata reads. */ }
  const response = await (deps.fetcher || fetch)(url, {headers:{accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(10_000)});
  if (!response.ok) {
    await response.body?.cancel();
    throw new RuntimeError(response.status === 404 && name ? 'This listing is not available in the official registry.' : 'The official registry is temporarily unavailable. Please try again.', response.status === 404 && name ? 404 : 503);
  }
  const raw = record(JSON.parse(await boundedText(response, 1_048_576)));
  const entries = name ? [raw] : raw.servers;
  if (!Array.isArray(entries) || entries.length > 20) throw new RuntimeError('The registry returned an unsupported response. Please try again.', 502);
  const servers = entries.map(normalized).filter((s): s is PublicServer => Boolean(s));
  if (name && !servers.length) throw new RuntimeError('This listing is no longer active in the official registry.', 404);
  if (name && servers[0].listing.name !== name) throw new RuntimeError('The registry returned a different listing. Please try again.', 502);
  const cursor = record(raw.metadata).nextCursor;
  if (cursor !== undefined && cursor !== null && (typeof cursor !== 'string' || cursor.length > 2048)) throw new RuntimeError('The registry returned an unsupported page cursor.', 502);
  const snapshot: Snapshot = {servers, cursor: name ? null : cursor as string || null, retrievedAt:new Date(now).toISOString()};
  try { await deps.cache?.put(key, Response.json(snapshot, {headers:{'cache-control':'public, max-age=300'}})); } catch { /* Optional cache. */ }
  return snapshot;
}

function shell(title: string, body: string, path: string, status = 200): Response {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · AgentAction</title><meta name="description" content="Review MCP server listings, setup information and public readiness observations in AgentAction."><link rel="canonical" href="${escape(READINESS_ORIGIN + path)}"><link rel="icon" href="/favicon.png"><link rel="stylesheet" href="/assets/servers.css">${status !== 200 ? '<meta name="robots" content="noindex">' : ''}</head><body><header><a class="brand" href="https://agentaction.dev">AgentAction<span> / MCP servers</span></a><nav aria-label="Main navigation"><a href="/servers">Browse servers</a><a href="/">MCP Checker</a><a href="https://agentaction.dev/recipes">Agent recipes</a></nav></header><main>${body}</main><footer><span>Public registry information and observations · No endorsement or certification</span><a href="https://github.com/dinpd/AgentAction">Source ↗</a></footer></body></html>`, {status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer'}});
}

function searchForm(query: string) {
  return `<form action="/servers" method="get" role="search"><label for="q">Find an MCP server</label><div class="search"><input id="q" name="q" type="search" maxlength="200" value="${escape(query)}" placeholder="Search by server name"><button>Search servers</button></div></form>`;
}

function correctionLink(server: CatalogServer) {
  const url = new URL('https://github.com/dinpd/AgentAction/issues/new');
  url.searchParams.set('title', '[Listing correction] ' + server.name);
  url.searchParams.set('body', `Server: ${server.name}\nProfile: ${READINESS_ORIGIN + profilePath(server.name)}\nRegistry source: ${sourceURL(server.name)}\n\nWhat is inaccurate or missing?\n\nSuggested correction and supporting source:\n\nYour relationship to the project (optional):\n\nDo not include credentials or private account information. A correction request does not establish maintainer ownership.`);
  return url.href;
}

function observationHTML(profiles: ReadinessSummary[], now: number) {
  if (!profiles.length) return '<p>No published report is available for the displayed endpoints. This means untested, not unsupported or unsafe.</p>';
  return profiles.map(p => `<article class="observation"><p class="eyebrow">${readinessStale(p, now) ? 'Stale observation — recheck before use' : 'Recent public observation'}</p><h3>${escape(p.endpoint)}</h3><p>Checked ${escape(p.checkedAt)} · expires ${escape(p.expiresAt)}</p><p>${escape(p.toolCount)} tools discovered · ${escape(p.reviewCount)} findings to review · ${escape(p.failureCount)} failed checks</p><p>Discovery: ${escape(p.visibility)} · requested protocol: ${escape(p.requestedProtocol)} · observed protocol: ${escape(p.observedProtocol || 'Not observed')}</p><p>Anonymous metadata inspection. Execution, account permissions, side effects and retries remain untested.</p><a href="/reports/${p.id}">Read the findings and coverage ↗</a></article>`).join('');
}

export async function publicServers(url: URL, deps: Dependencies): Promise<Response> {
  let path = '/servers';
  try {
    if (url.pathname === '/servers' || url.pathname === '/servers/') {
      const params = url.searchParams;
      for (const key of params.keys()) if (!['q','cursor'].includes(key) || params.getAll(key).length !== 1) throw new RuntimeError('Use a server name and the directory pagination links.');
      const query = (params.get('q') || '').trim(), cursor = params.get('cursor') || '';
      if (query.length > 200 || cursor.length > 2048) throw new RuntimeError('The search or page cursor is too long.');
      const upstream = new URL(REGISTRY_URL); upstream.searchParams.set('limit','20');upstream.searchParams.set('version','latest');
      if (query) upstream.searchParams.set('search',query);
      if (cursor) upstream.searchParams.set('cursor',cursor);
      const snapshot = await registry(upstream.href, undefined, deps);
      const next = new URLSearchParams({...(query ? {q:query} : {}),cursor:snapshot.cursor || ''});
      return shell('MCP server directory', `<section class="intro"><p class="eyebrow">MCP SERVER DIRECTORY / PREVIEW</p><h1>Find a server.<br>Know what is declared.</h1><p class="lede">Browse public MCP listings and review how they appear in AgentAction. No workspace login required.</p></section>${searchForm(query)}<p class="note">Source: <a href="${escape(upstream.href)}">Official MCP Registry</a>. Active latest listings only; other directories are not included. Retrieved ${escape(snapshot.retrievedAt)}; metadata may be cached for five minutes.</p><section class="listings" aria-label="Server listings">${snapshot.servers.map(({listing:s}) => `<article class="listing"><p class="eyebrow">${escape(s.hosting)}</p><h2><a href="${escape(profilePath(s.name))}">${escape(s.title)}</a></h2><p class="identity">${escape(s.name)}</p><p>${escape(s.description)}</p><a href="${escape(profilePath(s.name))}">Review server profile →</a></article>`).join('') || '<p>No active listings on this page. Try another name or continue to the next page if available.</p>'}</section>${snapshot.cursor && snapshot.cursor !== cursor ? `<a class="button" href="/servers?${escape(next.toString())}">Next page →</a>` : ''}<section class="note"><h2>Maintain a server?</h2><p>Open its profile to review the listing, suggest a correction or run a readiness check. Listing data is supplied by publishers; inclusion does not mean the server was tested or endorsed.</p></section>`, path);
    }
    let name: string;
    try { name = decodeURIComponent(url.pathname.slice('/servers/'.length)); } catch { throw new RuntimeError('Invalid server name.'); }
    if (!validName(name) || url.search) throw new RuntimeError('Use the stable server link from the directory.');
    path = profilePath(name);
    const snapshot = await registry(sourceURL(name), name, deps), {listing:s,updatedAt,remoteCount} = snapshot.servers[0];
    let profiles: ReadinessSummary[] = [], reportError = false;
    if (s.inspectableEndpoints.length) {
      try { profiles = (await deps.lookup(s.inspectableEndpoints)).filter(p => s.inspectableEndpoints.includes(p.endpoint) && /^[a-f0-9]{64}$/.test(p.id)); }
      catch { reportError = true; }
    }
    const capabilities = s.capabilities.map(id => CAPABILITIES.find(c => c.id === id)?.label).filter(Boolean);
    const auth = s.authTypes.map(id => AUTH_TYPES.find(a => a.id === id)?.label).filter(Boolean);
    return shell(s.title, `<a href="/servers">← Browse servers</a><section class="intro"><p class="eyebrow">PUBLIC SERVER PROFILE / REGISTRY DECLARATION</p><h1>${escape(s.title)}</h1><p class="identity">${escape(s.name)}</p><p class="lede">${escape(s.description)}</p><div class="actions"><a class="button" href="${escape(correctionLink(s))}">Suggest a correction ↗</a>${s.website ? `<a href="${escape(s.website)}" rel="nofollow noreferrer">Provider website or repository ↗</a>` : ''}</div><p class="note">Anyone can view this profile. Corrections open a draft GitHub issue for you to review and submit. This page has not been verified by the maintainer.</p></section><section class="panel"><h2>What the registry declares</h2><dl><dt>Publisher namespace</dt><dd>${escape(s.publisher)}</dd><dt>Listed version</dt><dd>${escape(s.version)}</dd><dt>Hosting</dt><dd>${escape(s.hosting)}</dd><dt>Credential inputs</dt><dd>${escape(auth.join(', '))}. Missing declarations do not mean anonymous access.</dd><dt>Suggested categories</dt><dd>${escape(capabilities.join(', ') || 'Not categorized')}. Inferred from the listing description; actual tool capabilities are unverified.</dd><dt>Registry updated</dt><dd>${escape(updatedAt || 'Not supplied')}</dd><dt>Retrieved</dt><dd>${escape(snapshot.retrievedAt)} (up to five minutes of caching)</dd></dl><a href="${escape(sourceURL(name))}">View the official registry source ↗</a></section><section class="panel"><h2>Connection and setup</h2><p><strong>For an AgentAction workspace connection:</strong> ${escape(s.setup)}</p><p>Browsing this page does not connect to the provider or authorize any tool use. Provider authentication and workspace setup are separate.</p>${s.inspectableEndpoints.length ? `<ul>${s.inspectableEndpoints.map(endpoint => `<li><code>${escape(endpoint)}</code> <a href="/?${escape(new URLSearchParams({endpoint}).toString())}">Check this endpoint →</a></li>`).join('')}</ul><p class="note">Showing up to three HTTPS Streamable HTTP endpoints without parameters. The registry lists ${remoteCount} remote configuration(s); consult the source for the complete setup. Checking requires an explicit submission; publication is optional.</p>` : '<p>No endpoint compatible with the public checker is listed. Local packages, legacy transports and parameterized endpoints need setup in your own environment; this is not evidence of a server defect.</p>'}</section><section class="panel"><h2>Public readiness observations</h2>${reportError ? '<p>Public report lookup is temporarily unavailable. No conclusion about this server can be drawn.</p>' : observationHTML(profiles, deps.now?.() ?? Date.now())}<p class="note">Only explicitly published reports for the exact displayed endpoints appear here. Reports may be submitted by anyone and do not verify ownership. Private workspace inspections are never shown.</p></section><section class="panel"><h2>Help us represent your server accurately</h2><p>Review the description, connection guidance and evidence. If the registry declaration needs updating, publish a correction through your registry workflow. If AgentAction interprets it incorrectly, send us the exact field and a supporting source.</p><a href="${escape(correctionLink(s))}">Suggest a correction ↗</a></section>`, path);
  } catch (error) {
    const status = error instanceof RuntimeError ? error.status : 503;
    const message = error instanceof RuntimeError ? error.message : 'Server information is temporarily unavailable. Please try again.';
    return shell('Server information unavailable', `<section class="intro"><p class="eyebrow">MCP SERVER DIRECTORY</p><h1>${status === 404 ? 'Listing unavailable.' : 'Unable to load this page.'}</h1><p class="lede">${escape(message)}</p><p>No readiness or safety conclusion can be drawn from this response.</p><a href="/servers">Browse servers →</a></section>`, path, status);
  }
}

export const PUBLIC_SERVERS_CSS = `:root{font-family:Arial,Helvetica,sans-serif;color:#20251d;background:#f5f5ee;line-height:1.6}*{box-sizing:border-box}body{margin:0}a{color:inherit;text-underline-offset:4px}header,footer{padding:24px 5vw;display:flex;justify-content:space-between;gap:24px;border-bottom:1px solid #c8cebf}.brand{font-size:23px;font-weight:800;text-decoration:none}.brand span{font-size:14px;font-weight:400;color:#58634e}nav,.actions{display:flex;flex-wrap:wrap;gap:24px;align-items:center}main{max-width:1200px;margin:auto;padding:48px 5vw;overflow-wrap:anywhere}.intro{margin:20px 0 36px}.eyebrow{font:12px monospace;letter-spacing:1px;color:#526344}h1{font-size:clamp(34px,5vw,60px);line-height:1.1;letter-spacing:-2px;margin:20px 0}h2{font-size:24px;line-height:1.25}h3{font-size:18px}.lede{font-size:19px;max-width:780px;color:#596150}.note,.identity{font-size:14px;color:#596150}.identity{font-family:monospace}.actions{margin-top:24px}form,.panel{border:1px solid #bac5ad;border-top:3px solid #8daa49;padding:26px;background:#fff;margin:24px 0}label{display:block;font-weight:700;margin-bottom:10px}.search{display:flex;gap:14px}input{min-width:0;flex:1;padding:13px;font:inherit;background:#fafbf6;border:1px solid #9eac90}button,.button{display:inline-block;background:#20251d;color:#d5ff5d;padding:13px 20px;border:1px solid #20251d;font-size:14px;font-weight:700;text-decoration:none;cursor:pointer}.listings{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:30px 0}.listing{padding:26px;border:1px solid #bac5ad;background:#fff;min-width:0}.listing h2{margin:8px 0}.listing p{margin:10px 0}.listing>a{font-size:14px}dl{display:grid;grid-template-columns:180px 1fr;gap:14px}dt{font-weight:700}dd{margin:0}li{margin:14px 0}code{font-size:13px}.observation{border-left:3px solid #8daa49;padding:5px 20px;margin:24px 0;background:#f5f7ef}footer{font-size:12px;border-top:1px solid #c8cebf;border-bottom:0}:focus-visible{outline:3px solid #789c35;outline-offset:3px}@media(max-width:760px){header,footer{flex-direction:column}.listings{grid-template-columns:1fr}.search{flex-direction:column}dl{grid-template-columns:1fr;gap:4px}dd{margin-bottom:12px}.panel,form,.listing{padding:20px}nav{gap:16px}h1{letter-spacing:-1px}}`;
