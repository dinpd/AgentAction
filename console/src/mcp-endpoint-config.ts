// Shared by the hosted client and browser. Keep this factory self-contained.
// Provider documentation: https://docs.apify.com/integrations/mcp#tool-selection
// Only a single public Actor identifier is configuration, never a credential.
export function mcpEndpointConfig() {
  function apifyActor(url: URL): string | undefined {
    if (url.origin !== 'https://mcp.apify.com' || url.pathname !== '/' || url.username || url.password || url.hash) return;
    return /^\?tools=([a-zA-Z0-9][a-zA-Z0-9_-]{0,99}\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,99})$/.exec(url.search)?.[1];
  }
  return { apifyActor, supportedQuery: (url: URL) => !url.search || Boolean(apifyActor(url)) };
}
export const ENDPOINT_CONFIG_FACTORY_JS = mcpEndpointConfig.toString();
