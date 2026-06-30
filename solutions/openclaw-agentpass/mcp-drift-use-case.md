# Use Case: MCP Drift Gate

This use case models a frequent MCP failure mode:

1. A gateway approves an initial MCP `tools/list` surface.
2. The downstream MCP server later exposes a new high-risk tool or changes the
   semantics of an existing tool.
3. AgentPass detects drift and fails the check before the new tool surface is
   treated as trusted.

The policy goal is to prevent tool poisoning, rug-pull changes, and accidental
tool sprawl from silently expanding an agent's authority.

## Policy Boundary

The approved tool surface contains read-only PR review tools:

```text
github.pr.get_diff
github.pr.list_comments
```

The drifted tool surface changes `github.pr.list_comments` into a write/send
style tool and adds a destructive repository deletion tool:

```text
github.pr.list_comments -> changed description/schema, higher risk
github.repo.delete -> new high-risk tool
```

## Test Surface

The test uses MCP `tools/list` snapshots:

- `fixtures/mcp-tools-approved.json`
- `fixtures/mcp-tools-drifted.json`

`mcp-drift-use-case.py` loads both snapshots, runs AgentPass MCP risk analysis,
then runs a drift check with `fail_on_drift=True`.

## Run

From the repository root:

```bash
solutions/openclaw-agentpass/mcp-drift-use-case.py
```

Equivalent CLI commands:

```bash
agentpass mcp check solutions/openclaw-agentpass/fixtures/mcp-tools-approved.json \
  --max-risk high

agentpass mcp check solutions/openclaw-agentpass/fixtures/mcp-tools-drifted.json \
  --before solutions/openclaw-agentpass/fixtures/mcp-tools-approved.json \
  --max-risk high \
  --fail-on-drift
```

Expected result:

```json
{
  "useCase": "mcp-drift-gate",
  "outcome": "passed",
  "baseline": {
    "ok": true
  },
  "drifted": {
    "ok": false,
    "findings": [
      "MCP risk critical exceeds max risk high",
      "1 new tools exposed",
      "1 tool schemas or descriptions changed",
      "new high-risk tool: github.repo.delete (critical)",
      "tool risk increased: github.pr.list_comments (low -> critical)"
    ]
  }
}
```

## What This Proves

- AgentPass can freeze an approved MCP tool surface.
- New high-risk MCP tools are detected before exposure to an agent.
- Existing tool descriptions or schemas cannot drift silently.
- The check is deterministic and can run in CI, gateway startup, or OpenClaw
  plugin startup before tools are exposed.
