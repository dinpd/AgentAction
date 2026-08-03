# Agentic Identity Standards Crosswalk

**Status:** Experimental research and interoperability guidance

**Last reviewed:** 2026-08-03

**Scope:** Agent identity, delegation, runtime authorization, action-bound
evidence, provider enforcement, and execution closure

This document maps the current AgentPass authorization-evidence fields to
established standards, adopted working-group drafts, and exploratory proposals.
It is not a specification and does not claim that the AgentPass field names are
standardized.

## Maturity Labels

- **Established:** published RFC, W3C Recommendation, stable standard, or final
  OpenID specification.
- **Adopted draft:** an official working-group draft that remains work in
  progress.
- **Exploratory:** an individual Internet-Draft, W3C Community Group proposal,
  or young open protocol without formal adoption.
- **Gap / profile work:** no single source defines the required semantics;
  interoperable profiling or additional evidence is still needed.

## Layer Map

| Trust layer | Primary sources | Maturity | AgentPass use |
|---|---|---|---|
| Responsible principal | OpenID Connect; OAuth 2.x | Established | Establish the human, organization, or system represented by the action |
| Fine-grained and delegated authority | OAuth Token Exchange (RFC 8693); Rich Authorization Requests (RFC 9396) | Established | Carry actor/delegation context, audience/resource, and structured authorization details |
| Cross-domain and transaction context | OAuth Identity and Authorization Chaining; Transaction Tokens | Adopted drafts | Preserve downscoped identity and authorization through call chains |
| Runtime identity | SPIFFE; IETF WIMSE architecture, identifiers, credentials, and proof tokens | SPIFFE established; WIMSE adopted drafts | Identify and authenticate the executing workload rather than only the registered application |
| Policy decision | OpenID AuthZEN Authorization API 1.0 | Established final specification | Interoperate between a policy enforcement point and policy decision point |
| Approval and MCP mapping | AuthZEN AARP and COAZ | Adopted drafts | Represent prerequisites such as approval and map MCP calls into subject/action/resource/context |
| MCP connection authorization | MCP Authorization | Protocol specification | OAuth discovery, token acquisition, resource indicators, and audience binding |
| Request integrity | HTTP Message Signatures (RFC 9421) | Established | Bind method, target, selected headers, and content digest |
| Signed authorization evidence | WIMSE Authorization Evidence; Authorization Receipts for High-Risk Agent Actions | Exploratory individual drafts | Adjacent proposals for exact-action authorization evidence, approval, consumption, and durable verification |
| Dynamic risk and revocation | OpenID Shared Signals Framework, CAEP, and RISC | Established final specifications | Feed current posture or revocation into decisions and lifecycle handling |
| Portable declarations | W3C Verifiable Credentials 2.0; W3C agent Community Groups | VC established; agent groups exploratory | Carry relatively durable claims about an agent, operator, capability, or assurance |
| Execution provenance | W3C PROV-O | Established Recommendation | Exchange generic execution lineage; additional cryptographic and replay semantics remain necessary |

Primary-source links are collected under [References](#references).

## Authorization Evidence Field Crosswalk

The MCP vector in
[`../fixtures/mcp-authorization-interoperability-v1/`](../fixtures/mcp-authorization-interoperability-v1/)
uses these fields as a concrete comparison point.

| AgentPass field | Closest source concept | Mapping assessment | Remaining interoperability question |
|---|---|---|---|
| `profile`, `schema_version` | OAuth/JOSE `typ`; media/profile identifiers; AuthZEN versioning | Profile work | Registry, discovery, and mandatory verifier behavior are not yet agreed |
| `issuer` | JWT `iss`; authorization server; Permit issuer | Direct concept | Providers still need issuer discovery, trust policy, and rotation rules |
| `decision_id` | JWT `jti`; WIMSE audit correlation; Permit/receipt identifier | Compatible extension | Decide whether identity, decision, and evidence identifiers are separate values |
| `outcome` | AuthZEN decision; AgentPass `ALLOW` / `REFER` / `DENY` | Profile work | AuthZEN core decision semantics and prerequisite states need a closed crosswalk |
| `tenant_id` | SSF subject identifiers; deployment/organization context | Extension | Cross-domain tenant naming and privacy rules are deployment-specific |
| `principal_id`, `user_id` | OIDC/OAuth `sub`; WIMSE delegated subject | Direct concept with privacy profile | Pairwise or pseudonymous identifiers may be required across providers |
| `agent_id` | OAuth `client_id`; WIMSE Agent Identifier | Ambiguous without profile | A registered agent application and an executing workload must not share one overloaded identifier |
| `agent_app_id` | A2A Agent Card identity; W3C agent metadata/declaration proposals | Exploratory mapping | No broadly adopted application-identity schema exists |
| `runtime_id` | SPIFFE ID; WIMSE Workload Identifier | Direct concept | Define how credential or attestation evidence is referenced and refreshed |
| `delegation_id` | RFC 8693 `act`; OAuth identity chaining | Compatible extension | An actor chain identifies hops but does not prove authority attenuation |
| `delegation_attenuation` | Delegation-chain and authorization-lineage proposals | Gap / profile work | Verifiers need explicit comparison rules and failure semantics |
| `task_id`, `job_id`, `case_id` | AuthZEN context; Transaction Token transaction context | Extension | Common names and disclosure rules vary by domain |
| `audience` | JWT `aud`; OAuth Resource Indicators; MCP protected-resource URI | Direct concept | Canonical provider/resource URI comparison must be exact |
| `tool`, `action`, `resource` | AuthZEN subject/action/resource/context; RAR `authorization_details`; COAZ MCP mapping | Strong composition point | Tool schemas need stable identifiers and parameter-sensitive resource mapping |
| `action_digest` | HTTP Message Signatures content digest; WIMSE Permit `binding_request_hash`; high-risk receipt `action_hash` | Strong overlap | Canonical MCP/HTTP action bytes and digest coverage require a shared profile |
| `canonicalization` | JCS-style canonical JSON or signed-message component rules | Gap / profile work | Algorithm/version agility and ambiguous numeric/Unicode inputs need test vectors |
| `policy_id`, `policy_hash` | AuthZEN context/decision metadata; high-risk receipt policy commitment | Compatible extension | Decide what is public, immutable, and safe to disclose to a provider |
| `approval_id`, `approval_evidence_ref` | AuthZEN AARP prerequisite/approval; high-risk action signoff | Strong overlap | Evidence retrieval, approver privacy, key custody, and stale approval behavior remain open |
| `jit_grant_id` | OAuth grant/token identifiers; AARP satisfied prerequisite | Extension | A grant reference alone must not be treated as proof without verification |
| `risk_state_ref` | Shared Signals / CAEP event and posture context | Compatible extension | Define freshness and behavior when state changes before execution |
| `idempotency_key` | Application idempotency; authorization-evidence consumption | Profile work | Replay prevention requires provider-side atomic state, not only a signed value |
| `issued_at`, `expires_at` | JWT `iat` / `exp`; OAuth token lifetime | Direct concept | Maximum lifetime and clock-skew rules should be profile-specific |
| signed envelope | JWS/JWKS; COSE/SCITT; HTTP Message Signatures | Multiple established building blocks | An interoperability profile should choose at least one mandatory envelope |

## Execution Closure Crosswalk

Authorization evidence proves what was allowed before dispatch. It does not
prove what the provider executed. AgentPass therefore keeps execution closure
as a separate, linked artifact.

| Closure field | Closest source concept | Mapping assessment |
|---|---|---|
| `closure_id` | WIMSE Permit Closure Record; provenance entity identifier | Compatible extension |
| `decision_id` | Authorization/audit correlation identifier | Strong composition point |
| `authorization_evidence_digest` | SCITT statement/receipt digest; provenance entity link | Profile work |
| `action_digest` | Dispatched-request digest; HTTP content/signature coverage | Strong overlap |
| `provider_id` | Workload/provider identity; PROV agent | Compatible extension |
| `status` | Execution receipt or closure lifecycle state | Profile work; common handling of partial execution is unresolved |
| `executed_at` | Audit/provenance generation time | Direct concept |
| `idempotency_key` | Provider idempotency and consumption state | Deployment mechanism with interoperable evidence value |
| `result_digest` | Closure/output digest; PROV generated entity | Compatible extension |

## Required Trust-Boundary Tests

An interoperable verifier should fail closed for at least:

1. a changed tool argument after authorization;
2. an evidence audience that differs from the executing provider;
3. reuse of already consumed single-use evidence;
4. missing or unverifiable parent delegation evidence;
5. expired approval, policy, runtime, or risk context;
6. unsupported profile, canonicalization, digest, or signature algorithm; and
7. execution closure whose decision or action digest does not match the
   authorization evidence.

The included v1 vector automates the first three negative cases and a valid
linked closure. Later vectors should add delegation attenuation, revocation,
partial execution, retry, and cross-format JWS/COSE cases.

## AgentPass Contribution Boundary

AgentPass should contribute interoperability code, mappings, negative fixtures,
and provider-verifier behavior before proposing a new receipt vocabulary. In
particular, the AgentPass evidence model should be compared with both active
individual IETF drafts that already address authorization evidence and
high-risk action receipts.

The desired implementation seam is:

```text
OIDC/OAuth principal and delegation
  + SPIFFE/WIMSE runtime identity
  + AuthZEN decision, AARP approval, and COAZ MCP mapping
  -> canonical action-bound evidence
  -> independent provider verification and local business policy
  -> single-use execution closure and lifecycle signals
```

## References

- [OAuth 2.0 Token Exchange, RFC 8693](https://datatracker.ietf.org/doc/html/rfc8693)
- [OAuth 2.0 Rich Authorization Requests, RFC 9396](https://datatracker.ietf.org/doc/html/rfc9396)
- [HTTP Message Signatures, RFC 9421](https://datatracker.ietf.org/doc/html/rfc9421)
- [OAuth Identity and Authorization Chaining](https://datatracker.ietf.org/doc/draft-ietf-oauth-identity-chaining/)
- [OAuth Transaction Tokens](https://datatracker.ietf.org/doc/draft-ietf-oauth-transaction-tokens/)
- [IETF WIMSE documents](https://datatracker.ietf.org/wg/wimse/documents/)
- [AI Agent Authentication and Authorization](https://datatracker.ietf.org/doc/draft-klrc-aiagent-auth/)
- [Signed Authorization-Evidence Records for WIMSE-Authorized AI Agent Actions](https://datatracker.ietf.org/doc/draft-munoz-wimse-authorization-evidence/)
- [Authorization Receipts for High-Risk Agent Actions](https://datatracker.ietf.org/doc/draft-schrock-ep-authorization-receipts/)
- [OpenID AuthZEN Authorization API 1.0](https://openid.net/specs/authorization-api-1_0.html)
- [AuthZEN AARP and COAZ working-group drafts](https://openid.net/openid-foundation-advances-authorization-for-the-agent-era-with-new-authzen-working-group-drafts/)
- [OpenID Shared Signals Framework 1.0](https://openid.net/specs/openid-sharedsignals-framework-1_0-final.html)
- [SPIFFE standard](https://spiffe.io/docs/latest/spiffe-specs/)
- [MCP Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [A2A specification](https://github.com/a2aproject/A2A/blob/main/docs/specification.md)
- [W3C Verifiable Credentials Data Model 2.0](https://www.w3.org/TR/vc-data-model-2.0/)
- [W3C PROV-O](https://www.w3.org/TR/prov-o/)
- [W3C AI Agent Protocol Community Group](https://www.w3.org/groups/cg/agentprotocol/)
- [W3C Agent Identity Registry Protocol Community Group](https://www.w3.org/community/agent-identity/)
- [W3C Agent Declaration and Assurance Community Group](https://www.w3.org/community/adacg/)
- [W3C Agent Trust Protocol Community Group](https://www.w3.org/community/atp/)
- [NIST AI Agent Standards Initiative](https://www.nist.gov/artificial-intelligence/ai-agent-standards-initiative)
- [ISO/IEC 42001:2023](https://www.iso.org/standard/42001)
