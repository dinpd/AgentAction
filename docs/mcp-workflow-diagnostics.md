# MCP workflow diagnostics

This workflow answers three questions: what changed in the server catalog,
what needs attention in observed calls, and whether an interrupted action
already happened. The issue and acceptance plan are tracked in
[#401](https://github.com/dinpd/AgentAction/issues/401).

## Experience and scope

The checker keeps the existing endpoint form as the primary action. After a
check, **Compare with a baseline** lets a developer select an earlier JSON
export. The file stays in the browser. **What changed** lists tools added or
removed and input schema, output schema, description and annotation changes.
No color or headline calls a server safe. Invalid, incomplete or incompatible
reports explain why comparison is unavailable and how to obtain usable evidence.
Historical baselines are expected; the dates of both observations remain visible.

The offline comparison command uses the same logic, takes two saved reports,
and makes no network requests. It returns 0 for no observed change, 1 for
observed change, and 2 for unavailable comparison or invalid input. Contract
differences are review signals, not a full JSON Schema compatibility analysis.

The observation report leads with **What needs attention**, followed by policy
findings, errors and coverage. Skipped or failed evaluations stay visible.
Timing and correlation support diagnosis without including raw arguments,
results or provider error messages. A returned tool result never establishes
business completion. Observation continues to forward calls unchanged.

The recovery walkthrough uses synthetic data and a provider record held
separately from the supervisor. It shows the action before dispatch, the lost
response, restart, **Outcome unknown — do not retry**, blocked redispatch and
trusted read-back. Confirmation requires matching provider evidence. An empty
or ambiguous lookup leaves the action uncertain. Reconciliation performs reads;
it does not create a second effect or grant new authority.

## Acceptance

Comparator unit and CLI tests cover ordering, changes beyond the display limit,
incompatible/partial/legacy exports, invalid files and exit codes. Real Worker
browser acceptance covers local file import, recovery after invalid input,
keyboard access and mobile layout. Observer tests exercise protocol/tool/transport
errors, unknown results, bounded reports, privacy and unchanged forwarding.
The recovery acceptance restarts persisted runtime state and checks an independent
provider effect counter and recovered result. Existing authentication, approval,
tenant-isolation and release checks remain required.

## Compare saved checker reports

Run a check at [MCP Readiness Check](https://mcpcheck.agentaction.dev/) and choose
**Export JSON**. After a later check, expand **Compare with a baseline** and
choose that saved file. Import does not upload, publish, or persist the baseline.
Remove it with **Clear baseline**. The browser compares per-tool digests for
the complete retained catalog, including tools beyond the 20-tool display.
Truncated metadata is unavailable for comparison. Older complete exports work;
older exports omitting tools require a new baseline. Endpoint, authentication
context, requested/observed protocol and checker ruleset must match.

For an offline CI step, save the current export through the existing checker
and run from `console/` on Node 22 or later:

```bash
npm run readiness:compare -- baseline.json current.json
npm run readiness:compare -- baseline.json current.json --json
```

Exit 0 means no observed catalog change, 1 means review observed changes, and 2
means comparison was unavailable or invalid. This command does not refresh the
endpoint: the caller supplies both reports. Historical baselines can be expired;
always review both check dates. Same metadata does not prove same implementation.

## Read an observation report

Use an explicitly configured observe-mode adapter and collect its JSONL logs.
For a self-contained synthetic example, run from `mcp-gateway-adapter/`:

```bash
npm run --silent demo:observe -- --jsonl > /tmp/observations.jsonl
npm run observe:report -- /tmp/observations.jsonl
npm run observe:report -- /tmp/observations.jsonl --html /tmp/new-report.html
npm run observe:report -- /tmp/observations.jsonl --json
```

The report accepts a log segment up to 2 MiB and summarizes its first 1,000
valid observation events. It discloses omitted and ignored records. Input is
read locally and HTML output must be a new file. The summary excludes raw
arguments, results, identity fields and policy finding values. Tool names and
fixed finding categories remain visible, so review it before sharing.

New observation events add a generated `observation_id`, timestamp,
`duration_ms`, `downstream_http_status`, `result_class` and explicit unverified business outcome. Existing
fields remain available. `downstream_outcome: success` means only that a tool
result was returned; an MCP `isError` result now records `error`. Result classes
separate returned results, HTTP errors, JSON-RPC errors, tool errors, invalid responses and
unknown transport outcomes. Older events remain unclassified. Detailed local
logs remain customer-controlled and can contain normalized identifiers or
finding values; they are distinct from this limited report.

## Run the recovery walkthrough

From `console/`, run:

```bash
npm run demo:recovery
npm run demo:recovery -- --html /tmp/new-recovery.html
npm run demo:recovery -- --json --ambiguous
```

The command creates separate temporary SQLite stores for the supervisor and
synthetic provider, launches fresh processes for every phase, and removes its
temporary stores afterward. It exits a dispatch process after the provider
commit but before storing its result. Production supervisor primitives fence
the replay; fixture-specific read-back confirms the original provider result.
Missing or mismatched evidence stays uncertain. The HTML walkthrough presents
each step with an independent effect count and expandable evidence.

This is a local reference demonstration, not a newly enabled production
reconciliation endpoint. Real providers need their own trusted read-back,
durable idempotency and exact request binding. There are no real payments,
credentials or new hosted permissions. The existing real Worker restart tests
continue to validate the hosted supervisor's durable dispatch boundary.
