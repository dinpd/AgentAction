# AgentPass OpenClaw

AgentPass trusted tool policy plugin for OpenClaw.

The plugin registers a trusted pre-tool policy named `agentpass`. For each
OpenClaw tool call it maps the tool event into an AgentPass authorization check
and returns one of OpenClaw's existing policy outcomes:

- allow: return no decision
- deny: return `block: true`
- challenge: return `requireApproval` and use OpenClaw plugin approvals

Approval delivery stays native to OpenClaw. The user can approve through the
same configured chat/channel approval path or `/approve` flow.

## Configuration

Example OpenClaw plugin config:

```json
{
  "plugins": {
    "entries": {
      "agentpass": {
        "enabled": true,
        "config": {
          "mode": "local",
          "policyPath": "~/.openclaw/agentpass-openclaw-policy.json",
          "failClosed": true,
          "challengeTimeoutMs": 120000
        }
      }
    }
  }
}
```

Remote authorization mode:

```json
{
  "plugins": {
    "entries": {
      "agentpass": {
        "enabled": true,
        "config": {
          "mode": "remote",
          "authorizeUrl": "https://agentpass.example.com/authorize",
          "apiKey": "replace-me",
          "failClosed": true
        }
      }
    }
  }
}
```

If neither `policy` nor `policyPath` is provided in local mode, the package
uses its built-in OpenClaw starter policy.

## Development

```bash
npm install
npm test
npm run build
```

