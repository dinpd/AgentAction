import type { McpTool } from './mcp-client.ts';

export type CatalogEntry = { name: string; input: string; output: string; description: string; annotations: string };
export type ComparisonCatalog = { schemaVersion: 'agentaction.catalog-comparison.v1'; complete: boolean; tools: CatalogEntry[] };
export type CatalogChange = { tool: string; kind: 'added' | 'removed' | 'input-schema' | 'output-schema' | 'description' | 'annotations' };
export type CatalogComparison = { status: 'unchanged' | 'changed' | 'unavailable'; changes: CatalogChange[]; reason: string; baselineAt?: string; currentAt?: string };

/** Self-contained so the browser and offline CLI run precisely the same checks. */
export function readinessComparison() {
  const maxBytes = 512 * 1024;
  const record = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
  function bounded(value: unknown, depth = 0, budget = {nodes:0}): void {
    if (depth > 50 || ++budget.nodes > 30000) throw new Error('Report is too deeply nested or complex. Export a bounded readiness report.');
    if (value && typeof value === 'object') for (const v of Object.values(value)) bounded(v,depth+1,budget);
  }
  function parse(raw: string): unknown {
    if (new TextEncoder().encode(raw).length > maxBytes) throw new Error('Choose a readiness JSON export smaller than 512 KiB.');
    let value: unknown;
    try { value=JSON.parse(raw); } catch { throw new Error('Choose a valid JSON readiness export.'); }
    bounded(value); return value;
  }
  function canonical(value: unknown): string {
    if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
    if (record(value)) return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
    return JSON.stringify(value) ?? 'null';
  }
  async function hash(value: unknown): Promise<string> {
    bounded(value);
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value))))).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function manifest(tools: McpTool[]): Promise<ComparisonCatalog> {
    const entries: CatalogEntry[]=[];
    for (const t of tools) entries.push({name:t.name,input:await hash(t.inputSchema),output:await hash(t.outputSchema),description:await hash(t.description),annotations:await hash(t.annotations)});
    return {schemaVersion:'agentaction.catalog-comparison.v1',complete:tools.every(t=>!t.capabilityMetadataIssues?.length),tools:entries.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)};
  }
  function profile(value: unknown): Record<string, any> {
    if (record(value) && record(value.report)) value=value.report;
    if (record(value) && record(value.readiness)) value=value.readiness;
    if (!record(value) || value.schemaVersion!=='agentaction.mcp-readiness.v1') throw new Error('Export a readiness profile from the checker, then choose that JSON file.');
    if (value.visibility!=='public-tools' || value.coverage?.discovery!=='observed' || !/^[a-f0-9]{64}$/.test(value.catalogFingerprint || '')) throw new Error('Tool discovery is incomplete. Recheck an endpoint with a visible catalog before comparing.');
    if (value.authenticationContext!=='anonymous' || value.fingerprintScope!=='bounded-discovered-tool-metadata' || value.coverage?.metadata!=='bounded' || !Number.isInteger(value.toolCount) || value.toolCount<0 || value.toolCount>80) throw new Error('Report scope is invalid. Use a bounded anonymous readiness export.');
    if (!Number.isFinite(Date.parse(value.checkedAt)) || Date.parse(value.checkedAt)>Date.now()+60000) throw new Error('Report date is invalid or in the future. Export a new check.');
    for (const key of ['endpoint','ruleset','requestedProtocol','observedProtocol']) if (typeof value[key]!=='string' || !value[key] || value[key].length>2048) throw new Error('Report identity is incomplete. Export a new check.');
    return value;
  }
  async function catalog(p: Record<string, any>): Promise<CatalogEntry[]> {
    let c=p.comparisonCatalog;
    if (c===undefined) {
      if (!Array.isArray(p.tools) || p.tools.length!==p.toolCount || p.tools.some((t: any)=>!record(t)||typeof t.name!=='string'||typeof t.description!=='string'||!record(t.inputSchema))) throw new Error('This older export omits tools. Run a new check and export a complete comparison catalog.');
      c=await manifest(p.tools);
    }
    if (!record(c) || c.schemaVersion!=='agentaction.catalog-comparison.v1' || c.complete!==true || !Array.isArray(c.tools) || c.tools.length!==p.toolCount) throw new Error('Catalog metadata is incomplete or truncated. Compare complete scoped catalogs locally.');
    const names=new Set<string>();
    for (const t of c.tools) {
      if (!record(t) || typeof t.name!=='string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(t.name) || names.has(t.name) || ['input','output','description','annotations'].some(k=>typeof t[k]!=='string'||!/^[a-f0-9]{64}$/.test(t[k]))) throw new Error('The comparison catalog is invalid or has duplicate tools. Export a new check.');
      names.add(t.name);
    }
    return c.tools;
  }
  async function compare(before: unknown, after: unknown): Promise<CatalogComparison> {
    try {
      bounded(before);bounded(after);
      const a=profile(before),b=profile(after);
      for(const [key,label] of [['endpoint','endpoints'],['authenticationContext','authentication contexts'],['requestedProtocol','requested protocols'],['observedProtocol','observed protocols'],['ruleset','checker rulesets']]) if(a[key]!==b[key]) throw new Error(`The ${label} differ. Compare reports with matching endpoint, protocol, ruleset and anonymous scope.`);
      const left=new Map((await catalog(a)).map(t=>[t.name,t])),right=new Map((await catalog(b)).map(t=>[t.name,t]));
      const changes: CatalogChange[]=[];
      const fields = {input:'input-schema',output:'output-schema',description:'description',annotations:'annotations'} as const;
      for(const name of [...new Set([...left.keys(),...right.keys()])].sort()) {
        if(!left.has(name)) changes.push({tool:name,kind:'added'});
        else if(!right.has(name)) changes.push({tool:name,kind:'removed'});
        else for(const key of Object.keys(fields) as Array<keyof typeof fields>) if(left.get(name)![key]!==right.get(name)![key]) changes.push({tool:name,kind:fields[key]});
      }
      return {status:changes.length?'changed':'unchanged',changes,baselineAt:new Date(a.checkedAt).toISOString(),currentAt:new Date(b.checkedAt).toISOString(),reason:changes.length?'Review observed catalog changes before deployment. Schema differences may affect callers.':'No observed catalog changes. Runtime behavior, account-specific tools and backend changes remain untested.'};
    } catch (error) {return {status:'unavailable',changes:[],reason:error instanceof Error?error.message:'Comparison unavailable. Export fresh readiness reports.'};}
  }
  return {parse,compare,manifest};
}
