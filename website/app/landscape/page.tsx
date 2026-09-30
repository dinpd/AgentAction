import { SiteHeader } from "../site-header";
import type { Metadata } from "next";
import { Brand } from "../brand";
import { CapabilityMap } from "./capability-map";
import { GovernanceMap } from "./governance-map";

const github = "https://github.com/dinpd/AgentAction";
const sourceDoc = `${github}/blob/main/docs/agent-governance-landscape.md`;
const landscapeUrl = "https://agentaction.dev/landscape";
const landscapeDescription =
  "Compare agent governance by control focus, evidence and maturity, including NVIDIA OpenShell and Sentry. Open-source projects and selected managed offerings.";

export const metadata: Metadata = {
  title: { absolute: "The AI Agent Governance Landscape — AgentAction" },
  description: landscapeDescription,
  alternates: { canonical: landscapeUrl },
  openGraph: {
    type: "article",
    url: "https://agentaction.dev/landscape",
    title: "The AI Agent Governance Landscape",
    description:
      "Compare control focus and maturity. NVIDIA and capability-map review: September 29, 2026; wider catalog baseline: August 2026.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "The AI Agent Governance Landscape",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "The AI Agent Governance Landscape",
    description:
      "Compare control focus and maturity. NVIDIA and capability-map review: September 29, 2026; wider catalog baseline: August 2026.",
    images: ["/og.png"],
  },
};

const landscapeStructuredData = {
  "@context": "https://schema.org",
  "@type": "Article",
  "@id": `${landscapeUrl}#article`,
  mainEntityOfPage: {
    "@type": "WebPage",
    "@id": landscapeUrl,
  },
  headline: "The AI Agent Governance Landscape",
  description: landscapeDescription,
  image: "https://agentaction.dev/og.png",
  datePublished: "2026-08-26",
  dateModified: "2026-09-29",
  author: { "@id": "https://agentaction.dev/#organization" },
  publisher: { "@id": "https://agentaction.dev/#organization" },
  isPartOf: { "@id": "https://agentaction.dev/#website" },
  inLanguage: "en",
};

const statusLegend: [string, string][] = [
  ["Live", "Generally available, in production use"],
  ["Available", "Published software; not a certification of production readiness"],
  ["Reference design", "Announced architecture; verify component availability separately"],
  ["Preview", "Vendor-labeled preview or beta. Usable, expect breaking changes"],
  ["Early", "Pre-1.0 or thin adoption. Read the source before depending on it"],
  ["Draft", "A specification with no adopted standing"],
  ["Concept", "A published architecture with no implementation"],
  ["Dormant", "Real code, no meaningful activity in a year or more"],
];

const findings = [
  {
    index: "01",
    title: "Access control and action authorization are different problems",
    body: "Identity and scoped access establish who can connect. Tool authorization must also decide whether this operation is allowed. Inspect granularity: agentgateway documents tool-name checks, while AgentCore Policy can evaluate input parameters. Neither the word governance nor an OAuth token establishes exact-payload authorization by itself.",
    source: "https://agentgateway.dev/docs/standalone/latest/documentation/configuration/security/mcp-authz/",
  },
  {
    index: "02",
    title: "Stateful authorization is already part of the landscape",
    body: "AWS AgentCore temporal policies evaluate prior actions within a session, including sequence and invocation limits. Dogwood extends Cedar with temporal conditions. Keep the managed service separate from the open-source reference interpreter, and inspect session boundaries: supported multi-hop propagation is currently limited to one AWS account and Region.",
    source: "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-session-based-temporal.html",
  },
  {
    index: "03",
    title: "Runtime isolation and provider verification protect different boundaries",
    body: "OpenShell places enforcement in a trusted supervisor outside the agent workload. NVIDIA also describes Sentry as a watchdog in a separate hardware trust domain. These strengthen containment; they do not by themselves establish a receipt that a downstream business service verifies against the exact authorized transaction. An embedded SDK guard still needs infrastructure that prevents bypass.",
    source: "https://docs.nvidia.com/openshell/latest/about/architecture",
  },
  {
    index: "04",
    title: "Authorization, execution and outcome remain separate claims",
    body: "An allowed action may fail, and a completed operation may violate the task's constraints. AP2 addresses payment evidence; AgentAction's early intent evaluator distinguishes execution from trusted observations and can return indeterminate. The useful comparison is what evidence each system binds and who verifies it, not whether a product has an audit log.",
    source: "https://github.com/dinpd/AgentAction/blob/main/docs/intent-assurance.md",
  },
  {
    index: "05",
    title: "Identity propagation is not recursive delegation verification",
    body: "AgentCore documents identity propagation for supported multi-hop flows, with account and Region limits. That is useful but does not establish a portable, recursively narrowing authority chain across organizations. Evaluate the trust boundary and supported deployment, rather than treating a delegation claim as universal interoperability.",
    source: "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-session-based-temporal.html",
  },
  {
    index: "06",
    title: "Approval exists; its binding and durability need inspection",
    body: "Auth0 offers asynchronous authorization, and OpenShell reviews risky permission expansion. A permission change is different from approval of one exact refund or deployment. Check approver identity, payload binding, expiry, atomic consumption and crash recovery before relying on a workflow's approval guarantee. A blanket claim that production approval does not exist is too broad.",
    source: "https://github.com/auth0/auth0-ai-js",
  },
];

type Project = {
  name: string;
  href: string;
  org: string;
  tags: string;
  status: string;
  note: string;
  self?: boolean;
  links?: { label: string; href: string }[];
};

const tiers: { title: string; index: string; blurb: string; projects: Project[] }[] = [
  {
    index: "Tier 1",
    title: "Hyperscalers and major public companies",
    blurb:
      "The center of gravity. Between them these set the default policy languages and integration seams for the whole category.",
    projects: [
      {
        name: "OpenShell",
        href: "https://github.com/NVIDIA/OpenShell",
        org: "NVIDIA · reviewed September 29, 2026",
        tags: "Contain, Gate, Identity",
        status: "Available",
        note: "Runtime isolation, API/network policy and credential protection with a separate supervisor. Risky permission expansion receives review; custom business-action checks can use middleware. Part of Open Agent Safety Platform. Software availability is separate from Sentry hardware.",
        links: [{ label: "Architecture", href: "https://docs.nvidia.com/openshell/latest/about/architecture" }, { label: "Extension boundaries", href: "https://docs.nvidia.com/openshell/latest/extensibility/overview" }],
      },
      {
        name: "Sentry",
        href: "https://nvidianews.nvidia.com/news/open-agent-safety-platform",
        org: "NVIDIA · reviewed September 29, 2026",
        tags: "Contain, Monitor",
        status: "Reference design",
        note: "Announced September 28 as an independent watchdog on BlueField-4 DPUs. Describes identity checks, access policy and attested telemetry. Availability and performance claims require deployment-specific verification; not scored as generally available software or proof of business outcomes.",
        links: [{ label: "NVIDIA announcement", href: "https://nvidianews.nvidia.com/news/open-agent-safety-platform" }],
      },
      {
        name: "Agent Governance Toolkit",
        href: "https://github.com/microsoft/agent-governance-toolkit",
        org: "Microsoft",
        tags: "Gate",
        status: "Preview",
        note: "Intercepts every tool call, message and delegation pre-execution. Policy in YAML, Rego or Cedar; SDKs in five languages. The only at-scale implementation of monotonic delegation narrowing, on a proprietary did:mesh scheme. Approvals default to an in-memory queue.",
      },
      {
        name: "ContextForge",
        href: "https://github.com/IBM/mcp-context-forge",
        org: "IBM",
        tags: "Route, Gate",
        status: "Live",
        note: "The largest open-source gateway, GA since May 2026. A tool_pre_invoke plugin can block a call outright, so enforcement is real but plugin-authored: there is no built-in decision point yet.",
      },
      {
        name: "AP2",
        href: "https://github.com/google-agentic-commerce/AP2",
        org: "Google + FIDO",
        tags: "Receipt",
        status: "Draft spec, working code",
        note: "The counterexample to findings 3 and 4. SD-JWT mandates verified by merchant, PSP and credentials provider against actual cart parameters before settlement, with receipts binding authorization to execution to outcome. Payments only.",
      },
      {
        name: "Docker MCP Gateway",
        href: "https://github.com/docker/mcp-gateway",
        org: "Docker",
        tags: "Route, Gate",
        status: "Live",
        note: "Ships inside Docker Desktop. Real pre-execution blocking via a before-exec interceptor where a non-zero exit blocks the call, but you write the policy as a script.",
      },
      {
        name: "Cedar",
        href: "https://github.com/cedar-policy/cedar",
        org: "AWS, CNCF Sandbox",
        tags: "Engine",
        status: "Live",
        note: "Formally verified authorization language with Lean-proven semantics. The substrate under AgentCore Policy, Microsoft AGT, ToolHive and cMCP. Deliberately stateless.",
      },
      {
        name: "Invariant",
        href: "https://github.com/invariantlabs-ai/invariant",
        org: "Snyk",
        tags: "Gate, Validate",
        status: "Live",
        note: "Intercepting proxy evaluating contextual rules on tool calls both before and after execution. The clearest example of semantic, content-aware gating rather than identity or RBAC gating.",
      },
      {
        name: "Dogwood",
        href: "https://github.com/dogwood-policy/dogwood",
        org: "AWS",
        tags: "Engine",
        status: "Early as OSS, Live in AgentCore",
        note: "The most important recent development here, and the sharpest live-versus-theory case. Extends Cedar with temporal logic over prior events. The reference interpreter says it is not for production; the language ships in a GA AWS service.",
      },
    ],
  },
  {
    index: "Tier 2",
    title: "Foundation-governed",
    blurb:
      "Vendor-neutral governance, which matters when the thing you are adopting sits on the critical path of every agent action.",
    projects: [
      {
        name: "agentgateway",
        href: "https://github.com/agentgateway/agentgateway",
        org: "Linux Foundation / AAIF",
        tags: "Gate, Route",
        status: "Live",
        note: "Rust data plane for MCP, A2A and LLM traffic. CEL policy over MCP method invocations plus ext_authz delegation. Contributed by Solo.io to the Linux Foundation, not CNCF. 300+ contributors.",
      },
      {
        name: "Envoy AI Gateway",
        href: "https://github.com/envoyproxy/ai-gateway",
        org: "CNCF / Envoy",
        tags: "Gate, Route",
        status: "Live",
        note: "v1.0.0 in June 2026. Per-tool authorization policies matched on backend and tool name, filtered by JWT scopes with CEL. Under proposal to move to AAIF as Agent Router.",
      },
      {
        name: "Open Policy Agent",
        href: "https://github.com/open-policy-agent/opa",
        org: "CNCF, Graduated",
        tags: "Engine",
        status: "Live",
        note: "The reference general-purpose engine, used for agent authorization by embedding it as the decision point. Has no agent-native primitives.",
      },
      {
        name: "AuthZEN Authorization API 1.0",
        href: "https://openid.net/specs/authorization-api-1_0.html",
        org: "OpenID Foundation",
        tags: "Spec",
        status: "Live, Final Jan 2026",
        note: "The only mature open standard on the action-authorization side. It standardizes the question, not the risk model. Newer drafts targeting MCP tool authorization remain drafts.",
      },
    ],
  },
  {
    index: "Tier 3",
    title: "Funded private companies",
    blurb: "Where most of the practical, deployable per-tool enforcement lives today.",
    projects: [
      {
        name: "ToolHive",
        href: "https://github.com/stacklok/toolhive",
        org: "Stacklok",
        tags: "Gate",
        status: "Live",
        note: "The strongest per-tool authorization in open source. Cedar policies evaluate the call before it reaches the server, using tool arguments, JWT claims and MCP annotations such as readOnlyHint and destructiveHint as attributes. No approvals, no receipts.",
      },
      {
        name: "Teleport",
        href: "https://github.com/gravitational/teleport",
        org: "Teleport",
        tags: "Gate, Identity",
        status: "Live",
        note: "Allow and deny lists on MCP tools with globs and regex, enforced pre-execution. Mints a signed JWT the upstream verifies via JWKS, carrying identity claims only. AGPL-3.0 core.",
      },
      {
        name: "Pomerium",
        href: "https://github.com/pomerium/pomerium",
        org: "Pomerium",
        tags: "Gate, Identity",
        status: "Live",
        note: "An mcp_tool policy criterion matching tool names by exact, prefix, suffix or list, tied to user identity. Same signed-assertion pattern as Teleport, same identity-only limitation.",
      },
      {
        name: "LiteLLM",
        href: "https://github.com/BerriAI/litellm",
        org: "BerriAI",
        tags: "Route, Gate",
        status: "Live",
        note: "DB-backed budgets per key, user, team and customer with session-level caps, so it is one of the few places durable state actually lives. Two caveats: budgets fail open without a DB connection, and an open issue reports guardrail hooks never firing on the MCP path.",
      },
      {
        name: "Obot",
        href: "https://github.com/obot-platform/obot",
        org: "Obot AI",
        tags: "Gate, Route",
        status: "Live",
        note: "Filters are the real hook: an MCP filter server or HTTP webhook returns accept, reject or mutate per tool call before execution. The closest thing to a do-it-yourself approval queue.",
      },
      {
        name: "Auth0 AI SDKs",
        href: "https://github.com/auth0/auth0-ai-js",
        org: "Okta / Auth0",
        tags: "Identity, Gate",
        status: "Live, SDKs pre-1.0",
        note: "Asynchronous authorization via CIBA plus push notification is the most production-ready human-in-the-loop approval in the landscape.",
      },
      {
        name: "Clerk AgentPass",
        href: "https://github.com/clerk/agentpass",
        org: "Clerk",
        tags: "Identity",
        status: "Draft",
        note: "Short-lived, single-use, holder-bound passes scoped per task. Included for one sentence in its spec: ongoing action-level control remains the service's responsibility. Not security-audited, not for production. Unrelated to this project despite the name.",
      },
    ],
  },
  {
    index: "Tier 4",
    title: "Small companies",
    blurb: "Smaller teams, and where several of the more interesting ideas are being tried first.",
    projects: [
      {
        name: "nono",
        href: "https://github.com/always-further/nono",
        org: "always-further",
        tags: "Gate",
        status: "Early",
        note: "Capability-based agent runtime with fine-grained policies, Rust, 88 contributors. The largest project in this tier by a wide margin and under-covered relative to its size.",
      },
      {
        name: "open-edison",
        href: "https://github.com/Edison-Watch/open-edison",
        org: "Edison Watch",
        tags: "Gate",
        status: "Early",
        note: "Deny by default: unknown tools are rejected outright. Tracks the lethal trifecta of private data access, untrusted content and external comms across a session and blocks once all three are live. One of the few genuinely stateful risk models outside AWS. GPL-3.0.",
      },
      {
        name: "mcp-context-protector",
        href: "https://github.com/trailofbits/mcp-context-protector",
        org: "Trail of Bits",
        tags: "Gate",
        status: "Early",
        note: "Trust-on-first-use pinning of server config, blocking calls when tool descriptions change without approval. This is integrity enforcement, a distinct problem: it answers whether the tool changed, not whether this user may call it.",
      },
      {
        name: "MCP Guardian",
        href: "https://github.com/eqtylab/mcp-guardian",
        org: "EQTY Lab",
        tags: "Gate",
        status: "Dormant",
        note: "The clearest per-call human approve and deny implementation, and the evidence for finding 6: six releases, all between February and April 2025, nothing since.",
      },
      {
        name: "cMCP",
        href: "https://github.com/agentrust-io/cmcp",
        org: "AgentTrust.io",
        tags: "Gate, Receipt",
        status: "Early",
        note: "Evaluates Cedar policies inside a hardware TEE and emits attested claims, genuinely removing operator trust from the signing path. But the MCP server verifies nothing, and they say so. Well-engineered, essentially unadopted.",
      },
    ],
  },
  {
    index: "Tier 5",
    title: "Independent and solo-maintained",
    blurb:
      "Everything in this tier is early. Read the source before depending on any of it, including ours.",
    projects: [
      {
        name: "Pipelock",
        href: "https://github.com/luckyPipewrench/pipelock",
        org: "Independent",
        tags: "Gate, Receipt",
        status: "Early",
        note: "Capability separation: the agent holds secrets but no network, Pipelock has network but no secrets. Emits mediator-signed receipts verifiable offline with no account or server. Also the most honest artifact in this survey.",
      },
      {
        name: "Aegis",
        href: "https://github.com/Justin0504/Aegis",
        org: "Independent",
        tags: "Gate, Receipt",
        status: "Early",
        note: "The most complete single-project feature match to gating plus approvals plus receipts: SDK auto-patching across nine Python frameworks, HTTP and MCP stdio proxies, hash-chained audit with optional Ed25519 signing, kill switch. Backed by an academic paper. Single maintainer.",
      },
      {
        name: "permit0",
        href: "https://github.com/permit0-ai/permit0",
        org: "Independent",
        tags: "Gate, Receipt",
        status: "Early",
        note: "Not Permit.io; different org, no affiliation. Its whole thesis is pre-execution adjudication: risk scoring across nine dimensions, session-aware cross-call pattern detection, tier-based routing to human approval, ed25519 audit. Human reviewers can only narrow a decision, never widen it.",
      },
      {
        name: "agent-passport-system",
        href: "https://github.com/aeoess/agent-passport-system",
        org: "Independent",
        tags: "Identity, Gate, Receipt",
        status: "Early",
        note: "Narrowing-only delegation per hop, Ed25519 three-signature chains, cascade revocation, and the only project found putting idempotency at the authorization boundary. Conceptually the most complete design in this tier; its academic framing is self-published, not peer-reviewed.",
      },
      {
        name: "AgentAction",
        href: github,
        org: "Self-listed by the maintainer",
        tags: "Gate, Receipt, Identity",
        status: "Early, demos live",
        self: true,
        note: "Gates the exact tool call against policy, approvals, budgets, idempotency and data-flow rules, then issues a JWS authorization receipt with a public JWKS endpoint, plus Express and FastAPI middleware so a receiving service can verify authority before it mutates. Records the provider result and replays it on an identical retry instead of executing twice. Runs as a local TypeScript guard or a hosted runtime with approval queues and scoped single-use grants, and integrates behind Envoy ext_authz and agentgateway ExtMCP rather than replacing them. Solo-maintained and thinly adopted; the enterprise gateway direction on this site is product direction, not shipped.",
        links: [
          { label: "Refund and approval demo", href: "https://agentid-refund-demo.drisw.workers.dev/" },
          { label: "Production deploy demo", href: "https://agentid-devops-demo.drisw.workers.dev/" },
          { label: "npm: @dinpd/ai-agent-guard", href: "https://www.npmjs.com/package/@dinpd/ai-agent-guard" },
        ],
      },
    ],
  },
];

const standards: [string, string, string, string][] = [
  ["RFC 8693 Token Exchange", "IETF", "RFC", "Defines nested act delegation chains, and forbids using prior actors for access control"],
  ["RFC 9449 DPoP", "IETF", "RFC", "Proof of key possession. Covers HTTP method and URI only, not the request body"],
  ["RFC 9943 SCITT", "IETF", "RFC", "Append-only transparency over already-signed statements. Notarization, not a pre-execution gate"],
  ["AuthZEN Authorization API 1.0", "OpenID Foundation", "Final", "The enforcement-point to decision-point envelope. The only settled standard on the action side"],
  ["MCP authorization", "AAIF", "Live spec", "OAuth 2.1 profile at the transport layer. OPTIONAL, HTTP-only"],
  ["A2A 1.0", "Linux Foundation", "Live spec", "Agent interop. No identity primitive, no delegation semantics"],
  ["OAuth Identity Chaining (ID-JAG)", "IETF", "WG adopted, IESG approved", "Cross-trust-domain token exchange. Identity, not action"],
  ["Transaction Tokens", "IETF", "WG consensus, awaiting write-up", "Scoped to a single trust domain by design"],
  ["COSE Receipts", "IETF", "WG draft", "Merkle inclusion proofs. Proves this was logged, not this was authorized"],
  ["WIMSE workload identity", "IETF", "WG drafts, no RFC yet", "Architecture stabilizing, nothing normative shipped"],
  ["AP2", "Google + FIDO", "Draft, code works", "Payment mandates as verifiable credentials. The one place provider-side verification ships"],
  ["draft-chen agent authz use cases", "IETF", "Individual draft", "The grant-layer versus execution-layer gap analysis. Well argued, no standing"],
  ["draft-schrock EP authorization receipts", "IETF", "Individual draft", "Provider-verified action receipts with declared enforcement classes"],
  ["draft-niyikiza attenuating agent tokens", "IETF", "Individual draft, expires Sept 2026", "Capability narrowing across delegation hops"],
  ["draft-reece WIMSE cross-org delegation", "IETF", "Individual draft", "Explicitly a problem statement. States it does not specify a solution"],
  ["MCP Agent Identity WG", "AAIF", "Forming", "Chartered to address sub-agent authority narrowing"],
  ["Cloudflare Agent Access Model", "Cloudflare", "Concept", "Reference architecture. No implementation, no repository"],
];

// Maps a status string to a visual tone, so the column scans as a spectrum
// from "runs today" to "does not exist yet".
function toneFor(status: string): string {
  const value = status.toLowerCase();
  if (value === "available") return "live";
  if (value === "reference design") return "preview";
  if (value.includes("dormant")) return "dormant";
  if (value.includes("forming") || value.includes("concept")) return "concept";
  if (value.includes("individual draft")) return "concept";
  if (value.startsWith("early as oss")) return "mixed";
  if (value.startsWith("draft spec, working") || value.startsWith("draft, code")) return "mixed";
  if (value.includes("iesg approved")) return "preview";
  if (value.startsWith("live") || value === "rfc" || value === "final") return "live";
  if (value.startsWith("preview")) return "preview";
  if (value.startsWith("wg")) return "draft";
  if (value.startsWith("early")) return "early";
  if (value.startsWith("draft")) return "draft";
  return "early";
}

const choosing: [string, string][] = [
  [
    "Per-tool policy in front of MCP servers, in production now",
    "ToolHive for Cedar with tool arguments as attributes, or agentgateway for CEL under foundation governance",
  ],
  [
    "Policy across a mixed estate with SDKs in several languages",
    "Microsoft Agent Governance Toolkit, accepting preview status",
  ],
  [
    "Constraints over sequences, budgets, or session history",
    "Bedrock AgentCore Policy if you are on AWS. Otherwise you are assembling durable state yourself",
  ],
  [
    "Content validation of model input and output",
    "Guardrails AI, or NeMo Guardrails for conversational rails. Different layer from everything above",
  ],
  ["Runtime isolation and credential brokering", "OpenShell for the agent runtime; Docker MCP Gateway for containerized MCP servers. Verify each deployment boundary"],
  ["Protection against tool descriptions changing under you", "mcp-context-protector from Trail of Bits"],
  [
    "Human approval on individual calls",
    "Auth0 asynchronous authorization for application approval; OpenShell for permission expansion. Exact-action approval still needs explicit payload, expiry and replay semantics",
  ],
  [
    "A receiving service that must verify authority itself",
    "AP2 if the domain is payments. Otherwise this is an open problem and every project attempting it is early",
  ],
];

const openProblems = [
  "An interoperable, action-bound authorization receipt a receiving service can verify without a callback and without trusting the caller's infrastructure. AP2 demonstrates the shape; payments assumptions are baked into it.",
  "Execution closure, treating authorized, executed and outcome-achieved as three distinct claims linked by evidence rather than one log line.",
  "Cross-organizational delegation a relying party can verify recursively, which RFC 8693 currently instructs implementers not to attempt.",
  "Consistent approval semantics across runtimes: trusted approvers, durable state, expiry, payload binding and atomic consumption.",
  "Portable temporal policy and shared session semantics across independent infrastructure and providers.",
];

export default function LandscapePage() {
  return (
    <main className="landscape-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landscapeStructuredData) }}
      />
      <a className="skip-link" href="#landscape-content">
        Skip to content
      </a>

      <SiteHeader links={[
        { href: "/", label: "Project" },
        { href: "#governance-map", label: "Map" },
        { href: "#findings", label: "Findings" },
        { href: "#projects", label: "Projects" },
        { href: "#standards", label: "Standards" },
        { href: "/gateway", label: "Action gateway" },
      ]} />

      <section id="landscape-content" className="landscape-hero" aria-labelledby="landscape-title">
        <p className="eyebrow">Maintainer survey · Updated September 29, 2026</p>
        <h1 id="landscape-title">The AI agent governance landscape.</h1>
        <p className="landscape-lede">
          Agent identity, runtime isolation and action authorization solve different
          problems. Compare representative approaches by control focus and evidence,
          then explore the wider catalog by institutional backing. Availability,
          early implementations and proposals are labeled separately.
        </p>
        <p className="landscape-disclosure">
          Maintained by AgentAction, which is listed in the independent tier
          below. The capability map, NVIDIA entries and affected findings were
          reviewed September 29, 2026. Other catalog entries and figures retain
          their August 2026 baseline; they were not all reverified in this update.
          Inclusion is not endorsement and this is not a ranking.{" "}
          <a href={sourceDoc}>
            Source and revision history on GitHub <span aria-hidden="true">↗</span>
          </a>
        </p>

        <div className="landscape-legend" aria-label="Status legend">
          <h2>Status</h2>
          <p className="landscape-legend-lede">
            Maturity is separate from capability coverage. A reference design or
            early implementation should not be read as a production guarantee.
          </p>
          <div className="status-scale">
            <div className="status-scale-axis" aria-hidden="true">
              <span>Runs in production today</span>
              <span className="status-scale-rule" />
              <span>Draft or proposed</span>
            </div>
            <dl>
              {statusLegend.map(([term, detail]) => (
                <div key={term} className={`status-scale-item tone-${toneFor(term)}`}>
                  <dt>
                    <span className={`status-label status-${toneFor(term)}`}>{term}</span>
                  </dt>
                  <dd>{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <GovernanceMap />
      <CapabilityMap />

      <section id="findings" className="section-shell landscape-findings" aria-labelledby="findings-title">
        <div className="section-heading">
          <div>
            <p className="section-index">01 / What the survey found</p>
            <h2 id="findings-title">Six findings.</h2>
          </div>
        </div>
        <ol className="landscape-finding-list">
          {findings.map((finding) => (
            <li key={finding.index}>
              <span className="finding-index">{finding.index}</span>
              <div>
                <h3>{finding.title}</h3>
                <p>{finding.body}</p>
                <a className="finding-source" href={finding.source}>Source for this finding ↗</a>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="projects" className="section-shell landscape-projects" aria-labelledby="projects-title">
        <div className="section-heading">
          <div>
            <p className="section-index">02 / The projects</p>
            <h2 id="projects-title">Ordered by backing, not by preference.</h2>
          </div>
          <p>
            Wider catalog baseline: August 2026. NVIDIA entries reviewed
            September 29; the map above has its own dated evidence. Inclusion
            illustrates an approach, not a ranking.
          </p>
        </div>

        {tiers.map((tier) => (
          <div className="landscape-tier" key={tier.index}>
            <div className="landscape-tier-head">
              <p className="section-index">{tier.index}</p>
              <h3>{tier.title}</h3>
              <p>{tier.blurb}</p>
            </div>
            <div className="landscape-table" role="table" aria-label={`${tier.title} projects`}>
              <div className="landscape-row landscape-head" role="row">
                <span role="columnheader">Project</span>
                <span role="columnheader">Enforces</span>
                <span role="columnheader">Status</span>
                <span role="columnheader">Why it matters</span>
              </div>
              {tier.projects.map((project) => (
                <div
                  className={project.self ? "landscape-row landscape-row-self" : "landscape-row"}
                  role="row"
                  key={project.name}
                >
                  <span role="cell">
                    <a href={project.href}>{project.name}</a>
                    <em>{project.org}</em>
                  </span>
                  <span role="cell" className="landscape-tags">
                    {project.tags}
                  </span>
                  <span role="cell">
                    <span className={`status-label status-${toneFor(project.status)}`}>
                      {project.status}
                    </span>
                  </span>
                  <span role="cell" className="landscape-note">
                    {project.note}
                    {project.links ? (
                      <span className="landscape-try">
                        {project.links.map((link) => (
                          <a key={link.href} href={link.href}>
                            {link.label} <span aria-hidden="true">↗</span>
                          </a>
                        ))}
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <p className="landscape-aside">
          Model and conversation validation is a distinct, well-served category
          this survey does not try to cover. Guardrails AI is the most adopted,
          with NeMo Guardrails and Meta Purple Llama as the major vendor entries.
          They validate content. They do not authorize actions, have no identity
          model, and no receipt primitive. Comparing them head-to-head with
          anything above is a category error.
        </p>
      </section>

      <section id="standards" className="section-shell landscape-standards" aria-labelledby="standards-title">
        <div className="section-heading">
          <div>
            <p className="section-index">03 / Standards</p>
            <h2 id="standards-title">What is adopted, and what is one person&apos;s draft.</h2>
          </div>
          <p>
            IETF individual submissions are frequently quoted as though they were
            adopted work. Anyone can publish one, they expire after six months,
            and several of the most-cited here are written by parties selling an
            implementation.
          </p>
        </div>
        <div className="landscape-table standards-table" role="table" aria-label="Standards status">
          <div className="landscape-row landscape-head" role="row">
            <span role="columnheader">Document</span>
            <span role="columnheader">Body</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">What it actually is</span>
          </div>
          {standards.map(([doc, body, status, detail]) => (
            <div className="landscape-row" role="row" key={doc}>
              <span role="cell">
                <strong>{doc}</strong>
              </span>
              <span role="cell" className="landscape-tags">
                {body}
              </span>
              <span role="cell">
                <span className={`status-label status-${toneFor(status)}`}>
                  {status}
                </span>
              </span>
              <span role="cell" className="landscape-note">
                {detail}
              </span>
            </div>
          ))}
        </div>
        <p className="compatibility-note">
          The pattern is hard to miss: everything settled is about identity and
          transport, everything about action-bound authority is an individual
          draft or a concept.
        </p>
      </section>

      <section className="section-shell landscape-conclusion" aria-labelledby="conclusion-title">
        <div className="section-heading">
          <div>
            <p className="section-index">04 / Conclusion</p>
            <h2 id="conclusion-title">Gating became table stakes. Evidence did not.</h2>
          </div>
          <p>
            At the start of 2026, a policy check in front of the tool call was a
            differentiator. It is now a feature of Microsoft&apos;s toolkit, of
            every serious MCP gateway, of two identity-aware proxies, and of a
            managed AWS service.
          </p>
        </div>
        <div className="landscape-conclusion-body">
          <p>
            Cedar and CEL have emerged as the default policy languages, ext_authz
            as the default integration seam, and per-tool authorization tied to
            JWT claims as the default shape. Anyone building here should assume
            the enforcement layer is commoditizing and plan accordingly. The
            stateful layer moved in August 2026, and the underlying temporal-logic
            research is fifteen years old and well understood. Expect it to
            spread.
          </p>
          <p>
            Evidence requires a more specific comparison than the presence of
            logs. NVIDIA describes attested telemetry; AP2 carries payment
            mandates and receipts; early projects including AgentAction connect
            scoped authority to execution and outcome evidence. These are
            different guarantees. Check payload binding, trusted issuers,
            independent observations and failure recovery before treating any
            one of them as proof that an authorized task succeeded.
          </p>
          <p className="landscape-pullquote">
            The industry has largely solved &ldquo;may this agent connect,&rdquo;
            is rapidly solving &ldquo;may this call proceed,&rdquo; and has
            barely started on &ldquo;can anyone else prove what was authorized
            and what actually happened.&rdquo;
          </p>
        </div>

        <div className="landscape-choosing">
          <h3>Choosing something today</h3>
          <dl>
            {choosing.map(([need, answer]) => (
              <div key={need}>
                <dt>{need}</dt>
                <dd>{answer}</dd>
              </div>
            ))}
          </dl>
          <p className="compatibility-note">
            The useful question is rarely which tool is best, it is which layer
            you are missing. Several of these compose cleanly, and the most
            common mistake in this category is buying a second thing that does
            what the first thing already did.
          </p>
        </div>

        <div className="landscape-problems">
          <h3>What would close the gaps</h3>
          <ol>
            {openProblems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ol>
          <p className="compatibility-note">
            None of these are blocked on invention. They are blocked on someone
            building the boring, interoperable version and enough parties
            agreeing to verify it.
          </p>
        </div>
      </section>

      <section className="closing landscape-closing" aria-labelledby="landscape-closing-title">
        <p className="eyebrow">Corrections welcome</p>
        <h2 id="landscape-closing-title">
          If your project is missing or mischaracterized, tell us.
        </h2>
        <div className="hero-actions">
          <a className="button button-primary" href={`${github}/issues/new?title=%5BLandscape%5D%20`}>
            Open an issue <span aria-hidden="true">↗</span>
          </a>
          <a className="button button-secondary" href={sourceDoc}>
            Read the source document <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>

      <footer>
        <Brand href="/" footer />
        <p>Action authorization and execution assurance for AI agents.</p>
        <div className="footer-links">
          <a href={github}>GitHub</a>
          <a href={`${github}/blob/main/LICENSE`}>Apache-2.0</a>
          <a href={`${github}/blob/main/SUPPORT.md`}>Support</a>
        </div>
      </footer>
    </main>
  );
}
