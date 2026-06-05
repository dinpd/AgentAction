# Changelog

## Unreleased

- Added provider receipt profile metadata with canonicalization, default binding,
  outcome, and privacy-preserving basis handling.
- Added provider contract validation for receipt profile defaults on high-risk
  tools.
- Added `agentid mcp fetch` for fetching `tools/list` from HTTP MCP servers.
- Added `agentid mcp analyze` for scoring saved MCP `tools/list` output.
- Added `agentid mcp check` for CI-friendly MCP risk gates.
- Added `agentid mcp diff` for detecting newly exposed tools and tool schema drift.
- Added `agentid mcp ui` for writing a self-contained browser MCP analyzer.
- Added `agentid mcp serve-ui` for localhost MCP analysis with local remote-fetch support.
- Added MCP analyzer UI compare mode and Markdown report export.
- Added a sample MCP `tools/list` response for analyzer testing.

## 0.1.2

- Added first-class just-in-time authorization support.
- Added `jit_authorization` section to the manifest.
- Added `auth_mode` support for tools: `delegated`, `service`, and `just_in_time`.
- Updated validation to require JIT configuration when tools use `auth_mode: just_in_time`.
- Updated risk scoring to reward short-lived JIT grants and penalize standing write/admin access.
- Updated audit checks for missing or invalid JIT grants.
- Updated OPA policy generation with starter JIT grant checks.

## 0.1.1

- Reframed AgentID as an agent authority contract, not just an identity manifest.
- Added support for `intent`, `data_flows`, `delegation_chain`, `risk_tiers`, and `runtime`.
- Added validation warnings for missing runtime, intent, delegation-chain, and data-flow controls.
- Updated risk scoring to account for data-flow and agent-to-agent delegation risk.
- Updated audit checks for data-flow violations and agent-to-agent calls.
- Updated OPA policy generation with basic data-flow enforcement.
