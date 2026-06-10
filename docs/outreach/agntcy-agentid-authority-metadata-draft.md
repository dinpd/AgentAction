# Draft AGNTCY/OASF Issue: AgentPass Authority Metadata in Agent Badges

## Proposed title

Example: carrying AgentPass authority metadata in an Agent Badge

## Context

AGNTCY Agent Badges already model an agent badge as a Verifiable Credential
whose subject contains agent metadata, including OASF definitions or A2A Agent
Cards. The examples also describe well-known access to Agent Badges and support
for multiple proof envelopes including JOSE.

AgentPass is a machine-readable authority contract for agent tool execution. It
does not replace the identity badge; it describes what the verified agent may
attempt at runtime.

## Proposal

Add an example showing how an Agent Badge can point to AgentPass authority
metadata.

Example credential subject:

```json
{
  "id": "did:web:example.com:agents:support-refund-agent",
  "badge": {
    "name": "Support Refund Agent",
    "schema_version": "oasf.example",
    "locators": [
      {
        "type": "a2a_agent_card",
        "url": "https://agent.example.com/.well-known/agent-card.json"
      }
    ],
    "authorization": {
      "type": "AgentPassAuthorityContract",
      "manifest_uri": "https://agent.example.com/.well-known/agentid.json",
      "provider_contracts": [
        "https://provider.example.com/.well-known/agentid-provider-contract.json"
      ],
      "receipt_required_for": ["write", "admin", "execute", "financial"],
      "attestation_required": true
    }
  }
}
```

## Why this helps

This lets an AGNTCY verifier discover both:

- who the agent is and how its identity metadata is verified
- where to find the runtime authority contract governing high-risk tool calls

It preserves the split between identity and authority. The Agent Badge remains
the verifiable identity/provenance envelope; AgentPass supplies the action-level
authorization metadata.

## Non-goals

- Do not require AGNTCY to adopt AgentPass.
- Do not embed full enterprise policy in public badges.
- Do not replace OASF or A2A Agent Card schemas.
- Do not treat authority metadata as provider business authorization.

## Relevant AgentPass example

AgentPass manifests declare agent identity, tool authority, JIT requirements,
approval rules, receipt binding fields, delegation limits, audit expectations,
and kill-switch behavior.

The proposed example would give AGNTCY/OASF users a concrete way to point from
verifiable identity metadata to runtime authorization metadata.
