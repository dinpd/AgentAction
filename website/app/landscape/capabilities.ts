export const reviewedAt = "2026-09-29";

export const focuses = [
  { id: "identity", label: "Identity & delegation", question: "Who acts, for whom, with what authority?" },
  { id: "containment", label: "Runtime containment", question: "What can the agent reach or execute?" },
  { id: "action", label: "Action authorization", question: "May this operation proceed? Inspect the qualification for payload granularity." },
  { id: "state", label: "State & approvals", question: "Does history or required approval constrain this action?" },
  { id: "authority", label: "Provider verification", question: "Can the receiving service verify action-specific authority?" },
  { id: "outcome", label: "Execution & outcomes", question: "Is authorization linked to execution or independently observed outcomes? Logs alone do not qualify." },
] as const;

export const coverage = {
  built: { symbol: "●", label: "Built in" },
  integration: { symbol: "◐", label: "Integration" },
  announced: { symbol: "◇", label: "Announced" },
  unknown: { symbol: "?", label: "Not established" },
} as const;

export type Focus = typeof focuses[number]["id"];
export type Cell = { state: keyof typeof coverage; note: string; source: string };
export type Entry = {
  id: string;
  name: string;
  org: string;
  maturity: "Available" | "Early" | "Draft" | "Reference design";
  offering: "Open source" | "Managed" | "Open source + managed" | "Hardware reference";
  reviewed: string;
  qualification: string;
  self?: boolean;
  cells: Record<Focus, Cell>;
};

const sources = {
  shell: "https://docs.nvidia.com/openshell/latest/about/architecture",
  extensions: "https://docs.nvidia.com/openshell/latest/extensibility/overview",
  sentry: "https://nvidianews.nvidia.com/news/open-agent-safety-platform",
  aws: "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-session-based-temporal.html",
  cedar: "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-understanding-cedar.html",
  entra: "https://learn.microsoft.com/en-us/microsoft-agent-365/guidance/entra-agent-365",
  gateway: "https://agentgateway.dev/docs/standalone/latest/documentation/configuration/security/mcp-authz/",
  auth0: "https://github.com/auth0/auth0-ai-js",
  ap2: "https://github.com/google-agentic-commerce/AP2",
  guard: "https://github.com/dinpd/AgentAction/blob/main/packages/guard/src/index.ts",
  provider: "https://github.com/dinpd/AgentAction/blob/main/packages/provider-express/README.md",
  intent: "https://github.com/dinpd/AgentAction/blob/main/docs/intent-assurance.md",
};

function cell(state: Cell["state"], note: string, source: string): Cell {
  return { state, note, source };
}
const unknown = (source: string, note = "This source does not establish this capability. This is not evidence that the product cannot provide it.") => cell("unknown", note, source);

export const entries: Entry[] = [
  {
    id: "openshell", name: "OpenShell", org: "NVIDIA", maturity: "Available", offering: "Open source", reviewed: reviewedAt,
    qualification: "Available software; deployment requirements still apply. Permission expansion is distinct from approval of an exact business transaction.",
    cells: {
      identity: cell("built", "Sandbox credentials and controlled provider-credential injection; not a portable delegation-chain standard.", sources.shell),
      containment: cell("built", "Separate trusted supervisor, filesystem/process controls and a mediated network path.", sources.shell),
      action: cell("integration", "API policy is native. Application-specific payload decisions can be added through supervisor middleware.", sources.extensions),
      state: cell("built", "Risky policy expansion requires review; this does not establish business-transaction budgets or single-use approvals.", sources.shell),
      authority: unknown(sources.extensions, "Extension tokens authenticate the caller; the reviewed contract does not establish provider-verifiable authority bound to an exact business payload."),
      outcome: unknown(sources.shell, "Runtime logs do not by themselves establish that a business outcome satisfied its intended constraints."),
    },
  },
  {
    id: "sentry", name: "Sentry", org: "NVIDIA", maturity: "Reference design", offering: "Hardware reference", reviewed: reviewedAt,
    qualification: "Announced September 28. BlueField-4 reference design; vendor claims are not independently benchmarked here.",
    cells: {
      identity: cell("announced", "The announcement describes agent identity verification through DOCA.", sources.sentry),
      containment: cell("announced", "Independent DPU monitoring and quarantine outside the agent runtime.", sources.sentry),
      action: cell("announced", "Granular tool/API access enforcement is described; exact transaction-payload semantics are not established.", sources.sentry),
      state: unknown(sources.sentry),
      authority: unknown(sources.sentry, "Attested telemetry is described, but not a receiving-service contract for exact-action authorization receipts."),
      outcome: unknown(sources.sentry, "Monitoring and attested telemetry are not proof of a verified business outcome."),
    },
  },
  {
    id: "agentcore", name: "AgentCore Policy", org: "AWS", maturity: "Available", offering: "Managed", reviewed: reviewedAt,
    qualification: "Managed policy service. Dogwood's open-source reference interpreter has a separate maturity. This row does not score all AgentCore services.",
    cells: {
      identity: cell("built", "Policy sessions bind to authenticated principals; supported multi-hop flows propagate caller identity.", sources.aws),
      containment: unknown(sources.aws, "This policy-service source does not establish OS isolation. AgentCore Runtime is a separate service."),
      action: cell("built", "Cedar evaluates tool invocations and input parameters, including refund amounts.", sources.cedar),
      state: cell("built", "Temporal policies constrain action sequences, invocation counts and sensitive-read follow-up. Multi-hop support is limited to one account and Region.", sources.aws),
      authority: unknown(sources.aws),
      outcome: unknown(sources.aws, "Session history supports authorization; an independently verifiable business-outcome receipt is not established by this source."),
    },
  },
  {
    id: "entra", name: "Entra Agent ID", org: "Microsoft / Agent 365", maturity: "Available", offering: "Managed", reviewed: reviewedAt,
    qualification: "Identity and lifecycle coverage. Do not interpret scoped access tokens as exact-action authorization receipts.",
    cells: {
      identity: cell("built", "Agent identities, ownership, scoped tokens and user/agent context anchor access and lifecycle governance.", sources.entra),
      containment: unknown(sources.entra),
      action: cell("integration", "Identity and permissions supply access context; the application must enforce its business-action constraints.", sources.entra),
      state: unknown(sources.entra, "Lifecycle and Conditional Access controls do not establish per-job transaction history or payload-bound approval in this overview."),
      authority: unknown(sources.entra),
      outcome: unknown(sources.entra),
    },
  },
  {
    id: "agentgateway", name: "agentgateway", org: "Open-source gateway", maturity: "Available", offering: "Open source", reviewed: reviewedAt,
    qualification: "This row covers documented standalone MCP authorization, not every enterprise extension or custom integration.",
    cells: {
      identity: cell("integration", "Configure MCP authentication to supply validated JWT claims to authorization rules.", sources.gateway),
      containment: unknown(sources.gateway),
      action: cell("built", "MCP tool-name/target authorization. Tool arguments are documented as post-request access-log fields, not request-time authorization inputs.", sources.gateway),
      state: unknown(sources.gateway),
      authority: unknown(sources.gateway),
      outcome: unknown(sources.gateway, "Tool result logging is documented; linked authorization-to-outcome verification is not established."),
    },
  },
  {
    id: "auth0", name: "Auth0 AI SDKs", org: "Okta / Auth0", maturity: "Early", offering: "Open source + managed", reviewed: reviewedAt,
    qualification: "Open-source SDKs backed by managed Auth0 services. SDK maturity and service maturity are separate.",
    cells: {
      identity: cell("built", "User authentication and Token Vault connect agents to user-authorized services.", sources.auth0),
      containment: unknown(sources.auth0),
      action: cell("integration", "Application integrations connect authorization and approval flows to tool execution.", sources.auth0),
      state: cell("built", "Asynchronous authorization supports human approval; it is not a general temporal-policy engine.", sources.auth0),
      authority: unknown(sources.auth0),
      outcome: unknown(sources.auth0),
    },
  },
  {
    id: "ap2", name: "AP2", org: "Google agentic commerce", maturity: "Draft", offering: "Open source", reviewed: reviewedAt,
    qualification: "Protocol and reference code for payments. Coverage does not imply adoption as a general-purpose action standard.",
    cells: {
      identity: cell("integration", "Payment participants integrate credential and identity systems with the protocol.", sources.ap2),
      containment: unknown(sources.ap2),
      action: cell("built", "Mandates express payment-specific intent and purchase authorization.", sources.ap2),
      state: cell("built", "Mandates capture user consent for payment flows; not a generic session-budget engine.", sources.ap2),
      authority: cell("built", "Verifiable mandates carry payment authority across participant boundaries.", sources.ap2),
      outcome: cell("built", "Payment receipts provide transaction evidence; arbitrary business-goal evaluation remains outside this scope.", sources.ap2),
    },
  },
  {
    id: "agentaction", name: "AgentAction", org: "Self-listed by the maintainer", maturity: "Early", offering: "Open source", reviewed: reviewedAt, self: true,
    qualification: "Reference implementations and demos. Production use requires trusted context, complete mediation and durable atomic stores; no universal exactly-once guarantee.",
    cells: {
      identity: cell("integration", "Consumes enterprise identity and trusted caller context; does not replace the identity broker.", sources.provider),
      containment: unknown(sources.guard, "An embedded guard is not OS isolation. Infrastructure must prevent bypass of the action boundary."),
      action: cell("built", "Guard checks tool, resource, amount and declared data flow before a wrapped callback.", sources.guard),
      state: cell("built", "Approvals, budgets and replay state exist. Local in-memory state alone does not survive crashes or resolve uncertain provider commits.", sources.guard),
      authority: cell("built", "Reference JWS/JWKS middleware verifies scoped receipts. Production replay/revocation stores must be durable and atomic; the Express package is private while its contract settles.", sources.provider),
      outcome: cell("built", "Intent evaluation separates execution and trusted observations; missing evidence can yield indeterminate. Quality depends on the supplied contract and evidence.", sources.intent),
    },
  },
];

export function matchesFilters(entry: Entry, focus: string, maturity: string, offering: string) {
  return (focus === "all" || entry.cells[focus as Focus]?.state !== "unknown")
    && (maturity === "all" || entry.maturity === maturity)
    && (offering === "all" || entry.offering === offering);
}
