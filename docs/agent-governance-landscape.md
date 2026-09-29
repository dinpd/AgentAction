# The AI Agent Governance Landscape

A survey of projects that control what AI agents are allowed to do, ordered from
largest institutional backing to smallest independent project, with an explicit
separation between what ships today and what is still a proposal.

Maintained by [AgentAction](https://agentaction.dev). We are listed here too, in the
independent tier where we belong. **Targeted update: September 29, 2026** for the
capability map, NVIDIA entries and affected findings. Other catalog entries, status
labels and figures retain their **August 2026 baseline** and were not all reverified.
Sources are project documentation and repositories, not independent certification.
Corrections welcome: open an issue or a PR.

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
| **Contain** | Restricts runtime access to processes, files or networks |
| **Monitor** | Observes activity and supports intervention; does not itself prove outcomes |
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
| **Available** | Published software; not a certification of production readiness |
| **Reference design** | Announced architecture; verify component availability separately |
| **Preview** | Vendor-labeled preview or beta. Usable, expect breaking changes |
| **Early** | Pre-1.0 or thin adoption. Read the source before depending on it |
| **Draft** | A specification with no adopted standing |
| **Concept** | A published architecture with no implementation |
| **Dormant** | Real code, no meaningful activity in a year or more |

---

## Agent Governance Map — the organizing framework

Start with four jobs, then use the capability matrix below to inspect evidence.
The horizontal axis separates **control** (constrain what may happen) from
**evidence** (establish what happened). The vertical axis separates the
**execution environment** from the **business task**.

| Context | Control | Evidence |
|---|---|---|
| **Business task** | **Govern actions:** “May this refund proceed?” AgentCore Policy, AP2 payment mandates, AgentAction action controls. | **Verify outcomes:** “Did the intended refund happen?” AP2 payment evidence and AgentAction's early intent evaluator. |
| **Execution environment** | **Bound access:** “What can this agent reach?” Entra, OpenShell, agentgateway and announced Sentry enforcement. | **Monitor runtime:** “What did the agent do?” OpenShell runtime logs and announced Sentry monitoring/attested telemetry. |

These are qualitative placements of representative capabilities, not product-wide
scores or rankings. Repeated names show complementary coverage. Maturity markers
remain separate: **● documented available capability**, **○ early/draft
implementation**, **◇ announced reference design**. AP2 is payment-specific;
AgentAction is early and self-listed; Sentry remains an announced reference design.
Runtime logs and attested telemetry do not by themselves establish a verified
business outcome. Sources and qualifications for these placements are listed in
the capability entries below and linked directly from the website diagram.

The practical question is: **Which jobs does our stack cover, and where are we
relying on assumptions?**

## Capability map — September 29, 2026

Eight representative approaches, including selected managed services and a hardware reference design alongside open-source projects. This is a documentation review, not an independent benchmark or certification. Scope is per row, not vendor-wide. The [interactive map](https://agentaction.dev/landscape#capability-map) filters focus, maturity and offering, and exposes these same qualifications and sources. AgentAction is self-listed under the same criteria.

B = built in; I = integration; A = announced; ? = not established by the reviewed source. These are coverage states, not scores. Built in includes early reference implementations. Read the scope before interpreting any mark.

| Project | Maturity / offering | Identity & delegation | Runtime containment | Action authorization | State & approvals | Provider verification | Execution & outcomes | Reviewed |
|---|---|---|---|---|---|---|---|---|
| [OpenShell](#map-openshell) | Available / Open source | B | B | I | B | ? | ? | 2026-09-29 |
| [Sentry](#map-sentry) | Reference design / Hardware reference | A | A | A | ? | ? | ? | 2026-09-29 |
| [AgentCore Policy](#map-agentcore) | Available / Managed | B | ? | B | B | ? | ? | 2026-09-29 |
| [Entra Agent ID](#map-entra) | Available / Managed | B | ? | I | ? | ? | ? | 2026-09-29 |
| [agentgateway](#map-agentgateway) | Available / Open source | I | ? | B | ? | ? | ? | 2026-09-29 |
| [Auth0 AI SDKs](#map-auth0) | Early / Open source + managed | B | ? | I | B | ? | ? | 2026-09-29 |
| [AP2](#map-ap2) | Draft / Open source | I | ? | B | B | B | B | 2026-09-29 |
| [AgentAction](#map-agentaction) | Early / Open source | I | ? | B | B | B | B | 2026-09-29 |

### OpenShell <a id="map-openshell"></a>

NVIDIA. Available software; deployment requirements still apply. Permission expansion is distinct from approval of an exact business transaction.

- **Identity & delegation — Built in:** Sandbox credentials and controlled provider-credential injection; not a portable delegation-chain standard. [Source](https://docs.nvidia.com/openshell/latest/about/architecture).
- **Runtime containment — Built in:** Separate trusted supervisor, filesystem/process controls and a mediated network path. [Source](https://docs.nvidia.com/openshell/latest/about/architecture).
- **Action authorization — Integration:** API policy is native. Application-specific payload decisions can be added through supervisor middleware. [Source](https://docs.nvidia.com/openshell/latest/extensibility/overview).
- **State & approvals — Built in:** Risky policy expansion requires review; this does not establish business-transaction budgets or single-use approvals. [Source](https://docs.nvidia.com/openshell/latest/about/architecture).
- **Provider verification — Not established:** Extension tokens authenticate the caller; the reviewed contract does not establish provider-verifiable authority bound to an exact business payload. [Source](https://docs.nvidia.com/openshell/latest/extensibility/overview).
- **Execution & outcomes — Not established:** Runtime logs do not by themselves establish that a business outcome satisfied its intended constraints. [Source](https://docs.nvidia.com/openshell/latest/about/architecture).

### Sentry <a id="map-sentry"></a>

NVIDIA. Announced September 28. BlueField-4 reference design; vendor claims are not independently benchmarked here.

- **Identity & delegation — Announced:** The announcement describes agent identity verification through DOCA. [Source](https://nvidianews.nvidia.com/news/open-agent-safety-platform).
- **Runtime containment — Announced:** Independent DPU monitoring and quarantine outside the agent runtime. [Source](https://nvidianews.nvidia.com/news/open-agent-safety-platform).
- **Action authorization — Announced:** Granular tool/API access enforcement is described; exact transaction-payload semantics are not established. [Source](https://nvidianews.nvidia.com/news/open-agent-safety-platform).
- **State & approvals — Not established:** This source does not establish this capability. This is not evidence that the product cannot provide it. [Source](https://nvidianews.nvidia.com/news/open-agent-safety-platform).
- **Provider verification — Not established:** Attested telemetry is described, but not a receiving-service contract for exact-action authorization receipts. [Source](https://nvidianews.nvidia.com/news/open-agent-safety-platform).
- **Execution & outcomes — Not established:** Monitoring and attested telemetry are not proof of a verified business outcome. [Source](https://nvidianews.nvidia.com/news/open-agent-safety-platform).

### AgentCore Policy <a id="map-agentcore"></a>

AWS. Managed policy service. Dogwood's open-source reference interpreter has a separate maturity. This row does not score all AgentCore services.

- **Identity & delegation — Built in:** Policy sessions bind to authenticated principals; supported multi-hop flows propagate caller identity. [Source](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-session-based-temporal.html).
- **Runtime containment — Not established:** This policy-service source does not establish OS isolation. AgentCore Runtime is a separate service. [Source](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-session-based-temporal.html).
- **Action authorization — Built in:** Cedar evaluates tool invocations and input parameters, including refund amounts. [Source](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-understanding-cedar.html).
- **State & approvals — Built in:** Temporal policies constrain action sequences, invocation counts and sensitive-read follow-up. Multi-hop support is limited to one account and Region. [Source](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-session-based-temporal.html).
- **Provider verification — Not established:** This source does not establish this capability. This is not evidence that the product cannot provide it. [Source](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-session-based-temporal.html).
- **Execution & outcomes — Not established:** Session history supports authorization; an independently verifiable business-outcome receipt is not established by this source. [Source](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-session-based-temporal.html).

### Entra Agent ID <a id="map-entra"></a>

Microsoft / Agent 365. Identity and lifecycle coverage. Do not interpret scoped access tokens as exact-action authorization receipts.

- **Identity & delegation — Built in:** Agent identities, ownership, scoped tokens and user/agent context anchor access and lifecycle governance. [Source](https://learn.microsoft.com/en-us/microsoft-agent-365/guidance/entra-agent-365).
- **Runtime containment — Not established:** This source does not establish this capability. This is not evidence that the product cannot provide it. [Source](https://learn.microsoft.com/en-us/microsoft-agent-365/guidance/entra-agent-365).
- **Action authorization — Integration:** Identity and permissions supply access context; the application must enforce its business-action constraints. [Source](https://learn.microsoft.com/en-us/microsoft-agent-365/guidance/entra-agent-365).
- **State & approvals — Not established:** Lifecycle and Conditional Access controls do not establish per-job transaction history or payload-bound approval in this overview. [Source](https://learn.microsoft.com/en-us/microsoft-agent-365/guidance/entra-agent-365).
- **Provider verification — Not established:** This source does not establish this capability. This is not evidence that the product cannot provide it. [Source](https://learn.microsoft.com/en-us/microsoft-agent-365/guidance/entra-agent-365).
- **Execution & outcomes — Not established:** This source does not establish this capability. This is not evidence that the product cannot provide it. [Source](https://learn.microsoft.com/en-us/microsoft-agent-365/guidance/entra-agent-365).

### agentgateway <a id="map-agentgateway"></a>

Open-source gateway. This row covers documented standalone MCP authorization, not every enterprise extension or custom integration.

- **Identity & delegation — Integration:** Configure MCP authentication to supply validated JWT claims to authorization rules. [Source](https://agentgateway.dev/docs/standalone/latest/documentation/configuration/security/mcp-authz/).
- **Runtime containment — Not established:** This source does not establish this capability. This is not evidence that the product cannot provide it. [Source](https://agentgateway.dev/docs/standalone/latest/documentation/configuration/security/mcp-authz/).
- **Action authorization — Built in:** MCP tool-name/target authorization. Tool arguments are documented as post-request access-log fields, not request-time authorization inputs. [Source](https://agentgateway.dev/docs/standalone/latest/documentation/configuration/security/mcp-authz/).
- **State & approvals — Not established:** This source does not establish this capability. This is not evidence that the product cannot provide it. [Source](https://agentgateway.dev/docs/standalone/latest/documentation/configuration/security/mcp-authz/).
- **Provider verification — Not established:** This source does not establish this capability. This is not evidence that the product cannot provide it. [Source](https://agentgateway.dev/docs/standalone/latest/documentation/configuration/security/mcp-authz/).
- **Execution & outcomes — Not established:** Tool result logging is documented; linked authorization-to-outcome verification is not established. [Source](https://agentgateway.dev/docs/standalone/latest/documentation/configuration/security/mcp-authz/).

### Auth0 AI SDKs <a id="map-auth0"></a>

Okta / Auth0. Open-source SDKs backed by managed Auth0 services. SDK maturity and service maturity are separate.

- **Identity & delegation — Built in:** User authentication and Token Vault connect agents to user-authorized services. [Source](https://github.com/auth0/auth0-ai-js).
- **Runtime containment — Not established:** This source does not establish this capability. This is not evidence that the product cannot provide it. [Source](https://github.com/auth0/auth0-ai-js).
- **Action authorization — Integration:** Application integrations connect authorization and approval flows to tool execution. [Source](https://github.com/auth0/auth0-ai-js).
- **State & approvals — Built in:** Asynchronous authorization supports human approval; it is not a general temporal-policy engine. [Source](https://github.com/auth0/auth0-ai-js).
- **Provider verification — Not established:** This source does not establish this capability. This is not evidence that the product cannot provide it. [Source](https://github.com/auth0/auth0-ai-js).
- **Execution & outcomes — Not established:** This source does not establish this capability. This is not evidence that the product cannot provide it. [Source](https://github.com/auth0/auth0-ai-js).

### AP2 <a id="map-ap2"></a>

Google agentic commerce. Protocol and reference code for payments. Coverage does not imply adoption as a general-purpose action standard.

- **Identity & delegation — Integration:** Payment participants integrate credential and identity systems with the protocol. [Source](https://github.com/google-agentic-commerce/AP2).
- **Runtime containment — Not established:** This source does not establish this capability. This is not evidence that the product cannot provide it. [Source](https://github.com/google-agentic-commerce/AP2).
- **Action authorization — Built in:** Mandates express payment-specific intent and purchase authorization. [Source](https://github.com/google-agentic-commerce/AP2).
- **State & approvals — Built in:** Mandates capture user consent for payment flows; not a generic session-budget engine. [Source](https://github.com/google-agentic-commerce/AP2).
- **Provider verification — Built in:** Verifiable mandates carry payment authority across participant boundaries. [Source](https://github.com/google-agentic-commerce/AP2).
- **Execution & outcomes — Built in:** Payment receipts provide transaction evidence; arbitrary business-goal evaluation remains outside this scope. [Source](https://github.com/google-agentic-commerce/AP2).

### AgentAction <a id="map-agentaction"></a>

Self-listed by the maintainer. Reference implementations and demos. Production use requires trusted context, complete mediation and durable atomic stores; no universal exactly-once guarantee.

- **Identity & delegation — Integration:** Consumes enterprise identity and trusted caller context; does not replace the identity broker. [Source](https://github.com/dinpd/AgentAction/blob/main/packages/provider-express/README.md).
- **Runtime containment — Not established:** An embedded guard is not OS isolation. Infrastructure must prevent bypass of the action boundary. [Source](https://github.com/dinpd/AgentAction/blob/main/packages/guard/src/index.ts).
- **Action authorization — Built in:** Guard checks tool, resource, amount and declared data flow before a wrapped callback. [Source](https://github.com/dinpd/AgentAction/blob/main/packages/guard/src/index.ts).
- **State & approvals — Built in:** Approvals, budgets and replay state exist. Local in-memory state alone does not survive crashes or resolve uncertain provider commits. [Source](https://github.com/dinpd/AgentAction/blob/main/packages/guard/src/index.ts).
- **Provider verification — Built in:** Reference JWS/JWKS middleware verifies scoped receipts. Production replay/revocation stores must be durable and atomic; the Express package is private while its contract settles. [Source](https://github.com/dinpd/AgentAction/blob/main/packages/provider-express/README.md).
- **Execution & outcomes — Built in:** Intent evaluation separates execution and trusted observations; missing evidence can yield indeterminate. Quality depends on the supplied contract and evidence. [Source](https://github.com/dinpd/AgentAction/blob/main/docs/intent-assurance.md).

---

# Findings

## 1. Access control and action authorization are different problems

Identity and scoped access establish who can connect. Action authorization must also
check the proposed operation. Granularity matters: [agentgateway's standalone MCP
rules](https://agentgateway.dev/docs/standalone/latest/documentation/configuration/security/mcp-authz/)
use tool names and targets, while [AgentCore Policy](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-understanding-cedar.html)
can evaluate input parameters. An OAuth token alone does not establish exact-payload
business authorization.

## 2. Stateful authorization is already part of the landscape

[AgentCore temporal policies](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-session-based-temporal.html)
use prior actions within a session to constrain sequences and invocation counts.
Keep the managed service separate from Dogwood's open-source reference interpreter.
Current documentation describes multi-hop identity propagation within one AWS account
and Region, superseding this survey's earlier statement that multi-agent support was
entirely future work. Session boundaries and propagation limits remain material.

## 3. Runtime isolation and provider verification protect different boundaries

[OpenShell](https://docs.nvidia.com/openshell/latest/about/architecture) separates the
trusted supervisor from the agent workload. NVIDIA's [Sentry announcement](https://nvidianews.nvidia.com/news/open-agent-safety-platform)
describes a separate hardware trust domain. Neither control by itself establishes a
provider-verifiable receipt for an exact business transaction. Conversely, an SDK
wrapper cannot contain an agent that can bypass it. Complete mediation remains a
deployment requirement.

## 4. Authorization, execution and outcome remain separate claims

[AP2](https://github.com/google-agentic-commerce/AP2) addresses payment evidence;
[AgentAction's early intent evaluator](intent-assurance.md) separates execution from
trusted observations and can return indeterminate when evidence is missing. An audit
log or an allowed request alone does not establish that the intended task succeeded
within its constraints. Compare evidence bindings and verifiers, rather than claiming
that no projects connect these stages.

## 5. Identity propagation is not recursive delegation verification

[AgentCore](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-session-based-temporal.html)
documents caller identity propagation across supported hops. Its account and Region
limits illustrate why this is not a portable, recursively narrowing authority chain
across organizations. Evaluate the specific trust boundary; a general delegation
claim is not proof of cross-organizational interoperability.

## 6. Approval exists; its binding and durability need inspection

[Auth0 AI SDKs](https://github.com/auth0/auth0-ai-js) support asynchronous authorization;
[OpenShell](https://docs.nvidia.com/openshell/latest/about/architecture) reviews risky
permission expansion. Approving a permission change differs from approving one exact
refund or deployment. Check approver identity, payload binding, expiry, atomic
consumption and crash recovery. The earlier blanket claim that production approval
does not exist was too broad.

---

# Projects

## Tier 1: Hyperscalers and major public companies

| Project | Org | Tags | Status | License | Stars | Why it matters |
|---|---|---|---|---|---|---|
| [OpenShell](https://github.com/NVIDIA/OpenShell) | NVIDIA | Contain, Gate, Identity | **Available** | Apache-2.0 | Not re-counted | Reviewed September 29. Runtime isolation, credential protection and API/network policy with a separate supervisor. Business-payload checks can use [middleware](https://docs.nvidia.com/openshell/latest/extensibility/overview). Software availability is separate from Sentry hardware. |
| [Sentry](https://nvidianews.nvidia.com/news/open-agent-safety-platform) | NVIDIA | Contain, Monitor | **Reference design** | Component-specific; not assessed | Not applicable | Reviewed September 29. Announced September 28 on BlueField-4 DPUs. Independent monitoring and enforcement; vendor availability/performance claims require deployment-specific verification. Attested telemetry is not a verified business outcome. |
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

The stateful layer moved in August 2026. Until August 2026 it was fair to say mainstream
policy engines could not express "the third destructive call this session" or "no more
than $5,000 transferred in the last hour." Dogwood and Bedrock AgentCore Policy
changed that for AWS customers, and the underlying temporal-logic research is fifteen
years old and well understood. Expect this to spread.

Evidence needs a more specific comparison than the presence of logs. NVIDIA describes
attested telemetry; AP2 carries payment mandates and receipts; early projects including
AgentAction connect scoped authority to execution and outcome evidence. These are
different guarantees. Check payload binding, trusted issuers, independent observations
and failure recovery before treating any one as proof of a successful authorized task.

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
| Runtime isolation and credential brokering | [OpenShell](https://docs.nvidia.com/openshell/latest/about/architecture) for the agent runtime; [Docker MCP Gateway](https://github.com/docker/mcp-gateway) for containerized MCP servers. Verify deployment boundaries. |
| Protection against tool descriptions changing under you | [mcp-context-protector](https://github.com/trailofbits/mcp-context-protector) |
| Human approval on individual calls | [Auth0's CIBA flow](https://github.com/auth0/auth0-ai-js) if you are identity-centric, [OpenShell](https://docs.nvidia.com/openshell/latest/about/architecture) for permission expansion. Exact-action binding, expiry and replay semantics still require inspection. |
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
4. **Consistent approval semantics** across runtimes: trusted approvers, durable
   state, expiry, payload binding and atomic consumption.
5. **Portable temporal policy** and shared session semantics across independent
   infrastructure and providers.

None of these are blocked on invention. They are blocked on someone building the
boring, interoperable version and enough parties agreeing to verify it.

---

*Inclusion is not endorsement, and this is not a ranking. Status reflects each
project's own labeling where it publishes one. Figures verified August 2026 from
repository sources, license files, and package registries. If your project is missing,
mischaracterized, or has moved, open an issue or a PR.*
