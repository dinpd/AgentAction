from __future__ import annotations

from pathlib import Path


MCP_UI_HTML = r"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AgentID MCP Analyzer</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fa;
      --panel: #ffffff;
      --soft: #edf2f7;
      --ink: #172033;
      --muted: #667085;
      --line: #d7dee8;
      --accent: #0f766e;
      --accent-soft: #dff7f2;
      --danger: #b42318;
      --warn: #b54708;
      --ok: #027a48;
      --code: #101828;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.4;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 24px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
      position: sticky;
      top: 0;
      z-index: 10;
    }

    h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 750;
    }

    main {
      display: grid;
      grid-template-columns: minmax(360px, 480px) minmax(0, 1fr);
      min-height: calc(100vh - 73px);
    }

    aside {
      border-right: 1px solid var(--line);
      background: var(--panel);
      padding: 18px;
      display: grid;
      gap: 14px;
      align-content: start;
    }

    section {
      padding: 18px;
      min-width: 0;
    }

    h2 {
      margin: 0 0 10px;
      font-size: 14px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0;
    }

    textarea {
      width: 100%;
      min-height: 320px;
      resize: vertical;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: var(--ink);
      background: #fff;
    }

    textarea.compact {
      min-height: 78px;
    }

    input[type="file"], input[type="url"] {
      width: 100%;
      border: 1px dashed var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #fff;
    }

    input[type="url"] {
      border-style: solid;
      min-height: 38px;
      font: inherit;
      color: var(--ink);
    }

    button {
      border: 1px solid var(--line);
      background: #fff;
      color: var(--ink);
      min-height: 38px;
      padding: 8px 12px;
      border-radius: 6px;
      font-weight: 700;
      cursor: pointer;
    }

    button.primary {
      border-color: var(--accent);
      background: var(--accent);
      color: #fff;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    .row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .hint, .error {
      font-size: 12px;
    }

    .hint { color: var(--muted); }
    .error { color: var(--danger); min-height: 18px; }

    .summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }

    .metric, .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
    }

    .metric {
      padding: 14px;
      min-height: 94px;
    }

    .metric .label {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }

    .metric .value {
      margin-top: 8px;
      font-size: 28px;
      font-weight: 800;
    }

    .metric .sub {
      color: var(--muted);
      font-size: 12px;
    }

    .workspace {
      display: grid;
      grid-template-columns: minmax(340px, 1fr) minmax(320px, 440px);
      gap: 14px;
    }

    .panel {
      min-width: 0;
      overflow: hidden;
    }

    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      background: #fbfcfe;
    }

    .panel-head h2 { margin: 0; }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    th, td {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }

    th {
      color: var(--muted);
      background: #fbfcfe;
      font-size: 12px;
    }

    tr[data-selected="true"] {
      background: var(--accent-soft);
    }

    tr.tool-row { cursor: pointer; }

    .badge {
      display: inline-flex;
      align-items: center;
      min-height: 22px;
      padding: 2px 8px;
      border: 1px solid var(--line);
      border-radius: 999px;
      font-size: 12px;
      font-weight: 750;
      background: #fff;
    }

    .low { color: var(--ok); border-color: #abefc6; background: #ecfdf3; }
    .medium { color: #175cd3; border-color: #b2ccff; background: #eff4ff; }
    .high { color: var(--warn); border-color: #fedf89; background: #fffaeb; }
    .critical { color: var(--danger); border-color: #fecdca; background: #fef3f2; }

    .detail {
      padding: 14px;
      display: grid;
      gap: 14px;
    }

    .detail h3 {
      margin: 0;
      font-size: 18px;
      overflow-wrap: anywhere;
    }

    .chips {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    ul {
      margin: 8px 0 0;
      padding-left: 18px;
    }

    li { margin: 4px 0; }

    pre {
      margin: 0;
      padding: 12px;
      overflow: auto;
      border-radius: 8px;
      color: #f8fafc;
      background: var(--code);
      font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      white-space: pre;
    }

    .empty {
      padding: 28px;
      color: var(--muted);
      text-align: center;
    }

    @media (max-width: 1100px) {
      main, .workspace {
        grid-template-columns: 1fr;
      }

      aside {
        border-right: 0;
        border-bottom: 1px solid var(--line);
      }

      .summary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>AgentID MCP Analyzer</h1>
    <div class="row">
      <button id="loadSample">Load sample</button>
      <button id="exportJson" disabled>Export JSON</button>
      <button id="copyMarkdown" disabled>Copy Markdown</button>
    </div>
  </header>

  <main>
    <aside>
      <div>
        <h2>Input</h2>
        <input id="fileInput" type="file" accept="application/json,.json">
        <p class="hint">Paste or upload a saved MCP <code>tools/list</code> response. Analysis runs in this browser tab.</p>
      </div>
      <div>
        <h2>Remote MCP</h2>
        <input id="remoteUrl" type="url" placeholder="https://mcp.example.com/mcp">
        <textarea id="remoteHeaders" class="compact" spellcheck="false" placeholder="Authorization: Bearer ..."></textarea>
        <div class="row">
          <button id="fetchRemote">Fetch tools</button>
        </div>
        <p class="hint">Remote fetch requires <code>agentid mcp serve-ui</code>. Headers stay on localhost.</p>
      </div>
      <textarea id="input" spellcheck="false" placeholder='{"jsonrpc":"2.0","id":1,"result":{"tools":[]}}'></textarea>
      <div class="row">
        <button id="analyze" class="primary">Analyze</button>
        <button id="clear">Clear</button>
      </div>
      <div>
        <h2>Compare Drift</h2>
        <textarea id="previousInput" class="compact" spellcheck="false" placeholder="Paste previous tools/list JSON"></textarea>
        <div class="row">
          <button id="compareDrift">Compare</button>
        </div>
        <p class="hint">Compare a previous tool surface with the current input to find added, removed, and changed tools.</p>
      </div>
      <div id="error" class="error"></div>
    </aside>

    <section>
      <div id="summary" class="summary"></div>
      <div id="driftPanel" class="panel" style="margin-bottom:14px"></div>
      <div class="workspace">
        <div class="panel">
          <div class="panel-head">
            <h2>Tools</h2>
            <span id="toolCount" class="hint">No tools analyzed</span>
          </div>
          <div id="tools"></div>
        </div>
        <div class="panel">
          <div class="panel-head">
            <h2>Details</h2>
          </div>
          <div id="details" class="detail"></div>
        </div>
      </div>
    </section>
  </main>

  <script>
    const RISKY_NAME_KEYWORDS = {
      delete: ["delete/destructive", 24],
      remove: ["delete/destructive", 20],
      destroy: ["delete/destructive", 24],
      drop: ["delete/destructive", 24],
      truncate: ["delete/destructive", 24],
      write: ["write", 16],
      update: ["write", 16],
      create: ["write", 14],
      insert: ["write", 14],
      send: ["external send", 18],
      email: ["external send", 14],
      slack: ["external send", 12],
      deploy: ["deployment", 22],
      exec: ["execution", 28],
      execute: ["execution", 28],
      shell: ["execution", 30],
      command: ["execution", 26],
      admin: ["admin", 26],
      permission: ["identity/access", 22],
      role: ["identity/access", 18],
      policy: ["identity/access", 18],
      token: ["secrets", 22],
      secret: ["secrets", 24],
      key: ["secrets", 12],
      payment: ["payment", 24],
      refund: ["payment", 18],
      charge: ["payment", 22],
      sql: ["database", 20],
      query: ["database", 10],
      database: ["database", 18],
      file: ["filesystem", 12],
      path: ["filesystem", 12],
      browser: ["browser/network", 14],
      url: ["browser/network", 10],
      http: ["browser/network", 10],
      cloud: ["cloud", 18]
    };

    const SENSITIVE_ARGUMENTS = {
      command: ["arbitrary command argument", 24],
      cmd: ["arbitrary command argument", 24],
      script: ["script argument", 20],
      path: ["filesystem path argument", 16],
      file: ["filesystem argument", 12],
      filename: ["filesystem argument", 12],
      directory: ["filesystem path argument", 14],
      url: ["network URL argument", 14],
      uri: ["network URI argument", 10],
      query: ["query argument", 14],
      sql: ["SQL argument", 24],
      token: ["token argument", 22],
      secret: ["secret argument", 24],
      password: ["password argument", 24],
      key: ["key argument", 12],
      recipient: ["recipient argument", 12],
      email: ["email argument", 10],
      amount: ["amount argument", 16],
      role: ["role argument", 16],
      permission: ["permission argument", 20],
      policy: ["policy argument", 18]
    };

    const WRITE_HINTS = new Set(["write", "update", "create", "insert", "send", "post", "put", "patch", "delete", "remove", "destroy"]);
    const ADMIN_HINTS = new Set(["admin", "permission", "policy", "role", "token", "secret", "key"]);
    const EXECUTE_HINTS = new Set(["exec", "execute", "shell", "command", "run", "deploy"]);

    const sample = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        tools: [
          {
            name: "crm.search_customer",
            description: "Search customer records in the CRM.",
            inputSchema: {
              type: "object",
              properties: { customer_id: { type: "string" } },
              required: ["customer_id"]
            }
          },
          {
            name: "crm.update_customer",
            description: "Update customer records in the CRM.",
            inputSchema: {
              type: "object",
              properties: {
                customer_id: { type: "string" },
                email: { type: "string" },
                role: { type: "string" }
              },
              required: ["customer_id"]
            }
          },
          {
            name: "shell.execute_command",
            description: "Execute a shell command on the host.",
            inputSchema: {
              type: "object",
              properties: {
                command: { type: "string" },
                working_directory: { type: "string" }
              },
              required: ["command"]
            }
          }
        ]
      }
    };

    const input = document.getElementById("input");
    const error = document.getElementById("error");
    const summary = document.getElementById("summary");
    const toolsEl = document.getElementById("tools");
    const details = document.getElementById("details");
    const driftPanel = document.getElementById("driftPanel");
    const toolCount = document.getElementById("toolCount");
    const exportJson = document.getElementById("exportJson");
    const copyMarkdown = document.getElementById("copyMarkdown");

    let currentAnalysis = null;
    let selectedTool = null;
    let currentDiff = null;

    function toolsFromPayload(payload) {
      if (Array.isArray(payload)) return payload;
      if (payload && Array.isArray(payload.tools)) return payload.tools;
      if (payload && payload.result && Array.isArray(payload.result.tools)) return payload.result.tools;
      throw new Error("Expected a tools/list response, an object with tools, or a tools array.");
    }

    function analyzeTools(tools) {
      const analyses = tools.map(analyzeTool).sort((a, b) => b.risk_score - a.risk_score || a.name.localeCompare(b.name));
      let score = analyses.length ? Math.max(...analyses.map((tool) => tool.risk_score)) : 0;
      if (analyses.length > 10) score = Math.min(100, score + 8);
      if (analyses.length > 25) score = Math.min(100, score + 8);

      const high = analyses.filter((tool) => tool.risk_score >= 50 && tool.risk_score < 75);
      const critical = analyses.filter((tool) => tool.risk_score >= 75);
      const findings = [];
      if (high.length) findings.push(`${high.length} high-risk ${plural("tool", high.length)} detected`);
      if (critical.length) findings.push(`${critical.length} critical-risk ${plural("tool", critical.length)} detected`);
      if (analyses.length > 10) findings.push("large MCP tool surface");

      return {
        risk_score: score,
        risk_label: riskLabel(score),
        tool_count: analyses.length,
        highest_risk_tools: analyses.filter((tool) => tool.risk_score >= 25).slice(0, 5).map((tool) => tool.name),
        findings,
        tools: analyses
      };
    }

    function analyzeTool(tool) {
      const name = String(tool.name || "");
      const description = String(tool.description || "");
      const schema = tool.inputSchema || tool.input_schema || {};
      const argumentNames = inputArgumentNames(schema);
      const haystack = `${name} ${description}`.toLowerCase();
      const tokens = new Set(splitWords(haystack));
      let score = 0;
      const categories = new Set();
      const findings = [];

      for (const [keyword, [category, points]] of Object.entries(RISKY_NAME_KEYWORDS)) {
        if (haystack.includes(keyword)) {
          categories.add(category);
          score += points;
        }
      }

      const sensitiveArguments = [];
      for (const arg of argumentNames) {
        const lower = arg.toLowerCase();
        for (const [keyword, [finding, points]] of Object.entries(SENSITIVE_ARGUMENTS)) {
          if (lower.includes(keyword)) {
            sensitiveArguments.push(arg);
            score += points;
            findings.push(`${arg}: ${finding}`);
            break;
          }
        }
      }

      const action = inferAction(tokens);
      if (action === "read") score += 8;
      if (action === "write") {
        score += 22;
        findings.push("tool appears to modify state");
      }
      if (action === "execute") {
        score += 34;
        findings.push("tool appears to execute commands or deployments");
      }
      if (action === "admin") {
        score += 38;
        findings.push("tool appears to affect identity, secrets, policy, or administration");
      }
      if (!name) {
        findings.push("tool is missing a name");
        score += 8;
      }
      if (!description) {
        findings.push("tool is missing a description");
        score += 6;
      }
      if (!argumentNames.length) {
        findings.push("tool input schema has no declared arguments");
        score += 4;
      }

      score = Math.max(0, Math.min(100, score));
      return {
        name: name || "<unnamed>",
        risk_score: score,
        risk_label: riskLabel(score),
        action,
        categories: [...categories].sort(),
        sensitive_arguments: [...new Set(sensitiveArguments)].sort(),
        findings: [...new Set(findings)].sort(),
        remediation: remediationFor(score, action, categories, sensitiveArguments)
      };
    }

    function render(analysis) {
      currentAnalysis = analysis;
      selectedTool = analysis.tools[0] || null;
      exportJson.disabled = !analysis;
      copyMarkdown.disabled = !analysis;
      renderSummary();
      renderDrift();
      renderTools();
      renderDetails();
    }

    function renderSummary() {
      const high = currentAnalysis.tools.filter((tool) => tool.risk_label === "high").length;
      const critical = currentAnalysis.tools.filter((tool) => tool.risk_label === "critical").length;
      summary.innerHTML = [
        metric("Overall risk", `${currentAnalysis.risk_score}/100`, currentAnalysis.risk_label),
        metric("Tools", currentAnalysis.tool_count, "analyzed"),
        metric("High", high, "tools"),
        metric("Critical", critical, "tools")
      ].join("");
    }

    function metric(label, value, sub) {
      return `<div class="metric"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(String(value))}</div><div class="sub">${escapeHtml(sub)}</div></div>`;
    }

    function renderTools() {
      toolCount.textContent = `${currentAnalysis.tool_count} ${plural("tool", currentAnalysis.tool_count)} analyzed`;
      if (!currentAnalysis.tools.length) {
        toolsEl.innerHTML = `<div class="empty">No tools found.</div>`;
        return;
      }
      toolsEl.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>Tool</th>
              <th>Action</th>
              <th>Risk</th>
              <th>Sensitive args</th>
            </tr>
          </thead>
          <tbody>
            ${currentAnalysis.tools.map((tool, index) => `
              <tr class="tool-row" data-index="${index}" data-selected="${selectedTool && selectedTool.name === tool.name}">
                <td>${escapeHtml(tool.name)}</td>
                <td>${escapeHtml(tool.action)}</td>
                <td><span class="badge ${tool.risk_label}">${tool.risk_score}/100 ${tool.risk_label}</span></td>
                <td>${tool.sensitive_arguments.map(escapeHtml).join(", ") || "-"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    }

    function renderDrift() {
      if (!currentDiff) {
        driftPanel.innerHTML = `<div class="empty">Compare mode has not run.</div>`;
        return;
      }
      driftPanel.innerHTML = `
        <div class="panel-head"><h2>Drift</h2><span class="hint">${currentDiff.findings.length} findings</span></div>
        <div class="detail">
          <div class="summary">
            ${metric("Added", currentDiff.added_tools.length, "tools")}
            ${metric("Removed", currentDiff.removed_tools.length, "tools")}
            ${metric("Changed", currentDiff.changed_tools.length, "tools")}
            ${metric("Risk", currentDiff.findings.some((finding) => finding.includes("high-risk") || finding.includes("risk increased")) ? "Review" : "Stable", "drift")}
          </div>
          <div><h2>Findings</h2>${list(currentDiff.findings.length ? currentDiff.findings : ["No drift findings."])}</div>
        </div>
      `;
    }

    function renderDetails() {
      if (!selectedTool) {
        details.innerHTML = `<div class="empty">Select a tool to inspect findings and remediation.</div>`;
        return;
      }
      details.innerHTML = `
        <div>
          <h3>${escapeHtml(selectedTool.name)}</h3>
          <div class="chips">
            <span class="badge ${selectedTool.risk_label}">${selectedTool.risk_score}/100 ${selectedTool.risk_label}</span>
            <span class="badge">${escapeHtml(selectedTool.action)}</span>
            ${selectedTool.categories.map((category) => `<span class="badge">${escapeHtml(category)}</span>`).join("")}
          </div>
        </div>
        <div>
          <h2>Findings</h2>
          ${list(selectedTool.findings.length ? selectedTool.findings : ["No specific findings beyond baseline manifest and audit recommendations."])}
        </div>
        <div>
          <h2>Remediation</h2>
          ${list(selectedTool.remediation)}
        </div>
        <div>
          <h2>AgentID Manifest Snippet</h2>
          <pre>${escapeHtml(manifestSnippet(selectedTool))}</pre>
        </div>
      `;
    }

    function list(items) {
      return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
    }

    function manifestSnippet(tool) {
      const authMode = ["write", "execute", "admin"].includes(tool.action) ? "just_in_time" : "delegated";
      const approval = ["write", "execute", "admin"].includes(tool.action) ? "human_confirm" : "none";
      return [
        "tools:",
        `  - name: ${tool.name}`,
        `    access: ${tool.action}`,
        `    auth_mode: ${authMode}`,
        `    approval: ${approval}`,
        ...(authMode === "just_in_time" ? ["    constraints:", "      token_ttl_seconds: 300", "      resource: \"*\""] : [])
      ].join("\n");
    }

    function reportManifestSnippet(analysis) {
      const snippets = analysis.tools
        .filter((tool) => tool.risk_score >= 25)
        .slice(0, 8)
        .map((tool) => manifestSnippet(tool).split("\n").slice(1).join("\n"));
      if (!snippets.length) return "tools: []";
      return ["tools:", ...snippets].join("\n");
    }

    function diffTools(beforeTools, afterTools) {
      const before = Object.fromEntries(beforeTools.filter((tool) => tool.name).map((tool) => [String(tool.name), tool]));
      const after = Object.fromEntries(afterTools.filter((tool) => tool.name).map((tool) => [String(tool.name), tool]));
      const beforeNames = new Set(Object.keys(before));
      const afterNames = new Set(Object.keys(after));
      const added = [...afterNames].filter((name) => !beforeNames.has(name)).sort();
      const removed = [...beforeNames].filter((name) => !afterNames.has(name)).sort();
      const changed = [...afterNames].filter((name) => beforeNames.has(name) && JSON.stringify(normalizedTool(before[name])) !== JSON.stringify(normalizedTool(after[name]))).sort();
      const findings = [];
      if (added.length) findings.push(`${added.length} new ${plural("tool", added.length)} exposed`);
      if (removed.length) findings.push(`${removed.length} ${plural("tool", removed.length)} removed`);
      if (changed.length) findings.push(`${changed.length} tool schemas or descriptions changed`);
      for (const name of added) {
        const analysis = analyzeTool(after[name]);
        if (analysis.risk_score >= 50) findings.push(`new high-risk tool: ${name} (${analysis.risk_label})`);
      }
      for (const name of changed) {
        const beforeAnalysis = analyzeTool(before[name]);
        const afterAnalysis = analyzeTool(after[name]);
        if (afterAnalysis.risk_score > beforeAnalysis.risk_score) {
          findings.push(`tool risk increased: ${name} (${beforeAnalysis.risk_label} -> ${afterAnalysis.risk_label})`);
        }
      }
      return { added_tools: added, removed_tools: removed, changed_tools: changed, findings };
    }

    function normalizedTool(tool) {
      return {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema || tool.input_schema
      };
    }

    function markdownReport() {
      if (!currentAnalysis) return "";
      const riskyTools = currentAnalysis.tools
        .filter((tool) => tool.risk_score >= 25)
        .slice(0, 8)
        .map((tool) => `- ${tool.name}: ${tool.risk_score}/100 (${tool.risk_label}, ${tool.action})`);
      const lines = [
        "# AgentID MCP Analysis",
        "",
        `Risk score: ${currentAnalysis.risk_score}/100 (${currentAnalysis.risk_label})`,
        `Tools analyzed: ${currentAnalysis.tool_count}`,
        "",
        "## Findings",
        ...(currentAnalysis.findings.length ? currentAnalysis.findings.map((finding) => `- ${finding}`) : ["- No summary findings."]),
        "",
        "## Highest-Risk Tools",
        ...(riskyTools.length ? riskyTools : ["- None"]),
        "",
        "## Drift",
        ...(currentDiff ? currentDiff.findings.map((finding) => `- ${finding}`) : ["- Not compared."]),
        "",
        "## Remediation",
        "- Put high-risk tools behind gateway authorization.",
        "- Require approval or just-in-time authority for write, execute, and admin tools.",
        "- Bind authorization to user, agent, job, resource, and time window.",
        "- Log decisions and track tool drift in CI.",
        "",
        "## Starter AgentID Manifest Snippet",
        "```yaml",
        reportManifestSnippet(currentAnalysis),
        "```"
      ];
      return lines.join("\n");
    }

    function inputArgumentNames(schema) {
      if (!schema || typeof schema !== "object" || !schema.properties || typeof schema.properties !== "object") return [];
      return Object.keys(schema.properties);
    }

    function inferAction(tokens) {
      if ([...tokens].some((token) => ADMIN_HINTS.has(token))) return "admin";
      if ([...tokens].some((token) => EXECUTE_HINTS.has(token))) return "execute";
      if ([...tokens].some((token) => WRITE_HINTS.has(token))) return "write";
      return "read";
    }

    function remediationFor(score, action, categories, sensitiveArguments) {
      const remediation = [];
      if (score >= 50) remediation.push("run this tool behind a gateway authorization check");
      if (["write", "execute", "admin"].includes(action)) {
        remediation.push("require approval or just-in-time authority before execution");
        remediation.push("bind authorization to user, agent, job, resource, and time window");
      }
      if (sensitiveArguments.length) remediation.push("validate and constrain sensitive input arguments");
      if (["secrets", "identity/access", "admin"].some((category) => categories.has(category))) {
        remediation.push("add audit logging and a kill-switch for this capability");
      }
      if (!remediation.length) remediation.push("declare this tool in an AgentID manifest and audit usage");
      return remediation;
    }

    function splitWords(value) {
      return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(Boolean);
    }

    function riskLabel(score) {
      if (score < 25) return "low";
      if (score < 50) return "medium";
      if (score < 75) return "high";
      return "critical";
    }

    function parseHeaderLines(value) {
      const headers = {};
      for (const line of value.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const index = trimmed.indexOf(":");
        if (index <= 0) throw new Error(`Invalid header line: ${trimmed}`);
        headers[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
      }
      return headers;
    }

    function plural(word, count) {
      return count === 1 ? word : `${word}s`;
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    document.getElementById("analyze").addEventListener("click", () => {
      try {
        error.textContent = "";
        const payload = JSON.parse(input.value || "{}");
        currentDiff = null;
        render(analyzeTools(toolsFromPayload(payload)));
      } catch (err) {
        error.textContent = err.message;
      }
    });

    document.getElementById("clear").addEventListener("click", () => {
      input.value = "";
      document.getElementById("previousInput").value = "";
      currentDiff = null;
      error.textContent = "";
    });

    document.getElementById("loadSample").addEventListener("click", () => {
      input.value = JSON.stringify(sample, null, 2);
      error.textContent = "";
      currentDiff = null;
      render(analyzeTools(toolsFromPayload(sample)));
    });

    document.getElementById("fileInput").addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      input.value = await file.text();
      document.getElementById("analyze").click();
    });

    document.getElementById("fetchRemote").addEventListener("click", async () => {
      try {
        error.textContent = "";
        const url = document.getElementById("remoteUrl").value.trim();
        if (!url) throw new Error("Enter a remote MCP URL.");
        const response = await fetch("/api/fetch-tools", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            url,
            headers: parseHeaderLines(document.getElementById("remoteHeaders").value)
          })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Remote fetch failed.");
        input.value = JSON.stringify(payload.tools_list, null, 2);
        currentDiff = null;
        render(analyzeTools(toolsFromPayload(payload.tools_list)));
      } catch (err) {
        error.textContent = `${err.message} If this is the static HTML file, run agentid mcp serve-ui and open that local URL.`;
      }
    });

    document.getElementById("compareDrift").addEventListener("click", () => {
      try {
        error.textContent = "";
        const before = toolsFromPayload(JSON.parse(document.getElementById("previousInput").value || "{}"));
        const after = toolsFromPayload(JSON.parse(input.value || "{}"));
        currentDiff = diffTools(before, after);
        render(analyzeTools(after));
      } catch (err) {
        error.textContent = err.message;
      }
    });

    exportJson.addEventListener("click", async () => {
      if (!currentAnalysis) return;
      await navigator.clipboard.writeText(JSON.stringify({ analysis: currentAnalysis, drift: currentDiff }, null, 2));
      exportJson.textContent = "Copied";
      setTimeout(() => exportJson.textContent = "Export JSON", 900);
    });

    copyMarkdown.addEventListener("click", async () => {
      if (!currentAnalysis) return;
      await navigator.clipboard.writeText(markdownReport());
      copyMarkdown.textContent = "Copied";
      setTimeout(() => copyMarkdown.textContent = "Copy Markdown", 900);
    });

    toolsEl.addEventListener("click", (event) => {
      const row = event.target.closest("tr[data-index]");
      if (!row || !currentAnalysis) return;
      selectedTool = currentAnalysis.tools[Number(row.dataset.index)];
      renderTools();
      renderDetails();
    });

    summary.innerHTML = [
      metric("Overall risk", "-", "not analyzed"),
      metric("Tools", "-", "not analyzed"),
      metric("High", "-", "tools"),
      metric("Critical", "-", "tools")
    ].join("");
    toolsEl.innerHTML = `<div class="empty">Paste or upload a tools/list response to begin.</div>`;
    details.innerHTML = `<div class="empty">Analysis runs locally in this browser tab.</div>`;
    driftPanel.innerHTML = `<div class="empty">Compare mode has not run.</div>`;
  </script>
</body>
</html>
"""


def write_mcp_ui(path: str | Path) -> Path:
    output_path = Path(path)
    output_path.write_text(MCP_UI_HTML)
    return output_path
