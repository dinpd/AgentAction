# Hosted execution supervisor

The execution supervisor governs the existing hosted **supervised agent** tool
path. Planning, MCP transport, provider business authorization and outcome
evaluation retain their existing responsibilities. Research workflows keep
their separately reviewed execution engine and limits.

## Approval and execution

Each proposed action receives a stable action ID, a one-use approval ID, an
expiry and a SHA-256 digest of its exact arguments, tool definition, connection
revision, agent definition, workspace/run identity, intent contract and frozen
supervisor limits. The model cannot grant authority by changing its context.

Immediately before dispatch, the runtime validates the live tool definition and
consumes approval inside a Durable Object storage transaction. The transaction
records the dispatch claim and execution event in the same run document before
external I/O. Concurrent or replayed approval requests cannot consume it again.

The transport-independent functions in `console/src/execution-supervisor.ts`
define proposal, claim, settlement, cancellation and recovery transitions. A
host must serialize its run lifecycle and persist claim/approval consumption
atomically before invoking a transport. The production host uses one
`AgentWorkspace` Durable Object per verified workspace. Test stores implement
serial, rollback-capable transactions; an ordinary key-value adapter without
these guarantees is insufficient.

## Configuration

In **My agents → Execution supervisor settings**, workspace owners can save
ceilings for new supervised runs. The authenticated same-origin API also
supports narrower agent and trial settings:

```text
POST /api/agents/{workspace}/supervisor-settings
{"scope":"workspace","expectedVersion":0,"limits":{"maxCalls":3,"approvalTtlMs":300000,"executionTimeoutMs":30000}}

POST /api/agents/{workspace}/supervisor-settings
{"scope":"agent","agentId":"...","expectedVersion":0,"limits":{"maxCalls":2}}

POST /api/agents/{workspace}/trial
{"agentId":"...","supervisorLimits":{"maxCalls":1}}
```

Requests require the same authentication, verified workspace membership, origin
and `x-agentaction-request: agent-builder` header as other builder mutations.
Workspace settings require owner membership; operators may narrow agent and
trial limits. Only owners may widen or clear existing agent restrictions within
workspace ceilings. Current workspace policy and agent revisions appear in `state`.
`expectedVersion` rejects stale policy edits. Workspace and agent revisions
retain the configuring principal and time in immutable audit records.

| Setting | Default / platform ceiling | Rule |
|---|---|---|
| `maxCalls` | 4 | Positive integer; child limits cannot exceed their parent |
| `approvalTtlMs` | 86,400,000 (24 hours) | Positive integer, measured from proposal time |
| `executionTimeoutMs` | 60,000 (60 seconds) | Positive integer; timeout leaves an ambiguous dispatch uncertain |
| `recoveryPolicy` | `review` | Hosted MCP has no read-back adapter; `reconcile` is rejected |

Owners may change workspace ceilings within platform bounds; omitted workspace
fields keep their current values. Agent settings
and per-run overrides can only narrow the effective parent limits. When a
workspace ceiling tightens below an existing agent setting, new runs use the
smaller value. Agent settings retain only the explicitly supplied fields;
omitted fields inherit current workspace ceilings. Saving an empty `limits`
object restores full inheritance. Every run retains its effective limits and policy version.
Saving workspace or agent settings invalidates affected pending supervised
runs. Exact approval binding, durable claims and replay protection cannot be
disabled. Research settings and approvals are unaffected.

Agent and per-trial overrides are API capabilities in this release; the console
form configures workspace ceilings. The run inspector shows action identities,
states, expiry and the ordered supervisor journal. It preserves the distinction
between authorization, execution and outcome evidence.

## Recovery and guarantees

| Durable state before restart | Recovery |
|---|---|
| Awaiting approval | Restore the exact pending action and original expiry |
| Dispatch claimed, no retained completion | Mark uncertain, stop, require provider review |
| Successful result retained | Continue planning without dispatching that action again |
| Failed, cancelled or uncertain | Preserve terminal evidence; never automatically retry |

The guarantee is **at most one automatic dispatch per action identity**, not
universal exactly-once execution. A crash after claiming but before sending also
leaves uncertainty. Providers can produce partial effects before reporting an
error. Cancellation cannot reverse an accepted effect, and a timeout does not
prove that a provider stopped executing.

A fresh run creates distinct action identities. Check earlier uncertain effects
at the provider before starting another run with the same business intent.
Cross-run duplicate detection and provider idempotency are separate concerns.

Trusted integrations may use the supervisor's read-only `reconcileAction` hook
with a provider adapter to verify a prior action; the hook never dispatches a
mutation. This release supplies no such adapter for hosted MCP and does not
offer a browser-controlled reconciliation assertion.

Journals contain IDs, timestamps and fixed transition labels, not credentials
or duplicated tool payloads. They are bounded to 24 proposals and 128 records
per run and share existing run retention/workspace visibility. Removing a run
makes its old approval unavailable; it never makes that ID executable again.
Configuration audit records remain after run pruning, bounded to 100 workspace
revisions and 100 revisions per agent. Existing legacy runs
remain readable; cancel legacy pending approvals and start a new trial to use
the supervisor. No destructive migration or new OAuth scope is required.

## Acceptance

`console/tests/execution-supervisor.test.ts` covers response loss, transaction
rollback, failed completion persistence, concurrency, expiry, revision,
cancellation, binding changes, limit escalation, isolation and timeout.

`npm run test:supervisor-worker` uses the real AgentWorkspace and transactional
SQLite, destroys and recreates the Miniflare process with persistent storage,
and verifies an independent synthetic provider counter remains one after a
committed refund loses its response and the approval is replayed. It also
checks claimed-but-unsent recovery and retained success.

`npm run test:supervisor-browser` verifies workspace settings, conflict feedback,
viewer restrictions, action/recovery evidence and mobile layout. Tests use
synthetic effects and require no payment account.
