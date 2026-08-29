import Link from "next/link";
import { Brand } from "./brand";
import { ProjectInquiryForm } from "./project-inquiry-form";

const github = "https://github.com/dinpd/AgentAction";
const observerQuickStart = `${github}#recommended-observe-an-mcp-workflow`;

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
    title: "Declare intent",
    detail: "The agent declares the goal, proposed action, and relevant context.",
  },
  {
    step: "02",
    title: "Assure the decision",
    detail: "Decision evidence is checked for justification, uncertainty, and safer alternatives.",
  },
  {
    step: "03",
    title: "Enforce policy",
    detail: "Identity, policy, approvals, and durable state return allow, deny, or challenge.",
  },
  {
    step: "04",
    title: "Execute",
    detail: "The provider verifies the exact-action authority and applies its own rules.",
  },
  {
    step: "05",
    title: "Preserve evidence",
    detail: "Receipts and verified observations record what was authorized and what occurred.",
  },
  {
    step: "06",
    title: "Evaluate continuously",
    detail: "Immutable assessments feed assurance signals across runs, profiles, and versions.",
  },
];

const assuranceModules = [
  {
    state: "Foundation available",
    title: "Agent Evaluation",
    copy: "Define versioned intent profiles, run synthetic scenarios, and aggregate profile-scoped assurance signals before wider deployment.",
    signal: "Profiles · synthetic runs · quality rollups",
    note: "Packaged certification workflows are a product direction, not an external certification claim.",
  },
  {
    state: "Available now",
    title: "Decision Assurance",
    copy: "Assess the declared basis for a consequential choice: policy factors, alternatives, assumptions, uncertainty, and supporting evidence.",
    signal: "Decision evidence → allow · deny · challenge",
    note: "Uses normalized decision evidence—not private chain-of-thought or hidden model reasoning.",
  },
  {
    state: "Available now",
    title: "Action Authorization",
    copy: "Gate the exact tool call against policy and prior state, then issue action-bound authority that providers can verify.",
    signal: "Tool call → policy → signed receipt",
    note: "Deploy locally today or connect the decision and evidence service behind a gateway.",
  },
];

const permissionRows = [
  ["User identity", "Agent identity and workload context"],
  ["Role permissions", "Contextual, action-specific authorization"],
  ["API access", "Autonomous decision assurance"],
  ["Activity logs", "Verifiable receipts and observations"],
  ["Periodic audits", "Continuous, versioned assurance"],
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

const transitionStages = [
  {
    step: "01",
    mode: "Frame",
    title: "Frame the job",
    copy: "Define one bounded workflow, its owner, value, risk, consequential actions, and human baseline.",
    question: "Is the job, owner, value, risk, and human baseline clear?",
  },
  {
    step: "02",
    mode: "Prove offline",
    title: "Prove behavior",
    copy: "Test historical, edge, adversarial, and failure cases before the agent touches production traffic.",
    question: "Does the agent meet quality and safety thresholds on representative cases?",
  },
  {
    step: "03",
    mode: "Shadow",
    title: "Shadow production",
    copy: "Record counterfactual decisions on representative traffic without duplicating or changing side effects.",
    question: "What would happen on real traffic if policy were enforced?",
  },
  {
    step: "04",
    mode: "Supervise",
    title: "Supervise actions",
    copy: "Bind approval and short-lived authority to the exact actor, job, tool, resource, and payload.",
    question: "Can exact actions execute safely with approval and recovery controls?",
  },
  {
    step: "05",
    mode: "Bound and scale",
    title: "Scale the proven envelope",
    copy: "Automate only earned action classes; keep exceptions, missing context, and high-impact work supervised.",
    question: "Which actions can run autonomously without exceeding the risk envelope?",
  },
];

export default function Home() {
  return (
    <main>
      <a className="skip-link" href="#content">
        Skip to content
      </a>

      <header className="site-header">
        <Brand href="#top" />
        <nav aria-label="Primary navigation">
          <a href="#platform">Platform</a>
          <a href="#architecture">Decision assurance</a>
          <a href="#proof">Audit &amp; receipts</a>
          <a href="#observe">Start here</a>
          <span className="nav-divider" aria-hidden="true" />
          <Link className="nav-page" href="/gateway">Action gateway</Link>
          <Link className="nav-page" href="/landscape">Landscape</Link>
          <a className="nav-cta" href={github}>
            GitHub <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>

      <div id="top" className="transition-note" role="note">
        <span className="note-label">Compatibility</span>
        <p>
          AgentAction is the canonical project brand. Versioned protocol
          identifiers and the legacy command names remain compatible for existing
          integrations.
        </p>
      </div>

      <section id="content" className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">Trust infrastructure for autonomous AI agents</p>
          <h1 id="hero-title">
            Give agents permission to act.
            <span>Prove the decision was justified.</span>
          </h1>
          <p className="hero-lede">
            AgentAction is the trust layer between autonomous agents and
            enterprise systems. Evaluate decisions, enforce policies, authorize
            actions, and preserve verifiable evidence from intent through
            execution—without inspecting hidden chain-of-thought.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href={observerQuickStart}>
              Observe an MCP workflow <span aria-hidden="true">↗</span>
            </a>
            <a className="button button-secondary" href="#architecture">
              See the trust lifecycle <span aria-hidden="true">↓</span>
            </a>
          </div>
          <p className="hero-onboarding">
            Recommended onboarding: run the customer-controlled adapter in
            passive observe mode, learn from counterfactual findings, then
            choose when to enforce.
          </p>
          <ul className="hero-signals" aria-label="Project properties">
            <li>Apache-2.0</li>
            <li>Model-agnostic</li>
            <li>MCP-aware</li>
            <li>Fail-closed controls</li>
          </ul>
        </div>

        <div className="decision-console" aria-label="Example AgentAction decision assurance challenge">
          <div className="console-header">
            <span>decision.assess</span>
            <span className="live-indicator">assurance active</span>
          </div>
          <div className="console-body">
            <div className="code-line">
              <span className="line-key">intent</span>
              <span>issue customer refund</span>
            </div>
            <div className="code-line">
              <span className="line-key">decision</span>
              <span>approve $750 refund</span>
            </div>
            <div className="code-line">
              <span className="line-key">evidence</span>
              <span>order verified · 8y tenure</span>
            </div>
            <div className="code-line">
              <span className="line-key">policy</span>
              <span>&gt;$500 requires approval</span>
            </div>
            <div className="decision-rule" aria-hidden="true" />
            <div className="decision-result">
              <span className="decision-word">CHALLENGE</span>
              <p>Decision is plausible. Manager approval is still required.</p>
            </div>
            <div className="receipt-row">
              <span>decision_trace</span>
              <code>trace_01JAA4…A91C</code>
            </div>
          </div>
          <div className="console-footer">
            The agent proposes. The trust layer assesses and enforces.
          </div>
        </div>
      </section>

      <section className="thesis" aria-labelledby="thesis-title">
        <p className="section-index">01 / The gap</p>
        <div>
          <h2 id="thesis-title">Agents need more than permissions. They need accountable judgment.</h2>
          <p>
            Traditional security asks who can access a system. AgentAction asks
            whether this agent should make this decision, in this context, right
            now—and what evidence must exist before and after it acts.
          </p>
        </div>
      </section>

      <section className="permissions section-shell" aria-labelledby="permissions-title">
        <div className="section-heading compact">
          <div>
            <p className="section-index">02 / Beyond IAM</p>
            <h2 id="permissions-title">Access is necessary. It is not assurance.</h2>
          </div>
          <p>
            AgentAction complements identity providers, policy engines, and API
            gateways. It adds the decision and evidence controls autonomous
            systems require at the moment of action.
          </p>
        </div>
        <div className="comparison-table" role="table" aria-label="Traditional IAM and agent systems comparison">
          <div className="comparison-row comparison-head" role="row">
            <span role="columnheader">Traditional IAM</span>
            <span role="columnheader">Autonomous agent systems</span>
          </div>
          {permissionRows.map(([traditional, agent]) => (
            <div className="comparison-row" role="row" key={traditional}>
              <span role="cell">{traditional}</span>
              <strong role="cell">{agent}</strong>
            </div>
          ))}
        </div>
      </section>

      <section id="architecture" className="architecture section-shell" aria-labelledby="architecture-title">
        <div className="section-heading">
          <div>
            <p className="section-index">03 / The trust lifecycle</p>
            <h2 id="architecture-title">Assure the decision before authorizing the action.</h2>
          </div>
          <p>
            Before an agent acts, assess whether the decision is justified. When
            it acts, ensure the action is authorized. Afterward, preserve proof
            of what happened and evaluate the result.
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
            intent → assessed → authorized → executed → evidenced → evaluated
          </code>
        </div>
      </section>

      <section id="platform" className="platform section-shell" aria-labelledby="platform-title">
        <div className="section-heading">
          <div>
            <p className="section-index">04 / The platform</p>
            <h2 id="platform-title">One trust layer. Three control surfaces.</h2>
          </div>
          <p>
            The gateway is the enforcement wedge. Evaluation and decision
            assurance extend that boundary across the full agent lifecycle—from
            pre-deployment testing to runtime evidence and continuous review.
          </p>
        </div>
        <div className="module-grid">
          {assuranceModules.map((module, index) => (
            <article key={module.title}>
              <div className="module-topline">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <span className={module.state === "Available now" ? "status-label status-current" : "status-label"}>
                  {module.state}
                </span>
              </div>
              <h3>{module.title}</h3>
              <p>{module.copy}</p>
              <code>{module.signal}</code>
              <p className="module-note">{module.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="gateway" className="gateway-entry section-shell" aria-labelledby="gateway-entry-title">
        <div className="section-heading">
          <div>
            <p className="section-index">05 / Deploy the boundary</p>
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
            <p className="section-index">06 / Trust model</p>
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
            <p className="section-index">07 / Proof, not promises</p>
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

      <section id="observe" className="quickstart section-shell" aria-labelledby="quickstart-title">
        <div className="quickstart-copy">
          <p className="section-index">08 / Recommended onboarding</p>
          <span className="status-label status-current">Available in v0.4.0</span>
          <h2 id="quickstart-title">Observe first. Enforce when ready.</h2>
          <p>
            Run the customer-controlled MCP adapter beside an existing workflow.
            In observe mode, it forwards every MCP call unchanged while recording
            the counterfactual allow, deny, or challenge decision and actionable
            findings in process-local shadow state.
          </p>
          <a className="text-link" href={observerQuickStart}>
            Run the observer quick start <span aria-hidden="true">↗</span>
          </a>
          <p className="observer-boundary">
            This reference adapter is a quick onboarding and integration path,
            not yet a production-complete MCP gateway. When the findings look
            right, switch the same deployment from <code>observe</code> to
            <code>enforce</code> deliberately.
          </p>
          <p className="observer-alternative">
            Need an in-process boundary instead?{" "}
            <a href={`${github}/tree/main/packages/guard`}>
              Embed the TypeScript guard <span aria-hidden="true">↗</span>
            </a>
          </p>
        </div>
        <div className="code-panel observer-panel" aria-label="Passive MCP observer deployment model">
          <div className="code-panel-header">
            <span>customer environment</span>
            <span>mode: observe</span>
          </div>
          <div className="observer-topology" aria-label="MCP client to observer adapter to MCP server">
            <span>MCP client</span>
            <span aria-hidden="true">→</span>
            <strong>Observer adapter</strong>
            <span aria-hidden="true">→</span>
            <span>MCP server</span>
          </div>
          <dl className="observer-event">
            <div>
              <dt>gateway_outcome</dt>
              <dd>forwarded</dd>
            </div>
            <div>
              <dt>counterfactual_decision</dt>
              <dd>deny</dd>
            </div>
            <div>
              <dt>finding</dt>
              <dd>idempotency key missing</dd>
            </div>
            <div>
              <dt>downstream_result</dt>
              <dd>returned unchanged</dd>
            </div>
          </dl>
          <div className="observer-transition">
            <span>after validation</span>
            <code>observe → enforce</code>
          </div>
        </div>
      </section>

      <section className="audiences section-shell" aria-labelledby="audiences-title">
        <div className="section-heading compact">
          <div>
            <p className="section-index">09 / One boundary, four entry points</p>
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
          <p className="section-index">10 / Open standards posture</p>
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
          <Link href="/landscape">
            <span>Governance landscape</span>
            <span aria-hidden="true">↗</span>
          </Link>
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

      <section id="transition" className="transition-path" aria-labelledby="transition-title">
        <div className="transition-path-heading">
          <div>
            <p className="section-index">11 / Enterprise transition blueprint</p>
            <h2 id="transition-title">Move from AI assistance to bounded autonomy.</h2>
          </div>
          <div className="transition-path-intro">
            <p>
              Do not decide whether an agent is simply “autonomous.” Decide which
              action classes it has earned the right to perform, under which
              conditions, and with what evidence.
            </p>
            <p>
              Advance one bounded workflow at a time. Every stage changes the
              operating mode only after its exit evidence is available.
            </p>
          </div>
        </div>

        <ol className="transition-stages" aria-label="Five-stage enterprise agentic AI transition path">
          {transitionStages.map((stage) => (
            <li key={stage.step}>
              <div className="transition-stage-topline">
                <span>{stage.step}</span>
                <span>{stage.mode}</span>
              </div>
              <h3>{stage.title}</h3>
              <p>{stage.copy}</p>
              <div className="transition-stage-question">
                <span>Evidence must answer</span>
                <p>{stage.question}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="transition-resource">
          <div>
            <p className="transition-resource-kicker">Referenced practitioner field guide · 9 pages</p>
            <h3>Take the complete transition blueprint into your planning session.</h3>
            <p>
              Includes the evidence stack, evaluation scorecard, 90-day launch
              plan, three applied workflow playbooks, and reference anchors.
            </p>
          </div>
          <div className="transition-resource-actions">
            <a
              className="button transition-download"
              href="/enterprise-agentic-ai-transition-blueprint.pdf"
              download
            >
              Download the blueprint <span aria-hidden="true">↓</span>
            </a>
            <a className="button transition-contact" href="#project">
              Discuss a workflow <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>
      </section>

      <section id="project" className="closing project-engagement" aria-labelledby="closing-title">
        <div className="engagement-copy">
          <p className="eyebrow">Bring us a consequential agent workflow.</p>
          <h2 id="closing-title">Build agents that can act—and show why they should have.</h2>
          <p className="engagement-lede">
            If your agent can move money, change production, contact customers,
            or mutate durable state, we can help define the authority and evidence
            it needs before rollout.
          </p>
          <ol className="engagement-services" aria-label="How AgentAction can help">
            <li>
              <span>01</span>
              <div>
                <h3>Map the action boundary</h3>
                <p>Identify consequential actions, identities, approvals, budgets, and data-flow rules.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Prove the integration</h3>
                <p>Connect the runtime, gateway, and provider; simulate decisions; and add receipts and replay.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Validate before rollout</h3>
                <p>Exercise deny and challenge paths, provider verification, and investigation-ready evidence.</p>
              </div>
            </li>
          </ol>
          <a className="text-link engagement-github" href={github}>
            Prefer to explore the implementation? Open GitHub <span aria-hidden="true">↗</span>
          </a>
        </div>
        <ProjectInquiryForm />
      </section>

      <footer>
        <Brand href="#top" footer />
        <p>Trust infrastructure for autonomous AI agents.</p>
        <div className="footer-links">
          <a href={github}>GitHub</a>
          <a href={`${github}/blob/main/LICENSE`}>Apache-2.0</a>
          <a href={`${github}/blob/main/SUPPORT.md`}>Support</a>
        </div>
      </footer>
    </main>
  );
}
