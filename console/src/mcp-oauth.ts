import { RuntimeError, boundedText, object, redact, textField } from './mcp-client.ts';
import { publicEndpointURL, validatePublicEndpoint } from './endpoint-policy.ts';
import type { RuntimeStorage } from './agent-runtime.ts';

export type OAuthEnv = {
  AGENT_OAUTH_ENABLED?: string;
  AGENT_OAUTH_ORIGIN?: string;
  AGENT_OAUTH_PROVIDERS?: string;
  AGENT_OAUTH_KEYS?: string;
  AGENT_OAUTH_ACTIVE_KEY?: string;
};
export type OAuthProvider = {
  id: string; label: string; endpoint: string; resource: string; resourceMetadata: string;
  issuer: string; scopes: string[]; clientId?: string; clientSecret?: string;
  clientAuth?: 'none' | 'client_secret_post' | 'client_secret_basic';
};
export type OAuthConnection = { providerId: string; credentialId: string; connectedBy: string; connectedAt: string; ownership: 'workspace'; scopes: string[] };
export type OAuthFailureCode = 'authorization' | 'exchange' | 'response' | 'discovery';
// Only local categories cross the browser callback boundary; never provider text.
export class OAuthFailure extends RuntimeError {
  code: OAuthFailureCode;
  constructor(code: OAuthFailureCode, error: unknown) {
    super(error instanceof RuntimeError ? error.message : 'OAuth connection failed.', error instanceof RuntimeError ? error.status : 502);
    this.code = code;
  }
}
type Sealed = { key: string; iv: string; data: string };
type Metadata = { issuer: string; authorization: string; token: string; revocation?: string; issuerResponse: boolean };
type Pending = { actor: string; workspace: string; connectionId: string; providerId: string; config: string; verifier: string; redirect: string; clientId: string; metadata: Metadata; expires: number };
type Grant = { providerId: string; config: string; metadata: Metadata; clientId: string; access: string; refresh?: string; expires: number; scopes: string[]; previous: string[]; refreshing?: boolean; invalid?: boolean };
const encoder = new TextEncoder();
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const bytes = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const url64 = (v: Uint8Array) => base64(v).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const random = () => url64(crypto.getRandomValues(new Uint8Array(32)));
const digest = async (s: string) => url64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(s))));
function fail(message = 'OAuth connection needs owner attention. Reconnect the account.', status = 409): never { throw new RuntimeError(message, status); }
export function oauthOrigin(env: OAuthEnv): string {
  const url = publicEndpointURL(env.AGENT_OAUTH_ORIGIN);
  if (new URL(url).pathname !== '/') fail('Configure a fixed OAuth console origin.', 503);
  return new URL(url).origin;
}
export function oauthCallback(env: OAuthEnv): string { return `${oauthOrigin(env)}/oauth/mcp/callback`; }
export function oauthClientMetadata(env: OAuthEnv) {
  return { client_id: `${oauthOrigin(env)}/.well-known/oauth-client.json`, client_name: 'AgentAction workspace agents', client_uri: 'https://agentaction.dev', redirect_uris: [oauthCallback(env)], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' };
}
export function oauthProviders(env: OAuthEnv): OAuthProvider[] {
  if (env.AGENT_OAUTH_ENABLED !== 'true') return [];
  const raw = JSON.parse(env.AGENT_OAUTH_PROVIDERS || '[]');
  if (!Array.isArray(raw) || raw.length > 16) fail('OAuth provider configuration is invalid.', 503);
  const ids = new Set<string>();
  return raw.map(value => {
    const p = object(value) as unknown as OAuthProvider;
    if (!/^[a-z0-9-]{1,60}$/.test(p.id) || ids.has(p.id)) fail('OAuth provider ID is invalid.', 503);
    ids.add(p.id); textField(p.label, 'provider label', 100);
    for (const u of [p.endpoint, p.resource, p.resourceMetadata, p.issuer]) publicEndpointURL(u);
    if (p.endpoint !== publicEndpointURL(p.endpoint)) fail('Configure a canonical MCP endpoint.', 503);
    // The configured resource may be an origin or a path ancestor, never an unrelated server.
    const resource = new URL(p.resource), endpoint = new URL(p.endpoint);
    if (resource.origin !== endpoint.origin || !(endpoint.pathname === resource.pathname || endpoint.pathname.startsWith(resource.pathname.replace(/\/$/, '') + '/'))) fail('OAuth resource must contain the configured endpoint.', 503);
    if (!Array.isArray(p.scopes) || p.scopes.length > 32 || p.scopes.some(s => typeof s !== 'string' || !/^[\x21\x23-\x5b\x5d-\x7e]{1,120}$/.test(s))) fail('OAuth scopes are invalid.', 503);
    if (p.clientId !== undefined) textField(p.clientId, 'client ID', 2048);
    if (!['none', 'client_secret_post', 'client_secret_basic'].includes(p.clientAuth || 'none') || ((p.clientAuth || 'none') !== 'none' && (!p.clientId || !p.clientSecret))) fail('OAuth client configuration is invalid.', 503);
    return p;
  });
}
// State's workspace is a routing hint only. Authority comes from the authenticated
// membership check and the encrypted, random, single-use pending record.
export function oauthStateWorkspace(state: string): string {
  if (state.length > 400 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(state)) fail('Invalid OAuth state.', 400);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes(state.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))); }
  catch { return fail('Invalid OAuth state.', 400); }
}

export class WorkspaceOAuth {
  private storage: RuntimeStorage;
  private env: OAuthEnv;
  private workspace: string;
  private fetcher: typeof fetch;
  constructor(storage: RuntimeStorage, env: OAuthEnv, workspace: string, fetcher: typeof fetch) { this.storage = storage; this.env = env; this.workspace = workspace; this.fetcher = fetcher; }
  private provider(id: string): OAuthProvider { return oauthProviders(this.env).find(p => p.id === id) || fail('This OAuth provider is not enabled.', 503); }
  private async key(id: string): Promise<CryptoKey> {
    try {
      const keys = object(JSON.parse(this.env.AGENT_OAUTH_KEYS || '{}'));
      const raw = bytes(String(keys[id] || ''));
      if (!id || raw.length !== 32) throw new Error();
      return await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    } catch { return fail('OAuth credential encryption is not configured. Contact the deployment owner.', 503); }
  }
  private aad(record: string): Uint8Array<ArrayBuffer> { return encoder.encode(JSON.stringify(['agentaction-oauth-v1', this.workspace, record])); }
  async seal(record: string, value: unknown): Promise<Sealed> {
    const key = this.env.AGENT_OAUTH_ACTIVE_KEY || '', iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: this.aad(record) }, await this.key(key), encoder.encode(JSON.stringify(value)));
    return { key, iv: base64(iv), data: base64(new Uint8Array(data)) };
  }
  async read<T>(record: string): Promise<T | undefined> {
    const sealed = await this.storage.get<Sealed>(record);
    if (!sealed) return undefined;
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(sealed.iv), additionalData: this.aad(record) }, await this.key(sealed.key), bytes(sealed.data));
      const value = JSON.parse(new TextDecoder().decode(plain)) as T;
      if (sealed.key !== this.env.AGENT_OAUTH_ACTIVE_KEY) await this.write(record, value);
      return value;
    } catch { return fail('OAuth credentials could not be opened. Restore the encryption key or disconnect and reconnect.', 503); }
  }
  private async write(record: string, value: unknown) { await this.storage.put(record, await this.seal(record, value)); }
  private async metadata(url: string): Promise<Record<string, unknown>> {
    await validatePublicEndpoint(url, this.fetcher);
    const response = await this.fetcher(url, { headers: { accept: 'application/json' }, redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(7000) });
    if (!response.ok) { await response.body?.cancel(); return fail('OAuth discovery is unavailable or redirected.', 502); }
    return object(JSON.parse(await boundedText(response, 32768)));
  }
  private async discover(p: OAuthProvider): Promise<Metadata> {
    const resource = await this.metadata(p.resourceMetadata);
    if (resource.resource !== p.resource || !Array.isArray(resource.authorization_servers) || !resource.authorization_servers.includes(p.issuer)) fail('OAuth resource or issuer does not match the approved provider.', 400);
    const issuer = new URL(p.issuer), path = issuer.pathname.replace(/\/$/, '');
    const urls = [...new Set([`${issuer.origin}/.well-known/oauth-authorization-server${path}`, `${issuer.origin}/.well-known/openid-configuration${path}`, `${issuer.origin}${path}/.well-known/openid-configuration`])];
    let auth: Record<string, unknown> | undefined;
    for (const url of urls) { try { auth = await this.metadata(url); break; } catch { /* bounded OIDC/RFC8414 fallback */ } }
    if (!auth || auth.issuer !== p.issuer) fail('OAuth issuer discovery failed.', 400);
    if (!Array.isArray(auth.code_challenge_methods_supported) || !auth.code_challenge_methods_supported.includes('S256') || !Array.isArray(auth.response_types_supported) || !auth.response_types_supported.includes('code')) fail('Provider must support authorization code with PKCE S256.', 400);
    if (!p.clientId && auth.client_id_metadata_document_supported !== true) fail('This provider requires a preregistered OAuth client.', 400);
    if (Array.isArray(auth.token_endpoint_auth_methods_supported) && !auth.token_endpoint_auth_methods_supported.includes(p.clientAuth || 'none')) fail('Provider does not support the configured client authentication.', 400);
    const result: Metadata = { issuer: p.issuer, authorization: publicEndpointURL(auth.authorization_endpoint), token: publicEndpointURL(auth.token_endpoint), issuerResponse: auth.authorization_response_iss_parameter_supported === true };
    if (auth.revocation_endpoint) result.revocation = publicEndpointURL(auth.revocation_endpoint);
    await validatePublicEndpoint(result.authorization, this.fetcher);
    await validatePublicEndpoint(result.token, this.fetcher);
    return result;
  }
  async start(providerId: string, actor: string, connectionId: string): Promise<{ authorizationUrl: string }> {
    if (!this.workspace) fail('Workspace context is required.', 403);
    const p = this.provider(providerId), redirect = oauthCallback(this.env);
    await this.key(this.env.AGENT_OAUTH_ACTIVE_KEY || '');
    // Bound pending requests without sharing state or cookies between workspaces.
    const records = await this.storage.list<Sealed>({ prefix: 'oauth-pending:' });
    for (const record of records.keys()) {
      const value = await this.read<Pending>(record);
      if (value && value.expires <= Date.now()) await this.storage.delete(record);
    }
    if ((await this.storage.list({ prefix: 'oauth-pending:' })).size >= 8) fail('Finish or wait for pending OAuth connections to expire.', 429);
    const metadata = await this.discover(p), verifier = random();
    const state = `${url64(encoder.encode(this.workspace))}.${random()}`;
    const clientId = p.clientId || oauthClientMetadata(this.env).client_id;
    const pending: Pending = { actor, workspace: this.workspace, connectionId, providerId, config: await digest(JSON.stringify(p)), verifier, redirect, clientId, metadata, expires: Date.now() + 600000 };
    await this.write(`oauth-pending:${state}`, pending);
    const authorization = new URL(metadata.authorization);
    for (const [k, v] of Object.entries({ response_type: 'code', client_id: clientId, redirect_uri: redirect, state, code_challenge: await digest(verifier), code_challenge_method: 'S256', resource: p.resource, ...(p.scopes.length ? { scope: p.scopes.join(' ') } : {}) })) authorization.searchParams.set(k, v);
    return { authorizationUrl: authorization.href };
  }
  private async tokenRequest(p: OAuthProvider, url: string, clientId: string, values: Record<string, string>): Promise<Record<string, unknown>> {
    await validatePublicEndpoint(url, this.fetcher);
    const body = new URLSearchParams({ ...values, client_id: clientId });
    const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' };
    if (p.clientAuth === 'client_secret_post') body.set('client_secret', p.clientSecret!);
    if (p.clientAuth === 'client_secret_basic') headers.authorization = `Basic ${btoa(`${encodeURIComponent(clientId)}:${encodeURIComponent(p.clientSecret!)}`)}`;
    const response = await this.fetcher(url, { method: 'POST', body: body.toString(), headers, redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(10000) });
    if (!response.ok) { await response.body?.cancel(); return fail(); }
    return object(JSON.parse(await boundedText(response, 32768)));
  }
  private tokens(result: Record<string, unknown>, requested: string[], prior?: Grant) {
    if (String(result.token_type).toLowerCase() !== 'bearer' || typeof result.access_token !== 'string' || !/^[\x21-\x7e]{1,8192}$/.test(result.access_token)) fail('Provider returned an unsupported token response.');
    // expires_in is optional (RFC6749/Notion). A local lease bounds use even
    // when the provider omits it or advertises a longer-lived token.
    if (result.expires_in !== undefined && (typeof result.expires_in !== 'number' || !Number.isFinite(result.expires_in) || result.expires_in <= 0)) fail('Provider returned an invalid access-token expiration.');
    const lifetime = Math.min(result.expires_in === undefined ? 3600 : result.expires_in as number, 31536000);
    const refresh = result.refresh_token === undefined ? prior?.refresh : textField(result.refresh_token, 'refresh token', 8192);
    if (result.scope !== undefined && typeof result.scope !== 'string') fail('Invalid granted scopes.');
    const scopes = result.scope === undefined ? requested : String(result.scope).split(' ').filter(Boolean);
    if (scopes.length !== requested.length || scopes.some(s => !requested.includes(s))) fail('Granted scopes changed. Reconnect and review permissions.');
    return { access: result.access_token, refresh, scopes, expires: Date.now() + lifetime * 1000 };
  }
  async complete(input: Record<string, unknown>, actor: string, authorizeEndpoint: (endpoint: string) => Promise<unknown> = async () => {}): Promise<{ connectionId: string; endpoint: string; label: string; oauth: OAuthConnection }> {
    let phase: OAuthFailureCode = 'authorization';
    try {
      const state = textField(input.state, 'OAuth state', 400);
      if (oauthStateWorkspace(state) !== this.workspace) fail('OAuth workspace mismatch.', 403);
      const key = `oauth-pending:${state}`, pending = await this.read<Pending>(key);
      if (!pending || pending.expires <= Date.now()) { await this.storage.delete(key); return fail('OAuth state expired or was already used.', 400); }
      if (pending.actor !== actor || pending.workspace !== this.workspace) fail('OAuth callback must be completed by the owner who started it.', 403);
      await this.storage.delete(key); // Persist single use before exchanging a code.
      if ((pending.metadata.issuerResponse && input.iss === undefined) || (input.iss !== undefined && input.iss !== pending.metadata.issuer)) fail('OAuth issuer mismatch.', 400);
      if (input.error !== undefined) fail('Provider authorization was declined or failed.', 400);
      const p = this.provider(pending.providerId);
      if (pending.config !== await digest(JSON.stringify(p)) || pending.redirect !== oauthCallback(this.env)) fail('OAuth configuration changed. Start again.');
      await authorizeEndpoint(p.endpoint);
      const code = textField(input.code, 'authorization code', 8192);
      phase = 'exchange';
      const result = await this.tokenRequest(p, pending.metadata.token, pending.clientId, { grant_type: 'authorization_code', code, code_verifier: pending.verifier, redirect_uri: pending.redirect, resource: p.resource });
      phase = 'response';
      const credentialId = crypto.randomUUID();
      await this.write(`oauth-grant:${credentialId}`, { providerId: p.id, config: pending.config, metadata: pending.metadata, clientId: pending.clientId, ...this.tokens(result, p.scopes), previous: [] } satisfies Grant);
      return { connectionId: pending.connectionId, endpoint: p.endpoint, label: p.label, oauth: { providerId: p.id, credentialId, connectedBy: actor, connectedAt: new Date().toISOString(), ownership: 'workspace', scopes: p.scopes } };
    } catch (error) { throw new OAuthFailure(phase, error); }
  }
  // Called within AgentRuntime's workspace queue, including alarms. A durable
  // refreshing marker prevents replaying a rotating refresh token after a crash.
  async access(connection: OAuthConnection): Promise<string> {
    const record = `oauth-grant:${connection.credentialId}`, grant = await this.read<Grant>(record);
    if (!grant || grant.invalid || grant.refreshing) return fail();
    const p = this.provider(grant.providerId);
    if (grant.config !== await digest(JSON.stringify(p))) return fail('OAuth provider configuration changed. Reconnect this account.');
    if (grant.expires > Date.now() + 30000) return grant.access;
    if (!grant.refresh) return fail();
    grant.refreshing = true; await this.write(record, grant);
    try {
      const result = await this.tokenRequest(p, grant.metadata.token, grant.clientId, { grant_type: 'refresh_token', refresh_token: grant.refresh, resource: p.resource });
      const tokens = this.tokens(result, grant.scopes, grant);
      grant.previous = [...grant.previous, grant.access, grant.refresh].slice(-8);
      while (grant.previous.join('').length > 24000) grant.previous.shift();
      Object.assign(grant, tokens); delete grant.refreshing;
      await this.write(record, grant);
      return grant.access;
    } catch { grant.invalid = true; await this.write(record, grant); return fail('OAuth refresh failed. An owner must reconnect the account.'); }
  }
  async invalidate(connection: OAuthConnection) {
    const key = `oauth-grant:${connection.credentialId}`, grant = await this.read<Grant>(key);
    if (grant) { grant.invalid = true; await this.write(key, grant); }
  }
  async scrub(value: unknown): Promise<string> {
    let result = redact(value);
    for (const p of oauthProviders(this.env)) if (p.clientSecret) result = redact(result, p.clientSecret);
    for (const key of (await this.storage.list({ prefix: 'oauth-grant:' })).keys()) {
      const grant = await this.read<Grant>(key);
      if (grant) for (const secret of [grant.access, grant.refresh, ...grant.previous]) if (secret) result = redact(result, secret);
    }
    return result;
  }
  async disconnect(connection: OAuthConnection): Promise<boolean> {
    const key = `oauth-grant:${connection.credentialId}`;
    let grant: Grant | undefined;
    try { grant = await this.read<Grant>(key); } catch { /* local removal works even when the key is unavailable */ }
    await this.storage.delete(key); // Local access always stops, even if revocation fails.
    if (!grant?.metadata.revocation) return false;
    try {
      const p = this.provider(grant.providerId);
      if (grant.config !== await digest(JSON.stringify(p))) return false;
      // RFC7009 success can have an empty response body.
      await validatePublicEndpoint(grant.metadata.revocation, this.fetcher);
      const body = new URLSearchParams({ token: grant.refresh || grant.access, token_type_hint: grant.refresh ? 'refresh_token' : 'access_token', client_id: grant.clientId });
      const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
      if (p.clientAuth === 'client_secret_post') body.set('client_secret', p.clientSecret!);
      if (p.clientAuth === 'client_secret_basic') headers.authorization = `Basic ${btoa(`${encodeURIComponent(grant.clientId)}:${encodeURIComponent(p.clientSecret!)}`)}`;
      const response = await this.fetcher(grant.metadata.revocation, { method: 'POST', body: body.toString(), headers, redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(7000) });
      await response.body?.cancel(); return response.ok;
    } catch { return false; }
  }
  async cancelPending(connectionId: string) {
    for (const key of (await this.storage.list({ prefix: 'oauth-pending:' })).keys()) {
      try {
        const pending = await this.read<Pending>(key);
        if (pending?.connectionId === connectionId) await this.storage.delete(key);
      } catch { await this.storage.delete(key); } // Unreadable pending state cannot authorize a callback.
    }
  }
}
