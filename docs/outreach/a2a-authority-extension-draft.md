# Draft A2A Issue: Authority Contract Metadata for Agent Cards

## Proposed title

Agent Card extension example for authority contract metadata

## Context

A2A already provides an extension mechanism and Agent Cards as the discovery
surface for an agent's identity, capabilities, skills, endpoint, and
authentication requirements. The A2A spec also states that servers must
implement authorization checks for A2A protocol operations and scope results to
the caller's authorized access boundaries.

For production agents, it would be useful to make the agent's external
authorization requirements discoverable without embedding sensitive policy
details or credentials in the public Agent Card.

## Proposal

Add an example extension for authority contract metadata. This could be a
data-only extension for discovery, and optionally a required extension when the
server expects clients to activate an authorization protocol before sending
tasks.

Example Agent Card extension object:

```json
{
  "uri": "https://agentid.dev/extensions/authority-contract/v1",
  "description": "Declares where clients and gateways can discover the agent's authority contract and delegated-task receipt requirements.",
  "required": false,
  "params": {
    "authority_manifest_uri": "https://agent.example.com/.well-known/agentid.json",
    "authorization_contract_uri": "https://agent.example.com/.well-known/agentid-provider-contract.json",
    "receipt_required_for": ["write", "admin", "execute", "financial"],
    "receipt_transport": "message.metadata.agentid_receipt",
    "attestation_uri": "https://agent.example.com/.well-known/vcs.json"
  }
}
```

## Why this helps

This keeps identity/capability discovery separate from runtime authorization
while giving clients and gateways a standard place to find authority metadata.

It also supports common enterprise checks:

- Which actions require approval or JIT authority?
- Which delegated tasks require a scoped receipt?
- Where can a verifier fetch the authority contract?
- Where can a verifier fetch identity or security attestations?
- How should an authorization receipt be carried in an A2A request?

## Non-goals

- Do not define a new identity system.
- Do not replace A2A authentication or authorization.
- Do not require public Agent Cards to expose sensitive policy internals.
- Do not require AgentID specifically; AgentID can be one implementation of the
  authority contract URI.

## Relevant AgentID example

AgentID uses a manifest to express action-level authority: tool, action,
resource, job, user, approval, JIT grant, data flow, delegation, audit, and kill
switch behavior.

The extension above would let A2A clients discover that such a contract exists
and where to retrieve it, without changing the core A2A task model.

## Upstream references to mention

- A2A Agent Card discovery and signed Agent Cards.
- A2A extension mechanism.
- A2A authorization guidance for protocol operations.
