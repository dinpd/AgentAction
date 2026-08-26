# The AI Agent Governance Landscape

A survey of projects that control what AI agents are allowed to do, ordered from
largest institutional backing to smallest independent project, with an explicit
separation between what ships today and what is still a proposal.

Maintained by [AgentAction](https://agentaction.dev). We are listed here too, in the
independent tier where we belong. Verified August 2026 against each project's own
repository, license file, and package registry. Corrections welcome: open an issue
or a PR.

This is a short list on purpose. There are well over a hundred projects that could
appear here. Each entry is included because it changes what a reader should conclude,
not for completeness, and near-duplicates were dropped in favor of whichever one best
illustrates the pattern.

## How to read it

"Governance," "guardrails," and "trust" get used interchangeably across projects
solving genuinely different problems. Three questions separate them:

| Question | What it distinguishes |
|---|---|
| **When does it act?** | Before the model responds, before a tool call executes, or after |
| **What does it decide?** | Whether content looks acceptable, whether an identity may connect, or whether *this call with this payload* should run right now |
| **Who can verify it?** | Only the party that enforced it, or an independent third party |

**Capability tags:**

| Tag | Meaning |
|---|---|
| **Gate** | Evaluates a specific tool call against policy, can block before execution |
| **Route** | Proxies or federates agent traffic; enforcement coarse or absent |
| **Validate** | Inspects model input/output for injection, PII, toxicity, hallucination |
| **Identity** | Establishes who an agent is, or gets it a credential to connect |
| **Receipt** | Emits evidence a third party can cryptographically verify |
| **Engine** | General-purpose policy engine used as substrate, not agent-specific |

**Status, because a great deal of what gets cited in this space has never run:**

| Status | Meaning |
|---|---|
| **Live** | Generally available, in production use |
| **Preview** | Vendor-labeled preview or beta. Usable, expect breaking changes |
| **Early** | Pre-1.0 or thin adoption. Read the source before depending on it |
| **Draft** | A specification with no adopted standing |
| **Concept** | A published architecture with no implementation |
| **Dormant** | Real code, no meaningful activity in a year or more |

---

# Findings

## 1. Access control and action authorization are different problems, and the funded work is nearly all on the first one

The MCP authorization spec is OAuth 2.1 at the transport layer. It authorizes a
*client to reach a server* at scope granularity, and it says so: authorization is
described as operating "at the transport level," it is OPTIONAL, and STDIO transports
are told not to use it. Nothing in it evaluates whether a particular tool call with
particular arguments should proceed; the spec only says hosts "SHOULD build robust
consent and authorization flows."

ID-JAG, Entra Agent ID, Auth0 Token Vault, Composio, Arcade, SPIFFE, WorkOS Pipes and
Clerk's AgentPass all answer "who is this agent and how does it get a token." That is
a real problem, it is close to solved, and it is not the same problem. Clerk's spec
says the quiet part plainly: **"ongoing action-level control remains the service's
responsibility."**

On the action side there is exactly one mature open standard, OpenID's AuthZEN
Authorization API 1.0 (Final, January 2026), and it standardizes the request/response
envelope between enforcement point and decision point. It standardizes the *question*,
not the risk model.

## 2. History-dependent constraints have no home in mainstream policy engines, and AWS just closed that gap at the top of the market

The agent failures that cost money are cumulative: a runaway tool loop, session spend
crossing a budget, the third destructive call in one session, a payload changed after
approval was granted, an approval reused after it should have been consumed.

Cedar, OPA/Rego, CEL and Cerbos provide no operators for counts, sums, or time-windowed
aggregates over prior events. This is deliberate, not an oversight: AWS notes Cedar
"excludes loops and stateful operations, so policy evaluation terminates in O(n) time,"
which is what buys automated reasoning about policies. SpiceDB and OpenFGA do hold
durable state as relationship tuples, but still have no temporal or aggregate
operators. History-dependent constraints therefore have to live outside the policy
layer.

**This changed in August 2026,** and the live-versus-theory distinction matters here
more than anywhere else in this document. AWS open-sourced
[Dogwood](https://github.com/dogwood-policy/dogwood), which extends Cedar with metric
first-order temporal logic: `formerly`, `since`, `count_within`, `count_distinct_within`,
`sum_within`. Its documented examples are exactly the failure list above, including
requiring that a tool argument match the output of a prior call, and one approval per
trade. The **open-source reference interpreter is explicitly not for production use**
(in-memory, no eviction, trace lost on crash). The **language itself ships inside
Bedrock AgentCore Policy**, where temporal policies and rate limiting were announced
6 August 2026. So the capability is live if you are an AWS customer and a research
artifact if you are not. State is session-scoped with a 24-hour look-back, and
multi-agent orchestration is listed as future work.

Two accuracy notes. Temporal authorization policy is a mature research area, not a new
idea: Basin et al.'s metric first-order temporal logic work runs from SACMAT 2010
through enforcement, not just monitoring, in ESORICS 2022, and Dogwood is an
application of that lineage. And outside AWS, durable state remains fragmented across
LLM gateways tracking spend (LiteLLM, Portkey) and a handful of pre-1.0 agent projects.

## 3. The enforcement point sits on the side of the boundary the constrained party controls

In almost every project here, the gate runs inside the agent's own runtime, SDK,
sidecar, or the operator's own gateway. The party being constrained, or whoever
operates it, also operates the constraint. An operator with code control can bypass it.

Identity-aware proxies are a partial exception worth naming precisely. Pomerium and
Teleport both mint their own signed JWT that the upstream verifies via a published
JWKS endpoint (`X-Pomerium-Jwt-Assertion`, `Teleport-Jwt-Assertion`). But the claims
are subject, email, groups, roles. They prove **who is calling, never what they were
authorized to do.** agentgateway and ToolHive do RFC 8693 token exchange, so the
backend verifies the *identity provider's* signature at scope granularity, not the
gateway's decision. Envoy AI Gateway does per-tool CEL authorization at the gateway
and forwards API keys. IBM ContextForge and Docker's gateway produce no
downstream-verifiable artifact at all.

DPoP (RFC 9449) looks like it closes this and does not. The proof covers HTTP method
and URI only; the RFC is explicit that "only these two message parts are covered."
`POST /transfer` for $10 and for $10,000,000 produce identical DPoP proofs.

**Payments is the real exception, and it ships.** Google's AP2 uses SD-JWT mandates
that the merchant, PSP, and credentials provider each verify against actual cart
parameters before settling. Coinbase's x402 has the resource server verify a
client-signed payment payload bound to exact amount, recipient, resource and nonce.
Money forced the issue. Nothing equivalent exists for the MCP server or the SaaS
mutation.

The IETF's own gap analysis names this. `draft-chen-oauth-agent-authz-use-cases`
calls it the **grant-layer versus execution-layer gap** and argues that at the moment
of commitment "a simple access token representing Grant-Layer Authority is
insufficient." It is an individual draft with no working group adoption, so treat it
as a well-argued statement of the problem rather than a direction of travel.

## 4. Authorization is not proof of execution, and almost nothing links the two

Most projects treat the authorization decision as the terminal event and then log
activity. Three claims that need to stay distinct get collapsed: that an action was
authorized, that it executed, and that the intended outcome occurred within
constraints.

Pipelock is the honest illustration. Its signed action record carries verdict, side
effect class, reversibility and policy hash, and **no outcome field at all**; its own
spec states the receipt "does NOT prove that the action's effects were as described."
The mediator sees the upstream status code and ships it to logs, but it is not in the
signed record. An early "countersigned" conformance level was set aside.

Payments is again the exception. AP2's payment receipt binds a hash of the closed
mandate (authorized) to a status (executed) to PSP and network confirmation IDs
(outcome), as three linked claims with working verification.

Everywhere else, "we authorized it" and "it happened" live in separate systems that
nobody joins.

## 5. Delegation chains have no adopted standard

When agent A delegates to agent B which calls tool C, no adopted standard constrains
how authority propagates. The most striking evidence is normative and live: RFC 8693
defines nested `act` claims as the standard representation of a delegation chain, then
directs that consumers **"MUST only consider the token's top-level claims and the party
identified as the current actor,"** and that prior actors "are informational only and
are not to be considered in access control decisions." The standard way to represent a
chain explicitly forbids using it for authorization.

A2A defines transport, discovery and which auth schemes an endpoint requires. It has
no delegation, attenuation, or chain semantics. MCP's own roadmap, updated 22 August
2026, names the problem directly: authorization "assumes a person with a browser at
consent time," while the caller may be an agent "spawning sub-agents that should get
narrower authority than their parent." Its Agent Identity working group is *forming*.
The IETF WIMSE cross-organizational delegation draft is a problem statement that
declines to specify a solution, observing that no widely deployed mechanism lets a
relying party verify a recursively attenuated delegation chain from another
organization.

One correction to the common framing: narrowing-only delegation **is** implemented at
scale. Microsoft's AGT ships a 1,552-line identity and trust spec with conformance
requirements for monotonic narrowing ("capabilities MUST only narrow, never widen"),
no wildcard propagation, delegation depth limits, hash-chained scope chains and
cascade revocation. But it runs on AGT's own `did:mesh:` scheme, it is public preview,
and it does nothing for the cross-organizational case. Cloudflare, describing its own
agent access architecture, states plainly: "We are not comfortable saying that
multiplayer access control can be built end to end today."

## 6. Human approval has no production-grade home at the gateway layer

Every project doing genuine per-call approve/deny is a desktop or local tool, and
several are dormant. MCP Guardian is the clearest implementation and has shipped
nothing since April 2025. MCP Defender was acquired by Docker, whose forward
investment is elsewhere. Microsoft AGT has approvals but ships an
`InMemoryApprovalQueue` by default. Auth0's asynchronous authorization via CIBA plus
push notification is the most production-ready human-in-the-loop path in the
landscape, and it lives in an identity product rather than an agent gateway. Obot's
webhook filters and Permit's commercial consent service are the closest paths to
building one yourself.

---

# Projects

## Tier 1: Hyperscalers and major public companies

| Project | Org | Tags | Status | License | Stars | Why it matters |
|---|---|---|---|---|---|---|
| [Agent Governance Toolkit](https://github.com/microsoft/agent-governance-toolkit) | Microsoft | Gate | **Preview** | MIT | 6.1k | The center of gravity. Intercepts every tool call, message, and delegation pre-execution; policy in YAML, Rego, or Cedar; SDKs in five languages. Also the only at-scale implementation of monotonic delegation narrowing, though on a proprietary `did:mesh:` scheme. Approvals default to an in-memory queue. |
| [ContextForge](https://github.com/IBM/mcp-context-forge) | IBM | Route, Gate | **Live** | Apache-2.0 | 4.3k | The largest open-source gateway, GA since May 2026. A `tool_pre_invoke` plugin can block a call outright, so enforcement is real but **plugin-authored**: there is no built-in decision point yet (issue #2223 proposes one). 7,000+ tests, monthly releases. |
| [AP2](https://github.com/google-agentic-commerce/AP2) | Google + FIDO | Receipt | **Draft spec, working implementations** | Apache-2.0 | 3.1k | **The counterexample to findings 3 and 4.** SD-JWT mandates verified by merchant, PSP, and credentials provider against actual cart parameters before settlement, with receipts binding authorization to execution to outcome. Spec is v0.2; the reference SDKs genuinely verify. Payments only. |
| [Docker MCP Gateway](https://github.com/docker/mcp-gateway) | Docker | Route, Gate | **Live** | MIT | 1.5k | Ships inside Docker Desktop. Real pre-execution blocking via `--interceptor before:exec:` where a non-zero exit blocks the call, but **you write the policy as a script**. Containers each MCP server. |
| [Cedar](https://github.com/cedar-policy/cedar) | AWS → CNCF Sandbox | Engine | **Live** | Apache-2.0 | 1.5k | Formally verified authorization language (Lean-proven). The substrate under AgentCore Policy, Microsoft AGT, ToolHive, and cMCP. Deliberately stateless. |
| [Invariant](https://github.com/invariantlabs-ai/invariant) | Snyk (acq. 2025) | Gate, Validate | **Live** | Apache-2.0 | 424 | Intercepting proxy evaluating contextual rules on tool calls **both before and after execution**. The clearest example of semantic, content-aware gating as opposed to identity or RBAC gating. Check strategic direction post-acquisition. |
| [Dogwood](https://github.com/dogwood-policy/dogwood) | AWS | Engine | **Early as OSS, Live inside AgentCore** | Apache-2.0 | 11 | **The most important recent development in this space,** and the sharpest live-versus-theory case here. Extends Cedar with temporal logic over prior events. The reference interpreter says outright it is not for production; the language ships in a GA AWS service. See finding 2. |

**Specs from this tier:** [MCP authorization](https://modelcontextprotocol.io/specification/latest)
(Anthropic → AAIF, **Live**, widely implemented) is the OAuth 2.1 profile that finding
1 is about: transport-level and OPTIONAL. [A2A](https://github.com/a2aproject/A2A)
(Google → Linux Foundation, **Live** at v1.0, 25.5k stars, 150+ orgs) is included for
what it does **not** define: no agent identity primitive, no delegation or attenuation
semantics.

**Model and conversation validation** is a distinct, well-served category this document
does not try to cover: [Guardrails AI](https://github.com/guardrails-ai/guardrails)
(7.3k stars, 153k PyPI downloads/month) is the most adopted, with
[NeMo Guardrails](https://github.com/NVIDIA-NeMo/Guardrails) (NVIDIA) and
[Purple Llama](https://github.com/meta-llama/PurpleLlama) (Meta, whose AlignmentCheck
inspects reasoning traces for goal hijacking) as the major vendor entries. All Live.
They validate content. They do not authorize actions, have no identity model, and no
receipt primitive. Comparing them head-to-head with anything below is a category error.

**Closed source, noted to close the loop:** Amazon Bedrock AgentCore Policy (**Live**,
gates tool access pre-execution, built on Cedar and Dogwood), Microsoft Entra Agent ID
(**Live**, agents as directory objects), Cloudflare WriteGuard (**Preview**).
Cloudflare's [Agent Access Model](https://blog.cloudflare.com/the-agent-access-model/)
is frequently cited as though it were a product: it is **Concept**, a reference
architecture with no implementation and no repository, and its "Trust Ratchet" is
intra-task, not cross-agent.

## Tier 2: Foundation-governed

| Project | Foundation | Tags | Status | License | Stars | Why it matters |
|---|---|---|---|---|---|---|
| [agentgateway](https://github.com/agentgateway/agentgateway) | Linux Foundation / AAIF | Gate, Route | **Live** | Apache-2.0 | 4.5k | Rust data plane for MCP + A2A + LLM. CEL policy over **MCP method invocations** (`mcp.tool.name`, JWT claims) plus ext_authz delegation. Contributed by Solo.io to the **Linux Foundation, not CNCF**. 300+ contributors. |
| [Envoy AI Gateway](https://github.com/envoyproxy/ai-gateway) | CNCF / Envoy | Gate, Route | **Live** | Apache-2.0 | 1.8k | v1.0.0 June 2026. Per-tool authorization policies matched on backend and tool name, filtered by JWT scopes with CEL. Under proposal to move to AAIF as "Agent Router." |
| [Open Policy Agent](https://github.com/open-policy-agent/opa) | CNCF (Graduated) | Engine | **Live** | Apache-2.0 | 11.8k | The reference general-purpose engine. Used for agent authorization by embedding it as the decision point; has **no agent-native primitives**. |
| [AuthZEN Authorization API 1.0](https://openid.net/specs/authorization-api-1_0.html) | OpenID Foundation | Spec | **Live (Final, Jan 2026)** | - | - | The only mature open standard on the action-authorization side. New working drafts (AARP, COAZ) targeting MCP tool authorization are **Draft**. |

Also relevant as substrate rather than agent tooling, all **Live**: **SPIFFE/SPIRE**
(CNCF Graduated, the most mature identity project in this survey, with zero opinion
about what a workload does), and the relationship-authorization engines **OpenFGA**
(CNCF Incubating), **SpiceDB**, and **Cerbos**. Excellent, mature, agent-unaware, and
no temporal or aggregate operators. Note that Oso's open-source library is
**deprecated** (last release December 2023); only the closed Oso Cloud is live.

## Tier 3: Funded private companies

| Project | Org (funding) | Tags | Status | License | Stars | Why it matters |
|---|---|---|---|---|---|---|
| [ToolHive](https://github.com/stacklok/toolhive) | Stacklok ($17.5M A) | Gate | **Live** | Apache-2.0 | 2.0k | **The strongest per-tool authorization in open source.** Cedar policies evaluate `call_tool` before it reaches the server, using tool *arguments* (`arg_` prefixed), JWT claims, and MCP annotations (`readOnlyHint`, `destructiveHint`) as attributes. Founded by the Kubernetes and Sigstore co-creators. No approvals, no receipts. |
| [Teleport](https://github.com/gravitational/teleport) | Teleport ($1.1B val.) | Gate, Identity | **Live** (MCP support newer) | **AGPL-3.0** core | 20.5k | `allow.mcp.tools` / `deny.mcp.tools` with globs and regex, enforced pre-execution. Mints a signed JWT the upstream verifies via JWKS, carrying **identity claims only**. See finding 3. |
| [Pomerium](https://github.com/pomerium/pomerium) | Pomerium ($13.75M A) | Gate, Identity | **Live** (MCP support newer) | Apache-2.0 | 4.8k | An `mcp_tool` policy criterion matching tool names by exact/prefix/suffix/list, tied to user identity. Same signed-assertion-to-upstream pattern as Teleport, same identity-only limitation. MCP support lives in the docs, not the README. |
| [LiteLLM](https://github.com/BerriAI/litellm) | BerriAI (YC W23) | Route, Gate | **Live** | MIT + commercial `enterprise/` | 53.8k | DB-backed budgets per key/user/team/customer with session-level caps on iterations and spend, so it is one of the few places durable state actually lives. Two caveats: budgets **fail open** without a DB connection, and open issue **#25011** reports guardrail hooks never firing on the `/mcp/` path. |
| [Obot](https://github.com/obot-platform/obot) | Obot AI ($35M seed) | Gate, Route | **Live** | MIT | 823 | **Filters** are the real hook: an MCP filter server or HTTP webhook returns accept / reject / **mutate** per tool call before execution. The closest thing to a DIY approval queue. Access policies themselves are per-server, not per-tool. |
| [Auth0 AI SDKs](https://github.com/auth0/auth0-ai-js) | Okta / Auth0 | Identity, Gate | **Live** (GA Nov 2025); SDKs pre-1.0 | Apache-2.0 | - | **Asynchronous Authorization** via CIBA plus push notification is the most production-ready human-in-the-loop approval in the landscape. See finding 6. |
| [Clerk AgentPass](https://github.com/clerk/agentpass) | Clerk ($50M C) | Identity | **Draft** | MIT | 9 | Short-lived, single-use, holder-bound passes, scoped per *task*. Included for one sentence in its spec: **"ongoing action-level control remains the service's responsibility."** v0.1, explicitly not security-audited and not for production. Unrelated to this project despite the name. |

## Tier 4: Small companies

| Project | Org | Tags | Status | License | Stars | Why it matters |
|---|---|---|---|---|---|---|
| [nono](https://github.com/always-further/nono) | always-further | Gate | **Early** | Apache-2.0 | 3.8k | Capability-based agent runtime with fine-grained policies, Rust, 88 contributors. The largest project in this tier by a wide margin and under-covered relative to its size. |
| [open-edison](https://github.com/Edison-Watch/open-edison) | Edison Watch | Gate | **Early** (no formal releases) | **GPL-3.0** | 280 | **Deny by default**: unknown tools are rejected outright. Tracks the "lethal trifecta" (private data access + untrusted content + external comms) across a session and blocks once all three are live. One of the few genuinely stateful risk models outside AWS. |
| [mcp-context-protector](https://github.com/trailofbits/mcp-context-protector) | Trail of Bits | Gate | **Early** | Apache-2.0 | 222 | Trust-on-first-use pinning of server config; blocks calls when tool descriptions change without approval. This is *integrity* enforcement, a distinct problem: it answers "did this tool change," not "may this user call it." Highest security credibility here. |
| [MCP Guardian](https://github.com/eqtylab/mcp-guardian) | EQTY Lab | Gate | **Dormant** | Apache-2.0 | 199 | The clearest per-call human approve/deny implementation, and the evidence for finding 6: six releases, all between February and April 2025, nothing since. |
| [cMCP](https://github.com/agentrust-io/cmcp) | AgentTrust.io | Gate, Receipt | **Early** (developer preview) | MIT | 3 | Evaluates Cedar policies **inside a hardware TEE** and emits attested "TRACE Claims," genuinely removing operator trust from the signing path. But the MCP server verifies nothing, and they say so: extending attestation to the tool server is Phase 2. Well-engineered, essentially unadopted. |

## Tier 5: Independent and solo-maintained

Everything in this tier is **Early**. Read the source before depending on any of it.

| Project | Tags | License | Stars | Why it matters |
|---|---|---|---|---|
| [Pipelock](https://github.com/luckyPipewrench/pipelock) | Gate, Receipt | Apache-2.0 + ELv2 | 792 | Capability separation: the agent holds secrets but no network, Pipelock has network but no secrets. Emits **mediator-signed receipts verifiable offline** with no account or server. Also the most honest artifact in this survey: its spec states the receipt "does NOT prove that the action's effects were as described." See finding 4. |
| [Aegis](https://github.com/Justin0504/Aegis) | Gate, Receipt | MIT | 362 | The most complete single-project feature match to pre-execution gating plus approvals plus receipts: SDK auto-patching across nine Python frameworks, HTTP and MCP stdio proxies, SHA-256 hash-chained audit with optional Ed25519 signing, kill switch. Backed by an [arXiv paper](https://arxiv.org/pdf/2603.12621). v0.1.0, single maintainer. |
| [permit0](https://github.com/permit0-ai/permit0) | Gate, Receipt | Apache-2.0 | 185 | ⚠️ **Not Permit.io**; different org, no affiliation. Its whole thesis is pre-execution adjudication: risk scoring across nine dimensions, session-aware cross-call pattern detection, tier-based routing to human approval, ed25519 audit, Postgres-backed. Human reviewers can only narrow a decision, never widen it. v0.1, Rust. |
| [agent-passport-system](https://github.com/aeoess/agent-passport-system) | Identity, Gate, Receipt | Apache-2.0 | 41 | Narrowing-only delegation per hop, Ed25519 three-signature chains, cascade revocation, and the only project found putting **idempotency at the authorization boundary**. Conceptually the most complete design in this tier; the academic framing around it is self-published, not peer-reviewed. Its author filed a substantive adversarial report against Microsoft AGT ([issue #1354](https://github.com/microsoft/agent-governance-toolkit/issues/1354)) covering depth escalation and scope reconstitution; closed without maintainer response. |
| **AgentAction** ([agentaction.dev](https://agentaction.dev)) | Gate, Receipt, Identity | Apache-2.0 | - | **Ours.** Gates the exact tool call against policy, approvals, budgets, idempotency, and data-flow rules, then issues a signed JWS authorization receipt with a public JWKS endpoint a provider can verify independently. Integrates behind Envoy ext_authz and agentgateway ExtMCP rather than replacing them. Solo-maintained. The enterprise gateway direction on our site is labeled product direction, not shipped. |

---

# Standards: what is adopted and what is one person's draft

A large share of what gets cited in agent-authorization discussions has no standing.
IETF individual submissions in particular are frequently quoted as though they were
adopted work; anyone can publish one, they expire after six months, and several of the
most-cited ones in this space are written by parties selling an implementation.

| Document | Body | Status | What it actually is |
|---|---|---|---|
| **RFC 8693** Token Exchange | IETF | **RFC** | Defines nested `act` delegation chains, and forbids using prior actors for access control. See finding 5 |
| **RFC 9449** DPoP | IETF | **RFC** | Proof of key possession. Covers HTTP method and URI only, not the request body |
| **RFC 9943** SCITT | IETF | **RFC** (June 2026) | Append-only transparency over already-signed statements. Post-hoc notarization, not a pre-execution gate |
| **AuthZEN Authorization API 1.0** | OpenID Foundation | **Final** (Jan 2026) | The PEP-to-PDP request/response envelope. The only settled standard on the action side |
| **MCP authorization** | AAIF | **Live spec** | OAuth 2.1 profile at the transport layer. OPTIONAL, HTTP-only |
| **A2A 1.0** | Linux Foundation | **Live spec** | Agent interop. No identity primitive, no delegation semantics |
| **OAuth Identity Chaining** (ID-JAG) | IETF | **WG adopted, IESG approved** | Cross-trust-domain token exchange. Identity, not action |
| **Transaction Tokens** | IETF | **WG consensus, awaiting write-up** | Scoped to a *single* trust domain by design |
| **COSE Receipts** | IETF | **WG draft** | Merkle inclusion proofs. Proves "this was logged," not "this was authorized" |
| **WIMSE** workload identity | IETF | **WG drafts, no RFC yet** | Architecture stabilizing; nothing normative shipped |
| **AP2** | Google + FIDO | **Draft v0.2, implementations work** | Payment mandates as verifiable credentials. The one place provider-side verification ships |
| `draft-chen-oauth-agent-authz-use-cases` | IETF | **Individual draft** | The grant-layer versus execution-layer gap analysis. Well argued, no standing |
| `draft-schrock-ep-authorization-receipts` | IETF | **Individual draft** | Provider-verified action receipts with declared enforcement classes |
| `draft-niyikiza-oauth-attenuating-agent-tokens` | IETF | **Individual draft, expires Sept 2026** | Capability narrowing across delegation hops |
| `draft-reece-wimse-cross-org-delegation` | IETF | **Individual draft** | Explicitly a problem statement. States it does not specify a solution |
| **MCP Agent Identity WG** | AAIF | **Forming** | Chartered to address sub-agent authority narrowing |
| **Cloudflare Agent Access Model** | Cloudflare | **Concept** | Reference architecture. No implementation, no repository |

The pattern is hard to miss: everything settled is about identity and transport,
everything about action-bound authority is an individual draft or a concept.

---

# Conclusion

## Gating became table stakes in 2026; evidence did not

At the start of the year, "a policy check in front of the tool call" was a
differentiator. It is now a feature of Microsoft's toolkit, of every serious MCP
gateway, of two identity-aware proxies, and of a managed AWS service. Cedar and CEL
have emerged as the default policy languages, ext_authz as the default integration
seam, and per-tool authorization tied to JWT claims as the default shape. Anyone
building here should assume the enforcement layer is commoditizing and plan
accordingly.

The stateful layer moved this month. Until August 2026 it was fair to say mainstream
policy engines could not express "the third destructive call this session" or "no more
than $5,000 transferred in the last hour." Dogwood and Bedrock AgentCore Policy
changed that for AWS customers, and the underlying temporal-logic research is fifteen
years old and well understood. Expect this to spread.

What has not moved is the evidence layer. Every mature project stops at OpenTelemetry
spans and structured logs, which the operator can rewrite. The gateways that do hand a
downstream service something signed are attesting identity, not authority. Nothing
outside payments links the authorization decision to what actually executed, and
nothing at all constrains authority across a delegation chain in a way a relying party
in another organization can verify. Three separate standards efforts have written down
some version of this gap in the last six months. All three are individual drafts.

The short version: **the industry has largely solved "may this agent connect," is
rapidly solving "may this call proceed," and has barely started on "can anyone else
prove what was authorized and what actually happened."**

## Choosing something today

Most readers arrive with a specific problem. Roughly:

| If you need | Look at |
|---|---|
| Per-tool policy in front of MCP servers, in production now | [ToolHive](https://github.com/stacklok/toolhive) (Cedar, tool arguments as attributes) or [agentgateway](https://github.com/agentgateway/agentgateway) (CEL, foundation-governed, ext_authz) |
| Policy across a mixed estate with SDKs in several languages | [Microsoft AGT](https://github.com/microsoft/agent-governance-toolkit), accepting preview status |
| Constraints over sequences, budgets, or session history | Bedrock AgentCore Policy if you are on AWS. Otherwise you are assembling durable state yourself |
| Content validation of model input and output | [Guardrails AI](https://github.com/guardrails-ai/guardrails), or [NeMo Guardrails](https://github.com/NVIDIA-NeMo/Guardrails) for conversational rails |
| Isolation and credential brokering more than policy | [Docker MCP Gateway](https://github.com/docker/mcp-gateway) |
| Protection against tool descriptions changing under you | [mcp-context-protector](https://github.com/trailofbits/mcp-context-protector) |
| Human approval on individual calls | Nothing production-grade ships this. [Auth0's CIBA flow](https://github.com/auth0/auth0-ai-js) if you are identity-centric, [Obot](https://github.com/obot-platform/obot) filters if you are building it yourself |
| A receiving service that must verify authority itself | [AP2](https://github.com/google-agentic-commerce/AP2) if the domain is payments. Otherwise this is an open problem and every project attempting it is early |

A general note on selection: the useful question is rarely "which tool is best," it is
which layer you are missing. Several of these compose cleanly, and the most common
mistake in this category is buying a second thing that does what the first thing
already did.

## What would close the gaps

For anyone working on this, the open problems are reasonably well defined:

1. **An interoperable, action-bound authorization receipt** a receiving service can
   verify without a callback and without trusting the caller's infrastructure. AP2
   demonstrates the shape; payments-specific assumptions are baked into it.
2. **Execution closure**, treating authorized, executed, and outcome-achieved as three
   distinct claims linked by evidence rather than collapsing them into one log line.
3. **Cross-organizational delegation** a relying party can verify recursively, which
   RFC 8693 currently instructs implementers not to attempt.
4. **A server-side approval queue** with durable state, expiry, and payload binding,
   as ordinary infrastructure rather than a desktop utility.
5. **Temporal policy outside a single cloud provider**, given that the research is
   settled and only one production implementation exists.

None of these are blocked on invention. They are blocked on someone building the
boring, interoperable version and enough parties agreeing to verify it.

---

*Inclusion is not endorsement, and this is not a ranking. Status reflects each
project's own labeling where it publishes one. Figures verified August 2026 from
repository sources, license files, and package registries. If your project is missing,
mischaracterized, or has moved, open an issue or a PR.*
