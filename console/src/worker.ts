type Fetcher = {
  fetch(request: Request): Promise<Response>;
};

export type Env = {
  AGENTID_GATEWAY?: Fetcher;
  AGENTID_GATEWAY_TOKEN?: string;
  ACCESS_AUD?: string;
  ACCESS_JWKS_URL?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_TENANT_CLAIM?: string;
  CONSOLE_ENABLE_MOCK_IDENTITY?: string;
  CONSOLE_ENVIRONMENT?: string;
  CONSOLE_MOCK_EMAIL?: string;
  CONSOLE_MOCK_SUBJECT?: string;
  CONSOLE_MOCK_TENANT_ID?: string;
  CONSOLE_STATIC_TENANT_ID?: string;
  CONSOLE_STALE_AFTER_SECONDS?: string;
};

type ConsoleIdentity = {
  email?: string;
  issuer: string;
  subject: string;
  tenantId: string;
};

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
const NO_QUERY = new Set<string>();

const SHELL_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>AgentPass Observability</title>
  <link rel="stylesheet" href="/assets/app.css">
  <script src="/assets/app.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to main content</a>
  <header class="topbar">
    <div>
      <p class="eyebrow">AgentPass</p>
      <h1>Intent observability</h1>
    </div>
    <div class="identity" aria-label="Authenticated context">
      <span data-tenant>Tenant loading…</span>
      <span data-subject>Identity loading…</span>
    </div>
  </header>
  <div class="layout">
    <nav class="section-nav" aria-label="Console sections">
      <a href="#overview" aria-current="page">Overview</a>
      <a href="#jobs">Jobs</a>
      <a href="#job-detail">Job detail</a>
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
      <section class="intro" aria-labelledby="overview-title">
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
      <section id="lifecycle" class="lifecycle-panel" aria-labelledby="lifecycle-title">
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
              <h3>AgentPass Gateway</h3>
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
      <section id="overview" class="overview-panel" aria-labelledby="overview-heading" tabindex="-1">
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
      <div class="section-grid future-grid" aria-label="Planned observability views">
        <section id="jobs" class="placeholder-card" tabindex="-1">
          <span class="card-index">02</span>
          <div><h2>Jobs</h2><p>Finalized executions with preview history and an explicit freeze boundary.</p></div>
          <span class="phase" title="GitHub issue 32">Issue #32</span>
        </section>
        <section id="job-detail" class="placeholder-card" tabindex="-1">
          <span class="card-index">03</span>
          <div><h2>Job detail</h2><p>Aligned decisions, execution receipts, observations, and immutable job evidence.</p></div>
          <span class="phase">Planned</span>
        </section>
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
.identity { display: grid; gap: 2px; text-align: right; color: var(--muted); font-size: 0.75rem; }
.identity [data-tenant] { color: var(--ink); font-weight: 800; }
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
  .topbar { align-items: flex-start; padding: 15px 18px; }
  .layout { display: block; }
  .section-nav { position: static; grid-template-columns: repeat(4, max-content); overflow-x: auto; padding: 10px 14px; border-bottom: 1px solid var(--line); }
  .section-nav a { border-left: 0; border-bottom: 2px solid transparent; }
  main { padding: 16px; }
  .intro { grid-template-columns: 1fr; gap: 12px; padding: 16px 18px; }
  .intro dl { min-width: 0; }
  .section-grid { grid-template-columns: 1fr; }
}
@media (max-width: 520px) {
  .identity { max-width: 45%; }
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
.overview-panel {
  margin-top: 12px;
  padding: clamp(20px, 3vw, 34px);
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface-strong);
}
.overview-panel:target,
.overview-panel:focus-visible { outline: 3px solid color-mix(in srgb, var(--green) 35%, transparent); outline-offset: 2px; }
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
.future-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.future-grid .placeholder-card { min-height: 130px; }
@media (max-width: 1050px) {
  .intro { grid-template-columns: 1fr; gap: 12px; }
  .intro dl { min-width: 0; }
  .lifecycle-track { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .lifecycle-track li:nth-child(3n)::after { top: auto; right: 50%; bottom: -12px; transform: translateX(50%) rotate(45deg); }
  .filter-grid { grid-template-columns: repeat(2, minmax(150px, 1fr)); }
  .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .profile-columns { grid-template-columns: 1fr; }
  .future-grid { grid-template-columns: 1fr; }
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
  .summary-totals { grid-template-columns: repeat(2, 1fr); }
  .filter-actions { align-items: flex-start; flex-wrap: wrap; }
  .filter-actions p { flex-basis: 100%; margin-left: 0; text-align: left; }
}
@media (max-width: 520px) {
  .filter-grid,
  .metric-grid { grid-template-columns: 1fr; }
  .summary-totals,
  .quality-totals { grid-template-columns: repeat(2, 1fr); }
  .overview-panel { padding: 16px; }
  .profile-body,
  .profile-header { padding: 16px; }
  .distribution,
  .discipline { overflow-x: auto; }
}
`;

export type ConsoleAppRuntime = {
  Date: DateConstructor;
  document: Document;
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  history: Pick<History, "replaceState">;
  location: Pick<Location, "pathname" | "search">;
};

export type ConsoleAppController = {
  buildQualityQuery(): URLSearchParams;
  loadOverview(): Promise<void>;
  ready: Promise<void>;
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
  const subjectLabel = required<HTMLElement>("[data-subject]");
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
  const allowedWindows = new Set(["1", "7", "30", "90"]);
  const allowedVerdicts = new Set(["", "completed", "partial", "failed", "indeterminate"]);
  const allowedConstraints = new Set(["", "pass", "fail", "indeterminate"]);
  const statusMessages: Record<string, [string, string]> = {
    loading: ["Loading fleet quality", "Reading immutable final receipts through the tenant-scoped BFF."],
    ready: ["Fleet quality is current", "Finalized execution quality is grouped by immutable profile binding."],
    partial: ["Fleet quality has data findings", "Review excluded records, small samples, and incomplete metric coverage."],
    stale: ["Fleet quality may be stale", "The latest generated response is older than the configured freshness threshold."],
    unauthorized: ["Authentication required", "Sign in through the configured Cloudflare Access application."],
    forbidden: ["Tenant access denied", "The authenticated identity is not permitted to use this tenant console."],
    unavailable: ["Console data is unavailable", "The private AgentPass gateway cannot be reached. Try again or contact an operator."],
  };
  let tenantId = "";

  function record(value: unknown): Record<string, any> {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, any>
      : {};
  }

  function safeText(value: unknown, fallback = "—"): string {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
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

  function failureState(status: number): "unauthorized" | "forbidden" | "unavailable" {
    if (status === 401) return "unauthorized";
    if (status === 403) return "forbidden";
    return "unavailable";
  }

  function failureMessage(body: unknown, fallback: string): string {
    const error = record(record(body).error);
    return safeText(error.message, fallback);
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

  function resetFilters(): void {
    windowFilter.value = "7";
    profileKeyFilter.value = "";
    profileVersionFilter.value = "";
    agentFilter.value = "";
    verdictFilter.value = "";
    constraintFilter.value = "";
  }

  function appendTextFilter(query: URLSearchParams, name: string, value: string): void {
    const normalized = value.trim().slice(0, 160);
    if (normalized) query.set(name, normalized);
  }

  function queryWindow(): { days: number; from: Date; to: Date } {
    const selected = allowedWindows.has(windowFilter.value) ? windowFilter.value : "7";
    const days = Number(selected);
    const to = new runtime.Date(runtime.Date.now());
    to.setMilliseconds(0);
    const from = new runtime.Date(to.getTime() - days * 86_400_000);
    return { days, from, to };
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

  function syncPageUrl(): void {
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
    const suffix = pageQuery.toString();
    runtime.history.replaceState(null, "", `${runtime.location.pathname || "/"}${suffix ? `?${suffix}` : ""}#overview`);
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

  async function loadOverview(): Promise<void> {
    if (!tenantId) return;
    setStatus("loading", "Querying immutable final receipts for the selected profile boundary.");
    setOverviewState("loading", statusMessages.loading[0], statusMessages.loading[1]);
    overviewContent.hidden = true;
    refreshButton.hidden = true;
    const query = buildQualityQuery();
    syncPageUrl();
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
    buildQualityQuery();
    try {
      const session = await read("/api/console/session");
      if (!session.response.ok) {
        const state = failureState(session.response.status);
        const detail = failureMessage(session.body, statusMessages[state][1]);
        setStatus(state, detail);
        setOverviewState(state, statusMessages[state][0], detail);
        return;
      }
      tenantId = safeText(session.body.tenant_id, "");
      if (!tenantId) throw new Error("Console tenant is missing.");
      tenantLabel.textContent = `Tenant: ${tenantId}`;
      subjectLabel.textContent = safeText(session.body.email || session.body.subject, "Authenticated operator");
      const health = await read("/api/console/health");
      if (!health.response.ok) {
        const state = failureState(health.response.status);
        const detail = failureMessage(health.body, statusMessages[state][1]);
        setStatus(state, detail);
        setOverviewState(state, statusMessages[state][0], detail);
        return;
      }
      await loadOverview();
    } catch {
      setStatus("unavailable");
      setOverviewState("unavailable", statusMessages.unavailable[0], statusMessages.unavailable[1]);
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
    void loadOverview();
  });

  const ready = start();
  return { buildQualityQuery, loadOverview, ready };
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
        return htmlResponse(SHELL_HTML);
      }
      if (request.method === "GET" && url.pathname === "/assets/app.css") {
        return assetResponse(APP_CSS, "text/css; charset=utf-8");
      }
      if (request.method === "GET" && url.pathname === "/assets/app.js") {
        return assetResponse(APP_JS, "text/javascript; charset=utf-8");
      }
      if (request.method === "GET" && url.pathname === "/api/console/session") {
        return jsonResponse({
          authenticated: true,
          tenant_id: identity.tenantId,
          subject: identity.subject,
          ...(identity.email ? { email: identity.email } : {}),
        });
      }
      if (request.method === "GET" && url.pathname === "/api/console/health") {
        return await consoleHealth(identity, env);
      }
      if (url.pathname.startsWith("/api/console/tenants/")) {
        const route = parseGatewayRoute(url, identity);
        if (request.method !== "GET") {
          return problemResponse(request, new ConsoleError(405, "method_not_allowed", "Console gateway routes are read only."));
        }
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
  const configuredTenant = env.CONSOLE_STATIC_TENANT_ID?.trim();
  let tenantId: string;
  if (configuredTenant) {
    tenantId = validateTenantId(configuredTenant, "configured console tenant");
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
    tenantId = validateTenantId(readClaim(claims, tenantClaim), `Access claim ${tenantClaim}`);
  }
  return {
    tenantId,
    subject,
    issuer: String(claims.iss),
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

function parseGatewayRoute(url: URL, identity: ConsoleIdentity): GatewayRoute {
  const rawParts = url.pathname.split("/").filter(Boolean);
  if (rawParts.length < 5 || rawParts[0] !== "api" || rawParts[1] !== "console" || rawParts[2] !== "tenants") {
    throw new ConsoleError(404, "gateway_route_not_found", "Console gateway route not found.");
  }
  const parts = rawParts.map(decodePathSegment);
  const routeTenant = validateTenantId(parts[3], "route tenant");
  if (routeTenant !== identity.tenantId) {
    throw new ConsoleError(403, "tenant_mismatch", "Authenticated tenant does not match the requested route.", "forbidden");
  }
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
  } else if (suffix[0] === "intent-profiles" && (suffix.length === 1 || suffix.length === 2)) {
    allowedQuery = suffix.length === 1 ? PROFILE_QUERY : NO_QUERY;
  } else if (suffix[0] === "intent-contracts" && (suffix.length === 1 || suffix.length === 2)) {
    allowedQuery = suffix.length === 1 ? CONTRACT_QUERY : NO_QUERY;
  } else if (sameSegments(suffix, ["audit", "events"])) {
    allowedQuery = AUDIT_QUERY;
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
    tenantId: identity.tenantId,
    allowedQuery,
    gatewayPath: `/tenants/${encodeURIComponent(identity.tenantId)}/${suffix.map(encodeURIComponent).join("/")}`,
  };
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
    throw new ConsoleError(503, "gateway_binding_unavailable", "AgentPass gateway is unavailable.", "unavailable");
  }
  if (consoleEnvironment(env) === "production" && !env.AGENTID_GATEWAY_TOKEN) {
    throw new ConsoleError(500, "gateway_credential_missing", "AgentPass gateway credential is not configured.", "unavailable");
  }
  const target = new URL(`https://agentpass-gateway.internal${path}`);
  target.search = query.toString();
  const headers = new Headers({
    accept: "application/json",
    "user-agent": "agentpass-observability-console/0.1",
  });
  if (env.AGENTID_GATEWAY_TOKEN) headers.set("authorization", `Bearer ${env.AGENTID_GATEWAY_TOKEN}`);

  let upstream: Response;
  try {
    upstream = await env.AGENTID_GATEWAY.fetch(new Request(target, { method: "GET", headers }));
  } catch {
    throw new ConsoleError(503, "gateway_unavailable", "AgentPass gateway is unavailable.", "unavailable");
  }
  if (upstream.status === 401 || upstream.status === 403) {
    throw new ConsoleError(502, "gateway_authorization_failed", "AgentPass gateway authorization failed.", "unavailable");
  }
  if (upstream.status >= 500) {
    throw new ConsoleError(503, "gateway_unavailable", "AgentPass gateway is unavailable.", "unavailable");
  }
  if (upstream.status !== 204 && upstream.status !== 304) {
    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new ConsoleError(502, "gateway_response_invalid", "AgentPass gateway returned an invalid response.", "unavailable");
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
