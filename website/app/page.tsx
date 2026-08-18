import Link from "next/link";

const github = "https://github.com/dinpd/AgentPass";

const gatewayCapabilities = [
  {
    title: "Route intelligently",
    copy: "Select an approved, cost-effective model for the task, risk, privacy boundary, and company policy.",
  },
  {
    title: "Apply corporate policy",
    copy: "Control models, providers, tools, destinations, sensitive data, budgets, and versioned system context.",
  },
  {
    title: "Execute once",
    copy: "Deduplicate consequential actions and replay the original provider result for an identical safe retry.",
  },
  {
    title: "Prove what happened",
    copy: "Correlate routing, authorization, approval, execution, replay, observation, and assessment evidence.",
  },
];

const lifecycle = [
  {
    step: "01",
    title: "Propose",
    detail: "The agent proposes one concrete tool call and payload.",
  },
  {
    step: "02",
    title: "Establish context",
    detail: "A trusted runtime supplies identity, job, state, and approval facts.",
  },
  {
    step: "03",
    title: "Authorize",
    detail: "Policy and durable state return allow, deny, or challenge.",
  },
  {
    step: "04",
    title: "Execute",
    detail: "The provider verifies the exact-action authority and applies its own rules.",
  },
  {
    step: "05",
    title: "Assure",
    detail: "Receipts and observations preserve what happened and how it was assessed.",
  },
];

const proof = [
  {
    state: "Available now",
    title: "Runtime action control",
    copy: "Local and hosted checks for exact tool calls, approvals, amount caps, budgets, circuit breakers, sensitive-data movement, idempotency, and replay protection.",
  },
  {
    state: "Available now",
    title: "Provider-verifiable authority",
    copy: "Signed, action-bound authorization receipts, public verification keys, provider middleware, contracts, fixtures, and negative conformance cases.",
  },
  {
    state: "Available now",
    title: "Execution assurance",
    copy: "Linked execution receipts, immutable evidence snapshots, verified observations, versioned intent contracts, and outcome assessments.",
  },
  {
    state: "Roadmap",
    title: "Causal observability",
    copy: "Richer OpenTelemetry correlation across runs, boundary decisions, tool calls, retries, provider execution, observations, and assessment evidence.",
  },
  {
    state: "Roadmap",
    title: "Monotonic task authority",
    copy: "Task-scoped capability state that can remove incompatible authority after protected events without silently expanding what an agent may do.",
  },
  {
    state: "External proof target",
    title: "Independent interoperability",
    copy: "Two independent providers passing the same public action-authorization cases without project-specific runtime coordination.",
  },
];

const audiences = [
  {
    title: "Agent developers",
    copy: "Wrap consequential tool calls with a small authorization boundary inside an existing agent loop.",
  },
  {
    title: "Platform and gateway teams",
    copy: "Apply consistent action policy before forwarding MCP tools/call or other privileged operations.",
  },
  {
    title: "API and SaaS providers",
    copy: "Verify action-specific enterprise authority before mutation, then apply provider business authorization.",
  },
  {
    title: "Security and assurance teams",
    copy: "Connect proposals, approvals, decisions, execution, observations, and assessments without trusting the model as the record of truth.",
  },
];

const trustRows = [
  ["Agent output", "Untrusted proposal", "Never treated as authority by itself"],
  ["Identity and job context", "Verified input", "Derived by the trusted runtime or gateway"],
  ["Policy and prior state", "Enforcement input", "Held outside prompts and agent-editable memory"],
  ["Authorization receipt", "Portable evidence", "Bound to the exact action, audience, and decision"],
  ["Execution and outcome", "Independent evidence", "Kept distinct from the authorization decision"],
];

export default function Home() {
  return (
    <main>
      <a className="skip-link" href="#content">
        Skip to content
      </a>

      <header className="site-header">
        <a className="brand" href="#top" aria-label="AgentAction home">
          <img className="brand-mark" src="/logo.png" alt="" width="36" height="36" />
          <span>AgentAction</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#architecture">Architecture</a>
          <Link href="/gateway">Gateway</Link>
          <a href="#proof">Project status</a>
          <a href="#community">Community</a>
          <a className="nav-cta" href={github}>
            GitHub <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>

      <div id="top" className="transition-note" role="note">
        <span className="note-label">Project transition</span>
        <p>
          AgentAction is the public brand for AgentPass. Existing package names,
          schemas, commands, and repository links remain compatible while the
          project migrates.
        </p>
      </div>

      <section id="content" className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">Open-source action control for AI agents</p>
          <h1 id="hero-title">
            Control the action.
            <span>Prove what happened.</span>
          </h1>
          <p className="hero-lede">
            AgentAction is an action-authorization and execution-assurance layer
            outside the agent loop. It decides whether a specific tool call may
            execute now—and preserves independently verifiable evidence of what
            was authorized and executed.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href={`${github}#quick-start`}>
              Try the guard <span aria-hidden="true">↗</span>
            </a>
            <a className="button button-secondary" href="#architecture">
              See the boundary <span aria-hidden="true">↓</span>
            </a>
          </div>
          <ul className="hero-signals" aria-label="Project properties">
            <li>Apache-2.0</li>
            <li>Model-agnostic</li>
            <li>MCP-aware</li>
            <li>Fail-closed controls</li>
          </ul>
        </div>

        <div className="decision-console" aria-label="Example AgentAction authorization decision">
          <div className="console-header">
            <span>action.request</span>
            <span className="live-indicator">boundary active</span>
          </div>
          <div className="console-body">
            <div className="code-line">
              <span className="line-key">tool</span>
              <span>stripe.refund</span>
            </div>
            <div className="code-line">
              <span className="line-key">resource</span>
              <span>payment/pi_123</span>
            </div>
            <div className="code-line">
              <span className="line-key">amount</span>
              <span>$1,200.00</span>
            </div>
            <div className="code-line">
              <span className="line-key">job</span>
              <span>case-1042</span>
            </div>
            <div className="decision-rule" aria-hidden="true" />
            <div className="decision-result">
              <span className="decision-word">DENY</span>
              <p>Amount exceeds the $100 policy maximum.</p>
            </div>
            <div className="receipt-row">
              <span>decision_id</span>
              <code>dec_01JAA4…A91C</code>
            </div>
          </div>
          <div className="console-footer">
            The model proposes. The boundary decides.
          </div>
        </div>
      </section>

      <section className="thesis" aria-labelledby="thesis-title">
        <p className="section-index">01 / The gap</p>
        <div>
          <h2 id="thesis-title">Identity tells you who. AgentAction decides whether this action should run.</h2>
          <p>
            OAuth can establish access to a server. IAM can assign roles and
            entitlements. Tool schemas can describe available operations. None
            of those alone answers whether this exact payload, in this job state,
            with this approval and prior history, may execute right now.
          </p>
        </div>
      </section>

      <section id="architecture" className="architecture section-shell" aria-labelledby="architecture-title">
        <div className="section-heading">
          <div>
            <p className="section-index">02 / The action boundary</p>
            <h2 id="architecture-title">One controlled lifecycle, end to end.</h2>
          </div>
          <p>
            Authorization is not the same as execution, and an allow decision is
            not proof of a successful outcome. AgentAction links the lifecycle
            without collapsing those claims together.
          </p>
        </div>

        <ol className="lifecycle">
          {lifecycle.map((item) => (
            <li key={item.step}>
              <span className="lifecycle-step">{item.step}</span>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
            </li>
          ))}
        </ol>

        <div className="boundary-callout">
          <div className="boundary-label">Trusted action boundary</div>
          <code>
            proposed → authorized → executed → observed → assessed
          </code>
        </div>
      </section>

      <section id="gateway" className="gateway-entry section-shell" aria-labelledby="gateway-entry-title">
        <div className="section-heading">
          <div>
            <p className="section-index">03 / Deploy the boundary</p>
            <h2 id="gateway-entry-title">One governed endpoint for enterprise AI.</h2>
          </div>
          <div className="gateway-entry-copy">
            <p>
              Route model and tool traffic through company policy. Use the least
              expensive qualified model, stop unsafe or duplicate actions, and
              preserve evidence from selection through execution.
            </p>
            <Link className="text-link" href="/gateway">
              Explore the Gateway <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        <div className="gateway-capability-grid">
          {gatewayCapabilities.map((capability, index) => (
            <article key={capability.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{capability.title}</h3>
              <p>{capability.copy}</p>
            </article>
          ))}
        </div>

        <div className="gateway-status-strip" aria-label="Gateway capability status">
          <div>
            <span className="status-label status-current">Available now</span>
            <p>Action decisions, approvals, data-flow controls, safe replay, signed receipts, and MCP reference integration.</p>
          </div>
          <div>
            <span className="status-label">Product direction</span>
            <p>Production gateway packaging, risk-aware inference routing, managed company context, and broader protocol coverage.</p>
          </div>
        </div>
      </section>

      <section className="trust section-shell" aria-labelledby="trust-title">
        <div className="section-heading compact">
          <div>
            <p className="section-index">04 / Trust model</p>
            <h2 id="trust-title">The agent never becomes its own authority.</h2>
          </div>
          <p>
            Security facts come from authenticated systems and durable state,
            not from conversation text or agent-editable memory.
          </p>
        </div>
        <div className="trust-table" role="table" aria-label="AgentAction trust model">
          <div className="trust-row trust-head" role="row">
            <span role="columnheader">Signal</span>
            <span role="columnheader">Posture</span>
            <span role="columnheader">Boundary rule</span>
          </div>
          {trustRows.map(([signal, posture, rule]) => (
            <div className="trust-row" role="row" key={signal}>
              <strong role="cell">{signal}</strong>
              <span role="cell">{posture}</span>
              <span role="cell">{rule}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="proof" className="proof section-shell" aria-labelledby="proof-title">
        <div className="section-heading">
          <div>
            <p className="section-index">05 / Proof, not promises</p>
            <h2 id="proof-title">What exists—and what comes next.</h2>
          </div>
          <p>
            AgentAction labels experimental work and roadmap items plainly. The
            public repository, runnable examples, fixtures, and tests are the
            source of truth.
          </p>
        </div>
        <div className="proof-grid">
          {proof.map((item) => (
            <article key={item.title} className={item.state === "Available now" ? "is-current" : "is-roadmap"}>
              <p className="proof-state">{item.state}</p>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="quickstart section-shell" aria-labelledby="quickstart-title">
        <div className="quickstart-copy">
          <p className="section-index">06 / Developer entry point</p>
          <h2 id="quickstart-title">Put policy around the side effect.</h2>
          <p>
            Start with the published TypeScript guard. The existing AgentPass
            package name remains during the brand migration.
          </p>
          <a className="text-link" href={`${github}/tree/main/packages/guard`}>
            Open the guard package <span aria-hidden="true">↗</span>
          </a>
        </div>
        <div className="code-panel" aria-label="AgentAction TypeScript quickstart">
          <div className="code-panel-header">
            <span>agent-loop.ts</span>
            <span>TypeScript</span>
          </div>
          <pre>
            <code>{`import { createToolGate } from
  "@dinpd/ai-agent-guard";

const gate = createToolGate({ policy });

const result = await gate.run({
  agentId: "support-agent",
  jobId: "case-1042",
  tool: "stripe.refund",
  resource: "payment/pi_123",
  amountUsd: 49,
  idempotencyKey: "refund-1042-pi_123"
}, executeRefund);

if (!result.executed) {
  return result.decision;
}`}</code>
          </pre>
        </div>
      </section>

      <section className="audiences section-shell" aria-labelledby="audiences-title">
        <div className="section-heading compact">
          <div>
            <p className="section-index">07 / One boundary, four entry points</p>
            <h2 id="audiences-title">Meet the project where you build.</h2>
          </div>
        </div>
        <div className="audience-grid">
          {audiences.map((audience, index) => (
            <article key={audience.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{audience.title}</h3>
              <p>{audience.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="community" className="community section-shell" aria-labelledby="community-title">
        <div className="community-copy">
          <p className="section-index">08 / Open standards posture</p>
          <h2 id="community-title">Build interoperability before vocabulary.</h2>
          <p>
            AgentAction reuses established identity, policy, transport, signing,
            and provenance work where it fits. The project contributes mappings,
            negative fixtures, reference verifiers, conformance cases, and
            narrowly scoped experimental profiles. Its community drafts are not
            adopted standards or external certifications.
          </p>
        </div>
        <div className="community-links">
          <a href={`${github}/tree/main/docs/proposals`}>
            <span>Community RFCs</span>
            <span aria-hidden="true">↗</span>
          </a>
          <a href={`${github}/blob/main/CONTRIBUTING.md`}>
            <span>Contributing guide</span>
            <span aria-hidden="true">↗</span>
          </a>
          <a href={`${github}/blob/main/GOVERNANCE.md`}>
            <span>Project governance</span>
            <span aria-hidden="true">↗</span>
          </a>
          <a href={`${github}/blob/main/SECURITY.md`}>
            <span>Security policy</span>
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>

      <section className="closing" aria-labelledby="closing-title">
        <p className="eyebrow">The action is the unit of control.</p>
        <h2 id="closing-title">Help define a portable boundary for trusted agent action.</h2>
        <div className="hero-actions">
          <a className="button button-primary" href={github}>
            Explore AgentAction on GitHub <span aria-hidden="true">↗</span>
          </a>
          <a className="button button-secondary" href={`${github}/issues`}>
            Join the discussion <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>

      <footer>
        <div className="brand footer-brand">
          <span className="brand-mark" aria-hidden="true">AA</span>
          <span>AgentAction</span>
        </div>
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
