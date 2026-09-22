# Shared workspace OAuth connections

Workspace owners can connect approved HTTP MCP servers with **Connect with OAuth**.
The provider account is shared with the workspace's agents: owners and operators
can use its tools through existing trial, action approval and scheduling controls.
Use a dedicated provider account with only the intended shared data. Connecting a
personal account does not turn its provider permissions into organization permissions.

Completed grants belong to the workspace, not the connecting member. Removing
that member does not disconnect the grant. Any current owner can reconnect or
disconnect it. Provider-side revocation, account removal or reduced permissions
can still require reauthorization. Viewers cannot start agent operations. Only
owners can create, replace or disconnect OAuth grants; operators can refresh the
catalog. Reconnecting or refreshing the catalog pauses dependent agents, clears
successful trial evidence and cancels pending approvals. Run a new trial before
reactivating schedules. No tool call is automatically retried after auth failure.

## Deployment

OAuth is disabled unless `AGENT_OAUTH_ENABLED=true`. Configure these Worker
bindings (production and staging are separate):

- `AGENT_OAUTH_ORIGIN`: exact public HTTPS console origin, with no path.
- `AGENT_OAUTH_PROVIDERS`: JSON array of reviewed provider configurations. Start
  with [the Notion example](../console/examples/oauth-notion.json). Treat this as
  a secret binding if a provider configuration contains a client secret.
- `AGENT_OAUTH_KEYS`: **secret** JSON object mapping key IDs to base64-encoded,
  random 32-byte AES keys. Generate with a cryptographic random generator and
  supply through Wrangler secret input or the Cloudflare dashboard. Never commit
  keys, paste them in chat or log them.
- `AGENT_OAUTH_ACTIVE_KEY`: key ID used for new ciphertext.
- `AGENT_OAUTH_ENABLED`: set to `true` only when the above are ready.

The fixed callback is `<origin>/oauth/mcp/callback`. It requires a valid console
session and current owner membership in the workspace that started the flow.
The public client identity document is `<origin>/.well-known/oauth-client.json`.
When using Cloudflare Access, permit unauthenticated GETs to **that exact metadata
path only** so authorization servers can retrieve it. Keep the callback and all
agent/API routes protected. Verify public metadata from outside your logged-in
browser; a login redirect is not usable client metadata.

Configure access/HTTP request logging to exclude callback query strings (which
contain short-lived authorization codes) and OAuth request/response bodies.
Application handlers never log them, never reflect provider errors, and redirect
to a clean result URL with `Referrer-Policy: no-referrer` and no-store headers.
Keep `global_fetch_strictly_public` enabled; OAuth requests use the global Worker
fetch, never private/VPC bindings. Every outbound URL is additionally DNS-checked,
HTTPS-only, bounded in time/size, and fetched without redirects or cookies.

Provider fields: `id`, `label`, exact `endpoint`, canonical `resource`,
`resourceMetadata`, exact `issuer`, and reviewed minimal `scopes`. A resource may
be the endpoint's origin or path ancestor but cannot refer to another origin or
unrelated path. Discovery must advertise that exact resource and issuer. Start
always rechecks public discovery; callbacks cannot select token destinations.
Choose task-appropriate scopes in deployment configuration and review the
provider's consent screen. Supported scopes and challenged scopes are distinct;
this initial release does not automatically request new scopes from challenges.

For preregistration, add `clientId` and optionally `clientAuth` (`none`,
`client_secret_post` or `client_secret_basic`) plus `clientSecret`. Otherwise the
provider must advertise client ID metadata document support. PKCE S256,
authorization code and bearer tokens are required. When present, `expires_in`
must be a positive finite number; the local lease is capped at one year. When
omitted, a one-hour local lease applies. This is a client use limit, not an
assertion of provider token expiry. Providers without refresh tokens work until expiry and then require an
owner to reconnect. Scope changes fail closed and require review/reconnection.
Dynamic registration, device flow, URL query credentials, automatic scope
escalation and arbitrary unconfigured OAuth providers are not supported.

## Notion demo and QuantApe

The Notion example uses `https://mcp.notion.com/mcp`, resource/issuer
`https://mcp.notion.com`, and scope `default`. Live public metadata inspected on
2026-09-22 advertised client metadata, S256, refresh tokens, and revocation.
A deployment-owned public client was also registered with Notion for the fixed
production callback, allowing the console to retain Cloudflare Access on every
route. Its client ID is stored in deployment configuration. Neither discovery
nor client registration proves a successful real-account login.
Notion access follows the connected account's provider permissions; use a demo
account/workspace containing only demo data. See the [Notion client guide](https://developers.notion.com/guides/mcp/build-mcp-client)
and [organization connection guidance](https://developers.notion.com/guides/mcp/get-started-with-mcp).

For live rollout, approve Notion's exact endpoint in the AgentAction workspace,
choose **Connect with Notion**, approve sharing and provider consent, and verify
that the returned connection displays account tools. Create a read-only search
agent, run a trial, and approve its exact search call. Verify another operator
can run that shared agent, then disconnect as an owner and verify further calls
stop. Provider consent must be performed by the account owner. Until this is
confirmed, label the live provider as awaiting acceptance.

QuantApe's `https://mcp.quantape.com/mcp` advertised eight tools without auth on
2026-09-22. Its watchlist description requires a bearer session token; the standard
root and `/mcp` protected-resource discovery paths and authorization-server
metadata returned 404. Use the existing public/bearer flow unless QuantApe adds
MCP OAuth discovery. Several tools advertise metering beyond a free allowance;
this integration does not implement x402 payment authorization.

## Credential lifecycle and key rotation

Tokens and PKCE verifiers are AES-256-GCM encrypted in the existing workspace
Durable Object, with fresh IVs and authenticated workspace/record/purpose binding.
Ordinary connection rows retain only grant references and ownership metadata.
Tokens are injected into an ephemeral MCP transport and scrubbed from results,
catalogs and model context. No schema migration is needed; public/bearer records
remain compatible. Existing bearer storage is unchanged.

Workspace operations and alarms serialize refresh. A refresh-in-progress marker
is persisted before sending a refresh token; a crash or uncertain response
requires reconnection instead of replaying a potentially rotated token. Invalid
access, failed refresh and changed scope pause dependent agents. Historical
outputs are scrubbed before persistence; a bounded encrypted history also
redacts recently rotated credentials. Disconnect deletes local credentials even
when remote revocation fails, and tells the owner to remove provider consent
manually when revocation could not be confirmed.

To rotate keys, add the new key while retaining old keys and change the active
key ID. Reads reencrypt old records with the active key. Keep old keys until all
workspaces have been read/migrated or disconnected; idle workspaces do not migrate
automatically. Do not remove an old key solely because a newer deployment is live.
Lost keys cannot be recovered by the application; owners must disconnect and then reconnect. Disabling
the feature stops OAuth token use without altering public/bearer connections.

## Validation and release boundary

`npm test` covers controlled-provider PKCE, issuer/state/workspace binding,
ownership, encrypted storage, rotation, refresh concurrency/failure, scheduled
use, redaction, disconnect and Worker membership/origin boundaries.
`npm run dry-run` followed by `npm run test:oauth-browser` exercises the actual
Worker bundle, Durable Object SQLite persistence/eviction and browser consent
redirects against a **controlled provider**, not a real Notion account. Install
Playwright/Chromium or set `PLAYWRIGHT_MODULE` to an existing installation.

The authorization flow follows the [MCP authorization specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).
This is a limited provider pilot, not universal OAuth compatibility. Keep rollout
explicit and complete the real-provider acceptance above before promoting it.
