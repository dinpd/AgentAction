type Fetcher = {
  fetch(request: Request): Promise<Response>;
};

export type Env = {
  AGENTID_GATEWAY?: Fetcher;
  AGENTID_GATEWAY_TOKEN?: string;
  AGENTID_INTERNAL_SERVICE_TOKEN?: string;
  ACCESS_AUD?: string;
  ACCESS_JWKS_URL?: string;
  ACCESS_ROLE_CLAIM?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_TENANT_CLAIM?: string;
  CONSOLE_ENABLE_MOCK_IDENTITY?: string;
  CONSOLE_DIRECTORY_MODE?: string;
  CONSOLE_ENVIRONMENT?: string;
  CONSOLE_MOCK_EMAIL?: string;
  CONSOLE_MOCK_SUBJECT?: string;
  CONSOLE_MOCK_TENANT_ID?: string;
  CONSOLE_PUBLIC_DEMO?: string;
  CONSOLE_STATIC_TENANT_ID?: string;
  CONSOLE_STATIC_TENANT_ROLE?: string;
  CONSOLE_STALE_AFTER_SECONDS?: string;
};

type ConsoleIdentity = {
  email?: string;
  issuer: string;
  role?: TenantRole;
  subject: string;
  tenantId?: string;
};

type TenantRole = "operator" | "owner" | "viewer";

type GatewayRoute = {
  allowedQuery: ReadonlySet<string>;
  gatewayPath: string;
  tenantId: string;
};

type CachedJwks = {
  expiresAt: number;
  keys: Array<JsonWebKey & { alg?: string; kid?: string; use?: string }>;
};

type UpstreamFreshness = {
  ageSeconds?: number;
  generatedAt?: string;
  state: "fresh" | "stale" | "unknown";
};

class ConsoleError extends Error {
  readonly status: number;
  readonly code: string;
  readonly state: "unauthorized" | "forbidden" | "unavailable" | "error";

  constructor(
    status: number,
    code: string,
    message: string,
    state: "unauthorized" | "forbidden" | "unavailable" | "error" = "error",
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.state = state;
  }
}

const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const JWT_CLOCK_SKEW_SECONDS = 60;
const jwksCache = new Map<string, CachedJwks>();

const QUALITY_QUERY = new Set([
  "from",
  "to",
  "profile_key",
  "profile_version",
  "agent_id",
  "verdict",
  "constraint_compliance",
  "limit",
  "cursor",
]);
const QUALITY_JOBS_QUERY = new Set([
  ...QUALITY_QUERY,
  "confidence",
  "job_id",
  "intent_id",
]);
const PROFILE_QUERY = new Set(["limit", "cursor"]);
const CONTRACT_QUERY = new Set(["job_id", "intent_id", "profile_key", "profile_version", "limit", "cursor"]);
const AUDIT_QUERY = new Set([
  "type",
  "agent_id",
  "intent_id",
  "tool",
  "approval_id",
  "jit_grant_id",
  "limit",
  "cursor",
]);
const APPROVAL_QUERY = new Set(["status", "agent_id", "limit", "cursor"]);
const ACTIVITY_QUERY = new Set([
  "from",
  "to",
  "agent_id",
  "event_type",
  "tool",
  "decision",
  "execution_status",
  "intent_binding",
  "limit",
  "cursor",
]);
const NO_QUERY = new Set<string>();

const SHELL_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>AgentAction Observability</title>
  <link rel="stylesheet" href="/assets/app.css">
  <script src="/assets/app.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to main content</a>
  <header class="topbar">
    <div class="brand-lockup">
      <p class="eyebrow">AgentAction</p>
      <h1>AgentAction Observability</h1>
      <p class="brand-description">Open-source intent contracts, execution controls, and immutable evidence for accountable agents.</p>
    </div>
    <div class="topbar-context">
      <a class="repo-link" href="https://github.com/dinpd/AgentAction" target="_blank" rel="noreferrer"><span class="repo-label-long">GitHub repository</span><span class="repo-label-short">GitHub</span> <span aria-hidden="true">↗</span></a>
      <div class="account-context" aria-label="Workspace and account">
        <div class="workspace-control" data-tenant-switcher hidden>
          <div class="workspace-heading"><span>Workspace</span><small data-workspace-mode>Loading access…</small></div>
          <div class="workspace-actions"><select data-tenant-select aria-label="Active workspace"></select><a href="#setup" data-workspace-manage>Manage</a></div>
        </div>
        <div class="identity" aria-label="Authenticated identity">
          <small data-identity-label>Signed in as</small>
          <strong data-subject>Identity loading…</strong>
          <span data-tenant>Workspace loading…</span>
          <a class="logout-link" href="/cdn-cgi/access/logout" data-logout hidden>Log out</a>
        </div>
      </div>
    </div>
  </header>
  <div class="layout">
    <nav class="section-nav" aria-label="Console sections">
      <a href="#overview" aria-current="page" data-nav-overview>Overview</a>
      <a href="#activity" data-nav-activity>Activity</a>
      <a href="#jobs" data-nav-jobs>Jobs</a>
      <a href="#evals" data-nav-evals>Evals</a>
      <a href="#setup" data-nav-setup>Setup</a>
      <a href="#exceptions">Exceptions</a>
    </nav>
    <main id="main" tabindex="-1">
      <section class="status-card" data-status-card data-state="loading" aria-live="polite" aria-atomic="true">
        <div class="status-dot" aria-hidden="true"></div>
        <div>
          <p class="eyebrow">Console connection</p>
          <h2 data-status-title>Authenticating console session</h2>
          <p data-status-detail>Verifying the tenant boundary and private gateway binding.</p>
        </div>
        <button class="text-button" type="button" data-refresh hidden>Refresh data</button>
      </section>
      <section class="intro" data-overview-context="boundaries" aria-labelledby="overview-title">
        <div class="intro-copy">
          <p class="eyebrow">Fleet quality</p>
          <h2 id="overview-title">Execution quality</h2>
          <p>Profile-scoped immutable final receipts, with low-confidence and indeterminate work kept visible.</p>
        </div>
        <dl aria-label="Fleet quality boundaries">
          <div><dt>Auth</dt><dd>Cloudflare Access</dd></div>
          <div><dt>Comparison</dt><dd>Profile scoped</dd></div>
          <div><dt>Evidence</dt><dd>Final receipts only</dd></div>
        </dl>
      </section>
      <!-- public-demo-lifecycle:start -->
      <section id="lifecycle" class="lifecycle-panel" data-overview-context="lifecycle" aria-labelledby="lifecycle-title">
        <h2 id="lifecycle-title" class="visually-hidden">Synthetic run lifecycle</h2>
        <details class="lifecycle-disclosure">
          <summary>
            <span class="lifecycle-summary-copy">
              <span class="eyebrow">Execution path</span>
              <span class="lifecycle-visible-title">Synthetic run lifecycle</span>
              <span class="lifecycle-purpose">How scheduled runs become immutable, profile-scoped quality data.</span>
            </span>
            <span class="lifecycle-toggle">
              <span class="disclosure-closed">Show 9-stage flow</span>
              <span class="disclosure-open">Hide 9-stage flow</span>
            </span>
          </summary>
          <ol class="lifecycle-track" aria-label="Synthetic execution lifecycle">
            <li>
              <span class="stage-number" aria-hidden="true">01</span>
              <h3>Cloudflare Cron</h3>
              <p>Starts a bounded UTC schedule bucket.</p>
            </li>
            <li>
              <span class="stage-number" aria-hidden="true">02</span>
              <h3>Synthetic Agent Worker</h3>
              <p>Selects deterministic profile and quality scenarios.</p>
            </li>
            <li>
              <span class="stage-number" aria-hidden="true">03</span>
              <h3>AgentAction Gateway</h3>
              <p>Calls the real service through a private binding.</p>
            </li>
            <li>
              <span class="stage-number" aria-hidden="true">04</span>
              <h3>Issue intent contract</h3>
              <p>Freezes the objective, controls, and profile version.</p>
            </li>
            <li>
              <span class="stage-number" aria-hidden="true">05</span>
              <h3>Authorize calls / approvals</h3>
              <p>Exercises policy, human-approval, and JIT boundaries.</p>
            </li>
            <li>
              <span class="stage-number" aria-hidden="true">06</span>
              <h3>Execution receipts + signed observations</h3>
              <p>Captures execution receipts; trusted adapters can add signed observations.</p>
            </li>
            <li>
              <span class="stage-number" aria-hidden="true">07</span>
              <h3>Finalize immutable receipt</h3>
              <p>Freezes one canonical evidence snapshot and verdict.</p>
            </li>
            <li>
              <span class="stage-number" aria-hidden="true">08</span>
              <h3>Profile-scoped rollups</h3>
              <p>Aggregates only comparable profile versions.</p>
            </li>
            <li>
              <span class="stage-number" aria-hidden="true">09</span>
              <h3>Observability Console</h3>
              <p>Shows outcomes, confidence, discipline, and exceptions.</p>
            </li>
          </ol>
        </details>
      </section>
      <!-- public-demo-lifecycle:end -->
      <section id="setup" class="setup-panel" data-console-view="setup" aria-labelledby="setup-heading" tabindex="-1" hidden>
        <header class="section-heading">
          <div>
            <p class="eyebrow">Workspace setup</p>
            <h2 id="setup-heading">Connect agents to observability</h2>
            <p>Create or join a workspace, then connect the agent integration that fits your deployment.</p>
          </div>
          <span class="role-badge" data-setup-role>Not provisioned</span>
        </header>
        <section class="setup-notice" data-setup-message role="status" aria-live="polite">
          <h3 data-setup-message-title>Choose how to get started</h3>
          <p data-setup-message-detail>Create a workspace for your team, or redeem an invitation from an owner.</p>
        </section>
        <section class="setup-card setup-wide migration-card" data-workspace-migration hidden>
          <p class="eyebrow">Managed by SSO</p>
          <h3>Enable workspace switching</h3>
          <p>Your signed Access claim currently pins this workspace. Owners can adopt it into the workspace directory without moving data or changing agent credentials.</p>
          <button class="primary-button" type="button" data-enable-workspace-switching>Enable workspace switching</button>
        </section>
        <section class="secret-panel" data-secret-panel hidden aria-labelledby="secret-title">
          <div><p class="eyebrow">Shown once</p><h3 id="secret-title">Save this source token now</h3><p>AgentAction stores only its digest. This token cannot be displayed again; rotate the source if it is lost.</p></div>
          <div class="secret-value"><code data-source-token></code><button class="text-button" type="button" data-copy-source-token>Copy token</button></div>
          <div class="config-snippet"><strong>Environment</strong><pre data-hermes-environment></pre><button class="text-button" type="button" data-copy-hermes-environment>Copy</button></div>
          <div class="config-snippet"><strong data-setup-config-label>Integration configuration</strong><pre data-hermes-yaml></pre><button class="text-button" type="button" data-copy-hermes-yaml>Copy</button></div>
          <button class="text-button" type="button" data-dismiss-secret>I saved the token</button>
        </section>
        <section data-tenant-setup hidden>
          <div class="setup-grid setup-summary-grid">
            <article class="setup-card"><p class="eyebrow">Ingestion</p><h3 data-ingestion-title>Waiting for activity</h3><p data-ingestion-detail>Connect an agent and send one action to verify the connection.</p><a class="text-link" href="#activity" data-open-activity>Open activity</a></article>
            <article class="setup-card"><p class="eyebrow">Access</p><h3 data-access-title>Viewer</h3><p data-access-detail>Your role determines which setup controls are available.</p></article>
          </div>
          <div class="setup-grid">
            <section class="setup-card setup-wide">
              <div class="setup-card-heading"><div><p class="eyebrow">Sources</p><h3>Agent connections</h3></div></div>
              <div class="source-list" data-source-list></div>
              <form class="inline-setup-form" data-create-source-form hidden>
                <label><span>Integration</span><select data-source-integration><option value="hermes">Hermes Agent</option><option value="agentaction">Custom AgentAction source</option></select></label>
                <label><span>Source ID</span><input data-source-id required maxlength="128" placeholder="hermes-staging" autocomplete="off"></label>
                <label><span>Agent ID</span><input data-source-agent-id required maxlength="128" placeholder="support-agent" autocomplete="off"></label>
                <button class="primary-button" type="submit">Add source</button>
                <aside class="integration-guide" data-integration-guide>
                  <p class="eyebrow">Selected integration</p>
                  <h4 data-integration-guide-title>Hermes Agent</h4>
                  <p data-integration-guide-detail></p>
                  <ol data-integration-guide-steps></ol>
                  <a class="text-link" data-integration-guide-link target="_blank" rel="noreferrer">Open integration guide <span aria-hidden="true">↗</span></a>
                </aside>
              </form>
            </section>
            <section class="setup-card setup-wide" data-invite-members-card hidden>
              <p class="eyebrow">Team</p><h3>Invite a member</h3>
              <form class="inline-setup-form" data-create-invite-form>
                <label><span>Email</span><input type="email" data-member-email required maxlength="254" autocomplete="email"></label>
                <label><span>Role</span><select data-member-role><option value="viewer">Viewer</option><option value="operator">Operator</option></select></label>
                <button class="primary-button" type="submit">Create invitation</button>
              </form>
              <div class="invitation-result" data-invitation-result hidden><strong>Invitation code (shown once)</strong><small data-invitation-delivery></small><code data-created-invitation-code></code><button class="text-button" type="button" data-copy-invitation>Copy code</button></div>
              <h4>Members and invitations</h4><ul class="member-list" data-member-list></ul>
            </section>
          </div>
        </section>
        <div class="setup-grid workspace-actions" data-setup-onboarding hidden>
          <form class="setup-card" data-create-tenant-form data-create-workspace-card>
            <p class="eyebrow">New workspace</p>
            <h3>Create a workspace</h3>
            <label><span>Workspace ID</span><input name="tenant_id" data-create-tenant-id required maxlength="128" pattern="[A-Za-z0-9][A-Za-z0-9._:-]+" placeholder="acme-support" autocomplete="off"></label>
            <label><span>Display name</span><input name="display_name" data-create-display-name required maxlength="120" placeholder="Acme Support"></label>
            <label><span>First integration</span><select data-create-integration><option value="none" selected>Add later</option><option value="hermes">Hermes Agent</option><option value="agentaction">Custom AgentAction source</option></select></label>
            <div data-create-integration-fields hidden>
              <label><span>Source ID</span><input name="source_id" data-create-source-id maxlength="128" placeholder="production-agents" autocomplete="off"></label>
              <label><span>Agent ID</span><input name="agent_id" data-create-agent-id maxlength="128" placeholder="support-agent" autocomplete="off"></label>
            </div>
            <button class="primary-button" type="submit">Create workspace</button>
          </form>
          <section class="setup-card join-workspace-card" data-join-workspace-card>
            <div data-join-workspace-intro>
              <p class="eyebrow">Existing workspace</p>
              <h3>Redeem an invitation</h3>
            </div>
            <button class="join-workspace-toggle" type="button" data-join-workspace-toggle aria-expanded="false" aria-controls="join-workspace-form" hidden>
              <span><strong>Join another workspace</strong><small>Use an invitation code</small></span>
              <span data-join-workspace-toggle-label>Open</span>
            </button>
            <form id="join-workspace-form" class="join-workspace-form" data-redeem-invite-form>
              <label><span>Invitation code</span><input name="code" data-invite-code required maxlength="300" autocomplete="off" spellcheck="false" placeholder="invite_….aa_inv_…"></label>
              <p>Invitation codes are email-bound, expire after seven days, and can be used once.</p>
              <button class="primary-button" type="submit">Join workspace</button>
            </form>
          </section>
        </div>
      </section>
      <section id="evals" class="setup-panel" data-console-view="evals" aria-labelledby="evals-heading" tabindex="-1" hidden>
        <header class="section-heading">
          <div>
            <p class="eyebrow">Evaluation setup</p>
            <h2 id="evals-heading">Choose how Jobs are evaluated</h2>
            <p>Define reusable evaluation versions, then route agents and sources to them. Sources only authenticate telemetry; assignments choose evaluation behavior.</p>
          </div>
          <span class="role-badge" data-evals-role>Read only</span>
        </header>
        <section class="setup-notice" data-evals-message data-state="ready" role="status" aria-live="polite">
          <h3 data-evals-message-title>Loading evaluations</h3>
          <p data-evals-message-detail>Reading this workspace's definitions and routing rules.</p>
        </section>
        <section data-evals-content hidden>
          <div class="setup-grid eval-overview-grid">
            <section class="setup-card setup-wide">
              <p class="eyebrow">Definitions</p>
              <h3>Reusable evaluation versions</h3>
              <p class="eval-help">V1 supports deterministic lifecycle checks and agent-declared intent checks. Agent-declared results are self-attested, not independent proof of correctness.</p>
              <div class="eval-list" data-eval-definition-list></div>
            </section>
            <section class="setup-card setup-wide">
              <p class="eyebrow">Routing</p>
              <h3>Active assignments</h3>
              <p class="eval-help">The most specific match wins: agent + source, then agent, then source, then workspace default. A Job freezes the selected version when it starts.</p>
              <div class="eval-list" data-eval-assignment-list></div>
            </section>
          </div>
          <section class="eval-owner-controls" data-eval-owner-controls hidden>
            <form class="setup-card inline-setup-form" data-create-eval-form>
              <p class="eyebrow">Owner action</p>
              <h3>Create an immutable eval version</h3>
              <label><span>Template</span><select data-eval-template><option value="basic">Basic evaluator</option><option value="refund_triage">Refund triage · 6 criteria</option></select></label>
              <label><span>Eval ID</span><input data-eval-id required maxlength="80" pattern="[A-Za-z0-9][A-Za-z0-9_-]*" placeholder="refund_quality" autocomplete="off"></label>
              <label><span>Version</span><input data-eval-version required maxlength="40" pattern="[A-Za-z0-9][A-Za-z0-9_-]*" value="v1" autocomplete="off"></label>
              <label><span>Name</span><input data-eval-name required maxlength="120" placeholder="Refund quality" autocomplete="off"></label>
              <label><span>Evaluator</span><select data-eval-kind><option value="agent_declared">Agent-declared intent</option><option value="observed_execution">Observed execution</option></select></label>
              <label class="eval-description"><span>Description</span><textarea data-eval-description required maxlength="500" rows="3" placeholder="What this evaluation is for"></textarea></label>
              <p class="eval-help" data-eval-template-detail>Basic evaluators use the selected lifecycle or agent-declared behavior.</p>
              <button class="primary-button" type="submit">Create eval version</button>
            </form>
            <form class="setup-card inline-setup-form" data-create-eval-assignment-form>
              <p class="eyebrow">Owner action</p>
              <h3>Assign an eval</h3>
              <label><span>Eval version</span><select data-eval-assignment-eval required></select></label>
              <label><span>Source <small>(optional)</small></span><select data-eval-assignment-source><option value="">Any source</option></select></label>
              <label><span>Agent <small>(optional)</small></span><select data-eval-assignment-agent><option value="">Any agent</option></select></label>
              <p class="eval-help">Choose “Any source” and “Any agent” to set the workspace default. Saving the same selector replaces its active route; already-started Jobs stay unchanged.</p>
              <section class="eval-route-preview" data-eval-route-preview data-state="ready" aria-live="polite">
                <h4 data-eval-route-preview-title>Choose an eval and target</h4>
                <p data-eval-route-preview-detail>The winning route and known coverage will appear here before you save.</p>
                <ul data-eval-route-warnings hidden></ul>
              </section>
              <button class="primary-button" type="submit">Save assignment</button>
            </form>
          </section>
        </section>
      </section>
      <section id="overview" class="overview-panel" data-console-view="overview" aria-labelledby="overview-heading" tabindex="-1">
        <header class="section-heading">
          <div>
            <p class="eyebrow">Overview</p>
            <h2 id="overview-heading">Finalized intent executions</h2>
            <p>Every card is one immutable profile key, version, and digest. Cards are never combined into a cross-profile ranking.</p>
          </div>
          <span class="read-only-badge">Read only</span>
        </header>
        <form class="filter-form" data-overview-filters>
          <fieldset>
            <legend>Filter finalized jobs</legend>
            <div class="filter-grid">
              <label>
                <span>Time window</span>
                <select data-filter-window>
                  <option value="1">Last 24 hours</option>
                  <option value="7" selected>Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                </select>
              </label>
              <label>
                <span>Profile key</span>
                <input data-filter-profile-key name="profile_key" type="text" maxlength="160" autocomplete="off" placeholder="support_refund.v1">
              </label>
              <label>
                <span>Profile version</span>
                <input data-filter-profile-version name="profile_version" type="text" maxlength="160" autocomplete="off" placeholder="v1">
              </label>
              <label>
                <span>Agent</span>
                <input data-filter-agent name="agent_id" type="text" maxlength="160" autocomplete="off" placeholder="refund-agent">
              </label>
              <label>
                <span>Verdict</span>
                <select data-filter-verdict name="verdict">
                  <option value="">All verdicts</option>
                  <option value="completed">Completed</option>
                  <option value="partial">Partial</option>
                  <option value="failed">Failed</option>
                  <option value="indeterminate">Indeterminate</option>
                </select>
              </label>
              <label>
                <span>Constraint state</span>
                <select data-filter-constraint name="constraint_compliance">
                  <option value="">All states</option>
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                  <option value="indeterminate">Indeterminate</option>
                </select>
              </label>
            </div>
            <div class="filter-actions">
              <button class="primary-button" type="submit">Apply filters</button>
              <button class="text-button" type="button" data-reset-filters>Reset</button>
              <p data-window-summary>Preparing the bounded UTC window…</p>
            </div>
          </fieldset>
        </form>
        <section class="overview-state" data-overview-message data-state="loading" role="status" aria-live="polite" aria-atomic="true">
          <div class="state-mark" aria-hidden="true">↻</div>
          <div>
            <h3 data-overview-message-title>Loading fleet quality</h3>
            <p data-overview-message-detail>Reading immutable final receipts through the tenant-scoped BFF.</p>
          </div>
        </section>
        <section class="overview-content" data-overview-content hidden>
          <div class="overview-summary">
            <div>
              <p class="eyebrow">Query coverage</p>
              <h3 data-overview-summary>Waiting for finalized execution data.</h3>
            </div>
            <dl class="summary-totals" data-overview-totals></dl>
          </div>
          <section class="finding-panel" data-overview-findings hidden aria-labelledby="overview-findings-title">
            <div>
              <p class="eyebrow">Denominator review</p>
              <h3 id="overview-findings-title">Data-quality findings</h3>
            </div>
            <ul data-overview-findings-list></ul>
          </section>
          <div class="rollup-list" data-rollup-list aria-live="polite"></div>
        </section>
      </section>
      <section id="activity" class="jobs-panel" data-console-view="activity" aria-labelledby="activity-heading" tabindex="-1" hidden>
        <header class="section-heading">
          <div>
            <p class="eyebrow">Shadow activity</p>
            <h2 id="activity-heading">Agent execution stream</h2>
            <p>Privacy-safe Hermes actions and counterfactual AgentAction decisions. Intent is shown only when the integration supplied an explicit ID and digest.</p>
          </div>
          <span class="read-only-badge">Read only</span>
        </header>
        <form class="filter-form" data-activity-filters>
          <fieldset>
            <legend>Filter observed activity</legend>
            <div class="filter-grid jobs-filter-grid">
              <label>
                <span>Time window</span>
                <select data-activity-filter-window>
                  <option value="1">Last 24 hours</option>
                  <option value="7" selected>Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                </select>
              </label>
              <label><span>Agent</span><select data-activity-filter-agent><option value="">All agents</option></select></label>
              <label><span>Event</span><select data-activity-filter-event><option value="">All events</option><option value="session_started">Session started</option><option value="session_completed">Session completed</option><option value="job_started">Job started</option><option value="job_completed">Job completed</option><option value="tool_action">Tool action</option><option value="model_request_started">Model request started</option><option value="model_request_completed">Model request completed</option><option value="subagent_started">Subagent started</option><option value="subagent_completed">Subagent completed</option></select></label>
              <label><span>Tool <small>(optional)</small></span><input data-activity-filter-tool type="text" maxlength="160" autocomplete="off" placeholder="browser.open"></label>
              <label><span>Shadow decision</span><select data-activity-filter-decision><option value="">All decisions</option><option value="allow">Allow</option><option value="challenge_required">Challenge required</option><option value="deny">Deny</option></select></label>
              <label><span>Execution</span><select data-activity-filter-execution><option value="">All states</option><option value="ok">OK</option><option value="error">Error</option><option value="blocked">Blocked</option><option value="cancelled">Cancelled</option><option value="unknown">Unknown</option></select></label>
              <label><span>Intent binding</span><select data-activity-filter-intent><option value="">Bound and unbound</option><option value="bound">Explicitly bound</option><option value="unbound">Unbound</option></select></label>
            </div>
            <div class="filter-actions">
              <button class="primary-button" type="submit">Apply filters</button>
              <button class="text-button" type="button" data-reset-activity-filters>Reset</button>
              <p data-activity-window-summary>Preparing the bounded UTC window…</p>
            </div>
          </fieldset>
        </form>
        <section class="overview-state" data-activity-message data-state="loading" role="status" aria-live="polite" aria-atomic="true">
          <div class="state-mark" aria-hidden="true">↻</div>
          <div><h3 data-activity-message-title>Loading observed activity</h3><p data-activity-message-detail>Reading privacy-safe events through the tenant-scoped BFF.</p></div>
        </section>
        <section class="jobs-content" data-activity-content hidden>
          <div class="jobs-summary">
            <div><p class="eyebrow">Observation coverage</p><h3 data-activity-summary>Waiting for agent activity.</h3></div>
            <p class="window-note">Shadow decisions never change Hermes execution.</p>
          </div>
          <div class="jobs-table-wrap">
            <table class="jobs-table">
              <caption>Privacy-safe agent activity</caption>
              <thead><tr><th scope="col">Observed</th><th scope="col">Agent / event</th><th scope="col">Tool</th><th scope="col">Model / tokens</th><th scope="col">Shadow decision</th><th scope="col">Actual execution</th><th scope="col">Intent</th><th scope="col">Correlation</th></tr></thead>
              <tbody data-activity-list></tbody>
            </table>
          </div>
          <div class="jobs-pagination"><p data-activity-page-summary>Showing the first page.</p><button class="text-button" type="button" data-activity-next hidden>Show next page</button></div>
        </section>
      </section>
      <section id="jobs" class="jobs-panel" data-console-view="jobs" aria-labelledby="jobs-heading" tabindex="-1" hidden>
        <header class="section-heading">
          <div>
            <p class="eyebrow">Jobs</p>
            <h2 id="jobs-heading">Finalized execution explorer</h2>
            <p>Inspect immutable job outcomes inside one tenant and profile boundary. Preview history is summarized; raw evidence stays server-side.</p>
          </div>
          <span class="read-only-badge">Read only</span>
        </header>
        <form class="filter-form" data-jobs-filters>
          <fieldset>
            <legend>Filter finalized jobs</legend>
            <div class="filter-grid jobs-filter-grid">
              <label>
                <span>Time window</span>
                <select data-jobs-filter-window>
                  <option value="1">Last 24 hours</option>
                  <option value="7" selected>Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                </select>
              </label>
              <label>
                <span>Profile key</span>
                <input data-jobs-filter-profile-key name="profile_key" type="text" maxlength="160" autocomplete="off" placeholder="support_refund.v1">
              </label>
              <label>
                <span>Profile version</span>
                <input data-jobs-filter-profile-version name="profile_version" type="text" maxlength="160" autocomplete="off" placeholder="v1">
              </label>
              <label>
                <span>Agent</span>
                <input data-jobs-filter-agent name="agent_id" type="text" maxlength="160" autocomplete="off" placeholder="refund-agent">
              </label>
              <label>
                <span>Verdict</span>
                <select data-jobs-filter-verdict name="verdict">
                  <option value="">All verdicts</option>
                  <option value="completed">Completed</option>
                  <option value="partial">Partial</option>
                  <option value="failed">Failed</option>
                  <option value="indeterminate">Indeterminate</option>
                </select>
              </label>
              <label>
                <span>Constraint state</span>
                <select data-jobs-filter-constraint name="constraint_compliance">
                  <option value="">All states</option>
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                  <option value="indeterminate">Indeterminate</option>
                </select>
              </label>
              <label>
                <span>Confidence</span>
                <select data-jobs-filter-confidence name="confidence">
                  <option value="">All bands</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label>
                <span>Exact job ID</span>
                <input data-jobs-filter-job name="job_id" type="text" maxlength="160" autocomplete="off" placeholder="job-…">
              </label>
              <label>
                <span>Exact intent ID</span>
                <input data-jobs-filter-intent name="intent_id" type="text" maxlength="160" autocomplete="off" placeholder="intent-…">
              </label>
            </div>
            <div class="filter-actions">
              <button class="primary-button" type="submit">Apply filters</button>
              <button class="text-button" type="button" data-reset-jobs-filters>Reset</button>
              <p data-jobs-window-summary>Preparing the bounded UTC window…</p>
            </div>
          </fieldset>
        </form>
        <section class="overview-state" data-jobs-message data-state="loading" role="status" aria-live="polite" aria-atomic="true">
          <div class="state-mark" aria-hidden="true">↻</div>
          <div>
            <h3 data-jobs-message-title>Loading finalized jobs</h3>
            <p data-jobs-message-detail>Reading the tenant-scoped finalized-receipt index.</p>
          </div>
        </section>
        <section class="jobs-content" data-jobs-content hidden>
          <div class="jobs-summary">
            <div>
              <p class="eyebrow">Query coverage</p>
              <h3 data-jobs-summary>Waiting for finalized jobs.</h3>
            </div>
            <p class="window-note" data-jobs-findings>No read-model findings.</p>
          </div>
          <div class="jobs-table-wrap">
            <table class="jobs-table">
              <caption>Finalized intent execution jobs</caption>
              <thead>
                <tr>
                  <th scope="col">Finalized</th>
                  <th scope="col">Job / intent</th>
                  <th scope="col">Agent</th>
                  <th scope="col">Eval / intent</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Model usage</th>
                  <th scope="col">Evidence</th>
                  <th scope="col">Discipline</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody data-jobs-list></tbody>
            </table>
          </div>
          <div class="jobs-pagination">
            <p data-jobs-page-summary>Showing the first page.</p>
            <button class="text-button" type="button" data-jobs-next hidden>Show next page</button>
          </div>
        </section>
      </section>
      <section id="job-detail" class="job-detail-panel" data-console-view="job-detail" aria-labelledby="job-detail-heading" tabindex="-1" hidden>
        <header class="section-heading">
          <div>
            <p class="eyebrow">Job detail</p>
            <h2 id="job-detail-heading">Finalized execution evidence</h2>
            <p>One immutable job receipt, its profile boundary, safe evaluation summaries, and the ordered evidence path that produced the final outcome.</p>
          </div>
          <div class="detail-heading-actions">
            <span class="read-only-badge">Read only</span>
            <a class="text-link" href="#jobs" data-job-detail-back>Back to Jobs</a>
          </div>
        </header>
        <section class="overview-state" data-job-detail-message data-state="empty" role="status" aria-live="polite" aria-atomic="true">
          <div class="state-mark" aria-hidden="true">→</div>
          <div>
            <h3 data-job-detail-message-title>Select a finalized job</h3>
            <p data-job-detail-message-detail>Open a Job ID from the finalized Jobs explorer to inspect its immutable evidence path.</p>
          </div>
        </section>
        <section class="job-detail-content" data-job-detail-content hidden>
          <div class="detail-identity">
            <div>
              <p class="eyebrow">Immutable receipt</p>
              <h3 data-job-detail-title>Waiting for a finalized job.</h3>
              <p class="detail-subtitle" data-job-detail-subtitle></p>
            </div>
            <div data-job-detail-status></div>
          </div>
          <dl class="boundary-grid" data-job-detail-boundary aria-label="Immutable execution boundary"></dl>
          <section class="detail-section" aria-labelledby="job-detail-model-usage-title">
            <div class="detail-section-heading">
              <div>
                <p class="eyebrow">Provider telemetry</p>
                <h3 id="job-detail-model-usage-title">Model and token usage</h3>
              </div>
              <p data-job-detail-model-usage-summary>Usage was not reported for this job.</p>
            </div>
            <div class="detail-metric-grid" data-job-detail-model-usage-metrics></div>
            <div class="source-grid" data-job-detail-model-usage-models></div>
          </section>
          <section class="detail-section" aria-labelledby="job-detail-outcome-title">
            <div class="detail-section-heading">
              <div>
                <p class="eyebrow">Final evaluation</p>
                <h3 id="job-detail-outcome-title">Outcome against profile</h3>
              </div>
              <p data-job-detail-evaluation-id></p>
            </div>
            <div class="detail-metric-grid" data-job-detail-metrics></div>
            <div class="predicate-grid">
              <section class="predicate-panel">
                <h4>Outcomes</h4>
                <div data-job-detail-outcomes></div>
              </section>
              <section class="predicate-panel">
                <h4>Constraints</h4>
                <div data-job-detail-constraints></div>
              </section>
              <section class="predicate-panel">
                <h4>Execution discipline</h4>
                <dl data-job-detail-discipline></dl>
              </section>
            </div>
          </section>
          <section class="detail-section" data-job-detail-criteria-section aria-labelledby="job-detail-criteria-title" hidden>
            <div class="detail-section-heading">
              <div>
                <p class="eyebrow">Explainable eval</p>
                <h3 id="job-detail-criteria-title">Criterion results</h3>
              </div>
              <p data-job-detail-criteria-summary></p>
            </div>
            <div class="criterion-results" data-job-detail-criteria></div>
          </section>
          <section class="detail-section" aria-labelledby="job-detail-timeline-title">
            <div class="detail-section-heading">
              <div>
                <p class="eyebrow">Evidence path</p>
                <h3 id="job-detail-timeline-title">Ordered execution timeline</h3>
              </div>
              <p data-job-detail-timeline-summary></p>
            </div>
            <ol class="evidence-timeline" data-job-detail-timeline></ol>
          </section>
          <div class="detail-lower-grid">
            <section class="detail-section" aria-labelledby="job-detail-previews-title">
              <div class="detail-section-heading">
                <div>
                  <p class="eyebrow">Before finalization</p>
                  <h3 id="job-detail-previews-title">Preview history</h3>
                </div>
                <p data-job-detail-preview-summary></p>
              </div>
              <div class="preview-list" data-job-detail-previews></div>
            </section>
            <section class="detail-section" aria-labelledby="job-detail-sources-title">
              <div class="detail-section-heading">
                <div>
                  <p class="eyebrow">Frozen snapshot</p>
                  <h3 id="job-detail-sources-title">Evidence sources</h3>
                </div>
              </div>
              <div class="source-grid" data-job-detail-sources></div>
            </section>
          </div>
          <section class="finding-panel detail-findings" data-job-detail-findings hidden aria-labelledby="job-detail-findings-title">
            <div>
              <p class="eyebrow">Review</p>
              <h3 id="job-detail-findings-title">Data-quality findings</h3>
            </div>
            <ul data-job-detail-findings-list></ul>
          </section>
        </section>
      </section>
      <div class="section-grid future-grid" aria-label="Planned observability views">
        <section id="exceptions" class="placeholder-card" tabindex="-1">
          <span class="card-index">04</span>
          <div><h2>Exceptions</h2><p>Missing evidence, low confidence, denials, retries, replays, and late evidence.</p></div>
          <span class="phase">Planned</span>
        </section>
      </div>
    </main>
  </div>
  <footer>Authenticated and tenant-scoped. No gateway credential is stored in browser JavaScript.</footer>
</body>
</html>`;

const APP_CSS = `:root {
  color-scheme: light;
  --bg: #f2f0ea;
  --surface: #fbfaf6;
  --surface-strong: #ffffff;
  --ink: #16221d;
  --muted: #667069;
  --line: #d8d6cf;
  --green: #164f3c;
  --green-soft: #dce9df;
  --amber: #9d6818;
  --red: #a33831;
  --blue: #315d75;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--ink); line-height: 1.5; }
a { color: inherit; }
.skip-link { position: fixed; left: 12px; top: -80px; z-index: 100; padding: 10px 14px; background: var(--ink); color: white; border-radius: 4px; }
.skip-link:focus { top: 12px; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 84px; padding: 16px 28px; border-bottom: 1px solid var(--line); background: rgba(251, 250, 246, 0.96); }
h1, h2, p { margin: 0; }
h1 { font-family: Georgia, "Times New Roman", serif; font-size: clamp(1.45rem, 2.5vw, 2rem); font-weight: 500; letter-spacing: -0.025em; }
h2 { font-size: 1rem; line-height: 1.3; }
.eyebrow { margin-bottom: 3px; color: var(--muted); font-size: 0.68rem; font-weight: 800; letter-spacing: 0.13em; text-transform: uppercase; }
.brand-lockup { min-width: 0; }
.brand-description { max-width: 660px; color: var(--muted); font-size: 0.72rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.topbar-context { display: flex; align-items: center; gap: 16px; }
.repo-link { padding: 7px 9px; border: 1px solid var(--line); border-radius: 4px; color: var(--green); font-size: 0.7rem; font-weight: 800; text-decoration: none; white-space: nowrap; }
.repo-label-short { display: none; }
.repo-link:hover, .repo-link:focus-visible { background: var(--green-soft); outline: 3px solid color-mix(in srgb, var(--green) 25%, transparent); outline-offset: 2px; }
.account-context { display: flex; align-items: stretch; gap: 14px; min-width: 0; padding: 10px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface-strong); }
.identity { display: grid; align-content: center; gap: 1px; min-width: 150px; padding-left: 14px; border-left: 1px solid var(--line); color: var(--muted); font-size: 0.7rem; text-align: left; }
.identity small, .workspace-heading span { color: var(--muted); font-size: 0.61rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; }
.identity strong { max-width: 220px; color: var(--ink); font-size: 0.72rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.identity [data-tenant] { color: var(--ink); font-weight: 800; }
.logout-link { justify-self: start; margin-top: 2px; color: var(--green); font-size: 0.65rem; font-weight: 900; text-underline-offset: 3px; }
.logout-link:hover, .logout-link:focus-visible { outline: 2px solid color-mix(in srgb, var(--green) 25%, transparent); outline-offset: 2px; }
.layout { display: grid; grid-template-columns: 190px minmax(0, 1fr); max-width: 1440px; margin: 0 auto; }
.section-nav { position: sticky; top: 0; align-self: start; display: grid; gap: 4px; padding: 28px 18px; }
.section-nav a { padding: 9px 11px; border-left: 2px solid transparent; color: var(--muted); font-size: 0.82rem; font-weight: 700; text-decoration: none; }
.section-nav a:hover, .section-nav a:focus-visible, .section-nav a[aria-current="page"] { border-color: var(--green); color: var(--ink); background: var(--green-soft); outline: none; }
main { min-width: 0; padding: 28px 28px 48px 0; }
.status-card { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 14px; align-items: center; margin-bottom: 16px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); }
.status-card p:last-child { color: var(--muted); font-size: 0.82rem; }
.status-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--blue); box-shadow: 0 0 0 5px color-mix(in srgb, var(--blue) 14%, transparent); }
.status-card[data-state="ready"] .status-dot { background: var(--green); box-shadow: 0 0 0 5px color-mix(in srgb, var(--green) 14%, transparent); }
.status-card[data-state="stale"] .status-dot { background: var(--amber); box-shadow: 0 0 0 5px color-mix(in srgb, var(--amber) 14%, transparent); }
.status-card[data-state="unauthorized"] .status-dot, .status-card[data-state="forbidden"] .status-dot, .status-card[data-state="unavailable"] .status-dot { background: var(--red); box-shadow: 0 0 0 5px color-mix(in srgb, var(--red) 14%, transparent); }
.intro { display: grid; grid-template-columns: minmax(0, 1fr) minmax(410px, auto); gap: 24px; align-items: center; padding: 18px 22px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface-strong); }
.intro h2 { margin-bottom: 2px; font-family: Georgia, "Times New Roman", serif; font-size: clamp(1.4rem, 2.4vw, 2rem); font-weight: 400; letter-spacing: -0.035em; }
.intro-copy > p:last-child { max-width: 650px; color: var(--muted); font-size: 0.8rem; }
.intro dl { grid-template-columns: repeat(3, minmax(120px, 1fr)); align-self: stretch; min-width: 410px; border-top: 0; }
.intro dl div { display: block; padding: 7px 12px; border-bottom: 0; border-left: 1px solid var(--line); }
.intro dt { font-size: 0.61rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
.intro dd { margin-top: 2px; font-size: 0.74rem; overflow-wrap: anywhere; }
dl { display: grid; align-content: end; margin: 0; border-top: 1px solid var(--line); }
dl div { display: grid; grid-template-columns: 90px 1fr; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 0.78rem; }
dt { color: var(--muted); } dd { margin: 0; font-weight: 800; }
.lifecycle-panel { margin-top: 10px; padding: 0 18px; border: 1px solid var(--line); border-radius: 6px; background: #111a16; color: #f6f8f5; }
.lifecycle-panel .eyebrow { color: #98b5a4; }
.lifecycle-disclosure summary { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 14px; align-items: center; padding: 13px 0; color: #c8d7cf; cursor: pointer; list-style: none; }
.lifecycle-disclosure summary::-webkit-details-marker { display: none; }
.lifecycle-disclosure summary::after { width: 8px; height: 8px; border-right: 1px solid #9fc6ad; border-bottom: 1px solid #9fc6ad; content: ""; transform: translateY(-2px) rotate(45deg); transition: transform 160ms ease; }
.lifecycle-disclosure summary:hover { color: #f6f8f5; }
.lifecycle-disclosure summary:focus-visible { border-radius: 3px; outline: 2px solid #9fc6ad; outline-offset: 5px; }
.lifecycle-disclosure[open] summary { margin-bottom: 14px; border-bottom: 1px solid #34443b; }
.lifecycle-disclosure[open] summary::after { transform: translateY(2px) rotate(225deg); }
.lifecycle-summary-copy { display: flex; gap: 14px; align-items: baseline; min-width: 0; }
.lifecycle-summary-copy .eyebrow { flex: 0 0 auto; margin: 0; }
.lifecycle-visible-title { flex: 0 0 auto; color: #f6f8f5; font-family: Georgia, "Times New Roman", serif; font-size: 1.02rem; line-height: 1.2; }
.lifecycle-purpose { min-width: 0; overflow: hidden; color: #aebdb5; font-size: 0.72rem; text-overflow: ellipsis; white-space: nowrap; }
.lifecycle-toggle { font-size: 0.65rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; }
.disclosure-open { display: none; }
.lifecycle-disclosure[open] .disclosure-closed { display: none; }
.lifecycle-disclosure[open] .disclosure-open { display: inline; }
.lifecycle-track { display: grid; grid-template-columns: repeat(9, minmax(0, 1fr)); gap: 14px; margin: 0; padding: 0; list-style: none; }
.lifecycle-track li { position: relative; min-width: 0; min-height: 134px; padding: 13px 11px; border: 1px solid #34443b; border-radius: 5px; background: #1b2621; }
.lifecycle-track li:not(:last-child)::after { position: absolute; z-index: 1; top: 50%; right: -10px; width: 7px; height: 7px; border-right: 1px solid #8ba397; border-bottom: 1px solid #8ba397; content: ""; transform: translateY(-50%) rotate(-45deg); }
.lifecycle-track h3 { margin: 10px 0 6px; font-size: 0.77rem; line-height: 1.25; }
.lifecycle-track p { color: #aebdb5; font-size: 0.68rem; line-height: 1.4; }
.stage-number { display: inline-block; color: #9fc6ad; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.63rem; font-weight: 800; letter-spacing: 0.08em; }
.section-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }
.placeholder-card { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 16px; align-items: start; min-height: 145px; padding: 20px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); }
.placeholder-card:target, .placeholder-card:focus-visible { outline: 3px solid color-mix(in srgb, var(--green) 35%, transparent); outline-offset: 2px; }
.placeholder-card h2 { margin: 2px 0 8px; font-size: 1.05rem; }
.placeholder-card p { color: var(--muted); font-size: 0.82rem; }
.card-index { color: var(--green); font-family: Georgia, "Times New Roman", serif; font-size: 1.25rem; }
.phase { padding: 4px 7px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: 0.65rem; font-weight: 800; text-transform: uppercase; white-space: nowrap; }
footer { padding: 16px 28px; border-top: 1px solid var(--line); color: var(--muted); text-align: center; font-size: 0.72rem; }
@media (max-width: 820px) {
  .layout { display: block; }
  .section-nav { position: static; grid-template-columns: repeat(6, max-content); overflow-x: auto; padding: 10px 14px; border-bottom: 1px solid var(--line); }
  .section-nav a { border-left: 0; border-bottom: 2px solid transparent; }
  main { padding: 16px; }
  .intro { grid-template-columns: 1fr; gap: 12px; padding: 16px 18px; }
  .intro dl { min-width: 0; }
  .section-grid { grid-template-columns: 1fr; }
}
@media (max-width: 520px) {
  .placeholder-card { grid-template-columns: auto minmax(0, 1fr); }
  .phase { grid-column: 2; justify-self: start; }
}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }

[hidden] { display: none !important; }
button, input, select { font: inherit; }
button { cursor: pointer; }
.status-card { grid-template-columns: auto minmax(0, 1fr) auto; }
.status-card[data-state="partial"] .status-dot,
.status-card[data-state="stale"] .status-dot {
  background: var(--amber);
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--amber) 14%, transparent);
}
.primary-button,
.text-button {
  min-height: 40px;
  padding: 9px 14px;
  border: 1px solid var(--green);
  border-radius: 4px;
  font-weight: 800;
}
.primary-button { background: var(--green); color: white; }
.text-button { background: transparent; color: var(--green); }
.primary-button:hover,
.primary-button:focus-visible { background: #0f3f30; outline: 3px solid color-mix(in srgb, var(--green) 25%, transparent); outline-offset: 2px; }
.text-button:hover,
.text-button:focus-visible { background: var(--green-soft); outline: 3px solid color-mix(in srgb, var(--green) 25%, transparent); outline-offset: 2px; }
.overview-panel,
.jobs-panel,
.job-detail-panel {
  margin-top: 12px;
  padding: clamp(20px, 3vw, 34px);
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface-strong);
}
.overview-panel:target,
.overview-panel:focus-visible,
.jobs-panel:target,
.jobs-panel:focus-visible,
.job-detail-panel:target,
.job-detail-panel:focus-visible { outline: 3px solid color-mix(in srgb, var(--green) 35%, transparent); outline-offset: 2px; }
.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--line);
}
.section-heading h2 { margin-bottom: 6px; font-family: Georgia, "Times New Roman", serif; font-size: clamp(1.7rem, 3vw, 2.6rem); font-weight: 400; letter-spacing: -0.035em; }
.section-heading p:last-child { max-width: 760px; color: var(--muted); font-size: 0.87rem; }
.read-only-badge {
  flex: none;
  padding: 5px 9px;
  border: 1px solid var(--green);
  border-radius: 999px;
  color: var(--green);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.filter-form { margin: 22px 0 16px; }
.filter-form fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
.filter-form legend { margin-bottom: 10px; font-size: 0.78rem; font-weight: 800; }
.filter-grid { display: grid; grid-template-columns: repeat(3, minmax(150px, 1fr)); gap: 12px; }
.filter-grid label { display: grid; gap: 5px; color: var(--muted); font-size: 0.72rem; font-weight: 800; }
.filter-grid input,
.filter-grid select {
  width: 100%;
  min-height: 42px;
  padding: 9px 10px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--surface);
  color: var(--ink);
}
.filter-grid input:focus,
.filter-grid select:focus { border-color: var(--green); outline: 3px solid color-mix(in srgb, var(--green) 18%, transparent); }
.filter-actions { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
.filter-actions p { margin-left: auto; color: var(--muted); font-size: 0.72rem; text-align: right; }
.overview-state {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 14px;
  align-items: center;
  padding: 18px;
  border: 1px dashed var(--line);
  border-radius: 5px;
  background: var(--surface);
}
.overview-state h3 { margin: 0 0 3px; font-size: 0.98rem; }
.overview-state p { color: var(--muted); font-size: 0.82rem; }
.overview-state[data-state="empty"] { border-color: var(--blue); }
.overview-state[data-state="unauthorized"],
.overview-state[data-state="forbidden"],
.overview-state[data-state="unavailable"] { border-color: var(--red); background: #fff6f4; }
.state-mark { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: var(--green-soft); color: var(--green); font-size: 1.05rem; font-weight: 900; }
.overview-state[data-state="unauthorized"] .state-mark,
.overview-state[data-state="forbidden"] .state-mark,
.overview-state[data-state="unavailable"] .state-mark { background: #f7deda; color: var(--red); }
.overview-content { display: grid; gap: 14px; }
.overview-summary {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(360px, 1.5fr);
  gap: 18px;
  align-items: end;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--surface);
}
.overview-summary h3 { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 1.35rem; font-weight: 400; }
.summary-totals { display: grid; grid-template-columns: repeat(4, minmax(72px, 1fr)); gap: 8px; border: 0; }
.summary-totals div { display: block; padding: 0 0 0 10px; border: 0; border-left: 1px solid var(--line); }
.summary-totals dt { font-size: 0.65rem; text-transform: uppercase; }
.summary-totals dd { margin-top: 3px; font-size: 1.15rem; }
.finding-panel {
  display: grid;
  grid-template-columns: minmax(170px, 0.35fr) minmax(0, 1fr);
  gap: 20px;
  padding: 18px;
  border: 1px solid #d9bd86;
  border-radius: 5px;
  background: #fff8e9;
}
.finding-panel h3 { margin: 0; font-size: 0.92rem; }
.finding-panel ul,
.quality-findings ul { margin: 0; padding-left: 18px; color: #6a4c18; font-size: 0.8rem; }
.rollup-list { display: grid; gap: 14px; }
.profile-card { border: 1px solid var(--line); border-radius: 6px; background: var(--surface); overflow: hidden; }
.profile-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px;
  border-bottom: 1px solid var(--line);
  background: #f7f5ef;
}
.profile-heading { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; }
.profile-heading h3 { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 1.45rem; font-weight: 400; }
.version-badge,
.sample-badge { padding: 4px 7px; border-radius: 999px; font-size: 0.65rem; font-weight: 800; }
.version-badge { border: 1px solid var(--line); color: var(--muted); }
.sample-badge { background: var(--green-soft); color: var(--green); }
.sample-badge[data-small-sample="true"] { background: #f8e7c5; color: #765013; }
.digest { display: block; margin-top: 7px; color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.7rem; overflow-wrap: anywhere; }
.profile-body { display: grid; gap: 14px; padding: 20px; }
.metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }
.metric-card { min-width: 0; padding: 14px; border: 1px solid var(--line); border-radius: 5px; background: var(--surface-strong); }
.metric-card span { display: block; color: var(--muted); font-size: 0.67rem; font-weight: 800; text-transform: uppercase; }
.metric-card strong { display: block; margin: 5px 0 2px; font-family: Georgia, "Times New Roman", serif; font-size: 1.7rem; font-weight: 400; }
.metric-card small { color: var(--muted); font-size: 0.68rem; }
.profile-columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.distribution,
.discipline,
.quality-findings { min-width: 0; padding: 15px; border: 1px solid var(--line); border-radius: 5px; background: var(--surface-strong); }
.distribution h4,
.discipline h4,
.quality-findings h4 { margin: 0 0 10px; font-size: 0.78rem; }
.distribution table,
.discipline table { width: 100%; border-collapse: collapse; font-size: 0.72rem; }
.distribution caption,
.discipline caption { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.distribution th,
.distribution td,
.discipline th,
.discipline td { padding: 7px 4px; border-top: 1px solid var(--line); text-align: right; }
.distribution th:first-child,
.discipline th:first-child { text-align: left; }
.distribution thead th,
.discipline thead th { border-top: 0; color: var(--muted); font-size: 0.62rem; text-transform: uppercase; }
.distribution progress { display: block; width: 100%; height: 5px; margin-top: 4px; accent-color: var(--green); }
.distribution tr[data-category="indeterminate"] progress,
.distribution tr[data-category="low"] progress,
.distribution tr[data-category="fail"] progress { accent-color: var(--amber); }
.discipline-and-quality { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(230px, 0.65fr); gap: 10px; }
.quality-totals { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 10px; }
.quality-totals div { padding: 7px; border-left: 2px solid var(--amber); background: #fff8e9; }
.quality-totals strong { display: block; font-size: 1rem; }
.quality-totals span { color: var(--muted); font-size: 0.6rem; text-transform: uppercase; }
.window-note { color: var(--muted); font-size: 0.7rem; }
.jobs-filter-grid { grid-template-columns: repeat(3, minmax(170px, 1fr)); }
.jobs-content { display: grid; gap: 14px; }
.jobs-summary {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 18px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--surface);
}
.jobs-summary h3 { font-family: Georgia, "Times New Roman", serif; font-size: 1.2rem; font-weight: 400; }
.jobs-summary > p { max-width: 52%; text-align: right; }
.jobs-table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 5px; }
.jobs-table { width: 100%; min-width: 1240px; border-collapse: collapse; background: var(--surface-strong); font-size: 0.72rem; }
.jobs-table caption { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.jobs-table th,
.jobs-table td { padding: 11px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
.jobs-table thead th { background: #f7f5ef; color: var(--muted); font-size: 0.62rem; letter-spacing: 0.05em; text-transform: uppercase; }
.jobs-table tbody tr:last-child th,
.jobs-table tbody tr:last-child td { border-bottom: 0; }
.jobs-table code { display: block; max-width: 200px; color: var(--muted); font-size: 0.65rem; overflow-wrap: anywhere; }
.job-link { color: var(--green); font-weight: 800; text-decoration-thickness: 1px; text-underline-offset: 2px; overflow-wrap: anywhere; }
.cell-stack { display: grid; gap: 3px; }
.cell-stack small { color: var(--muted); font-size: 0.65rem; }
.status-pill { display: inline-flex; width: max-content; padding: 3px 6px; border-radius: 999px; background: var(--green-soft); color: var(--green); font-size: 0.62rem; font-weight: 800; text-transform: capitalize; }
.status-pill[data-state="partial"],
.status-pill[data-state="failed"],
.status-pill[data-state="indeterminate"],
.status-pill[data-state="insufficient_evidence"],
.status-pill[data-state="low"] { background: #f8e7c5; color: #765013; }
.status-pill[data-state="disabled"] { background: color-mix(in srgb, var(--red) 11%, white); color: var(--red); }
.job-findings { margin: 2px 0 0; padding-left: 14px; color: #765013; font-size: 0.62rem; }
.jobs-pagination { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.jobs-pagination p { color: var(--muted); font-size: 0.72rem; }
.detail-heading-actions { display: grid; justify-items: end; gap: 10px; }
.text-link { color: var(--green); font-size: 0.74rem; font-weight: 800; text-underline-offset: 3px; }
.job-detail-panel > .overview-state { margin-top: 18px; }
.job-detail-content { display: grid; gap: 14px; margin-top: 18px; }
.detail-identity {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--surface);
}
.detail-identity h3 { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 1.45rem; font-weight: 400; overflow-wrap: anywhere; }
.detail-subtitle { margin-top: 4px; color: var(--muted); font-size: 0.76rem; overflow-wrap: anywhere; }
.boundary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0; border: 1px solid var(--line); border-radius: 5px; background: var(--surface-strong); }
.boundary-grid div { min-width: 0; padding: 13px 14px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.boundary-grid div:nth-child(3n) { border-right: 0; }
.boundary-grid div:nth-last-child(-n+3) { border-bottom: 0; }
.boundary-grid dt { color: var(--muted); font-size: 0.62rem; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; }
.boundary-grid dd { margin: 4px 0 0; font-size: 0.74rem; font-weight: 700; overflow-wrap: anywhere; }
.detail-section { min-width: 0; padding: 18px; border: 1px solid var(--line); border-radius: 5px; background: var(--surface-strong); }
.detail-section-heading { display: flex; align-items: end; justify-content: space-between; gap: 18px; margin-bottom: 14px; padding-bottom: 11px; border-bottom: 1px solid var(--line); }
.detail-section-heading h3 { margin: 0; font-size: 0.95rem; }
.detail-section-heading > p { max-width: 52%; color: var(--muted); font-size: 0.68rem; text-align: right; overflow-wrap: anywhere; }
.detail-metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }
.predicate-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; margin-top: 9px; }
.predicate-panel { min-width: 0; padding: 14px; border: 1px solid var(--line); border-radius: 5px; background: var(--surface); }
.predicate-panel h4 { margin: 0 0 9px; font-size: 0.76rem; }
.predicate-list { display: grid; gap: 7px; margin: 0; padding: 0; list-style: none; }
.predicate-list li { padding-top: 7px; border-top: 1px solid var(--line); }
.predicate-list li:first-child { padding-top: 0; border-top: 0; }
.predicate-list strong { display: block; font-size: 0.7rem; overflow-wrap: anywhere; }
.predicate-list p { color: var(--muted); font-size: 0.65rem; }
.predicate-panel dl { display: grid; grid-template-columns: 1fr auto; gap: 7px 12px; margin: 0; font-size: 0.68rem; }
.predicate-panel dt { color: var(--muted); }
.predicate-panel dd { margin: 0; font-weight: 800; text-align: right; }
.evidence-timeline { position: relative; display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.timeline-entry { position: relative; display: grid; grid-template-columns: 34px 150px minmax(0, 1fr); gap: 12px; min-width: 0; padding: 0 0 18px; }
.timeline-entry:last-child { padding-bottom: 0; }
.timeline-entry::before { position: absolute; top: 28px; bottom: 0; left: 16px; width: 1px; background: var(--line); content: ""; }
.timeline-entry:last-child::before { display: none; }
.timeline-sequence { z-index: 1; display: grid; place-items: center; width: 33px; height: 33px; border: 1px solid var(--green); border-radius: 50%; background: var(--surface-strong); color: var(--green); font-size: 0.68rem; font-weight: 900; }
.timeline-time { padding-top: 5px; color: var(--muted); font-size: 0.66rem; }
.timeline-time[data-missing="true"] { color: var(--amber); font-weight: 800; }
.timeline-body { min-width: 0; padding: 11px 13px; border: 1px solid var(--line); border-radius: 5px; background: var(--surface); }
.timeline-title { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
.timeline-title strong { font-size: 0.76rem; }
.timeline-title code { color: var(--muted); font-size: 0.62rem; overflow-wrap: anywhere; }
.timeline-metadata { display: flex; flex-wrap: wrap; gap: 5px 10px; margin-top: 7px; color: var(--muted); font-size: 0.66rem; }
.timeline-findings { margin: 7px 0 0; padding-left: 16px; color: #765013; font-size: 0.65rem; }
.detail-lower-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.preview-list { display: grid; gap: 8px; }
.preview-card { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 11px; border: 1px solid var(--line); border-radius: 5px; background: var(--surface); }
.preview-card strong { display: block; font-size: 0.72rem; overflow-wrap: anywhere; }
.preview-card small { color: var(--muted); font-size: 0.65rem; }
.source-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.source-card { min-width: 0; padding: 11px; border-left: 3px solid var(--green); background: var(--surface); }
.criterion-results { display: grid; gap: 9px; }
.criterion-result { display: grid; gap: 7px; padding: 12px; border: 1px solid var(--line); border-left: 3px solid var(--green); border-radius: 5px; background: var(--surface-strong); }
.criterion-result[data-state="fail"], .criterion-result[data-state="insufficient_evidence"] { border-left-color: var(--amber); }
.criterion-result header { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
.criterion-result h4, .criterion-result p, .criterion-result dl { margin: 0; }
.criterion-result p, .criterion-result dd { color: var(--muted); font-size: 0.72rem; }
.criterion-result dl { display: grid; gap: 4px; }
.criterion-result dl > div { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 9px; }
.criterion-result dt { color: var(--muted); font-size: 0.62rem; font-weight: 800; text-transform: uppercase; }
.criterion-result dd { overflow-wrap: anywhere; }
.source-card strong { display: block; font-family: Georgia, "Times New Roman", serif; font-size: 1.25rem; font-weight: 400; }
.source-card span { display: block; color: var(--muted); font-size: 0.64rem; font-weight: 800; text-transform: capitalize; }
.source-card code { display: block; margin-top: 5px; color: var(--muted); font-size: 0.57rem; overflow-wrap: anywhere; }
.detail-findings { grid-template-columns: minmax(170px, 0.35fr) minmax(0, 1fr); }
.future-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.future-grid .placeholder-card { min-height: 130px; }
.workspace-control { display: grid; align-content: center; gap: 5px; min-width: min(330px, 42vw); text-align: left; }
.workspace-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.workspace-heading small { color: var(--muted); font-size: 0.61rem; white-space: nowrap; }
.workspace-actions { display: grid; grid-template-columns: minmax(150px, 1fr) auto; gap: 7px; align-items: stretch; }
.workspace-control select { min-width: 0; width: 100%; padding: 6px 24px 6px 8px; border: 1px solid var(--line); border-radius: 4px; background: var(--surface); color: var(--ink); }
.workspace-control a { display: grid; place-items: center; padding: 5px 8px; border: 1px solid var(--line); border-radius: 4px; color: var(--green); font-size: 0.64rem; font-weight: 900; text-decoration: none; }
.workspace-control a:hover, .workspace-control a:focus-visible { background: var(--green-soft); outline: 2px solid color-mix(in srgb, var(--green) 25%, transparent); outline-offset: 1px; }
.migration-card { margin-bottom: 14px; border-color: var(--amber); background: #fff8e8; }
.setup-panel { margin-top: 12px; padding: 22px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface-strong); }
.setup-panel > .section-heading { margin-bottom: 14px; }
.role-badge { align-self: start; padding: 5px 9px; border: 1px solid var(--green); border-radius: 999px; color: var(--green); font-size: 0.67rem; font-weight: 900; text-transform: capitalize; }
.setup-notice { margin-bottom: 14px; padding: 13px 15px; border-left: 3px solid var(--green); background: var(--green-soft); }
.setup-notice h3 { margin: 0 0 3px; font-size: 0.85rem; }
.setup-notice p, .setup-card > p { color: var(--muted); font-size: 0.75rem; }
.setup-notice[data-state="error"] { border-color: var(--red); background: color-mix(in srgb, var(--red) 8%, white); }
.setup-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.setup-grid + .setup-grid { margin-top: 12px; }
.setup-summary-grid { margin-bottom: 12px; }
.setup-card { min-width: 0; padding: 17px; border: 1px solid var(--line); border-radius: 5px; background: var(--surface); }
.setup-card h3 { margin: 0 0 10px; font-size: 0.95rem; }
.setup-card h4 { margin: 18px 0 8px; font-size: 0.76rem; }
.setup-card label, .inline-setup-form label { display: grid; gap: 4px; margin: 10px 0; color: var(--muted); font-size: 0.7rem; font-weight: 800; }
.setup-card input, .setup-card select, .setup-card textarea { width: 100%; min-height: 40px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 4px; background: var(--surface-strong); color: var(--ink); font: inherit; }
.setup-card .primary-button { margin-top: 6px; }
.setup-wide { grid-column: 1 / -1; }
.setup-card-heading { display: flex; justify-content: space-between; gap: 12px; }
.workspace-actions { margin-top: 12px; }
.join-workspace-card[data-connected="true"] { grid-column: 1 / -1; padding: 0; }
.join-workspace-toggle { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 16px; padding: 13px 15px; border: 0; border-radius: 5px; background: transparent; color: var(--ink); text-align: left; cursor: pointer; }
.join-workspace-toggle:hover, .join-workspace-toggle:focus-visible { background: var(--green-soft); outline: 2px solid color-mix(in srgb, var(--green) 25%, transparent); outline-offset: 1px; }
.join-workspace-toggle strong, .join-workspace-toggle small { display: block; }
.join-workspace-toggle strong { font-size: 0.82rem; }
.join-workspace-toggle small, .join-workspace-toggle > span:last-child { color: var(--muted); font-size: 0.67rem; font-weight: 800; }
.join-workspace-form { display: grid; }
.join-workspace-card[data-connected="true"] .join-workspace-form { padding: 0 17px 17px; border-top: 1px solid var(--line); }
.join-workspace-form > p { color: var(--muted); font-size: 0.75rem; }
.inline-setup-form { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) auto; gap: 10px; align-items: end; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
.inline-setup-form label { margin: 0; }
.eval-overview-grid { grid-template-columns: 1fr; }
.eval-owner-controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }
.eval-owner-controls .inline-setup-form { grid-template-columns: repeat(2, minmax(0, 1fr)); align-content: start; margin: 0; padding-top: 17px; border-top: 1px solid var(--line); }
.eval-owner-controls .eyebrow, .eval-owner-controls h3, .eval-owner-controls .eval-description, .eval-owner-controls .eval-help, .eval-owner-controls .primary-button { grid-column: 1 / -1; }
.eval-owner-controls .primary-button { justify-self: start; }
.eval-help { margin: 0 0 12px; color: var(--muted); font-size: 0.72rem; }
.eval-route-preview { grid-column: 1 / -1; padding: 12px; border: 1px solid var(--line); border-left: 3px solid var(--green); border-radius: 5px; background: var(--soft); }
.eval-route-preview[data-state="warning"] { border-left-color: var(--amber); }
.eval-route-preview h4, .eval-route-preview p { margin: 0; }
.eval-route-preview p, .eval-route-preview li { color: var(--muted); font-size: 0.7rem; }
.eval-route-preview ul { margin: 8px 0 0; padding-left: 18px; }
.eval-list { display: grid; gap: 7px; }
.eval-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: start; padding: 11px 12px; border: 1px solid var(--line); border-radius: 5px; background: var(--surface-strong); }
.eval-row strong, .eval-row code, .eval-row small { display: block; }
.eval-row code { margin-top: 2px; color: var(--muted); font-size: 0.65rem; overflow-wrap: anywhere; }
.eval-row small { margin-top: 4px; color: var(--muted); font-size: 0.67rem; }
.eval-row-meta { display: grid; justify-items: end; gap: 4px; text-align: right; }
.source-list { display: grid; gap: 7px; }
.integration-guide { grid-column: 1 / -1; display: grid; gap: 8px; padding: 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--soft); }
.integration-guide h4, .integration-guide p, .integration-guide ol { margin: 0; }
.integration-guide ol { display: grid; gap: 5px; padding-left: 20px; color: var(--muted); }
.source-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface-strong); }
.source-row[data-state="disabled"] { border-color: color-mix(in srgb, var(--red) 24%, var(--line)); background: color-mix(in srgb, var(--red) 4%, var(--surface)); }
.source-details { display: grid; gap: 8px; min-width: 0; }
.source-heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; }
.source-heading > div { min-width: 0; }
.source-heading strong, .source-metadata code { display: block; overflow-wrap: anywhere; }
.source-field-label { display: block; margin-bottom: 2px; color: var(--muted); font-size: 0.58rem; font-weight: 900; letter-spacing: 0.09em; text-transform: uppercase; }
.source-metadata { display: flex; flex-wrap: wrap; gap: 10px 28px; }
.source-metadata > span { min-width: 150px; }
.source-metadata code, .source-metadata strong, .source-revoked { font-size: 0.68rem; }
.source-revoked { color: var(--red); font-weight: 800; }
.source-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.source-actions button { min-height: 34px; padding: 6px 9px; }
.secret-panel { display: grid; gap: 12px; margin-bottom: 14px; padding: 17px; border: 2px solid var(--amber); border-radius: 6px; background: #fff8e8; }
.secret-panel p { color: #675637; font-size: 0.75rem; }
.secret-value { display: flex; gap: 8px; align-items: center; }
.secret-value code { flex: 1; padding: 10px; border-radius: 4px; background: #201d17; color: #fff8e8; overflow-wrap: anywhere; }
.config-snippet { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 7px; align-items: start; }
.config-snippet strong { grid-column: 1 / -1; font-size: 0.7rem; }
.config-snippet pre { min-width: 0; max-height: 220px; margin: 0; padding: 10px; overflow: auto; border: 1px solid #d5c69f; border-radius: 4px; background: #fffdf7; font-size: 0.68rem; white-space: pre-wrap; overflow-wrap: anywhere; }
.member-list { display: grid; gap: 5px; margin: 0; padding: 0; list-style: none; }
.member-list li { display: flex; justify-content: space-between; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 0.7rem; }
.member-identity, .member-access { display: grid; gap: 3px; }
.member-identity { min-width: 0; }
.member-identity strong { overflow-wrap: anywhere; }
.member-identity small, .member-access small { color: var(--muted); }
.member-access { justify-items: end; text-align: right; }
.status-pill[data-state="pending"] { background: #f8e7c5; color: #765013; }
.status-pill[data-state="expired"] { background: color-mix(in srgb, var(--red) 11%, white); color: var(--red); }
.invitation-result { display: grid; gap: 7px; margin-top: 12px; padding: 10px; border: 1px solid var(--amber); background: #fff8e8; }
.invitation-result code { overflow-wrap: anywhere; font-size: 0.67rem; }
@media (max-width: 1050px) {
  .topbar { gap: 12px; min-height: 0; padding: 9px 18px; }
  .brand-lockup { flex: 1 1 auto; }
  .brand-lockup .eyebrow { margin-bottom: 0; font-size: 0.6rem; }
  .topbar h1 { font-size: 1.45rem; white-space: nowrap; }
  .brand-description { display: none; }
  .topbar-context { flex: 0 1 auto; gap: 8px; }
  .repo-label-long { display: none; }
  .repo-label-short { display: inline; }
  .repo-link { padding: 6px 7px; }
  .account-context { gap: 10px; padding: 7px 9px; }
  .workspace-control { min-width: 250px; }
  .identity { min-width: 125px; padding-left: 10px; }
  .intro { grid-template-columns: 1fr; gap: 12px; }
  .intro dl { min-width: 0; }
  .lifecycle-track { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .lifecycle-track li:nth-child(3n)::after { top: auto; right: 50%; bottom: -12px; transform: translateX(50%) rotate(45deg); }
  .filter-grid { grid-template-columns: repeat(2, minmax(150px, 1fr)); }
  .jobs-filter-grid { grid-template-columns: repeat(2, minmax(150px, 1fr)); }
  .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .detail-metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .profile-columns { grid-template-columns: 1fr; }
  .predicate-grid,
  .detail-lower-grid { grid-template-columns: 1fr; }
  .future-grid { grid-template-columns: 1fr; }
  .setup-grid { grid-template-columns: 1fr; }
  .eval-owner-controls { grid-template-columns: 1fr; }
  .setup-wide { grid-column: auto; }
}
@media (max-width: 760px) {
  .lifecycle-disclosure summary { grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; }
  .lifecycle-summary-copy { display: grid; gap: 1px; }
  .lifecycle-purpose { white-space: normal; }
  .lifecycle-track { grid-template-columns: 1fr; gap: 18px; }
  .lifecycle-track li { min-height: 0; }
  .lifecycle-track li:not(:last-child)::after,
  .lifecycle-track li:nth-child(3n)::after { top: auto; right: 50%; bottom: -12px; transform: translateX(50%) rotate(45deg); }
  .status-card { grid-template-columns: auto minmax(0, 1fr); }
  .status-card .text-button { grid-column: 2; justify-self: start; }
  .section-heading,
  .profile-header { display: grid; }
  .read-only-badge,
  .sample-badge { justify-self: start; }
  .overview-summary,
  .finding-panel,
  .discipline-and-quality { grid-template-columns: 1fr; }
  .jobs-summary { display: grid; }
  .jobs-summary > p { max-width: none; text-align: left; }
  .jobs-table-wrap { overflow: visible; border: 0; }
  .jobs-table { min-width: 0; background: transparent; }
  .jobs-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .jobs-table,
  .jobs-table tbody,
  .jobs-table tr,
  .jobs-table td { display: block; width: 100%; }
  .jobs-table tr { margin-bottom: 12px; padding: 12px; border: 1px solid var(--line); border-radius: 5px; background: var(--surface-strong); }
  .jobs-table td { display: grid; grid-template-columns: minmax(90px, 0.35fr) minmax(0, 1fr); gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--line); }
  .jobs-table td::before { color: var(--muted); content: attr(data-label); font-size: 0.62rem; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; }
  .jobs-table td:last-child { border-bottom: 0; }
  .boundary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .boundary-grid div,
  .boundary-grid div:nth-child(3n),
  .boundary-grid div:nth-last-child(-n+3) { border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .boundary-grid div:nth-child(2n) { border-right: 0; }
  .boundary-grid div:nth-last-child(-n+2) { border-bottom: 0; }
  .timeline-entry { grid-template-columns: 34px minmax(0, 1fr); }
  .timeline-time { grid-column: 2; padding-top: 0; }
  .timeline-body { grid-column: 2; }
  .summary-totals { grid-template-columns: repeat(2, 1fr); }
  .filter-actions { align-items: flex-start; flex-wrap: wrap; }
  .filter-actions p { flex-basis: 100%; margin-left: 0; text-align: left; }
  .inline-setup-form { grid-template-columns: 1fr; }
  .source-row { grid-template-columns: 1fr; }
  .source-actions { justify-content: flex-start; }
}
@media (max-width: 620px) {
  .topbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 10px; padding: 9px 12px; }
  .topbar-context { display: contents; }
  .repo-link { grid-column: 2; grid-row: 1; align-self: center; }
  .account-context { grid-column: 1 / -1; grid-row: 2; width: 100%; }
  .workspace-control { flex: 1 1 auto; min-width: 0; }
  .workspace-actions { grid-template-columns: minmax(0, 1fr) auto; }
  .identity { flex: 0 1 130px; min-width: 0; }
}
@media (max-width: 520px) {
  .filter-grid,
  .metric-grid,
  .jobs-filter-grid { grid-template-columns: 1fr; }
  .summary-totals,
  .quality-totals { grid-template-columns: repeat(2, 1fr); }
  .overview-panel,
  .jobs-panel,
  .job-detail-panel { padding: 16px; }
  .setup-panel { padding: 16px; }
  .detail-heading-actions { justify-items: start; }
  .detail-identity,
  .detail-section-heading { display: grid; }
  .detail-section-heading > p { max-width: none; text-align: left; }
  .boundary-grid,
  .detail-metric-grid,
  .source-grid { grid-template-columns: 1fr; }
  .boundary-grid div,
  .boundary-grid div:nth-child(2n),
  .boundary-grid div:nth-child(3n),
  .boundary-grid div:nth-last-child(-n+2),
  .boundary-grid div:nth-last-child(-n+3) { border-right: 0; border-bottom: 1px solid var(--line); }
  .boundary-grid div:last-child { border-bottom: 0; }
  .profile-body,
  .profile-header { padding: 16px; }
  .distribution,
  .discipline { overflow-x: auto; }
}
@media (max-width: 380px) {
  .account-context { display: grid; gap: 8px; }
  .identity { padding: 7px 0 0; border-top: 1px solid var(--line); border-left: 0; }
}
`;

export type ConsoleAppRuntime = {
  Date: DateConstructor;
  document: Document;
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  history: Pick<History, "replaceState">;
  location: Pick<Location, "hash" | "pathname" | "search">;
};

export type ConsoleAppController = {
  buildActivityQuery(cursor?: string): URLSearchParams;
  buildJobsQuery(cursor?: string): URLSearchParams;
  buildQualityQuery(): URLSearchParams;
  loadJobDetail(jobId?: string): Promise<void>;
  loadActivity(cursor?: string): Promise<void>;
  loadJobs(cursor?: string): Promise<void>;
  loadOverview(): Promise<void>;
  loadSetup(): Promise<void>;
  loadEvals(): Promise<void>;
  ready: Promise<void>;
  showView(view: "activity" | "evals" | "job-detail" | "jobs" | "overview" | "setup"): void;
};

export function consoleApp(runtime: ConsoleAppRuntime): ConsoleAppController {
  const doc = runtime.document;
  const required = <T extends Element>(selector: string): T => {
    const node = doc.querySelector(selector);
    if (!node) throw new Error(`Console shell is missing ${selector}`);
    return node as T;
  };
  const statusCard = required<HTMLElement>("[data-status-card]");
  const statusTitle = required<HTMLElement>("[data-status-title]");
  const statusDetail = required<HTMLElement>("[data-status-detail]");
  const tenantLabel = required<HTMLElement>("[data-tenant]");
  const tenantSwitcher = required<HTMLElement>("[data-tenant-switcher]");
  const tenantSelect = required<HTMLSelectElement>("[data-tenant-select]");
  const workspaceModeLabel = required<HTMLElement>("[data-workspace-mode]");
  const workspaceManage = required<HTMLAnchorElement>("[data-workspace-manage]");
  const identityLabel = required<HTMLElement>("[data-identity-label]");
  const subjectLabel = required<HTMLElement>("[data-subject]");
  const logoutLink = required<HTMLAnchorElement>("[data-logout]");
  const refreshButton = required<HTMLButtonElement>("[data-refresh]");
  const filterForm = required<HTMLFormElement>("[data-overview-filters]");
  const resetButton = required<HTMLButtonElement>("[data-reset-filters]");
  const windowFilter = required<HTMLSelectElement>("[data-filter-window]");
  const profileKeyFilter = required<HTMLInputElement>("[data-filter-profile-key]");
  const profileVersionFilter = required<HTMLInputElement>("[data-filter-profile-version]");
  const agentFilter = required<HTMLInputElement>("[data-filter-agent]");
  const verdictFilter = required<HTMLSelectElement>("[data-filter-verdict]");
  const constraintFilter = required<HTMLSelectElement>("[data-filter-constraint]");
  const windowSummary = required<HTMLElement>("[data-window-summary]");
  const overviewMessage = required<HTMLElement>("[data-overview-message]");
  const overviewMessageTitle = required<HTMLElement>("[data-overview-message-title]");
  const overviewMessageDetail = required<HTMLElement>("[data-overview-message-detail]");
  const overviewContent = required<HTMLElement>("[data-overview-content]");
  const overviewSummary = required<HTMLElement>("[data-overview-summary]");
  const overviewTotals = required<HTMLElement>("[data-overview-totals]");
  const overviewFindings = required<HTMLElement>("[data-overview-findings]");
  const overviewFindingsList = required<HTMLElement>("[data-overview-findings-list]");
  const rollupList = required<HTMLElement>("[data-rollup-list]");
  const overviewPanel = required<HTMLElement>("[data-console-view='overview']");
  const activityPanel = required<HTMLElement>("[data-console-view='activity']");
  const jobsPanel = required<HTMLElement>("[data-console-view='jobs']");
  const jobDetailPanel = required<HTMLElement>("[data-console-view='job-detail']");
  const setupPanel = required<HTMLElement>("[data-console-view='setup']");
  const evalsPanel = required<HTMLElement>("[data-console-view='evals']");
  const qualityIntro = required<HTMLElement>("[data-overview-context='boundaries']");
  const lifecyclePanel = doc.querySelector<HTMLElement>("[data-overview-context='lifecycle']");
  const overviewNav = required<HTMLAnchorElement>("[data-nav-overview]");
  const activityNav = required<HTMLAnchorElement>("[data-nav-activity]");
  const jobsNav = required<HTMLAnchorElement>("[data-nav-jobs]");
  const evalsNav = required<HTMLAnchorElement>("[data-nav-evals]");
  const setupNav = required<HTMLAnchorElement>("[data-nav-setup]");
  const evalsRole = required<HTMLElement>("[data-evals-role]");
  const evalsMessage = required<HTMLElement>("[data-evals-message]");
  const evalsMessageTitle = required<HTMLElement>("[data-evals-message-title]");
  const evalsMessageDetail = required<HTMLElement>("[data-evals-message-detail]");
  const evalsContent = required<HTMLElement>("[data-evals-content]");
  const evalDefinitionList = required<HTMLElement>("[data-eval-definition-list]");
  const evalAssignmentList = required<HTMLElement>("[data-eval-assignment-list]");
  const evalOwnerControls = required<HTMLElement>("[data-eval-owner-controls]");
  const createEvalForm = required<HTMLFormElement>("[data-create-eval-form]");
  const evalTemplateInput = required<HTMLSelectElement>("[data-eval-template]");
  const evalTemplateDetail = required<HTMLElement>("[data-eval-template-detail]");
  const evalIdInput = required<HTMLInputElement>("[data-eval-id]");
  const evalVersionInput = required<HTMLInputElement>("[data-eval-version]");
  const evalNameInput = required<HTMLInputElement>("[data-eval-name]");
  const evalKindInput = required<HTMLSelectElement>("[data-eval-kind]");
  const evalDescriptionInput = required<HTMLTextAreaElement>("[data-eval-description]");
  const createEvalAssignmentForm = required<HTMLFormElement>("[data-create-eval-assignment-form]");
  const evalAssignmentEval = required<HTMLSelectElement>("[data-eval-assignment-eval]");
  const evalAssignmentSource = required<HTMLSelectElement>("[data-eval-assignment-source]");
  const evalAssignmentAgent = required<HTMLSelectElement>("[data-eval-assignment-agent]");
  const evalRoutePreview = required<HTMLElement>("[data-eval-route-preview]");
  const evalRoutePreviewTitle = required<HTMLElement>("[data-eval-route-preview-title]");
  const evalRoutePreviewDetail = required<HTMLElement>("[data-eval-route-preview-detail]");
  const evalRouteWarnings = required<HTMLElement>("[data-eval-route-warnings]");
  const jobDetailBack = required<HTMLAnchorElement>("[data-job-detail-back]");
  const createTenantForm = required<HTMLFormElement>("[data-create-tenant-form]");
  const createWorkspaceCard = required<HTMLElement>("[data-create-workspace-card]");
  const createTenantId = required<HTMLInputElement>("[data-create-tenant-id]");
  const createDisplayName = required<HTMLInputElement>("[data-create-display-name]");
  const createIntegration = required<HTMLSelectElement>("[data-create-integration]");
  const createIntegrationFields = required<HTMLElement>("[data-create-integration-fields]");
  const createSourceId = required<HTMLInputElement>("[data-create-source-id]");
  const createAgentId = required<HTMLInputElement>("[data-create-agent-id]");
  const joinWorkspaceCard = required<HTMLElement>("[data-join-workspace-card]");
  const joinWorkspaceIntro = required<HTMLElement>("[data-join-workspace-intro]");
  const joinWorkspaceToggle = required<HTMLButtonElement>("[data-join-workspace-toggle]");
  const joinWorkspaceToggleLabel = required<HTMLElement>("[data-join-workspace-toggle-label]");
  const redeemInviteForm = required<HTMLFormElement>("[data-redeem-invite-form]");
  const inviteCode = required<HTMLInputElement>("[data-invite-code]");
  const setupOnboarding = required<HTMLElement>("[data-setup-onboarding]");
  const tenantSetup = required<HTMLElement>("[data-tenant-setup]");
  const setupRole = required<HTMLElement>("[data-setup-role]");
  const setupMessage = required<HTMLElement>("[data-setup-message]");
  const setupMessageTitle = required<HTMLElement>("[data-setup-message-title]");
  const setupMessageDetail = required<HTMLElement>("[data-setup-message-detail]");
  const workspaceMigration = required<HTMLElement>("[data-workspace-migration]");
  const enableWorkspaceSwitching = required<HTMLButtonElement>("[data-enable-workspace-switching]");
  const ingestionTitle = required<HTMLElement>("[data-ingestion-title]");
  const ingestionDetail = required<HTMLElement>("[data-ingestion-detail]");
  const accessTitle = required<HTMLElement>("[data-access-title]");
  const accessDetail = required<HTMLElement>("[data-access-detail]");
  const sourceList = required<HTMLElement>("[data-source-list]");
  const createSourceForm = required<HTMLFormElement>("[data-create-source-form]");
  const sourceIntegration = required<HTMLSelectElement>("[data-source-integration]");
  const integrationGuideTitle = required<HTMLElement>("[data-integration-guide-title]");
  const integrationGuideDetail = required<HTMLElement>("[data-integration-guide-detail]");
  const integrationGuideSteps = required<HTMLElement>("[data-integration-guide-steps]");
  const integrationGuideLink = required<HTMLAnchorElement>("[data-integration-guide-link]");
  const sourceIdInput = required<HTMLInputElement>("[data-source-id]");
  const sourceAgentIdInput = required<HTMLInputElement>("[data-source-agent-id]");
  const inviteMembersCard = required<HTMLElement>("[data-invite-members-card]");
  const createInviteForm = required<HTMLFormElement>("[data-create-invite-form]");
  const memberEmail = required<HTMLInputElement>("[data-member-email]");
  const memberRole = required<HTMLSelectElement>("[data-member-role]");
  const memberList = required<HTMLElement>("[data-member-list]");
  const invitationResult = required<HTMLElement>("[data-invitation-result]");
  const invitationDelivery = required<HTMLElement>("[data-invitation-delivery]");
  const createdInvitationCode = required<HTMLElement>("[data-created-invitation-code]");
  const copyInvitation = required<HTMLButtonElement>("[data-copy-invitation]");
  const secretPanel = required<HTMLElement>("[data-secret-panel]");
  const sourceToken = required<HTMLElement>("[data-source-token]");
  const hermesEnvironment = required<HTMLElement>("[data-hermes-environment]");
  const hermesYaml = required<HTMLElement>("[data-hermes-yaml]");
  const setupConfigLabel = required<HTMLElement>("[data-setup-config-label]");
  const copySourceToken = required<HTMLButtonElement>("[data-copy-source-token]");
  const copyHermesEnvironment = required<HTMLButtonElement>("[data-copy-hermes-environment]");
  const copyHermesYaml = required<HTMLButtonElement>("[data-copy-hermes-yaml]");
  const dismissSecret = required<HTMLButtonElement>("[data-dismiss-secret]");
  const openActivity = required<HTMLAnchorElement>("[data-open-activity]");
  const activityFilterForm = required<HTMLFormElement>("[data-activity-filters]");
  const resetActivityButton = required<HTMLButtonElement>("[data-reset-activity-filters]");
  const activityWindowFilter = required<HTMLSelectElement>("[data-activity-filter-window]");
  const activityAgentFilter = required<HTMLSelectElement>("[data-activity-filter-agent]");
  const activityEventFilter = required<HTMLSelectElement>("[data-activity-filter-event]");
  const activityToolFilter = required<HTMLInputElement>("[data-activity-filter-tool]");
  const activityDecisionFilter = required<HTMLSelectElement>("[data-activity-filter-decision]");
  const activityExecutionFilter = required<HTMLSelectElement>("[data-activity-filter-execution]");
  const activityIntentFilter = required<HTMLSelectElement>("[data-activity-filter-intent]");
  const activityWindowSummary = required<HTMLElement>("[data-activity-window-summary]");
  const activityMessage = required<HTMLElement>("[data-activity-message]");
  const activityMessageTitle = required<HTMLElement>("[data-activity-message-title]");
  const activityMessageDetail = required<HTMLElement>("[data-activity-message-detail]");
  const activityContent = required<HTMLElement>("[data-activity-content]");
  const activitySummary = required<HTMLElement>("[data-activity-summary]");
  const activityList = required<HTMLElement>("[data-activity-list]");
  const activityPageSummary = required<HTMLElement>("[data-activity-page-summary]");
  const activityNextButton = required<HTMLButtonElement>("[data-activity-next]");
  const jobsFilterForm = required<HTMLFormElement>("[data-jobs-filters]");
  const resetJobsButton = required<HTMLButtonElement>("[data-reset-jobs-filters]");
  const jobsWindowFilter = required<HTMLSelectElement>("[data-jobs-filter-window]");
  const jobsProfileKeyFilter = required<HTMLInputElement>("[data-jobs-filter-profile-key]");
  const jobsProfileVersionFilter = required<HTMLInputElement>("[data-jobs-filter-profile-version]");
  const jobsAgentFilter = required<HTMLInputElement>("[data-jobs-filter-agent]");
  const jobsVerdictFilter = required<HTMLSelectElement>("[data-jobs-filter-verdict]");
  const jobsConstraintFilter = required<HTMLSelectElement>("[data-jobs-filter-constraint]");
  const jobsConfidenceFilter = required<HTMLSelectElement>("[data-jobs-filter-confidence]");
  const jobsJobFilter = required<HTMLInputElement>("[data-jobs-filter-job]");
  const jobsIntentFilter = required<HTMLInputElement>("[data-jobs-filter-intent]");
  const jobsWindowSummary = required<HTMLElement>("[data-jobs-window-summary]");
  const jobsMessage = required<HTMLElement>("[data-jobs-message]");
  const jobsMessageTitle = required<HTMLElement>("[data-jobs-message-title]");
  const jobsMessageDetail = required<HTMLElement>("[data-jobs-message-detail]");
  const jobsContent = required<HTMLElement>("[data-jobs-content]");
  const jobsSummary = required<HTMLElement>("[data-jobs-summary]");
  const jobsFindings = required<HTMLElement>("[data-jobs-findings]");
  const jobsList = required<HTMLElement>("[data-jobs-list]");
  const jobsPageSummary = required<HTMLElement>("[data-jobs-page-summary]");
  const jobsNextButton = required<HTMLButtonElement>("[data-jobs-next]");
  const jobDetailMessage = required<HTMLElement>("[data-job-detail-message]");
  const jobDetailMessageTitle = required<HTMLElement>("[data-job-detail-message-title]");
  const jobDetailMessageDetail = required<HTMLElement>("[data-job-detail-message-detail]");
  const jobDetailContent = required<HTMLElement>("[data-job-detail-content]");
  const jobDetailTitle = required<HTMLElement>("[data-job-detail-title]");
  const jobDetailSubtitle = required<HTMLElement>("[data-job-detail-subtitle]");
  const jobDetailStatus = required<HTMLElement>("[data-job-detail-status]");
  const jobDetailBoundary = required<HTMLElement>("[data-job-detail-boundary]");
  const jobDetailModelUsageSummary = required<HTMLElement>("[data-job-detail-model-usage-summary]");
  const jobDetailModelUsageMetrics = required<HTMLElement>("[data-job-detail-model-usage-metrics]");
  const jobDetailModelUsageModels = required<HTMLElement>("[data-job-detail-model-usage-models]");
  const jobDetailEvaluationId = required<HTMLElement>("[data-job-detail-evaluation-id]");
  const jobDetailMetrics = required<HTMLElement>("[data-job-detail-metrics]");
  const jobDetailOutcomes = required<HTMLElement>("[data-job-detail-outcomes]");
  const jobDetailConstraints = required<HTMLElement>("[data-job-detail-constraints]");
  const jobDetailDiscipline = required<HTMLElement>("[data-job-detail-discipline]");
  const jobDetailCriteriaSection = required<HTMLElement>("[data-job-detail-criteria-section]");
  const jobDetailCriteriaSummary = required<HTMLElement>("[data-job-detail-criteria-summary]");
  const jobDetailCriteria = required<HTMLElement>("[data-job-detail-criteria]");
  const jobDetailTimelineSummary = required<HTMLElement>("[data-job-detail-timeline-summary]");
  const jobDetailTimeline = required<HTMLElement>("[data-job-detail-timeline]");
  const jobDetailPreviewSummary = required<HTMLElement>("[data-job-detail-preview-summary]");
  const jobDetailPreviews = required<HTMLElement>("[data-job-detail-previews]");
  const jobDetailSources = required<HTMLElement>("[data-job-detail-sources]");
  const jobDetailFindings = required<HTMLElement>("[data-job-detail-findings]");
  const jobDetailFindingsList = required<HTMLElement>("[data-job-detail-findings-list]");
  const allowedWindows = new Set(["1", "7", "30", "90"]);
  const allowedVerdicts = new Set(["", "completed", "partial", "failed", "indeterminate"]);
  const allowedConstraints = new Set(["", "pass", "fail", "indeterminate"]);
  const allowedConfidence = new Set(["", "low", "medium", "high"]);
  const allowedActivityEvents = new Set(["", "session_started", "session_completed", "job_started", "job_completed", "tool_action", "model_request_started", "model_request_completed", "subagent_started", "subagent_completed"]);
  const allowedActivityDecisions = new Set(["", "allow", "deny", "challenge_required"]);
  const allowedActivityExecutions = new Set(["", "ok", "error", "blocked", "cancelled", "unknown"]);
  const allowedIntentBindings = new Set(["", "bound", "unbound"]);
  const statusMessages: Record<string, [string, string]> = {
    loading: ["Loading fleet quality", "Reading immutable final receipts through the tenant-scoped BFF."],
    ready: ["Fleet quality is current", "Finalized execution quality is grouped by immutable profile binding."],
    partial: ["Fleet quality has data findings", "Review excluded records, small samples, and incomplete metric coverage."],
    stale: ["Fleet quality may be stale", "The latest generated response is older than the configured freshness threshold."],
    unauthorized: ["Authentication required", "Sign in through the configured Cloudflare Access application."],
    forbidden: ["Tenant access denied", "The authenticated identity is not permitted to use this tenant console."],
    unavailable: ["Console data is unavailable", "The private AgentAction gateway cannot be reached. Try again or contact an operator."],
  };
  let tenantId = "";
  let tenantMemberships: Array<{ membership: Record<string, any>; tenant: Record<string, any> }> = [];
  let activeRole: TenantRole | "" = "";
  let workspaceMode: "directory" | "sso_fixed" = "directory";
  let publicDemo = false;
  let joinWorkspaceExpanded = false;
  function invitationCodeFromHash(hash: string): string {
    if (!hash.startsWith("#setup?")) return "";
    const value = new URLSearchParams(hash.slice("#setup?".length)).get("invite")?.trim() || "";
    return value.length <= 300 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value) ? value : "";
  }

  function invitationIdFromSearch(search: string): string {
    const values = new URLSearchParams(search).getAll("invitation");
    if (values.length !== 1) return "";
    const value = values[0].trim();
    return /^invite_[a-f0-9]{24}$/.test(value) ? value : "";
  }

  const invitationQueryPresent = new URLSearchParams(runtime.location.search).has("invitation");
  const workspacePreference = (() => {
    const values = new URLSearchParams(runtime.location.search).getAll("workspace");
    const value = values.length === 1 ? values[0].trim().slice(0, 128) : "";
    return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ? value : "";
  })();
  let pendingInvitationId = invitationIdFromSearch(runtime.location.search);
  let pendingInvitationCode = invitationCodeFromHash(runtime.location.hash);
  const invalidInvitationLink = invitationQueryPresent && !pendingInvitationId && !pendingInvitationCode;
  if (invitationQueryPresent || pendingInvitationCode) {
    const query = new URLSearchParams(runtime.location.search);
    query.delete("invitation");
    const cleanQuery = query.toString();
    runtime.history.replaceState(null, "", `${runtime.location.pathname || "/"}${cleanQuery ? `?${cleanQuery}` : ""}#setup`);
  }
  if (pendingInvitationCode) {
    inviteCode.value = pendingInvitationCode;
  }
  const initialHash = invitationQueryPresent || pendingInvitationCode ? "#setup" : runtime.location.hash.split("?", 1)[0];
  let activeView: "activity" | "evals" | "job-detail" | "jobs" | "overview" | "setup" = initialHash === "#activity"
    ? "activity"
    : initialHash === "#jobs"
      ? "jobs"
      : initialHash === "#evals"
        ? "evals"
      : initialHash === "#job-detail"
        ? "job-detail"
        : initialHash === "#setup"
          ? "setup"
        : "overview";
  let currentActivityCursor = "";
  let nextActivityCursor = "";
  let requestedActivityAgentId = "";
  let activityAgentOptionsTenantId = "";
  let currentJobId = "";
  let currentJobsCursor = "";
  let nextJobsCursor = "";
  let jobsLoaded = false;
  let evalDefinitions: Record<string, any>[] = [];
  let evalAssignments: Record<string, any>[] = [];
  let evalSources: Record<string, any>[] = [];
  let evalKnownTraffic: Record<string, any>[] = [];
  let evalKnownTrafficTruncated = false;

  function record(value: unknown): Record<string, any> {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, any>
      : {};
  }

  function safeText(value: unknown, fallback = "—"): string {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  }

  function evalDisplayName(value: unknown, fallback = "—"): string {
    const evalId = safeText(record(value).eval_id, "");
    if (evalId === "observed_execution") return "Observed execution";
    if (evalId === "agent_declared_intent") return "Agent-declared intent";
    return evalId || fallback;
  }

  function evalTrustLabel(value: unknown): string {
    const candidate = record(value);
    return candidate.trust === "agent_self_attested" || candidate.kind === "agent_declared"
      ? "Self-attested by agent"
      : candidate.trust === "trusted_execution_state" || candidate.kind === "observed_execution"
        ? "Trusted execution state"
        : "Trust not reported";
  }

  function evalTrustExplanation(value: unknown): string {
    return evalTrustLabel(value) === "Self-attested by agent"
      ? "Agent-provided claims; not independently verified"
      : "Deterministic scoring over trusted lifecycle state";
  }

  function count(value: unknown): number {
    return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : 0;
  }

  function metric(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
  }

  function rate(value: unknown): number {
    return Math.max(0, Math.min(1, metric(value)));
  }

  function formatCount(value: unknown): string {
    return count(value).toLocaleString("en-US");
  }

  function formatTokens(value: unknown): string {
    return Number.isSafeInteger(value) && Number(value) >= 0
      ? `${Number(value).toLocaleString("en-US")} token${Number(value) === 1 ? "" : "s"}`
      : "Unavailable";
  }

  function tokenComponent(value: unknown, missing = "Not reported"): string {
    return Number.isSafeInteger(value) && Number(value) >= 0 ? formatTokens(value) : missing;
  }

  function hasCompleteTokenBreakdown(value: unknown): boolean {
    const usage = record(value);
    return ["uncached_input_tokens", "cached_input_tokens", "output_tokens", "total_tokens"]
      .every((key) => Number.isSafeInteger(usage[key]) && Number(usage[key]) >= 0);
  }

  function tokenBreakdownReconciles(value: unknown): boolean {
    const usage = record(value);
    return !hasCompleteTokenBreakdown(usage)
      || Number(usage.uncached_input_tokens) + Number(usage.cached_input_tokens) + Number(usage.output_tokens) === Number(usage.total_tokens);
  }

  function tokenBreakdownLabel(value: unknown): string {
    const usage = record(value);
    return `Uncached input ${tokenComponent(usage.uncached_input_tokens)} · Cached input ${tokenComponent(usage.cached_input_tokens)} · Output ${tokenComponent(usage.output_tokens)}`;
  }

  function legacyInputLabel(value: unknown): string {
    const usage = record(value);
    return Number.isSafeInteger(usage.input_tokens) && usage.uncached_input_tokens === undefined
      ? `Provider input ${formatTokens(usage.input_tokens)} · cache breakdown not reported`
      : "";
  }

  function modelUsageLabel(value: unknown): string {
    const group = record(value);
    const model = safeText(group.model, "");
    const provider = safeText(group.provider, "");
    if (model && provider) return `${model} via ${provider}`;
    return model || provider || "Model unavailable";
  }

  function formatMetric(value: unknown, digits = 2): string {
    return metric(value).toLocaleString("en-US", { maximumFractionDigits: digits });
  }

  function formatPercent(value: unknown): string {
    const percentage = rate(value) * 100;
    return `${percentage.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
  }

  function formatDuration(value: unknown): string {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "—";
    const milliseconds = value;
    if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
    return `${(milliseconds / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} s`;
  }

  function create(tag: string, className?: string, text?: unknown): HTMLElement {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function setStatus(state: string, customDetail?: string): void {
    const message = statusMessages[state] || statusMessages.unavailable;
    statusCard.dataset.state = state;
    statusTitle.textContent = message[0];
    statusDetail.textContent = customDetail || message[1];
  }

  function setOverviewState(state: string, title: string, detail: string): void {
    overviewMessage.dataset.state = state;
    overviewMessageTitle.textContent = title;
    overviewMessageDetail.textContent = detail;
    overviewMessage.hidden = false;
  }

  function setJobsState(state: string, title: string, detail: string): void {
    jobsMessage.dataset.state = state;
    jobsMessageTitle.textContent = title;
    jobsMessageDetail.textContent = detail;
    jobsMessage.hidden = false;
  }

  function setActivityState(state: string, title: string, detail: string): void {
    activityMessage.dataset.state = state;
    activityMessageTitle.textContent = title;
    activityMessageDetail.textContent = detail;
    activityMessage.hidden = false;
  }

  function setJobDetailState(state: string, title: string, detail: string): void {
    jobDetailMessage.dataset.state = state;
    jobDetailMessageTitle.textContent = title;
    jobDetailMessageDetail.textContent = detail;
    jobDetailMessage.hidden = false;
  }

  function failureState(status: number): "unauthorized" | "forbidden" | "unavailable" {
    if (status === 401) return "unauthorized";
    if (status === 403) return "forbidden";
    return "unavailable";
  }

  function failureMessage(body: unknown, fallback: string): string {
    const rawError = record(body).error;
    if (typeof rawError === "string") return safeText(rawError, fallback);
    return safeText(record(rawError).message, fallback);
  }

  async function read(path: string): Promise<{ body: any; response: Response }> {
    const response = await runtime.fetch(path, {
      headers: { accept: "application/json" },
      credentials: "same-origin",
    });
    let body: any = {};
    try {
      body = await response.json();
    } catch {
      body = {};
    }
    return { response, body };
  }

  async function write(path: string, method: "DELETE" | "POST", body?: Record<string, unknown>): Promise<{ body: any; response: Response }> {
    const response = await runtime.fetch(path, {
      method,
      headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
      credentials: "same-origin",
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let payload: any = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    return { response, body: payload };
  }

  function setSetupMessage(state: "error" | "ready", title: string, detail: string): void {
    setupMessage.dataset.state = state;
    setupMessageTitle.textContent = title;
    setupMessageDetail.textContent = detail;
  }

  function setEvalsMessage(state: "error" | "ready", title: string, detail: string): void {
    evalsMessage.dataset.state = state;
    evalsMessageTitle.textContent = title;
    evalsMessageDetail.textContent = detail;
    evalsMessage.hidden = false;
  }

  function setJoinWorkspaceExpanded(expanded: boolean): void {
    const connected = Boolean(tenantId);
    joinWorkspaceExpanded = connected ? expanded : true;
    joinWorkspaceCard.dataset.connected = String(connected);
    joinWorkspaceIntro.hidden = connected;
    joinWorkspaceToggle.hidden = !connected;
    joinWorkspaceToggle.setAttribute("aria-expanded", String(joinWorkspaceExpanded));
    joinWorkspaceToggleLabel.textContent = joinWorkspaceExpanded ? "Close" : "Open";
    redeemInviteForm.hidden = !joinWorkspaceExpanded;
  }

  function membershipEntries(value: unknown): Array<{ membership: Record<string, any>; tenant: Record<string, any> }> {
    return Array.isArray(value)
      ? value.map(record).filter((entry) => safeText(record(entry.tenant).tenant_id, "") !== "").map((entry) => ({
        membership: record(entry.membership),
        tenant: record(entry.tenant),
      }))
      : [];
  }

  function applySession(body: Record<string, any>, preferredTenant = ""): void {
    publicDemo = body.public_demo === true;
    workspaceMode = body.workspace_mode === "sso_fixed" ? "sso_fixed" : "directory";
    setupNav.hidden = publicDemo;
    evalsNav.hidden = publicDemo;
    logoutLink.hidden = publicDemo;
    identityLabel.textContent = publicDemo ? "Viewing as" : "Signed in as";
    if (publicDemo && (activeView === "setup" || activeView === "evals")) showView("overview");
    tenantMemberships = membershipEntries(body.memberships);
    const canCreateWorkspace = tenantMemberships.length === 0 || tenantMemberships.some((entry) => safeText(entry.membership.role, "") === "owner");
    createWorkspaceCard.hidden = publicDemo || workspaceMode !== "directory" || !canCreateWorkspace;
    tenantSelect.replaceChildren();
    for (const entry of tenantMemberships) {
      const option = doc.createElement("option");
      option.value = safeText(entry.tenant.tenant_id, "");
      option.textContent = `${safeText(entry.tenant.display_name, option.value)} · ${safeText(entry.membership.role, "viewer")}`;
      tenantSelect.append(option);
    }
    if (tenantMemberships.length === 0) {
      const option = doc.createElement("option");
      option.value = "";
      option.textContent = "No workspace yet";
      tenantSelect.append(option);
    }
    const preferred = tenantMemberships.some((entry) => safeText(entry.tenant.tenant_id, "") === preferredTenant) ? preferredTenant : "";
    const defaultTenant = preferred || safeText(body.tenant_id, "") || safeText(tenantMemberships[0]?.tenant.tenant_id, "");
    selectTenant(defaultTenant);
    tenantSwitcher.hidden = publicDemo;
    tenantSelect.disabled = workspaceMode === "sso_fixed" || tenantMemberships.length < 2;
    workspaceModeLabel.textContent = workspaceMode === "sso_fixed"
      ? "Managed by SSO"
      : `${tenantMemberships.length} workspace${tenantMemberships.length === 1 ? "" : "s"}`;
    workspaceManage.hidden = publicDemo;
    tenantLabel.hidden = !publicDemo;
    setupOnboarding.hidden = publicDemo || workspaceMode !== "directory";
    workspaceMigration.hidden = true;
  }

  function selectTenant(selected: string): void {
    const previousTenantId = tenantId;
    tenantId = selected;
    if (previousTenantId && previousTenantId !== tenantId) {
      requestedActivityAgentId = "";
      activityAgentOptionsTenantId = "";
      renderActivityAgentOptions([], false);
    }
    const entry = tenantMemberships.find((candidate) => safeText(candidate.tenant.tenant_id, "") === tenantId);
    const role = safeText(entry?.membership.role, "");
    activeRole = role === "owner" || role === "operator" || role === "viewer" ? role : "";
    tenantSelect.value = tenantId;
    tenantLabel.textContent = tenantId ? `Workspace: ${tenantId}` : "No workspace yet";
    setupRole.textContent = activeRole || "Not provisioned";
    evalsRole.textContent = activeRole === "owner" ? "Owner" : "Read only";
    evalOwnerControls.hidden = activeRole !== "owner";
    setJoinWorkspaceExpanded(false);
  }

  async function refreshSession(preferredTenant = ""): Promise<boolean> {
    const session = await read("/api/console/session");
    if (!session.response.ok) {
      const state = failureState(session.response.status);
      const detail = failureMessage(session.body, statusMessages[state][1]);
      setStatus(state, detail);
      setOverviewState(state, statusMessages[state][0], detail);
      setActivityState(state, statusMessages[state][0], detail);
      setJobsState(state, statusMessages[state][0], detail);
      setJobDetailState(state, statusMessages[state][0], detail);
      return false;
    }
    applySession(record(session.body), preferredTenant);
    subjectLabel.textContent = safeText(session.body.email || session.body.subject, "Authenticated operator");
    return true;
  }

  function showOneTimeSecret(body: Record<string, any>): void {
    const token = safeText(body.source_token, "");
    if (!token) return;
    const setup = Object.keys(record(body.setup)).length > 0 ? record(body.setup) : record(body.hermes);
    const integration = safeText(setup.integration, body.hermes ? "hermes" : "agentaction");
    sourceToken.textContent = token;
    hermesEnvironment.textContent = safeText(setup.environment, "AGENTACTION_INGEST_TOKEN=<one-time-token>").replace("<one-time-token>", token);
    hermesYaml.textContent = safeText(setup.configuration || setup.yaml, "");
    setupConfigLabel.textContent = integration === "hermes" ? "Hermes configuration" : "AgentAction source configuration";
    secretPanel.hidden = false;
  }

  function clearOneTimeSecret(): void {
    sourceToken.textContent = "";
    hermesEnvironment.textContent = "";
    hermesYaml.textContent = "";
    secretPanel.hidden = true;
  }

  function clearInvitationSecret(): void {
    createdInvitationCode.textContent = "";
    invitationDelivery.textContent = "";
    invitationResult.hidden = true;
  }

  function renderIntegrationGuide(): void {
    const hermes = sourceIntegration.value === "hermes";
    integrationGuideTitle.textContent = hermes ? "Hermes Agent" : "Custom AgentAction source";
    integrationGuideDetail.textContent = hermes
      ? "Install the maintained Hermes plugin for privacy-safe activity plus explicitly labeled, agent-declared intent evaluations."
      : "Send allowlisted, privacy-safe AgentAction activity batches from your agent runtime.";
    const steps = hermes
      ? [
        "Add the source and save the token and generated configuration shown once.",
        "Install the AgentAction plugin in the Hermes environment and enable it.",
        "Apply the generated environment and YAML values. Intent capture adds bounded context and two self-attestation tools; it does not authorize actions.",
        "Restart Hermes, run one agent action, then confirm Activity and the agent-declared evaluation in Jobs.",
      ]
      : [
        "Add the source and save the token and generated configuration shown once.",
        "Instrument the agent client to send privacy-safe activity batches with the source ID and bearer token.",
        "Post batches to the workspace activity endpoint shown in the generated configuration.",
        "Run one agent action and confirm that it appears in Activity.",
      ];
    integrationGuideSteps.replaceChildren(...steps.map((step) => create("li", undefined, step)));
    integrationGuideLink.href = hermes
      ? "https://github.com/dinpd/AgentAction/tree/main/integrations/hermes-agentaction"
      : "https://github.com/dinpd/AgentAction#shadow-observability-quickstart";
  }

  async function redeemInvitation(invitation: { code?: string; invitationId?: string }, automatic = false): Promise<boolean> {
    const code = invitation.code?.trim() || "";
    const invitationId = invitation.invitationId?.trim() || "";
    if (Boolean(code) === Boolean(invitationId)) return false;
    showView("setup");
    setSetupMessage("ready", automatic ? "Joining your workspace" : "Redeeming invitation", "Confirming the signed-in email and one-time invitation.");
    const result = await write("/api/console/onboarding/invitations/redeem", "POST", invitationId
      ? { invitation_id: invitationId }
      : { code });
    if (!result.response.ok) {
      if (code) inviteCode.value = code;
      setJoinWorkspaceExpanded(true);
      setSetupMessage("error", "Invitation could not be redeemed", failureMessage(result.body, "Paste the fallback code from the invitation email, or check the signed-in email."));
      return false;
    }
    const joinedTenant = safeText(record(result.body.membership).tenant_id, "");
    pendingInvitationId = "";
    pendingInvitationCode = "";
    inviteCode.value = "";
    await refreshSession(joinedTenant);
    await loadSetup();
    setSetupMessage("ready", "Workspace joined", `You now have ${safeText(record(result.body.membership).role, "member")} access to ${joinedTenant || "the invited workspace"}.`);
    return true;
  }

  async function copyText(value: string, button: HTMLButtonElement): Promise<void> {
    const clipboard = doc.defaultView?.navigator.clipboard;
    if (!clipboard || !value) return;
    await clipboard.writeText(value);
    const original = button.textContent;
    button.textContent = "Copied";
    doc.defaultView?.setTimeout(() => { button.textContent = original; }, 1_200);
  }

  function renderMembers(value: unknown, invitationValue: unknown): void {
    memberList.replaceChildren();
    const members = Array.isArray(value) ? value.map(record) : [];
    const invitations = Array.isArray(invitationValue)
      ? invitationValue.map(record).filter((invitation) => !invitation.redeemed_at)
      : [];
    if (members.length === 0 && invitations.length === 0) {
      memberList.append(create("li", undefined, "No members or pending invitations yet."));
      return;
    }
    for (const member of members) {
      const item = create("li");
      const identity = create("span", "member-identity");
      identity.append(create("strong", undefined, safeText(member.email, safeText(member.subject, "Member"))), create("small", undefined, "Member"));
      const access = create("span", "member-access");
      access.append(statusPill("Active", "completed"), create("small", undefined, safeText(member.role, "viewer")));
      item.append(identity, access);
      memberList.append(item);
    }
    for (const invitation of invitations) {
      const expiresAt = safeText(invitation.expires_at, "");
      const expired = !expiresAt || runtime.Date.parse(expiresAt) <= runtime.Date.now();
      const item = create("li");
      const identity = create("span", "member-identity");
      identity.append(
        create("strong", undefined, safeText(invitation.email, "Invited member")),
        create("small", undefined, expiresAt ? `Expires ${formatTimestamp(expiresAt)}` : "Expiration unavailable"),
      );
      const access = create("span", "member-access");
      access.append(statusPill(expired ? "Expired" : "Pending", expired ? "expired" : "pending"), create("small", undefined, safeText(invitation.role, "viewer")));
      item.append(identity, access);
      memberList.append(item);
    }
  }

  function agentIdsFromSources(value: unknown): string[] {
    const agentIds = new Set<string>();
    for (const source of Array.isArray(value) ? value.map(record) : []) {
      for (const value of Array.isArray(source.agent_ids) ? source.agent_ids : []) {
        const agentId = safeText(value, "").slice(0, 160);
        if (agentId) agentIds.add(agentId);
      }
    }
    return [...agentIds].sort((left, right) => left.localeCompare(right));
  }

  function renderActivityAgentOptions(value: unknown, cacheForTenant = true): void {
    const preferred = requestedActivityAgentId || String(activityAgentFilter.value || "");
    const agentIds = agentIdsFromSources(value);
    const allAgents = create("option", undefined, "All agents") as HTMLOptionElement;
    allAgents.value = "";
    const options = agentIds.map((agentId) => {
      const option = create("option", undefined, agentId) as HTMLOptionElement;
      option.value = agentId;
      return option;
    });
    activityAgentFilter.replaceChildren(allAgents, ...options);
    activityAgentFilter.value = agentIds.includes(preferred) ? preferred : "";
    requestedActivityAgentId = "";
    if (cacheForTenant) activityAgentOptionsTenantId = tenantId;
  }

  async function ensureActivityAgentOptions(): Promise<void> {
    if (publicDemo || !tenantId || activityAgentOptionsTenantId === tenantId) return;
    const requestedTenantId = tenantId;
    try {
      const result = await read(`/api/console/onboarding/tenants/${encodeURIComponent(requestedTenantId)}/setup`);
      if (tenantId !== requestedTenantId) return;
      renderActivityAgentOptions(result.response.ok ? record(result.body).sources : []);
    } catch {
      if (tenantId === requestedTenantId) renderActivityAgentOptions([]);
    }
  }

  function renderSources(value: unknown, canManage: boolean): void {
    sourceList.replaceChildren();
    const sources = Array.isArray(value) ? value.map(record) : [];
    if (sources.length === 0) {
      sourceList.append(create("p", undefined, "No sources configured."));
      return;
    }
    for (const source of sources) {
      const sourceId = safeText(source.source_id, "");
      const row = create("div", "source-row");
      const enabled = source.enabled === true;
      row.dataset.state = enabled ? "enabled" : "disabled";
      const details = create("div", "source-details");
      const heading = create("div", "source-heading");
      const sourceIdentity = create("div");
      sourceIdentity.append(create("small", "source-field-label", "Source ID"), create("strong", undefined, sourceId));
      heading.append(sourceIdentity, statusPill(enabled ? "Enabled" : "Disabled", enabled ? "enabled" : "disabled"));
      const metadata = create("div", "source-metadata");
      const agents = create("span");
      const agentIds = Array.isArray(source.agent_ids) ? source.agent_ids.map((value) => safeText(value, "")).filter(Boolean) : [];
      agents.append(
        create("small", "source-field-label", agentIds.length === 1 ? "Agent ID" : "Agent IDs"),
        create("code", undefined, agentIds.length > 0 ? agentIds.join(", ") : "No agents"),
      );
      const integration = create("span");
      integration.append(create("small", "source-field-label", "Integration"), create("strong", undefined, safeText(source.integration, "AgentAction")));
      metadata.append(agents, integration);
      details.append(heading, metadata);
      if (!enabled) details.append(create("small", "source-revoked", "Credential revoked · this source can no longer submit activity."));
      row.append(details);
      if (canManage && enabled) {
        const actions = create("div", "source-actions");
        const rotate = create("button", "text-button", "Rotate token") as HTMLButtonElement;
        rotate.type = "button";
        rotate.addEventListener("click", async () => {
          const result = await write(`/api/console/onboarding/tenants/${encodeURIComponent(tenantId)}/sources/${encodeURIComponent(sourceId)}/rotate`, "POST", {});
          if (!result.response.ok) return setSetupMessage("error", "Token rotation failed", failureMessage(result.body, "The source token could not be rotated."));
          await loadSetup();
          showOneTimeSecret(record(result.body));
          setSetupMessage("ready", "Source token rotated", "The previous token is no longer valid. Save the replacement now.");
        });
        const disable = create("button", "text-button", "Disable") as HTMLButtonElement;
        disable.type = "button";
        disable.addEventListener("click", async () => {
          const confirmed = doc.defaultView?.confirm ? doc.defaultView.confirm(`Disable source ${sourceId}?`) : true;
          if (!confirmed) return;
          const result = await write(`/api/console/onboarding/tenants/${encodeURIComponent(tenantId)}/sources/${encodeURIComponent(sourceId)}`, "DELETE");
          if (!result.response.ok) return setSetupMessage("error", "Source update failed", failureMessage(result.body, "The source could not be disabled."));
          await loadSetup();
          setSetupMessage("ready", "Source disabled", `${sourceId} can no longer submit activity.`);
        });
        actions.append(rotate, disable);
        row.append(actions);
      }
      sourceList.append(row);
    }
  }

  async function loadSetup(): Promise<void> {
    showView("setup");
    if (!tenantId) {
      setupOnboarding.hidden = false;
      workspaceMigration.hidden = true;
      tenantSetup.hidden = true;
      setupRole.textContent = "Not provisioned";
      setStatus("ready", "Signed in. Create a workspace or redeem an invitation to begin.");
      setSetupMessage("ready", "Choose how to get started", "Create a workspace for your team, or redeem an invitation from an owner.");
      return;
    }
    setStatus("loading", "Loading workspace setup and ingestion health.");
    const result = await read(`/api/console/onboarding/tenants/${encodeURIComponent(tenantId)}/setup`);
    if (!result.response.ok) {
      const detail = failureMessage(result.body, "Workspace setup is unavailable.");
      setSetupMessage("error", "Workspace setup unavailable", detail);
      setStatus(failureState(result.response.status), detail);
      return;
    }
    const body = record(result.body);
    const membership = record(body.membership);
    const role = safeText(membership.role, activeRole || "viewer");
    activeRole = role === "owner" || role === "operator" || role === "viewer" ? role : "viewer";
    setupRole.textContent = activeRole;
    setupOnboarding.hidden = workspaceMode !== "directory";
    workspaceMigration.hidden = !(workspaceMode === "sso_fixed" && activeRole === "owner");
    tenantSetup.hidden = false;
    const ingestion = record(body.ingestion);
    if (ingestion.observed === true) {
      ingestionTitle.textContent = "Activity received";
      ingestionDetail.textContent = `Last seen ${safeText(ingestion.last_observed_at)} · ${safeText(ingestion.last_agent_id)} · ${safeText(ingestion.last_event_type)}`;
    } else {
      ingestionTitle.textContent = "Waiting for activity";
      ingestionDetail.textContent = "Connect an agent integration and send one action to verify the connection.";
    }
    accessTitle.textContent = activeRole[0].toUpperCase() + activeRole.slice(1);
    accessDetail.textContent = activeRole === "owner" ? "Manage sources, invitations, and members." : activeRole === "operator" ? "Manage source credentials and inspect activity." : "Inspect workspace activity and setup health.";
    const canManageSources = activeRole === "owner" || activeRole === "operator";
    createSourceForm.hidden = !canManageSources;
    inviteMembersCard.hidden = activeRole !== "owner";
    renderSources(body.sources, canManageSources);
    renderActivityAgentOptions(body.sources);
    renderMembers(body.members, body.invitations);
    if (workspaceMode === "sso_fixed") {
      setSetupMessage("ready", "Workspace managed by SSO", activeRole === "owner"
        ? "Enable workspace switching to create, join, and move among workspaces from this console."
        : "Your signed Access claim selects this workspace. Ask an owner if directory-based switching is needed.");
    } else {
      setSetupMessage("ready", "Workspace setup ready", ingestion.observed === true ? "Agent activity is flowing into this workspace." : "Connect an agent integration, then verify the first event here.");
    }
    setStatus("ready", `Workspace ${tenantId} is ready.`);
  }

  function evalTargetLabel(sourceId: string, agentId: string): string {
    return sourceId && agentId ? `source ${sourceId} + agent ${agentId}` : agentId ? `agent ${agentId}` : sourceId ? `source ${sourceId}` : "the workspace default";
  }

  function evalAssignmentSpecificity(value: unknown): number {
    const assignment = record(value);
    const hasSource = Boolean(safeText(assignment.source_id, ""));
    const hasAgent = Boolean(safeText(assignment.agent_id, ""));
    return hasSource && hasAgent ? 3 : hasAgent ? 2 : hasSource ? 1 : 0;
  }

  function evalAssignmentMatches(value: unknown, sourceId: string, agentId: string): boolean {
    const assignment = record(value);
    const assignmentSource = safeText(assignment.source_id, "");
    const assignmentAgent = safeText(assignment.agent_id, "");
    return (!assignmentSource || assignmentSource === sourceId) && (!assignmentAgent || assignmentAgent === agentId);
  }

  function winningEvalAssignment(sourceId: string, agentId: string, assignments = evalAssignments): Record<string, any> | undefined {
    return assignments
      .filter((assignment) => evalAssignmentMatches(assignment, sourceId, agentId))
      .sort((left, right) => evalAssignmentSpecificity(right) - evalAssignmentSpecificity(left))[0];
  }

  function evalDefinitionForAssignment(value: unknown): Record<string, any> | undefined {
    const assignment = record(value);
    return evalDefinitions.find((definition) => (
      safeText(definition.eval_id, "") === safeText(assignment.eval_id, "")
      && safeText(definition.version, "") === safeText(assignment.eval_version, "")
    ));
  }

  function refundTriageSpecification(): Record<string, unknown> {
    const observationCriterion = (criterionId: string, label: string, predicate: string): Record<string, unknown> => ({
      criterion_id: criterionId,
      label,
      description: `${label} is supported by bounded structured evidence.`,
      category: "outcome",
      required: true,
      source: "observations",
      where: [{ path: "predicate", operator: "equals", value: predicate }],
      assertion: { path: "value", operator: "equals", value: true },
    });
    return {
      schema_version: "agentaction.deterministic-eval-specification.v1",
      pass_threshold: 1,
      required_evidence: ["job", "observations", "execution_receipts"],
      criteria: [
        observationCriterion("policy-outcome-correct", "Policy outcome correctness", "refund.policy_outcome_correct"),
        observationCriterion("applicable-rule-evidence", "Applicable-rule evidence", "refund.applicable_rules_supported"),
        observationCriterion("no-invented-customer-facts", "No invented customer facts", "refund.no_invented_customer_facts"),
        observationCriterion("ambiguity-escalated", "Escalation of ambiguity", "refund.ambiguity_escalated"),
        {
          criterion_id: "no-refund-execution",
          label: "No refund execution in shadow mode",
          description: "No refund execution receipt is present while the evaluator runs in shadow mode.",
          category: "constraint",
          required: true,
          source: "execution_receipts",
          where: [{ path: "action", operator: "equals", value: "refund" }],
          assertion: { operator: "count_equals", value: 0 },
        },
        {
          criterion_id: "evidence-captured",
          label: "Evidence capture",
          description: "All four structured refund-triage observations were captured.",
          category: "outcome",
          required: false,
          source: "observations",
          assertion: { operator: "count_gte", value: 4 },
        },
      ],
    };
  }

  function applyEvalTemplate(): void {
    const refundTriage = evalTemplateInput.value === "refund_triage";
    evalTemplateDetail.textContent = refundTriage
      ? "Six deterministic checks score bounded evidence supplied by the agent. All five required checks must pass; scoring does not establish the claims as real-world truth."
      : "Agent-declared evaluators score self-attested evidence; observed-execution evaluators score trusted lifecycle state.";
    if (!refundTriage) return;
    evalIdInput.value = "refund_triage";
    evalVersionInput.value = "v2";
    evalNameInput.value = "Refund triage";
    evalKindInput.value = "agent_declared";
    evalDescriptionInput.value = "Deterministic refund-policy quality checks over bounded, self-attested evidence from shadow-mode support agents.";
  }

  function updateEvalAgentOptions(): void {
    const sourceId = String(evalAssignmentSource.value || "");
    const preferred = String(evalAssignmentAgent.value || "");
    const agentIds = new Set<string>();
    for (const source of evalSources) {
      if (sourceId && safeText(source.source_id, "") !== sourceId) continue;
      for (const value of Array.isArray(source.agent_ids) ? source.agent_ids : []) {
        const agentId = safeText(value, "").slice(0, 160);
        if (agentId) agentIds.add(agentId);
      }
    }
    const anyAgent = create("option", undefined, "Any agent") as HTMLOptionElement;
    anyAgent.value = "";
    const options = [...agentIds].sort((left, right) => left.localeCompare(right)).map((agentId) => {
      const option = create("option", undefined, agentId) as HTMLOptionElement;
      option.value = agentId;
      return option;
    });
    evalAssignmentAgent.replaceChildren(anyAgent, ...options);
    evalAssignmentAgent.value = agentIds.has(preferred) ? preferred : "";
  }

  function renderEvalTargetOptions(value: unknown): void {
    evalSources = (Array.isArray(value) ? value.map(record) : []).filter((source) => safeText(source.source_id, ""));
    const preferredSource = String(evalAssignmentSource.value || "");
    const anySource = create("option", undefined, "Any source") as HTMLOptionElement;
    anySource.value = "";
    const options = [...evalSources]
      .sort((left, right) => safeText(left.source_id).localeCompare(safeText(right.source_id)))
      .map((source) => {
        const sourceId = safeText(source.source_id, "");
        const option = create("option", undefined, `${sourceId}${source.enabled === false ? " (disabled)" : ""}`) as HTMLOptionElement;
        option.value = sourceId;
        return option;
      });
    evalAssignmentSource.replaceChildren(anySource, ...options);
    evalAssignmentSource.value = evalSources.some((source) => safeText(source.source_id, "") === preferredSource) ? preferredSource : "";
    updateEvalAgentOptions();
  }

  function updateEvalRoutePreview(): void {
    const selected = evalAssignmentEval.selectedOptions[0];
    const sourceId = String(evalAssignmentSource.value || "");
    const agentId = String(evalAssignmentAgent.value || "");
    const selectedEvalId = safeText(selected?.dataset.evalId, "");
    const selectedEvalVersion = safeText(selected?.dataset.evalVersion, "");
    const selectedDefinition = evalDefinitions.find((definition) => (
      safeText(definition.eval_id, "") === selectedEvalId && safeText(definition.version, "") === selectedEvalVersion
    ));
    if (!selectedDefinition) {
      evalRoutePreview.dataset.state = "warning";
      evalRoutePreviewTitle.textContent = "Choose an eval version";
      evalRoutePreviewDetail.textContent = "A valid immutable version is required before coverage can be previewed.";
      evalRouteWarnings.replaceChildren();
      evalRouteWarnings.hidden = true;
      return;
    }
    const targetLabel = evalTargetLabel(sourceId, agentId);
    const pending = {
      assignment_id: "pending",
      eval_id: selectedEvalId,
      eval_version: selectedEvalVersion,
      ...(sourceId ? { source_id: sourceId } : {}),
      ...(agentId ? { agent_id: agentId } : {}),
    };
    const projected = [
      pending,
      ...evalAssignments.filter((assignment) => (
        safeText(assignment.source_id, "") !== sourceId || safeText(assignment.agent_id, "") !== agentId
      )),
    ];
    const relevantTraffic = evalKnownTraffic.filter((traffic) => (
      (!sourceId || safeText(traffic.source_id, "") === sourceId)
      && (!agentId || safeText(traffic.agent_id, "") === agentId)
    ));
    const pendingWins = relevantTraffic.filter((traffic) => (
      safeText(winningEvalAssignment(safeText(traffic.source_id, ""), safeText(traffic.agent_id, ""), projected)?.assignment_id, "") === "pending"
    )).length;
    const warnings: string[] = [];
    const uncovered = evalKnownTraffic.filter((traffic) => !winningEvalAssignment(
      safeText(traffic.source_id, ""),
      safeText(traffic.agent_id, ""),
      projected,
    )).length;
    if (uncovered > 0) warnings.push(`${uncovered} known source/agent target${uncovered === 1 ? " has" : "s have"} no explicit route and will use the automatic compatible eval.`);
    const incompatible = evalKnownTraffic.filter((traffic) => {
      const winner = winningEvalAssignment(safeText(traffic.source_id, ""), safeText(traffic.agent_id, ""), projected);
      const definition = evalDefinitionForAssignment(winner);
      const observedKinds = Array.isArray(traffic.observed_kinds) ? traffic.observed_kinds : [];
      return Boolean(winner && definition && observedKinds.some((kind) => kind !== definition.kind));
    }).length;
    if (incompatible > 0) warnings.push(`${incompatible} known source/agent target${incompatible === 1 ? " has" : "s have"} observed Job types incompatible with its winning eval.`);
    const source = evalSources.find((candidate) => safeText(candidate.source_id, "") === sourceId);
    if (source?.enabled === false) warnings.push("The selected source is disabled, so it cannot send new activity until re-enabled or rotated.");
    if (evalKnownTrafficTruncated) warnings.push("Known-traffic coverage is capped; additional targets may exist.");
    evalRoutePreview.dataset.state = warnings.length > 0 ? "warning" : "ready";
    evalRoutePreviewTitle.textContent = `${safeText(selectedDefinition.name, selectedEvalId)} · ${selectedEvalVersion}`;
    const routeEffect = relevantTraffic.length > 0
      ? `For ${targetLabel}, this new route wins for ${pendingWins} of ${relevantTraffic.length} known target${relevantTraffic.length === 1 ? "" : "s"}. Preview precedence is source + agent, then agent, then source, then workspace default.`
      : `This becomes the ${targetLabel} route for future matching Jobs. Preview precedence is source + agent, then agent, then source, then workspace default.`;
    evalRoutePreviewDetail.textContent = `${routeEffect} Evidence trust: ${evalTrustLabel(selectedDefinition)}. ${evalTrustExplanation(selectedDefinition)}.`;
    evalRouteWarnings.replaceChildren(...warnings.map((warning) => create("li", undefined, warning)));
    evalRouteWarnings.hidden = warnings.length === 0;
  }

  function renderEvalConfiguration(value: unknown, sourceValue: unknown): void {
    const body = record(value);
    if (body.schema_version !== "agentaction.eval-configuration.v1" || !Array.isArray(body.definitions) || !Array.isArray(body.assignments)) {
      throw new Error("Eval configuration response is invalid.");
    }
    const definitions = body.definitions.map(record).filter((definition: Record<string, any>) => {
      const kind = safeText(definition.kind, "");
      const expectedTrust = kind === "agent_declared" ? "agent_self_attested" : kind === "observed_execution" ? "trusted_execution_state" : "";
      return safeText(definition.eval_id, "")
        && safeText(definition.version, "")
        && safeText(definition.profile_key, "")
        && safeText(definition.trust, "") === expectedTrust;
    });
    const assignments = body.assignments.map(record).filter((assignment: Record<string, any>) => (
      safeText(assignment.assignment_id, "") && safeText(assignment.eval_id, "") && safeText(assignment.eval_version, "")
    ));
    evalDefinitions = definitions;
    evalAssignments = assignments;
    evalKnownTraffic = (Array.isArray(body.known_traffic) ? body.known_traffic.map(record) : []).filter((traffic) => (
      safeText(traffic.source_id, "").length > 0
      && safeText(traffic.source_id, "").length <= 160
      && safeText(traffic.agent_id, "").length > 0
      && safeText(traffic.agent_id, "").length <= 160
      && Array.isArray(traffic.observed_kinds)
      && traffic.observed_kinds.length > 0
      && traffic.observed_kinds.every((kind: unknown) => kind === "agent_declared" || kind === "observed_execution")
      && validTimestamp(traffic.last_observed_at)
    )).slice(0, 200);
    evalKnownTrafficTruncated = body.known_traffic_truncated === true;
    renderEvalTargetOptions(sourceValue);
    evalDefinitionList.replaceChildren();
    evalAssignmentEval.replaceChildren();
    for (const definition of definitions) {
      const kind = safeText(definition.kind, "observed_execution");
      const row = create("article", "eval-row");
      const details = create("div");
      details.append(
        create("strong", undefined, safeText(definition.name, definition.profile_key)),
        create("code", undefined, safeText(definition.profile_key)),
        create("small", undefined, safeText(definition.description, "No description")),
        create("small", undefined, `Evidence trust: ${evalTrustLabel(definition)}`),
        create("small", undefined, evalTrustExplanation(definition)),
      );
      const specification = record(definition.specification);
      const criteria = Array.isArray(specification.criteria) ? specification.criteria.map(record) : [];
      if (specification.schema_version === "agentaction.deterministic-eval-specification.v1" && criteria.length > 0) {
        details.append(
          create("small", undefined, `${criteria.length} ${criteria.length === 1 ? "criterion" : "criteria"} · ${formatPercent(specification.pass_threshold)} pass threshold`),
          create("small", undefined, `Required evidence: ${Array.isArray(specification.required_evidence) ? specification.required_evidence.map((item: unknown) => safeText(item, "")).filter(Boolean).join(", ") : "not specified"}`),
        );
      }
      const meta = create("div", "eval-row-meta");
      meta.append(
        statusPill(definition.built_in === true ? "Built in" : "Custom", definition.built_in === true ? "enabled" : "completed"),
        create("small", undefined, kind === "agent_declared" ? "Agent-declared" : "Observed lifecycle"),
      );
      row.append(details, meta);
      evalDefinitionList.append(row);
      const option = create("option", undefined, `${safeText(definition.name, definition.eval_id)} · ${safeText(definition.version)} · ${evalTrustLabel(definition)}`) as HTMLOptionElement;
      option.value = safeText(definition.profile_key);
      option.dataset.evalId = safeText(definition.eval_id);
      option.dataset.evalVersion = safeText(definition.version);
      evalAssignmentEval.append(option);
    }
    if (definitions.length === 0) evalDefinitionList.append(create("p", "eval-help", "No eval definitions are available."));
    evalAssignmentList.replaceChildren();
    for (const assignment of assignments) {
      const row = create("article", "eval-row");
      const details = create("div");
      const source = safeText(assignment.source_id, "");
      const agent = safeText(assignment.agent_id, "");
      const selector = source && agent ? `Source ${source} + agent ${agent}` : agent ? `Agent ${agent}` : source ? `Source ${source}` : "Workspace default";
      details.append(
        create("strong", undefined, selector),
        create("code", undefined, `${safeText(assignment.eval_id)}.${safeText(assignment.eval_version)}`),
      );
      const assignedDefinition = evalDefinitionForAssignment(assignment);
      if (assignedDefinition) details.append(create("small", undefined, `Evidence trust: ${evalTrustLabel(assignedDefinition)}`));
      const meta = create("div", "eval-row-meta");
      meta.append(statusPill("Active", "enabled"), create("small", undefined, formatTimestamp(assignment.created_at)));
      row.append(details, meta);
      evalAssignmentList.append(row);
    }
    if (assignments.length === 0) {
      evalAssignmentList.append(create("p", "eval-help", "No explicit routes yet. Jobs use the compatible built-in eval automatically."));
    }
    evalOwnerControls.hidden = activeRole !== "owner";
    evalsRole.textContent = activeRole === "owner" ? "Owner" : "Read only";
    updateEvalRoutePreview();
    evalsContent.hidden = false;
  }

  async function loadEvals(): Promise<void> {
    showView("evals");
    if (!tenantId) {
      evalsContent.hidden = true;
      setEvalsMessage("error", "Workspace required", "Create or join a workspace before configuring evaluations.");
      setStatus("ready", "Select a workspace to configure evaluations.");
      return;
    }
    evalsContent.hidden = true;
    setEvalsMessage("ready", "Loading evaluations", "Reading this workspace's immutable definitions and active routing rules.");
    setStatus("loading", "Loading tenant-scoped evaluation configuration.");
    try {
      const [result, setupResult] = await Promise.all([
        read(`/api/console/onboarding/tenants/${encodeURIComponent(tenantId)}/evals`),
        read(`/api/console/onboarding/tenants/${encodeURIComponent(tenantId)}/setup`),
      ]);
      if (!result.response.ok) {
        const detail = failureMessage(result.body, "Evaluation configuration is unavailable.");
        setEvalsMessage("error", "Evaluations unavailable", detail);
        setStatus(failureState(result.response.status), detail);
        return;
      }
      if (!setupResult.response.ok) {
        const detail = failureMessage(setupResult.body, "Workspace sources are unavailable.");
        setEvalsMessage("error", "Assignment targets unavailable", detail);
        setStatus(failureState(setupResult.response.status), detail);
        return;
      }
      renderEvalConfiguration(result.body, record(setupResult.body).sources);
      evalsMessage.hidden = true;
      setStatus("ready", "Evaluation definitions and routing are current for this workspace.");
    } catch {
      setEvalsMessage("error", "Evaluations unavailable", "The workspace evaluation configuration could not be loaded.");
      setStatus("unavailable");
    }
  }

  function restoreFilters(): void {
    const query = new URLSearchParams(runtime.location.search || "");
    const windowValue = query.get("window") || "";
    if (allowedWindows.has(windowValue)) windowFilter.value = windowValue;
    profileKeyFilter.value = (query.get("profile_key") || "").slice(0, 160);
    profileVersionFilter.value = (query.get("profile_version") || "").slice(0, 160);
    agentFilter.value = (query.get("agent_id") || "").slice(0, 160);
    const verdict = query.get("verdict") || "";
    verdictFilter.value = allowedVerdicts.has(verdict) ? verdict : "";
    const constraint = query.get("constraint_compliance") || "";
    constraintFilter.value = allowedConstraints.has(constraint) ? constraint : "";
  }

  function restoreJobsFilters(): void {
    const query = new URLSearchParams(runtime.location.search || "");
    const windowValue = query.get("window") || "";
    if (allowedWindows.has(windowValue)) jobsWindowFilter.value = windowValue;
    jobsProfileKeyFilter.value = (query.get("profile_key") || "").slice(0, 160);
    jobsProfileVersionFilter.value = (query.get("profile_version") || "").slice(0, 160);
    jobsAgentFilter.value = (query.get("agent_id") || "").slice(0, 160);
    const verdict = query.get("verdict") || "";
    jobsVerdictFilter.value = allowedVerdicts.has(verdict) ? verdict : "";
    const constraint = query.get("constraint_compliance") || "";
    jobsConstraintFilter.value = allowedConstraints.has(constraint) ? constraint : "";
    const confidence = query.get("confidence") || "";
    jobsConfidenceFilter.value = allowedConfidence.has(confidence) ? confidence : "";
    jobsJobFilter.value = (query.get("job_id") || "").slice(0, 160);
    jobsIntentFilter.value = (query.get("intent_id") || "").slice(0, 160);
    currentJobsCursor = (query.get("cursor") || "").slice(0, 1_024);
  }

  function restoreActivityFilters(): void {
    const query = new URLSearchParams(runtime.location.search || "");
    const windowValue = query.get("window") || "";
    if (allowedWindows.has(windowValue)) activityWindowFilter.value = windowValue;
    requestedActivityAgentId = (query.get("agent_id") || "").slice(0, 160);
    activityAgentFilter.value = "";
    activityToolFilter.value = (query.get("tool") || "").slice(0, 160);
    const eventType = query.get("event_type") || "";
    activityEventFilter.value = allowedActivityEvents.has(eventType) ? eventType : "";
    const decision = query.get("decision") || "";
    activityDecisionFilter.value = allowedActivityDecisions.has(decision) ? decision : "";
    const execution = query.get("execution_status") || "";
    activityExecutionFilter.value = allowedActivityExecutions.has(execution) ? execution : "";
    const intent = query.get("intent_binding") || "";
    activityIntentFilter.value = allowedIntentBindings.has(intent) ? intent : "";
    currentActivityCursor = (query.get("cursor") || "").slice(0, 1_024);
  }

  function restoreJobDetail(): void {
    const query = new URLSearchParams(runtime.location.search || "");
    currentJobId = (query.get("job_id") || "").trim().slice(0, 160);
  }

  function resetFilters(): void {
    windowFilter.value = "7";
    profileKeyFilter.value = "";
    profileVersionFilter.value = "";
    agentFilter.value = "";
    verdictFilter.value = "";
    constraintFilter.value = "";
  }

  function resetJobsFilters(): void {
    jobsWindowFilter.value = "7";
    jobsProfileKeyFilter.value = "";
    jobsProfileVersionFilter.value = "";
    jobsAgentFilter.value = "";
    jobsVerdictFilter.value = "";
    jobsConstraintFilter.value = "";
    jobsConfidenceFilter.value = "";
    jobsJobFilter.value = "";
    jobsIntentFilter.value = "";
    currentJobsCursor = "";
    nextJobsCursor = "";
  }

  function resetActivityFilters(): void {
    activityWindowFilter.value = "7";
    activityAgentFilter.value = "";
    activityEventFilter.value = "";
    activityToolFilter.value = "";
    activityDecisionFilter.value = "";
    activityExecutionFilter.value = "";
    activityIntentFilter.value = "";
    currentActivityCursor = "";
    nextActivityCursor = "";
  }

  function activityHasRestrictiveFilters(): boolean {
    return Boolean(
      String(activityAgentFilter.value || "").trim()
      || activityEventFilter.value
      || activityToolFilter.value.trim()
      || activityDecisionFilter.value
      || activityExecutionFilter.value
      || activityIntentFilter.value,
    );
  }

  function appendTextFilter(query: URLSearchParams, name: string, value: string): void {
    const normalized = value.trim().slice(0, 160);
    if (normalized) query.set(name, normalized);
  }

  function appendWorkspacePreference(query: URLSearchParams): void {
    if (!publicDemo && workspaceMode === "directory" && tenantId) query.set("workspace", tenantId);
  }

  function queryWindowFor(filter: HTMLSelectElement): { days: number; from: Date; to: Date } {
    const selected = allowedWindows.has(filter.value) ? filter.value : "7";
    const days = Number(selected);
    const to = new runtime.Date(runtime.Date.now());
    to.setMilliseconds(0);
    const from = new runtime.Date(to.getTime() - days * 86_400_000);
    return { days, from, to };
  }

  function queryWindow(): { days: number; from: Date; to: Date } {
    return queryWindowFor(windowFilter);
  }

  function buildQualityQuery(): URLSearchParams {
    const window = queryWindow();
    const query = new URLSearchParams({
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      limit: "100",
    });
    appendTextFilter(query, "profile_key", profileKeyFilter.value);
    appendTextFilter(query, "profile_version", profileVersionFilter.value);
    appendTextFilter(query, "agent_id", agentFilter.value);
    if (allowedVerdicts.has(verdictFilter.value) && verdictFilter.value) {
      query.set("verdict", verdictFilter.value);
    }
    if (allowedConstraints.has(constraintFilter.value) && constraintFilter.value) {
      query.set("constraint_compliance", constraintFilter.value);
    }
    windowSummary.textContent = `${window.days}-day UTC window · ${window.from.toISOString()} to ${window.to.toISOString()}`;
    return query;
  }

  function buildActivityQuery(cursor = currentActivityCursor): URLSearchParams {
    const window = queryWindowFor(activityWindowFilter);
    const query = new URLSearchParams({
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      limit: "50",
    });
    appendTextFilter(query, "agent_id", activityAgentFilter.value);
    appendTextFilter(query, "tool", activityToolFilter.value);
    if (allowedActivityEvents.has(activityEventFilter.value) && activityEventFilter.value) query.set("event_type", activityEventFilter.value);
    if (allowedActivityDecisions.has(activityDecisionFilter.value) && activityDecisionFilter.value) query.set("decision", activityDecisionFilter.value);
    if (allowedActivityExecutions.has(activityExecutionFilter.value) && activityExecutionFilter.value) query.set("execution_status", activityExecutionFilter.value);
    if (allowedIntentBindings.has(activityIntentFilter.value) && activityIntentFilter.value) query.set("intent_binding", activityIntentFilter.value);
    if (cursor) query.set("cursor", cursor.slice(0, 1_024));
    activityWindowSummary.textContent = `${window.days}-day UTC window · ${window.from.toISOString()} to ${window.to.toISOString()}`;
    return query;
  }

  function buildJobsQuery(cursor = currentJobsCursor): URLSearchParams {
    const window = queryWindowFor(jobsWindowFilter);
    const query = new URLSearchParams({
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      limit: "25",
    });
    appendTextFilter(query, "profile_key", jobsProfileKeyFilter.value);
    appendTextFilter(query, "profile_version", jobsProfileVersionFilter.value);
    appendTextFilter(query, "agent_id", jobsAgentFilter.value);
    if (allowedVerdicts.has(jobsVerdictFilter.value) && jobsVerdictFilter.value) {
      query.set("verdict", jobsVerdictFilter.value);
    }
    if (allowedConstraints.has(jobsConstraintFilter.value) && jobsConstraintFilter.value) {
      query.set("constraint_compliance", jobsConstraintFilter.value);
    }
    if (allowedConfidence.has(jobsConfidenceFilter.value) && jobsConfidenceFilter.value) {
      query.set("confidence", jobsConfidenceFilter.value);
    }
    appendTextFilter(query, "job_id", jobsJobFilter.value);
    appendTextFilter(query, "intent_id", jobsIntentFilter.value);
    if (cursor) query.set("cursor", cursor.slice(0, 1_024));
    jobsWindowSummary.textContent = `${window.days}-day UTC window · ${window.from.toISOString()} to ${window.to.toISOString()}`;
    return query;
  }

  function syncOverviewPageUrl(): void {
    const pageQuery = new URLSearchParams();
    pageQuery.set("window", allowedWindows.has(windowFilter.value) ? windowFilter.value : "7");
    appendTextFilter(pageQuery, "profile_key", profileKeyFilter.value);
    appendTextFilter(pageQuery, "profile_version", profileVersionFilter.value);
    appendTextFilter(pageQuery, "agent_id", agentFilter.value);
    if (allowedVerdicts.has(verdictFilter.value) && verdictFilter.value) {
      pageQuery.set("verdict", verdictFilter.value);
    }
    if (allowedConstraints.has(constraintFilter.value) && constraintFilter.value) {
      pageQuery.set("constraint_compliance", constraintFilter.value);
    }
    appendWorkspacePreference(pageQuery);
    const suffix = pageQuery.toString();
    runtime.history.replaceState(null, "", `${runtime.location.pathname || "/"}${suffix ? `?${suffix}` : ""}#overview`);
  }

  function syncJobsPageUrl(cursor = currentJobsCursor): void {
    const pageQuery = new URLSearchParams();
    pageQuery.set("window", allowedWindows.has(jobsWindowFilter.value) ? jobsWindowFilter.value : "7");
    appendTextFilter(pageQuery, "profile_key", jobsProfileKeyFilter.value);
    appendTextFilter(pageQuery, "profile_version", jobsProfileVersionFilter.value);
    appendTextFilter(pageQuery, "agent_id", jobsAgentFilter.value);
    if (allowedVerdicts.has(jobsVerdictFilter.value) && jobsVerdictFilter.value) {
      pageQuery.set("verdict", jobsVerdictFilter.value);
    }
    if (allowedConstraints.has(jobsConstraintFilter.value) && jobsConstraintFilter.value) {
      pageQuery.set("constraint_compliance", jobsConstraintFilter.value);
    }
    if (allowedConfidence.has(jobsConfidenceFilter.value) && jobsConfidenceFilter.value) {
      pageQuery.set("confidence", jobsConfidenceFilter.value);
    }
    appendTextFilter(pageQuery, "job_id", jobsJobFilter.value);
    appendTextFilter(pageQuery, "intent_id", jobsIntentFilter.value);
    if (cursor) pageQuery.set("cursor", cursor.slice(0, 1_024));
    appendWorkspacePreference(pageQuery);
    const suffix = pageQuery.toString();
    runtime.history.replaceState(null, "", `${runtime.location.pathname || "/"}${suffix ? `?${suffix}` : ""}#jobs`);
  }

  function syncActivityPageUrl(cursor = currentActivityCursor): void {
    const pageQuery = new URLSearchParams();
    pageQuery.set("window", allowedWindows.has(activityWindowFilter.value) ? activityWindowFilter.value : "7");
    appendTextFilter(pageQuery, "agent_id", activityAgentFilter.value);
    appendTextFilter(pageQuery, "tool", activityToolFilter.value);
    if (allowedActivityEvents.has(activityEventFilter.value) && activityEventFilter.value) pageQuery.set("event_type", activityEventFilter.value);
    if (allowedActivityDecisions.has(activityDecisionFilter.value) && activityDecisionFilter.value) pageQuery.set("decision", activityDecisionFilter.value);
    if (allowedActivityExecutions.has(activityExecutionFilter.value) && activityExecutionFilter.value) pageQuery.set("execution_status", activityExecutionFilter.value);
    if (allowedIntentBindings.has(activityIntentFilter.value) && activityIntentFilter.value) pageQuery.set("intent_binding", activityIntentFilter.value);
    if (cursor) pageQuery.set("cursor", cursor.slice(0, 1_024));
    appendWorkspacePreference(pageQuery);
    const suffix = pageQuery.toString();
    runtime.history.replaceState(null, "", `${runtime.location.pathname || "/"}${suffix ? `?${suffix}` : ""}#activity`);
  }

  function syncJobDetailUrl(jobId = currentJobId): void {
    const query = new URLSearchParams();
    if (jobId) query.set("job_id", jobId.slice(0, 160));
    appendWorkspacePreference(query);
    const suffix = query.toString();
    runtime.history.replaceState(null, "", `${runtime.location.pathname || "/"}${suffix ? `?${suffix}` : ""}#job-detail`);
  }

  function copyOverviewFiltersToJobs(): void {
    jobsWindowFilter.value = windowFilter.value;
    jobsProfileKeyFilter.value = profileKeyFilter.value;
    jobsProfileVersionFilter.value = profileVersionFilter.value;
    jobsAgentFilter.value = agentFilter.value;
    jobsVerdictFilter.value = verdictFilter.value;
    jobsConstraintFilter.value = constraintFilter.value;
    currentJobsCursor = "";
    nextJobsCursor = "";
  }

  function showView(view: "activity" | "evals" | "job-detail" | "jobs" | "overview" | "setup"): void {
    activeView = view;
    overviewPanel.hidden = view !== "overview";
    activityPanel.hidden = view !== "activity";
    jobsPanel.hidden = view !== "jobs";
    jobDetailPanel.hidden = view !== "job-detail";
    setupPanel.hidden = view !== "setup";
    evalsPanel.hidden = view !== "evals";
    qualityIntro.hidden = view !== "overview";
    if (lifecyclePanel) lifecyclePanel.hidden = view !== "overview";
    overviewNav.setAttribute("aria-current", view === "overview" ? "page" : "false");
    activityNav.setAttribute("aria-current", view === "activity" ? "page" : "false");
    jobsNav.setAttribute("aria-current", view === "jobs" ? "page" : "false");
    evalsNav.setAttribute("aria-current", view === "evals" ? "page" : "false");
    setupNav.setAttribute("aria-current", view === "setup" ? "page" : "false");
  }

  function appendDefinition(list: HTMLElement, term: string, value: string): void {
    const item = create("div");
    item.append(create("dt", undefined, term), create("dd", undefined, value));
    list.append(item);
  }

  function renderOverallTotals(payload: Record<string, any>): void {
    overviewTotals.replaceChildren();
    appendDefinition(overviewTotals, "Scanned", formatCount(payload.records_scanned));
    appendDefinition(overviewTotals, "Finalized", formatCount(payload.finalized_records));
    appendDefinition(overviewTotals, "Matched", formatCount(payload.matched_records));
    appendDefinition(overviewTotals, "Excluded", formatCount(record(payload.excluded_records).total));
  }

  function renderOverallFindings(findings: string[]): void {
    overviewFindingsList.replaceChildren();
    for (const finding of findings) overviewFindingsList.append(create("li", undefined, finding));
    overviewFindings.hidden = findings.length === 0;
  }

  function metricCard(label: string, value: string, detail: string): HTMLElement {
    const card = create("div", "metric-card");
    card.append(
      create("span", undefined, label),
      create("strong", undefined, value),
      create("small", undefined, detail),
    );
    return card;
  }

  function distribution(
    title: string,
    categories: Array<{ count: unknown; key: string; label: string; rate: unknown }>,
  ): HTMLElement {
    const section = create("section", "distribution");
    const table = create("table") as HTMLTableElement;
    const caption = create("caption", undefined, `${title} counts and shares`);
    const head = create("thead");
    const headRow = create("tr");
    const categoryHead = create("th", undefined, "Category");
    categoryHead.setAttribute("scope", "col");
    const countHead = create("th", undefined, "Jobs");
    countHead.setAttribute("scope", "col");
    const shareHead = create("th", undefined, "Share");
    shareHead.setAttribute("scope", "col");
    headRow.append(categoryHead, countHead, shareHead);
    head.append(headRow);
    const body = create("tbody");
    for (const category of categories) {
      const row = create("tr");
      row.dataset.category = category.key;
      const labelCell = create("th");
      labelCell.setAttribute("scope", "row");
      labelCell.append(create("span", undefined, category.label));
      const progress = create("progress") as HTMLProgressElement;
      progress.max = 1;
      progress.value = rate(category.rate);
      progress.setAttribute("aria-label", `${category.label}: ${formatPercent(category.rate)}`);
      labelCell.append(progress);
      row.append(
        labelCell,
        create("td", undefined, formatCount(category.count)),
        create("td", undefined, formatPercent(category.rate)),
      );
      body.append(row);
    }
    table.append(caption, head, body);
    section.append(create("h4", undefined, title), table);
    return section;
  }

  function disciplineTable(rollup: Record<string, any>): HTMLElement {
    const section = create("section", "discipline");
    const execution = record(rollup.execution_discipline);
    const totals = record(execution.totals);
    const averages = record(execution.averages);
    const coverage = record(execution.coverage);
    const rows: Array<[string, string, string]> = [
      ["Tool calls", formatMetric(totals.tool_calls), formatMetric(averages.tool_calls)],
      ["Executions", formatMetric(totals.executions), formatMetric(averages.executions)],
      ["Execution receipts", formatMetric(totals.execution_receipts), formatMetric(averages.execution_receipts)],
      ["Retries", formatMetric(totals.retries), formatMetric(averages.retries)],
      ["Replays", formatMetric(totals.replays), formatMetric(averages.replays)],
      ["Denied decisions", formatMetric(totals.denied_decisions), formatMetric(averages.denied_decisions)],
      ["Challenges", formatMetric(totals.challenge_decisions), formatMetric(averages.challenge_decisions)],
      ["Runtime", formatDuration(totals.runtime_ms), formatDuration(averages.runtime_ms)],
      ["Estimated cost", `$${formatMetric(totals.estimated_cost_usd, 4)}`, `$${formatMetric(averages.estimated_cost_usd, 4)}`],
    ];
    const table = create("table") as HTMLTableElement;
    const caption = create("caption", undefined, "Execution discipline totals and per-job averages");
    const head = create("thead");
    const headRow = create("tr");
    for (const label of ["Measure", "Total", "Per job"]) {
      const cell = create("th", undefined, label);
      cell.setAttribute("scope", "col");
      headRow.append(cell);
    }
    head.append(headRow);
    const body = create("tbody");
    for (const [label, total, average] of rows) {
      const row = create("tr");
      const labelCell = create("th", undefined, label);
      labelCell.setAttribute("scope", "row");
      row.append(labelCell, create("td", undefined, total), create("td", undefined, average));
      body.append(row);
    }
    table.append(caption, head, body);
    const preference = record(execution.preference_compliance);
    const coverageNote = create(
      "p",
      "window-note",
      `Coverage: runtime ${formatCount(coverage.runtime_ms_records)} job(s), preferences ${formatCount(coverage.preference_records)} job(s). Preference compliance ${preference.rate === null || preference.rate === undefined ? "—" : formatPercent(preference.rate)}.`,
    );
    section.append(create("h4", undefined, "Execution discipline"), table, coverageNote);
    return section;
  }

  function qualityFindings(rollup: Record<string, any>): HTMLElement {
    const quality = record(rollup.data_quality);
    const section = create("section", "quality-findings");
    const totals = create("div", "quality-totals");
    const items: Array<[string, unknown]> = [
      ["Low confidence", quality.low_confidence_count],
      ["Indeterminate", quality.indeterminate_count],
      ["Missing agent", quality.missing_agent_count],
      ["Missing runtime", quality.missing_runtime_count],
    ];
    for (const [label, value] of items) {
      const item = create("div");
      item.append(create("strong", undefined, formatCount(value)), create("span", undefined, label));
      totals.append(item);
    }
    const list = create("ul");
    const findings = Array.isArray(quality.findings)
      ? quality.findings.filter((value: unknown) => typeof value === "string" && value.trim()).slice(0, 20)
      : [];
    if (findings.length === 0) list.append(create("li", undefined, "No profile-level data-quality findings."));
    for (const finding of findings) list.append(create("li", undefined, finding));
    section.append(create("h4", undefined, "Profile data quality"), totals, list);
    return section;
  }

  function isRenderableRollup(value: unknown): value is Record<string, any> {
    const candidate = record(value);
    return candidate.schema_version === "agentpass.intent-quality-rollup.v1"
      && typeof candidate.profile_key === "string"
      && typeof candidate.profile_version === "string"
      && typeof candidate.profile_digest === "string"
      && candidate.profile_digest.length > 0
      && Object.keys(record(candidate.outcomes)).length > 0
      && Object.keys(record(candidate.constraint_compliance)).length > 0
      && Object.keys(record(candidate.evidence_confidence)).length > 0;
  }

  function renderProfile(rollup: Record<string, any>, index: number): HTMLElement {
    const article = create("article", "profile-card");
    const headingId = `profile-group-${index + 1}`;
    const profileKey = safeText(rollup.profile_key);
    const profileVersion = safeText(rollup.profile_version);
    article.setAttribute("aria-label", `Profile ${profileKey}, version ${profileVersion}`);
    const header = create("header", "profile-header");
    const headingBlock = create("div");
    const heading = create("div", "profile-heading");
    const profileTitle = create("h3", undefined, profileKey);
    profileTitle.id = headingId;
    heading.append(profileTitle, create("span", "version-badge", profileVersion));
    const digestValue = safeText(rollup.profile_digest);
    const digest = create("code", "digest", `Digest ${digestValue}`);
    digest.setAttribute("title", digestValue);
    headingBlock.append(heading, digest);
    const sample = record(rollup.sample);
    const sampleBadge = create(
      "span",
      "sample-badge",
      sample.meets_minimum_sample_size === true ? "Minimum sample met" : "Small sample",
    );
    sampleBadge.dataset.smallSample = sample.meets_minimum_sample_size === true ? "false" : "true";
    header.append(headingBlock, sampleBadge);

    const body = create("div", "profile-body");
    const metrics = create("div", "metric-grid");
    const outcomes = record(rollup.outcomes);
    const confidence = record(rollup.evidence_confidence);
    metrics.append(
      metricCard("Finalized jobs", formatCount(sample.finalized_jobs), `Minimum ${formatCount(sample.minimum_sample_size)}`),
      metricCard("Qualified success", formatPercent(record(outcomes.qualified_success).rate), `${formatCount(record(outcomes.qualified_success).count)} job(s)`),
      metricCard("Goal attainment", formatPercent(outcomes.goal_attainment_average), "Average across finalized jobs"),
      metricCard("Evidence confidence", formatPercent(confidence.average), `${formatPercent(confidence.minimum)}–${formatPercent(confidence.maximum)}`),
    );

    const outcomeCounts = record(outcomes.counts);
    const outcomeRates = record(outcomes.rates);
    const compliance = record(rollup.constraint_compliance);
    const complianceCounts = record(compliance.counts);
    const complianceRates = record(compliance.rates);
    const confidenceDistribution = record(confidence.distribution);
    const columns = create("div", "profile-columns");
    columns.append(
      distribution("Outcomes", [
        { key: "completed", label: "Completed", count: outcomeCounts.completed, rate: outcomeRates.completed },
        { key: "partial", label: "Partial", count: outcomeCounts.partial, rate: outcomeRates.partial },
        { key: "failed", label: "Failed", count: outcomeCounts.failed, rate: outcomeRates.failed },
        { key: "indeterminate", label: "Indeterminate", count: outcomeCounts.indeterminate, rate: outcomeRates.indeterminate },
      ]),
      distribution("Constraint compliance", [
        { key: "pass", label: "Pass", count: complianceCounts.pass, rate: complianceRates.pass },
        { key: "fail", label: "Fail", count: complianceCounts.fail, rate: complianceRates.fail },
        { key: "indeterminate", label: "Indeterminate", count: complianceCounts.indeterminate, rate: complianceRates.indeterminate },
      ]),
      distribution("Evidence confidence", [
        { key: "high", label: "High", count: record(confidenceDistribution.high).count, rate: record(confidenceDistribution.high).rate },
        { key: "medium", label: "Medium", count: record(confidenceDistribution.medium).count, rate: record(confidenceDistribution.medium).rate },
        { key: "low", label: "Low", count: record(confidenceDistribution.low).count, rate: record(confidenceDistribution.low).rate },
      ]),
    );
    const disciplineAndQuality = create("div", "discipline-and-quality");
    disciplineAndQuality.append(disciplineTable(rollup), qualityFindings(rollup));
    const timeWindow = record(rollup.time_window);
    const note = create(
      "p",
      "window-note",
      `Immutable window ${safeText(timeWindow.from)} to ${safeText(timeWindow.to)} ${safeText(timeWindow.boundary, "[from,to)")}.`,
    );
    body.append(metrics, columns, disciplineAndQuality, note);
    article.append(header, body);
    return article;
  }

  function describeAge(ageSeconds: number): string {
    if (ageSeconds < 60) return `${ageSeconds} seconds old`;
    if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)} minutes old`;
    return `${Math.floor(ageSeconds / 3600)} hours old`;
  }

  function responseFreshness(response: Response): { ageSeconds?: number; generatedAt?: string; state: string } {
    const state = response.headers.get("x-agentpass-console-data-state") || "unknown";
    const generatedAt = response.headers.get("x-agentpass-console-generated-at") || undefined;
    const rawAge = response.headers.get("x-agentpass-console-data-age-seconds");
    const parsedAge = rawAge === null ? Number.NaN : Number(rawAge);
    return {
      state,
      ...(generatedAt ? { generatedAt } : {}),
      ...(Number.isFinite(parsedAge) && parsedAge >= 0 ? { ageSeconds: Math.floor(parsedAge) } : {}),
    };
  }

  function renderOverview(payloadValue: unknown, response: Response): void {
    const payload = record(payloadValue);
    if (
      payload.schema_version !== "agentpass.intent-quality-rollups.v1"
      || payload.tenant_id !== tenantId
      || !Array.isArray(payload.rollups)
    ) {
      throw new Error("Intent quality response is invalid.");
    }
    const candidates = payload.rollups;
    const groups = candidates.filter(isRenderableRollup);
    if (candidates.length > 0 && groups.length === 0) {
      throw new Error("Intent quality profile groups are invalid.");
    }
    const invalidGroupCount = candidates.length - groups.length;
    const overallQuality = record(payload.data_quality);
    const findings = Array.isArray(overallQuality.findings)
      ? overallQuality.findings.filter((value: unknown) => typeof value === "string" && value.trim()).slice(0, 30)
      : [];
    if (invalidGroupCount > 0) findings.push(`${invalidGroupCount} malformed profile group(s) were not rendered.`);
    renderOverallTotals(payload);
    renderOverallFindings(findings);
    overviewSummary.textContent = `${formatCount(payload.matched_records)} matched finalized job(s) across ${groups.length.toLocaleString("en-US")} immutable profile group(s).`;
    rollupList.replaceChildren(...groups.map(renderProfile));
    overviewContent.hidden = false;
    const freshness = responseFreshness(response);
    const excluded = count(record(payload.excluded_records).total);
    const groupHasFindings = groups.some((group) => {
      const quality = record(group.data_quality);
      return (Array.isArray(quality.findings) && quality.findings.length > 0)
        || record(group.sample).meets_minimum_sample_size !== true;
    });
    refreshButton.hidden = false;
    if (groups.length === 0) {
      setOverviewState(
        "empty",
        "No finalized profile groups matched",
        "Broaden the time window or remove a filter. Preview and unversioned receipts are intentionally excluded.",
      );
      setStatus("ready", "The query completed with no comparable profile groups.");
      return;
    }
    overviewMessage.hidden = true;
    if (freshness.state === "stale") {
      const age = freshness.ageSeconds === undefined ? "older than the freshness threshold" : describeAge(freshness.ageSeconds);
      const generated = freshness.generatedAt ? ` Last generated ${freshness.generatedAt}.` : "";
      setStatus("stale", `The rollup response is ${age}.${generated}`);
    } else if (findings.length > 0 || excluded > 0 || groupHasFindings || invalidGroupCount > 0) {
      setStatus("partial");
    } else {
      setStatus("ready");
    }
  }

  function isRenderableJob(value: unknown): value is Record<string, any> {
    const job = record(value);
    const binding = record(job.profile_binding);
    return job.schema_version === "agentpass.intent-quality-job.v1"
      && job.tenant_id === tenantId
      && job.final_status === "finalized"
      && typeof job.finalized_at === "string"
      && Number.isFinite(Date.parse(job.finalized_at))
      && typeof job.job_id === "string"
      && Boolean(job.job_id)
      && typeof job.intent_id === "string"
      && Boolean(job.intent_id)
      && typeof binding.key === "string"
      && typeof binding.version === "string"
      && typeof binding.digest === "string"
      && /^[a-f0-9]{64}$/.test(binding.digest)
      && ["completed", "partial", "failed", "indeterminate"].includes(job.verdict)
      && ["pass", "fail", "indeterminate"].includes(job.constraint_compliance)
      && typeof job.qualified_success === "boolean"
      && typeof job.goal_attainment === "number"
      && job.goal_attainment >= 0
      && job.goal_attainment <= 1
      && typeof job.evidence_confidence === "number"
      && job.evidence_confidence >= 0
      && job.evidence_confidence <= 1
      && ["low", "medium", "high"].includes(job.confidence_band)
      && Number.isInteger(job.preview_count)
      && job.preview_count >= 0
      && (job.eval_binding === undefined || isRenderableEvalBinding(job.eval_binding, binding))
      && (!isAgentDeclaredIntentProfile(job) || isRenderableIntentContext(job.intent_context))
      && (job.model_usage === undefined || isRenderableModelUsage(job.model_usage))
      && (job.criterion_evaluation === undefined || isRenderableCriterionSummary(job.criterion_evaluation, job.eval_binding));
  }

  function isObservedExecutionProfile(value: unknown): boolean {
    const candidate = record(value);
    return record(candidate.eval_binding).kind === "observed_execution"
      || candidate.key === "agentaction_observed_execution.v1"
      || record(candidate.profile_binding).key === "agentaction_observed_execution.v1";
  }

  function isAgentDeclaredIntentProfile(value: unknown): boolean {
    const candidate = record(value);
    return record(candidate.eval_binding).kind === "agent_declared"
      || candidate.key === "agentaction_declared_intent.v1"
      || record(candidate.profile_binding).key === "agentaction_declared_intent.v1";
  }

  function isRenderableEvalBinding(value: unknown, profileBinding: Record<string, any>): boolean {
    const binding = record(value);
    return binding.schema_version === "agentaction.eval-binding.v1"
      && typeof binding.eval_id === "string"
      && Boolean(binding.eval_id)
      && typeof binding.version === "string"
      && Boolean(binding.version)
      && ["agent_declared", "observed_execution"].includes(binding.kind)
      && ["agent_self_attested", "trusted_execution_state"].includes(binding.trust)
      && binding.trust === (binding.kind === "agent_declared" ? "agent_self_attested" : "trusted_execution_state")
      && binding.profile_key === profileBinding.key
      && binding.profile_digest === profileBinding.digest
      && typeof binding.assignment_id === "string"
      && Boolean(binding.assignment_id)
      && (binding.specification_digest === undefined || (typeof binding.specification_digest === "string" && /^[a-f0-9]{64}$/.test(binding.specification_digest)))
      && (binding.pass_threshold === undefined || (typeof binding.pass_threshold === "number" && binding.pass_threshold >= 0 && binding.pass_threshold <= 1))
      && (binding.required_criteria === undefined || (
        Array.isArray(binding.required_criteria)
        && binding.required_criteria.length <= 20
        && binding.required_criteria.every((item: unknown) => typeof item === "string" && Boolean(item) && item.length <= 80)
        && new Set(binding.required_criteria).size === binding.required_criteria.length
      ));
  }

  function isRenderableCriterionSummary(value: unknown, bindingValue: unknown): boolean {
    const summary = record(value);
    const binding = record(bindingValue);
    const validCount = (candidate: unknown): boolean => Number.isInteger(candidate) && Number(candidate) >= 0 && Number(candidate) <= 50;
    return summary.schema_version === "agentaction.deterministic-eval-result.v1"
      && ["pass", "fail", "insufficient_evidence"].includes(summary.aggregate_status)
      && ["agent_self_attested", "trusted_execution_state"].includes(summary.trust)
      && summary.trust === binding.trust
      && typeof summary.pass_rate === "number"
      && summary.pass_rate >= 0
      && summary.pass_rate <= 1
      && typeof summary.pass_threshold === "number"
      && summary.pass_threshold >= 0
      && summary.pass_threshold <= 1
      && validCount(summary.criteria_count)
      && validCount(summary.passed_count)
      && validCount(summary.failed_count)
      && validCount(summary.insufficient_evidence_count)
      && summary.passed_count + summary.failed_count + summary.insufficient_evidence_count === summary.criteria_count;
  }

  function isRenderableCriterionEvaluation(value: unknown): boolean {
    const result = record(value);
    const provenance = record(result.provenance);
    const criteria = Array.isArray(result.criteria) ? result.criteria.map(record) : [];
    const requiredCriteria = Array.isArray(result.required_criteria) ? result.required_criteria : [];
    const boundedText = (candidate: unknown, maximum: number): boolean => typeof candidate === "string" && Boolean(candidate.trim()) && candidate.length <= maximum;
    const criterionIds = criteria.map((criterion) => criterion.criterion_id);
    return result.schema_version === "agentaction.deterministic-eval-result.v1"
      && ["pass", "fail", "insufficient_evidence"].includes(result.aggregate_status)
      && typeof result.pass_rate === "number"
      && result.pass_rate >= 0
      && result.pass_rate <= 1
      && typeof result.pass_threshold === "number"
      && result.pass_threshold >= 0
      && result.pass_threshold <= 1
      && Array.isArray(result.required_criteria)
      && requiredCriteria.length <= 20
      && requiredCriteria.every((item: unknown) => boundedText(item, 80))
      && new Set(requiredCriteria).size === requiredCriteria.length
      && criteria.length > 0
      && criteria.length <= 20
      && new Set(criterionIds).size === criterionIds.length
      && criteria.every((criterion) => (
        boundedText(criterion.criterion_id, 80)
        && boundedText(criterion.label, 120)
        && boundedText(criterion.description, 500)
        && ["outcome", "constraint"].includes(criterion.category)
        && typeof criterion.required === "boolean"
        && boundedText(criterion.source, 40)
        && (criterion.evidence_trust === undefined || criterion.evidence_trust === "agent_self_attested")
        && (criterion.evidence_trust === undefined || criterion.evidence_trust === provenance.trust)
        && ["pass", "fail", "insufficient_evidence"].includes(criterion.status)
        && boundedText(criterion.explanation, 500)
        && Array.isArray(criterion.evidence_refs)
        && criterion.evidence_refs.length <= 20
        && criterion.evidence_refs.every((reference: unknown) => boundedText(reference, 500))
      ))
      && requiredCriteria.every((criterionId: unknown) => criterionIds.includes(criterionId))
      && provenance.evaluator === "agentaction.deterministic"
      && provenance.evaluator_version === "v1"
      && ["agent_self_attested", "trusted_execution_state"].includes(provenance.trust)
      && boundedText(provenance.eval_id, 80)
      && boundedText(provenance.eval_version, 40)
      && typeof provenance.specification_digest === "string"
      && /^[a-f0-9]{64}$/.test(provenance.specification_digest)
      && typeof provenance.profile_digest === "string"
      && /^[a-f0-9]{64}$/.test(provenance.profile_digest)
      && boundedText(provenance.assignment_id, 160)
      && typeof provenance.evidence_digest === "string"
      && /^[a-f0-9]{64}$/.test(provenance.evidence_digest)
      && validTimestamp(provenance.evaluated_at);
  }

  function criterionEvaluationMatchesDetail(value: unknown, detail: Record<string, any>): boolean {
    if (!isRenderableCriterionEvaluation(value)) return false;
    const provenance = record(record(value).provenance);
    const binding = record(record(detail.job).eval_binding);
    const boundary = record(detail.immutable_boundary);
    const evaluation = record(detail.final_evaluation);
    return provenance.eval_id === binding.eval_id
      && provenance.eval_version === binding.version
      && provenance.trust === binding.trust
      && provenance.specification_digest === binding.specification_digest
      && provenance.profile_digest === binding.profile_digest
      && provenance.assignment_id === binding.assignment_id
      && provenance.evidence_digest === boundary.evidence_digest
      && provenance.evaluated_at === evaluation.evaluated_at;
  }

  function isRenderableIntentContext(value: unknown): boolean {
    const context = record(value);
    const outcome = record(context.reported_outcome);
    const boundedList = (candidate: unknown, minimum: number): boolean => Array.isArray(candidate)
      && candidate.length >= minimum
      && candidate.length <= 8
      && candidate.every((item) => typeof item === "string" && Boolean(item) && item.length <= 240);
    return context.kind === "agent_declared"
      && context.trust === "self_attested"
      && typeof context.goal === "string"
      && Boolean(context.goal)
      && context.goal.length <= 500
      && boundedList(context.success_criteria, 1)
      && boundedList(context.constraints, 0)
      && typeof context.declaration_confidence === "number"
      && context.declaration_confidence >= 0
      && context.declaration_confidence <= 1
      && (
        context.reported_outcome === undefined
        || (
          ["achieved", "partial", "failed", "unknown"].includes(outcome.status)
          && ["all", "some", "none", "unknown"].includes(outcome.success_criteria_met)
          && ["pass", "fail", "unknown"].includes(outcome.constraints_respected)
          && typeof outcome.confidence === "number"
          && outcome.confidence >= 0
          && outcome.confidence <= 1
        )
      );
  }

  function isRenderableModelUsage(value: unknown): boolean {
    const usage = record(value);
    const validInteger = (candidate: unknown, maximum = 1_000_000_000_000): boolean => (
      Number.isSafeInteger(candidate) && Number(candidate) >= 0 && Number(candidate) <= maximum
    );
    if (
      !validInteger(usage.request_count, 10_000)
      || usage.request_count < 1
      || !validInteger(usage.requests_with_model, usage.request_count)
      || !validInteger(usage.requests_with_usage, usage.request_count)
      || (usage.requests_truncated !== undefined && usage.requests_truncated !== true)
      || (usage.models_truncated !== undefined && usage.models_truncated !== true)
      || ["input_tokens", "uncached_input_tokens", "cached_input_tokens", "output_tokens", "total_tokens"].some(
        (key) => usage[key] !== undefined && !validInteger(usage[key]),
      )
      || !tokenBreakdownReconciles(usage)
      || (usage.models !== undefined && (!Array.isArray(usage.models) || usage.models.length > 20))
    ) return false;
    const models = Array.isArray(usage.models) ? usage.models : [];
    return models.every((candidate: unknown) => {
      const group = record(candidate);
      return (typeof group.provider === "string" || typeof group.model === "string")
        && (group.provider === undefined || (Boolean(group.provider.trim()) && group.provider.length <= 160))
        && (group.model === undefined || (Boolean(group.model.trim()) && group.model.length <= 160))
        && validInteger(group.request_count, usage.request_count)
        && group.request_count >= 1
        && validInteger(group.requests_with_usage, group.request_count)
        && ["input_tokens", "uncached_input_tokens", "cached_input_tokens", "output_tokens", "total_tokens"].every(
          (key) => group[key] === undefined || validInteger(group[key]),
        )
        && tokenBreakdownReconciles(group);
    });
  }

  function validTimestamp(value: unknown, nullable = false): boolean {
    return (nullable && value === null)
      || (typeof value === "string" && Number.isFinite(Date.parse(value)));
  }

  function isRenderablePredicate(value: unknown): value is Record<string, any> {
    const predicate = record(value);
    return typeof predicate.predicate_id === "string"
      && Boolean(predicate.predicate_id)
      && ["pass", "fail", "indeterminate"].includes(predicate.status)
      && typeof predicate.observed_count === "number"
      && Number.isFinite(predicate.observed_count)
      && predicate.observed_count >= 0
      && typeof predicate.reason === "string";
  }

  function isRenderablePreview(value: unknown): value is Record<string, any> {
    const preview = record(value);
    return preview.schema_version === "agentpass.intent-quality-job-preview.v1"
      && typeof preview.evaluation_id === "string"
      && Boolean(preview.evaluation_id)
      && validTimestamp(preview.evaluated_at, true)
      && ["recorded", "missing"].includes(preview.timestamp_status)
      && ["completed", "partial", "failed", "indeterminate"].includes(preview.verdict)
      && ["pass", "fail", "indeterminate"].includes(preview.constraint_compliance)
      && typeof preview.qualified_success === "boolean"
      && typeof preview.goal_attainment === "number"
      && preview.goal_attainment >= 0
      && preview.goal_attainment <= 1
      && typeof preview.evidence_confidence === "number"
      && preview.evidence_confidence >= 0
      && preview.evidence_confidence <= 1
      && ["low", "medium", "high"].includes(preview.confidence_band)
      && Array.isArray(preview.evidence_findings);
  }

  function isRenderableTimelineEntry(value: unknown, index: number): value is Record<string, any> {
    const entry = record(value);
    return entry.sequence === index + 1
      && Number.isInteger(entry.source_index)
      && Number(entry.source_index) >= 0
      && [
        "preview_evaluation",
        "authorization_decision",
        "execution_receipt",
        "verified_observation",
        "finalization",
      ].includes(entry.event_type)
      && (entry.evidence_id === null || typeof entry.evidence_id === "string")
      && validTimestamp(entry.occurred_at, true)
      && entry.timestamp_status === (entry.occurred_at === null ? "missing" : "recorded");
  }

  function isRenderableJobDetail(value: unknown): value is Record<string, any> {
    const detail = record(value);
    const boundary = record(detail.immutable_boundary);
    const evaluation = record(detail.final_evaluation);
    const previews = record(detail.previews);
    const sources = record(detail.evidence_sources);
    const timeline = record(detail.timeline);
    const ordering = record(timeline.ordering);
    const quality = record(detail.data_quality);
    const sourceNames = ["decision_events", "execution_receipts", "observations", "job"];
    return detail.schema_version === "agentpass.intent-quality-job-detail.v1"
      && detail.tenant_id === tenantId
      && isRenderableJob(detail.job)
      && boundary.status === "finalized"
      && validTimestamp(boundary.finalized_at)
      && validTimestamp(boundary.captured_at, true)
      && typeof boundary.intent_digest === "string"
      && /^[a-f0-9]{64}$/.test(boundary.intent_digest)
      && typeof boundary.snapshot_id === "string"
      && Boolean(boundary.snapshot_id)
      && typeof boundary.evidence_digest === "string"
      && /^[a-f0-9]{64}$/.test(boundary.evidence_digest)
      && evaluation.schema_version === "agentpass.intent-quality-job-final-evaluation.v1"
      && typeof evaluation.evaluation_id === "string"
      && Boolean(evaluation.evaluation_id)
      && validTimestamp(evaluation.evaluated_at, true)
      && ["completed", "partial", "failed", "indeterminate"].includes(evaluation.verdict)
      && ["pass", "fail", "indeterminate"].includes(evaluation.constraint_compliance)
      && typeof evaluation.qualified_success === "boolean"
      && typeof evaluation.goal_attainment === "number"
      && evaluation.goal_attainment >= 0
      && evaluation.goal_attainment <= 1
      && typeof evaluation.evidence_confidence === "number"
      && evaluation.evidence_confidence >= 0
      && evaluation.evidence_confidence <= 1
      && ["low", "medium", "high"].includes(evaluation.confidence_band)
      && Array.isArray(evaluation.outcomes)
      && evaluation.outcomes.every(isRenderablePredicate)
      && Array.isArray(evaluation.constraints)
      && evaluation.constraints.every(isRenderablePredicate)
      && typeof evaluation.execution_discipline === "object"
      && Array.isArray(evaluation.evidence_findings)
      && (evaluation.criterion_evaluation === undefined || criterionEvaluationMatchesDetail(evaluation.criterion_evaluation, detail))
      && Number.isInteger(previews.count)
      && Number(previews.count) >= 0
      && Number.isInteger(previews.invalid_count)
      && Number(previews.invalid_count) >= 0
      && Array.isArray(previews.evaluations)
      && previews.evaluations.length === previews.count
      && previews.evaluations.every(isRenderablePreview)
      && sourceNames.every((name) => {
        const source = record(sources[name]);
        return Number.isInteger(source.count)
          && Number(source.count) >= 0
          && (source.declared_count === null || (Number.isInteger(source.declared_count) && Number(source.declared_count) >= 0))
          && (source.digest === null || (typeof source.digest === "string" && /^[a-f0-9]{64}$/.test(source.digest)));
      })
      && ordering.direction === "ascending"
      && ordering.primary === "occurred_at with missing timestamps last"
      && ordering.tie_breaker === "event_type, evidence_id, source_index"
      && Array.isArray(timeline.entries)
      && timeline.entries.every(isRenderableTimelineEntry)
      && Number.isInteger(quality.missing_timestamps_count)
      && Number(quality.missing_timestamps_count) >= 0
      && Number.isInteger(quality.invalid_preview_count)
      && Number(quality.invalid_preview_count) >= 0
      && Array.isArray(quality.findings);
  }

  function formatTimestamp(value: unknown): string {
    if (!validTimestamp(value)) return "Timestamp missing";
    return new runtime.Date(String(value)).toLocaleString(
      "en-US",
      { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" },
    ) + " UTC";
  }

  function renderPredicateList(values: Record<string, any>[], emptyLabel: string): HTMLElement {
    if (values.length === 0) return create("p", "window-note", emptyLabel);
    const list = create("ul", "predicate-list");
    for (const predicate of values) {
      const item = create("li");
      item.append(
        statusPill(safeText(predicate.status), safeText(predicate.status, "indeterminate")),
        create("strong", undefined, safeText(predicate.predicate_id)),
        create("p", undefined, `${safeText(predicate.reason)} · ${formatCount(predicate.observed_count)} observation(s)`),
      );
      list.append(item);
    }
    return list;
  }

  function appendDiscipline(list: HTMLElement, label: string, value: string): void {
    list.append(create("dt", undefined, label), create("dd", undefined, value));
  }

  function timelineLabel(eventType: string): string {
    return {
      preview_evaluation: "Preview evaluation",
      authorization_decision: "Authorization decision",
      execution_receipt: "Execution receipt",
      verified_observation: "Verified observation",
      finalization: "Immutable finalization",
    }[eventType] || "Evidence event";
  }

  function renderTimelineEntry(entry: Record<string, any>): HTMLElement {
    const item = create("li", "timeline-entry");
    const time = create("time", "timeline-time", formatTimestamp(entry.occurred_at));
    time.dataset.missing = String(entry.occurred_at === null);
    if (entry.occurred_at) time.setAttribute("datetime", entry.occurred_at);
    const body = create("div", "timeline-body");
    const title = create("div", "timeline-title");
    title.append(create("strong", undefined, timelineLabel(entry.event_type)));
    if (entry.evidence_id) title.append(create("code", undefined, entry.evidence_id));
    const metadata = create("div", "timeline-metadata");
    const addMetadata = (label: string, value: unknown) => {
      if (typeof value === "string" && value) metadata.append(create("span", undefined, `${label}: ${value}`));
      if (typeof value === "number" && Number.isFinite(value)) metadata.append(create("span", undefined, `${label}: ${value}`));
    };
    if (entry.event_type === "preview_evaluation" || entry.event_type === "finalization") {
      addMetadata("Verdict", entry.verdict);
      addMetadata("Constraint", entry.constraint_compliance);
      if (typeof entry.evidence_confidence === "number") {
        addMetadata("Confidence", formatPercent(entry.evidence_confidence));
      }
    } else if (entry.event_type === "authorization_decision") {
      addMetadata("Decision", entry.decision);
      addMetadata("Agent", entry.agent_id);
      addMetadata("Tool", entry.tool);
      addMetadata("Action", entry.action);
      addMetadata("Approval", entry.approval_id);
      addMetadata("JIT grant", entry.jit_grant_id);
      if (entry.replayed === true) addMetadata("Replay", "yes");
    } else if (entry.event_type === "execution_receipt") {
      addMetadata("Status", entry.status);
      addMetadata("Tool", entry.tool);
      addMetadata("Action", entry.action);
      addMetadata("Replays", entry.replay_count);
      addMetadata("Outcome", entry.outcome_code);
      addMetadata("Error", entry.error_code);
      addMetadata("Completed", entry.completed_at ? formatTimestamp(entry.completed_at) : "");
    } else if (entry.event_type === "verified_observation") {
      addMetadata("Issuer", entry.issuer);
      addMetadata("Predicate", entry.predicate);
      addMetadata("Verification", entry.verification_method);
      addMetadata("Signing key", entry.signature_kid);
      addMetadata("Verified", entry.verified_at ? formatTimestamp(entry.verified_at) : "");
    }
    body.append(title, metadata);
    const findings = Array.isArray(entry.findings)
      ? entry.findings.filter((value: unknown) => typeof value === "string" && value.trim()).slice(0, 20)
      : [];
    if (findings.length > 0) {
      const list = create("ul", "timeline-findings");
      for (const finding of findings) list.append(create("li", undefined, finding));
      body.append(list);
    }
    item.append(create("span", "timeline-sequence", entry.sequence), time, body);
    return item;
  }

  function renderCriterionEvaluation(value: unknown): void {
    if (!isRenderableCriterionEvaluation(value)) {
      jobDetailCriteriaSection.hidden = true;
      jobDetailCriteriaSummary.textContent = "";
      jobDetailCriteria.replaceChildren();
      return;
    }
    const result = record(value);
    const provenance = record(result.provenance);
    const criteria = (result.criteria as Record<string, any>[]);
    const passed = criteria.filter((criterion) => criterion.status === "pass").length;
    jobDetailCriteriaSummary.textContent = `${safeText(result.aggregate_status).replaceAll("_", " ")} · ${passed} of ${criteria.length} passed · threshold ${formatPercent(result.pass_threshold)} · ${evalTrustLabel(provenance)} · ${safeText(provenance.evaluator)} ${safeText(provenance.evaluator_version)}`;
    const criterionCards = criteria.map((criterion) => {
      const card = create("article", "criterion-result");
      card.dataset.state = safeText(criterion.status, "insufficient_evidence");
      const heading = create("header");
      heading.append(
        create("h4", undefined, safeText(criterion.label, criterion.criterion_id)),
        statusPill(safeText(criterion.status).replaceAll("_", " "), safeText(criterion.status)),
      );
      const details = create("dl");
      appendDefinition(details, "Category", safeText(criterion.category));
      appendDefinition(details, "Evidence source", safeText(criterion.source));
      appendDefinition(details, "Eval trust", evalTrustLabel({ trust: criterion.evidence_trust || provenance.trust }));
      appendDefinition(details, "Required", criterion.required === true ? "Yes" : "No");
      appendDefinition(details, "Evidence", Array.isArray(criterion.evidence_refs) && criterion.evidence_refs.length > 0 ? criterion.evidence_refs.join(" · ") : "No evidence reference");
      card.append(
        heading,
        create("p", undefined, safeText(criterion.description)),
        create("p", undefined, safeText(criterion.explanation)),
        details,
      );
      return card;
    });
    const provenanceCard = create("article", "criterion-result criterion-provenance");
    provenanceCard.append(create("h4", undefined, "Frozen evaluator provenance"));
    const provenanceDetails = create("dl");
    appendDefinition(provenanceDetails, "Evaluator", `${safeText(provenance.evaluator)} ${safeText(provenance.evaluator_version)}`);
    appendDefinition(provenanceDetails, "Eval trust", evalTrustLabel(provenance));
    appendDefinition(provenanceDetails, "Interpretation", evalTrustExplanation(provenance));
    appendDefinition(provenanceDetails, "Eval version", `${safeText(provenance.eval_id)}.${safeText(provenance.eval_version)}`);
    appendDefinition(provenanceDetails, "Assignment", safeText(provenance.assignment_id));
    appendDefinition(provenanceDetails, "Specification digest", safeText(provenance.specification_digest));
    appendDefinition(provenanceDetails, "Profile digest", safeText(provenance.profile_digest));
    appendDefinition(provenanceDetails, "Evidence digest", safeText(provenance.evidence_digest));
    appendDefinition(provenanceDetails, "Evaluated at", formatTimestamp(provenance.evaluated_at));
    provenanceCard.append(provenanceDetails);
    jobDetailCriteria.replaceChildren(...criterionCards, provenanceCard);
    jobDetailCriteriaSection.hidden = false;
  }

  function renderJobDetail(payloadValue: unknown, response: Response): void {
    if (!isRenderableJobDetail(payloadValue)) throw new Error("Finalized Job detail response is invalid.");
    const payload = record(payloadValue);
    const job = record(payload.job);
    const boundary = record(payload.immutable_boundary);
    const evaluation = record(payload.final_evaluation);
    const discipline = record(evaluation.execution_discipline);
    const previews = record(payload.previews);
    const timeline = record(payload.timeline);
    const entries = timeline.entries as Record<string, any>[];
    const quality = record(payload.data_quality);
    const observedExecution = isObservedExecutionProfile(job);
    const agentDeclared = isAgentDeclaredIntentProfile(job);
    const evalBinding = record(job.eval_binding);
    const intentContext = record(job.intent_context);
    const reportedOutcome = record(intentContext.reported_outcome);

    jobDetailTitle.textContent = safeText(job.job_id);
    jobDetailSubtitle.textContent = observedExecution
      ? `Observed Hermes run · ${safeText(job.agent_id, "Agent identity missing")} · no semantic intent inferred`
      : agentDeclared
        ? `Agent-declared intent · ${safeText(job.agent_id, "Agent identity missing")} · Self-attested by agent`
        : `Intent ${safeText(job.intent_id)} · ${safeText(job.agent_id, "Agent identity missing")}`;
    jobDetailStatus.replaceChildren(statusPill("Finalized", "completed"));
    jobDetailBoundary.replaceChildren();
    appendDefinition(jobDetailBoundary, "Finalized at", formatTimestamp(boundary.finalized_at));
    appendDefinition(jobDetailBoundary, "Captured at", boundary.captured_at ? formatTimestamp(boundary.captured_at) : "Timestamp missing");
    appendDefinition(
      jobDetailBoundary,
      "Profile",
      observedExecution
        ? `Observed execution · ${safeText(record(job.profile_binding).version)}`
        : agentDeclared
          ? `Agent-declared intent · ${safeText(record(job.profile_binding).version)}`
        : `${safeText(record(job.profile_binding).key)} · ${safeText(record(job.profile_binding).version)}`,
    );
    if (observedExecution) appendDefinition(jobDetailBoundary, "Intent meaning", "Lifecycle completion only; no semantic intent inferred");
    if (agentDeclared) {
      appendDefinition(jobDetailBoundary, "Intent meaning", "Self-attested by agent; not trusted user intent");
      appendDefinition(jobDetailBoundary, "Declared goal", safeText(intentContext.goal));
      appendDefinition(jobDetailBoundary, "Declaration confidence", formatPercent(intentContext.declaration_confidence));
      appendDefinition(jobDetailBoundary, "Reported outcome", safeText(reportedOutcome.status, "Not reported"));
      if (typeof reportedOutcome.confidence === "number") {
        appendDefinition(jobDetailBoundary, "Outcome confidence", formatPercent(reportedOutcome.confidence));
      }
    }
    appendDefinition(jobDetailBoundary, "Profile digest", safeText(record(job.profile_binding).digest));
    if (Object.keys(evalBinding).length > 0) {
      appendDefinition(jobDetailBoundary, "Eval", `${evalDisplayName(evalBinding)} · ${safeText(evalBinding.version)}`);
      appendDefinition(jobDetailBoundary, "Eval route", safeText(evalBinding.assignment_id));
    }
    appendDefinition(jobDetailBoundary, "Intent digest", safeText(boundary.intent_digest));
    appendDefinition(jobDetailBoundary, "Snapshot", safeText(boundary.snapshot_id));
    appendDefinition(jobDetailBoundary, "Evidence digest", safeText(boundary.evidence_digest));

    const modelUsage = record(job.model_usage);
    const modelGroups = Array.isArray(modelUsage.models) ? modelUsage.models.map(record).slice(0, 20) : [];
    if (isRenderableModelUsage(job.model_usage)) {
      const coverage = `${formatCount(modelUsage.requests_with_usage)} of ${formatCount(modelUsage.request_count)} request(s) reported tokens`;
      jobDetailModelUsageSummary.textContent = `Actual provider usage · ${coverage}${modelUsage.requests_truncated === true ? " · request summary capped" : ""}.`;
      jobDetailModelUsageMetrics.replaceChildren(
        metricCard("Total tokens", formatTokens(modelUsage.total_tokens), "Provider reported"),
        metricCard("Uncached input", tokenComponent(modelUsage.uncached_input_tokens), "Provider reported"),
        metricCard("Cached input", tokenComponent(modelUsage.cached_input_tokens), modelUsage.cached_input_tokens === undefined ? "Not reported" : "Provider reported"),
        metricCard("Output tokens", formatTokens(modelUsage.output_tokens), "Provider reported"),
        metricCard("Model requests", formatCount(modelUsage.request_count), `${formatCount(modelUsage.requests_with_model)} identified`),
      );
      if (modelGroups.length > 0) {
        jobDetailModelUsageModels.replaceChildren(...modelGroups.map((group) => {
          const card = create("article", "source-card");
          card.append(
            create("span", undefined, modelUsageLabel(group)),
            create("strong", undefined, formatTokens(group.total_tokens)),
            create("small", undefined, `${formatCount(group.request_count)} request(s) · ${formatCount(group.requests_with_usage)} with usage`),
            create("code", undefined, tokenBreakdownLabel(group)),
            ...(legacyInputLabel(group) ? [create("small", undefined, legacyInputLabel(group))] : []),
          );
          return card;
        }));
      } else {
        jobDetailModelUsageModels.replaceChildren(create("p", "window-note", "The provider did not identify a model for these requests."));
      }
    } else {
      jobDetailModelUsageSummary.textContent = "Usage was not reported for this job.";
      jobDetailModelUsageMetrics.replaceChildren(
        metricCard("Total tokens", "Unavailable", "No provider report"),
        metricCard("Uncached input", "Not reported", "No provider report"),
        metricCard("Cached input", "Not reported", "No provider report"),
        metricCard("Output tokens", "Unavailable", "No provider report"),
        metricCard("Model requests", "Unavailable", "Older or non-model job"),
      );
      jobDetailModelUsageModels.replaceChildren(create("p", "window-note", "No model breakdown is available."));
    }

    jobDetailEvaluationId.textContent = `Evaluation ${safeText(evaluation.evaluation_id)} · ${evaluation.evaluated_at ? formatTimestamp(evaluation.evaluated_at) : "timestamp missing"}`;
    jobDetailMetrics.replaceChildren(
      metricCard("Verdict", safeText(evaluation.verdict), evaluation.qualified_success ? "Qualified success" : "Not qualified"),
      metricCard(
        "Goal attainment",
        formatPercent(evaluation.goal_attainment),
        observedExecution ? "Lifecycle objective" : agentDeclared ? "Agent self-attestation" : "Intent-relative",
      ),
      metricCard("Constraints", safeText(evaluation.constraint_compliance), `${(evaluation.constraints as any[]).length} evaluated`),
      metricCard(
        "Evidence",
        formatPercent(evaluation.evidence_confidence),
        agentDeclared ? "Self-attested by agent" : `${safeText(evaluation.confidence_band)} confidence`,
      ),
    );
    jobDetailOutcomes.replaceChildren(renderPredicateList(evaluation.outcomes, "No outcome predicates were recorded."));
    jobDetailConstraints.replaceChildren(renderPredicateList(evaluation.constraints, "No constraint predicates were recorded."));
    renderCriterionEvaluation(evaluation.criterion_evaluation);
    jobDetailDiscipline.replaceChildren();
    appendDiscipline(jobDetailDiscipline, "Tool calls", formatCount(discipline.tool_calls));
    appendDiscipline(jobDetailDiscipline, "Receipts", formatCount(discipline.execution_receipts));
    appendDiscipline(jobDetailDiscipline, "Executions", formatCount(discipline.executions));
    appendDiscipline(jobDetailDiscipline, "Denials", formatCount(discipline.denied_decisions));
    appendDiscipline(jobDetailDiscipline, "Challenges", formatCount(discipline.challenge_decisions));
    appendDiscipline(jobDetailDiscipline, "Retries", formatCount(discipline.retries));
    appendDiscipline(jobDetailDiscipline, "Replays", formatCount(discipline.replays));
    appendDiscipline(jobDetailDiscipline, "Runtime", formatDuration(discipline.runtime_ms));

    jobDetailTimelineSummary.textContent = `${entries.length.toLocaleString("en-US")} event(s), ascending; missing timestamps last.`;
    jobDetailTimeline.replaceChildren(...entries.map(renderTimelineEntry));
    const previewEvaluations = previews.evaluations as Record<string, any>[];
    jobDetailPreviewSummary.textContent = `${formatCount(previews.count)} valid · ${formatCount(previews.invalid_count)} excluded`;
    if (previewEvaluations.length === 0) {
      jobDetailPreviews.replaceChildren(create("p", "window-note", "No preview evaluations preceded this final receipt."));
    } else {
      jobDetailPreviews.replaceChildren(...previewEvaluations.map((preview) => {
        const card = create("article", "preview-card");
        const copy = create("div");
        copy.append(
          create("strong", undefined, safeText(preview.evaluation_id)),
          create("small", undefined, `${preview.evaluated_at ? formatTimestamp(preview.evaluated_at) : "Timestamp missing"} · Goal ${formatPercent(preview.goal_attainment)}`),
        );
        card.append(copy, statusPill(safeText(preview.verdict), safeText(preview.verdict, "indeterminate")));
        return card;
      }));
    }

    const sourceLabels: Record<string, string> = {
      decision_events: "Decision events",
      execution_receipts: "Execution receipts",
      observations: "Observations",
      job: "Job record",
    };
    jobDetailSources.replaceChildren(...Object.entries(sourceLabels).map(([name, label]) => {
      const source = record(record(payload.evidence_sources)[name]);
      const card = create("article", "source-card");
      card.append(
        create("span", undefined, label),
        create("strong", undefined, formatCount(source.count)),
        create("code", undefined, source.digest ? `Digest ${source.digest}` : "Digest unavailable"),
      );
      if (source.declared_count !== source.count) {
        card.append(create("small", undefined, `Declared ${formatCount(source.declared_count)}`));
      }
      return card;
    }));

    const findings = [
      ...(Array.isArray(quality.findings) ? quality.findings : []),
      ...(Array.isArray(evaluation.evidence_findings) ? evaluation.evidence_findings : []),
      ...(Array.isArray(discipline.preference_findings) ? discipline.preference_findings : []),
    ].filter((value: unknown) => typeof value === "string" && value.trim()).slice(0, 40);
    jobDetailFindingsList.replaceChildren(...findings.map((finding: string) => create("li", undefined, finding)));
    jobDetailFindings.hidden = findings.length === 0;
    jobDetailContent.hidden = false;
    jobDetailMessage.hidden = true;
    refreshButton.hidden = false;
    const freshness = responseFreshness(response);
    if (freshness.state === "stale") {
      const age = freshness.ageSeconds === undefined ? "older than the freshness threshold" : describeAge(freshness.ageSeconds);
      setStatus("stale", `The finalized Job detail response is ${age}.`);
    } else if (findings.length > 0 || Number(quality.missing_timestamps_count) > 0 || Number(quality.invalid_preview_count) > 0) {
      setStatus("partial", "The immutable receipt is available; review its explicit evidence and timing findings.");
    } else {
      setStatus("ready", "The finalized Job detail and ordered immutable evidence path are current.");
    }
  }

  function tableCell(label: string, content: HTMLElement): HTMLElement {
    const cell = create("td");
    cell.setAttribute("data-label", label);
    cell.append(content);
    return cell;
  }

  function cellStack(...nodes: HTMLElement[]): HTMLElement {
    const stack = create("div", "cell-stack");
    stack.append(...nodes);
    return stack;
  }

  function statusPill(label: string, state: string): HTMLElement {
    const pill = create("span", "status-pill", label);
    pill.dataset.state = state;
    return pill;
  }

  function renderJob(job: Record<string, any>): HTMLElement {
    const row = create("tr");
    const binding = record(job.profile_binding);
    const quality = record(job.data_quality);
    const discipline = record(job.execution_discipline);
    const finalized = new runtime.Date(job.finalized_at);
    const finalizedLabel = Number.isFinite(finalized.getTime())
      ? finalized.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC"
      : safeText(job.finalized_at);

    const jobLink = create("a", "job-link", safeText(job.job_id));
    const detailQuery = new URLSearchParams({ job_id: safeText(job.job_id, "") });
    appendWorkspacePreference(detailQuery);
    jobLink.setAttribute("href", `${runtime.location.pathname || "/"}?${detailQuery.toString()}#job-detail`);
    jobLink.setAttribute("aria-label", `Open finalized detail for job ${safeText(job.job_id)}`);
    jobLink.addEventListener("click", (event) => {
      event.preventDefault();
      currentJobId = safeText(job.job_id, "").slice(0, 160);
      showView("job-detail");
      void loadJobDetail();
    });
    const idCell = cellStack(jobLink, create("code", undefined, `Intent ${safeText(job.intent_id)}`));

    const agentIds = Array.isArray(job.agent_ids)
      ? job.agent_ids.filter((value: unknown) => typeof value === "string" && value.trim()).slice(0, 20)
      : [];
    const agentCell = cellStack(
      create("strong", undefined, agentIds.length > 0 ? agentIds.join(", ") : "Missing"),
      ...(agentIds.length === 0 ? [statusPill("Missing identity", "indeterminate")] : []),
    );

    const declaredIntent = isAgentDeclaredIntentProfile(job);
    const observedExecution = isObservedExecutionProfile(job);
    const evalBinding = record(job.eval_binding);
    const intentContext = record(job.intent_context);
    const profileCell = declaredIntent
      ? cellStack(
        create("strong", undefined, evalDisplayName(evalBinding, "Agent-declared intent")),
        create("small", undefined, "Self-attested by agent · not trusted user intent"),
        create("small", undefined, safeText(intentContext.goal)),
        create("small", undefined, `Eval version ${safeText(evalBinding.version, binding.version)} · route ${safeText(evalBinding.assignment_id, "legacy")}`),
        create("code", undefined, safeText(binding.digest)),
      )
      : cellStack(
        create("strong", undefined, evalDisplayName(evalBinding, observedExecution ? "Observed execution" : safeText(binding.key))),
        create("small", undefined, observedExecution ? "System lifecycle profile · no inferred intent" : `Version ${safeText(binding.version)}`),
        ...(Object.keys(evalBinding).length > 0 ? [create("small", undefined, `Eval version ${safeText(evalBinding.version)} · route ${safeText(evalBinding.assignment_id)}`)] : []),
        create("code", undefined, safeText(binding.digest)),
      );
    const outcomeCell = cellStack(
      statusPill(safeText(job.verdict), safeText(job.verdict, "indeterminate")),
      create("small", undefined, `Constraint ${safeText(job.constraint_compliance)}`),
      create("small", undefined, `Goal ${formatPercent(job.goal_attainment)} · Qualified ${job.qualified_success ? "yes" : "no"}`),
    );
    const criterionSummary = record(job.criterion_evaluation);
    if (isRenderableCriterionSummary(job.criterion_evaluation, job.eval_binding)) {
      outcomeCell.append(
        statusPill(safeText(criterionSummary.aggregate_status).replaceAll("_", " "), safeText(criterionSummary.aggregate_status)),
        create("small", undefined, `Criteria ${formatCount(criterionSummary.passed_count)}/${formatCount(criterionSummary.criteria_count)} passed · ${formatPercent(criterionSummary.pass_rate)} vs ${formatPercent(criterionSummary.pass_threshold)} threshold`),
        create("small", undefined, `Eval trust: ${evalTrustLabel(criterionSummary)} · ${evalTrustExplanation(criterionSummary)}`),
      );
    }

    const modelUsage = record(job.model_usage);
    const modelGroups = Array.isArray(modelUsage.models) ? modelUsage.models.map(record).slice(0, 20) : [];
    const usageCell = isRenderableModelUsage(job.model_usage)
      ? cellStack(
        create("strong", undefined, modelGroups.length > 0 ? modelUsageLabel(modelGroups[0]) : "Model unavailable"),
        create("small", undefined, modelUsage.total_tokens === undefined ? "Actual tokens unavailable" : `${formatTokens(modelUsage.total_tokens)} actual`),
        create("small", undefined, tokenBreakdownLabel(modelUsage)),
        ...(legacyInputLabel(modelUsage) ? [create("small", undefined, legacyInputLabel(modelUsage))] : []),
        create("small", undefined, `${formatCount(modelUsage.requests_with_usage)}/${formatCount(modelUsage.request_count)} request(s) reported usage`),
      )
      : cellStack(
        create("strong", undefined, "Unavailable"),
        create("small", undefined, "No model or token report"),
      );

    const evidenceCell = cellStack(
      statusPill(`${safeText(job.confidence_band)} ${formatPercent(job.evidence_confidence)}`, safeText(job.confidence_band, "low")),
    );
    const rowFindings = Array.isArray(quality.findings)
      ? quality.findings.filter((value: unknown) => typeof value === "string" && value.trim()).slice(0, 10)
      : [];
    if (rowFindings.length > 0) {
      const list = create("ul", "job-findings");
      for (const finding of rowFindings) list.append(create("li", undefined, finding));
      evidenceCell.append(list);
    }

    const disciplineCell = cellStack(
      create("strong", undefined, `${formatCount(job.preview_count)} preview(s)`),
      create("small", undefined, `${formatCount(discipline.retries)} retries · ${formatCount(discipline.replays)} replays`),
      create("small", undefined, `Runtime ${formatDuration(discipline.runtime_ms)}`),
    );
    const statusCell = cellStack(
      statusPill("Finalized", "completed"),
      create("small", undefined, "Immutable receipt"),
    );

    row.append(
      tableCell("Finalized", cellStack(create("time", undefined, finalizedLabel))),
      tableCell("Job / intent", idCell),
      tableCell("Agent", agentCell),
      tableCell("Eval / intent", profileCell),
      tableCell("Outcome", outcomeCell),
      tableCell("Model usage", usageCell),
      tableCell("Evidence", evidenceCell),
      tableCell("Discipline", disciplineCell),
      tableCell("Status", statusCell),
    );
    return row;
  }

  function renderJobs(payloadValue: unknown, response: Response): void {
    const payload = record(payloadValue);
    if (
      payload.schema_version !== "agentpass.intent-quality-jobs.v1"
      || payload.tenant_id !== tenantId
      || !Array.isArray(payload.jobs)
    ) throw new Error("Intent quality jobs response is invalid.");
    const candidates = payload.jobs;
    const jobs = candidates.filter(isRenderableJob);
    if (candidates.length > 0 && jobs.length === 0) throw new Error("Finalized jobs are invalid.");
    const invalidCount = candidates.length - jobs.length;
    const overallQuality = record(payload.data_quality);
    const findings = Array.isArray(overallQuality.findings)
      ? overallQuality.findings.filter((value: unknown) => typeof value === "string" && value.trim()).slice(0, 30)
      : [];
    if (invalidCount > 0) findings.push(`${invalidCount} malformed finalized job(s) were not rendered.`);
    nextJobsCursor = typeof record(payload.pagination).next_cursor === "string"
      ? record(payload.pagination).next_cursor.slice(0, 1_024)
      : "";
    jobsNextButton.hidden = !nextJobsCursor;
    jobsList.replaceChildren(...jobs.map(renderJob));
    jobsSummary.textContent = `${formatCount(payload.matched_records)} matched finalized job(s); ${jobs.length.toLocaleString("en-US")} on this page.`;
    jobsFindings.textContent = findings.length > 0 ? findings.join(" · ") : "No read-model findings.";
    jobsPageSummary.textContent = currentJobsCursor
      ? `Showing a cursor-stable subsequent page of ${jobs.length.toLocaleString("en-US")} job(s).`
      : `Showing the first ${jobs.length.toLocaleString("en-US")} job(s), newest finalized first.`;
    jobsContent.hidden = false;
    jobsLoaded = true;
    if (jobs.length === 0) {
      jobsContent.hidden = true;
      setJobsState(
        "empty",
        "No finalized jobs matched",
        "Broaden the bounded window or remove an exact filter. Preview-only work is intentionally excluded.",
      );
      setStatus("ready", "The Jobs query completed with no finalized matches.");
      return;
    }
    jobsMessage.hidden = true;
    const freshness = responseFreshness(response);
    const excluded = count(record(payload.excluded_records).total);
    const jobHasFindings = jobs.some((job) => {
      const rowQuality = record(job.data_quality);
      return Array.isArray(rowQuality.findings) && rowQuality.findings.length > 0;
    });
    if (freshness.state === "stale") {
      const age = freshness.ageSeconds === undefined ? "older than the freshness threshold" : describeAge(freshness.ageSeconds);
      setStatus("stale", `The finalized Jobs response is ${age}.`);
    } else if (findings.length > 0 || excluded > 0 || jobHasFindings || invalidCount > 0) {
      setStatus("partial", "Finalized jobs are current; review explicit evidence-confidence and data-quality findings.");
    } else {
      setStatus("ready", "Finalized jobs are current and ordered by immutable finalization time.");
    }
  }

  function isRenderableActivity(value: unknown): boolean {
    const event = record(value);
    const intent = record(event.intent);
    return event.schema_version === "agentaction.hermes-observation.v1"
      && typeof event.event_id === "string"
      && typeof event.event_type === "string"
      && validTimestamp(event.observed_at)
      && typeof event.agent_id === "string"
      && (intent.binding_status === "bound" || intent.binding_status === "unbound");
  }

  function renderActivityEvent(value: unknown): HTMLElement {
    const event = record(value);
    const tool = record(event.tool);
    const evaluation = record(event.evaluation);
    const execution = record(event.execution);
    const intent = record(event.intent);
    const correlation = record(event.correlation);
    const model = record(event.model);
    const request = record(event.request);
    const usage = record(event.usage);
    const row = create("tr");
    const correlationValues = ["session_id", "job_id", "task_id", "turn_id", "tool_call_id", "api_request_id", "child_subagent_id"]
      .map((key) => safeText(correlation[key], ""))
      .filter(Boolean);
    const intentCell = intent.binding_status === "bound"
      ? cellStack(statusPill("Explicitly bound", "completed"), create("small", undefined, safeText(intent.intent_id)))
      : cellStack(statusPill("Unbound", "indeterminate"), create("small", undefined, "No intent was inferred"));
    const decision = safeText(evaluation.counterfactual_decision, "Not evaluated");
    const executionStatus = safeText(execution.status, "Not applicable");
    const modelEvent = event.event_type === "model_request_started" || event.event_type === "model_request_completed";
    let tokenSummary = "Not a model event";
    let tokenBasis = "—";
    let tokenDetail = "";
    if (event.event_type === "model_request_started") {
      tokenSummary = Number.isSafeInteger(request.approx_input_tokens)
        ? `Approx. ${formatTokens(request.approx_input_tokens)}`
        : "Estimate unavailable";
      tokenBasis = "Pre-request estimate";
    } else if (event.event_type === "model_request_completed") {
      if (Number.isSafeInteger(usage.total_tokens)) {
        tokenSummary = `${formatTokens(usage.total_tokens)} actual`;
      } else if (Number.isSafeInteger(usage.input_tokens) || Number.isSafeInteger(usage.output_tokens)) {
        tokenSummary = "Actual total unavailable";
      } else {
        tokenSummary = "Actual usage unavailable";
      }
      if (["input_tokens", "uncached_input_tokens", "cached_input_tokens", "output_tokens"].some((key) => Number.isSafeInteger(usage[key]))) {
        tokenDetail = tokenBreakdownLabel(usage);
      }
      tokenBasis = hasCompleteTokenBreakdown(usage)
        ? tokenBreakdownReconciles(usage) ? "Provider-reported actual · reconciled" : "Provider report does not reconcile"
        : legacyInputLabel(usage) || "Provider-reported actual · cache breakdown not reported";
    }
    const modelCell = modelEvent
      ? cellStack(
        create("strong", undefined, modelUsageLabel(model)),
        create("small", undefined, tokenSummary),
        ...(tokenDetail ? [create("small", undefined, tokenDetail)] : []),
        create("small", undefined, tokenBasis),
      )
      : cellStack(create("strong", undefined, "—"), create("small", undefined, tokenSummary));
    row.append(
      tableCell("Observed", cellStack(create("time", undefined, formatTimestamp(event.observed_at)), create("small", undefined, safeText(event.event_id)))),
      tableCell("Agent / event", cellStack(create("strong", undefined, safeText(event.agent_id)), create("small", undefined, safeText(event.event_type)))),
      tableCell("Tool", cellStack(create("strong", undefined, safeText(tool.name, "Not a tool event")), create("small", undefined, safeText(tool.action, "—")))),
      tableCell("Model / tokens", modelCell),
      tableCell("Shadow decision", cellStack(statusPill(decision, decision), create("small", undefined, safeText(evaluation.status, "No evaluation")))),
      tableCell("Actual execution", cellStack(statusPill(executionStatus, executionStatus), create("small", undefined, formatDuration(execution.duration_ms)))),
      tableCell("Intent", intentCell),
      tableCell("Correlation", cellStack(create("small", undefined, correlationValues.length > 0 ? correlationValues.join(" · ") : "No correlation IDs"))),
    );
    return row;
  }

  function renderActivity(payloadValue: unknown, response: Response): void {
    const payload = record(payloadValue);
    if (payload.schema_version !== "agentaction.activity-page.v1" || payload.tenant_id !== tenantId || !Array.isArray(payload.events)) {
      throw new Error("Activity response is invalid.");
    }
    const events = payload.events.filter(isRenderableActivity);
    if (payload.events.length > 0 && events.length === 0) throw new Error("Activity events are invalid.");
    if (publicDemo && activityAgentOptionsTenantId !== tenantId) {
      renderActivityAgentOptions([{ agent_ids: events.map((event) => safeText(record(event).agent_id, "")).filter(Boolean) }]);
    }
    nextActivityCursor = typeof payload.next_cursor === "string" ? payload.next_cursor.slice(0, 1_024) : "";
    activityNextButton.hidden = !nextActivityCursor;
    activityList.replaceChildren(...events.map(renderActivityEvent));
    activitySummary.textContent = `${events.length.toLocaleString("en-US")} privacy-safe event(s) on this page.`;
    activityPageSummary.textContent = currentActivityCursor
      ? `Showing a subsequent page of ${events.length.toLocaleString("en-US")} event(s).`
      : `Showing the newest ${events.length.toLocaleString("en-US")} event(s).`;
    activityContent.hidden = events.length === 0;
    if (events.length === 0) {
      if (activityHasRestrictiveFilters()) {
        setActivityState("empty", "No activity matched", "Broaden the bounded window or remove a filter. Raw prompts, arguments, and results are never part of this feed.");
        setStatus("ready", "The Activity query completed with no matches.");
      } else {
        setActivityState("empty", "No activity received", "Verify that the source is enabled and the agent integration has its current token, then run one agent action. Raw prompts, arguments, and results are never part of this feed.");
        setStatus("ready", "This workspace has not received agent activity in the selected window.");
      }
      return;
    }
    activityMessage.hidden = true;
    const freshness = responseFreshness(response);
    if (freshness.state === "stale") {
      setStatus("stale", "Observed activity may be older than the configured freshness threshold.");
    } else {
      setStatus("ready", "Privacy-safe shadow activity is current for this tenant.");
    }
  }

  async function loadActivity(cursor = currentActivityCursor): Promise<void> {
    if (!tenantId) return;
    currentActivityCursor = cursor.slice(0, 1_024);
    setStatus("loading", "Querying tenant-scoped agent activity.");
    setActivityState("loading", "Loading observed activity", "Reading privacy-safe events through the tenant-scoped BFF.");
    activityContent.hidden = true;
    activityNextButton.hidden = true;
    await ensureActivityAgentOptions();
    const query = buildActivityQuery(currentActivityCursor);
    syncActivityPageUrl(currentActivityCursor);
    try {
      const result = await read(`/api/console/tenants/${encodeURIComponent(tenantId)}/activity/events?${query.toString()}`);
      if (!result.response.ok) {
        const state = failureState(result.response.status);
        const detail = failureMessage(result.body, statusMessages[state][1]);
        setStatus(state, detail);
        setActivityState(state, statusMessages[state][0], detail);
        return;
      }
      renderActivity(result.body, result.response);
    } catch {
      setStatus("unavailable");
      setActivityState("unavailable", "Observed activity is unavailable", statusMessages.unavailable[1]);
    }
  }

  async function loadJobDetail(jobId = currentJobId): Promise<void> {
    currentJobId = jobId.trim().slice(0, 160);
    syncJobDetailUrl(currentJobId);
    jobDetailContent.hidden = true;
    refreshButton.hidden = true;
    if (!currentJobId) {
      setStatus("ready", "Select a finalized job to inspect its immutable evidence path.");
      setJobDetailState(
        "empty",
        "Select a finalized job",
        "Open a Job ID from the finalized Jobs explorer to inspect its immutable evidence path.",
      );
      return;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(currentJobId)) {
      setStatus("partial", "The requested Job ID is not valid.");
      setJobDetailState(
        "empty",
        "Job ID is not valid",
        "Return to Jobs and select a finalized Job ID from the tenant-scoped explorer.",
      );
      return;
    }
    if (!tenantId) return;
    setStatus("loading", "Reading the selected finalized receipt and its safe evidence timeline.");
    setJobDetailState(
      "loading",
      "Loading finalized Job detail",
      "Reading the immutable boundary and allowlisted timeline through the tenant-scoped BFF.",
    );
    try {
      const result = await read(
        `/api/console/tenants/${encodeURIComponent(tenantId)}/intent-quality/jobs/${encodeURIComponent(currentJobId)}`,
      );
      if (!result.response.ok) {
        if (result.response.status === 404) {
          const detail = failureMessage(result.body, "The finalized Job receipt was not found in this tenant.");
          setStatus("ready", detail);
          setJobDetailState("empty", "Finalized Job not found", detail);
          return;
        }
        const state = failureState(result.response.status);
        const detail = failureMessage(result.body, statusMessages[state][1]);
        setStatus(state, detail);
        setJobDetailState(state, statusMessages[state][0], detail);
        return;
      }
      renderJobDetail(result.body, result.response);
    } catch {
      setStatus("unavailable");
      setJobDetailState("unavailable", "Finalized Job detail is unavailable", statusMessages.unavailable[1]);
    }
  }

  async function loadJobs(cursor = currentJobsCursor): Promise<void> {
    if (!tenantId) return;
    currentJobsCursor = cursor.slice(0, 1_024);
    setStatus("loading", "Querying the tenant-scoped finalized Jobs read model.");
    setJobsState("loading", "Loading finalized jobs", "Reading immutable final receipts through the tenant-scoped BFF.");
    jobsContent.hidden = true;
    jobsNextButton.hidden = true;
    const query = buildJobsQuery(currentJobsCursor);
    syncJobsPageUrl(currentJobsCursor);
    try {
      const result = await read(`/api/console/tenants/${encodeURIComponent(tenantId)}/intent-quality/jobs?${query.toString()}`);
      if (!result.response.ok) {
        const state = failureState(result.response.status);
        const detail = failureMessage(result.body, statusMessages[state][1]);
        setStatus(state, detail);
        setJobsState(state, statusMessages[state][0], detail);
        return;
      }
      renderJobs(result.body, result.response);
    } catch {
      setStatus("unavailable");
      setJobsState("unavailable", "Finalized jobs are unavailable", statusMessages.unavailable[1]);
    }
  }

  async function loadOverview(): Promise<void> {
    if (!tenantId) return;
    setStatus("loading", "Querying immutable final receipts for the selected profile boundary.");
    setOverviewState("loading", statusMessages.loading[0], statusMessages.loading[1]);
    overviewContent.hidden = true;
    refreshButton.hidden = true;
    const query = buildQualityQuery();
    syncOverviewPageUrl();
    try {
      const result = await read(`/api/console/tenants/${encodeURIComponent(tenantId)}/intent-quality/rollups?${query.toString()}`);
      if (!result.response.ok) {
        const state = failureState(result.response.status);
        const detail = failureMessage(result.body, statusMessages[state][1]);
        setStatus(state, detail);
        setOverviewState(state, statusMessages[state][0], detail);
        return;
      }
      renderOverview(result.body, result.response);
    } catch {
      setStatus("unavailable");
      setOverviewState("unavailable", statusMessages.unavailable[0], statusMessages.unavailable[1]);
    }
  }

  async function start(): Promise<void> {
    setStatus("loading");
    restoreFilters();
    restoreActivityFilters();
    restoreJobsFilters();
    restoreJobDetail();
    buildQualityQuery();
    buildActivityQuery();
    buildJobsQuery();
    showView(activeView);
    try {
      if (!await refreshSession(workspacePreference)) return;
      if (pendingInvitationId) await redeemInvitation({ invitationId: pendingInvitationId }, true);
      else if (pendingInvitationCode) await redeemInvitation({ code: pendingInvitationCode }, true);
      else if (invalidInvitationLink) {
        await loadSetup();
        setJoinWorkspaceExpanded(true);
        setSetupMessage("error", "Invitation link is invalid", "Paste the fallback code from the invitation email to join the workspace.");
      }
      else if (!tenantId) await loadSetup();
      else if (activeView === "setup") await loadSetup();
      else if (activeView === "activity") await loadActivity();
      else if (activeView === "jobs") await loadJobs();
      else if (activeView === "evals") await loadEvals();
      else if (activeView === "job-detail") await loadJobDetail();
      else await loadOverview();
    } catch {
      setStatus("unavailable");
      setOverviewState("unavailable", statusMessages.unavailable[0], statusMessages.unavailable[1]);
      setActivityState("unavailable", "Observed activity is unavailable", statusMessages.unavailable[1]);
      setJobsState("unavailable", "Finalized jobs are unavailable", statusMessages.unavailable[1]);
      setJobDetailState("unavailable", "Finalized Job detail is unavailable", statusMessages.unavailable[1]);
      setEvalsMessage("error", "Evaluations unavailable", statusMessages.unavailable[1]);
    }
  }

  filterForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void loadOverview();
  });
  resetButton.addEventListener("click", () => {
    resetFilters();
    void loadOverview();
  });
  refreshButton.addEventListener("click", () => {
    if (activeView === "activity") void loadActivity();
    else if (activeView === "jobs") void loadJobs();
    else if (activeView === "evals") void loadEvals();
    else if (activeView === "job-detail") void loadJobDetail();
    else void loadOverview();
  });
  jobsFilterForm.addEventListener("submit", (event) => {
    event.preventDefault();
    currentJobsCursor = "";
    nextJobsCursor = "";
    void loadJobs("");
  });
  activityFilterForm.addEventListener("submit", (event) => {
    event.preventDefault();
    currentActivityCursor = "";
    nextActivityCursor = "";
    void loadActivity("");
  });
  resetActivityButton.addEventListener("click", () => {
    resetActivityFilters();
    void loadActivity("");
  });
  activityNextButton.addEventListener("click", () => {
    if (nextActivityCursor) void loadActivity(nextActivityCursor);
  });
  resetJobsButton.addEventListener("click", () => {
    resetJobsFilters();
    void loadJobs("");
  });
  jobsNextButton.addEventListener("click", () => {
    if (nextJobsCursor) void loadJobs(nextJobsCursor);
  });
  overviewNav.addEventListener("click", (event) => {
    event.preventDefault();
    showView("overview");
    void loadOverview();
  });
  activityNav.addEventListener("click", (event) => {
    event.preventDefault();
    showView("activity");
    void loadActivity();
  });
  jobsNav.addEventListener("click", (event) => {
    event.preventDefault();
    if (!jobsLoaded) copyOverviewFiltersToJobs();
    showView("jobs");
    void loadJobs();
  });
  evalsNav.addEventListener("click", (event) => {
    event.preventDefault();
    void loadEvals();
  });
  jobDetailBack.addEventListener("click", (event) => {
    event.preventDefault();
    showView("jobs");
    void loadJobs("");
  });
  setupNav.addEventListener("click", (event) => {
    event.preventDefault();
    void loadSetup();
  });
  workspaceManage.addEventListener("click", (event) => {
    event.preventDefault();
    void loadSetup();
  });
  openActivity.addEventListener("click", (event) => {
    event.preventDefault();
    showView("activity");
    void loadActivity();
  });
  tenantSelect.addEventListener("change", () => {
    clearOneTimeSecret();
    clearInvitationSecret();
    selectTenant(tenantSelect.value);
    if (activeView === "setup") void loadSetup();
    else if (activeView === "activity") void loadActivity("");
    else if (activeView === "jobs") void loadJobs("");
    else if (activeView === "evals") void loadEvals();
    else if (activeView === "job-detail") void loadJobDetail();
    else void loadOverview();
  });
  createIntegration.addEventListener("change", () => {
    const enabled = createIntegration.value !== "none";
    createIntegrationFields.hidden = !enabled;
    createSourceId.required = enabled;
    createAgentId.required = enabled;
  });
  sourceIntegration.addEventListener("change", renderIntegrationGuide);
  enableWorkspaceSwitching.addEventListener("click", async () => {
    if (!tenantId || activeRole !== "owner") return;
    enableWorkspaceSwitching.disabled = true;
    setSetupMessage("ready", "Enabling workspace switching", "Adopting this workspace into your directory memberships without changing its data or credentials.");
    const result = await write(`/api/console/onboarding/tenants/${encodeURIComponent(tenantId)}/migrate`, "POST", {});
    enableWorkspaceSwitching.disabled = false;
    if (!result.response.ok) return setSetupMessage("error", "Workspace migration failed", failureMessage(result.body, "Workspace switching could not be enabled."));
    const currentTenant = tenantId;
    await refreshSession(currentTenant);
    await loadSetup();
    setSetupMessage("ready", "Workspace switching enabled", "You can now create, join, and move among your authorized workspaces from the header.");
  });
  createTenantForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const integration = createIntegration.value;
    setSetupMessage("ready", "Creating workspace", integration === "none"
      ? "Provisioning an isolated workspace."
      : "Provisioning an isolated workspace and its first agent connection.");
    const payload: Record<string, unknown> = {
      tenant_id: createTenantId.value.trim(),
      display_name: createDisplayName.value.trim(),
    };
    if (integration !== "none") {
      payload.integration = integration;
      payload.source_id = createSourceId.value.trim();
      payload.agent_id = createAgentId.value.trim();
    }
    const result = await write("/api/console/onboarding/tenants", "POST", payload);
    if (!result.response.ok) return setSetupMessage("error", "Workspace creation failed", failureMessage(result.body, "The workspace could not be created."));
    const createdTenant = safeText(record(result.body.tenant).tenant_id, createTenantId.value.trim());
    showOneTimeSecret(record(result.body));
    await refreshSession(createdTenant);
    await loadSetup();
  });
  redeemInviteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await redeemInvitation({ code: inviteCode.value }, false);
  });
  joinWorkspaceToggle.addEventListener("click", () => {
    setJoinWorkspaceExpanded(!joinWorkspaceExpanded);
  });
  createSourceForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = await write(`/api/console/onboarding/tenants/${encodeURIComponent(tenantId)}/sources`, "POST", {
      integration: sourceIntegration.value,
      source_id: sourceIdInput.value.trim(),
      agent_id: sourceAgentIdInput.value.trim(),
    });
    if (!result.response.ok) return setSetupMessage("error", "Source creation failed", failureMessage(result.body, "The source could not be created."));
    sourceIdInput.value = "";
    sourceAgentIdInput.value = "";
    showOneTimeSecret(record(result.body));
    setSetupMessage("ready", "Source created", "Save its token before leaving this page.");
    await loadSetup();
  });
  createInviteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = await write(`/api/console/onboarding/tenants/${encodeURIComponent(tenantId)}/invitations`, "POST", {
      email: memberEmail.value.trim(),
      role: memberRole.value,
    });
    if (!result.response.ok) return setSetupMessage("error", "Invitation creation failed", failureMessage(result.body, "The invitation could not be created."));
    const code = safeText(result.body.invitation_code, "");
    const delivery = safeText(record(result.body.delivery).status, "unavailable");
    await loadSetup();
    createdInvitationCode.textContent = code;
    invitationDelivery.textContent = delivery === "sent"
      ? "Invitation email sent. Keep this code as a one-time fallback."
      : delivery === "failed"
        ? "Email delivery failed. Share this fallback code through a secure channel."
        : "Email delivery is not configured. Share this fallback code through a secure channel.";
    invitationResult.hidden = !code;
    memberEmail.value = "";
    setSetupMessage(
      delivery === "sent" ? "ready" : "error",
      delivery === "sent" ? "Invitation email sent" : "Invitation created; email not sent",
      delivery === "sent"
        ? "The invitee can use the protected link in the email. The invitation will redeem automatically after sign-in."
        : "The invitation is still valid. Share the displayed fallback code through a secure channel.",
    );
  });
  createEvalForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!tenantId || activeRole !== "owner") return;
    setEvalsMessage("ready", "Creating eval version", "Freezing this deterministic evaluation definition.");
    const result = await write(`/api/console/onboarding/tenants/${encodeURIComponent(tenantId)}/evals`, "POST", {
      eval_id: evalIdInput.value.trim(),
      version: evalVersionInput.value.trim(),
      name: evalNameInput.value.trim(),
      description: evalDescriptionInput.value.trim(),
      kind: evalKindInput.value,
      ...(evalTemplateInput.value === "refund_triage" ? { specification: refundTriageSpecification() } : {}),
    });
    if (!result.response.ok) return setEvalsMessage("error", "Eval creation failed", failureMessage(result.body, "The eval version could not be created."));
    evalIdInput.value = "";
    evalVersionInput.value = "v1";
    evalNameInput.value = "";
    evalDescriptionInput.value = "";
    evalTemplateInput.value = "basic";
    applyEvalTemplate();
    await loadEvals();
    setEvalsMessage("ready", "Eval version created", "The definition is immutable and ready to assign. Create a new version to change its meaning later.");
  });
  evalTemplateInput.addEventListener("change", applyEvalTemplate);
  createEvalAssignmentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!tenantId || activeRole !== "owner") return;
    const selected = evalAssignmentEval.selectedOptions[0];
    if (!selected) return setEvalsMessage("error", "Assignment failed", "Choose an eval version first.");
    setEvalsMessage("ready", "Saving assignment", "Updating the active route without changing already-started Jobs.");
    const sourceId = evalAssignmentSource.value.trim();
    const agentId = evalAssignmentAgent.value.trim();
    const allowedSources = new Set(evalSources.map((source) => safeText(source.source_id, "")));
    const allowedAgents = new Set(evalSources
      .filter((source) => !sourceId || safeText(source.source_id, "") === sourceId)
      .flatMap((source) => Array.isArray(source.agent_ids) ? source.agent_ids : [])
      .map((value) => safeText(value, ""))
      .filter(Boolean));
    if ((sourceId && !allowedSources.has(sourceId)) || (agentId && !allowedAgents.has(agentId))) {
      return setEvalsMessage("error", "Assignment failed", "Choose a source and agent from this workspace.");
    }
    const result = await write(`/api/console/onboarding/tenants/${encodeURIComponent(tenantId)}/eval-assignments`, "POST", {
      eval_id: selected.dataset.evalId,
      eval_version: selected.dataset.evalVersion,
      ...(sourceId ? { source_id: sourceId } : {}),
      ...(agentId ? { agent_id: agentId } : {}),
    });
    if (!result.response.ok) return setEvalsMessage("error", "Assignment failed", failureMessage(result.body, "The eval route could not be saved."));
    await loadEvals();
    setEvalsMessage("ready", "Assignment saved", "New matching Jobs will freeze this eval version when they start.");
  });
  evalAssignmentEval.addEventListener("change", updateEvalRoutePreview);
  evalAssignmentSource.addEventListener("change", () => {
    updateEvalAgentOptions();
    updateEvalRoutePreview();
  });
  evalAssignmentAgent.addEventListener("change", updateEvalRoutePreview);
  copySourceToken.addEventListener("click", () => { void copyText(sourceToken.textContent || "", copySourceToken); });
  copyHermesEnvironment.addEventListener("click", () => { void copyText(hermesEnvironment.textContent || "", copyHermesEnvironment); });
  copyHermesYaml.addEventListener("click", () => { void copyText(hermesYaml.textContent || "", copyHermesYaml); });
  copyInvitation.addEventListener("click", () => { void copyText(createdInvitationCode.textContent || "", copyInvitation); });
  dismissSecret.addEventListener("click", clearOneTimeSecret);

  renderIntegrationGuide();
  applyEvalTemplate();
  const ready = start();
  return { buildActivityQuery, buildJobsQuery, buildQualityQuery, loadActivity, loadEvals, loadJobDetail, loadJobs, loadOverview, loadSetup, ready, showView };
}

const APP_JS = `(${consoleApp.toString()})(window);`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    let identity: ConsoleIdentity;
    try {
      identity = await authenticateConsoleRequest(request, env);
    } catch (error) {
      return problemResponse(request, asConsoleError(error));
    }

    try {
      if (request.method === "GET" && url.pathname === "/") {
        return htmlResponse(consoleShell(env));
      }
      if (request.method === "GET" && url.pathname === "/assets/app.css") {
        return assetResponse(APP_CSS, "text/css; charset=utf-8");
      }
      if (request.method === "GET" && url.pathname === "/assets/app.js") {
        return assetResponse(APP_JS, "text/javascript; charset=utf-8");
      }
      if (request.method === "GET" && url.pathname === "/api/console/session") {
        return await consoleSession(identity, env);
      }
      if (request.method === "GET" && url.pathname === "/api/console/health") {
        return await consoleHealth(identity, env);
      }
      if (url.pathname.startsWith("/api/console/onboarding/")) {
        if (env.CONSOLE_PUBLIC_DEMO === "true") {
          throw new ConsoleError(404, "public_demo_route_not_found", "This route is not available in the public demo.");
        }
        const controlPath = parseOnboardingRoute(url, request.method);
        return await callControlPlane(request, controlPath, identity, env);
      }
      if (url.pathname.startsWith("/api/console/tenants/")) {
        const routeTenant = routeTenantId(url);
        const route = parseGatewayRoute(url, routeTenant);
        if (request.method !== "GET") {
          return problemResponse(request, new ConsoleError(405, "method_not_allowed", "Console gateway routes are read only."));
        }
        await requireTenantAccess(identity, routeTenant, env);
        return await forwardGateway(request, url, route, env);
      }
      if (request.method !== "GET") {
        return problemResponse(request, new ConsoleError(405, "method_not_allowed", "Method not allowed."));
      }
      return problemResponse(request, new ConsoleError(404, "not_found", "Console route not found."));
    } catch (error) {
      return problemResponse(request, asConsoleError(error));
    }
  },
};

function consoleShell(env: Env): string {
  if (env.CONSOLE_PUBLIC_DEMO !== "true") return withoutPublicDemoLifecycle(SHELL_HTML);
  return SHELL_HTML
    .replace('aria-label="Authenticated context"', 'aria-label="Public demo context"')
    .replace("Authenticating console session", "Loading synthetic console data")
    .replace(
      "Verifying the tenant boundary and private gateway binding.",
      "Loading bundled synthetic fixtures; no production service is connected.",
    )
    .replace("<dt>Auth</dt><dd>Cloudflare Access</dd>", "<dt>Data</dt><dd>Public synthetic fixtures</dd>")
    .replace(
      "How scheduled runs become immutable, profile-scoped quality data.",
      "Example production path represented by the bundled fixtures.",
    )
    .replace("Calls the real service through a private binding.", "Fixtures represent calls through the private production boundary.")
    .replace(
      "Authenticated and tenant-scoped. No gateway credential is stored in browser JavaScript.",
      "Public synthetic demo. No production gateway credential or customer data is available to this Worker.",
    );
}

function withoutPublicDemoLifecycle(shell: string): string {
  const startMarker = "<!-- public-demo-lifecycle:start -->";
  const endMarker = "<!-- public-demo-lifecycle:end -->";
  const start = shell.indexOf(startMarker);
  const end = shell.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error("Public demo lifecycle markers are missing from the console shell.");
  return shell.slice(0, start) + shell.slice(end + endMarker.length);
}

async function authenticateConsoleRequest(request: Request, env: Env): Promise<ConsoleIdentity> {
  const environment = consoleEnvironment(env);
  const mockEnabled = env.CONSOLE_ENABLE_MOCK_IDENTITY === "true";
  if (mockEnabled && environment !== "development") {
    throw new ConsoleError(
      500,
      "unsafe_mock_identity_configuration",
      "Mock console identity is only permitted in the development environment.",
      "unavailable",
    );
  }
  if (environment === "development" && mockEnabled) {
    const tenantId = validateTenantId(env.CONSOLE_MOCK_TENANT_ID, "mock tenant");
    const subject = requiredString(env.CONSOLE_MOCK_SUBJECT, "CONSOLE_MOCK_SUBJECT is required for mock identity");
    return {
      tenantId,
      role: "owner",
      subject,
      issuer: "agentpass:local-development",
      ...(env.CONSOLE_MOCK_EMAIL ? { email: env.CONSOLE_MOCK_EMAIL } : {}),
    };
  }

  const teamDomain = accessTeamDomain(env);
  const allowedAudiences = requiredString(env.ACCESS_AUD, "ACCESS_AUD is not configured")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (allowedAudiences.length === 0) {
    throw new ConsoleError(500, "access_configuration_invalid", "ACCESS_AUD is not configured.", "unavailable");
  }
  const token = request.headers.get("cf-access-jwt-assertion")?.trim() || "";
  if (!token) {
    throw new ConsoleError(401, "access_token_missing", "Cloudflare Access authentication is required.", "unauthorized");
  }

  const claims = await verifyAccessJwt(token, {
    audiences: allowedAudiences,
    issuer: teamDomain,
    jwksUrl: env.ACCESS_JWKS_URL?.trim() || `${teamDomain}/cdn-cgi/access/certs`,
  });
  const subject = typeof claims.sub === "string" && claims.sub.trim() ? claims.sub.trim() : "";
  if (!subject) {
    throw new ConsoleError(401, "access_subject_missing", "Cloudflare Access token subject is missing.", "unauthorized");
  }
  const tenantClaim = env.ACCESS_TENANT_CLAIM?.trim() || "custom.tenant_id";
  const roleClaim = env.ACCESS_ROLE_CLAIM?.trim() || "custom.tenant_role";
  const configuredTenant = env.CONSOLE_DIRECTORY_MODE === "true" ? undefined : env.CONSOLE_STATIC_TENANT_ID?.trim();
  let tenantId: string | undefined;
  let role: TenantRole | undefined;
  if (configuredTenant) {
    tenantId = validateTenantId(configuredTenant, "configured console tenant");
    role = validateTenantRole(env.CONSOLE_STATIC_TENANT_ROLE || readClaim(claims, roleClaim) || "owner", "configured console role");
    const tenantClaimValue = readClaim(claims, tenantClaim);
    if (tenantClaimValue !== undefined && tenantClaimValue !== null && tenantClaimValue !== "") {
      const claimedTenant = validateTenantId(tenantClaimValue, `Access claim ${tenantClaim}`);
      if (claimedTenant !== tenantId) {
        throw new ConsoleError(
          403,
          "static_tenant_mismatch",
          "Access tenant claim does not match the configured console tenant.",
          "forbidden",
        );
      }
    }
  } else {
    const tenantClaimValue = readClaim(claims, tenantClaim);
    if (tenantClaimValue !== undefined && tenantClaimValue !== null && tenantClaimValue !== "") {
      tenantId = validateTenantId(tenantClaimValue, `Access claim ${tenantClaim}`);
      role = validateTenantRole(readClaim(claims, roleClaim) || "viewer", `Access claim ${roleClaim}`);
    }
  }
  return {
    subject,
    issuer: String(claims.iss),
    ...(tenantId ? { tenantId } : {}),
    ...(role ? { role } : {}),
    ...(typeof claims.email === "string" && claims.email ? { email: claims.email } : {}),
  };
}

async function verifyAccessJwt(
  token: string,
  options: { audiences: string[]; issuer: string; jwksUrl: string },
): Promise<Record<string, unknown>> {
  let parsed: ReturnType<typeof parseJwt>;
  try {
    parsed = parseJwt(token);
  } catch {
    throw new ConsoleError(401, "access_token_invalid", "Cloudflare Access token is invalid.", "unauthorized");
  }
  if (parsed.header.alg !== "RS256") {
    throw new ConsoleError(401, "access_token_algorithm_invalid", "Cloudflare Access token algorithm is not allowed.", "unauthorized");
  }
  const kid = typeof parsed.header.kid === "string" ? parsed.header.kid : "";
  if (!kid) {
    throw new ConsoleError(401, "access_token_kid_missing", "Cloudflare Access token key ID is missing.", "unauthorized");
  }
  let keys = await loadJwks(options.jwksUrl);
  let jwk = keys.find((candidate) => candidate.kid === kid && (!candidate.alg || candidate.alg === "RS256"));
  if (!jwk) {
    keys = await loadJwks(options.jwksUrl, true);
    jwk = keys.find((candidate) => candidate.kid === kid && (!candidate.alg || candidate.alg === "RS256"));
  }
  if (!jwk) {
    throw new ConsoleError(401, "access_signing_key_not_found", "Cloudflare Access signing key was not found.", "unauthorized");
  }

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    throw new ConsoleError(503, "access_signing_key_invalid", "Cloudflare Access signing keys are unavailable.", "unavailable");
  }
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(parsed.encodedSignature),
    new TextEncoder().encode(`${parsed.encodedHeader}.${parsed.encodedPayload}`),
  );
  if (!valid) {
    throw new ConsoleError(401, "access_signature_invalid", "Cloudflare Access token signature is invalid.", "unauthorized");
  }

  const claims = parsed.claims;
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== options.issuer) {
    throw new ConsoleError(401, "access_issuer_mismatch", "Cloudflare Access token issuer does not match.", "unauthorized");
  }
  if (!audienceMatches(claims.aud, options.audiences)) {
    throw new ConsoleError(401, "access_audience_mismatch", "Cloudflare Access token audience does not match.", "unauthorized");
  }
  if (claims.type !== "app") {
    throw new ConsoleError(401, "access_token_type_invalid", "Cloudflare Access application token is required.", "unauthorized");
  }
  if (typeof claims.exp !== "number" || claims.exp <= now - JWT_CLOCK_SKEW_SECONDS) {
    throw new ConsoleError(401, "access_token_expired", "Cloudflare Access token is expired.", "unauthorized");
  }
  if (typeof claims.nbf === "number" && claims.nbf > now + JWT_CLOCK_SKEW_SECONDS) {
    throw new ConsoleError(401, "access_token_not_active", "Cloudflare Access token is not active yet.", "unauthorized");
  }
  if (typeof claims.iat === "number" && claims.iat > now + JWT_CLOCK_SKEW_SECONDS) {
    throw new ConsoleError(401, "access_token_issued_in_future", "Cloudflare Access token issue time is invalid.", "unauthorized");
  }
  return claims;
}

async function loadJwks(jwksUrl: string, forceRefresh = false): Promise<CachedJwks["keys"]> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(jwksUrl);
  } catch {
    throw new ConsoleError(500, "access_jwks_url_invalid", "Cloudflare Access JWKS URL is invalid.", "unavailable");
  }
  if (parsedUrl.protocol !== "https:") {
    throw new ConsoleError(500, "access_jwks_url_invalid", "Cloudflare Access JWKS URL must use HTTPS.", "unavailable");
  }
  const cached = forceRefresh ? undefined : jwksCache.get(parsedUrl.href);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;

  let response: Response;
  try {
    response = await fetch(parsedUrl.href, { headers: { accept: "application/json" } });
  } catch {
    throw new ConsoleError(503, "access_jwks_unavailable", "Cloudflare Access signing keys are unavailable.", "unavailable");
  }
  if (!response.ok) {
    throw new ConsoleError(503, "access_jwks_unavailable", "Cloudflare Access signing keys are unavailable.", "unavailable");
  }
  let payload: { keys?: CachedJwks["keys"] };
  try {
    payload = await response.json() as { keys?: CachedJwks["keys"] };
  } catch {
    throw new ConsoleError(503, "access_jwks_invalid", "Cloudflare Access signing keys are invalid.", "unavailable");
  }
  const keys = Array.isArray(payload.keys) ? payload.keys : [];
  if (keys.length === 0) {
    throw new ConsoleError(503, "access_jwks_invalid", "Cloudflare Access signing keys are invalid.", "unavailable");
  }
  jwksCache.set(parsedUrl.href, { keys, expiresAt: Date.now() + JWKS_CACHE_TTL_MS });
  return keys;
}

function routeTenantId(url: URL): string {
  const rawParts = url.pathname.split("/").filter(Boolean);
  if (rawParts.length < 5 || rawParts[0] !== "api" || rawParts[1] !== "console" || rawParts[2] !== "tenants") {
    throw new ConsoleError(404, "gateway_route_not_found", "Console gateway route not found.");
  }
  const parts = rawParts.map(decodePathSegment);
  return validateTenantId(parts[3], "route tenant");
}

function parseGatewayRoute(url: URL, tenantId: string): GatewayRoute {
  const rawParts = url.pathname.split("/").filter(Boolean);
  const parts = rawParts.map(decodePathSegment);
  for (const forbidden of ["tenant", "tenant_id", "route_tenant_id"]) {
    if (url.searchParams.has(forbidden)) {
      throw new ConsoleError(400, "tenant_override_not_allowed", "Tenant selection is derived from Cloudflare Access.");
    }
  }

  const suffix = parts.slice(4);
  let allowedQuery: ReadonlySet<string>;
  if (sameSegments(suffix, ["health"])) {
    allowedQuery = NO_QUERY;
  } else if (sameSegments(suffix, ["intent-quality", "rollups"])) {
    allowedQuery = QUALITY_QUERY;
  } else if (sameSegments(suffix, ["intent-quality", "jobs"])) {
    allowedQuery = QUALITY_JOBS_QUERY;
  } else if (suffix[0] === "intent-quality" && suffix[1] === "jobs" && suffix.length === 3) {
    allowedQuery = NO_QUERY;
  } else if (suffix[0] === "intent-profiles" && (suffix.length === 1 || suffix.length === 2)) {
    allowedQuery = suffix.length === 1 ? PROFILE_QUERY : NO_QUERY;
  } else if (suffix[0] === "intent-contracts" && (suffix.length === 1 || suffix.length === 2)) {
    allowedQuery = suffix.length === 1 ? CONTRACT_QUERY : NO_QUERY;
  } else if (sameSegments(suffix, ["audit", "events"])) {
    allowedQuery = AUDIT_QUERY;
  } else if (sameSegments(suffix, ["activity", "events"])) {
    allowedQuery = ACTIVITY_QUERY;
  } else if (suffix[0] === "approvals" && (suffix.length === 1 || suffix.length === 2)) {
    allowedQuery = suffix.length === 1 ? APPROVAL_QUERY : NO_QUERY;
  } else {
    throw new ConsoleError(404, "gateway_route_not_allowed", "Gateway route is not available to the console.");
  }
  for (const segment of suffix) validateResourceSegment(segment);
  for (const key of url.searchParams.keys()) {
    if (!allowedQuery.has(key)) {
      throw new ConsoleError(400, "query_parameter_not_allowed", `Query parameter is not allowed: ${key}`);
    }
  }
  return {
    tenantId,
    allowedQuery,
    gatewayPath: `/tenants/${encodeURIComponent(tenantId)}/${suffix.map(encodeURIComponent).join("/")}`,
  };
}

async function consoleSession(identity: ConsoleIdentity, env: Env): Promise<Response> {
  if (env.CONSOLE_PUBLIC_DEMO === "true") {
    return jsonResponse({ authenticated: true, public_demo: true, tenant_id: identity.tenantId, subject: identity.subject });
  }
  let memberships: unknown[] = [];
  let workspaceMode: "directory" | "sso_fixed" = identity.tenantId ? "sso_fixed" : "directory";
  if (((env.CONSOLE_DIRECTORY_MODE !== "true" && env.CONSOLE_STATIC_TENANT_ID) || env.CONSOLE_ENABLE_MOCK_IDENTITY === "true") && identity.tenantId) {
    memberships = [{
      tenant: { tenant_id: identity.tenantId, display_name: identity.tenantId },
      membership: { tenant_id: identity.tenantId, role: identity.role || "owner", source: "signed_claim" },
    }];
  } else {
    const upstream = await callControlPlane(
      new Request("https://console.internal/api/console/onboarding/session", { method: "GET" }),
      "/control-plane/session",
      identity,
      env,
    );
    if (!upstream.ok) return upstream;
    const body = await upstream.json() as { memberships?: unknown[]; workspace_mode?: unknown };
    memberships = Array.isArray(body.memberships) ? body.memberships : [];
    workspaceMode = body.workspace_mode === "directory" ? "directory" : "sso_fixed";
  }
  if (workspaceMode === "sso_fixed" && identity.tenantId && !memberships.some((entry) => membershipTenantId(entry) === identity.tenantId)) {
    memberships.unshift({
      tenant: { tenant_id: identity.tenantId, display_name: identity.tenantId },
      membership: { tenant_id: identity.tenantId, role: identity.role || "viewer", source: "signed_claim" },
    });
  }
  if (workspaceMode === "sso_fixed" && identity.tenantId) {
    memberships = memberships.filter((entry) => membershipTenantId(entry) === identity.tenantId);
  }
  const defaultTenant = workspaceMode === "sso_fixed"
    ? identity.tenantId
    : (memberships.length === 1 ? membershipTenantId(memberships[0]) : undefined);
  return jsonResponse({
    authenticated: true,
    tenant_id: defaultTenant || null,
    workspace_mode: workspaceMode,
    claimed_tenant_id: identity.tenantId || null,
    memberships,
    subject: identity.subject,
    ...(identity.email ? { email: identity.email } : {}),
  });
}

function membershipTenantId(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const tenant = (value as Record<string, unknown>).tenant;
  if (!tenant || typeof tenant !== "object" || Array.isArray(tenant)) return undefined;
  const tenantId = (tenant as Record<string, unknown>).tenant_id;
  return typeof tenantId === "string" && tenantId ? tenantId : undefined;
}

async function requireTenantAccess(identity: ConsoleIdentity, tenantId: string, env: Env): Promise<void> {
  if ((env.CONSOLE_DIRECTORY_MODE !== "true" && env.CONSOLE_STATIC_TENANT_ID) || env.CONSOLE_ENABLE_MOCK_IDENTITY === "true") {
    if (identity.tenantId !== tenantId) {
      throw new ConsoleError(403, "tenant_mismatch", "Authenticated tenant does not match the requested route.", "forbidden");
    }
    return;
  }
  const response = await callControlPlane(
    new Request("https://console.internal/authorize", { method: "GET" }),
    `/control-plane/tenants/${encodeURIComponent(tenantId)}/authorize`,
    identity,
    env,
  );
  if (response.ok) return;
  const payload = await response.json().catch(() => ({})) as { error?: string };
  throw new ConsoleError(
    response.status === 404 ? 404 : 403,
    response.status === 404 ? "tenant_not_found" : "tenant_membership_required",
    typeof payload.error === "string" ? payload.error : "Tenant membership is required.",
    "forbidden",
  );
}

function parseOnboardingRoute(url: URL, method: string): string {
  if ([...url.searchParams.keys()].length > 0) {
    throw new ConsoleError(400, "onboarding_query_not_allowed", "Onboarding routes do not accept query parameters.");
  }
  const raw = url.pathname.split("/").filter(Boolean).map(decodePathSegment);
  if (raw[0] !== "api" || raw[1] !== "console" || raw[2] !== "onboarding") {
    throw new ConsoleError(404, "onboarding_route_not_found", "Onboarding route not found.");
  }
  const suffix = raw.slice(3);
  if (method === "GET" && sameSegments(suffix, ["session"])) return "/control-plane/session";
  if (method === "POST" && sameSegments(suffix, ["tenants"])) return "/control-plane/tenants";
  if (method === "POST" && sameSegments(suffix, ["invitations", "redeem"])) return "/control-plane/invitations/redeem";
  if (suffix[0] !== "tenants" || suffix.length < 3) {
    throw new ConsoleError(404, "onboarding_route_not_found", "Onboarding route not found.");
  }
  const tenantId = validateTenantId(suffix[1], "route tenant");
  const tail = suffix.slice(2);
  if (method === "GET" && sameSegments(tail, ["setup"])) return `/control-plane/tenants/${encodeURIComponent(tenantId)}/setup`;
  if (method === "POST" && sameSegments(tail, ["migrate"])) return `/control-plane/tenants/${encodeURIComponent(tenantId)}/migrate`;
  if (method === "POST" && sameSegments(tail, ["invitations"])) return `/control-plane/tenants/${encodeURIComponent(tenantId)}/invitations`;
  if (method === "GET" && sameSegments(tail, ["members"])) return `/control-plane/tenants/${encodeURIComponent(tenantId)}/members`;
  if ((method === "GET" || method === "POST") && sameSegments(tail, ["evals"])) {
    return `/control-plane/tenants/${encodeURIComponent(tenantId)}/evals`;
  }
  if (method === "POST" && sameSegments(tail, ["eval-assignments"])) {
    return `/control-plane/tenants/${encodeURIComponent(tenantId)}/eval-assignments`;
  }
  if (method === "POST" && sameSegments(tail, ["sources"])) return `/control-plane/tenants/${encodeURIComponent(tenantId)}/sources`;
  if (tail[0] === "sources" && tail.length === 2 && method === "DELETE") {
    validateResourceSegment(tail[1]);
    return `/control-plane/tenants/${encodeURIComponent(tenantId)}/sources/${encodeURIComponent(tail[1])}`;
  }
  if (tail[0] === "sources" && tail.length === 3 && tail[2] === "rotate" && method === "POST") {
    validateResourceSegment(tail[1]);
    return `/control-plane/tenants/${encodeURIComponent(tenantId)}/sources/${encodeURIComponent(tail[1])}/rotate`;
  }
  throw new ConsoleError(404, "onboarding_route_not_found", "Onboarding route not found.");
}

async function callControlPlane(
  request: Request,
  path: string,
  identity: ConsoleIdentity,
  env: Env,
): Promise<Response> {
  if (!env.AGENTID_GATEWAY) {
    throw new ConsoleError(503, "gateway_binding_unavailable", "AgentAction gateway is unavailable.", "unavailable");
  }
  const token = gatewayServiceToken(env);
  if (!token) {
    throw new ConsoleError(500, "gateway_credential_missing", "AgentAction gateway credential is not configured.", "unavailable");
  }
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${token}`,
    "user-agent": "agentaction-observability-console/0.1",
    "x-agentaction-console-issuer": identity.issuer,
    "x-agentaction-console-subject": identity.subject,
  });
  if (identity.email) headers.set("x-agentaction-console-email", identity.email);
  if (identity.tenantId) headers.set("x-agentaction-console-tenant-id", identity.tenantId);
  if (identity.role) headers.set("x-agentaction-console-role", identity.role);

  let body: ArrayBuffer | undefined;
  if (request.method === "POST") {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      throw new ConsoleError(415, "content_type_invalid", "Onboarding requests must use application/json.");
    }
    const declaredLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(declaredLength) && declaredLength > 32_768) {
      throw new ConsoleError(413, "request_too_large", "Onboarding request exceeds 32 KiB.");
    }
    body = await request.arrayBuffer();
    if (body.byteLength > 32_768) throw new ConsoleError(413, "request_too_large", "Onboarding request exceeds 32 KiB.");
    headers.set("content-type", "application/json");
  }

  let upstream: Response;
  try {
    upstream = await env.AGENTID_GATEWAY.fetch(new Request(`https://agentpass-gateway.internal${path}`, {
      method: request.method,
      headers,
      ...(body ? { body } : {}),
    }));
  } catch {
    throw new ConsoleError(503, "gateway_unavailable", "AgentAction gateway is unavailable.", "unavailable");
  }
  const contentType = upstream.headers.get("content-type") || "";
  if (upstream.status !== 204 && !contentType.toLowerCase().includes("application/json")) {
    throw new ConsoleError(502, "gateway_response_invalid", "AgentAction gateway returned an invalid response.", "unavailable");
  }
  if (upstream.status >= 500) {
    throw new ConsoleError(503, "gateway_unavailable", "AgentAction gateway is unavailable.", "unavailable");
  }
  const responseHeaders = secureHeaders("application/json; charset=utf-8");
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

async function forwardGateway(request: Request, url: URL, route: GatewayRoute, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    throw new ConsoleError(405, "method_not_allowed", "Console gateway routes are read only.");
  }
  const query = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (route.allowedQuery.has(key)) query.append(key, value);
  }
  return callGateway(route.gatewayPath, query, env);
}

async function consoleHealth(identity: ConsoleIdentity, env: Env): Promise<Response> {
  if (!identity.tenantId) {
    throw new ConsoleError(409, "tenant_selection_required", "Select or create a tenant before checking console health.");
  }
  const response = await callGateway(
    `/tenants/${encodeURIComponent(identity.tenantId)}/health`,
    new URLSearchParams(),
    env,
  );
  if (!response.ok) return response;
  const dataState = response.headers.get("x-agentpass-console-data-state") || "unknown";
  const generatedAt = response.headers.get("x-agentpass-console-generated-at");
  const ageSeconds = response.headers.get("x-agentpass-console-data-age-seconds");
  return jsonResponse({
    ok: true,
    console: "ready",
    gateway: "ready",
    tenant_id: identity.tenantId,
    data_state: dataState,
    ...(generatedAt ? { generated_at: generatedAt } : {}),
    ...(ageSeconds ? { age_seconds: Number(ageSeconds) } : {}),
    checked_at: new Date().toISOString(),
  }, 200, {
    "x-agentpass-console-data-state": dataState,
    ...(generatedAt ? { "x-agentpass-console-generated-at": generatedAt } : {}),
    ...(ageSeconds ? { "x-agentpass-console-data-age-seconds": ageSeconds } : {}),
  });
}

async function callGateway(path: string, query: URLSearchParams, env: Env): Promise<Response> {
  if (!env.AGENTID_GATEWAY) {
    throw new ConsoleError(503, "gateway_binding_unavailable", "AgentAction gateway is unavailable.", "unavailable");
  }
  const gatewayToken = gatewayServiceToken(env);
  if (consoleEnvironment(env) === "production" && !gatewayToken) {
    throw new ConsoleError(500, "gateway_credential_missing", "AgentAction gateway credential is not configured.", "unavailable");
  }
  const target = new URL(`https://agentpass-gateway.internal${path}`);
  target.search = query.toString();
  const headers = new Headers({
    accept: "application/json",
    "user-agent": "agentaction-observability-console/0.1",
  });
  if (gatewayToken) headers.set("authorization", `Bearer ${gatewayToken}`);

  let upstream: Response;
  try {
    upstream = await env.AGENTID_GATEWAY.fetch(new Request(target, { method: "GET", headers }));
  } catch {
    throw new ConsoleError(503, "gateway_unavailable", "AgentAction gateway is unavailable.", "unavailable");
  }
  if (upstream.status === 401 || upstream.status === 403) {
    throw new ConsoleError(502, "gateway_authorization_failed", "AgentAction gateway authorization failed.", "unavailable");
  }
  if (upstream.status >= 500) {
    throw new ConsoleError(503, "gateway_unavailable", "AgentAction gateway is unavailable.", "unavailable");
  }
  if (upstream.status !== 204 && upstream.status !== 304) {
    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new ConsoleError(502, "gateway_response_invalid", "AgentAction gateway returned an invalid response.", "unavailable");
    }
  }

  const freshness = upstreamFreshness(upstream.headers, env);
  const headersOut = secureHeaders("application/json; charset=utf-8");
  for (const name of ["content-type", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headersOut.set(name, value);
  }
  headersOut.set("x-agentpass-console-data-state", freshness.state);
  if (freshness.generatedAt) {
    headersOut.set("x-agentpass-console-generated-at", freshness.generatedAt);
  }
  if (freshness.ageSeconds !== undefined) {
    headersOut.set("x-agentpass-console-data-age-seconds", String(freshness.ageSeconds));
  }
  return new Response(upstream.body, { status: upstream.status, headers: headersOut });
}

function gatewayServiceToken(env: Env): string {
  return env.AGENTID_INTERNAL_SERVICE_TOKEN?.trim() || env.AGENTID_GATEWAY_TOKEN?.trim() || "";
}

function upstreamFreshness(headers: Headers, env: Env): UpstreamFreshness {
  const generatedAt = headers.get("x-agentpass-generated-at") || headers.get("date");
  if (!generatedAt) return { state: "unknown" };
  const timestamp = Date.parse(generatedAt);
  if (!Number.isFinite(timestamp)) return { state: "unknown" };
  const configured = Number(env.CONSOLE_STALE_AFTER_SECONDS || "300");
  const staleAfterSeconds = Number.isFinite(configured) && configured > 0 ? Math.min(configured, 86_400) : 300;
  const ageSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  return {
    ageSeconds,
    generatedAt: new Date(timestamp).toISOString(),
    state: ageSeconds > staleAfterSeconds ? "stale" : "fresh",
  };
}

function problemResponse(request: Request, error: ConsoleError): Response {
  if (requestAcceptsHtml(request)) {
    const title = error.status === 401
      ? "Authentication required"
      : error.status === 403
        ? "Tenant access denied"
        : "Console unavailable";
    const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body><main><h1>${title}</h1><p>${escapeHtml(error.message)}</p></main></body></html>`;
    return htmlResponse(body, error.status, "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  }
  return jsonResponse({
    error: { code: error.code, message: error.message },
    state: error.state,
  }, error.status, error.status === 405 ? { allow: "GET" } : undefined);
}

function htmlResponse(body: string, status = 200, csp?: string): Response {
  const headers = secureHeaders("text/html; charset=utf-8");
  headers.set(
    "content-security-policy",
    csp || "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
  return new Response(body, { status, headers });
}

function assetResponse(body: string, contentType: string): Response {
  return new Response(body, { headers: secureHeaders(contentType) });
}

function jsonResponse(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  const headers = secureHeaders("application/json; charset=utf-8");
  for (const [name, value] of Object.entries(extraHeaders || {})) headers.set(name, value);
  return new Response(JSON.stringify(body), { status, headers });
}

function secureHeaders(contentType: string): Headers {
  return new Headers({
    "cache-control": "private, no-store, max-age=0",
    "content-type": contentType,
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    pragma: "no-cache",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });
}

function requestAcceptsHtml(request: Request): boolean {
  const pathname = new URL(request.url).pathname;
  return pathname === "/" || (request.headers.get("accept") || "").includes("text/html");
}

function consoleEnvironment(env: Env): string {
  const environment = env.CONSOLE_ENVIRONMENT?.trim().toLowerCase() || "production";
  if (environment !== "production" && environment !== "development") {
    throw new ConsoleError(
      500,
      "console_environment_invalid",
      "CONSOLE_ENVIRONMENT must be production or development.",
      "unavailable",
    );
  }
  return environment;
}

function accessTeamDomain(env: Env): string {
  const configured = requiredString(env.ACCESS_TEAM_DOMAIN, "ACCESS_TEAM_DOMAIN is not configured");
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new ConsoleError(500, "access_team_domain_invalid", "ACCESS_TEAM_DOMAIN is invalid.", "unavailable");
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.pathname !== "/" && url.pathname !== "")) {
    throw new ConsoleError(500, "access_team_domain_invalid", "ACCESS_TEAM_DOMAIN must be an HTTPS origin.", "unavailable");
  }
  return url.origin;
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ConsoleError(500, "console_configuration_missing", message, "unavailable");
  }
  return value.trim();
}

function validateTenantId(value: unknown, source: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ConsoleError(403, "tenant_claim_missing", `${source} is missing.`, "forbidden");
  }
  const tenantId = value.trim();
  if (tenantId.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(tenantId)) {
    throw new ConsoleError(403, "tenant_claim_invalid", `${source} is invalid.`, "forbidden");
  }
  return tenantId;
}

function validateTenantRole(value: unknown, source: string): TenantRole {
  if (value === "owner" || value === "operator" || value === "viewer") return value;
  throw new ConsoleError(403, "tenant_role_invalid", `${source} is invalid.`, "forbidden");
}

function validateResourceSegment(value: string): void {
  if (!value || value.length > 256 || /[\u0000-\u001f/\\]/.test(value)) {
    throw new ConsoleError(400, "gateway_resource_invalid", "Gateway resource path is invalid.");
  }
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new ConsoleError(400, "gateway_path_invalid", "Gateway path encoding is invalid.");
  }
}

function sameSegments(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function readClaim(claims: Record<string, unknown>, path: string): unknown {
  let value: unknown = claims;
  for (const part of path.split(".").filter(Boolean)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function audienceMatches(value: unknown, allowed: string[]): boolean {
  const actual = Array.isArray(value) ? value.map(String) : typeof value === "string" ? [value] : [];
  return actual.some((audience) => allowed.includes(audience));
}

function parseJwt(token: string): {
  claims: Record<string, unknown>;
  encodedHeader: string;
  encodedPayload: string;
  encodedSignature: string;
  header: Record<string, unknown>;
} {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error("invalid JWT");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = JSON.parse(base64UrlDecode(encodedHeader)) as Record<string, unknown>;
  const claims = JSON.parse(base64UrlDecode(encodedPayload)) as Record<string, unknown>;
  if (!header || typeof header !== "object" || !claims || typeof claims !== "object") throw new Error("invalid JWT");
  return { claims, encodedHeader, encodedPayload, encodedSignature, header };
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

function base64UrlToBytes(value: string): Uint8Array {
  return Uint8Array.from(base64UrlDecode(value), (character) => character.charCodeAt(0));
}

function asConsoleError(error: unknown): ConsoleError {
  return error instanceof ConsoleError
    ? error
    : new ConsoleError(500, "console_internal_error", "Console request failed.", "unavailable");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}
