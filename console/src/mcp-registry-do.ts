import { DurableObject } from 'cloudflare:workers';
import { RegistryCatalog, type CatalogQuery, type CatalogResult } from './mcp-registry.ts';
import { directorySource, type Directory } from './mcp-directory.ts';

type RegistryEnv = { MCP_SMITHERY_API_KEY?: string; MCP_GLAMA_API_KEY?: string };
// Separate named objects isolate each source's snapshot, refresh and failure.
export class McpRegistry extends DurableObject<RegistryEnv> {
  private catalog?: RegistryCatalog;
  private source?: Directory | 'official';
  constructor(ctx: DurableObjectState, env: RegistryEnv) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS catalog_source (id INTEGER PRIMARY KEY, source TEXT NOT NULL)');
    this.source = ctx.storage.sql.exec<{source: Directory | 'official'}>('SELECT source FROM catalog_source WHERE id = 1').toArray()[0]?.source;
  }
  private getCatalog(source: Directory | 'official'): RegistryCatalog {
    const key = source === 'smithery' ? this.env.MCP_SMITHERY_API_KEY : this.env.MCP_GLAMA_API_KEY;
    if (source !== 'official' && !key) throw new Error('Directory not configured');
    return this.catalog ||= new RegistryCatalog(this.ctx.storage, (input, init) => fetch(input, init), Date.now, source === 'official' ? undefined : directorySource(source, key!));
  }
  async search(input: CatalogQuery, source: Directory | 'official' = 'official'): Promise<CatalogResult> {
    if (!['official','smithery','glama'].includes(source) || this.source && source !== this.source) throw new Error('Catalog source mismatch');
    if (!this.source) {
      // Source is fixed before any fetch, including across object eviction.
      this.ctx.storage.sql.exec('INSERT INTO catalog_source VALUES (1, ?)', source);
      this.source = source;
    }
    return this.getCatalog(source).search(input);
  }
  async alarm(): Promise<void> {
    const source = this.source || 'official'; // alarms scheduled before this release
    if (source !== 'official' && !(source === 'smithery' ? this.env.MCP_SMITHERY_API_KEY : this.env.MCP_GLAMA_API_KEY)) return;
    await this.getCatalog(source).alarm();
  }
}
