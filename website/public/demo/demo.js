import { servers, scenarios, initialState, advance, planFor, historyFor } from './engine.js';

const $ = id => document.getElementById(id);
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
let state = initialState();
let selected = -1;
let timer = null;
const scenarioSelect = $('scenario');
for (const scenario of scenarios) {
  const option = node('option', '', scenario.name);
  option.value = scenario.id;
  scenarioSelect.append(option);
}

function pause() {
  clearTimeout(timer);
  timer = null;
  $('play').textContent = state.cursor === planFor(state.scenario).length ? '↺ Replay sequence' : '▶ Play sequence';
}

function step() {
  state = advance(state);
  selected = state.events.length - 1;
  render();
}

function schedule() {
  $('play').textContent = 'Ⅱ Pause';
  timer = setTimeout(() => {
    step();
    if (state.cursor < planFor(state.scenario).length) schedule();
    else pause();
  }, Number($('speed').value));
}

function reset(scenario = state.scenario) {
  pause();
  state = initialState(scenario);
  selected = -1;
  render();
}

$('play').addEventListener('click', () => {
  if (timer !== null) return pause();
  if (state.cursor === planFor(state.scenario).length) reset();
  if (state.cursor === 0) step();
  schedule();
});
$('next').addEventListener('click', () => { pause(); step(); pause(); });
$('back').addEventListener('click', () => {
  const target = Math.max(0, state.cursor - 1);
  reset();
  while (state.cursor < target) state = advance(state);
  selected = state.cursor - 1;
  render();
});
$('reset').addEventListener('click', () => reset());
scenarioSelect.addEventListener('change', () => reset(scenarioSelect.value));
$('present').addEventListener('click', () => {
  const compact = document.body.classList.toggle('compact-view');
  $('present').setAttribute('aria-pressed', String(compact));
  $('present').textContent = compact ? 'Expanded view' : 'Presentation view';
  render();
});
$('speed').addEventListener('change', () => { if (timer !== null) { pause(); schedule(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

function renderServers(event) {
  $('servers').replaceChildren();
  for (const server of servers) {
    const relevant = state.events.filter(e => e.server === server.id);
    const last = relevant.at(-1);
    const active = event?.server === server.id;
    const card = node('div', `server-card${active ? ' active' : ''}`);
    const header = node('div', 'server-card-head');
    header.append(node('span', 'server-icon', ({ crm: '01', orders: '02', history: '03', payments: '04', messaging: '05' })[server.id]), node('span', `server-dot ${last?.decision.toLowerCase() ?? 'idle'}`));
    card.append(header, node('h3', '', server.name), node('span', 'server-type', `${server.id}.mcp · simulated`));
    const toolList = node('div', 'tool-list');
    for (const tool of server.tools) {
      const toolLabel = node('code', `${event?.tool === tool && active ? 'active-tool' : ''}${tool === 'customers.export' ? ' locked-tool' : ''}`, tool);
      toolList.append(toolLabel);
    }
    card.append(toolList, node('p', 'scope', server.scope), node('span', 'call-count', `${relevant.length} call${relevant.length === 1 ? '' : 's'} assessed`));
    $('servers').append(card);
  }
}

function renderTimeline() {
  const list = $('timeline');
  list.replaceChildren();
  planFor(state.scenario).forEach((call, index) => {
    const event = state.events[index];
    const item = node('li', `timeline-item${selected === index ? ' selected' : ''}${event ? ' completed' : ''}`);
    const button = node('button', 'timeline-call');
    button.type = 'button';
    button.disabled = !event;
    button.setAttribute('aria-label', `${index + 1}. ${servers.find(s => s.id === call.server).name}: ${call.tool}${event ? `, ${event.decision}${event.sanitized ? ', sanitized' : ''}` : ', upcoming'}`);
    if (selected === index) button.setAttribute('aria-current', 'step');
    button.append(node('span', 'step-number', String(index + 1).padStart(2, '0')));
    const text = node('span', 'call-text');
    text.append(node('span', 'call-server', servers.find(s => s.id === call.server).name), node('code', '', call.tool));
    const outcome = node('span', `call-outcome ${event?.decision.toLowerCase() ?? ''}`, event?.decision ?? 'QUEUED');
    if (event?.sanitized) outcome.append(node('small', '', '+ SANITIZE'));
    button.append(text, outcome);
    button.addEventListener('click', () => { pause(); selected = index; render(); });
    item.append(button);
    list.append(item);
  });
  const current = list.querySelector('.selected');
  if (current) {
    const top = current.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
    if (top < list.scrollTop || top + current.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top;
  }
}

function renderAssessment(event) {
  const area = $('assessment');
  area.replaceChildren();
  $('assessment-state').className = `badge ${event?.decision.toLowerCase() ?? 'ready'}`;
  $('assessment-state').textContent = event?.decision ?? 'READY';
  if (!event) {
    const ready = node('div', 'empty-state');
    ready.append(node('span', 'empty-symbol', '↗'), node('h2', '', 'Watch authority evolve.'), node('p', '', 'One agent crosses five MCP servers. Each tool has its own boundary; every decision draws on the sequence so far.'), node('p', 'empty-hint', 'Press Play sequence or advance one step at a time.'));
    area.append(ready);
    return;
  }
  const heading = node('div', 'assessment-intro');
  heading.append(node('p', 'eyebrow', `${event.id} / ${event.server}.mcp / T+${event.at}s${selected < state.cursor - 1 ? ' / HISTORICAL CALL' : ''}`), node('h2', '', event.title), node('p', 'reason', event.reason));
  if (event.timeJump) heading.append(node('span', 'time-jump', `Clock advanced +${event.timeJump}s`));
  area.append(heading);
  const policy = node('div', 'policy-row');
  policy.append(node('span', 'eyebrow', 'POLICY'), node('code', '', event.policy));
  area.append(policy);
  if (event.required.length) {
    const required = node('div', 'required-evidence');
    required.append(node('h3', '', 'Evidence challenge → agent’s next task'));
    const list = node('ul');
    for (const text of event.required) list.append(node('li', '', text));
    required.append(list);
    area.append(required);
  }
  const payload = node('details', 'payload', undefined);
  payload.open = event.sanitized;
  payload.append(node('summary', '', event.sanitized ? 'SANITIZE / What crosses the boundary' : 'Tool request & result'));
  const columns = node('div', 'payload-columns');
  for (const [label, value] of event.sanitized ? [['SOURCE / BEFORE', event.before], ['RELEASED / AFTER', event.after]] : [['REQUEST', event.request], ['RESULT', event.after ?? { executed: false, reason: event.decision }]]) {
    const column = node('div', 'payload-column');
    column.append(node('span', 'eyebrow', label), node('pre', '', JSON.stringify(value, null, 2)));
    columns.append(column);
  }
  payload.append(columns);
  if (event.sanitized) payload.append(node('p', 'payload-note', 'Later decisions reference the released structured fields. Excluded text and fields supply no authority.'));
  area.append(payload);
  const context = node('div', 'context');
  const contextHead = node('div', 'context-head');
  contextHead.append(node('h3', '', 'Context after this call'), node('span', '', `${event.contextAfter.length} retained facts`));
  context.append(contextHead);
  const facts = node('div', 'facts');
  for (const fact of event.contextAfter) {
    const expired = fact.expiresAt !== null && fact.expiresAt <= event.at;
    const used = event.evidence.some(f => f.kind === fact.kind && f.source === fact.source);
    const chip = node('div', `fact${expired ? ' expired' : ''}${used ? ' used' : ''}`);
    chip.append(node('strong', '', fact.kind), node('span', '', `${fact.source} · ${fact.subject}${fact.expiresAt === null ? '' : expired ? ' · EXPIRED' : ` · expires T+${fact.expiresAt}s`}`));
    chip.title = `${fact.provenance}. Observed at T+${fact.observedAt}s. ${JSON.stringify(fact.value)}`;
    facts.append(chip);
  }
  context.append(facts, node('p', 'context-note', 'Outlined facts informed this decision. All provenance is simulated provider evidence.'));
  area.append(context);
  const execution = node('div', `execution ${event.executed ? 'executed' : 'held'}`);
  execution.append(node('span', '', event.executed ? '● TOOL EXECUTED' : '◌ TOOL NOT EXECUTED'), node('span', '', event.sanitized ? 'Payload sanitized' : event.decision === 'ALLOW' ? 'Evidence retained' : 'Boundary held'));
  area.append(execution);
}

function renderHistory(event) {
  const historyKnown = event?.contextAfter.some(f => f.kind === 'history');
  $('history-state').textContent = historyKnown ? 'Scoped history loaded · simulated provider records' : 'Awaiting scoped access';
  $('history').replaceChildren();
  if (!historyKnown) {
    $('history').append(node('p', 'history-empty', 'The agent must establish identity and order ownership before reading customer history.'));
    return;
  }
  for (const historic of historyFor(state.scenario)) {
    const card = node('div', `history-event${historic.relevant ? ' relevant' : ''}`);
    card.append(node('span', 'eyebrow', historic.when), node('h3', '', historic.label), node('p', '', historic.detail));
    $('history').append(card);
  }
}

function render() {
  const event = state.events[selected];
  const total = planFor(state.scenario).length;
  $('scenario-description').textContent = scenarios.find(s => s.id === state.scenario).description;
  $('progress').textContent = `${state.cursor} / ${total}`;
  $('progress-fill').style.width = `${state.cursor / total * 100}%`;
  $('clock').textContent = `T+${String(state.now).padStart(2, '0')}s`;
  $('next').disabled = state.cursor >= total;
  $('back').disabled = state.cursor === 0;
  renderServers(event);
  renderTimeline();
  renderAssessment(event);
  renderHistory(event);
}
render();
