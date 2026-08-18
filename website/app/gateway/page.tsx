import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "../brand";

const github = "https://github.com/dinpd/AgentPass";
const designPartner = `${github}/issues/new?template=feature_request.yml&title=%5BGateway%20pilot%5D%20`;

export const metadata: Metadata = {
  title: { absolute: "AgentAction Gateway — Govern model and tool traffic" },
  description:
    "Route enterprise AI through one governed endpoint for cost-aware model selection, corporate policy, safe action replay, and execution evidence.",
  alternates: { canonical: "https://agentaction.dev/gateway" },
  openGraph: {
    type: "website",
    url: "https://agentaction.dev/gateway",
    title: "AgentAction Gateway — One governed endpoint for enterprise AI",
    description:
      "Route intelligently, enforce company policy, execute consequential actions once, and prove what happened.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "AgentAction — Control the action. Prove what happened.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AgentAction Gateway — One governed endpoint for enterprise AI",
    description:
      "Route intelligently, enforce company policy, execute consequential actions once, and prove what happened.",
    images: ["/og.png"],
  },
};

const capabilities = [
  {
    title: "Risk-aware routing",
    copy: "Choose the least expensive approved model that meets task, quality, tool-use, privacy, region, and risk requirements.",
    status: "Product direction",
  },
  {
    title: "Company policy",
    copy: "Apply provider, model, tool, resource, destination, data, budget, and versioned system-context controls from one governance plane.",
    status: "Foundation available",
  },
  {
    title: "Safe action replay",
    copy: "Bind idempotency to the exact request and return the prior provider result without repeating a refund, send, write, or deploy.",
    status: "Available now",
  },
  {
    title: "Action evidence",
    copy: "Link selection, authorization, approval, execution, replay, observation, and assessment without treating model output as authority.",
    status: "Available now",
  },
];

const onboarding = [
  ["Connect", "Bring an enterprise identity provider and existing model or tool credentials."],
  ["Observe", "Discover models, tools, costs, data flows, repeated calls, and consequential actions without blocking traffic."],
  ["Apply policy", "Start from a company baseline, then scope stricter rules to teams, workflows, models, tools, and destinations."],
  ["Enforce", "Challenge or deny high-risk actions, route eligible work, and export correlated evidence."],
];

const standardsNow = [
  ["Model interfaces", "OpenAI Responses and Chat Completions; Anthropic Messages"],
  ["Agent tools", "MCP 2026-07-28 with versioned compatibility"],
  ["Identity and access", "OAuth, OpenID Connect, and MCP authorization"],
  ["Policy decisions", "OpenID AuthZEN Authorization API 1.0"],
  ["Telemetry", "W3C Trace Context and OpenTelemetry GenAI conventions"],
  ["Evidence", "JOSE JWS/JWKS, canonical request digests, and stable correlation"],
  ["Enforcement seams", "Envoy external authorization and agentgateway ExtMCP processors"],
];

const standardsNext = [
  ["A2A 1.0", "Agent-to-agent delegation and task governance"],
  ["WIMSE and SPIFFE", "Executing workload identity across trust domains"],
  ["ID-JAG and transaction tokens", "Downscoped human, agent, and transaction context"],
  ["Shared Signals", "Revocation, risk change, and kill-switch propagation"],
  ["Gateway API Inference Extension", "Customer-managed and self-hosted model routing"],
  ["SCITT and COSE Receipts", "Optional transparency for durable evidence"],
];

export default function GatewayPage() {
  return (
    <main className="gateway-page">
      <a className="skip-link" href="#gateway-content">
        Skip to content
      </a>

      <header className="site-header">
        <Brand href="/" />
        <nav aria-label="Primary navigation">
          <Link href="/">Project</Link>
          <a href="#workflow">How it works</a>
          <a href="#compatibility">Compatibility</a>
          <a className="nav-cta" href={github}>
            GitHub <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>

      <section id="gateway-content" className="gateway-hero" aria-labelledby="gateway-title">
        <div>
          <p className="eyebrow">Enterprise gateway product direction</p>
          <h1 id="gateway-title">One governed endpoint for enterprise AI.</h1>
          <p className="gateway-hero-lede">
            Route each request to an approved, cost-effective model. Apply company
            policy before sensitive data leaves or tools execute. Retry safely
            without repeating side effects. Preserve evidence end to end.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href={designPartner}>
              Discuss a gateway pilot <span aria-hidden="true">↗</span>
            </a>
            <a className="button button-secondary" href="#status">
              See what exists today <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>

        <div className="gateway-route-card" aria-label="Gateway request path">
          <div className="gateway-route-header">
            <span>agentaction.gateway</span>
            <span className="live-indicator">policy attached</span>
          </div>
          <div className="gateway-route-lane">
            <span className="route-tag">MODEL</span>
            <div>
              <strong>Classify → constrain → route</strong>
              <p>Approved provider · qualified model · budget · company context</p>
            </div>
          </div>
          <div className="gateway-route-lane">
            <span className="route-tag route-action">ACTION</span>
            <div>
              <strong>Authorize → execute once → assure</strong>
              <p>Exact payload · approval · durable state · provider evidence</p>
            </div>
          </div>
          <div className="gateway-route-footer">
            <span>One job context</span>
            <span>Two independently controlled paths</span>
          </div>
        </div>
      </section>

      <section className="gateway-value-band" aria-labelledby="gateway-problem-title">
        <p className="section-index">01 / The enterprise gap</p>
        <div>
          <h2 id="gateway-problem-title">Inference control is not action authority.</h2>
          <p>
            Model gateways optimize cost and availability. IAM controls access.
            AgentAction adds the missing runtime decision for the exact tool call,
            payload, job state, approval, data boundary, and prior execution.
          </p>
        </div>
      </section>

      <section className="section-shell gateway-capabilities" aria-labelledby="capabilities-title">
        <div className="section-heading compact">
          <div>
            <p className="section-index">02 / Product promise</p>
            <h2 id="capabilities-title">Route efficiently. Act deliberately.</h2>
          </div>
          <p>
            The gateway packages the AgentAction boundary for enterprise adoption.
            It does not turn prompts into security policy or replace provider-side authorization.
          </p>
        </div>
        <div className="gateway-product-grid">
          {capabilities.map((capability) => (
            <article key={capability.title}>
              <span className={capability.status === "Available now" ? "status-label status-current" : "status-label"}>
                {capability.status}
              </span>
              <h3>{capability.title}</h3>
              <p>{capability.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="workflow" className="section-shell gateway-workflow" aria-labelledby="workflow-title">
        <div className="section-heading compact">
          <div>
            <p className="section-index">03 / Company onboarding</p>
            <h2 id="workflow-title">Observe first. Enforce with evidence.</h2>
          </div>
          <p>
            Start with one team, one workflow, and one consequential action class.
            Expand only after the policy and operating evidence are understood.
          </p>
        </div>
        <ol className="gateway-onboarding">
          {onboarding.map(([title, copy], index) => (
            <li key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section-shell gateway-deployment" aria-labelledby="deployment-title">
        <div className="section-heading compact">
          <div>
            <p className="section-index">04 / Deployment</p>
            <h2 id="deployment-title">Use the boundary where your traffic already flows.</h2>
          </div>
        </div>
        <div className="deployment-grid">
          <article>
            <h3>Managed gateway</h3>
            <p>A hosted enterprise endpoint with tenant policy, durable state, approvals, and evidence.</p>
          </article>
          <article>
            <h3>Customer-controlled runtime</h3>
            <p>Run the enforcement data plane in a customer cloud or VPC while using a shared governance plane.</p>
          </article>
          <article>
            <h3>Existing gateway integration</h3>
            <p>Connect AgentAction as the decision and evidence service behind an MCP, API, or inference gateway.</p>
          </article>
        </div>
      </section>

      <section id="status" className="section-shell gateway-status" aria-labelledby="status-title">
        <div className="section-heading compact">
          <div>
            <p className="section-index">05 / Proof, not promises</p>
            <h2 id="status-title">The boundary exists. The product surface is next.</h2>
          </div>
          <p>
            Public code, fixtures, and tests remain the source of truth. Planned
            gateway capabilities stay labeled until an end-to-end demonstration exists.
          </p>
        </div>
        <div className="gateway-status-columns">
          <article className="is-current">
            <span className="status-label status-current">Available now</span>
            <ul>
              <li>Hosted authorization, approvals, JIT grants, and tenant manifests</li>
              <li>PII and destination controls</li>
              <li>Idempotent provider-result replay</li>
              <li>Signed provider receipts and middleware</li>
              <li>MCP reference adapter and local guard mode</li>
            </ul>
          </article>
          <article>
            <span className="status-label">Product direction</span>
            <ul>
              <li>Production gateway packaging and lifecycle</li>
              <li>Risk-aware inference routing and evaluation</li>
              <li>Managed, versioned company system context</li>
              <li>Customer-controlled deployment options</li>
              <li>Broader model, MCP, and agent-protocol compatibility</li>
            </ul>
          </article>
        </div>
      </section>

      <section id="compatibility" className="section-shell gateway-compatibility" aria-labelledby="compatibility-title">
        <div className="section-heading">
          <div>
            <p className="section-index">06 / Compatibility</p>
            <h2 id="compatibility-title">Reuse the standards enterprises already trust.</h2>
          </div>
          <p>
            AgentAction profiles established interfaces before proposing new vocabulary.
            Emerging work is tracked without presenting drafts as adopted standards.
          </p>
        </div>
        <div className="compatibility-columns">
          <div>
            <h3>Launch compatibility</h3>
            <dl>
              {standardsNow.map(([term, detail]) => (
                <div key={term}>
                  <dt>{term}</dt>
                  <dd>{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <h3>Design compatibility</h3>
            <dl>
              {standardsNext.map(([term, detail]) => (
                <div key={term}>
                  <dt>{term}</dt>
                  <dd>{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <p className="compatibility-note">
          Compatibility describes an implementation target, not certification by
          OpenID, IETF, W3C, CNCF, the MCP project, A2A, or Kubernetes.
        </p>
      </section>

      <section className="closing gateway-closing" aria-labelledby="gateway-closing-title">
        <p className="eyebrow">Start with one consequential workflow.</p>
        <h2 id="gateway-closing-title">Help shape the enterprise action gateway.</h2>
        <div className="hero-actions">
          <a className="button button-primary" href={designPartner}>
            Discuss a gateway pilot <span aria-hidden="true">↗</span>
          </a>
          <a className="button button-secondary" href={`${github}/blob/main/docs/action-gate-roadmap.md`}>
            Read the roadmap <span aria-hidden="true">↗</span>
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
