import type { AgentIdea } from './agent-profiler.ts';
import type { AgentPlan, ToolBindings } from './agent-plans.ts';
import type { RecipeCheck, RecipeEval } from "./recipe-evaluation.ts";
import type { RecipeDefinition, RecipeRevision } from "./workspace-recipes.ts";
import { agentHistory, HISTORY_CSS, HISTORY_FACTORY_JS, EXECUTION_CSS } from "./agent-history.ts";
import { recipes, type Recipe } from "../../recipes/registry.ts";
import { JOURNEY_NAV } from "./journey.ts";
import type { PrecheckReport } from "./mcp-precheck.ts";
import { mcpMatching, MATCHING_FACTORY_JS } from './mcp-matching.ts';
import type { CatalogResult, CatalogServer } from "./mcp-registry.ts";
import { capabilityEngine, CAPABILITY_FACTORY_JS, type FieldChecks, type CoverageStep } from './mcp-capabilities.ts';
const CAPABILITY_CSS = `.capability-details,.capability-step{min-width:0;overflow-wrap:anywhere}.connection>div:first-child{min-width:0;flex:1}.server-suggestions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.server-suggestions>.catalog-sources{grid-column:1/-1}.catalog-sources{font-size:14px;margin:10px 0}.server-suggestions>.note{grid-column:1/-1}.server-choice{padding:16px;border:1px solid #cbd0c4;background:#fff;margin:10px 0;min-width:0}.server-choice .pill{background:#eef0ea;display:inline-block;margin-left:10px}.server-choice button{margin:8px 8px 0 0}.capability-step h4{font-size:18px;margin:0 0 8px}.capability-step h5{font-size:15px;margin:20px 0 8px}.capability-search{display:flex;gap:12px;align-items:end;margin-top:12px}.capability-search label{flex:1;margin:0;min-width:0}.capability-search input{width:100%}.capability-choices{margin:12px 0}.other-tools{margin:14px 0}.other-tools label{margin-top:12px}.selected-tool{font-weight:600}.capability-step{padding:18px 0;border-top:1px solid #cbd0c4}.capability-report{margin-top:12px;padding:12px 16px;background:#fff2d6;border-left:4px solid #9a6511}.capability-report[data-coverage-status=covered]{background:#eaf1d9;border-color:#789832}.capability-report[data-coverage-status=partial],.capability-report[data-coverage-status=not_exposed]{background:#f7e9e6;border-color:#ad4135}.capability-report p{margin:8px 0}.field-check-editor{padding:14px;border:1px solid #cbd0c4;background:#fff}.field-source-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;gap:12px;margin:16px 0;align-items:end}.field-source-row label{min-width:0}.field-check-editor>.fields{margin-top:16px}@media(max-width:850px){.server-suggestions{grid-template-columns:1fr}.capability-search{align-items:stretch;flex-direction:column}.server-choice .pill{margin:8px 0;display:block}.field-source-row{grid-template-columns:1fr}.field-check-editor{padding:12px}.capability-step{padding:14px 0}}`;

export const AGENT_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AgentAction — Create your agent</title><link rel="icon" type="image/png" href="/favicon.png"><link rel="stylesheet" href="/assets/agents.css"><script src="/assets/journey.js" defer></script><script src="/assets/agents.js" defer></script></head><body>
<header><a class="brand" href="/#overview">AgentAction</a><section class="account" aria-label="Signed-in account"><p class="note">Signed in as <strong id="account-identity">Checking session…</strong></p><p class="note">Workspace role: <strong id="account-role">Checking…</strong></p><div class="actions"><a id="account-logout" href="/cdn-cgi/access/logout" hidden>Log out</a><a id="account-login" href="/agents">Sign in</a><a href="/#setup" data-workspace-link>Workspace settings</a></div><p id="account-help" class="note">To switch accounts, log out and return to this page to sign in. Your role is assigned by a workspace owner.</p></section></header>
<div class="builder-layout">${JOURNEY_NAV}<main><div class="heading"><div><p class="eyebrow" id="stage-label">01 / Create</p><h1 id="stage-title">Give your agent a job.</h1><p class="lede" id="stage-description">Describe the job. Review its tools and boundaries, then try it.</p></div><label class="workspace">Workspace<select id="workspace" aria-label="Workspace"></select></label></div>
<p id="status" role="status" aria-live="polite">Loading your workspace…</p>
<p id="recipe-return" hidden><a href="#create">← Continue agent setup</a></p><div id="builder" hidden>
<section class="panel" data-builder-stage="connect"><div class="section-heading"><h2>MCP servers</h2><span>Server-side credentials · supervised execution</span></div>
<div class="actions mcp-navigation" aria-label="MCP views"><button id="browse-servers" type="button" aria-pressed="true" aria-controls="catalog-view">Browse servers</button><button id="manage-connections" type="button" class="secondary" aria-pressed="false" aria-controls="setup-view">My MCP servers</button></div>
<div id="catalog-view"><form id="catalog-search" role="search"><div class="fields catalog-filters"><label>What do you want your agent to do?<input id="catalog-query" name="q" type="search" maxlength="200" placeholder="Try send emails, query a database, or a service name"></label><label>Capability<select id="catalog-capability" name="capability"><option value="">All capabilities</option></select></label><label>Authentication<select id="catalog-auth" name="auth" aria-describedby="catalog-auth-help"><option value="">All authentication types</option></select></label></div><p id="catalog-auth-help" class="note">Authentication labels reflect declared headers or package inputs, including optional credentials. Not specified does not mean no authentication. Check provider documentation for OAuth, pricing and requirements for your chosen deployment.</p><div class="actions"><button type="submit">Search registry</button><button id="manual-connect" type="button" class="secondary">Add your own MCP server</button></div></form>
<p id="catalog-status" class="note" role="status" aria-live="polite">Search MCP directories. Tool catalogs are advertised; connect to discover tools for your account.</p><div id="catalog-results" class="grid" aria-label="MCP server search results"></div><button id="catalog-more" type="button" class="secondary" hidden>Show more servers</button>
</div><div id="setup-view" hidden><button id="back-to-results" type="button" class="secondary">← Back to results</button>
<div id="connection-details"><h3 tabindex="-1" id="setup-heading">Add an MCP server</h3><p id="catalog-selection" class="note">Enter a server’s HTTPS endpoint to start an automatic pre-check.</p>
<form id="connect"><div class="fields setup-fields"><label>Server / account name<input name="label" maxlength="100" placeholder="My Firecrawl" required></label><label>MCP endpoint<input id="precheck-endpoint" name="endpoint" type="url" maxlength="2048" placeholder="https://mcp.example.com/mcp" required aria-describedby="precheck-status"></label><label>Protocol<select name="protocol"><option value="2025-03-26">Session-based MCP (2025)</option><option value="2026-07-28">Stateless MCP (2026-07-28)</option></select></label></div>
<div class="setup-columns"><section id="endpoint-precheck" class="precheck-panel" aria-label="Endpoint pre-check"><h3>Pre-check findings</h3><p id="inspection-target" class="note"></p><p class="note"><a href="https://mcpcheck.agentaction.dev" target="_blank" rel="noopener noreferrer">Developer readiness checker ↗</a> · inspect, export and optionally publish a public profile.</p><p class="note">Runs automatically for the endpoint you choose. No AI, credentials or tool execution. Recent results are reused for one hour; Recheck requests fresh observations. Up to 30 new checks per workspace per day.</p><p id="precheck-status" role="status" aria-live="polite">Enter an HTTPS endpoint to start.</p><button id="precheck-run" type="button" class="secondary">Recheck endpoint</button><div id="precheck-results" aria-live="polite"></div><details><summary>Recent workspace pre-checks</summary><div id="precheck-history"></div></details></section>
<div class="connection-access"><h3>Approve and connect</h3><p id="connection-target" class="note"></p><p class="note">Review the findings before sharing credentials. A pre-check does not approve an endpoint or certify a provider as safe.</p>
<p id="endpoint-status" class="note" role="status" aria-live="polite">Enter an endpoint to check workspace access.</p>
<div id="endpoint-review" hidden><p class="note">Approve this exact destination for this workspace. Connecting later can send your supplied credentials, job inputs and tool arguments to this server.</p><p id="endpoint-review-url" class="note"></p><label class="consent"><input id="endpoint-reviewed" type="checkbox"> I reviewed this URL and approve it as a destination for this workspace.</label><button id="approve-endpoint" type="button" class="secondary" disabled>Approve endpoint for workspace</button></div><p id="approval-feedback" class="action-feedback" role="status" aria-live="polite" hidden></p>
<p class="note">Public HTTPS endpoints require workspace-owner approval or deployment-managed access. Shared OAuth is available for configured providers. Local stdio is not supported.</p>
<label>Bearer token <span class="muted">optional for public servers</span><input name="token" type="password" autocomplete="off" maxlength="4096"></label>
<label class="consent"><input type="checkbox" name="consent" required> Use AI to suggest and run agents. Tool descriptions, job inputs and tool results are sent to the configured AI model. The bearer token stays server-side and is excluded from model prompts.</label>
<div id="oauth-options"></div><p id="oauth-feedback" tabindex="-1" class="action-feedback" role="status" aria-live="polite" hidden></p><p id="connect-readiness" class="note" role="status">Enter an MCP endpoint above to check access.</p><button type="submit" aria-describedby="connect-readiness">Connect server</button><p id="connect-feedback" class="action-feedback" role="status" aria-live="polite" hidden></p></div></div></form><details><summary>Workspace endpoint approvals</summary><p class="note">Owners can remove workspace approvals. Removing access disconnects affected accounts and pauses their agents unless the endpoint is also enabled by the deployment.</p><div id="endpoint-approvals"></div></details></div><h3>Connected MCP servers</h3><p id="connections-feedback" class="action-feedback" role="status" aria-live="polite" hidden></p><div id="connections" class="connections"></div></div></section>
<section class="panel" data-builder-stage="create" hidden id="guided-create">
<form id="draft-request"><label for="job-description">What would you like your agent to do?<textarea id="job-description" maxlength="2500" rows="3" required placeholder="Summarize pricing from acme.com/pricing, with source links."></textarea></label><p class="note">Describe the outcome and any details you already know. You can connect tools later.</p><div class="actions"><button id="generate-draft" type="submit">Draft my agent</button></div><p class="note">AI creates an editable draft. Nothing runs until you approve an action.</p><p id="draft-feedback" class="action-feedback" role="status" aria-live="polite" hidden></p></form>
<details id="agent-profiler"><summary>Help me choose an agent</summary>
<p class="note">Choose a function or area. Get a few useful starting points, then make one your own.</p>
<form id="profile-request"><div class="fields"><label for="profile-area">Function or area<input id="profile-area" list="profile-areas" maxlength="100" required placeholder="Choose or type an area" autocomplete="off"><datalist id="profile-areas"><option value="Customer support"><option value="Sales"><option value="Marketing"><option value="Engineering"><option value="Product"><option value="Operations"><option value="Finance"><option value="Research"><option value="People and HR"></datalist></label><label for="profile-context">What would you like to improve? <span class="note">Optional</span><input id="profile-context" maxlength="1000" placeholder="e.g. preparing for customer calls" autocomplete="off"></label></div>
<button id="suggest-ideas" type="submit" class="secondary">Suggest agents</button><p class="note">AI suggests ideas from your function and goals. Choose an idea first; connect its tools when drafting.</p><p id="profile-feedback" class="action-feedback" role="status" aria-live="polite" hidden></p></form>
<div id="agent-ideas" class="grid" aria-label="Suggested agents"></div></details>
<details id="example-library"><summary>Browse examples</summary><section id="saved-examples" hidden><h3>Saved by your team</h3><div id="workspace-recipes" class="grid"></div></section><p id="recipe-error" role="status" hidden></p><div id="recipe-browser" class="grid"></div><section id="recipe-detail" class="card" aria-label="Selected example" hidden></section><section id="suggested-examples" hidden><h3>Suggestions from your tools</h3><div id="suggestions" class="grid"></div></section></details>
<details id="manual-options"><summary>Set up manually</summary><button id="start-scratch" type="button" class="secondary">Start from scratch</button></details>
<section id="continue-agents" hidden><h2>Continue an agent</h2><div id="agent-drafts" class="grid"></div></section>
</section>
<section id="configure" class="panel" data-builder-stage="create" hidden><h2>Review your draft</h2><p id="editor-source" class="note"></p><form id="create"><div id="draft-preview" class="card" aria-live="polite"></div><section id="agent-tools" hidden><h3>Tools &amp; MCP servers</h3><p class="note">Find a tool for each capability: use a connected account, review suggested MCP servers, or connect your own.</p><div id="tool-mappings"></div><p id="mapping-status" class="note"></p><div class="actions"><button type="button" id="plan-browse" class="secondary">Browse available MCP servers</button><button type="button" id="plan-custom" class="secondary">Add your own MCP server</button></div></section><section id="draft-questions" hidden><h3>A few missing details</h3><p class="note">Answer only what is missing. These answers apply only to this agent.</p><div id="draft-question-fields"></div></section><details id="draft-customize"><summary>Customize instructions, tools and checks</summary>
<div class="fields"><label>Agent name<input name="title" maxlength="120" required></label><label>Connected server<select id="editor-connection" required></select></label></div>
<label>What should it do?<textarea name="goal" maxlength="2000" rows="3" required></textarea></label>
<label>Inputs this agent needs<textarea name="inputGuide" maxlength="1000" rows="2" placeholder="Describe the inputs to supply each time, such as a target URL and reporting period."></textarea></label>
<fieldset id="editor-tools"><legend>Allowed tools · choose up to four</legend><div id="tool-options" class="fields"></div></fieldset>
<div class="fields"><label>Instructions<textarea name="instructions" maxlength="2000" rows="4" placeholder="Steps the agent should follow."></textarea></label><label>Boundaries<textarea name="boundaries" maxlength="1500" rows="4" placeholder="Scope and actions the agent should avoid."></textarea></label></div>
<label>What counts as success?<textarea name="success" maxlength="2000" rows="3" required></textarea></label>
<p id="selected-tools" class="note">The success text guides the AI assessment. Measurable checks below evaluate recorded evidence separately.</p>
<label class="consent"><input id="eval-enabled" type="checkbox"><span>Bind a contract and measurable checks to each run</span></label>
<fieldset id="eval-editor"><legend>Measurable checks</legend><p class="note">Every bound run checks completion, at least one successful call, selected-tool scope, recorded approval and the four-call limit. All checks must pass. Written boundaries remain instructions to the agent.</p><div id="eval-checks"></div><button type="button" id="add-eval-check" class="secondary">Add a check</button><p class="note">Result fields come from the latest call to the named tool, under MCP structuredContent. Missing, truncated or plain-text evidence is inconclusive. Provider-reported fields are not independently verified.</p></fieldset>
<div class="actions"><button id="save-recipe" type="button" class="secondary">Save as a template</button><button id="duplicate-recipe" type="button" class="secondary" hidden>Save as new template</button></div><p id="recipe-save-status" class="note" role="status" aria-live="polite"></p>
</details><div class="instance-inputs"><h3>Job details</h3><label>Your job inputs<textarea name="setup" maxlength="4000" rows="4" required placeholder="Add target URLs, resources, scope and any other inputs the agent needs."></textarea></label><p id="setup-hint" class="note">These inputs are saved only with this agent, never automatically copied to the reusable agent template.</p><p class="note">Review first action prepares a trial for your approval. Save draft only keeps it for later. Up to four total calls per run across mapped MCP servers.</p><div class="actions"><button id="review-first-action" type="submit">Review first action</button><button id="create-agent" class="secondary" type="submit" formnovalidate>Save draft only</button></div></div></form></section>
<section class="panel" data-builder-stage="run" hidden><div class="section-heading"><h2>My agents</h2><button id="refresh" class="secondary" type="button">Refresh</button></div><div id="agents" class="grid"></div></section>
<section class="panel" data-builder-stage="run" hidden><div class="section-heading"><h2>Runs &amp; approvals</h2><span>Execution evidence and AI assessments shown separately</span></div><p class="note">Runs stay in this workspace. Tool results may contain account data and are visible to workspace members. Showing the latest 40 retained runs across agents, plus pending approvals. Recurring checks report monitoring observations, not signed Jobs. Supervised history retains trials needed by active instances. Token totals are reported when the model supplies usage; provider charges are not estimated.</p><div id="runs"></div></section>
</div><a class="stage-continue" id="stage-next" href="#create">Next: create an agent →</a></main></div></body></html>`;
export const AGENT_CSS = HISTORY_CSS + EXECUTION_CSS + CAPABILITY_CSS + `:root{font-family:Arial,Helvetica,sans-serif;color:#171b15;background:#f5f5ee;line-height:1.5}*{box-sizing:border-box}body{margin:0}header{padding:22px 4vw;border-bottom:1px solid #cbd0c4;display:flex;justify-content:space-between;gap:24px;align-items:center}a{color:inherit}.account{max-width:360px;min-width:0;overflow-wrap:anywhere}.account p{margin:0 0 6px}.account .actions{margin:8px 0}.account .actions a{font-size:14px;font-weight:600}.account strong{color:#171b15}nav{display:flex;gap:24px;flex-wrap:wrap;font-size:14px}.brand{font-size:24px;font-weight:800;text-decoration:none}.brand span{font-size:16px;font-weight:400}main{max-width:1280px;margin:auto;padding:48px 4vw}h1{font-size:clamp(32px,4.5vw,56px);line-height:1.05;letter-spacing:-2px;max-width:780px;margin:12px 0 20px}h2{font-size:24px;letter-spacing:-.5px;margin:0 0 12px}h3{font-size:20px;line-height:1.25;margin:12px 0}.eyebrow{font-family:monospace;text-transform:uppercase;font-size:13px;letter-spacing:1px}.heading,.section-heading{display:flex;justify-content:space-between;gap:24px;align-items:start}.lede{max-width:730px;font-size:18px;color:#596150}.workspace{min-width:200px}label{display:flex;flex-direction:column;gap:7px;font-size:14px;font-weight:600;margin-bottom:18px}input,textarea,select{font:inherit;font-weight:400;border:1px solid #a6b09c;background:#fff;padding:12px;max-width:100%;border-radius:0;color:#171b15}textarea{width:100%;resize:vertical}input:focus,textarea:focus,select:focus,button:focus-visible,a:focus-visible{outline:3px solid #7b9c2a;outline-offset:3px}button{font:600 14px Arial;padding:12px 18px;border:1px solid #171b15;background:#171b15;color:#d5ff5d;cursor:pointer}button.secondary{color:#171b15;background:transparent}button:disabled{opacity:.45;cursor:not-allowed}button[aria-busy=true]{cursor:wait}.panel{border-top:1px solid #bac3af;padding:30px 0;margin-top:22px}.section-heading span,.note,.muted{font-size:14px;color:#596150;font-weight:400}.fields,.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.fields{grid-template-columns:repeat(2,minmax(0,1fr))}.catalog-filters{grid-template-columns:minmax(0,2fr) repeat(2,minmax(0,1fr))}.mcp-navigation{margin-bottom:24px}.setup-columns{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:28px;align-items:start}.setup-fields{grid-template-columns:1fr 2fr 1fr}.connection-access{min-width:0}.precheck-panel{border:2px solid #789832;background:#f6fbe9;padding:20px;margin:0;overflow-wrap:anywhere}.precheck-panel h4{margin:14px 0 6px}.precheck-finding{border-left:4px solid #9a6511;padding:8px 12px;background:#fff2d6;margin:10px 0}.precheck-finding[data-level=blocked]{border-color:#ad4135;background:#f7e9e6}.precheck-finding[data-level=info]{border-color:#789832;background:#eaf1d9}.consent{display:flex;flex-direction:row;align-items:start;font-weight:400;max-width:850px}.consent input{margin-top:5px}.card{padding:22px;background:#fff;border:1px solid #cbd0c4;min-width:0;overflow-wrap:anywhere}.card p{font-size:16px}.card .note{font-size:14px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.pill{display:inline-block;background:#e4eccf;padding:4px 8px;font:12px monospace;text-transform:uppercase}.empty{color:#596150}.connection{display:flex;justify-content:space-between;gap:20px;border-top:1px solid #d6dccf;padding:18px 0;margin-top:18px;align-items:center}.run{margin-top:18px}.run-heading{display:flex;justify-content:space-between;gap:20px}.approval{border:2px solid #789832;padding:20px;background:#f6fbe9;margin-top:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:320px;overflow:auto;font:13px/1.5 monospace;background:#eef1e8;padding:15px}.eval-check{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:12px 0}.eval-check label{min-width:0}.eval-check button{align-self:end}#eval-editor{min-width:0;margin:20px 0;padding:18px;border:1px solid #cbd0c4}@media(max-width:700px){.eval-check{grid-template-columns:1fr}}#agent-profiler{margin-top:26px}#agent-ideas:not(:empty){margin-top:20px}#profile-request .fields label{justify-content:end}#agent-ideas .actions{margin-top:auto}#agent-ideas .card{display:flex;flex-direction:column}#example-library[open]{margin-top:24px}#example-library>summary{margin-bottom:18px}#manual-options{font-size:14px;color:#596150}#continue-agents{margin-top:32px}#continue-agents h2{font-size:20px}.instance-inputs{margin-top:28px;padding-top:24px;border-top:1px solid #bac3af}#editor-tools{border:1px solid #cbd0c4;margin:0 0 20px;padding:18px;min-width:0}#editor-tools legend{font-size:14px;font-weight:600}#tool-options .consent{overflow-wrap:anywhere;margin-bottom:8px}#workspace-recipes{margin:16px 0 28px}#connect-readiness[data-state=blocked]{padding:12px 16px;border-left:4px solid #9a6511;background:#fff2d6;color:#4b350f;font-weight:600}#endpoint-review-url,#endpoint-approvals .note{overflow-wrap:anywhere;min-width:0}details{margin-top:16px}summary{cursor:pointer;font-weight:600}.action-feedback{padding:12px 16px;border-left:4px solid #8bad34;background:#eaf1d9;overflow-wrap:anywhere}.action-feedback[data-error=true],#precheck-status[data-error=true]{border-left:4px solid #ad4135;background:#f7e9e6;color:#782e25;padding:12px}#status{padding:14px 18px;border-left:4px solid #8bad34;background:#eaf1d9}#status[data-error=true]{border-color:#ad4135;background:#f7e9e6}[hidden]{display:none!important}@media(max-width:850px){.grid{grid-template-columns:1fr}.heading,header{flex-direction:column}.workspace{width:100%}.fields,.catalog-filters,.setup-columns{grid-template-columns:1fr}.section-heading,.connection,.run-heading{flex-direction:column;gap:8px}main{padding-top:25px}}`;

export function agentBuilderApp(runtime: Window, recipeCatalog: Recipe[] = [], historyFactory = agentHistory, capabilityFactory = capabilityEngine, matchingFactory = mcpMatching): void {
  const history = historyFactory(runtime);
  const capabilities = capabilityFactory(), matcher = matchingFactory();
  let recurring: any = null;
  const doc = runtime.document;
  const get = <T extends HTMLElement>(id: string) => doc.getElementById(id) as T;
  const workspace = get<HTMLSelectElement>("workspace");
  let tenant = "", role = "viewer", generation = 0;
  let state: any = { connections: [], agents: [], runs: [] };
  let builderStage = 'create';
  function showStage(value: string) {
    builderStage = ['connect', 'create', 'run'].includes(value) ? value : ['recipe-browser', 'create-connections'].includes(value) ? 'create' : 'create';
    const copy: Record<string, string[]> = {
      connect: ['MCP servers', 'Connect your tools.', 'Find a server, review its capabilities, and connect the server your agent will use. Add account credentials only when required.'],
      create: ['01 / Create', 'Give your agent a job.', 'Describe the job. Review an editable draft, then approve its first action.'],
      run: ['02 / Run', 'Put your agent to work.', 'Review recent runs and upcoming checks. Open a recurring agent to manage its schedule and findings.'],
    };
    ['stage-label', 'stage-title', 'stage-description'].forEach((id, i) => { get(id).textContent = copy[builderStage][i]; });
    doc.querySelectorAll<HTMLElement>('[data-builder-stage]').forEach(el => { el.hidden = el.dataset.builderStage !== builderStage || (el.id === 'configure' && !chosen); });
    const next = get<HTMLAnchorElement>('stage-next');
    next.href = builderStage === 'connect' ? '#create' : builderStage === 'create' ? '#run' : `/?workspace=${encodeURIComponent(tenant)}#activity`;
    next.textContent = builderStage === 'connect' ? 'Next: create an agent →' : builderStage === 'create' ? 'Next: run a trial →' : 'Next: monitor activity →';
    get('continue-agents').hidden = Boolean(chosen) || !(state.drafts || []).length;
    if(value === 'recipe-browser' || value === 'create-connections') get<HTMLDetailsElement>('example-library').open = true;
    runtime.agentActionJourney?.setView(builderStage);
    get('recipe-return').hidden = (!selectedRecipe && !currentPlan) || builderStage !== 'connect';
    if (builderStage !== 'connect') cancelScheduledPrecheck();
  }
  runtime.addEventListener('hashchange', () => showStage(runtime.location.hash.slice(1)));
  let chosen: { connectionId: string; suggestion: any } | undefined;
  let memberships: any[] = [];
  let selectedRecipe: Recipe | undefined;
  let editorRecipe: (RecipeRevision & { id: string }) | undefined;
  let editorGeneration = 0, draftGeneration = 0, profileGeneration = 0;
  let draftQuestions: string[] = [];
  let currentPlan: AgentPlan | undefined;
  let creating = false;
  function resetDraft() {
    draftGeneration++; draftQuestions = []; currentPlan = undefined;
    profileGeneration++;capabilitySetup=undefined;serverQueries.clear();serverSuggestions.clear();
    get<HTMLFormElement>('profile-request').reset(); get<HTMLDetailsElement>('agent-profiler').open = false;
    get('agent-ideas').replaceChildren(); feedback('profile-feedback','');
    get('continue-agents').hidden = true; get('saved-examples').hidden = true; get('suggested-examples').hidden = true;
    get<HTMLDetailsElement>('example-library').open = false; get<HTMLDetailsElement>('manual-options').open = false;
    get<HTMLFormElement>('draft-request').reset();
    get('draft-question-fields').replaceChildren(); get('draft-questions').hidden = true;
    get('draft-preview').replaceChildren(); get('tool-mappings').replaceChildren(); get('agent-drafts').replaceChildren(); feedback('draft-feedback', '');
  }
  function renderDraftConnections() {
    get<HTMLTextAreaElement>('job-description').disabled = role === 'viewer';
    get<HTMLButtonElement>('generate-draft').disabled = role === 'viewer' || get('generate-draft').hasAttribute('aria-busy');
    const list = get('agent-drafts'); list.replaceChildren();
    for (const plan of state.drafts || []) {
      const card = node('article','','card'); card.append(node('h3',plan.definition.title),node('p',plan.definition.goal),button('Continue setup',async()=>openPlan(plan))); list.append(card);
    }
    get('continue-agents').hidden = Boolean(chosen) || !list.children.length;
    get('agent-profiler').querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,button').forEach(el => { el.disabled = role === 'viewer' || el.hasAttribute('aria-busy'); });
    if(currentPlan) renderMappings();
  }
  function selectedBindings(): ToolBindings {
    return Object.fromEntries([...doc.querySelectorAll<HTMLSelectElement>('[data-tool-mapping]')].filter(el=>el.value).map(el=>[el.dataset.toolMapping!,JSON.parse(el.value)]));
  }
  // Results are workspace/draft scoped; only capability text is sent to the cached registry.
  const serverQueries=new Map<string,string>();
  const serverSuggestions=new Map<string,Promise<CatalogResult>>();
  let capabilitySetup:{tenant:string;planId:string;stepId:string;connectionId?:string}|undefined;
  function suggestionKey(stepId:string) {return `${tenant}:${currentPlan!.id}:${stepId}`;}
  async function setupCapability(stepId:string,endpoint='',label='',setup='') {
    const selectedTenant=tenant,planId=currentPlan!.id,editor=editorGeneration;
    await savePlan();
    if(tenant!==selectedTenant || currentPlan?.id!==planId || editor!==editorGeneration) return;
    capabilitySetup={tenant,planId,stepId};
    runtime.location.hash='connect';showStage('connect');openSetup(endpoint,label,setup);
    const requirement=currentPlan.requirements.find(r=>r.id===stepId)!;
    get('setup-heading').textContent=`Connect a server for ${requirement.label}`;
    get('recipe-return').querySelector('a')!.textContent=`← Back to ${requirement.label}`;
  }
  function listingText(server: CatalogServer) {
    return server.name+' '+server.description+' '+(server.catalogEvidence?.tools.map(t=>t.name.replace(/[_-]/g,' ')+' '+t.description+' '+JSON.stringify(t.inputSchema || {})+' '+JSON.stringify(t.outputSchema || {})).join(' ') || '');
  }
  function sourceStatus(host: HTMLElement, data: CatalogResult) {
    if(!data.sources?.length) return;
    const details=node('details','','catalog-sources');details.append(node('summary','Catalog coverage & sources'));
    for(const source of data.sources) {
      details.append(node('p',`${source.name}: ${source.status} · ${source.withTools} of ${source.listings} indexed listings have tool metadata.${source.updatedAt?' Updated '+new Date(source.updatedAt).toLocaleString()+'.':''}`,'note'));
      if(source.note) details.append(node('p',source.note,'note'));
    }
    details.append(node('p','Coverage describes our indexed listings. It does not measure all MCP servers or confirm your account access.','note'));host.append(details);
  }
  function catalogEvidence(card: HTMLElement, server: CatalogServer, query='') {
    for (const profile of server.readiness || []) {
      const section = node('div', '', 'precheck-panel');
      section.append(node('strong', profile.stale ? 'Public readiness · stale' : 'Public readiness · recent observations'),
        node('p', `${profile.endpoint} · ${profile.toolCount} tools listed · ${profile.failureCount} schema findings · ${profile.reviewCount} review findings`, 'note'),
        node('p', `Checked ${new Date(profile.checkedAt).toLocaleString()} · protocol ${profile.observedProtocol}. Anonymous discovery: ${profile.visibility}. Execution, account permissions and retries remain untested.`, 'note'));
      if (profile.toolNames.length) section.append(node('p', 'Observed tool names: ' + profile.toolNames.slice(0,8).join(', ') + (profile.toolNames.length>8?' …':''), 'note'));
      const link=node('a','View evidence and fixes ↗') as HTMLAnchorElement;
      if (/^[a-f0-9]{64}$/.test(profile.id)) {link.href='https://mcpcheck.agentaction.dev/reports/'+profile.id;link.target='_blank';link.rel='noopener noreferrer';section.append(link);}
      card.append(section);
    }
    const evidence=server.catalogEvidence;
    if(!evidence) {
      card.append(node('p','Directory tool catalog unknown · review any public observations above, check publisher documentation or connect to discover account-specific tools.','note'));
      return;
    }
    card.dataset.catalogSource=evidence.source;
    const label=evidence.source==='glama'?'Glama':'Smithery';
    try {
      const url=new URL(evidence.url);
      if(url.origin===(evidence.source==='glama'?'https://glama.ai':'https://smithery.ai') && !url.username && !url.password) {
        const link=node('a',`Tool catalog data from ${label} ↗`) as HTMLAnchorElement;link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';card.append(link);
      }
    } catch {}
    card.append(node('p',`Registry indexed · ${evidence.status==='unknown'?'catalog unknown':evidence.status==='partial'?'partial metadata':'tool declarations available'} · retrieved ${new Date(evidence.retrievedAt).toLocaleString()}`,'note'));
    if(evidence.observedAt) card.append(node('p',`Source last checked the server: ${new Date(evidence.observedAt).toLocaleString()}`,'note'));
    if(Date.now()-Date.parse(evidence.retrievedAt)>86_400_000) card.append(node('p','Cached catalog may be stale. Connect to check current tools.','note'));
    card.append(node('p',evidence.note,'note'));
    if(evidence.authentication) card.append(node('p',`Directory-declared authentication: ${evidence.authentication==='oauth2'?'OAuth 2.0 · requires a configured provider and workspace owner':evidence.authentication==='none'?'none (unverified)':evidence.authentication==='api_key'?'API key':'Basic authentication (not supported here)'}.`,'note'));
    const observed=state.connections.find((c:any)=>c.status==='connected' && server.endpoints.includes(c.endpoint));
    if(observed && evidence.tools.length) {
      const absent=evidence.tools.filter(t=>!observed.tools.some((actual:any)=>actual.name===t.name));
      card.append(node('p',`Account catalog comparison: ${evidence.tools.length-absent.length} of ${evidence.tools.length} indexed tool names were discovered on this connection.${absent.length?' Not discovered: '+absent.slice(0,8).map(t=>t.name).join(', ')+'.':''} Schemas and permissions may differ.`,'note'));
    }
    const matched=evidence.tools.filter(t=>matcher.match(query,t.name.replace(/[_-]/g,' '),t.description+' '+JSON.stringify(t.inputSchema || {})+' '+JSON.stringify(t.outputSchema || {})).score>0);
    for(const tool of matched.slice(0,3)) {
      card.append(node('p',`Potential matching tool: ${tool.name}`,'note'));
      card.append(node('p',`Declared inputs: ${capabilities.fields(tool.inputSchema).slice(0,8).join(', ') || 'Unknown / not enumerated'}; results: ${capabilities.fields(tool.outputSchema).slice(0,8).join(', ') || 'Unknown / not enumerated'}`,'note'));
    }
    if(evidence.tools.length) card.append(capabilityDetails(evidence.tools,'Registry indexed declarations, not a catalog discovered on your account. Missing fields and tools may reflect incomplete indexing. No account permissions or execution have been tested.',Math.max(evidence.advertisedCount ?? evidence.tools.length,evidence.tools.length)));
  }
  function suggestionCards(requirement:AgentPlan['requirements'][number],host:HTMLElement,query:string) {
    const planId=currentPlan!.id,selectedTenant=tenant,key=suggestionKey(requirement.id),requestKey=key+':'+query;
    const generation=String(Number(host.dataset.generation || 0)+1);host.dataset.generation=generation;
    host.replaceChildren(node('p','Finding matching servers…','note'));host.setAttribute('aria-live','polite');
    if(!matcher.groups(query).length) {host.replaceChildren(node('p','Try a service or subject, such as contractor licenses, employment or contacts. You can also connect your own server.','note'));return;}
    let pending=serverSuggestions.get(requestKey);
    if(!pending) {
      const params=new URLSearchParams({q:query,mode:'suggest'});
      pending=request(`/api/agents/${encodeURIComponent(tenant)}/catalog?${params}`);
      if(serverSuggestions.size>=32) serverSuggestions.delete(serverSuggestions.keys().next().value!);
      serverSuggestions.set(requestKey,pending!);
    }
    void pending!.then(data=>{
      if(!host.isConnected || host.dataset.generation!==generation || tenant!==selectedTenant || currentPlan?.id!==planId || (serverQueries.get(key) ?? requirement.label)!==query) return;
      host.replaceChildren();
      if(data.indexing || data.stale || data.unavailable) host.append(node('p',data.notice || 'Registry results may be incomplete.','note'));
      sourceStatus(host,data);
      const servers=data.servers.filter(s=>matcher.match(query,s.title,listingText(s)).score>0).slice(0,3);
      if(!servers.length) host.append(node('p','No matching servers found in the current registry. Refine the search or connect your own MCP server.','note'));
      for(const server of servers) {
        const card=node('article','','server-choice');card.dataset.registryServer=server.name;
        const connected=state.connections.filter((c:any)=>c.status==='connected' && server.endpoints.includes(c.endpoint));
        card.append(node('strong',server.title),node('span',connected.length?'Connected server':'Not connected','pill'),node('p',server.description,'note'));
        const terms=server.matchTerms || matcher.match(query,server.title,listingText(server)).terms;
        card.append(node('p',`Listing or tool metadata mentions: ${terms.join(', ')}.`,'note'));
        card.append(node('p',`${server.publisher} · ${server.hosting}`,'note'));
        catalogEvidence(card,server,query);
        if(server.website) {try {const url=new URL(server.website);if(url.protocol==='https:'&&!url.username&&!url.password) {const link=node('a','Provider details ↗') as HTMLAnchorElement;link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';card.append(link);}}catch{}}
        if(connected.length) {
          card.append(node('p','Choose an actual tool from this connected server.','note'));
          for(const c of connected) for(const tool of c.tools.slice(0,8)) card.append(button(`Use ${c.label} · ${tool.name}`,async()=>chooseTool(requirement.id,{connectionId:c.id,tool:tool.name})));
          if(connected.some((c:any)=>c.tools.length>8)) card.append(node('p','More tools are available under “Choose another connected tool”.','note'));
        } else if(server.endpoints.length) {
          const label=node('label','Endpoint'),select=doc.createElement('select');select.setAttribute('aria-label',`Endpoint for ${server.title}`);
          for(const endpoint of server.endpoints) select.append(new Option(endpoint,endpoint));
          select.disabled=role==='viewer';if(server.endpoints.length>1) {label.append(select);card.append(label);}
          card.append(node('p','Review provider authentication and workspace access before connecting.','note'),button('Review & connect',async()=>setupCapability(requirement.id,select.value,server.title,server.setup)));
        } else card.append(node('p','Setup outside this console is required. Use the provider details, then connect your own supported HTTPS endpoint.','note'));
        host.append(card);
      }
      if(data.servers.length>3 || data.nextOffset!==null && data.nextOffset!==undefined) host.append(button('Browse more matches',async()=>{
        const selectedTenant=tenant,editor=editorGeneration;await savePlan();if(tenant!==selectedTenant || editor!==editorGeneration)return;
        capabilitySetup={tenant,planId,stepId:requirement.id};runtime.location.hash='connect';showStage('connect');showMcpView(false);
        get<HTMLInputElement>('catalog-query').value=query;get<HTMLSelectElement>('catalog-capability').value='';get<HTMLSelectElement>('catalog-auth').value='';await searchCatalog();
      }));
    }).catch(()=>{
      if(!host.isConnected || host.dataset.generation!==generation || tenant!==selectedTenant || currentPlan?.id!==planId || (serverQueries.get(key) ?? requirement.label)!==query) return;
      host.replaceChildren(node('p','Server suggestions are unavailable. Retry, or connect your own MCP server.','note'),button('Retry suggestions',async()=>{serverSuggestions.delete(requestKey);suggestionCards(requirement,host,query);}));
    });
  }
  function chooseTool(stepId:string,binding?:{connectionId:string;tool:string}) {
    if(role==='viewer'||!currentPlan)return;
    if(binding) currentPlan.bindings={...currentPlan.bindings,[stepId]:binding};else delete currentPlan.bindings[stepId];
    if(capabilitySetup?.stepId===stepId) capabilitySetup=undefined;
    renderMappings();updateDraftPreview();
  }
  function renderMappings() {
    if(!currentPlan) return;
    const host=get('tool-mappings');host.replaceChildren();
    for(const requirement of currentPlan.requirements) {
      const card=node('section','','capability-step');card.dataset.capabilityStep=requirement.id;
      card.append(node('h4',requirement.label));host.append(card);
      const binding=currentPlan.bindings[requirement.id],connection=state.connections.find((c:any)=>c.id===binding?.connectionId && c.status==='connected');
      const selected=connection?.tools.find((t:any)=>t.name===binding?.tool);
      if(selected) card.append(node('p',`Selected: ${connection.label} · ${selected.name}`,'selected-tool'),button('Clear selection',async()=>chooseTool(requirement.id)));
      else if(binding) card.append(node('p','The previously mapped tool is unavailable. Choose a replacement below.','note'));
      else card.append(node('p','Choose a connected tool or connect a server for this capability.','note'));
      const choices=node('details','','capability-choices') as HTMLDetailsElement;choices.open=!selected;choices.append(node('summary',selected?'Change tool or server':'Find a tool for this capability'));card.append(choices);
      const tools=state.connections.filter((c:any)=>c.status==='connected').flatMap((c:any)=>c.tools.map((t:any)=>{
        const match=matcher.match(requirement.label,t.name,t.description || '');
        const suggested=requirement.matches.some(m=>m.connectionId===c.id && m.tool===t.name);
        return {connection:c,tool:t,score:match.score+(suggested?100:0),reason:suggested?'Suggested by your draft; review tool support.':`Tool metadata mentions ${match.terms.join(', ')}.`};
      })).sort((a:any,b:any)=>b.score-a.score);
      const justConnected=capabilitySetup?.tenant===tenant && capabilitySetup.planId===currentPlan.id && capabilitySetup.stepId===requirement.id ? capabilitySetup.connectionId : undefined;
      const candidates=tools.filter((t:any)=>justConnected ? t.connection.id===justConnected : t.score>0).slice(0,4);
      if(candidates.length) choices.append(node('h5',justConnected?'Choose an actual tool from your new connection':'Relevant connected tools'));
      else if(tools.length) choices.append(node('p','No relevant connected tools found. Try a server below or connect your own.','note'));
      for(const {connection:c,tool,reason} of candidates) {
        const item=node('article','','server-choice');item.dataset.connectedTool=tool.name;
        item.append(node('strong',`${c.label} · ${tool.name}`),node('span','Connected','pill'),node('p',tool.description || 'No tool description supplied.','note'),node('p',justConnected?'Newly discovered tool; review whether it supports this capability.':reason,'note'),button('Use this tool',async()=>chooseTool(requirement.id,{connectionId:c.id,tool:tool.name})));choices.append(item);
      }
      // Explicit fallback for valid tools whose descriptions do not match the need.
      const other=node('details','','other-tools');other.append(node('summary','Choose another connected tool'));
      const label=node('label','All connected tools'),select=doc.createElement('select');select.dataset.toolMapping=requirement.id;select.setAttribute('aria-label',`Other connected tool for ${requirement.label}`);
      select.append(new Option('Choose a connected tool',''));
      for(const {connection:c,tool} of tools) select.append(new Option(`${c.label} · ${tool.name}`,JSON.stringify({connectionId:c.id,tool:tool.name})));
      select.value=selected?JSON.stringify(binding):'';select.disabled=role==='viewer';select.onchange=()=>chooseTool(requirement.id,select.value?JSON.parse(select.value):undefined);label.append(select);other.append(label);other.hidden=!tools.length;choices.append(other);
      choices.append(node('h5','Suggested MCP servers'),node('p','Matches come from registry descriptions. Review the server and its actual tools before relying on it.','note'));
      const key=suggestionKey(requirement.id),query=serverQueries.get(key) ?? requirement.label;
      const searchRow=node('div','','capability-search'),searchLabel=node('label','Find servers for'),input=doc.createElement('input');input.value=query;input.maxLength=160;input.setAttribute('aria-label',`Find servers for ${requirement.label}`);input.disabled=role==='viewer';searchLabel.append(input);
      const suggestions=node('div','','server-suggestions');suggestions.dataset.serverSuggestions=requirement.id;
      const search=async()=>{const q=input.value.trim();serverQueries.set(key,q);serverSuggestions.delete(key+':'+q);suggestionCards(requirement,suggestions,q);};
      input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();void search();}};
      input.oninput=()=>{suggestions.dataset.generation=String(Number(suggestions.dataset.generation || 0)+1);serverQueries.set(key,input.value.trim());suggestions.replaceChildren(node('p','Select Find servers to update the suggestions.','note'));};
      searchRow.append(searchLabel,button('Find servers',search),button('Connect your own MCP server',async()=>setupCapability(requirement.id)));choices.append(searchRow,suggestions);
      suggestionCards(requirement,suggestions,query);
      const report=node('div','','capability-report');report.dataset.coverageReport=requirement.id;report.setAttribute('aria-live','polite');report.hidden=!binding;card.append(report);
      fieldCheckEditor(requirement.id,card);(card.querySelector('.field-check-editor') as HTMLElement).hidden=!binding;
    }
    updateMappingStatus();renderCoverage();
  }
  function fieldCheckEditor(stepId:string, host:HTMLElement) {
    const plan=currentPlan!;
    const checks:FieldChecks=structuredClone(plan.fieldChecks && Object.hasOwn(plan.fieldChecks,stepId)?plan.fieldChecks[stepId]:{});
    const details=node('details','','field-check-editor');details.append(node('summary','Check fields and input connections'));
    details.append(node('p','Specify the fields this job needs. Example values and connections are assessment inputs only; they do not configure or execute tool calls. Unspecified job inputs stay unknown.','note'));
    const save=()=>{currentPlan!.fieldChecks={...currentPlan!.fieldChecks,[stepId]:structuredClone(checks)};renderCoverage();};
    const input=(labelText:string,value:string,change:(value:string)=>void,placeholder='')=>{
      const label=node('label',labelText),field=doc.createElement('input');field.value=value;field.maxLength=1000;field.placeholder=placeholder;field.disabled=role==='viewer';
      field.oninput=()=>{change(field.value);save();};label.append(field);return label;
    };
    const paths=(value:string)=>value.split(',').map(s=>s.trim()).filter(Boolean).map(s=>s.startsWith('/')?s:capabilities.pointer(s));
    const fields=node('div','','fields');
    fields.append(input('Required input fields',(checks.required_inputs || []).join(', '),value=>checks.required_inputs=paths(value),'ticket_id, assignee_id'),input('Required result fields',(checks.required_outputs || []).join(', '),value=>checks.required_outputs=paths(value),'/tickets/*/id, /tickets/*/title'));details.append(fields);
    const examples=node('div'),connections=node('div');
    let exampleRows=Object.entries(checks.arguments || {}).map(([name,value])=>({name,value:String(value),type:value===null?'null':typeof value}));
    const renderExamples=()=>{
      examples.replaceChildren();
      for(const [index,row] of exampleRows.entries()) {
        const controls=node('div','','field-source-row');
        const sync=()=>{for(const [i,control] of [...examples.children].entries()) {const field=control.querySelector('input')!;field.setCustomValidity(exampleRows[i]?.name && exampleRows.some((other,j)=>i!==j && other.name===exampleRows[i].name)?'Each example input needs a unique field name.':'');}checks.arguments=Object.fromEntries(exampleRows.filter(r=>r.name).map(r=>[r.name,r.type==='number'&&r.value.trim()&&Number.isFinite(Number(r.value))?Number(r.value):r.type==='boolean'&&['true','false'].includes(r.value)?r.value==='true':r.type==='null'?null:r.value]));save();};
        const label=node('label','Value type'),type=doc.createElement('select');type.setAttribute('aria-label','Value type');
        for(const v of ['string','number','boolean','null']) type.append(new Option(v,v));type.value=row.type;type.disabled=role==='viewer';type.onchange=()=>{row.type=type.value;sync();};label.append(type);
        controls.append(input('Input field',row.name,v=>{row.name=v;sync();},'status'),input('Example value',row.value,v=>{row.value=v;sync();},'closed'),label,button('Remove example',async()=>{exampleRows.splice(index,1);sync();renderExamples();}));examples.append(controls);
      }
    };
    let connectionRows=structuredClone(checks.bindings || []);
    const renderConnections=()=>{
      connections.replaceChildren();
      for(const [index,row] of connectionRows.entries()) {
        const controls=node('div','','field-source-row'),label=node('label','From earlier step'),source=doc.createElement('select');
        source.setAttribute('aria-label','From earlier step');source.append(new Option('Choose a step',''));
        for(const step of plan.requirements.slice(0,plan.requirements.findIndex(r=>r.id===stepId))) source.append(new Option(step.label,step.id));
        source.value=row.from_step;source.disabled=role==='viewer';
        const sync=()=>{checks.bindings=structuredClone(connectionRows);save();};source.onchange=()=>{row.from_step=source.value;sync();};label.append(source);
        controls.append(input('Input field',row.input,v=>{row.input=v.startsWith('/')?v:capabilities.pointer(v);sync();},'/ticket_id'),label,input('Result field',row.output,v=>{row.output=v.startsWith('/')?v:capabilities.pointer(v);sync();},'/tickets/*/id'),button('Remove connection',async()=>{connectionRows.splice(index,1);sync();renderConnections();}));connections.append(controls);
      }
    };
    renderExamples();renderConnections();details.append(examples,connections);
    const actions=node('div','','actions');actions.append(button('Add example input',async()=>{if(exampleRows.length>=16)return;exampleRows.push({name:'',value:'',type:'string'});renderExamples();}));
    if(plan.requirements.findIndex(r=>r.id===stepId)>0) actions.append(button('Connect an input to a result',async()=>{if(connectionRows.length>=16)return;connectionRows.push({input:'',from_step:'',output:''});renderConnections();}));
    details.append(actions);host.append(details);
  }
  function renderCoverage() {
    if(!currentPlan) return;
    const tools:any[]=[], steps:CoverageStep[]=[], missing=new Set<string>();
    const bindings=selectedBindings();
    for(const [index,requirement] of currentPlan.requirements.entries()) {
      const binding=bindings[requirement.id] || currentPlan.bindings[requirement.id],connection=state.connections.find((c:any)=>c.id===binding?.connectionId);
      const tool=connection?.status==='connected' ? connection.tools.find((t:any)=>t.name===binding?.tool) : undefined;
      const checks=currentPlan.fieldChecks && Object.hasOwn(currentPlan.fieldChecks,requirement.id)?currentPlan.fieldChecks[requirement.id]:{};
      if(binding && !tool) missing.add(requirement.id);
      if(tool) tools.push({...tool,name:`mapped_${index}`});
      steps.push({...checks,id:requirement.id,...(binding?{tool:`mapped_${index}`}:{})});
    }
    let report:ReturnType<typeof capabilities.evaluate>;
    try {if(doc.querySelector('.field-check-editor input:invalid')) throw new Error('Each example input needs a unique field name.');capabilities.validateChecks(currentPlan.fieldChecks || {},currentPlan.requirements.map(r=>r.id));report=capabilities.evaluate(tools,steps,true,true);}
    catch(error) {for(const host of doc.querySelectorAll<HTMLElement>('[data-coverage-report]')) {host.dataset.coverageStatus='unknown';host.replaceChildren(node('p',`Unknown — ${error instanceof Error?error.message:'Complete the field checks.'}`,'note'));}return;}
    for(const step of report.steps) {
      const host=[...doc.querySelectorAll<HTMLElement>('[data-coverage-report]')].find(h=>h.dataset.coverageReport===step.id)!;
      const configured=currentPlan.fieldChecks && Object.hasOwn(currentPlan.fieldChecks,step.id);
      const binding=bindings[step.id],snapshot=state.connections.find((c:any)=>c.id===binding?.connectionId)?.catalog;
      const status=(!snapshot && !missing.has(step.id)) || (step.status==='covered'&&!configured)?'unknown':step.status;
      host.dataset.coverageStatus=status;
      host.replaceChildren(node('strong',status==='covered'?'Covered by declarations':status==='partial'||status==='not_exposed'?'Blocked for this mapping':'Unknown'));
      if(!configured) host.append(node('p','Field requirements have not been specified. Tool mapping alone does not establish workflow coverage.','note'));
      if(!snapshot) host.append(node('p','Current discovery metadata is missing. Refresh the connected server catalog.','note'));
      if(missing.has(step.id)) host.append(node('p','The mapped server or tool is no longer available. Choose a current connection.','note'));
      for(const finding of step.findings) host.append(node('p',finding.detail,'note'));
      host.append(node('p','Static assessment only. Execution, account permissions and result completeness are unverified.','note'));
    }
  }
  function capabilityDetails(tools:any[], context:string, total=tools.length, summarized=false) {
    const detail=node('details','','capability-details');detail.append(node('summary','Capabilities & limits'),node('p',context,'note'));
    detail.append(node('p',`Showing ${tools.length} of ${total} tools. Operations are inferred; descriptions, schemas and annotations are provider declarations. Actual behavior and account permissions are unverified.`,'note'));
    for(const tool of summarized?tools:capabilities.inventory(tools)) {
      const card=node('details');card.append(node('summary',tool.name),node('p',tool.description,'note'),node('p',`Operations: ${tool.operations.join(', ') || 'Unknown'} (inferred)`,'note'));
      card.append(node('p',`Input fields: ${tool.inputs.join(', ') || 'Not enumerated'}`,'note'),node('p',`Result fields: ${tool.outputs.join(', ') || 'Unknown / not enumerated'}`,'note'));
      for(const text of tool.restrictions) card.append(node('p',`Declared limit: ${text}`,'note'));
      for(const text of tool.findings) card.append(node('p',text,'note'));
      for(const [key,label] of Object.entries({readOnlyHint:'Read only',destructiveHint:'May destroy data',idempotentHint:'Repeated calls have the same effect',openWorldHint:'Interacts with external systems'})) if(typeof tool.annotations?.[key]==='boolean') card.append(node('p',`${label}: ${tool.annotations[key]?'Yes':'No'} (unverified provider hint)`,'note'));
      detail.append(card);
    }
    return detail;
  }
  function updateMappingStatus() {
    if(!currentPlan) return;
    const missing=currentPlan.requirements.length-Object.keys(selectedBindings()).length;
    get('mapping-status').textContent=missing ? `${missing} ${missing===1?'capability':'capabilities'} still need an MCP tool. You can save this draft now.` : 'All capabilities mapped. Review the first action when ready.';
    get<HTMLButtonElement>('review-first-action').disabled=role==='viewer' || missing>0 || creating;
  }
  function showQuestions(questions:string[]) {
    get('draft-question-fields').replaceChildren();
      draftQuestions = questions;
      for (const [i, question] of draftQuestions.entries()) {
        const label = node('label', question), input = doc.createElement('input');
        input.id = `draft-answer-${i}`; input.required = true; input.maxLength = 400; label.append(input);
        const skipLabel = node('label', '', 'consent'), skip = doc.createElement('input'); skip.type = 'checkbox';
        skip.onchange = () => { input.disabled = skip.checked; }; skipLabel.append(skip, node('span', 'Already covered in my job details'));
        get('draft-question-fields').append(label, skipLabel);
      }
      get('draft-questions').hidden = !draftQuestions.length;
  }
  function openPlan(plan: AgentPlan) {
    recipeContext(); openEditor('',plan.definition,{generated:true}); currentPlan=structuredClone(plan);
    editorField('setup').value=plan.setup; showQuestions(plan.questions.filter(q=>!plan.setup.includes(q+'\n')));
    get<HTMLInputElement>('eval-enabled').checked=true; get<HTMLInputElement>('eval-enabled').disabled=true; updateEvalEditor();
    get('agent-tools').hidden=false; get('editor-tools').hidden=true;
    const select=get<HTMLSelectElement>('editor-connection');select.required=false;select.disabled=true;select.parentElement!.hidden=true;
    get<HTMLDetailsElement>('draft-customize').open=false;
    get('editor-source').textContent='Untested agent draft. Tools and written instructions are suggestions; the runtime enforces approvals, mapped tool scope and four total calls.';
    editorTools(plan.definition.tools); updateEvalTools(); renderMappings(); updateDraftPreview();
  }
  async function savePlan(): Promise<AgentPlan> {
    const plan=currentPlan!, selectedTenant=tenant, editor=editorGeneration;
    const saved=await mutate('save-draft',{id:plan.id,definition:definitionFromEditor(),setup:jobInputs(),bindings:selectedBindings(),fieldChecks:plan.fieldChecks || {}});
    if(selectedTenant===tenant && editor===editorGeneration) {currentPlan=saved; editorField('setup').value=saved.setup; draftQuestions=[]; get('draft-question-fields').replaceChildren(); get('draft-questions').hidden=true; state.drafts=[...(state.drafts || []).filter((p:AgentPlan)=>p.id!==saved.id),saved];renderDraftConnections();}
    return saved;
  }
  function updateDraftPreview() {
    if (!chosen) return;
    const preview = get('draft-preview'), connection = state.connections.find((c: any) => c.id === chosen!.connectionId);
    preview.replaceChildren(node('h3', editorField('title').value || 'Your agent'), node('p', editorField('goal').value || 'Describe the job in Customize.'));
    if(!currentPlan) preview.append(node('p', `MCP server: ${connection?.label || 'Choose a server in Customize'}`, 'note'));
    if (editorField('success').value) preview.append(node('p', `Expected result: ${editorField('success').value}`));
    const tools = [...doc.querySelectorAll<HTMLInputElement>('#tool-options input:checked')].map(el => el.value);
    preview.append(node('p', `Tools: ${currentPlan ? currentPlan.requirements.map(r=>r.label).join(', ') : tools.join(', ') || 'Choose tools in Customize'}`, 'note'));
    const enabled = get<HTMLInputElement>('eval-enabled').checked;
    preview.append(node('p', enabled ? 'Enforced boundaries: mapped tools only, approval for every call, four total calls. Checks: completion and successful execution.' : 'Measured checks are off. Success will be AI-assessed.', 'note'));
    if (enabled) for (const field of doc.querySelectorAll<HTMLInputElement>('[data-check-label]')) preview.append(node('p', field.value || 'Unnamed custom check', 'note'));
  }
  function jobInputs(): string {
    const answers = draftQuestions.flatMap((question, i) => { const input = get<HTMLInputElement>(`draft-answer-${i}`); return input.disabled || !input.value.trim() ? [] : [`${question}\n${input.value.trim()}`]; });
    const setup = [editorField('setup').value.trim(), ...answers].filter(Boolean).join('\n\n');
    if (setup.length > 4000) throw new Error('Keep the job details and answers below 4,000 characters.');
    return setup;
  }
  function editorField(name: string) { return get<HTMLFormElement>('create').elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement; }
  function readEvalChecks(): RecipeEval | undefined {
    if (!get<HTMLInputElement>('eval-enabled').checked) return undefined;
    const checks = [...doc.querySelectorAll<HTMLElement>('#eval-checks [data-check-id]')].map(row => {
      const value = (name: string) => row.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-check-${name}]`)!.value;
      const kind = value('kind') as RecipeCheck['kind'];
      const check: RecipeCheck = { id: row.dataset.checkId!, label: value('label').trim(), kind, tool: value('tool') };
      if (kind === 'result_field') {
        check.path = value('path').trim(); check.operator = value('operator') as RecipeCheck['operator'];
        if (check.operator !== 'exists') {
          const expected = value('value'), type = value('type');
          if (type === 'number' && (!expected.trim() || !Number.isFinite(Number(expected)))) throw new Error('Enter a finite numeric expected value.');
          if (type === 'boolean' && !['true','false'].includes(expected)) throw new Error('Enter true or false for a boolean expected value.');
          check.value = type === 'number' ? Number(expected) : type === 'boolean' ? expected === 'true' : expected;
        }
      }
      return check;
    });
    return { version: 1, checks };
  }
  function definitionFromEditor(): RecipeDefinition {
    const evaluation = readEvalChecks();
    return { ...(currentPlan?.definition.toolLabels ? {toolLabels:currentPlan.definition.toolLabels} : {}), title: editorField('title').value.trim(), goal: editorField('goal').value.trim(), inputGuide: editorField('inputGuide').value.trim(), instructions: editorField('instructions').value.trim(), boundaries: editorField('boundaries').value.trim(), success: editorField('success').value.trim(), tools: currentPlan ? currentPlan.requirements.map(r=>r.id) : [...doc.querySelectorAll<HTMLInputElement>('#tool-options input:checked')].map(input => input.value).sort(), ...(evaluation ? { evaluation } : {}) };
  }
  function updateEvalTools() {
    const names = currentPlan ? currentPlan.requirements.map(r=>r.id) : [...doc.querySelectorAll<HTMLInputElement>('#tool-options input:checked')].map(input => input.value);
    doc.querySelectorAll<HTMLSelectElement>('[data-check-tool]').forEach(select => {
      const old = select.value; select.replaceChildren(new Option('Choose a selected tool', ''));
      for (const name of names) select.append(new Option(currentPlan?.requirements.find(r=>r.id===name)?.label || name, name));
      if (old && !names.includes(old)) select.append(new Option(old + ' (not selected)', old));
      select.value = old;
    });
  }
  function updateEvalEditor() {
    const enabled = get<HTMLInputElement>('eval-enabled').checked;
    get<HTMLFieldSetElement>('eval-editor').hidden = !enabled;
    get<HTMLFieldSetElement>('eval-editor').disabled = !enabled || role === 'viewer';
    get<HTMLButtonElement>('add-eval-check').disabled = role === 'viewer' || get('eval-checks').children.length >= 8;
  }
  function addEvalCheck(check?: RecipeCheck) {
    if (get('eval-checks').children.length >= 8) return;
    const row = node('div', '', 'eval-check card'); row.dataset.checkId = check?.id || 'check_' + crypto.randomUUID().replaceAll('-', '');
    const field = (name: string, label: string, element: HTMLInputElement | HTMLSelectElement) => { element.setAttribute('data-check-' + name, ''); const host = node('label', label); host.append(element); row.append(host); return element; };
    const input = (name: string, label: string, initial: string, max: number) => { const el = doc.createElement('input'); el.value = initial; el.maxLength = max; return field(name, label, el) as HTMLInputElement; };
    const select = (name: string, label: string, options: string[][], initial: string) => { const el = doc.createElement('select'); for (const [value, text] of options) el.append(new Option(text,value)); el.value = initial; return field(name, label, el) as HTMLSelectElement; };
    input('label', 'Check name', check?.label || '', 120).required = true;
    const kind = select('kind', 'Evidence check', [['tool_succeeded','Tool call succeeded'],['tool_not_called','Tool was not called'],['result_field','Structured result field']], check?.kind || 'tool_succeeded');
    const tool = select('tool', 'Tool', [['','Choose a selected tool'],...(check?.tool ? [[check.tool,check.tool]] : [])], check?.tool || ''); tool.required = true;
    const path = input('path','Field within structuredContent',check?.path || '',160);
    const operator = select('operator','Comparison',[['equals','Equals'],['gte','At least'],['lte','At most'],['exists','Exists']],check?.operator || 'equals');
    const type = select('type','Expected value type',[['string','Text'],['number','Number'],['boolean','Boolean']],typeof check?.value === 'number' ? 'number' : typeof check?.value === 'boolean' ? 'boolean' : 'string');
    const expected = input('value','Expected value',check?.value === undefined ? '' : String(check.value),500);
    const update = () => {
      const structured = kind.value === 'result_field', needsValue = structured && operator.value !== 'exists';
      for (const el of [path,operator]) { el.parentElement!.hidden = !structured; el.disabled = !structured; }
      for (const el of [type,expected]) { el.parentElement!.hidden = !needsValue; el.disabled = !needsValue; }
      path.required = structured;
      if (operator.value === 'gte' || operator.value === 'lte') type.value = 'number';
    };
    kind.onchange = update; operator.onchange = update;
    const remove = node('button','Remove check','secondary') as HTMLButtonElement; remove.type='button'; remove.onclick=()=>{row.remove();updateEvalEditor();updateDraftPreview();}; row.append(remove);
    get('eval-checks').append(row); update(); updateEvalTools(); updateEvalEditor(); updateDraftPreview();
  }
  function editorTools(selected: string[] = []) {
    const connection = state.connections.find((c: any) => c.id === chosen?.connectionId && c.status === 'connected');
    get('tool-options').replaceChildren();
    for (const tool of currentPlan ? currentPlan.requirements.map(r=>({name:r.id})) : connection?.tools || []) {
      const label = node('label', '', 'consent'), input = doc.createElement('input'); input.type = 'checkbox'; input.value = tool.name; input.checked = selected.includes(tool.name); input.disabled = role === 'viewer';
      label.append(input, node('span', tool.name)); get('tool-options').append(label);
    }
    if (!connection && !currentPlan) get('tool-options').append(node('p', 'Connect a server to choose tools.', 'note'));
  }
  function openEditor(connectionId: string, definition: Partial<RecipeDefinition>, source: any = {}, saved?: RecipeRevision & { id: string }) {
    currentPlan=undefined; get('agent-tools').hidden=true; get('editor-tools').hidden=false; get<HTMLSelectElement>('editor-connection').parentElement!.hidden=false; get<HTMLSelectElement>('editor-connection').required=true;
    editorGeneration++; draftGeneration++; editorRecipe = saved; chosen = { connectionId, suggestion: source }; feedback('draft-feedback', '');
    draftQuestions = []; get('draft-question-fields').replaceChildren(); get('draft-questions').hidden = true;
    const form = get<HTMLFormElement>('create'); form.reset();
    for (const name of ['title', 'goal', 'inputGuide', 'instructions', 'boundaries', 'success']) editorField(name).value = definition[name] || '';
    const select = get<HTMLSelectElement>('editor-connection'); select.replaceChildren();
    select.append(new Option('Choose a connected server', ''));
    for (const c of state.connections.filter((c: any) => c.status === 'connected')) select.append(new Option(c.label, c.id));
    select.value = connectionId;
    editorTools(definition.tools);
    get('eval-checks').replaceChildren(); get<HTMLInputElement>('eval-enabled').checked = Boolean(definition.evaluation) || !saved;
    for (const check of definition.evaluation?.checks || []) addEvalCheck(check);
    get('editor-source').textContent = saved ? `Agent template · version ${saved.version}. Saving edits creates a new version; existing agents keep their original definition.` : source.recipeId ? 'Customize this catalog recipe for your workspace.' : source.id ? 'Review and customize this AI suggestion.' : 'Create a job using your connected tools. No AI suggestion is needed.';
    get('duplicate-recipe').hidden = !saved;
    get('save-recipe').textContent = saved ? 'Save new version' : 'Save as a template';
    get('recipe-save-status').textContent = '';
    form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement>('input,textarea,select,button').forEach(el => { if (!el.closest('#eval-checks')) el.disabled = role === 'viewer'; });
    updateEvalEditor();
    get<HTMLDetailsElement>('draft-customize').open = !definition.goal || !connectionId;
    updateDraftPreview();
    get<HTMLDetailsElement>('example-library').open = false; get<HTMLDetailsElement>('manual-options').open = false;
    profileGeneration++; get<HTMLDetailsElement>('agent-profiler').open = false; get('agent-ideas').replaceChildren(); feedback('profile-feedback','');
    showStage('create'); get('configure').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function renderWorkspaceRecipes() {
    const list = get('workspace-recipes'); list.replaceChildren();
    for (const saved of state.workspaceRecipes || []) {
      const card = node('article', '', 'card'); card.append(node('h3', saved.definition.title), node('p', saved.definition.goal), node('p', `Agent template · v${saved.version}`, 'note'));
      const open = async (duplicate: boolean) => {
        const selectedTenant=tenant, selectedEditor=++editorGeneration;
        const plan=await mutate('template-draft',{workspaceRecipeId:saved.id});
        if(selectedTenant===tenant && selectedEditor===editorGeneration) {openPlan(plan); if(!duplicate) {editorRecipe=saved;get('save-recipe').textContent='Save new version';get('duplicate-recipe').hidden=false;} state.drafts=[...(state.drafts || []),plan];renderDraftConnections();}
      };
      const actions = node('div', '', 'actions'); actions.append(button('Use or edit template', async () => open(false)), button('Duplicate template', async () => open(true))); card.append(actions); list.append(card);
    }
    get('saved-examples').hidden = !list.children.length;
    get<HTMLButtonElement>('start-scratch').disabled = role === 'viewer';
  }
  async function saveEditorRecipe(duplicate: boolean) {
    for (const name of ['title', 'goal', 'success']) if (!editorField(name).reportValidity()) return;
    if (!currentPlan && !get<HTMLSelectElement>('editor-connection').reportValidity()) return;
    const currentTenant = tenant, currentEditor = editorGeneration;
    const definition = definitionFromEditor();
    let saved: RecipeRevision & { id: string };
    try { saved = await mutate('save-recipe', { ...(currentPlan ? {} : {connectionId: chosen?.connectionId}), definition, ...(!duplicate && editorRecipe ? { id: editorRecipe.id, baseVersion: editorRecipe.version } : {}) }); }
    catch (error) { if (tenant !== currentTenant || editorGeneration !== currentEditor) return; throw error; }
    if (tenant !== currentTenant || editorGeneration !== currentEditor) return;
    editorRecipe = saved;
    get('editor-source').textContent = `Agent template · version ${saved.version}. Saving edits creates a new version; existing agents keep their original definition.`;
    state.workspaceRecipes = [...(state.workspaceRecipes || []).filter((r: any) => r.id !== saved.id), saved];
    renderWorkspaceRecipes();
    get('save-recipe').textContent = 'Save new version'; get('duplicate-recipe').hidden = false;
    get('recipe-save-status').textContent = `Saved agent template v${saved.version}. Job inputs were not included. You can create an agent below.`;
  }
  function recipeContext(recipe?: Recipe) {
    capabilitySetup=undefined;get('recipe-return').querySelector('a')!.textContent='← Continue agent setup';
    currentPlan=undefined; selectedRecipe = recipe; chosen = undefined; editorRecipe = undefined; editorGeneration++; draftGeneration++;
    get<HTMLFormElement>('create').reset(); get('configure').hidden = true;
    const url = new URL(runtime.location.href);
    for (const key of ['recipe', 'recipe_version']) url.searchParams.delete(key);
    if (recipe) { url.searchParams.set('recipe', recipe.id); url.searchParams.set('recipe_version', recipe.version); }
    runtime.history.replaceState(null, '', url.pathname + url.search + '#create');
    renderAccountRole(); renderRecipe();
    get('recipe-error').hidden = true;
    runtime.location.hash = 'create'; showStage('create');
  }
  function renderRecipe() {
    const panel = get('recipe-detail'); if (selectedRecipe && chosen?.suggestion.recipeId === selectedRecipe.id) return; panel.replaceChildren(); panel.hidden = !selectedRecipe; get('recipe-browser').hidden = Boolean(selectedRecipe); get('saved-examples').hidden = Boolean(selectedRecipe) || !(state.workspaceRecipes || []).length;
    if(selectedRecipe) get<HTMLDetailsElement>('example-library').open = true;
    get('recipe-return').hidden = (!selectedRecipe && !currentPlan) || builderStage !== 'connect';
    if (!selectedRecipe) return;
    const recipe = selectedRecipe;
    panel.append(node('p', `Agent template · ${recipe.publisher.name} · v${recipe.version}`, 'eyebrow'), node('h2', recipe.title), node('p', recipe.intent));
    const close = node('button', 'Browse other examples', 'secondary') as HTMLButtonElement; close.type = 'button'; close.onclick = () => recipeContext(); panel.append(close);
    if (recipe.runtime === 'recurring') { const link = node('a', 'Configure recurring agent →') as HTMLAnchorElement; link.href = '/automations?workspace=' + encodeURIComponent(tenant) + '#agents'; panel.append(node('p', 'This agent template uses platform scheduling, saved baselines, findings and workspace notifications. Configure its targets and run a baseline before enabling automatic reads.'), link); return; }
    panel.append(node('h3', '1. Review requirements'));
    for (const server of recipe.servers) {
      panel.append(node('strong', server.name), node('p', server.purpose), node('p', `Required tools: ${server.tools.join(', ')}`, 'note'));
      if (server.connection) panel.append(node('p', server.connection.authentication, 'note'));
    }
    for (const requirement of recipe.adoption?.requirements || []) panel.append(node('p', requirement, 'note'));
    panel.append(node('p', 'Hosted trials use mapped MCP servers and at most four total calls. They do not provide cross-run baselines, arbitrary file storage or custom schedules. Supply required context in your inputs; stop the trial if a requirement cannot be met. Tool availability alone does not verify the whole agent template.', 'note'));
    const instructions = node('details'); instructions.append(node('summary', 'Instructions and boundaries'));
    for (const line of [...recipe.instructions, ...recipe.boundaries]) instructions.append(node('p', line, 'note'));
    panel.append(instructions, node('p', recipe.evidence.description, 'note'));
    if (recipe.adoption) {
      const checks = node('details'); checks.append(node('summary', 'Example output and trial checks'), node('p', 'Illustrative output; these checks have not run against your MCP servers.', 'note'), node('pre', recipe.adoption.exampleOutput));
      for (const check of recipe.adoption.validation) checks.append(node('strong', check.name), node('p', check.procedure, 'note'), node('p', `Expected: ${check.expected}`, 'note'));
      panel.append(checks);
    }
    panel.append(button('Configure this agent',async()=>{
      const selectedTenant=tenant, selectedEditor=++editorGeneration;
      const plan=await mutate('template-draft',{recipeId:recipe.id,recipeVersion:recipe.version});
      if(selectedTenant===tenant && selectedEditor===editorGeneration) {openPlan(plan);state.drafts=[...(state.drafts || []),plan];renderDraftConnections();}
    }));
  }

  let catalogGeneration = 0, catalogOffset: number | null = null;
  let catalogQuery = "", catalogCapability = "", catalogAuth = "";
  const capabilityLabels = new Map<string, string>();
  const authLabels = new Map<string, string>();
  let inspectionGeneration = 0, inspecting = false, precheckTouched = false;
  let precheckTimer: number | undefined;
  let precheckError: { endpoint: string; protocol: string; detail: string } | undefined;
  const pendingInspections = new Map<string, Promise<PrecheckReport>>();
  function cancelScheduledPrecheck() { runtime.clearTimeout(precheckTimer); precheckTimer = undefined; }
  function requestedProtocol() { return (get<HTMLFormElement>("connect").elements.namedItem("protocol") as HTMLSelectElement).value; }
  function recentReport(report: PrecheckReport) { const age = Date.now() - Date.parse(report.checkedAt); return report.requestedProtocol === requestedProtocol() && age >= 0 && age < 3_600_000; }
  function validInspectionEndpoint(value: string) {
    try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash && u.hostname.includes(".") && !u.hostname.endsWith(".localhost") && !u.hostname.endsWith(".local") && !/^[\d.]+$/.test(u.hostname); } catch { return false; }
  }
  function showMcpView(setup: boolean) {
    cancelScheduledPrecheck(); inspectionGeneration++; inspecting = false;
    get("catalog-view").hidden = setup; get("setup-view").hidden = !setup;
    get("browse-servers").setAttribute("aria-pressed", String(!setup)); get("manage-connections").setAttribute("aria-pressed", String(setup));
    get("browse-servers").classList.toggle("secondary", setup); get("manage-connections").classList.toggle("secondary", !setup);
    renderPrechecks();
    get(setup ? "setup-heading" : "catalog-query").focus();
  }
  function feedback(id: string, value: string, error = false) { const el = get(id); el.textContent = value; el.dataset.error = String(error); el.hidden = !value; }
  function schedulePrecheck() {
    cancelScheduledPrecheck(); inspectionGeneration++; inspecting = false; precheckTouched = true; precheckError = undefined;
    feedback("oauth-feedback", ""); feedback("connect-feedback", ""); feedback("approval-feedback", ""); updateEndpointAccess(true); renderPrechecks();
    const endpoint = get<HTMLInputElement>("precheck-endpoint").value.trim();
    if (!get("setup-view").hidden && validInspectionEndpoint(endpoint) && role !== "viewer") precheckTimer = runtime.setTimeout(() => { void runPrecheck(endpoint); }, 700);
  }
  function openSetup(endpoint: string, label = "", setup = "") {
    clearSelection(); selectPrecheck(endpoint);
    (get<HTMLFormElement>("connect").elements.namedItem("label") as HTMLInputElement).value = label.slice(0, 100);
    get("catalog-selection").textContent = label ? `Selected ${label}. ${setup || "Review the findings before entering credentials."}` : "Enter a server’s HTTPS endpoint to start an automatic pre-check.";
    if (endpoint) void runPrecheck(endpoint); else get<HTMLInputElement>("precheck-endpoint").focus();
  }
  function renderAccountRole() { const url = new URL(runtime.location.href); if (tenant) url.searchParams.set('workspace', tenant); else url.searchParams.delete('workspace'); runtime.history.replaceState(null, '', url.pathname + url.search + url.hash); get("account-role").textContent = tenant ? role : "No workspace selected"; runtime.agentActionJourney?.setWorkspace(tenant); showStage(builderStage); }
  function sessionUnavailable(detail: string) {
    cancelScheduledPrecheck(); pendingInspections.clear(); precheckError = undefined; generation++; catalogGeneration++; inspectionGeneration++; inspecting = false; tenant = ""; role = "viewer"; memberships = [];
    state = { connections: [], agents: [], runs: [], workspaceRecipes: [] }; chosen = undefined; editorRecipe = undefined; editorGeneration++; resetDraft(); get("tool-options").replaceChildren(); get("editor-connection").replaceChildren(); get("eval-checks").replaceChildren();
    get<HTMLFormElement>("connect").reset(); get<HTMLFormElement>("create").reset();
    workspace.replaceChildren(); workspace.disabled = true;
    get("builder").hidden = true; get<HTMLInputElement>("precheck-endpoint").value = ""; renderPrechecks();
    get("account-identity").textContent = "Session unavailable";
    get("account-role").textContent = "Sign in required";
    get("account-login").hidden = false; get<HTMLAnchorElement>("account-login").href = runtime.location.pathname + runtime.location.search + runtime.location.hash; get("account-logout").hidden = true;
    get("account-help").textContent = detail;
    message(detail, true);
  }
  function canonicalEndpoint(value: string): string { try { return new URL(value).href; } catch { return ""; } }
  function endpointEnabled(value: string): boolean {
    const endpoint = canonicalEndpoint(value), access = state.endpointAccess;
    return Boolean(endpoint && access && (access.deployment.includes(endpoint) || access.workspace.some((a: { endpoint: string }) => a.endpoint === endpoint)));
  }
  function updateEndpointAccess(resetReview = false) {
    updatePrecheckButton();
    const form = get<HTMLFormElement>("connect"), endpoint = (form.elements.namedItem("endpoint") as HTMLInputElement).value;
    const enabled = endpointEnabled(endpoint), canonical = canonicalEndpoint(endpoint);
    const reviewed = get<HTMLInputElement>("endpoint-reviewed");
    if (resetReview) reviewed.checked = false;
    get("endpoint-status").textContent = !endpoint ? "Enter an endpoint to check workspace access." : enabled ? "Enabled for this workspace. Connect to inspect the server’s actual tools." : role === "owner" ? "Owner approval required. Review and approve the exact endpoint below before connecting." : "Owner approval required. Ask an owner of this workspace to review this endpoint in My Agents.";
    get("endpoint-review").hidden = role !== "owner" || enabled || !endpoint;
    get("endpoint-review-url").textContent = canonical || endpoint;
    const approve = get<HTMLButtonElement>("approve-endpoint"), submit = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
    const connecting = submit.getAttribute("aria-busy") === "true";
    approve.disabled = role !== "owner" || !reviewed.checked || !canonical || enabled || approve.getAttribute("aria-busy") === "true";
    submit.disabled = role === "viewer" || !enabled || connecting;
    renderOAuth();
    submit.textContent = connecting ? "Connecting…" : "Connect server";
    get("connect-readiness").dataset.state = connecting ? "busy" : role === "viewer" || (endpoint && !enabled) ? "blocked" : "ready";
    get("connect-readiness").textContent = connecting ? "Connecting to the server and inspecting its tools. Please wait." : role === "viewer" ? "You have view-only access. Ask a workspace owner or operator to connect this server." : !endpoint ? "Enter an MCP endpoint above to check access." : !enabled ? role === "owner" ? "Connection blocked: this endpoint is not approved. Review its exact URL and select “Approve endpoint for workspace” above." : "Connection blocked: this endpoint is not approved. Ask a workspace owner to approve its exact URL." : "Endpoint access is enabled. Complete the connection details and AI consent above, then select Connect server.";
    doc.querySelectorAll<HTMLButtonElement>("[data-owner-only]").forEach(el => el.disabled = role !== "owner" || el.getAttribute("aria-busy") === "true");
    doc.querySelectorAll<HTMLOptionElement>("#catalog-results option").forEach(el => { el.textContent = `${el.value} — ${endpointEnabled(el.value) ? "enabled" : "owner approval required"}`; });
    doc.querySelectorAll<HTMLElement>("[data-endpoint-access]").forEach(el => { el.textContent = endpointEnabled(el.dataset.endpointAccess || "") ? "Enabled for this workspace" : "Owner approval required"; });
  }
  function renderEndpointApprovals() {
    const container = get("endpoint-approvals"); container.replaceChildren();
    for (const approval of state.endpointAccess?.workspace || []) {
      const row = node("div", "", "connection");
      row.append(node("p", `${approval.endpoint} · approved ${new Date(approval.approvedAt).toLocaleString()} by ${approval.approvedBy}`, "note"));
      const remove = button("Remove workspace approval", async () => {
        const deploymentEnabled = state.endpointAccess.deployment.includes(approval.endpoint);
        if (!runtime.confirm(`Remove workspace approval for ${approval.endpoint}? ${deploymentEnabled ? "Deployment-managed access will remain enabled." : "Affected connections will be disconnected and their agents paused."}`)) return;
        await mutate("remove-endpoint", { endpoint: approval.endpoint }); await refresh(); feedback("connections-feedback", deploymentEnabled ? "Workspace approval removed. Deployment-managed access remains enabled." : "Workspace approval removed. Affected connections and schedules were stopped.");
      });
      remove.dataset.ownerOnly = "true"; row.append(remove); container.append(row);
    }
    if (!container.children.length) container.append(node("p", "No workspace-specific approvals yet.", "empty"));
  }
  function inspectionLabel(report: PrecheckReport): string {
    return report.authentication === "oauth" ? "OAuth discovered · check configured providers below" : report.authentication === "required" ? "Authentication required · type unconfirmed" : report.authentication === "not-observed" ? "Tools listed without authentication" : "Authentication unknown";
  }
  function updatePrecheckButton() {
    const el = get<HTMLButtonElement>("precheck-run");
    el.disabled = inspecting || role === "viewer" || !validInspectionEndpoint(get<HTMLInputElement>("precheck-endpoint").value.trim());
    el.textContent = inspecting ? "Inspecting endpoint…" : "Recheck endpoint";
    if (inspecting) el.setAttribute("aria-busy", "true"); else el.removeAttribute("aria-busy");
  }
  function selectPrecheck(endpoint: string) {
    showMcpView(true); precheckTouched = true;
    get<HTMLInputElement>("precheck-endpoint").value = endpoint;
    updateEndpointAccess(true); renderPrechecks();
  }
  function renderPrechecks() {
    const reports: PrecheckReport[] = state.inspections || [];
    const field = get<HTMLInputElement>("precheck-endpoint");
    if (!precheckTouched && !field.value && reports.length) { const latest = [...reports].sort((a,b) => b.checkedAt.localeCompare(a.checkedAt))[0]; field.value = latest.endpoint; (get<HTMLFormElement>("connect").elements.namedItem("protocol") as HTMLSelectElement).value = latest.requestedProtocol || "2025-03-26"; }
    const endpoint = canonicalEndpoint(field.value.trim());
    get('inspection-target').textContent = field.value ? `Analyzing ${connectionTarget()}` : 'Choose an MCP server to analyze.';
    get('connection-target').textContent = field.value ? `Connecting to ${connectionTarget()}` : 'Choose an MCP server to connect.';
    const report = reports.find(r => r.endpoint === endpoint && (!r.requestedProtocol || r.requestedProtocol === requestedProtocol()));
    const results = get("precheck-results"); results.replaceChildren();
    if (report) {
      results.append(node("h4", inspectionLabel(report)), node("p", `Inspected endpoint: ${report.endpoint}`), node("p", `Observed ${new Date(report.checkedAt).toLocaleString()} · ${report.protocol}. ${recentReport(report) ? "Recent snapshot reused for up to one hour." : "Older snapshot; Recheck for current observations."}`, "note"));
      results.append(node("p", report.visibility === "public-tools" ? `${report.toolCount} public tools inspected. Account-specific tools may differ.` : report.visibility === "authentication-required" ? "Tool visibility: requires authentication. Account-specific behavior is unknown." : "Tool visibility: unavailable or incomplete."));
      for (const provider of report.providers) {
        results.append(node("p", `Authorization provider: ${provider.issuer} · ${provider.verified ? "issuer metadata matched" : "metadata unverified"}`));
        if (provider.authorizationEndpoint) results.append(node("p", `Advertised authorization endpoint: ${provider.authorizationEndpoint}`, "note"));
        if (provider.tokenEndpoint) results.append(node("p", `Advertised token endpoint: ${provider.tokenEndpoint}`, "note"));
      }
      results.append(node("p", `Advertised supported scopes: ${report.scopes.join(", ") || "Not specified"}`, "note"), node("p", `Scopes challenged for this request: ${report.challengedScopes.join(", ") || "Not specified"}`, "note"));
      for (const f of report.findings) { const row = node("div", "", "precheck-finding"); row.dataset.level = f.level; row.append(node("strong", `${f.level === "blocked" ? "Blocked / incomplete" : f.level === "review" ? "Review" : "Observed"}: ${f.title}`), node("p", f.detail, "note")); results.append(row); }
      if (report.tools.length) { const tools = node("details"); tools.append(node("summary", "Inspected tool descriptions (untrusted provider text)")); for (const t of report.tools) tools.append(node("p", `${t.name}: ${t.description} · Inputs: ${t.inputs.join(", ") || "Not declared"}`, "note")); results.append(tools); }
      if(report.readiness) results.append(node('p', `Readiness ruleset ${report.readiness.ruleset} · ${report.readiness.findingCounts.fail + report.readiness.findingCounts.review} findings · behavior untested. Workspace findings stay private.`, 'note'));
      if(report.capabilities?.length) results.append(capabilityDetails(report.capabilities,'Public pre-check without credentials. Connected-account catalogs can differ. Field lists and descriptions are bounded summaries; resources were not inspected.',report.toolCount,true));
      const evidence = node("details"); evidence.append(node("summary", "HTTP evidence")); for (const e of report.evidence) evidence.append(node("p", `${e.status} · ${e.url}`, "note")); results.append(evidence);

    }
    get("precheck-status").dataset.error = "false";
    get("precheck-status").textContent = inspecting ? `Inspecting ${endpoint} without credentials. This may take up to 30 seconds; no tools will be executed.` : report ? "Saved pre-check findings for this exact endpoint. Review the observations and limitations below." : role === "viewer" ? "An owner or operator can run a pre-check. Saved workspace reports are available below." : !field.value ? "Enter an HTTPS endpoint to start an automatic pre-check." : !validInspectionEndpoint(field.value) ? "Enter a public HTTPS URL without credentials, query parameters or fragments. No check has been sent." : "No current findings. Edit the endpoint to check automatically, or select Recheck endpoint.";
    if (precheckError?.endpoint === endpoint && precheckError.protocol === requestedProtocol()) { get("precheck-status").textContent = precheckError.detail; get("precheck-status").dataset.error = "true"; }
    const history = get("precheck-history"); history.replaceChildren();
    for (const r of [...reports].sort((a,b) => b.checkedAt.localeCompare(a.checkedAt))) { const el = node("button", `${inspectionLabel(r)} · ${r.endpoint}`, "secondary") as HTMLButtonElement; el.type = "button"; el.addEventListener("click", () => { clearSelection(); (get<HTMLFormElement>("connect").elements.namedItem("protocol") as HTMLSelectElement).value = r.requestedProtocol || "2025-03-26"; selectPrecheck(r.endpoint); }); history.append(el); }
    if (!reports.length) history.append(node("p", "No saved pre-checks in this workspace.", "note"));
    doc.querySelectorAll<HTMLElement>("[data-inspection-endpoint]").forEach(el => { const r = reports.find(r => r.endpoint === el.dataset.inspectionEndpoint); el.textContent = r ? `${inspectionLabel(r)} · checked ${new Date(r.checkedAt).toLocaleString()}` : "Not pre-checked"; });
    updatePrecheckButton();
  }
  async function runPrecheck(endpoint: string, force = false) {
    cancelScheduledPrecheck();
    if (!tenant || role === "viewer" || !validInspectionEndpoint(endpoint)) return;
    endpoint = canonicalEndpoint(endpoint);
    if (!force && (state.inspections || []).some((r: PrecheckReport) => r.endpoint === endpoint && recentReport(r))) { inspecting = false; renderPrechecks(); return; }
    const current = ++inspectionGeneration, workspaceId = tenant;
    precheckError = undefined; inspecting = true; renderPrechecks();
    try {
      const protocol = requestedProtocol(), key = JSON.stringify([workspaceId, endpoint, protocol]);
      let pending = pendingInspections.get(key);
      if (!pending) {
        pending = request(`/api/agents/${encodeURIComponent(workspaceId)}/inspect-endpoint`, { endpoint, protocol, ...(force ? { force: true } : {}) });
        pendingInspections.set(key, pending!);
        const release = () => { if (pendingInspections.get(key) === pending) pendingInspections.delete(key); };
        void pending!.then(release, release);
      }
      const report = await pending!;
      if (current !== inspectionGeneration || workspaceId !== tenant) return;
      state.inspections = [...(state.inspections || []).filter((r: PrecheckReport) => r.endpoint !== report.endpoint), report];
      inspecting = false; renderPrechecks();
    } catch (error) {
      if (current !== inspectionGeneration || workspaceId !== tenant) return;
      inspecting = false;
      precheckError = { endpoint, protocol: requestedProtocol(), detail: `Pre-check failed: ${error instanceof Error ? error.message : "Unable to inspect this endpoint."} Select Recheck endpoint to retry. Any saved report below is from an earlier check.` };
      renderPrechecks();
    } finally { if (current === inspectionGeneration) updatePrecheckButton(); }
  }
  function clearSelection() {
    cancelScheduledPrecheck(); inspectionGeneration++; inspecting = false; precheckTouched = true; precheckError = undefined;
    get<HTMLFormElement>("connect").reset(); feedback("oauth-feedback", ""); feedback("connect-feedback", ""); feedback("approval-feedback", "");
    get("catalog-selection").textContent = "Already have a server? Enter its HTTPS endpoint below.";
    updateEndpointAccess(true);
  }
  async function searchCatalog(append = false) {
    if (!tenant) return;
    const current = ++catalogGeneration, currentTenant = tenant;
    if (!append) {
      catalogQuery = get<HTMLInputElement>("catalog-query").value.trim();
      catalogCapability = get<HTMLSelectElement>("catalog-capability").value;
      catalogAuth = get<HTMLSelectElement>("catalog-auth").value;
      catalogOffset = null; get("catalog-results").replaceChildren();
    }
    get("catalog-more").hidden = true;
    get("catalog-status").textContent = "Searching the registry catalog…";
    const params = new URLSearchParams({ q: catalogQuery, capability: catalogCapability, auth: catalogAuth, offset: String(append ? catalogOffset || 0 : 0),...(capabilitySetup?{mode:"suggest"}:{}) });
    try {
      const data = await request(`/api/agents/${encodeURIComponent(currentTenant)}/catalog?${params}`) as CatalogResult;
      if (current !== catalogGeneration || currentTenant !== tenant) return;
      if (!capabilityLabels.size) for (const c of data.capabilities) {
        capabilityLabels.set(c.id, c.label);
        const option = node("option", c.label) as HTMLOptionElement; option.value = c.id; get("catalog-capability").append(option);
      }
      if (!authLabels.size) for (const auth of data.authTypes) {
        authLabels.set(auth.id, auth.label);
        const option = node("option", auth.label) as HTMLOptionElement; option.value = auth.id; get("catalog-auth").append(option);
      }
      if(!append) sourceStatus(get("catalog-results"),data);
      for (const server of data.servers) {
        const card = node("article", "", "card");
        card.append(node("span", "Advertised · tools unverified", "pill"), node("h3", server.title), node("p", server.description), node("p", `Publisher namespace: ${server.publisher} · ${server.hosting}`, "note"), node("p", `${server.name} · version ${server.version}`, "note"));
        catalogEvidence(card,server,catalogQuery);
        if (server.capabilities.length) card.append(node("p", `Capabilities: ${server.capabilities.map((id: string) => capabilityLabels.get(id) || id).join(", ")}`, "note"));
        card.append(node("p", `Declared authentication: ${server.authTypes.map(id => authLabels.get(id) || id).join(", ")}`, "note"), node("p", server.setup, "note"));
        if (server.website) {
          // Defense in depth: never render an executable URL from catalog data.
          try { const url = new URL(server.website); if (url.protocol === "https:" && !url.username && !url.password) {
            const link = node("a", "Provider documentation ↗") as HTMLAnchorElement; link.href = url.href; link.target = "_blank"; link.rel = "noopener noreferrer"; card.append(link);
          } } catch { /* Unsupported links are omitted. */ }
        }
        if (server.endpoints.length) {
          const endpointLabel = node("label", "Remote endpoint"), select = doc.createElement("select");
          select.setAttribute("aria-label", `Endpoint for ${server.title}`);
          for (const endpoint of server.endpoints) { const option = node("option", `${endpoint} — ${endpointEnabled(endpoint) ? "enabled" : "owner approval required"}`) as HTMLOptionElement; option.value = endpoint; select.append(option); }
          const accessLabel = node("p", "", "pill");
          accessLabel.dataset.endpointAccess = select.value;
          accessLabel.textContent = endpointEnabled(select.value) ? "Enabled for this workspace" : "Owner approval required";
          select.addEventListener("change", () => { accessLabel.dataset.endpointAccess = select.value; accessLabel.textContent = endpointEnabled(select.value) ? "Enabled for this workspace" : "Owner approval required"; });
          endpointLabel.append(select); card.append(accessLabel, endpointLabel, button("Use this server", async () => {
            if(capabilitySetup && currentPlan?.id===capabilitySetup.planId) await setupCapability(capabilitySetup.stepId,select.value,server.title);else openSetup(select.value, server.title);
          }));
        } else card.append(node("p", "Setup required outside this builder", "pill"));
        const inspectable = server.inspectableEndpoints || server.endpoints;
        for (const endpoint of inspectable) {
          const badge = node("p", "Not pre-checked", "note"); badge.dataset.inspectionEndpoint = endpoint;
          card.append(badge);
          if (!server.endpoints.includes(endpoint)) card.append(button(inspectable.length > 1 ? `Review setup ${endpoint}` : "Review setup", async () => { openSetup(endpoint, server.title, server.setup); }));
        }
        get("catalog-results").append(card);
      }
      renderPrechecks();
      catalogOffset = data.nextOffset; get("catalog-more").hidden = catalogOffset === null;
      get("catalog-status").textContent = `${data.total} matching listings. ${data.notice}${data.updatedAt ? ` Last complete update: ${new Date(data.updatedAt).toLocaleString()}.` : ""}${data.stale ? " Catalog may be out of date." : ""}`;
      if (!data.servers.length && !append) get("catalog-results").append(node("p", data.indexing || data.unavailable ? "Catalog results are not available yet. Search again shortly or enter an endpoint manually." : "No matching servers. Try a service name, broaden the capability or authentication filters, or enter an endpoint manually.", "empty"));
    } catch (error) {
      if (current !== catalogGeneration || currentTenant !== tenant) return;
      get("catalog-status").textContent = error instanceof Error ? error.message : "Registry discovery is unavailable. Add your own MCP server.";
    }
  }
  function message(value: string, error = false) { get("status").textContent = value; get("status").dataset.error = String(error); }
  function node(tag: string, value = "", cls = "") { const el = doc.createElement(tag); el.textContent = value; if (cls) el.className = cls; return el; }
  function button(label: string, action: () => Promise<void>, secondary = true) {
    const el = node("button", label, secondary ? "secondary" : "") as HTMLButtonElement;
    el.type = "button"; el.disabled = role === "viewer";
    el.addEventListener("click", () => perform(el, action)); return el;
  }
  async function request(path: string, body?: any): Promise<any> {
    let response: Response;
    try {
      response = await runtime.fetch(path, { method: body ? "POST" : "GET", credentials: "same-origin", redirect: "manual", headers: body ? { "content-type": "application/json", "x-agentaction-request": "agent-builder" } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch {
      const detail = "Unable to verify your session. Check your connection, then select Sign in to reload this page.";
      sessionUnavailable(detail); throw new Error(detail);
    }
    if (response.status === 401 || response.type === "opaqueredirect" || response.redirected) {
      const detail = "Your session has expired or you are signed out. Select Sign in to continue.";
      sessionUnavailable(detail); throw new Error(detail);
    }
    const value = await response.json();
    if (!response.ok) throw new Error(typeof value.error === "string" ? value.error : value.error?.message || "The request could not be completed.");
    return value;
  }
  async function mutate(action: string, body: any) { return request(`/api/agents/${encodeURIComponent(tenant)}/${action}`, body); }
  async function perform(el: HTMLButtonElement, action: () => Promise<void>, feedbackId?: string) {
    const localFeedback = feedbackId || el.dataset.feedback || (el.closest("#setup-view") ? "connections-feedback" : undefined);
    el.disabled = true; el.setAttribute("aria-busy", "true"); workspace.disabled = true; updateEndpointAccess();
    try { await action(); } catch (error) { const failure = error instanceof Error ? error.message : "Unable to complete the request."; await refresh().catch(() => {}); if (localFeedback && tenant) feedback(localFeedback, localFeedback === 'oauth-feedback' ? `${connectionTarget()}: ${failure}` : failure, true); else message(failure, true); }
    finally { el.removeAttribute("aria-busy"); el.disabled = role === "viewer"; workspace.disabled = !memberships.length; updateEndpointAccess(); }
  }
  async function refresh() {
    const current = ++generation;
    if (!tenant) { get("builder").hidden = true; message("Create or join a workspace in Workspace settings to build an agent."); return; }
    const [data, checks] = await Promise.all([request(`/api/agents/${encodeURIComponent(tenant)}/state`), history.read(tenant, "automations")]);
    if (current !== generation) return;
    state = data; recurring = checks; get("builder").hidden = false; render();
  }
  function connectionTarget() {
    const form = get<HTMLFormElement>('connect');
    const endpoint = (form.elements.namedItem('endpoint') as HTMLInputElement).value.trim();
    const provider = (state.oauthProviders || []).find((p: any) => p.endpoint === endpoint);
    const label = provider?.label || (form.elements.namedItem('label') as HTMLInputElement).value.trim();
    return label ? `${label} · ${endpoint}` : endpoint || 'MCP server';
  }
  function selectOAuthProvider(provider: any) {
    precheckTouched = true;
    const form = get<HTMLFormElement>('connect');
    (form.elements.namedItem('endpoint') as HTMLInputElement).value = provider.endpoint;
    (form.elements.namedItem('label') as HTMLInputElement).value = provider.label;
    renderOAuth(); updateEndpointAccess(); showMcpView(true);
    get('setup-heading').textContent = `Connect ${provider.label}`;
  }
  async function connectOAuth(provider: any, connectionId?: string) {
    if (role !== 'owner') throw new Error('A workspace owner must connect shared OAuth accounts.');
    if (!runtime.confirm(`Share this ${provider.label} account with workspace agents? Owners and operators can use its tools. Access continues if you leave, until an owner disconnects or the provider revokes it. Requested scopes: ${provider.scopes.join(', ') || 'provider defaults'}.`)) return;
    selectOAuthProvider(provider);
    feedback('oauth-feedback', `${connectionTarget()}: Starting authorization…`);
    const result = await mutate('oauth-start', { providerId: provider.id, ...(connectionId ? { connectionId } : {}), shared: true });
    runtime.location.assign(result.authorizationUrl);
  }
  function renderOAuth() {
    const options = get('oauth-options'); options.replaceChildren();
    const endpoint = get<HTMLFormElement>('connect').elements.namedItem('endpoint') as HTMLInputElement;
    const providers = (state.oauthProviders || []).filter((p: any) => p.endpoint === endpoint.value.trim());
    for (const provider of providers) {
      options.append(node('p', `Shared workspace OAuth · ${provider.label} · ${provider.issuer}. Scopes: ${provider.scopes.join(', ') || 'provider defaults'}. Use a dedicated provider account for shared agents.`, 'note'));
      const connect = button(`Connect with ${provider.label}`, async () => connectOAuth(provider));
      connect.dataset.feedback = 'oauth-feedback'; connect.setAttribute('aria-describedby', 'oauth-feedback');
      connect.disabled = role !== 'owner' || !endpointEnabled(provider.endpoint); options.append(connect);
    }
    if (!providers.length) options.append(node('p', 'OAuth is available for providers configured by the deployment owner. Other servers can use public or bearer access.', 'note'));
  }
  function render() {
    renderOAuth();
    renderEndpointApprovals(); renderPrechecks(); renderRecipe(); renderWorkspaceRecipes(); renderDraftConnections();
    showStage(builderStage);
    const connections = get("connections"), suggestions = get("suggestions"), agents = get("agents"), runs = get("runs");
    connections.replaceChildren(); suggestions.replaceChildren(); agents.replaceChildren(); runs.replaceChildren();
    for (const c of state.connections) {
      const row = node("div", "", "connection"), detail = node("div");
      detail.append(
        node("strong", c.label),
        node("p", `Server: ${c.endpoint}`, "note"),
        node("p", `${c.tools.length} discovered tools · ${c.status}`, "note"),
        node("p", c.oauth ? `Shared workspace OAuth · connected by ${c.oauth.connectedBy} · scopes: ${c.oauth.scopes.join(", ")}. Access persists until an owner disconnects or the provider revokes it.` : c.hasCredential ? "Connected account: credential stored" : "Authentication: no stored credential", "note"),
      );
      row.append(detail);
      const cap=capabilityDetails(c.tools,c.catalog ? `Connected server snapshot · ${new Date(c.catalog.capturedAt).toLocaleString()} · ${c.protocol}. ${c.status==='connected'?'This connection is active; permissions remain unverified.':'Disconnected — retained catalog is historical.'}` : 'Older connection snapshot. Refresh capabilities to capture current metadata; discovery completeness is unknown.');
      for(const [key,label] of [['resources','Resources'],['resourceTemplates','Resource templates']]) {
        const surface=c.catalog?.[key];cap.append(node('p',`${label}: ${surface?.status || 'unknown'} · ${surface?.items?.length || 0} retained entries`,'note'));
        for(const item of surface?.items || []) cap.append(node('p',`${item.name || item.uri || item.uriTemplate}: ${item.description || 'No description'}`,'note'));
      }
      cap.append(node('p','Catalog refresh uses the stored credential, executes no tools, and pauses agents using this connection until a new trial.','note'));
      if(c.status==='connected') cap.append(button('Refresh capabilities',async()=>{await mutate('refresh-capabilities',{connectionId:c.id});await refresh();feedback('connections-feedback','Capability catalog refreshed. Connected agents are paused until a new trial.');}));
      detail.append(cap);
      if (c.status === "connected") {
        const actions = node("div", "", "actions");
        actions.append(button("Suggest agents", async () => { feedback("connections-feedback", "AI is finding useful jobs in this server’s tool catalog…"); await mutate("suggest", { connectionId: c.id }); await refresh(); feedback("connections-feedback", "Suggestions are ready. Review a job, its tools and setup requirements."); get<HTMLDetailsElement>("example-library").open = true; runtime.location.hash = "create"; }), button("Disconnect", async () => { if (!runtime.confirm("Disconnect this server, remove the stored credential and pause its agents?")) return; const result = await mutate("disconnect", { connectionId: c.id }); await refresh(); feedback("connections-feedback", result.message || "Disconnected. The credential was removed and its agents were paused."); }));
        if (c.oauth && role !== 'owner') for (const control of Array.from(actions.querySelectorAll('button'))) if (control.textContent === 'Disconnect') (control as HTMLButtonElement).disabled = true;
        row.append(actions);
      }
      if (c.oauth) {
        const provider = (state.oauthProviders || []).find((p: any) => p.id === c.oauth.providerId);
        if (provider) {
          const reconnect = button('Reconnect shared OAuth account', async () => connectOAuth(provider, c.id));
          reconnect.dataset.feedback = 'oauth-feedback';
          reconnect.disabled = role !== 'owner'; detail.append(reconnect);
        }
      } else {
      const credentialLabel = node("label", "Replace credential / reconnect");
      const credential = doc.createElement("input"); credential.type = "password"; credential.autocomplete = "off"; credential.maxLength = 4096; credential.placeholder = "New bearer token (blank for public access)"; credential.disabled = role === "viewer";
      credentialLabel.append(credential);
      const replace = button("Reconnect server", async () => {
        const token = credential.value; credential.value = "";
        feedback("connections-feedback", "Checking the replacement MCP server…");
        await mutate("connect", { connectionId: c.id, token }); await refresh(); feedback("connections-feedback", "Server reconnected. Its agents are paused; run a new trial before reactivation.");
      });
      const replacement = node("details"); replacement.append(node("summary", "MCP server credentials"), credentialLabel, replace); detail.append(replacement);
      }
      connections.append(row);
      for (const s of c.suggestions) {
        const card = node("article", "", "card");
        card.append(node("span", "AI suggested · untested", "pill"), node("h3", s.title), node("p", s.goal), node("p", `Requires: ${s.setup}`, "note"), node("p", `Success: ${s.success}`, "note"), node("p", `Tools: ${s.tools.join(", ")}`, "note"), button("Build this agent", async () => {
          recipeContext(); openEditor(c.id, { ...s, inputGuide: s.setup }, s);
        }, false)); suggestions.append(card);
      }
    }
    if (!connections.children.length) connections.append(node("p", "No MCP servers connected yet.", "empty"));
    get('suggested-examples').hidden = !suggestions.children.length || Boolean(selectedRecipe);
    for (const a of state.agents) {
      const card = node("article", "", "card"), actions = node("div", "", "actions");
      card.append(node("span", a.status, "pill"), node("h3", a.title), node("p", a.goal), node("p", `Success: ${a.success}`, "note"));
      actions.append(button("Run a trial", async () => { message("Planning a trial. No tool executes until you approve its arguments."); await mutate("trial", { agentId: a.id }); await refresh(); message("Trial updated. Review its proposed call or result below."); }));
      const trial = state.runs.find((r: any) => r.id === a.lastTrial);
      if (a.status !== "active" && trial?.status === "completed" && trial.outcome === "met" && (!trial.contract || trial.evaluation?.status === "pass")) actions.append(button("Activate daily", async () => { if (!runtime.confirm("I reviewed the trial result. Start a daily supervised run? Each tool call will still wait for approval.")) return; await mutate("activate", { agentId: a.id, reviewed: true }); await refresh(); message("Daily supervised schedule activated."); }));
      if (a.status !== "paused") actions.append(button("Pause", async () => { await mutate("pause", { agentId: a.id }); await refresh(); message("Agent paused. Pending calls were cancelled."); }));
      if (a.definition) {
        const detail = node('details'); detail.append(node('summary', 'Agent definition'), node('p', a.workspaceRecipe ? `Agent template · v${a.workspaceRecipe.version}` : 'Custom definition · pinned to this agent', 'note'));
        for (const [label, value] of [['Inputs needed', a.definition.inputGuide], ['Instructions', a.definition.instructions], ['Boundaries', a.definition.boundaries], ['Allowed tools', a.definition.tools.map((t:string)=>a.definition.toolLabels?.[t] || t).join(', ')]]) if (value) detail.append(node('strong', label), node('p', value, 'note'));
        detail.append(node('p', 'Success is AI-assessed. Written boundaries guide the AI; measurable checks evaluate recorded evidence.', 'note')); card.append(detail);
      }
      if (a.recipe) card.append(node("p", `Based on agent template: ${a.recipe.id} · v${a.recipe.version}`, "note"));
      const latest = state.runs.filter((r: any) => r.agentId === a.id).sort((a: any, b: any) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
      card.append(node("p", `Last run: ${latest ? new Date(latest.startedAt).toLocaleString() + " · " + latest.status.replaceAll("_", " ") : "Not yet"} · Next proposal: ${a.status === "active" && a.nextRun ? new Date(a.nextRun).toLocaleString() : "Not scheduled"}`, "note"));
      if (latest?.summary) card.append(node("p", latest.summary));
      card.append(actions); agents.append(card);
    }
    history.appendAgents(agents, recurring, tenant);
    if (!agents.children.length) agents.append(node("p", "Choose an agent template or an AI suggestion in Create to build your first agent.", "empty"));
    for (const r of state.runs) {
      const a=state.agents.find((a:any)=>a.id===r.agentId);
      const card = node("article", "", "card run"), heading = node("div", "", "run-heading");
      card.dataset.runAt = String(new Date(r.startedAt).getTime());
      if (r.pending) card.dataset.pendingApproval = "true";
      heading.append(node("h3", state.agents.find((a: any) => a.id === r.agentId)?.title || "Agent run"), node("span", r.status.replaceAll("_", " "), "pill"));
      card.append(heading, node("p", `${r.kind} · ${new Date(r.startedAt).toLocaleString()} · ${r.events.length}/4 tool calls · ${r.tokens || "unreported"} model tokens`, "note"));
      if (r.summary) card.append(node("p", r.summary));
      history.appendEvaluation(card, r);
      if (r.outcome) card.append(node("p", `AI-assessed outcome: ${r.outcome.replaceAll("_", " ")}. ${r.reason || ""}`, "note"));
      for (const event of r.events) {
        const detail = node("details"); detail.append(node("summary", `${event.source?.tool || event.tool}${event.source ? " · " + (state.connections.find((c:any)=>c.id===event.source.connectionId)?.label || event.source.connectionId) : ""} · ${event.status}${event.durationMs !== undefined ? ` · ${event.durationMs} ms` : ""}`), node("pre", JSON.stringify({ source: event.source, arguments: event.arguments, result: event.result }, null, 2))); card.append(detail);
      }
      if (r.pending) {
        const approval = node("div", "", "approval"), actions = node("div", "", "actions");
        approval.append(node("strong", `Approve tool call: ${a?.toolBindings?.[r.pending.tool]?.tool || r.pending.tool}`), node("p", `MCP server: ${state.connections.find((c:any)=>c.id===(a?.toolBindings?.[r.pending.tool]?.connectionId || a?.connectionId))?.label || "unavailable"}. Review the exact arguments before approval.`, "note"), node("pre", JSON.stringify(r.pending.arguments, null, 2)));
        const edit = doc.createElement("textarea"); edit.rows = 5; edit.value = JSON.stringify(r.pending.arguments, null, 2); edit.setAttribute("aria-label", "Revised tool arguments"); edit.disabled = role === "viewer";
        const advanced = node("details"); advanced.append(node("summary", "Adjust tool arguments"), node("p", "AI proposals use required inputs and provider defaults. Add optional settings here when needed, then save and review the revised call before approving.", "note"), edit, button("Save revised call", async () => { const args = JSON.parse(edit.value); await mutate("revise", { runId: r.id, approvalId: r.pending.id, arguments: args }); await refresh(); message("Proposal revised. Review the saved arguments before approving execution."); })); approval.append(advanced);
        actions.append(button("Approve and execute", async () => { message("Executing the approved call and assessing the next step…"); await mutate("approve", { runId: r.id, approvalId: r.pending.id }); await refresh(); message("Run updated. Review the execution evidence and any next proposal."); }, false), button("Cancel run", async () => { await mutate("cancel", { runId: r.id }); await refresh(); message("Run cancelled."); })); approval.append(actions); card.append(approval);
      }
      runs.append(card);
    }
    history.appendRuns(runs, recurring, tenant); history.sortRuns(runs);
    if (!runs.children.length) runs.append(node("p", "Trial and scheduled runs will appear here with their execution history.", "empty"));
    get<HTMLFormElement>("connect").querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>("input,button,select").forEach(el => el.disabled = role === "viewer" && !el.closest("#precheck-history"));
    updateEndpointAccess();
  }
  get('account-login').addEventListener('click', event => { event.preventDefault(); runtime.location.reload(); });
  for(const [id,custom] of [['plan-browse',false],['plan-custom',true]] as const) get<HTMLButtonElement>(id).onclick=event=>{
    const selectedTenant=tenant,editor=editorGeneration;
    void perform(event.currentTarget as HTMLButtonElement,async()=>{
      await savePlan(); if(selectedTenant!==tenant || editor!==editorGeneration) return;
      capabilitySetup=undefined;get('recipe-return').querySelector('a')!.textContent='← Continue agent setup';runtime.location.hash='connect';showStage('connect');
      if(custom) openSetup(''); else {showMcpView(false);await searchCatalog();}
    });
  };
  get('profile-request').addEventListener('input', () => {
    profileGeneration++; get('agent-ideas').replaceChildren();
    feedback('profile-feedback',get('suggest-ideas').hasAttribute('aria-busy') ? 'Details changed. Suggest again when this request finishes.' : '');
  });
  get<HTMLFormElement>('profile-request').addEventListener('submit', event => {
    event.preventDefault(); if(role === 'viewer') return;
    const current = ++profileGeneration, currentTenant = tenant, currentEditor = editorGeneration, currentDraft = draftGeneration;
    const area = get<HTMLInputElement>('profile-area').value.trim(), context = get<HTMLInputElement>('profile-context').value.trim();
    const isCurrent = () => current === profileGeneration && currentTenant === tenant && currentEditor === editorGeneration && currentDraft === draftGeneration;
    void perform(get<HTMLButtonElement>('suggest-ideas'), async () => {
      get('agent-ideas').replaceChildren(); feedback('profile-feedback','Finding useful agents for your area…');
      let result: {ideas:AgentIdea[]};
      try { result = await mutate('profile-agents',{area,context}); }
      catch(error) {
        if(isCurrent()) feedback('profile-feedback',(error instanceof Error ? error.message : 'Suggestions unavailable.') + ' Try again or describe your own job above.',true);
        return;
      }
      if(!isCurrent()) return;
      for(const idea of result.ideas) {
        const card=node('article','','card'); card.append(node('h3',idea.title),node('p',idea.benefit),node('p',idea.description));
        for(const capability of idea.capabilities) {
          card.append(node('p',`Capability: ${capability.label}`,'note'));
        }
        const actions=node('div','','actions'); actions.append(button('Use this idea',async()=>{
          if(role==='viewer' || current!==profileGeneration || currentTenant!==tenant) return;
          const input=get<HTMLTextAreaElement>('job-description'); input.value=idea.description;
          input.dispatchEvent(new Event('input',{bubbles:true}));
          get<HTMLDetailsElement>('agent-profiler').open=false;
          feedback('draft-feedback','Idea added. Edit the job description, then select Draft my agent.');
          input.focus();
        })); card.append(actions); get('agent-ideas').append(card);
      }
      feedback('profile-feedback','Choose a starting point. You’ll choose its tools when drafting.');
    },'profile-feedback').finally(renderDraftConnections);
  });
  get("browse-servers").addEventListener("click", () => showMcpView(false));
  get("back-to-results").addEventListener("click", () => showMcpView(false));
  get("manage-connections").addEventListener("click", () => showMcpView(true));
  get<HTMLFormElement>("connect").querySelector<HTMLSelectElement>("[name=protocol]")!.addEventListener("change", schedulePrecheck);
  get("endpoint-reviewed").addEventListener("change", () => updateEndpointAccess());
  get<HTMLButtonElement>("approve-endpoint").addEventListener("click", event => {
    const form = get<HTMLFormElement>("connect"), endpoint = canonicalEndpoint((form.elements.namedItem("endpoint") as HTMLInputElement).value);
    if (role !== "owner" || !get<HTMLInputElement>("endpoint-reviewed").checked) return;
    void perform(event.currentTarget as HTMLButtonElement, async () => {
      feedback("approval-feedback", "Validating the public endpoint and saving workspace approval…");
      await mutate("approve-endpoint", { endpoint, reviewed: true });
      await refresh(); updateEndpointAccess(true); feedback("approval-feedback", "Endpoint approved for this workspace. Enter any required credential and connect when ready.");
    }, "approval-feedback");
  });
  get<HTMLInputElement>("precheck-endpoint").addEventListener("input", schedulePrecheck);
  get<HTMLButtonElement>("precheck-run").addEventListener("click", () => { void runPrecheck(get<HTMLInputElement>("precheck-endpoint").value.trim(), true); });
  get<HTMLFormElement>("catalog-search").addEventListener("submit", event => { event.preventDefault(); void searchCatalog(); });
  get("catalog-more").addEventListener("click", () => { void searchCatalog(true); });
  get("manual-connect").addEventListener("click", () => openSetup(""));
  get<HTMLFormElement>("connect").addEventListener("submit", event => {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement, data = new FormData(form), submit = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
    const payload = { label: data.get("label"), endpoint: data.get("endpoint"), token: data.get("token"), protocol: data.get("protocol") };
    (form.elements.namedItem("token") as HTMLInputElement).value = "";
    void perform(submit, async () => {
      feedback("connect-feedback", `Connecting to ${connectionTarget()} and discovering its tools…`);
      let connected:{connectionId:string};const origin=capabilitySetup;
      try { connected=await mutate("connect", payload); } finally { payload.token = null; }
      if(origin && origin===capabilitySetup && origin.tenant===tenant && origin.planId===currentPlan?.id) origin.connectionId=connected.connectionId;
      await refresh();feedback("connect-feedback", `${connectionTarget()}: MCP server connected. Its tools are now available for your agent.`);
      if (selectedRecipe || currentPlan) {
        if(currentPlan) renderMappings();runtime.location.hash="create";showStage("create");
        message("Server connected. Review the tool mappings in your agent setup.");
        if(capabilitySetup?.connectionId) {
          const target=[...doc.querySelectorAll<HTMLElement>("[data-capability-step]")].find(el=>el.dataset.capabilityStep===capabilitySetup!.stepId);
          target?.scrollIntoView({block:"start"});
        }
      }
    }, "connect-feedback");
  });
  get<HTMLButtonElement>('start-scratch').onclick = () => { const description = get<HTMLTextAreaElement>('job-description').value; const connections = state.connections.filter((c: any) => c.status === 'connected'); recipeContext(); openEditor(connections.length === 1 ? connections[0].id : '', {}); editorField('setup').value = description; };
  get<HTMLSelectElement>('editor-connection').onchange = () => {
    if (!chosen) return;
    const selected = [...doc.querySelectorAll<HTMLInputElement>('#tool-options input:checked')].map(input => input.value); chosen.connectionId = get<HTMLSelectElement>('editor-connection').value; editorTools(selected); updateEvalTools(); updateDraftPreview();
  };
  get('tool-options').addEventListener('change', updateEvalTools);
  get('eval-enabled').addEventListener('change', updateEvalEditor);
  get<HTMLButtonElement>('add-eval-check').onclick = () => addEvalCheck();
  for (const [id, duplicate] of [['save-recipe', false], ['duplicate-recipe', true]] as const) get<HTMLButtonElement>(id).onclick = event => {
    if (role === 'viewer' || !chosen) return;
    void perform(event.currentTarget as HTMLButtonElement, () => saveEditorRecipe(duplicate), 'recipe-save-status');
  };
  get<HTMLFormElement>('draft-request').addEventListener('input', () => { draftGeneration++; if(get('suggest-ideas').hasAttribute('aria-busy')) feedback('profile-feedback','Job details changed. Suggest again when this request finishes.'); if (get('generate-draft').hasAttribute('aria-busy')) feedback('draft-feedback', 'Job details changed. Draft again when this request finishes.'); });
  get<HTMLFormElement>('draft-request').addEventListener('submit', event => {
    event.preventDefault(); if (role === 'viewer') return;
    const current = ++draftGeneration, currentTenant = tenant, currentEditor = editorGeneration;
    const description = get<HTMLTextAreaElement>('job-description').value.trim();
    const button = get<HTMLButtonElement>('generate-draft');
    void perform(button, async () => {
      feedback('draft-feedback', 'Preparing a draft from your job and connected tools…');
      let draft: AgentPlan;
      try { draft = await mutate('draft', { description }); }
      catch (error) {
        if (current !== draftGeneration || tenant !== currentTenant || currentEditor !== editorGeneration) return;
        feedback('draft-feedback', (error instanceof Error ? error.message : 'Draft generation failed.') + ' You can try again or use Start from scratch below.', true); return;
      }
      if (current !== draftGeneration || tenant !== currentTenant || currentEditor !== editorGeneration) return;
      openPlan(draft); state.drafts=[...(state.drafts || []),draft]; renderDraftConnections();
      editorField('setup').value = description;
      get('editor-source').textContent = 'AI-drafted · untested. Review the suggested result and tools. Written boundaries guide the model; mapped tool scope, approval and the call limit are enforced.';
      feedback('draft-feedback', 'Draft ready. Review it below.'); updateDraftPreview();
    }, 'draft-feedback').finally(renderDraftConnections);
  });
  get<HTMLFormElement>('create').addEventListener('input', () => { draftGeneration++; updateDraftPreview(); });
  get<HTMLFormElement>('create').addEventListener('change', () => { draftGeneration++; updateDraftPreview(); });
  get<HTMLFormElement>('create').addEventListener('invalid', event => {
    const fieldEditor=(event.target as HTMLElement).closest<HTMLDetailsElement>('.field-check-editor');if(fieldEditor) fieldEditor.open=true;
    if ((event.target as HTMLElement).closest('#draft-customize')) get<HTMLDetailsElement>('draft-customize').open = true;
  }, true);
  get<HTMLFormElement>("create").addEventListener("submit", event => {
    event.preventDefault(); if (!chosen || role === 'viewer' || creating) return;
    const startTrial = (event as SubmitEvent).submitter?.id === 'review-first-action';
    const submit = get<HTMLButtonElement>(startTrial ? 'review-first-action' : 'create-agent');
    const currentTenant = tenant, currentEditor = editorGeneration;
    creating = true;
    void perform(submit, async () => {
      const definition = definitionFromEditor();
      const binding = editorRecipe && JSON.stringify(definition) === JSON.stringify(editorRecipe.definition) ? { workspaceRecipe: { id: editorRecipe.id, version: editorRecipe.version } } : { definition, ...(chosen!.suggestion.recipeId ? { recipeId: chosen!.suggestion.recipeId, recipeVersion: chosen!.suggestion.recipeVersion, recipeReviewed: true } : {}) };
      if(currentPlan && !startTrial) { await savePlan(); message('Agent draft saved. Continue setup whenever you are ready.'); return; }
      const created = currentPlan ? await mutate('create-bound',{id:currentPlan.id,definition,bindings:selectedBindings(),setup:jobInputs(),fieldChecks:currentPlan.fieldChecks || {}}) : await mutate('create', { connectionId: chosen!.connectionId, ...binding, setup: jobInputs() });
      if (tenant !== currentTenant || editorGeneration !== currentEditor) return;
      recipeContext(); runtime.location.hash = 'run'; showStage('run'); await refresh();
      if (tenant !== currentTenant) return;
      if (!startTrial) { message('Agent instance created. Run a trial to review its first action.'); return; }
      message('Draft created. Planning the first action; no tool executes without approval.');
      try { await mutate('trial', { agentId: created.agentId }); }
      catch (error) { if (tenant !== currentTenant) return; await refresh(); message('Your agent was created, but its trial could not start. Retry from My agents. ' + (error instanceof Error ? error.message : ''), true); return; }
      if (tenant !== currentTenant) return;
      await refresh(); message('First trial planned. Review its proposed action or result below.');
    }).finally(() => { creating = false; updateMappingStatus(); });
  });
  get<HTMLButtonElement>("refresh").addEventListener("click", () => { void refresh().catch(e => message(e.message, true)); });
  workspace.addEventListener("change", () => { cancelScheduledPrecheck(); showMcpView(false); feedback("connections-feedback", ""); feedback("oauth-feedback", ""); get("builder").hidden = true; catalogGeneration++; inspectionGeneration++; inspecting = false; precheckTouched = false; get<HTMLInputElement>("precheck-endpoint").value = ""; catalogOffset = null; get("catalog-results").replaceChildren(); get("catalog-more").hidden = true; get("catalog-status").textContent = "Search MCP directories by name or capability."; state = { connections: [], agents: [], runs: [], workspaceRecipes: [] }; editorRecipe = undefined; editorGeneration++; resetDraft(); get("tool-options").replaceChildren(); get("editor-connection").replaceChildren(); get("eval-checks").replaceChildren(); get("recipe-save-status").textContent = ""; clearSelection(); tenant = workspace.value; role = memberships.find(m => m.tenant.tenant_id === tenant)?.membership.role || "viewer"; renderAccountRole(); chosen = undefined; get("configure").hidden = true; get<HTMLFormElement>("create").reset(); get<HTMLFormElement>("connect").reset(); void refresh().then(() => message(`Workspace ready · ${role}`)).catch(e => message(e.message, true)); });
  get('recipe-browser').replaceChildren(...recipeCatalog.map(recipe => {
    const card = node('article', '', 'card'); card.append(node('h3', recipe.title), node('p', recipe.summary), node('p', recipe.servers.map(server => server.name).join(' + '), 'note'));
    const use = node('button', 'Use this template') as HTMLButtonElement; use.type = 'button'; use.onclick = () => { recipeContext(recipe); get('recipe-detail').scrollIntoView({ behavior: 'smooth', block: 'start' }); }; card.append(use); return card;
  }));
  const query = new URLSearchParams(runtime.location.search);
  if (query.has('recipe')) {
    selectedRecipe = query.getAll('recipe').length === 1 && query.getAll('recipe_version').length === 1 ? recipeCatalog.find(recipe => recipe.id === query.get('recipe') && recipe.version === query.get('recipe_version')) : undefined;
    if (!selectedRecipe) { get<HTMLDetailsElement>('example-library').open = true; get('recipe-error').hidden = false; get('recipe-error').textContent = 'This agent template version is unavailable. Choose a current template below; no draft has been created.'; }
  }
  showStage(query.has('recipe') && !['connect','run'].includes(runtime.location.hash.slice(1)) ? 'create' : runtime.location.hash.slice(1));
  void (async () => {
    try {
      const session = await request("/api/console/session"); memberships = session.memberships || [];
      get("account-identity").textContent = session.email || session.subject || "Authenticated account";
      get("account-logout").hidden = false; get("account-login").hidden = true;
      workspace.disabled = !memberships.length;
      for (const entry of memberships) { const option = node("option", entry.tenant.display_name || entry.tenant.tenant_id) as HTMLOptionElement; option.value = entry.tenant.tenant_id; workspace.append(option); }
      const preferred = new URLSearchParams(runtime.location.search).get("workspace");
      tenant = memberships.some(m => m.tenant.tenant_id === preferred) ? preferred! : session.tenant_id || workspace.value; workspace.value = tenant;
      role = memberships.find(m => m.tenant.tenant_id === tenant)?.membership.role || "viewer";
      renderAccountRole(); await refresh(); if (tenant) void searchCatalog();
      const callback = new URL(runtime.location.href), outcome = callback.searchParams.get('oauth');
      const reasons: Record<string, string> = {
        authorization: 'OAuth authorization expired, was declined, or no longer matches this owner and configuration. Start a new connection.',
        exchange: 'The provider token exchange failed. Start a new connection; if it repeats, check the registered client and callback configuration.',
        response: 'The provider returned an unsupported token response or different scopes. Check provider compatibility before reconnecting.',
        discovery: 'OAuth authorization succeeded, but MCP tool discovery failed. Check server compatibility and account access, then reconnect.',
        owner: 'OAuth requires an active owner session in the same workspace. Sign in as the owner who started the connection and reconnect.',
      };
      const provider = (state.oauthProviders || []).find((p: any) => p.id === callback.searchParams.get('oauth_provider'));
      const reason = callback.searchParams.get('oauth_failure') || '';
      const failure = Object.hasOwn(reasons, reason) ? reasons[reason] : 'OAuth callback failed or expired. Start a new connection and check provider configuration if it repeats.';
      callback.searchParams.delete('oauth_provider');
      callback.searchParams.delete('oauth_failure');
      callback.searchParams.delete('oauth'); runtime.history.replaceState(null, '', callback.pathname + callback.search + callback.hash);
      if (outcome) { if (provider) selectOAuthProvider(provider); else showMcpView(true); feedback('oauth-feedback', `${provider ? connectionTarget() : 'OAuth connection'}: ${outcome === 'connected' ? 'Connected for shared workspace agents. Review discovered tools and run a trial before activation.' : failure}`, outcome !== 'connected'); get('oauth-feedback').focus(); message(`Workspace ready · ${role}`); }
      else if (tenant) message(`Workspace ready · ${role}`);
    } catch (error) { message(error instanceof Error ? error.message : "Unable to load the workspace.", true); }
  })();
}
export const AGENT_JS = `(${agentBuilderApp.toString()})(window, ${JSON.stringify(recipes).replace(/</g, "\\u003c")}, ${HISTORY_FACTORY_JS}, ${CAPABILITY_FACTORY_JS}, ${MATCHING_FACTORY_JS});`;
