import { entries, type Focus } from "./capabilities";

type Placement = {
  project: string;
  label: string;
  source: Focus;
  scope: string;
};

const areas: {
  id: string;
  title: string;
  question: string;
  context: "task" | "environment";
  placements: Placement[];
}[] = [
  {
    id: "govern-actions",
    title: "Govern actions",
    question: "May this refund proceed?",
    context: "task",
    placements: [
      { project: "agentcore", label: "AWS AgentCore Policy", source: "state", scope: "Stateful authorization within documented session and deployment boundaries." },
      { project: "ap2", label: "AP2 · payments", source: "action", scope: "Payment mandates and consent; draft protocol and reference code." },
      { project: "agentaction", label: "AgentAction", source: "action", scope: "Early exact-action controls; trusted context, complete mediation and durable state remain deployment requirements." },
    ],
  },
  {
    id: "verify-outcomes",
    title: "Verify outcomes",
    question: "Did the intended refund happen?",
    context: "task",
    placements: [
      { project: "ap2", label: "AP2 · payment evidence", source: "outcome", scope: "Payment receipts supply transaction evidence, not arbitrary business-goal evaluation." },
      { project: "agentaction", label: "AgentAction · intent evals", source: "outcome", scope: "Early evaluation links contracts, execution evidence and trusted observations; missing evidence can yield indeterminate." },
    ],
  },
  {
    id: "bound-access",
    title: "Bound access",
    question: "What can this agent reach?",
    context: "environment",
    placements: [
      { project: "entra", label: "Microsoft Entra", source: "identity", scope: "Agent identity, scoped permissions and lifecycle controls." },
      { project: "openshell", label: "NVIDIA OpenShell", source: "containment", scope: "Runtime isolation and credential protection. This placement highlights containment, not the entire extension surface." },
      { project: "agentgateway", label: "agentgateway", source: "action", scope: "Documented standalone MCP tool-name and target authorization." },
      { project: "sentry", label: "NVIDIA Sentry", source: "containment", scope: "Announced independent hardware enforcement and quarantine; reference-design claims." },
    ],
  },
  {
    id: "monitor-runtime",
    title: "Monitor runtime",
    question: "What did the agent do?",
    context: "environment",
    placements: [
      { project: "sentry", label: "NVIDIA Sentry", source: "outcome", scope: "The announcement describes monitoring and attested telemetry; neither establishes a verified business outcome by itself." },
      { project: "openshell", label: "OpenShell · runtime logs", source: "outcome", scope: "Runtime observations and logs are distinct from business-outcome verification." },
    ],
  },
];

function marker(maturity: string) {
  if (maturity === "Reference design") return { symbol: "◇", label: "Announced reference design" };
  if (maturity === "Available") return { symbol: "●", label: "Documented available capability" };
  return { symbol: "○", label: "Early / draft implementation" };
}

export function GovernanceMap() {
  return (
    <section id="governance-map" className="section-shell governance-map" aria-labelledby="governance-map-title">
      <div className="section-heading">
        <div>
          <p className="section-index">Start here / The mental model</p>
          <h2 id="governance-map-title">Four jobs in agent governance.</h2>
        </div>
        <p>Which jobs does your stack cover, and where are you relying on assumptions?</p>
      </div>
      <p className="governance-map-intro">
        Read across from controlling what may happen to establishing what happened.
        Read up from the execution environment to the business task. Products can
        contribute in multiple areas; placement describes a capability’s focus,
        not a product-wide score.
      </p>
      <figure className="governance-figure" aria-labelledby="governance-map-title" aria-describedby="governance-map-caption">
        <div className="governance-axis" aria-hidden="true">
          <span />
          <div><strong>Control</strong><span>Constrain what may happen</span></div>
          <div><strong>Evidence</strong><span>Establish what happened</span></div>
        </div>
        <div className="governance-quadrants">
          {areas.map((area, index) => (
            <div className={`governance-area governance-area-${area.context}`} key={area.id}>
              {index % 2 === 0 && <span className="governance-context" aria-hidden="true">{area.context === "task" ? "Business task" : "Execution environment"}</span>}
              <h3 id={area.id}>{area.title}</h3>
              <p className="governance-question">“{area.question}”</p>
              <ul aria-label={`${area.title} — ${area.context === "task" ? "business task" : "execution environment"}, ${index % 2 === 0 ? "control" : "evidence"}`}>
                {area.placements.map((placement) => {
                  const entry = entries.find((item) => item.id === placement.project);
                  if (!entry) throw new Error(`Unknown governance-map project: ${placement.project}`);
                  const status = marker(entry.maturity);
                  return (
                    <li key={placement.label}>
                      <a href={entry.cells[placement.source].source} title={`${status.label}. ${placement.scope}`} aria-label={`${placement.label} — ${status.label}. ${placement.scope}`}>
                        <span className="governance-marker" aria-hidden="true">{status.symbol}</span>
                        <span>{placement.label}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <figcaption id="governance-map-caption">
          <ul className="governance-marker-legend" aria-label="Map maturity markers">
            {["Available", "Early", "Reference design"].map((maturity) => {
              const status = marker(maturity);
              return <li key={maturity}><span aria-hidden="true">{status.symbol}</span> {status.label}</li>;
            })}
          </ul>
          <p>Representative capabilities, reviewed September 29, 2026. Names link to sources. AP2 is scoped to payments; AgentAction is an early, self-listed implementation. Sentry reflects an announced reference design.</p>
        </figcaption>
      </figure>
      <a className="governance-evidence-link" href="#capability-map">Inspect the detailed evidence and limitations <span aria-hidden="true">↓</span></a>
    </section>
  );
}
