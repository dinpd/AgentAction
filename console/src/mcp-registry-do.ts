import { DurableObject } from "cloudflare:workers";
import { RegistryCatalog, type CatalogQuery, type CatalogResult } from "./mcp-registry.ts";

export class McpRegistry extends DurableObject {
  private catalog: RegistryCatalog;
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    this.catalog = new RegistryCatalog(ctx.storage);
  }
  async search(input: CatalogQuery): Promise<CatalogResult> { return this.catalog.search(input); }
  async alarm(): Promise<void> { return this.catalog.alarm(); }
}
