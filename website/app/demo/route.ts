const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorization is a sequence — AgentAction demo</title>
<meta name="description" content="An interactive simulation of temporal authorization across five MCP servers, with evidence challenges, customer history and sanitization.">
<link rel="canonical" href="https://agentaction.dev/demo"><link rel="icon" href="/favicon.png">
<link rel="stylesheet" href="/demo/demo.css"><script type="module" src="/demo/demo.js"></script></head>
<body><a class="skip" href="#main">Skip to demo</a>
<header class="topbar"><a class="brand" href="/">AgentAction<span class="brand-dot" aria-hidden="true"></span></a><span class="simulation-label">Experimental simulation · synthetic MCP servers</span><button id="present" type="button" aria-pressed="false">Presentation view</button><a href="/gateway">About the gateway ↗</a></header>
<main id="main">
<section class="intro"><div><p class="eyebrow">ONE AGENT / FIVE MCP SERVERS / EVOLVING CONTEXT</p><h1>Authorization is a <em>sequence.</em></h1><p class="lede">Every next action depends on what happened before.</p></div><div class="task"><span class="eyebrow">AGENT TASK</span><p>Resolve a duplicate charge.<br> Notify the customer.</p><span>cus_104 · ord_208 · $750</span></div></section>
<section class="controls" aria-label="Demo controls"><label class="scenario-label" for="scenario">Explore a scenario<select id="scenario"></select></label><div class="transport"><button id="play" class="primary" type="button">▶ Play sequence</button><button id="back" type="button" aria-label="Previous step">← Back</button><button id="next" type="button">Next step →</button><button id="reset" type="button">↺ Reset</button><label class="speed-label" for="speed">Pace<select id="speed"><option value="2400">Guided</option><option value="800">Fast</option></select></label></div></section>
<p id="scenario-description" class="scenario-description"></p>
<section class="server-map" aria-label="MCP server access map"><div class="agent-node"><span class="node-orbit" aria-hidden="true">✳</span><div><strong>Support agent</strong><span>One task. Scoped access.</span></div><span id="clock" class="clock">T+00s</span></div><div id="servers" class="server-grid"></div></section>
<div class="workspace"><section class="timeline-panel" aria-labelledby="timeline-title"><div class="panel-head"><h2 id="timeline-title">Live tool sequence</h2><span id="progress">0 / 10</span></div><div class="progress-track"><div id="progress-fill"></div></div><p class="panel-note">Select a completed call to inspect its decision.</p><ol id="timeline" class="timeline"></ol></section>
<section class="assessment-panel" aria-label="Current access assessment"><div class="panel-head"><h2>decision.assess</h2><span id="assessment-state" class="badge ready">READY</span></div><div id="assessment" aria-live="polite" aria-atomic="true"></div></section></div>
<section class="history-panel" aria-labelledby="history-title"><div class="panel-head"><h2 id="history-title">Customer history</h2><span id="history-state">Awaiting scoped access</span></div><p class="panel-note">Previous transactions provide context. Claim frequency alone is not evidence of abuse.</p><div id="history" class="history-grid"></div></section>
<footer><p><strong>AgentAction / Temporal authorization</strong><br>Illustrative policies and field allowlists. No live MCP calls, model inference or real actions.</p><p>ALLOW · CHALLENGE · DENY<br><span>SANITIZE can accompany an allowed call.</span></p></footer>
<noscript>This interactive demo needs JavaScript. It illustrates five MCP servers, evidence challenges, sanitization and decisions that change with customer history and execution state. No real tools are called.</noscript>
</main></body></html>`;

export function GET() {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}
