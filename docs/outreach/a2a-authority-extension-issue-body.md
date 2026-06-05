# Agent Card extension example for authority contract metadata

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

Add a non-normative example extension for authority contract metadata. This
could be a data-only extension for discovery, and optionally a required
extension when the server expects clients to activate an authorization protocol
before sending tasks.

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
    "receipt_binds": [
      "agent_id",
      "principal_id",
      "task_id",
      "action",
      "resource",
      "authority_decision_id"
    ],
    "receipt_verification": "signed_or_introspected",
    "receipt_profile_uri": "urn:example:authority-receipt:v1",
    "attestation_uri": "https://agent.example.com/.well-known/vcs.json"
  }
}
```

The Agent Card should distinguish where to fetch the authority contract from
the minimum receipt interface expected at task time. `receipt_binds` should be
treated as a public minimum binding set, not a full policy disclosure. The
linked authority contract can define stricter provider/tool-specific bindings,
such as approval ID, JIT grant ID, case/customer/resource fields, amount, and
tenant-specific constraints. When a server needs closed outcome semantics, the
optional `receipt_profile_uri` can point to a receipt profile that defines the
allowed outcome vocabulary, escalation states, canonicalization requirements,
and domain-specific evidence rules.

## Why this helps

This keeps identity/capability discovery separate from runtime authorization
while giving clients and gateways a standard place to find authority metadata.

It also supports common enterprise checks:

- Which actions require approval or just-in-time authority?
- Which delegated tasks require a scoped receipt?
- Where can a verifier fetch the authority contract?
- Where can a verifier fetch identity or security attestations?
- How should an authorization receipt be carried in an A2A request?
- Which minimum receipt claims should be bound to the delegated task?
- Which receipt profile defines closed outcome and evidence semantics?

## Non-goals

- Do not define a new identity system.
- Do not replace A2A authentication or authorization.
- Do not require public Agent Cards to expose sensitive policy internals.
- Do not require AgentID specifically; AgentID can be one implementation of the
  authority contract URI.

## Related implementation

I have been working on AgentID, which uses a manifest to express action-level
authority: tool, action, resource, job, user, approval, JIT grant, data flow,
delegation, audit, and kill-switch behavior.

The extension above would let A2A clients discover that such a contract exists
and where to retrieve it, without changing the core A2A task model.

Reference: https://github.com/dinpd/AgentID/blob/main/docs/standards-alignment.md
