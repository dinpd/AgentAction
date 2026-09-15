/** Shared navigation and read-only journey guidance for the console and builder. */
export const JOURNEY_NAV = `<div class="console-navigation"><nav class="journey-nav" aria-label="Agent lifecycle">
<a data-stage="home" href="/#overview"><span aria-hidden="true">⌂</span><strong>Overview</strong><small>Your workspace at a glance</small></a>
<a data-stage="connect" href="/agents#connect"><span>01</span><strong>Connect</strong><small>MCP servers &amp; tools</small></a>
<a data-stage="create" href="/agents#create"><span>02</span><strong>Create</strong><small>Recipes &amp; your agents</small></a>
<a data-stage="run" href="/agents#run"><span>03</span><strong>Run</strong><small>Trials, approvals &amp; schedules</small></a>
<a data-stage="monitor" href="/#activity"><span>04</span><strong>Monitor</strong><small>Activity &amp; execution quality</small></a>
<a data-stage="improve" href="/#evals"><span>05</span><strong>Improve</strong><small>Evals &amp; success criteria</small></a>
<a data-recurring-link data-workspace-link href="/automations#agents"><span>↻</span><strong>Recurring agents</strong><small>Schedules &amp; findings</small></a>
</nav><nav class="workspace-nav" aria-label="Workspace administration" data-workspace-navigation>
<a data-utility="settings" data-workspace-link data-nav-setup href="/#setup"><span aria-hidden="true">⚙</span><strong>Workspace settings</strong><small>Members, invitations &amp; sources</small></a>
<a data-notifications-link data-workspace-link href="/automations#notifications"><span>✉</span><strong>Notifications</strong><small>Workspace email routing</small></a>
</nav></div>`;
export const JOURNEY_HOME = `<section class="journey-home" data-journey-home aria-labelledby="journey-title" hidden>
<p class="eyebrow">Your agent workspace</p><h2 id="journey-title">From first connection<br>to better agents.</h2><p class="journey-lede">Connect your tools. Give an agent a job. Run it, understand what happened, and improve the next attempt.</p>
<section class="journey-next" aria-live="polite"><div><p class="eyebrow" data-journey-label>Next step</p><h3 data-journey-next-title>Checking your workspace…</h3><p data-journey-next-detail>Progress comes from your connected servers and recent runs.</p></div><a data-journey-next href="/#setup">Open workspace settings →</a></section>
<ol class="journey-track" aria-label="Your agent progression"></ol><p class="journey-footnote">Move between stages whenever you need. Progress reflects available workspace data and retained run history.</p>
</section>`;
export const JOURNEY_CSS = `
.console-navigation{position:sticky;top:0;align-self:start;min-width:0}.journey-nav{display:grid;gap:8px;padding:28px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px}
:is(.journey-nav,.workspace-nav) a{display:grid;grid-template-columns:24px 1fr;gap:4px 8px;padding:13px 10px;text-decoration:none;color:#65706a;border-left:3px solid transparent;min-width:0}
:is(.journey-nav,.workspace-nav) a>span{grid-row:span 2;font-size:11px;padding-top:3px}:is(.journey-nav,.workspace-nav) strong{font-size:15px}:is(.journey-nav,.workspace-nav) small{font-size:11px;line-height:1.4;font-weight:400}:is(.journey-nav,.workspace-nav) a[aria-current=page],:is(.journey-nav,.workspace-nav) a:hover{color:#173c2f;background:#dfebe1;border-color:#245a44}:is(.journey-nav,.workspace-nav) a:focus-visible{outline:3px solid #729580;outline-offset:2px}:is(.journey-nav,.workspace-nav) a[hidden]{display:none}
.workspace-nav{display:grid;margin:8px 16px 24px;padding-top:16px;border-top:1px solid #d4d8cf;font-family:Arial,Helvetica,sans-serif;font-size:14px}.workspace-nav[hidden]{display:none}
.journey-home{padding:22px 0 36px;min-width:0}.journey-home h2{font-family:Georgia,'Times New Roman',serif;font-size:clamp(34px,4.2vw,58px);font-weight:400;line-height:1.08;letter-spacing:-1.8px;margin:12px 0 20px}.journey-lede{max-width:600px;font-size:17px;color:#65706a;line-height:1.65}.journey-next{display:flex;gap:24px;align-items:center;justify-content:space-between;padding:26px;margin:30px 0;background:#e3ede5;border:1px solid #bdcfc1;border-radius:8px}.journey-next h3{font-family:Georgia,serif;font-size:26px;font-weight:400;margin:5px 0 10px}.journey-next p:last-child{font-size:14px;line-height:1.5;max-width:620px;color:#475b4d}.journey-next a,.stage-continue{display:inline-block;flex-shrink:0;padding:13px 18px;background:#1b4e3b;color:#fff;text-decoration:none;font-size:13px;font-weight:700;border-radius:4px}.journey-track{list-style:none;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));padding:0;margin:0;gap:10px}.journey-track li{border:1px solid #d4d8cf;border-radius:6px;background:#fff;padding:18px;min-width:0}.journey-track li[data-next=true]{border:2px solid #245a44;padding:17px}.journey-track a{color:#173c2f;text-decoration:none;display:block}.journey-track span{display:block;font:12px monospace;color:#758177}.journey-track strong{display:block;margin:18px 0 8px;font-size:17px}.journey-track p{font-size:12px;line-height:1.5;color:#65706a;min-height:36px}.journey-track small{font-size:11px;color:#245a44;font-weight:700}.journey-footnote{font-size:12px;color:#65706a;margin-top:18px}.stage-tabs{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 22px}.stage-tabs a{padding:9px 13px;border:1px solid #cbd4cb;border-radius:4px;text-decoration:none;color:#43574a;font-size:13px}.stage-tabs a[aria-current=page]{background:#dfebe1;border-color:#245a44}.stage-heading{margin:12px 0 28px}.stage-heading h2{font:400 38px Georgia,serif;margin:8px 0 14px}.stage-heading p{color:#65706a;max-width:680px;line-height:1.6}.stage-continue{margin-top:24px}.builder-layout{display:grid;grid-template-columns:220px minmax(0,1fr);max-width:1440px;margin:auto}.builder-layout main{width:100%;padding:36px 32px;min-width:0}.builder-layout .panel{margin-top:0}.builder-layout .connection>div{min-width:0;overflow-wrap:anywhere}.builder-layout{background:#f2f0ea}.builder-layout button{background:#1b4e3b;color:#fff;border-color:#1b4e3b}.builder-layout button.secondary{background:transparent;color:#1b4e3b}.builder-layout .card{border-radius:6px}.builder-layout .recipe-suggestions-title{margin-top:32px}.builder-layout .card summary{font-size:16px}.builder-layout .card a{font-size:13px;color:#245a44}.builder-layout #recipe-browser{gap:10px;margin-bottom:32px}.builder-layout #recipe-browser .card{padding:15px;margin-top:0}.builder-layout .heading h1{font:400 clamp(32px,4vw,48px) Georgia,serif;letter-spacing:-1px}.builder-layout .heading{margin-bottom:22px}.builder-layout .section-heading h2{font-size:22px}.builder-layout [data-builder-stage][hidden]{display:none!important}
@media(max-width:1000px){.journey-track{grid-template-columns:repeat(3,minmax(0,1fr))}.journey-next{align-items:start;flex-direction:column}}
@media(max-width:700px){.console-navigation{position:static}.workspace-nav{margin:0;padding:6px 12px;border-top:0;border-bottom:1px solid #d4d8cf}.workspace-nav a{grid-template-columns:24px 1fr;width:fit-content}.workspace-nav a>span{grid-row:auto}.workspace-nav small{display:none}.layout,.builder-layout{grid-template-columns:1fr}.journey-nav{position:static;grid-template-columns:repeat(6,minmax(106px,1fr));overflow-x:auto;padding:10px 12px;gap:4px;border-bottom:1px solid #d4d8cf}:is(.journey-nav,.workspace-nav) a{padding:10px 7px;grid-template-columns:1fr;gap:3px}:is(.journey-nav,.workspace-nav) small{display:none}:is(.journey-nav,.workspace-nav) a>span{grid-row:auto}:is(.journey-nav,.workspace-nav) strong{font-size:13px}.journey-track{grid-template-columns:1fr}.journey-track li{padding:16px}.journey-track li[data-next=true]{padding:15px}.journey-track strong{margin:8px 0}.journey-track p{min-height:0}.journey-next{padding:20px}.builder-layout main{padding:24px 18px}.journey-home h2{letter-spacing:-1px}.workspace-nav a{grid-template-columns:20px 1fr;align-items:center}}
`;

type Progress = { next: number; title: string; detail: string; href: string; action: string; states: string[]; attention?: boolean };
export function journeyProgress(tenant: string, setup: any, state: any): Progress {
  const states = ['Not connected', 'No agents yet', 'No successful run yet', 'No activity yet', 'Review evals'];
  const result = (next: number, title: string, detail: string, href: string, action: string, attention = false): Progress => ({ next, title, detail, href, action, states, attention });
  if (!tenant) return result(-1, 'Start with your workspace', 'Create a workspace or join your team, then connect the MCP servers your agent will use.', '/#setup', 'Set up your workspace');
  if (!setup || !state) {
    states.fill('Status unavailable');
    return result(-1, 'Check your workspace connection', 'Some progress data could not be loaded. Open Workspace settings to check access, or refresh to try again.', '/#setup', 'Open workspace settings');
  }
  const connections = state.connections.filter((c: any) => c.status === 'connected');
  const sources = setup.sources.filter((s: any) => s.enabled === true);
  const agents = state.agents;
  const observed = setup.ingestion?.observed === true;
  const externalAgents = sources.flatMap((s: any) => Array.isArray(s.agent_ids) ? s.agent_ids : []);
  const succeeded = state.runs.some((r: any) => r.status === 'completed' && r.outcome === 'met');
  states[0] = connections.length || sources.length ? 'Connected' : 'Not connected';
  states[1] = agents.length ? `${agents.length} agent${agents.length === 1 ? '' : 's'}` : externalAgents.length ? 'External agent connected' : 'No agents yet';
  states[2] = succeeded ? 'Successful run recorded' : observed ? 'External activity received' : 'No successful run yet';
  states[3] = observed ? 'Activity received' : state.runs.length ? 'Run history available' : 'No activity yet';
  if (state.runs.some((r: any) => r.status === 'awaiting_approval')) return result(2, 'A run needs your review', 'Review the proposed tool call and its arguments before deciding whether to approve it.', '/agents#run', 'Review pending runs', true);
  if (state.runs.some((r: any) => ['failed', 'interrupted'].includes(r.status))) return result(3, 'Review runs that need attention', 'Your retained history contains a failed or interrupted run. Inspect what happened before trying again.', '/agents#run', 'Review run history', true);
  if (!connections.length && !sources.length) return result(0, 'Connect your first MCP server', 'Find an MCP server and review its setup, or connect an external agent through Workspace settings.', '/agents#connect', 'Connect an MCP server');
  if (!agents.length && !externalAgents.length && !observed) return result(1, 'Give your agent a job', 'Explore recipes and suggestions, define the inputs, and decide what counts as success.', '/agents#create', 'Create your first agent');
  if (!succeeded && !observed) return result(2, 'Try your first run', agents.length ? 'Run a supervised trial. Review each proposed action and check the result before scheduling it.' : 'Send an action from your external agent, then check that activity arrives in this workspace.', agents.length ? '/agents#run' : '/#setup', agents.length ? 'Run a trial' : 'Check agent setup');
  return result(4, 'Make the next run better', 'Review execution evidence and your success criteria. Configure evals to measure future jobs; an AI-assessed trial outcome is not independent verification.', '/#evals', 'Review evals');
}

declare global {
  interface Window { agentActionJourney?: { setWorkspace(tenant: string, demo?: boolean): void; setView(stage: string): void; refresh(): void } }
}
export function journeyApp(runtime: Window, progress: typeof journeyProgress): void {
  const doc = runtime.document;
  let tenant = '', demo = false, generation = 0, stage = 'home';
  const home = doc.querySelector<HTMLElement>('[data-journey-home]');
  const links = () => Array.from(doc.querySelectorAll<HTMLAnchorElement>('[data-stage], [data-workspace-link]'));
  function scoped(href: string): string {
    const url = new URL(href, runtime.location.origin);
    if (url.origin === runtime.location.origin && tenant && !demo) url.searchParams.set('workspace', tenant);
    else url.searchParams.delete('workspace');
    const context = new URLSearchParams(runtime.location.search);
    for (const key of ['recipe', 'recipe_version']) {
      if (!demo && context.getAll(key).length === 1) url.searchParams.set(key, context.get(key)!);
      else url.searchParams.delete(key);
    }
    return url.pathname + url.search + url.hash;
  }
  function render(data: Progress) {
    if (!home) return;
    home.querySelector('[data-journey-label]')!.textContent = demo ? 'Synthetic demo' : data.attention ? 'Needs attention' : 'Next step';
    home.querySelector('[data-journey-next-title]')!.textContent = data.title;
    home.querySelector('[data-journey-next-detail]')!.textContent = data.detail;
    const next = home.querySelector<HTMLAnchorElement>('[data-journey-next]')!;
    next.href = scoped(data.href); next.textContent = data.action + ' →';
    const names = ['Connect', 'Create', 'Run', 'Monitor', 'Improve'];
    const descriptions = ['Connect MCP servers and explore their tools.', 'Choose a job and define success.', 'Try, approve, and schedule work.', 'Understand actions and results.', 'Measure quality with evals.'];
    const targets = ['/agents#connect', '/agents#create', '/agents#run', '/#activity', '/#evals'];
    home.querySelector('.journey-track')!.replaceChildren(...names.map((name, i) => {
      const li = doc.createElement('li'); li.dataset.next = String(i === data.next);
      const link = doc.createElement(demo && i !== 3 ? 'div' : 'a');
      if (link.tagName === "A") (link as HTMLAnchorElement).href = scoped(targets[i]);
      for (const [tag, text] of [['span', `0${i + 1}`], ['strong', name], ['p', descriptions[i]], ['small', data.states[i]]]) {
        const element = doc.createElement(tag); element.textContent = text; link.append(element);
      }
      li.append(link); return li;
    }));
  }
  async function refresh() {
    const current = ++generation;
    if (!home || stage !== 'home') return;
    if (demo) return render({ next: 3, title: 'Explore an agent in action', detail: 'This workspace uses synthetic fixtures. Follow its activity, finalized jobs and quality evidence in Monitor.', href: '/#activity', action: 'Explore Monitor', states: ['Operator console', 'Operator console', 'Operator console', 'Synthetic evidence', 'Operator console'] });
    if (!tenant) return render(progress('', null, null));
    render({next:-1,title:'Checking your workspace…',detail:'Reading connected servers and recent runs for this workspace.',href:'/#setup',action:'Open workspace settings',states:Array(5).fill('Checking…')});
    const selected = tenant;
    async function read(path: string) {
      try { const response = await runtime.fetch(path, { credentials: 'same-origin', redirect: 'error', headers: { Accept: 'application/json' } }); return response.ok ? await response.json() : null; } catch { return null; }
    }
    const [setup, state] = await Promise.all([read(`/api/console/onboarding/tenants/${encodeURIComponent(selected)}/setup`), read(`/api/agents/${encodeURIComponent(selected)}/state`)]);
    if (current !== generation || tenant !== selected) return;
    const objects = (value: unknown): value is Record<string, unknown>[] => Array.isArray(value) && value.every(item => item !== null && typeof item === 'object' && !Array.isArray(item));
    const validSetup = setup && objects(setup.sources) && setup.tenant?.tenant_id === selected;
    const validState = state && objects(state.connections) && objects(state.agents) && objects(state.runs);
    render(progress(selected, validSetup ? setup : null, validState ? state : null));
  }
  runtime.agentActionJourney = {
    setWorkspace(selected, publicDemo = false) {
      tenant = selected; demo = publicDemo;
      for (const link of links()) {
        link.setAttribute('href', scoped(link.getAttribute('href')!));
        if (link.hasAttribute("data-recurring-link") || link.hasAttribute("data-notifications-link")) link.hidden = demo;
        if (link.dataset.stage || link.dataset.utility) link.hidden = demo && !['home', 'monitor'].includes(link.dataset.stage || '');
      }
      const settingsNav = doc.querySelector<HTMLElement>('[data-workspace-navigation]');
      if (settingsNav) settingsNav.hidden = demo;
      void refresh();
    },
    setView(value) { const changed = stage !== value; stage = value; if (changed && stage === 'home') void refresh(); if (home) home.hidden = stage !== 'home'; for (const link of links()) if (link.dataset.stage || link.dataset.utility) link.setAttribute('aria-current', (link.dataset.stage || link.dataset.utility) === stage ? 'page' : 'false'); },
    refresh() { void refresh(); },
  };
}
export const JOURNEY_JS = `(${journeyApp.toString()})(window, ${journeyProgress.toString()});`;
