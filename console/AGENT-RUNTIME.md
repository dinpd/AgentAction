# MCP agent instances

Open `/agents` on the operator console. Existing Cloudflare Access identities
and current workspace-directory memberships select the runtime. Owners and
operators can connect accounts and operate agents; viewers can inspect history.
The website and recipe pages link here. Existing recipe downloads still work.

## User flow

1. Select a workspace, enter an enabled MCP URL, and optionally supply its bearer
   credential. Discover its actual tools. No tool is executed during discovery.
2. Ask AI for useful agents. Review each suggested job, required inputs, tool
   names and observable success criteria. Suggestions are untested proposals.
3. Create an instance with your job inputs and success criteria. Start a trial.
4. Review each proposed tool and exact arguments before approving execution.
   Model proposals start with required tool inputs and provider defaults. Optional settings can be added through Adjust tool arguments before approval; saving a revision issues a new approval ID. The runtime validates arguments against the discovered schema and rechecks
   the tool definition before execution. Each additional call requires approval.
5. Inspect the observed tool results, status, duration and reported model tokens.
   The final outcome is explicitly AI-assessed, not an independent verification
   or a certification. A completed request alone does not establish job success.
6. After a completed trial assessed as meeting the goal, review the result and
   activate a daily **supervised** schedule. The next run creates a proposal;
   its tool calls still wait for approval in My Agents. Pause cancels pending
   approvals. Disconnect removes the stored bearer token and pauses its agents.
7. Replace a credential through Account connection. Successful reconnection
   pauses existing agents and invalidates their prior trial for reactivation.

## Deployment and local development

`wrangler.toml` adds `AGENT_WORKSPACES` (`AgentWorkspace`, SQLite-backed DO)
and `AGENT_AI` (Workers AI). The entry point exports the Durable Object; the
public-demo entry point never supplies these bindings. Apply the additive
`agent-runtime-v1` migration with the existing console deployment workflow.
The deployed Cloudflare account must have Workers AI access.

Run `npm ci` then `npm run dev`. Agent storage and the development identity
remain local; the AI binding is explicitly remote and consumes Workers AI
usage. `--local` disables that remote AI binding. The existing optional gateway
fixture is still needed for other console pages; My Agents uses the development
workspace directly. Never use the development mock identity in production.

The initial endpoint allowlist is `https://mcp.firecrawl.dev/v2/mcp`.
To enable another provider, set `AGENT_MCP_ENDPOINTS` to a comma-separated list
of exact canonical HTTPS endpoints (including Firecrawl if still desired).
Only deployment administrators control this allowlist. Review the endpoint's
ownership and public routing before enabling it. URLs with embedded credentials,
query strings, fragments or nonstandard ports are rejected. Redirects are
returned manually and rejected; neither credentials nor sessions follow them.
Disabling an endpoint prevents subsequent inference and execution for it.

Supported connections: Streamable HTTP, bearer or public authentication,
session-based 2025 versions and explicit stateless 2026-07-28 selection, bounded
JSON/SSE responses and tool-list pagination. OAuth authorization/refresh, stdio,
server-initiated sampling/elicitation, unbounded streams and multi-server agents
are not included. Use a scoped endpoint of up to 80 tools / 80,000 catalog
characters. Credential replacement rediscovers permissions; it is not an OAuth
refresh workflow.

## Data, authority and evidence

Each verified workspace maps to a separate Durable Object. Private durable
storage holds connections (including bearer tokens), instances and runs. No
browser or model response includes the stored credential. Tokens are not added
to prompts and matching credential values are removed from tool results before
storage/model use. Tool descriptions, job inputs and tool results are sent to
Cloudflare Workers AI, currently `@cf/meta/llama-3.3-70b-instruct-fp8-fast`; the UI
discloses this before connection. Results can contain account data and are
visible to all workspace members. Do not connect data that the workspace is not
authorized to send to that model. This release uses Cloudflare-managed storage
protection, not a separately managed application credential vault.

Every write checks current server-authorized role, request origin, a custom
same-origin header and bounded JSON. The browser cannot choose an actor or
forward arbitrary headers into the runtime. Model suggestions may only reference
actually discovered tools. Tool metadata and results are untrusted data; model
output cannot create authority. Only explicit approval of a saved proposal can
execute a tool. Approval IDs are consumed before the call; duplicate approvals
cannot replay it. Raw provider/transport errors and credential values are not
returned or logged. The runtime does not use dynamic code evaluation.

Per workspace: eight connections, twelve agents, twenty runs/day and twelve
suggestion requests/day. Per run: at most four tool calls; each model response
is capped at 1,600 output tokens, with at most one schema-repair attempt per planning step and 120 inference calls per workspace/day. Context is bounded and inference waits at most
45 seconds. MCP requests have a 20-second deadline and 512-KiB response limit.
Stored tool results are limited to 8,000 characters with an explicit truncation marker. Upload-dependent tools are excluded from suggestions because this runtime has no file-upload surface. Usage totals show reported model tokens, not estimates of model or provider
charges. Forty runs are retained, protecting trials referenced by instances.
There are no automatic notifications yet; review pending work in My Agents.

Run state is persisted before external effects. Restart recovery marks in-flight
work interrupted/uncertain and does not replay it. A transport failure may mean
the provider acted without a returned result: inspect the provider before a new
trial. Pausing or disconnecting cannot undo an already-approved in-flight call.
The serialized workspace runtime completes that call before processing the pause.
Schedules advance durably before planning, so repeated alarm delivery does not
repeat external effects. Pending runs are not overlapped.

My Agents records are operational runtime history. They are not silently inserted
as finalized gateway Jobs, signed receipts or independently verified Evals. Those
existing evidence surfaces remain available in Observability; adapters can still
use their established ingestion/evaluation path.

## Validation references

- [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
- [MCP 2026-07-28 changes](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- [Workers AI JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/)
- [Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)
- [Workers-compatible JSON Schema validation](https://github.com/cfworker/cfworker/tree/main/packages/json-schema)

`tests/agent-runtime.test.ts` uses injected MCP, model and durable storage fixtures;
these are labeled test evidence, not live-account results. Existing signed-JWT
console tests cover roles, revoked membership, tenant isolation and request
boundaries. See the issue/PR for separate live public-provider checks.
