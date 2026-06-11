# Standards Alignment

AgentPass should align with distributed identity standards without becoming a
replacement for them.

The core distinction is:

```text
OAuth/OIDC proves access to an enterprise or provider boundary.
DID proves portable cryptographic identity.
Verifiable Credentials prove signed claims about an agent.
AgentPass decides what the verified agent may do at tool-execution time.
```

AgentPass's primary job remains action-level authorization: whether a specific
agent may call a specific tool action on a specific resource for a specific
user, job, case, customer, approval, and time window. DID and Verifiable
Credential support should make that authority portable, independently
verifiable, and easier to revoke.

## Priority

DID and Verifiable Credential work should be a standards compatibility track,
not a replacement for the existing product roadmap.

Keep these items ahead of the DID/VC track:

1. Provider MCP authorization contracts.
2. Runtime gateway enforcement.
3. Short-lived JIT grants.
4. Provider-side authorization receipt verification.
5. Audit, execution receipts, and drift detection.

Fold DID/VC work into those areas as production hardening:

```text
AgentPass manifest
  -> DID-bound agent identity
  -> trusted issuer policy
  -> VC-style attestations
  -> signed authorization receipt
  -> provider verification
  -> revocation/status check
  -> audit
```

## Manifest Fields

AgentPass manifests can carry an optional DID for the agent:

```yaml
agent:
  id: support-refund-agent
  did: did:web:example.com:agents:support-refund-agent
  name: Support Refund Agent
  owner: support-platform
  environment: production
  purpose: Resolve support cases and request scoped billing actions.
```

They can also declare which issuers are trusted for attestations:

```yaml
trusted_issuers:
  - did:web:security-reviewer.example.com
  - did:web:provider.example.com
```

Attestations can represent signed claims about an agent's security review,
provider approval, compliance status, or operational readiness:

```yaml
attestations:
  - type: AgentSecurityAssessment
    issuer: did:web:security-reviewer.example.com
    subject: did:web:example.com:agents:support-refund-agent
    standard: OWASP_LLM_TOP_10
    controls:
      - LLM01_prompt_injection
      - LLM06_sensitive_information_disclosure
    result: pass
    issued_at: 2026-06-02
    expires_at: 2026-09-02
    credential_status: https://example.com/status/agent-security/42
    evidence_uri: https://example.com/evidence/agent-security/42
```

Runtime policy can decide whether these attestations are advisory or required:

```yaml
runtime:
  enforce_manifest: true
  detect_tool_drift: true
  detect_new_destinations: true
  require_valid_attestations: true
  deny_if_attestation_expired: true
  deny_if_credential_revoked: true
```

## Design Rules

- Treat identity as necessary but not sufficient.
- Keep OAuth/OIDC, enterprise IdPs, and workload identity first-class.
- Treat DID as an optional portable identifier, not a mandatory deployment
  model.
- Treat Verifiable Credentials as signed evidence about an agent, not as the
  authorization decision itself.
- Make issuer trust explicit with `trusted_issuers`.
- Fail closed only when runtime policy explicitly requires valid attestations.
- Preserve provider-side business authorization as mandatory.

## Receipt Evolution

The local provider demo uses HMAC-signed receipts because they are dependency
free and easy to verify in CI. Production receipts should evolve toward signed
envelopes with key IDs, issuer identities, and managed key rotation:

```json
{
  "issuer": "did:web:enterprise.example.com",
  "subject": "did:web:example.com:agents:support-refund-agent",
  "kid": "did:web:enterprise.example.com#agentid-receipt-key-2026-06",
  "payload": {
    "tenant_id": "acme-corp",
    "agent_id": "support-refund-agent",
    "tool": "provider.crm.update_customer",
    "action": "write",
    "resource": "provider/customer/cus_123",
    "case_id": "case-1042",
    "approval_id": "approval-456",
    "expires_at": "2026-06-03T18:00:00Z"
  },
  "proof": {
    "type": "JsonWebSignature2020",
    "signature": "..."
  }
}
```

Future implementations should support JWS/JWKS verification first, then DID URL
verification methods where a deployment needs portable issuer or agent
identity.

## Delegation Credentials

Agent-to-agent delegation is a high-value DID/VC use case. A delegation grant
can be modeled as a short-lived, scoped credential from a source agent or
gateway to a target agent:

```yaml
delegation_grant:
  issuer: did:web:source-agent.example.com
  subject: did:web:target-agent.example.com
  allowed_tools:
    - provider.crm.search_customer
  max_depth: 1
  expires_at: 2026-06-03T18:00:00Z
```

The receiving agent should not gain the source agent's full authority. The
grant should be attenuated, auditable, short-lived, and revocable.

## Visibility and Contribution Targets

AgentPass should engage standards projects by contributing examples and
implementation guidance, not by claiming to replace their identity layers.

Useful targets:

- OpenID Foundation AI Identity Management Community Group: contribute the
  distinction between agent identity, delegated user identity, and
  action-level authority.
- NIST AI Agent Standards Initiative: publish an AgentPass response describing
  identification, authorization, auditing, non-repudiation, prompt-injection
  controls, JIT grants, and execution receipts.
- MCP authorization: contribute examples for argument-sensitive authorization,
  provider-published authorization contracts, and scoped execution receipts.
- A2A: propose an Agent Card extension or example for
  `authorization_contract_uri`, `authority_manifest_uri`, signed Agent Cards,
  and delegated-task receipt requirements.
- AGNTCY/OASF: contribute an example mapping an AgentPass authority contract into
  Agent Badge or OASF metadata.

The external message should be:

> AgentPass does not compete with distributed identity standards. It gives them
> the missing authorization payload: what the verified agent may do, under
> which context, and what evidence must exist before execution.

Draft outreach materials are kept outside the public documentation tree until
they are ready to publish.
