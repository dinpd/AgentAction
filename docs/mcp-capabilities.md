# MCP capability inventory and workflow coverage

Inspect what a server declares, identify limitations, and check whether its
schemas cover an explicitly mapped workflow. Capability coverage is separate
from the existing `mcp analyze`, `mcp check`, and risk-drift commands.

## Capture a server catalog

```bash
agentaction mcp catalog https://your-server.example/mcp --output catalog.json
agentaction mcp capabilities catalog.json
agentaction mcp capabilities catalog.json --json
```

Discovery initializes the server and follows pagination for tools, resources,
and resource templates when advertised. It never calls tools or reads resources.
The new command supports the initialized MCP revisions from 2024-11-05 through
2025-11-25; unsupported negotiated versions produce unknown discovery, not a
guessed catalog. HTTP JSON and JSON-bearing SSE responses are supported.

`--header 'Name: value'` accepts explicit authentication headers using the same
convention as `mcp fetch`. Request credentials, session IDs, and endpoint URLs
are not included in captures. Provider-returned metadata is retained as
untrusted data and can itself contain sensitive information; inspect captures
before sharing them. No authentication flow or permission grant is performed.
The explicitly selected URL may be a local server. Redirects are rejected so
credentials are not forwarded to another destination.

The default discovery budget is 30 seconds, 20 pages and 2,000 items per surface.
Use `--timeout`, `--max-pages`, and `--max-items` to change those bounds. Individual
responses are capped at 2 MiB and aggregate captured items at 8 MiB. Network
operations also have socket timeouts; a blocking read may finish after the
remaining overall budget. Subsequent requests stop when the budget is exhausted.
Repeated cursors, duplicate identities, malformed pages, or limits preserve
captured entries and mark the affected surface incomplete. Catalog exit codes
are 0 for completed advertised discovery, 1 for incomplete/unknown discovery,
and 2 for invalid input or local command failure.

Legacy tools/list JSON is accepted by `capabilities`, but does not establish
whole-server discovery. Even a capture marked complete describes only the
observed catalog and account context at that time. Imported capture metadata is
a declaration, not a signed attestation.

## Try a workflow profile

The checked-in ticket integration is synthetic; it makes no claims about any
third-party product or account.

```bash
# Covered by the declared schemas; no execution or permission verification.
agentaction mcp capabilities examples/mcp-capabilities/ticket-catalog.json \
  --workflow examples/mcp-capabilities/close-ticket.json --require-covered

# Blocked: the update schema does not expose assignee_id.
agentaction mcp capabilities examples/mcp-capabilities/ticket-catalog.json \
  --workflow examples/mcp-capabilities/assign-ticket.json --require-covered
```

A profile names ordered steps and explicit tool mappings. Each step can provide
literal `arguments`, enumerate `required_inputs` and `required_outputs`, and
bind an earlier step's output to an input. These values are checked locally and
never submitted to the server. Required input fields describe desired schema
coverage; they do not supply argument values.

```json
{
  "format": "agentaction.mcp-workflow.v1",
  "name": "Find and close a ticket",
  "steps": [
    {
      "id": "find",
      "tool": "tickets.search",
      "arguments": {"query": "broken widget"},
      "required_outputs": ["/tickets/*/title"]
    },
    {
      "id": "close",
      "tool": "tickets.update",
      "arguments": {"status": "closed"},
      "bindings": [
        {"input": "/ticket_id", "from_step": "find", "output": "/tickets/*/id"}
      ]
    }
  ]
}
```

Paths use JSON Pointer escaping (`~1` for `/`, `~0` for `~`) with `*` to traverse
homogeneous array items. Binding inputs address top-level arguments; output and
required-field paths support nesting. Array paths describe each returned item,
not a guarantee that results exist or a rule for selecting the correct record.
Duplicate step IDs, forward references, duplicate argument sources, unknown
profile keys, and unsupported profile versions are rejected.

The evaluator checks explicit object/array properties, required fields,
provided literal values, scalar binding types and supported value constraints.
Missing fields in a closed schema are blockers. Open schemas, missing schemas,
optional output fields, references, composition, formats, patterns, and
unsupported dialects/keywords remain unknown. External schema references are
never fetched, and provider regex patterns are not executed. JSON Schema
2020-12 is the supported evaluation dialect. Structural schema validity alone
does not prove semantic validity or that a tool honors its schema.

Generic request tools can be mapped explicitly with method/path arguments. Use
multiple steps for a tool combination. This version does not automatically
search alternate paths, infer semantic equivalence, or map resource reads into
tool workflows. An absent mapped tool is not proof that no alternative route
exists. A missing mapping always stays unknown.

## Read the report

Inventory JSON uses `agentaction.mcp-capabilities.v1`; captures use
`agentaction.mcp-catalog.v1`. Reports include capture time and declared
server/protocol metadata when available, a SHA-256 hash of canonical catalog
items, per-surface discovery state, raw input/output schemas, declared
annotations/restrictions, and advisory findings. The catalog hash excludes
timestamps, page ordering, and discovery state; compare those fields separately.
The workflow profile hash records the exact local profile, including its
arguments; it is not a credential-redaction mechanism.

| Dimension | Values and meaning |
| --- | --- |
| Discovery | `complete`, `incomplete`, `unknown`, `not_advertised`; absence of a protocol advertisement does not prove product-wide impossibility. |
| Step coverage | `covered` by declarations; `partial` with a known mapped blocker; `not_exposed` for a missing mapped tool in complete tools discovery; `unknown` when evidence is insufficient. |
| Workflow | `declared_coverage`, `blocked` for this mapping/profile, or `unknown`. |
| Evidence | `declared` for provider schemas/metadata, `inferred` for lint conclusions and name-based operation labels. This milestone never produces verified behavior. |
| Account access | Always `unknown` in this milestone; catalog visibility and OAuth scopes are not proof of granted operation access. |

Names drive heuristic operation labels, not automatic workflow matching. A
vague description or missing limit disclosure is advisory; a small or
deliberately restricted server is not inherently defective. Limit text is
extracted from explicit language in the description; raw schemas retain numeric
and enumerated constraints. Content completeness and actual result pagination
require the later fixture-based verification slice.

Without `--require-covered`, capability reports are informational and exit 0
even when they contain blockers. With that flag and `--workflow`, exit 1 means
blocked or unknown static coverage; exit 0 means schema-declared coverage only.
Invalid inputs exit 2. Neither exit 0 nor a `covered` step certifies execution,
permissions, content fidelity, or task success.

## Delivery slices

- [Slice 1: inventory](https://github.com/dinpd/AgentAction/issues/235)
- [Slice 2: mapped workflow coverage](https://github.com/dinpd/AgentAction/issues/236)
- [Slice 3: read completeness verification](https://github.com/dinpd/AgentAction/issues/237)
- [Slice 4: account and write verification](https://github.com/dinpd/AgentAction/issues/238)
- [Slice 5: capability regression checks](https://github.com/dinpd/AgentAction/issues/239)

The initial release implements slices 1 and 2. Live behavior, account/write
verification and comparison of workflow outcomes remain separate follow-ups.

## Observability console

The operator console exposes the same static coverage outcomes for mapped agent
drafts. Open **MCP servers → My MCP servers → Capabilities & limits** for server
metadata, or **Check fields and input connections** under a draft step to assess
its required fields and earlier-result dependencies. Save the draft to retain
the checks. Public pre-checks and connected-account snapshots are separate.

[Console usage and limits](../console/README.md#mcp-capabilities-and-workflow-coverage)
describe refresh behavior and bounded metadata. The Python and browser engines
share `fixtures/mcp-capability-coverage-v1/cases.json` acceptance cases. The UI
leaves unspecified inputs unknown; an explicit CLI profile with missing required
arguments remains blocked. Neither surface verifies account access or execution.
