import type { RecipeCheck, RecipeEval } from "./recipe-evaluation.ts";
import type { RecipeDefinition, RecipeRevision } from "./workspace-recipes.ts";
import { agentHistory, HISTORY_CSS, HISTORY_FACTORY_JS, EXECUTION_CSS } from "./agent-history.ts";
import { recipes, type Recipe } from "../../recipes/registry.ts";
import { JOURNEY_NAV } from "./journey.ts";
import type { PrecheckReport } from "./mcp-precheck.ts";
import type { CatalogResult } from "./mcp-registry.ts";

export const AGENT_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AgentAction — Connect, Create, Run</title><link rel="icon" type="image/png" href="/favicon.png"><link rel="stylesheet" href="/assets/agents.css"><script src="/assets/journey.js" defer></script><script src="/assets/agents.js" defer></script></head><body>
<header><a class="brand" href="/#overview">AgentAction</a><section class="account" aria-label="Signed-in account"><p class="note">Signed in as <strong id="account-identity">Checking session…</strong></p><p class="note">Workspace role: <strong id="account-role">Checking…</strong></p><div class="actions"><a id="account-logout" href="/cdn-cgi/access/logout" hidden>Log out</a><a id="account-login" href="/agents">Sign in</a><a href="/#setup" data-workspace-link>Workspace settings</a></div><p id="account-help" class="note">To switch accounts, log out and return to this page to sign in. Your role is assigned by a workspace owner.</p></section></header>
<div class="builder-layout">${JOURNEY_NAV}<main><div class="heading"><div><p class="eyebrow" id="stage-label">01 / Connect</p><h1 id="stage-title">Connect your tools.</h1><p class="lede" id="stage-description">Find a server, review its capabilities, and connect the server your agent will use. Add account credentials only when required.</p></div><label class="workspace">Workspace<select id="workspace" aria-label="Workspace"></select></label></div>
<p id="status" role="status" aria-live="polite">Loading your workspace…</p>
<p id="recipe-return" hidden><a href="#create">← Continue with your selected recipe</a></p><div id="builder" hidden>
<section class="panel" data-builder-stage="connect"><div class="section-heading"><h2>MCP servers</h2><span>Server-side credentials · supervised execution</span></div>
<div class="actions mcp-navigation" aria-label="MCP views"><button id="browse-servers" type="button" aria-pressed="true" aria-controls="catalog-view">Browse servers</button><button id="manage-connections" type="button" class="secondary" aria-pressed="false" aria-controls="setup-view">MCP connections</button></div>
<div id="catalog-view"><form id="catalog-search" role="search"><div class="fields catalog-filters"><label>What do you want your agent to do?<input id="catalog-query" name="q" type="search" maxlength="200" placeholder="Try send emails, query a database, or a service name"></label><label>Capability<select id="catalog-capability" name="capability"><option value="">All capabilities</option></select></label><label>Authentication<select id="catalog-auth" name="auth" aria-describedby="catalog-auth-help"><option value="">All authentication types</option></select></label></div><p id="catalog-auth-help" class="note">Authentication labels reflect declared headers or package inputs, including optional credentials. Not specified does not mean no authentication. Check provider documentation for OAuth, pricing and requirements for your chosen deployment.</p><div class="actions"><button type="submit">Search registry</button><button id="manual-connect" type="button" class="secondary">Enter an endpoint manually</button></div></form>
<p id="catalog-status" class="note" role="status" aria-live="polite">Search the official MCP Registry. Capabilities are advertised; connect to inspect actual tools.</p><div id="catalog-results" class="grid" aria-label="MCP server search results"></div><button id="catalog-more" type="button" class="secondary" hidden>Show more servers</button>
</div><div id="setup-view" hidden><button id="back-to-results" type="button" class="secondary">← Back to results</button>
<div id="connection-details"><h3 tabindex="-1" id="setup-heading">MCP connection setup</h3><p id="catalog-selection" class="note">Enter a server’s HTTPS endpoint to start an automatic pre-check.</p>
<form id="connect"><div class="fields setup-fields"><label>Connection name<input name="label" maxlength="100" placeholder="My Firecrawl" required></label><label>MCP endpoint<input id="precheck-endpoint" name="endpoint" type="url" maxlength="2048" placeholder="https://mcp.example.com/mcp" required aria-describedby="precheck-status"></label><label>Protocol<select name="protocol"><option value="2025-03-26">Session-based MCP (2025)</option><option value="2026-07-28">Stateless MCP (2026-07-28)</option></select></label></div>
<div class="setup-columns"><section id="endpoint-precheck" class="precheck-panel" aria-label="Endpoint pre-check"><h3>Pre-check findings</h3><p class="note">Runs automatically for the endpoint you choose. No AI, credentials or tool execution. Recent results are reused for one hour; Recheck requests fresh observations. Up to 30 new checks per workspace per day.</p><p id="precheck-status" role="status" aria-live="polite">Enter an HTTPS endpoint to start.</p><button id="precheck-run" type="button" class="secondary">Recheck endpoint</button><div id="precheck-results" aria-live="polite"></div><details><summary>Recent workspace pre-checks</summary><div id="precheck-history"></div></details></section>
<div class="connection-access"><h3>Approve and connect</h3><p class="note">Review the findings before sharing credentials. A pre-check does not approve an endpoint or certify a provider as safe.</p>
<p id="endpoint-status" class="note" role="status" aria-live="polite">Enter an endpoint to check workspace access.</p>
<div id="endpoint-review" hidden><p class="note">Approve this exact destination for this workspace. Connecting later can send your supplied credentials, job inputs and tool arguments to this server.</p><p id="endpoint-review-url" class="note"></p><label class="consent"><input id="endpoint-reviewed" type="checkbox"> I reviewed this URL and approve it as a destination for this workspace.</label><button id="approve-endpoint" type="button" class="secondary" disabled>Approve endpoint for workspace</button></div><p id="approval-feedback" class="action-feedback" role="status" aria-live="polite" hidden></p>
<p class="note">Public HTTPS endpoints require workspace-owner approval or deployment-managed access. Local stdio and OAuth-only connections are not supported yet.</p>
<label>Bearer token <span class="muted">optional for public servers</span><input name="token" type="password" autocomplete="off" maxlength="4096"></label>
<label class="consent"><input type="checkbox" name="consent" required> Use AI to suggest and run agents. Tool descriptions, job inputs and tool results are sent to the configured AI model. The bearer token stays server-side and is excluded from model prompts.</label>
<p id="connect-readiness" class="note" role="status">Enter an MCP endpoint above to check access.</p><button type="submit" aria-describedby="connect-readiness">Connect server</button><p id="connect-feedback" class="action-feedback" role="status" aria-live="polite" hidden></p></div></div></form><details><summary>Workspace endpoint approvals</summary><p class="note">Owners can remove workspace approvals. Removing access disconnects affected accounts and pauses their agents unless the endpoint is also enabled by the deployment.</p><div id="endpoint-approvals"></div></details></div><h3>Connected MCP servers</h3><p id="connections-feedback" class="action-feedback" role="status" aria-live="polite" hidden></p><div id="connections" class="connections"></div></div></section>
<section class="panel" data-builder-stage="create" hidden><div class="stage-tabs"><a id="choose-recipe" href="#recipe-browser">Choose a recipe</a><a id="choose-custom" href="#create-connections">Build with your servers</a></div><div class="section-heading"><div><h2>Start with a recipe</h2><p class="note">Use a starting point or define your own job.</p></div><button id="start-scratch" type="button">Start from scratch</button></div><section aria-label="Workspace recipes"><h3>Your workspace recipes</h3><div id="workspace-recipes" class="grid"></div></section><p class="note">Choose a job, review its requirements, and make it your own. You can connect the tools it needs along the way.</p><p id="recipe-error" role="status" hidden></p><div id="recipe-browser" class="grid"></div><section id="recipe-detail" class="card" aria-label="Selected recipe" hidden></section><div id="custom-builder"><h2 class="recipe-suggestions-title">Build with your servers</h2><div id="create-connections" class="connections"></div><div class="section-heading"><h2>Discover useful agents</h2><span>AI suggestions based on discovered tools</span></div><div id="suggestions" class="grid"><p class="empty">Connect a server, then choose “Suggest agents.”</p></div></div></section>
<section id="configure" class="panel" data-builder-stage="create" hidden><h2>Define your agent</h2><p id="editor-source" class="note"></p><form id="create">
<div class="fields"><label>Agent / recipe name<input name="title" maxlength="120" required></label><label>Connected server<select id="editor-connection" required></select></label></div>
<label>What should it do?<textarea name="goal" maxlength="2000" rows="3" required></textarea></label>
<label>Inputs this recipe needs<textarea name="inputGuide" maxlength="1000" rows="2" placeholder="Describe the inputs to supply each time, such as a target URL and reporting period."></textarea></label>
<fieldset id="editor-tools"><legend>Allowed tools · choose up to four</legend><div id="tool-options" class="fields"></div></fieldset>
<div class="fields"><label>Instructions<textarea name="instructions" maxlength="2000" rows="4" placeholder="Steps the agent should follow."></textarea></label><label>Boundaries<textarea name="boundaries" maxlength="1500" rows="4" placeholder="Scope and actions the agent should avoid."></textarea></label></div>
<label>What counts as success?<textarea name="success" maxlength="2000" rows="3" required></textarea></label>
<p id="selected-tools" class="note">The success text guides the AI assessment. Measurable checks below evaluate recorded evidence separately.</p>
<label class="consent"><input id="eval-enabled" type="checkbox"><span>Bind a contract and measurable checks to each run</span></label>
<fieldset id="eval-editor"><legend>Measurable checks</legend><p class="note">Every bound run checks completion, at least one successful call, selected-tool scope, recorded approval and the four-call limit. All checks must pass. Written boundaries remain instructions to the agent.</p><div id="eval-checks"></div><button type="button" id="add-eval-check" class="secondary">Add a check</button><p class="note">Result fields come from the latest call to the named tool, under MCP structuredContent. Missing, truncated or plain-text evidence is inconclusive. Provider-reported fields are not independently verified.</p></fieldset>
<div class="actions"><button id="save-recipe" type="button" class="secondary">Save workspace recipe</button><button id="duplicate-recipe" type="button" class="secondary" hidden>Save as new recipe</button></div><p id="recipe-save-status" class="note" role="status" aria-live="polite"></p>
<div class="instance-inputs"><h3>Inputs for this agent</h3><label>Your job inputs<textarea name="setup" maxlength="4000" rows="4" required placeholder="Add target URLs, resources, scope and any other inputs the agent needs."></textarea></label><p id="setup-hint" class="note">These inputs are saved only with this agent, never automatically copied to the reusable recipe.</p><p class="note">The instance starts as a draft. Every proposed tool call requires your approval of its exact arguments. One server and up to four tool calls per run.</p><button id="create-agent" type="submit">Create agent instance</button></div></form></section>
<section class="panel" data-builder-stage="run" hidden><div class="section-heading"><h2>My agents</h2><button id="refresh" class="secondary" type="button">Refresh</button></div><div id="agents" class="grid"></div></section>
<section class="panel" data-builder-stage="run" hidden><div class="section-heading"><h2>Runs &amp; approvals</h2><span>Execution evidence and AI assessments shown separately</span></div><p class="note">Runs stay in this workspace. Tool results may contain account data and are visible to workspace members. Showing the latest 40 retained runs across agents, plus pending approvals. Recurring checks report monitoring observations, not signed Jobs. Supervised history retains trials needed by active instances. Token totals are reported when the model supplies usage; provider charges are not estimated.</p><div id="runs"></div></section>
</div><a class="stage-continue" id="stage-next" href="#create">Next: create an agent →</a></main></div></body></html>`;
export const AGENT_CSS = HISTORY_CSS + EXECUTION_CSS + `:root{font-family:Arial,Helvetica,sans-serif;color:#171b15;background:#f5f5ee;line-height:1.5}*{box-sizing:border-box}body{margin:0}header{padding:22px 4vw;border-bottom:1px solid #cbd0c4;display:flex;justify-content:space-between;gap:24px;align-items:center}a{color:inherit}.account{max-width:360px;min-width:0;overflow-wrap:anywhere}.account p{margin:0 0 6px}.account .actions{margin:8px 0}.account .actions a{font-size:14px;font-weight:600}.account strong{color:#171b15}nav{display:flex;gap:24px;flex-wrap:wrap;font-size:14px}.brand{font-size:24px;font-weight:800;text-decoration:none}.brand span{font-size:16px;font-weight:400}main{max-width:1280px;margin:auto;padding:48px 4vw}h1{font-size:clamp(32px,4.5vw,56px);line-height:1.05;letter-spacing:-2px;max-width:780px;margin:12px 0 20px}h2{font-size:24px;letter-spacing:-.5px;margin:0 0 12px}h3{font-size:20px;line-height:1.25;margin:12px 0}.eyebrow{font-family:monospace;text-transform:uppercase;font-size:13px;letter-spacing:1px}.heading,.section-heading{display:flex;justify-content:space-between;gap:24px;align-items:start}.lede{max-width:730px;font-size:18px;color:#596150}.workspace{min-width:200px}label{display:flex;flex-direction:column;gap:7px;font-size:14px;font-weight:600;margin-bottom:18px}input,textarea,select{font:inherit;font-weight:400;border:1px solid #a6b09c;background:#fff;padding:12px;max-width:100%;border-radius:0;color:#171b15}textarea{width:100%;resize:vertical}input:focus,textarea:focus,select:focus,button:focus-visible,a:focus-visible{outline:3px solid #7b9c2a;outline-offset:3px}button{font:600 14px Arial;padding:12px 18px;border:1px solid #171b15;background:#171b15;color:#d5ff5d;cursor:pointer}button.secondary{color:#171b15;background:transparent}button:disabled{opacity:.45;cursor:not-allowed}button[aria-busy=true]{cursor:wait}.panel{border-top:1px solid #bac3af;padding:30px 0;margin-top:22px}.section-heading span,.note,.muted{font-size:14px;color:#596150;font-weight:400}.fields,.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.fields{grid-template-columns:repeat(2,minmax(0,1fr))}.catalog-filters{grid-template-columns:minmax(0,2fr) repeat(2,minmax(0,1fr))}.mcp-navigation{margin-bottom:24px}.setup-columns{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:28px;align-items:start}.setup-fields{grid-template-columns:1fr 2fr 1fr}.connection-access{min-width:0}.precheck-panel{border:2px solid #789832;background:#f6fbe9;padding:20px;margin:0;overflow-wrap:anywhere}.precheck-panel h4{margin:14px 0 6px}.precheck-finding{border-left:4px solid #9a6511;padding:8px 12px;background:#fff2d6;margin:10px 0}.precheck-finding[data-level=blocked]{border-color:#ad4135;background:#f7e9e6}.precheck-finding[data-level=info]{border-color:#789832;background:#eaf1d9}.consent{display:flex;flex-direction:row;align-items:start;font-weight:400;max-width:850px}.consent input{margin-top:5px}.card{padding:22px;background:#fff;border:1px solid #cbd0c4;min-width:0;overflow-wrap:anywhere}.card p{font-size:16px}.card .note{font-size:14px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.pill{display:inline-block;background:#e4eccf;padding:4px 8px;font:12px monospace;text-transform:uppercase}.empty{color:#596150}.connection{display:flex;justify-content:space-between;gap:20px;border-top:1px solid #d6dccf;padding:18px 0;margin-top:18px;align-items:center}.run{margin-top:18px}.run-heading{display:flex;justify-content:space-between;gap:20px}.approval{border:2px solid #789832;padding:20px;background:#f6fbe9;margin-top:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:320px;overflow:auto;font:13px/1.5 monospace;background:#eef1e8;padding:15px}.eval-check{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:12px 0}.eval-check label{min-width:0}.eval-check button{align-self:end}#eval-editor{min-width:0;margin:20px 0;padding:18px;border:1px solid #cbd0c4}@media(max-width:700px){.eval-check{grid-template-columns:1fr}}.instance-inputs{margin-top:28px;padding-top:24px;border-top:1px solid #bac3af}#editor-tools{border:1px solid #cbd0c4;margin:0 0 20px;padding:18px;min-width:0}#editor-tools legend{font-size:14px;font-weight:600}#tool-options .consent{overflow-wrap:anywhere;margin-bottom:8px}#workspace-recipes{margin:16px 0 28px}#connect-readiness[data-state=blocked]{padding:12px 16px;border-left:4px solid #9a6511;background:#fff2d6;color:#4b350f;font-weight:600}#endpoint-review-url,#endpoint-approvals .note{overflow-wrap:anywhere;min-width:0}details{margin-top:16px}summary{cursor:pointer;font-weight:600}.action-feedback{padding:12px 16px;border-left:4px solid #8bad34;background:#eaf1d9;overflow-wrap:anywhere}.action-feedback[data-error=true],#precheck-status[data-error=true]{border-left:4px solid #ad4135;background:#f7e9e6;color:#782e25;padding:12px}#status{padding:14px 18px;border-left:4px solid #8bad34;background:#eaf1d9}#status[data-error=true]{border-color:#ad4135;background:#f7e9e6}[hidden]{display:none!important}@media(max-width:850px){.grid{grid-template-columns:1fr}.heading,header{flex-direction:column}.workspace{width:100%}.fields,.catalog-filters,.setup-columns{grid-template-columns:1fr}.section-heading,.connection,.run-heading{flex-direction:column;gap:8px}main{padding-top:25px}}`;

export function agentBuilderApp(runtime: Window, recipeCatalog: Recipe[] = [], historyFactory = agentHistory): void {
  const history = historyFactory(runtime);
  let recurring: any = null;
  const doc = runtime.document;
  const get = <T extends HTMLElement>(id: string) => doc.getElementById(id) as T;
  const workspace = get<HTMLSelectElement>("workspace");
  let tenant = "", role = "viewer", generation = 0;
  let state: any = { connections: [], agents: [], runs: [] };
  let builderStage = 'connect';
  function showStage(value: string) {
    builderStage = ['connect', 'create', 'run'].includes(value) ? value : ['recipe-browser', 'create-connections'].includes(value) ? 'create' : 'connect';
    const copy: Record<string, string[]> = {
      connect: ['01 / Connect', 'Connect your tools.', 'Find a server, review its capabilities, and connect the server your agent will use. Add account credentials only when required.'],
      create: ['02 / Create', 'Give your agent a job.', 'Explore recipes and suggestions. Define the inputs, choose the tools, and decide what success means.'],
      run: ['03 / Run', 'Put your agent to work.', 'Review recent runs and upcoming checks. Open a recurring agent to manage its schedule and findings.'],
    };
    ['stage-label', 'stage-title', 'stage-description'].forEach((id, i) => { get(id).textContent = copy[builderStage][i]; });
    doc.querySelectorAll<HTMLElement>('[data-builder-stage]').forEach(el => { el.hidden = el.dataset.builderStage !== builderStage || (el.id === 'configure' && !chosen); });
    const next = get<HTMLAnchorElement>('stage-next');
    next.href = builderStage === 'connect' ? '#create' : builderStage === 'create' ? '#run' : `/?workspace=${encodeURIComponent(tenant)}#activity`;
    next.textContent = builderStage === 'connect' ? 'Next: create an agent →' : builderStage === 'create' ? 'Next: run a trial →' : 'Next: monitor activity →';
    runtime.agentActionJourney?.setView(builderStage);
    get('recipe-return').hidden = !selectedRecipe || builderStage !== 'connect';
    if (builderStage !== 'connect') cancelScheduledPrecheck();
  }
  runtime.addEventListener('hashchange', () => showStage(runtime.location.hash.slice(1)));
  let chosen: { connectionId: string; suggestion: any } | undefined;
  let memberships: any[] = [];
  let selectedRecipe: Recipe | undefined;
  let editorRecipe: (RecipeRevision & { id: string }) | undefined;
  let editorGeneration = 0;
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
    return { title: editorField('title').value.trim(), goal: editorField('goal').value.trim(), inputGuide: editorField('inputGuide').value.trim(), instructions: editorField('instructions').value.trim(), boundaries: editorField('boundaries').value.trim(), success: editorField('success').value.trim(), tools: [...doc.querySelectorAll<HTMLInputElement>('#tool-options input:checked')].map(input => input.value).sort(), ...(evaluation ? { evaluation } : {}) };
  }
  function updateEvalTools() {
    const names = [...doc.querySelectorAll<HTMLInputElement>('#tool-options input:checked')].map(input => input.value);
    doc.querySelectorAll<HTMLSelectElement>('[data-check-tool]').forEach(select => {
      const old = select.value; select.replaceChildren(new Option('Choose a selected tool', ''));
      for (const name of names) select.append(new Option(name, name));
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
    const remove = node('button','Remove check','secondary') as HTMLButtonElement; remove.type='button'; remove.onclick=()=>{row.remove();updateEvalEditor();}; row.append(remove);
    get('eval-checks').append(row); update(); updateEvalTools(); updateEvalEditor();
  }
  function editorTools(selected: string[] = []) {
    const connection = state.connections.find((c: any) => c.id === chosen?.connectionId && c.status === 'connected');
    get('tool-options').replaceChildren();
    for (const tool of connection?.tools || []) {
      const label = node('label', '', 'consent'), input = doc.createElement('input'); input.type = 'checkbox'; input.value = tool.name; input.checked = selected.includes(tool.name); input.disabled = role === 'viewer';
      label.append(input, node('span', tool.name)); get('tool-options').append(label);
    }
    if (!connection) get('tool-options').append(node('p', 'Connect a server to choose tools.', 'note'));
  }
  function openEditor(connectionId: string, definition: Partial<RecipeDefinition>, source: any = {}, saved?: RecipeRevision & { id: string }) {
    editorGeneration++; editorRecipe = saved; chosen = { connectionId, suggestion: source };
    const form = get<HTMLFormElement>('create'); form.reset();
    for (const name of ['title', 'goal', 'inputGuide', 'instructions', 'boundaries', 'success']) editorField(name).value = definition[name] || '';
    const select = get<HTMLSelectElement>('editor-connection'); select.replaceChildren();
    select.append(new Option('Choose a connected server', ''));
    for (const c of state.connections.filter((c: any) => c.status === 'connected')) select.append(new Option(c.label, c.id));
    select.value = connectionId;
    editorTools(definition.tools);
    get('eval-checks').replaceChildren(); get<HTMLInputElement>('eval-enabled').checked = Boolean(definition.evaluation) || !saved;
    for (const check of definition.evaluation?.checks || []) addEvalCheck(check);
    get('editor-source').textContent = saved ? `Workspace recipe · version ${saved.version}. Saving edits creates a new version; existing agents keep their original definition.` : source.recipeId ? 'Customize this catalog recipe for your workspace.' : source.id ? 'Review and customize this AI suggestion.' : 'Create a job using your connected tools. No AI suggestion is needed.';
    get('duplicate-recipe').hidden = !saved;
    get('save-recipe').textContent = saved ? 'Save new version' : 'Save workspace recipe';
    get('recipe-save-status').textContent = '';
    form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement>('input,textarea,select,button').forEach(el => { if (!el.closest('#eval-checks')) el.disabled = role === 'viewer'; });
    updateEvalEditor();
    showStage('create'); get('configure').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function renderWorkspaceRecipes() {
    const list = get('workspace-recipes'); list.replaceChildren();
    for (const saved of state.workspaceRecipes || []) {
      const card = node('article', '', 'card'); card.append(node('h3', saved.definition.title), node('p', saved.definition.goal), node('p', `Workspace recipe · v${saved.version}`, 'note'));
      const open = (duplicate: boolean) => {
        recipeContext();
        const connection = state.connections.find((c: any) => c.status === 'connected' && saved.definition.tools.every((name: string) => c.tools.some((t: any) => t.name === name)));
        openEditor(connection?.id || '', saved.definition, {}, duplicate ? undefined : saved);
      };
      const actions = node('div', '', 'actions'); actions.append(button('Use or edit recipe', async () => open(false)), button('Duplicate recipe', async () => open(true))); card.append(actions); list.append(card);
    }
    if (!list.children.length) list.append(node('p', 'Save a definition below to reuse it with fresh inputs.', 'empty'));
    get<HTMLButtonElement>('start-scratch').disabled = role === 'viewer';
  }
  async function saveEditorRecipe(duplicate: boolean) {
    for (const name of ['title', 'goal', 'success']) if (!editorField(name).reportValidity()) return;
    if (!get<HTMLSelectElement>('editor-connection').reportValidity()) return;
    const currentTenant = tenant, currentEditor = editorGeneration;
    const definition = definitionFromEditor();
    let saved: RecipeRevision & { id: string };
    try { saved = await mutate('save-recipe', { connectionId: chosen?.connectionId, definition, ...(!duplicate && editorRecipe ? { id: editorRecipe.id, baseVersion: editorRecipe.version } : {}) }); }
    catch (error) { if (tenant !== currentTenant || editorGeneration !== currentEditor) return; throw error; }
    if (tenant !== currentTenant || editorGeneration !== currentEditor) return;
    editorRecipe = saved;
    get('editor-source').textContent = `Workspace recipe · version ${saved.version}. Saving edits creates a new version; existing agents keep their original definition.`;
    state.workspaceRecipes = [...(state.workspaceRecipes || []).filter((r: any) => r.id !== saved.id), saved];
    renderWorkspaceRecipes();
    get('save-recipe').textContent = 'Save new version'; get('duplicate-recipe').hidden = false;
    get('recipe-save-status').textContent = `Saved workspace recipe v${saved.version}. Job inputs were not included. You can create an agent below.`;
  }
  function recipeContext(recipe?: Recipe) {
    selectedRecipe = recipe; chosen = undefined; editorRecipe = undefined; editorGeneration++;
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
    const panel = get('recipe-detail'); if (selectedRecipe && chosen?.suggestion.recipeId === selectedRecipe.id) return; panel.replaceChildren(); panel.hidden = !selectedRecipe; get('recipe-browser').hidden = Boolean(selectedRecipe); get('custom-builder').hidden = Boolean(selectedRecipe);
    get('recipe-return').hidden = !selectedRecipe || builderStage !== 'connect';
    if (!selectedRecipe) return;
    const recipe = selectedRecipe;
    panel.append(node('p', `Recipe · ${recipe.publisher.name} · v${recipe.version}`, 'eyebrow'), node('h2', recipe.title), node('p', recipe.intent));
    const close = node('button', 'Choose another recipe', 'secondary') as HTMLButtonElement; close.type = 'button'; close.onclick = () => recipeContext(); panel.append(close);
    if (recipe.runtime === 'recurring') { const link = node('a', 'Configure recurring agent →') as HTMLAnchorElement; link.href = '/automations?workspace=' + encodeURIComponent(tenant) + '#agents'; panel.append(node('p', 'This recipe uses platform scheduling, saved baselines, findings and workspace notifications. Configure its targets and run a baseline before enabling automatic reads.'), link); return; }
    panel.append(node('h3', '1. Review requirements'));
    for (const server of recipe.servers) {
      panel.append(node('strong', server.name), node('p', server.purpose), node('p', `Required tools: ${server.tools.join(', ')}`, 'note'));
      if (server.connection) panel.append(node('p', server.connection.authentication, 'note'));
    }
    for (const requirement of recipe.adoption?.requirements || []) panel.append(node('p', requirement, 'note'));
    panel.append(node('p', 'Hosted trials use one MCP server and at most four calls. They do not provide cross-run baselines, arbitrary file storage or custom schedules. Supply required context in your inputs; stop the trial if a requirement cannot be met. Tool availability alone does not verify the whole recipe.', 'note'));
    const instructions = node('details'); instructions.append(node('summary', 'Instructions and boundaries'));
    for (const line of [...recipe.instructions, ...recipe.boundaries]) instructions.append(node('p', line, 'note'));
    panel.append(instructions, node('p', recipe.evidence.description, 'note'));
    if (recipe.adoption) {
      const checks = node('details'); checks.append(node('summary', 'Example output and trial checks'), node('p', 'Illustrative output; these checks have not run against your connections.', 'note'), node('pre', recipe.adoption.exampleOutput));
      for (const check of recipe.adoption.validation) checks.append(node('strong', check.name), node('p', check.procedure, 'note'), node('p', `Expected: ${check.expected}`, 'note'));
      panel.append(checks);
    }
    panel.append(node('h3', '2. Choose a connection'));
    if (recipe.servers.length !== 1) {
      panel.append(node('p', 'This recipe requires multiple MCP servers. Hosted agents currently use one server, so this recipe cannot run here yet. You can review it here or export it for a runtime that supports its requirements.', 'note'));
      const download = node('a', 'Download recipe instructions') as HTMLAnchorElement; download.href = 'https://agentaction.dev/recipes/' + encodeURIComponent(recipe.id) + '/download?format=markdown'; panel.append(download); return;
    }
    const server = recipe.servers[0], select = doc.createElement('select'); select.id = 'recipe-connection';
    const label = node('label', 'MCP connection'); label.append(select); panel.append(label);
    const placeholder = node('option', 'Choose a connected server') as HTMLOptionElement; placeholder.value = ''; select.append(placeholder);
    for (const connection of state.connections) {
      const missing = server.tools.filter(name => !connection.tools.some((tool: any) => tool.name === name));
      const option = node('option', connection.label + (connection.status !== 'connected' ? ' — disconnected' : missing.length ? ` — missing ${missing.join(', ')}` : ' — required tools available')) as HTMLOptionElement;
      option.value = connection.id; option.disabled = connection.status !== 'connected' || missing.length > 0; select.append(option);
    }
    const connect = button('Connect a missing server', async () => { runtime.location.hash = 'connect'; showStage('connect'); openSetup(server.connection?.endpoint || '', server.name); }); panel.append(connect);
    panel.append(node('h3', '3. Configure a draft'));
    const reviewLabel = node('label', '', 'consent'), reviewed = doc.createElement('input'); reviewed.type = 'checkbox'; reviewed.id = 'recipe-reviewed'; reviewLabel.append(reviewed, node('span', 'I reviewed the requirements and will keep this trial within the available tools and runtime limits.')); panel.append(reviewLabel);
    const configure = button('Configure this recipe', async () => {
      const connection = state.connections.find((c: any) => c.id === select.value);
      if (!connection || !reviewed.checked) return;
      openEditor(connection.id, { title: recipe.title, goal: recipe.intent, inputGuide: [...(recipe.adoption?.inputs.map(input => input.name + ': ' + input.description) || []), ...(recipe.adoption?.requirements || [])].join('\n').slice(0, 1000), instructions: recipe.instructions.join('\n'), boundaries: recipe.boundaries.join('\n'), success: recipe.outcomes.map(rule => rule.label).join('\n'), tools: server.tools }, { recipeId: recipe.id, recipeVersion: recipe.version });
    }, false);
    const update = () => { configure.disabled = role === 'viewer' || !select.value || !reviewed.checked; };
    select.addEventListener('change', () => { chosen = undefined; get('configure').hidden = true; update(); }); reviewed.addEventListener('change', () => { if (!reviewed.checked) { chosen = undefined; get('configure').hidden = true; } update(); });
    update(); panel.append(configure);
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
    feedback("connect-feedback", ""); feedback("approval-feedback", ""); updateEndpointAccess(true); renderPrechecks();
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
    state = { connections: [], agents: [], runs: [], workspaceRecipes: [] }; chosen = undefined; editorRecipe = undefined; editorGeneration++; get("tool-options").replaceChildren(); get("editor-connection").replaceChildren(); get("eval-checks").replaceChildren();
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
    return report.authentication === "oauth" ? "OAuth discovered · login not supported yet" : report.authentication === "required" ? "Authentication required · type unconfirmed" : report.authentication === "not-observed" ? "Tools listed without authentication" : "Authentication unknown";
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
      const evidence = node("details"); evidence.append(node("summary", "HTTP evidence")); for (const e of report.evidence) evidence.append(node("p", `${e.status} · ${e.url}`, "note")); results.append(evidence);

    }
    get("precheck-status").dataset.error = "false";
    get("precheck-status").textContent = inspecting ? "Inspecting without credentials. This may take up to 30 seconds; no tools will be executed." : report ? "Saved pre-check findings for this exact endpoint. Review the observations and limitations below." : role === "viewer" ? "An owner or operator can run a pre-check. Saved workspace reports are available below." : !field.value ? "Enter an HTTPS endpoint to start an automatic pre-check." : !validInspectionEndpoint(field.value) ? "Enter a public HTTPS URL without credentials, query parameters or fragments. No check has been sent." : "No current findings. Edit the endpoint to check automatically, or select Recheck endpoint.";
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
    get<HTMLFormElement>("connect").reset(); feedback("connect-feedback", ""); feedback("approval-feedback", "");
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
    const params = new URLSearchParams({ q: catalogQuery, capability: catalogCapability, auth: catalogAuth, offset: String(append ? catalogOffset || 0 : 0) });
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
      for (const server of data.servers) {
        const card = node("article", "", "card");
        card.append(node("span", "Advertised · tools unverified", "pill"), node("h3", server.title), node("p", server.description), node("p", `Publisher namespace: ${server.publisher} · ${server.hosting}`, "note"), node("p", `${server.name} · version ${server.version}`, "note"));
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
            openSetup(select.value, server.title);
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
      get("catalog-status").textContent = `${data.total} matching servers. ${data.notice}${data.updatedAt ? ` Last complete update: ${new Date(data.updatedAt).toLocaleString()}.` : ""}${data.stale ? " Catalog may be out of date." : ""}`;
      if (!data.servers.length && !append) get("catalog-results").append(node("p", data.indexing || data.unavailable ? "Catalog results are not available yet. Search again shortly or enter an endpoint manually." : "No matching servers. Try a service name, broaden the capability or authentication filters, or enter an endpoint manually.", "empty"));
    } catch (error) {
      if (current !== catalogGeneration || currentTenant !== tenant) return;
      get("catalog-status").textContent = error instanceof Error ? error.message : "Registry discovery is unavailable. Enter an endpoint manually.";
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
    const localFeedback = feedbackId || (el.closest("#setup-view") ? "connections-feedback" : undefined);
    el.disabled = true; el.setAttribute("aria-busy", "true"); workspace.disabled = true; updateEndpointAccess();
    try { await action(); } catch (error) { const failure = error instanceof Error ? error.message : "Unable to complete the request."; await refresh().catch(() => {}); if (localFeedback && tenant) feedback(localFeedback, failure, true); else message(failure, true); }
    finally { el.removeAttribute("aria-busy"); el.disabled = role === "viewer"; workspace.disabled = !memberships.length; updateEndpointAccess(); }
  }
  async function refresh() {
    const current = ++generation;
    if (!tenant) { get("builder").hidden = true; message("Create or join a workspace in Workspace settings to build an agent."); return; }
    const [data, checks] = await Promise.all([request(`/api/agents/${encodeURIComponent(tenant)}/state`), history.read(tenant, "automations")]);
    if (current !== generation) return;
    state = data; recurring = checks; get("builder").hidden = false; render();
  }
  function render() {
    renderEndpointApprovals(); renderPrechecks(); renderRecipe(); renderWorkspaceRecipes();
    const createConnections = get('create-connections'); createConnections.replaceChildren();
    for (const c of state.connections.filter((c: any) => c.status === 'connected')) {
      const row = node('div', '', 'connection'); row.append(node('strong', c.label), button('Suggest agents', async () => { message('Finding useful jobs for this server…'); await mutate('suggest', {connectionId:c.id}); await refresh(); message('Suggestions are ready. Choose a job to configure.'); })); createConnections.append(row);
    }
    if (!createConnections.children.length) { const link = node('a', 'Connect an MCP server to get agent suggestions →') as HTMLAnchorElement; link.href = '#connect'; createConnections.append(link); }
    showStage(builderStage);
    const connections = get("connections"), suggestions = get("suggestions"), agents = get("agents"), runs = get("runs");
    connections.replaceChildren(); suggestions.replaceChildren(); agents.replaceChildren(); runs.replaceChildren();
    for (const c of state.connections) {
      const row = node("div", "", "connection"), detail = node("div");
      detail.append(
        node("strong", c.label),
        node("p", `Server: ${c.endpoint}`, "note"),
        node("p", `${c.tools.length} discovered tools · ${c.status}`, "note"),
        node("p", c.hasCredential ? "Connected account: credential stored" : "Authentication: no stored credential", "note"),
      );
      row.append(detail);
      if (c.status === "connected") {
        const actions = node("div", "", "actions");
        actions.append(button("Suggest agents", async () => { feedback("connections-feedback", "AI is finding useful jobs in this server’s tool catalog…"); await mutate("suggest", { connectionId: c.id }); await refresh(); feedback("connections-feedback", "Suggestions are ready. Review a job, its tools and setup requirements."); runtime.location.hash = "create"; }), button("Disconnect", async () => { if (!runtime.confirm("Disconnect this server, remove the stored credential and pause its agents?")) return; await mutate("disconnect", { connectionId: c.id }); await refresh(); feedback("connections-feedback", "Disconnected. The credential was removed and its agents were paused."); }));
        row.append(actions);
      }
      const credentialLabel = node("label", "Replace credential / reconnect");
      const credential = doc.createElement("input"); credential.type = "password"; credential.autocomplete = "off"; credential.maxLength = 4096; credential.placeholder = "New bearer token (blank for public access)"; credential.disabled = role === "viewer";
      credentialLabel.append(credential);
      const replace = button("Reconnect server", async () => {
        const token = credential.value; credential.value = "";
        feedback("connections-feedback", "Checking the replacement connection…");
        await mutate("connect", { connectionId: c.id, token }); await refresh(); feedback("connections-feedback", "Server reconnected. Its agents are paused; run a new trial before reactivation.");
      });
      const replacement = node("details"); replacement.append(node("summary", "Connection credentials"), credentialLabel, replace); detail.append(replacement);
      connections.append(row);
      for (const s of c.suggestions) {
        const card = node("article", "", "card");
        card.append(node("span", "AI suggested · untested", "pill"), node("h3", s.title), node("p", s.goal), node("p", `Requires: ${s.setup}`, "note"), node("p", `Success: ${s.success}`, "note"), node("p", `Tools: ${s.tools.join(", ")}`, "note"), button("Build this agent", async () => {
          recipeContext(); openEditor(c.id, { ...s, inputGuide: s.setup }, s);
        }, false)); suggestions.append(card);
      }
    }
    if (!connections.children.length) connections.append(node("p", "No MCP servers connected yet.", "empty"));
    if (!suggestions.children.length) suggestions.append(node("p", "Connect a server, then choose “Suggest agents.”", "empty"));
    for (const a of state.agents) {
      const card = node("article", "", "card"), actions = node("div", "", "actions");
      card.append(node("span", a.status, "pill"), node("h3", a.title), node("p", a.goal), node("p", `Success: ${a.success}`, "note"));
      actions.append(button("Run a trial", async () => { message("Planning a trial. No tool executes until you approve its arguments."); await mutate("trial", { agentId: a.id }); await refresh(); message("Trial updated. Review its proposed call or result below."); }));
      const trial = state.runs.find((r: any) => r.id === a.lastTrial);
      if (a.status !== "active" && trial?.status === "completed" && trial.outcome === "met" && (!trial.contract || trial.evaluation?.status === "pass")) actions.append(button("Activate daily", async () => { if (!runtime.confirm("I reviewed the trial result. Start a daily supervised run? Each tool call will still wait for approval.")) return; await mutate("activate", { agentId: a.id, reviewed: true }); await refresh(); message("Daily supervised schedule activated."); }));
      if (a.status !== "paused") actions.append(button("Pause", async () => { await mutate("pause", { agentId: a.id }); await refresh(); message("Agent paused. Pending calls were cancelled."); }));
      if (a.definition) {
        const detail = node('details'); detail.append(node('summary', 'Recipe definition'), node('p', a.workspaceRecipe ? `Workspace recipe · v${a.workspaceRecipe.version}` : 'Custom definition · pinned to this agent', 'note'));
        for (const [label, value] of [['Inputs needed', a.definition.inputGuide], ['Instructions', a.definition.instructions], ['Boundaries', a.definition.boundaries], ['Allowed tools', a.definition.tools.join(', ')]]) if (value) detail.append(node('strong', label), node('p', value, 'note'));
        detail.append(node('p', 'Success is AI-assessed. Written boundaries guide the AI; measurable checks evaluate recorded evidence.', 'note')); card.append(detail);
      }
      if (a.recipe) card.append(node("p", `Based on recipe: ${a.recipe.id} · v${a.recipe.version}`, "note"));
      const latest = state.runs.filter((r: any) => r.agentId === a.id).sort((a: any, b: any) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
      card.append(node("p", `Last run: ${latest ? new Date(latest.startedAt).toLocaleString() + " · " + latest.status.replaceAll("_", " ") : "Not yet"} · Next proposal: ${a.status === "active" && a.nextRun ? new Date(a.nextRun).toLocaleString() : "Not scheduled"}`, "note"));
      if (latest?.summary) card.append(node("p", latest.summary));
      card.append(actions); agents.append(card);
    }
    history.appendAgents(agents, recurring, tenant);
    if (!agents.children.length) agents.append(node("p", "Choose a recipe or an AI suggestion in Create to build your first agent.", "empty"));
    for (const r of state.runs) {
      const card = node("article", "", "card run"), heading = node("div", "", "run-heading");
      card.dataset.runAt = String(new Date(r.startedAt).getTime());
      if (r.pending) card.dataset.pendingApproval = "true";
      heading.append(node("h3", state.agents.find((a: any) => a.id === r.agentId)?.title || "Agent run"), node("span", r.status.replaceAll("_", " "), "pill"));
      card.append(heading, node("p", `${r.kind} · ${new Date(r.startedAt).toLocaleString()} · ${r.events.length}/4 tool calls · ${r.tokens || "unreported"} model tokens`, "note"));
      if (r.summary) card.append(node("p", r.summary));
      history.appendEvaluation(card, r);
      if (r.outcome) card.append(node("p", `AI-assessed outcome: ${r.outcome.replaceAll("_", " ")}. ${r.reason || ""}`, "note"));
      for (const event of r.events) {
        const detail = node("details"); detail.append(node("summary", `${event.tool} · ${event.status}${event.durationMs !== undefined ? ` · ${event.durationMs} ms` : ""}`), node("pre", JSON.stringify({ arguments: event.arguments, result: event.result }, null, 2))); card.append(detail);
      }
      if (r.pending) {
        const approval = node("div", "", "approval"), actions = node("div", "", "actions");
        approval.append(node("strong", `Approve tool call: ${r.pending.tool}`), node("p", "This executes against your connected account. Review the exact arguments before approval.", "note"), node("pre", JSON.stringify(r.pending.arguments, null, 2)));
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
  get('choose-recipe').addEventListener('click', () => recipeContext());
  get('choose-custom').addEventListener('click', () => recipeContext());
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
    void perform(submit, async () => { feedback("connect-feedback", "Connecting and discovering the server’s actual tools…"); try { await mutate("connect", payload); } finally { payload.token = null; } await refresh(); feedback("connect-feedback", "Connected. Choose “Suggest agents” to discover useful jobs."); if (selectedRecipe) { runtime.location.hash = "create"; showStage("create"); message("Server connected. Select it for your recipe and review its requirements."); } }, "connect-feedback");
  });
  get<HTMLButtonElement>('start-scratch').onclick = () => { recipeContext(); openEditor('', {}); };
  get<HTMLSelectElement>('editor-connection').onchange = () => {
    if (!chosen) return;
    const selected = [...doc.querySelectorAll<HTMLInputElement>('#tool-options input:checked')].map(input => input.value); chosen.connectionId = get<HTMLSelectElement>('editor-connection').value; editorTools(selected); updateEvalTools();
  };
  get('tool-options').addEventListener('change', updateEvalTools);
  get('eval-enabled').addEventListener('change', updateEvalEditor);
  get<HTMLButtonElement>('add-eval-check').onclick = () => addEvalCheck();
  for (const [id, duplicate] of [['save-recipe', false], ['duplicate-recipe', true]] as const) get<HTMLButtonElement>(id).onclick = event => {
    if (role === 'viewer' || !chosen) return;
    void perform(event.currentTarget as HTMLButtonElement, () => saveEditorRecipe(duplicate), 'recipe-save-status');
  };
  get<HTMLFormElement>("create").addEventListener("submit", event => {
    event.preventDefault(); if (!chosen || role === 'viewer') return;
    const currentTenant = tenant, currentEditor = editorGeneration;
    void perform(get<HTMLButtonElement>('create-agent'), async () => {
      const definition = definitionFromEditor();
      const binding = editorRecipe && JSON.stringify(definition) === JSON.stringify(editorRecipe.definition) ? { workspaceRecipe: { id: editorRecipe.id, version: editorRecipe.version } } : { definition, ...(chosen!.suggestion.recipeId ? { recipeId: chosen!.suggestion.recipeId, recipeVersion: chosen!.suggestion.recipeVersion, recipeReviewed: true } : {}) };
      await mutate('create', { connectionId: chosen!.connectionId, ...binding, setup: editorField('setup').value });
      if (tenant !== currentTenant || editorGeneration !== currentEditor) return;
      recipeContext(); await refresh(); message("Agent instance created. Run a trial to review its first action."); runtime.location.hash = "run";
    });
  });
  get<HTMLButtonElement>("refresh").addEventListener("click", () => { void refresh().catch(e => message(e.message, true)); });
  workspace.addEventListener("change", () => { cancelScheduledPrecheck(); showMcpView(false); feedback("connections-feedback", ""); get("builder").hidden = true; catalogGeneration++; inspectionGeneration++; inspecting = false; precheckTouched = false; get<HTMLInputElement>("precheck-endpoint").value = ""; catalogOffset = null; get("catalog-results").replaceChildren(); get("catalog-more").hidden = true; get("catalog-status").textContent = "Search the official MCP Registry by name or capability."; state = { connections: [], agents: [], runs: [], workspaceRecipes: [] }; editorRecipe = undefined; editorGeneration++; get("tool-options").replaceChildren(); get("editor-connection").replaceChildren(); get("eval-checks").replaceChildren(); get("recipe-save-status").textContent = ""; clearSelection(); tenant = workspace.value; role = memberships.find(m => m.tenant.tenant_id === tenant)?.membership.role || "viewer"; renderAccountRole(); chosen = undefined; get("configure").hidden = true; get<HTMLFormElement>("create").reset(); get<HTMLFormElement>("connect").reset(); void refresh().then(() => message(`Workspace ready · ${role}`)).catch(e => message(e.message, true)); });
  get('recipe-browser').replaceChildren(...recipeCatalog.map(recipe => {
    const card = node('article', '', 'card'); card.append(node('h3', recipe.title), node('p', recipe.summary), node('p', recipe.servers.map(server => server.name).join(' + '), 'note'));
    const use = node('button', 'Use this recipe') as HTMLButtonElement; use.type = 'button'; use.onclick = () => { recipeContext(recipe); get('recipe-detail').scrollIntoView({ behavior: 'smooth', block: 'start' }); }; card.append(use); return card;
  }));
  const query = new URLSearchParams(runtime.location.search);
  if (query.has('recipe')) {
    selectedRecipe = query.getAll('recipe').length === 1 && query.getAll('recipe_version').length === 1 ? recipeCatalog.find(recipe => recipe.id === query.get('recipe') && recipe.version === query.get('recipe_version')) : undefined;
    if (!selectedRecipe) { get('recipe-error').hidden = false; get('recipe-error').textContent = 'This recipe version is unavailable. Choose a current recipe below; no draft has been created.'; }
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
      renderAccountRole(); await refresh(); if (tenant) void searchCatalog(); if (tenant) message(`Workspace ready · ${role}`);
    } catch (error) { message(error instanceof Error ? error.message : "Unable to load the workspace.", true); }
  })();
}
export const AGENT_JS = `(${agentBuilderApp.toString()})(window, ${JSON.stringify(recipes).replace(/</g, "\\u003c")}, ${HISTORY_FACTORY_JS});`;
