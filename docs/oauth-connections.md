# Adding OAuth account connections

Endpoint pre-checks discover public OAuth metadata. Completing OAuth login is a
separate authorization feature and is not enabled in v0.20.0-rc.1.

The implementation should follow the [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
and [security guidance](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices).

1. Add an explicit Connect with OAuth action and a fixed HTTPS callback on the
   console domain. Bind short-lived, single-use state and PKCE S256 to the signed-in
   subject, workspace, endpoint, selected issuer and redirect URI. Reject replay,
   expired state, unsolicited callbacks, issuer mix-up and workspace/role changes.
2. Implement client identity negotiation: provider preregistration where required,
   a hosted client-ID metadata document where supported, and explicitly bounded
   dynamic client registration where appropriate. Registration must occur only
   after the user chooses to connect, never during inspection.
3. Revalidate discovery before authorization. Review the exact provider and minimum
   requested scopes for the selected task, distinguish supported from challenged
   scopes, require appropriate endpoint approval and let the provider obtain user
   consent. Preserve an honest unsupported/incompatible state for providers that
   do not support the implemented registration and authorization flow.
4. Exchange the authorization code server-side with PKCE and the MCP resource
   parameter; validate issuer/resource binding. Never accept arbitrary token URLs
   from a callback, forward tokens across redirects or expose them to browser JS,
   prompts, reports or logs. Check every outbound destination with the network
   policy, including registration, token exchange, refresh and revocation.
5. Store access/refresh tokens in an explicitly reviewed encrypted credential
   store with key rotation and workspace isolation. Implement expiry, serialized
   refresh, refresh-token rotation, reauthorization and disconnect/revocation.
   Reuse existing supervised execution with credentials injected only at transport.
6. After authorization, rediscover the account's actual tools and reassess risk
   before creating or enabling agents. Scope changes or changed tools must invalidate
   stale approval evidence and require review.
7. Validate against controlled OAuth providers and then supported real providers:
   denied consent, incorrect/replayed state, PKCE failure, issuer substitution,
   malicious discovery URLs, expired/rotated tokens, concurrent refresh, revoked
   membership, disconnect and token redaction. Roll out behind an explicit feature
   flag and publish compatibility limits before general availability.

This requires callback routes/UI, provider/client metadata, pending authorization
storage, a credential lifecycle, runtime integration and security tests. Some
providers require an application registration or review in their own console.
Discovery supplies useful evidence, but does not make every OAuth provider
immediately compatible or trustworthy.
