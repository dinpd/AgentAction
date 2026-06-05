Thanks, this is exactly the security consideration I was trying to isolate.

I agree the useful split is:

1. OAuth / transport authorization to reach the MCP server;
2. scoped runtime authorization for this exact agent-originated action;
3. provider business authorization before state mutation.

The replay / scope-drift acceptance test is a good addition. I would include it
in a non-normative example:

- gateway admits `provider.crm.update_customer` for `case_1042` / `cus_123`,
  bound to canonical request digest A and expiry T;
- replay is handled according to the provider's single-use or idempotency
  policy;
- changes to resource, customer, action, request digest, policy version, or
  context cause the provider to reject the receipt before business logic runs.

I also agree the example should keep these fields explicit without requiring
MCP core to standardize a full receipt schema:

- receipt phase: admission vs post-execution;
- issuer and audience;
- canonical request digest;
- bound action/resource/context IDs;
- policy or scope version;
- expiry plus single-use/idempotency key;
- decision ID, approval ID, and optional JIT grant ID.

That keeps the pattern narrowly scoped: transport auth proves the client can
reach the MCP server; a scoped receipt proves this high-risk call was admitted
for this context; provider business authorization still decides whether to
execute.
