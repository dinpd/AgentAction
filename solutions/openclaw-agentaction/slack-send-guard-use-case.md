# Use Case: Slack Send Guard

This use case models a frequent outbound communication risk:

1. OpenClaw reads customer or ticket context.
2. The agent drafts a Slack message containing customer data.
3. AgentAction blocks the external send before the message leaves the agent
   boundary.

The policy goal is to let agents inspect customer context while preventing
unapproved or sensitive outbound communication.

## Policy Boundary

Customer context may move into agent context:

```text
web_fetch customer record -> allow
```

Customer records may not be sent to external channels without a stronger
approved path:

```text
message #support-triage with customer PII -> deny
```

## Test Surface

The test uses OpenClaw-style tool events:

- `fixtures/openclaw-read-customer-record-event.json`
- `fixtures/openclaw-send-slack-customer-event.json`

`slack-send-guard-use-case.mjs` maps those events through the actual
`packages/openclaw` mapper and remote runtime, then calls AgentAction
`/authorize`.

## Run

Terminal 1: start AgentAction.

```bash
agentaction gateway solutions/openclaw-agentaction/agentaction-openclaw-manifest.yaml \
  --host 127.0.0.1 \
  --port 8787 \
  --api-key dev-token
```

Terminal 2: build the OpenClaw adapter and run the use case.

```bash
cd packages/openclaw
npm run build
cd ../..
node solutions/openclaw-agentaction/slack-send-guard-use-case.mjs
```

Expected result:

```json
{
  "useCase": "slack-send-guard",
  "outcome": "passed",
  "readCustomer": {
    "tool": "web_fetch",
    "action": "read",
    "decision": "allow"
  },
  "sendSlack": {
    "tool": "message",
    "action": "send",
    "dataFrom": "customer_records",
    "dataTo": "external_channel",
    "decision": "deny"
  }
}
```

## What This Proves

- Hosted AgentAction manifests support `send` as a first-class action.
- OpenClaw message-style tools map to `send`.
- AgentAction can block outbound customer data movement to external channels.
- Slack/email-style sends can be guarded through the same remote gateway path
  as browser and file tools.
