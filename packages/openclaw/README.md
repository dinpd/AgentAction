# AgentAction OpenClaw

AgentAction trusted tool policy plugin for OpenClaw tool-call authorization.

For a runnable AgentAction gateway deployment shape, see
[`solutions/openclaw-agentaction`](../../solutions/openclaw-agentaction/).

The current package is a plugin-level adapter. It is not a replacement for
OpenClaw's proposed core approval-resolver seam; if OpenClaw adds that seam,
AgentAction should implement it as the external policy decision provider.

The plugin registers a trusted pre-tool policy named `agentpass`. For each
OpenClaw tool call it maps the tool event into an AgentAction authorization check
and returns one of OpenClaw's existing policy outcomes:

- allow: return no decision
- deny: return `block: true`
- challenge: return `requireApproval` and use OpenClaw plugin approvals

Approval delivery stays native to OpenClaw. The user can approve through the
same configured chat/channel approval path or `/approve` flow.

## Configuration

## Budget Demo

The recommended first demo is the tool-loop and context-payload budget guard:

```bash
cd packages/openclaw
npm install
npm run build
cd ../..
agentaction openclaw doctor --demo budget
```

Expected behavior:

- first repeated `read` call: allow
- second repeated `read` call: allow
- third repeated `read` call: `challenge_required`
- oversized heartbeat-like tool payload: deny

This protects tool-call loops and tool-call payloads today. Heartbeat or
prompt-context growth that happens before tool execution needs an OpenClaw
pre-model or heartbeat contribution hook.

## Usage Model

For local testing from this repository:

```bash
cd packages/openclaw
npm install
npm run build
openclaw plugins install --link .
openclaw plugins inspect agentpass --runtime --json
```

For an artifact-style local test:

```bash
cd packages/openclaw
npm install
npm run build
npm pack
openclaw plugins install npm-pack:agentpass-openclaw-0.1.0.tgz
openclaw plugins inspect agentpass --runtime --json
```

For the production path, publish this package and install it with one of
OpenClaw's managed sources:

```bash
openclaw plugins install npm:@agentaction/openclaw
```

OpenClaw installs npm-sourced plugins into its managed per-plugin npm project.
Local plugins must already have dependencies installed and built before
Gateway startup.

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
          "authorizeUrl": "https://agentaction.example.com/authorize",
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

## Token Budgets

The mapper estimates token usage for each OpenClaw tool call from the stable
JSON size of the tool name, metadata, params, and derived paths. Local mode
passes that value to AgentAction as `estimatedTokens`, so policy budgets such as
`challengeAfterTokensPerJob` and `maxTokensPerJob` can challenge or stop large
payloads and runaway loops.

This protects tool-call payloads. Heartbeat or prompt-context growth happens
before tool execution, so it should be gated separately with OpenClaw's
pre-model hooks such as `before_prompt_build`, `before_agent_run`, and
`heartbeat_prompt_contribution`. A follow-on AgentAction context gate can map
that to a pseudo resource such as `openclaw.context` / `heartbeat`.

## Development

```bash
npm install
npm test
npm run build
```
