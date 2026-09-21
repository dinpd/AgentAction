import { catalogSearchText, type CatalogQuery, type CatalogResult } from './mcp-registry.ts';
import type { Directory } from './mcp-directory.ts';
import { mcpMatching } from './mcp-matching.ts';

export type RegistryNamespace = { getByName(name: string): { search(query: CatalogQuery, source?: Directory | 'official'): Promise<CatalogResult> } };
export async function searchCatalogs(namespace: RegistryNamespace, query: CatalogQuery, enabled: Directory[]): Promise<CatalogResult> {
  const sources = ['official', ...enabled] as const;
  const results = await Promise.allSettled(sources.map(source => namespace.getByName(`${source}-v1`).search(query, source)));
  const fulfilled = results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
  if (!fulfilled.length) throw new Error('Catalogs unavailable');
  const base = fulfilled[0], matcher = mcpMatching();
  const ranked = fulfilled.flatMap(r => r.servers).map(server => ({
    server,
    score: matcher.match(query.query,server.title,catalogSearchText(server)).score + (server.catalogEvidence?.tools.some(t => matcher.match(query.query,t.name.replace(/[_-]/g,' '), t.description + ' ' + JSON.stringify(t.inputSchema || {}) + ' ' + JSON.stringify(t.outputSchema || {})).score > 0) ? 20 : 0),
  }));
  const servers = ranked.sort((a,b) => b.score-a.score || a.server.name.localeCompare(b.server.name)).map(row=>row.server);
  const status = results.flatMap((r,i) => r.status === 'fulfilled' ? r.value.sources || [] : [{ name: sources[i] === 'official' ? 'Official MCP Registry' : sources[i] === 'smithery' ? 'Smithery' : 'Glama', status: 'unavailable', listings: 0, withTools: 0, updatedAt: null }]);
  for (const source of ['smithery','glama'] as const) if (!enabled.includes(source)) status.push({name: source === 'smithery' ? 'Smithery' : 'Glama',status:'not configured',listings:0,withTools:0,updatedAt:null});
  return { ...base, servers, sources: status, total: fulfilled.reduce((n,r) => n+r.total,0),
    // Each page advances every source by 20. No results disappear when a source
    // has fewer rows. Counts describe listings, including cross-source duplicates.
    nextOffset: fulfilled.some(r => r.nextOffset !== null) ? query.offset + 20 : null,
    indexing: fulfilled.some(r => r.indexing), stale: fulfilled.some(r => r.stale), unavailable: fulfilled.every(r => r.unavailable),
    notice: 'Matching directory listings; the same server may appear in multiple sources. Indexed tool declarations do not prove account access. Missing metadata means unknown. ' + (results.some(r => r.status === 'rejected') ? 'One or more sources are unavailable. ' : '') + (fulfilled.some(r=>r.indexing) ? 'Catalog indexing is in progress; results are incomplete.' : '') };
}
