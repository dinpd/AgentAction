import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { createHash } from "node:crypto";

const templateRoot = new URL("../", import.meta.url);

test("publishes the completion preprint with attribution, limits and the reviewed PDF", async () => {
  const path = "/research/completion-assessment";
  const response = await render(path);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Evaluating Agent Completion and Requests for Additional Evidence/);
  assert.match(html, /Dan Itkis, MsETM/);
  assert.match(html, /AgentAction.dev/);
  assert.match(html, /Preprint · Open for community review/);
  assert.doesNotMatch(html, /not yet peer reviewed|has not undergone independent peer review/i);
  assert.match(html, /Submit review comments on GitHub/);
  assert.match(html, /Comments are public/);
  const reviewHref = html.match(/href="([^"]+)">Submit review comments on GitHub/)?.[1];
  assert.ok(reviewHref);
  const reviewUrl = new URL(reviewHref.replaceAll("&amp;", "&").replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16))));
  assert.equal(reviewUrl.origin, "https://github.com");
  assert.equal(reviewUrl.pathname, "/dinpd/AgentAction/issues/new");
  assert.match(reviewUrl.searchParams.get("body"), /https:\/\/agentaction.dev\/research\/completion-assessment/);
  assert.match(html, /dateTime="2026-09-25"/i);
  assert.match(html, /no live LLM-generated agent trajectories, customer workloads/);
  assert.match(html, /not 620 independent task designs/);
  assert.match(html, /has a direct interest in the evaluated project/);
  assert.match(html, /rel="canonical" href="https:\/\/agentaction.dev\/research\/completion-assessment"/);
  assert.match(html, /name="citation_author" content="Dan Itkis"/);
  assert.match(html, /property="og:type" content="article"/);
  assert.match(html, /Completion-assessment research folder/);
  assert.ok(html.includes("https://github.com/dinpd/AgentAction/tree/59f324a33fe2fd04ae167e5bbd4cac0330c65c9e/research/completion-assessment"));
  assert.match(html, /id="abstract-title"/);
  assert.match(html, /The contribution is an executable evaluation protocol and a measured decision\/request interface/);
  assert.match(html, /id="download"/);
  assert.match(html, /Optional reader registration/);
  assert.match(html, /Download PDF—no registration required/);
  assert.match(html, /does not subscribe you to a mailing list/);
  assert.match(html, /<noscript>/);
  assert.match(html, /<input(?=[^>]*name="email")(?=[^>]*required)[^>]*>/);
  const figure = await readFile(new URL("../dist/client/research/completion-assessment/service-outcomes.png", import.meta.url));
  assert.equal(figure.subarray(1, 4).toString(), "PNG");
  assert.match(html, /controlled subset excludes dishonest-collector cases/);
  const pdf = `${path}/can-we-trust-done-2026-09-25.pdf`;
  assert.ok(html.includes(`href="${pdf}"`));
  const bytes = await readFile(new URL(`../dist/client${pdf}`, import.meta.url));
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  // Frozen reviewed manuscript: a different or stale PDF must not ship unnoticed.
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "a731936890628735b945718dbb6fe1006680926cb67480df5df88222e35ebac5");
  const home = await (await render("/")).text();
  assert.ok(home.includes(`href="${path}"`));
  assert.ok(home.includes('href="/research/jev"'));
  assert.ok(home.indexOf('id="completion-news-title"') < home.indexOf('id="jev-news-title"'));
  const sitemap = await (await render("/sitemap.xml")).text();
  assert.ok(sitemap.includes(`https://agentaction.dev${path}`));
});

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(new URL(pathname, "https://agentaction.dev"), {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("serves the isolated temporal MCP simulation and links it from the homepage", async () => {
  const response = await render('/demo');
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Authorization is a <em>sequence/);
  assert.match(html, /Experimental simulation · synthetic MCP servers/);
  assert.match(html, /Customer history/);
  assert.match(html, /No live MCP calls, model inference or real actions/);
  assert.match(html, /<noscript>/);
  for (const id of ['scenario', 'play', 'back', 'next', 'reset', 'speed', 'servers', 'timeline', 'assessment', 'history']) {
    assert.ok(html.includes(`id="${id}"`));
  }
  assert.match(response.headers.get('content-security-policy'), /connect-src 'none'/);
  assert.doesNotMatch(response.headers.get('content-security-policy'), /unsafe-inline/);
  const home = await (await render('/')).text();
  assert.match(home, /href="\/demo">Expand demo/);
  assert.match(home, /aria-label="Interactive multi-MCP authorization demo"/);
  assert.match(home, /id="hero-demo-scenario"/);
  assert.doesNotMatch(home, /class="decision-console"/);
  assert.doesNotMatch(home, /Manager approval is still required/);
  for (const asset of ['demo.js', 'engine.js', 'demo.css']) await access(new URL(`../dist/client/demo/${asset}`, import.meta.url));
});

test("website health recipe explains native recurring execution and exports appropriate setup", async () => {
  const response = await render("/recipes/website-health");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /AgentAction recurring workflows/);
  assert.match(html, /no MCP account is required/);
  assert.match(html, /not signed gateway Jobs/);
  const starter = await (await render("/recipes/website-health/download?format=json")).json();
  assert.equal(starter.recipe.runtime, "recurring");
  assert.deepEqual(starter.connections, []);
  assert.match(starter.setup[0], /Recurring agents/);
});

function structuredData(html) {
  return [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map(
    (match) => JSON.parse(match[1]),
  );
}

test("server-renders the complete AgentAction project site", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(response.headers.get("cache-control") ?? "", /s-maxage=/i);

  const html = await response.text();
  assert.match(html, /<title>AgentAction — Control what agents do\. Prove what happened\.<\/title>/i);
  assert.match(html, /<h1 id="hero-title">Control what agents do\.<span>Prove what happened\.<\/span><\/h1>/);
  assert.match(html, /AgentAction evaluates agent decisions, enforces policy before actions execute, and checks outcomes against the intended job\. Set the boundaries for autonomy, require approval for consequential actions, and follow the evidence from intent to outcome\./);
  assert.doesNotMatch(html, /Connect agents to tools|Safely and reliably|Then discover useful agents with AI/);
  assert.match(html, /href="\/demo"[^>]*>See action control in practice/);
  assert.match(html, /href="https:\/\/observability-console\.agentaction\.dev\/#setup"[^>]*>Start monitoring your agents/);
  assert.match(html, /<meta name="description" content="AgentAction evaluates agent decisions, enforces policy before actions execute, and checks outcomes against the intended job\."/);
  assert.doesNotMatch(html, /id="mcp-onboarding"|class="mcp-steps"/);
  assert.match(html, /Public findings are not safety certification/);
  assert.match(html, /authenticated tools may remain unseen/);
  assert.match(html, /OAuth discovery is available; OAuth login is not yet supported/);
  assert.doesNotMatch(html, /Starters available/);
  assert.doesNotMatch(html, /transition-note|AgentAction is the canonical project brand/);
  assert.match(html, /<main id="top">/);
  assert.match(html, /Trusted action boundary/);
  assert.match(html, /href="\/gateway"[^>]*>\s*Explore the Gateway/i);
  assert.match(html, /href="\/landscape"[^>]*>Landscape</i);
  assert.match(html, /class="brand-symbol"/i);
  assert.doesNotMatch(html, /class="brand-symbol-(?:gate|action|proof)"/i);
  assert.doesNotMatch(html, /class="brand-mark"/i);
  assert.match(html, /One governed endpoint for enterprise AI/);
  assert.match(html, /Route intelligently/);
  assert.match(html, /Execute once/);
  assert.match(html, /Product direction/);
  assert.match(html, /The agent never becomes its own authority/);
  assert.match(html, /What exists—and what comes next/);
  assert.match(html, /Available now/);
  assert.match(html, /Roadmap/);
  assert.match(html, /See how agent outcomes hold up across runs/);
  assert.match(html, /07 \/ Inspect the evidence/);
  assert.match(html, /08 \/ Proof, not promises/);
  const proofSection = html.match(/<section id="proof"[\s\S]*?<\/section>/)?.[0];
  const newsSection = html.match(/<section id="whats-new"[\s\S]*?<\/section>/)?.[0];
  assert.ok(proofSection);
  assert.ok(newsSection);
  assert.doesNotMatch(proofSection, /Jev|Research/);
  assert.match(proofSection, /<article class="is-current"><p class="proof-state">Available now<\/p>/);
  assert.ok(html.indexOf('id="proof"') < html.indexOf('id="whats-new"'));
  assert.match(newsSection, /aria-labelledby="whats-new-title"/);
  assert.match(newsSection, /<h2 id="whats-new-title">Research<\/h2>/);
  assert.match(newsSection, /<time dateTime="2026-09-27">September 27, 2026<\/time>/i);
  assert.match(newsSection, /Jev vs LLMs for authorization decisions/);
  assert.match(newsSection, /synthetic approval workflows/);
  assert.match(newsSection, /href="\/research\/jev"[^>]*>Explore the interactive report/);
  assert.match(newsSection, /href="https:\/\/github\.com\/dinpd\/AgentAction\/tree\/main\/research\/jev-shadow"[^>]*>Source &amp; methodology/);
  assert.match(html, /09 \/ Recommended onboarding/);
  assert.ok(
    html.indexOf('id="console"') < html.indexOf('id="proof"'),
    "observability console should render before state and roadmap",
  );
  assert.match(html, /Public · synthetic data/);
  assert.match(html, /Open the public demo/);
  assert.match(html, /src="\/observability-console\.png"/i);
  assert.match(
    html,
    /alt="AgentAction public observability console showing synthetic support-refund outcome, constraint, confidence, execution, and data-quality metrics"/i,
  );
  assert.match(html, /Explore the live console/);
  assert.match(html, /Operator sign-in/);
  assert.match(html, /https:\/\/agentaction-observability-demo\.drisw\.workers\.dev/);
  assert.match(html, /https:\/\/observability-console\.agentaction\.dev/);
  assert.match(html, /Available now: profile-scoped intent and outcome observability/);
  assert.match(html, /Roadmap:\s*richer OpenTelemetry correlation/);
  assert.match(html, /Build interoperability before vocabulary/);
  assert.match(html, /Bring us one consequential agent workflow/);
  assert.match(html, /Action-class map and baseline/);
  assert.match(html, /Evaluation and shadow-readiness plan/);
  assert.match(html, /Supervised launch and 90-day roadmap/);
  assert.match(html, /Start a transition assessment/);
  assert.match(html, /<input[^>]+name="email"/i);
  assert.match(html, /<input[^>]+type="email"/i);
  assert.match(html, /<input[^>]+name="phone"/i);
  assert.match(html, /<input[^>]+type="tel"/i);
  assert.match(html, /name="project"/i);
  assert.match(html, /Sent privately to info@agentaction\.dev/);
  assert.match(html, /Prefer to explore the implementation\? Open GitHub/);
  assert.match(html, /https:\/\/github\.com\/dinpd\/AgentAction/);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/);
});

test("makes the MCP checker discoverable while retaining recipe access", async () => {
  for (const path of ["/", "/gateway", "/landscape", "/research/completion-assessment"]) {
    const html = await (await render(path)).text();
    const nav = html.match(/<nav aria-label="Primary navigation">([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(nav);
    assert.match(nav, /href="https:\/\/mcpcheck\.agentaction\.dev">MCP Checker<\/a>/);
    assert.doesNotMatch(nav, /mcpcheck\.agentaction\.dev\/servers/);
    assert.doesNotMatch(nav, /href="\/recipes"/);
    if (path === "/") {
      assert.match(html, /Building an MCP server\?/);
      assert.match(html, /href="https:\/\/mcpcheck\.agentaction\.dev">Check your MCP server/);
      assert.match(html, /Runtime behavior remains untested/);
      assert.match(html, /Browse all recipes/);
      assert.match(html.match(/<footer>([\s\S]*?)<\/footer>/)?.[1] ?? "", /href="\/recipes">Agent recipes/);
    }
  }
  assert.equal((await render("/recipes")).status, 200);
});

test("delivers a valid project inquiry through the server-side Cloudflare email API", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("inquiry-test", `${process.pid}-${Date.now()}`);
  const { handleProjectInquiry } = await import(workerUrl.href);
  let outbound;
  const sendRequest = async (input, init) => {
    outbound = { input: String(input), init };
    return Response.json({
      success: true,
      errors: [],
      messages: [],
      result: { delivered: ["info@agentaction.dev"], queued: [], permanent_bounces: [] },
    });
  };
  const response = await handleProjectInquiry(
    new Request("https://agentaction.dev/api/project-inquiry", {
      method: "POST",
      headers: { origin: "https://agentaction.dev", "content-type": "application/json" },
      body: JSON.stringify({
        name: "Ada Lovelace",
        email: "ada@example.com",
        phone: "+1 415 555 0142",
        organization: "Analytical Engines",
        stage: "prototype",
        helpArea: "boundary",
        project: "Our agent can approve refunds and needs explicit authority, review paths, and durable evidence.",
        website: "",
        startedAt: Date.now() - 5000,
      }),
    }),
    {
      CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
      CLOUDFLARE_EMAIL_API_TOKEN: "runtime-only-token",
    },
    sendRequest,
  );

  assert.equal(response.status, 200);
  const responseBody = await response.json();
  assert.deepEqual(responseBody, { received: true });
  assert.equal(outbound.input, `https://api.cloudflare.com/client/v4/accounts/${"a".repeat(32)}/email/sending/send`);
  assert.equal(outbound.init.method, "POST");
  assert.equal(outbound.init.headers.authorization, "Bearer runtime-only-token");
  const message = JSON.parse(outbound.init.body);
  assert.equal(message.to, "info@agentaction.dev");
  assert.equal(message.from.address, "website@agentaction.dev");
  assert.equal(message.reply_to.address, "ada@example.com");
  assert.match(message.text, /approve refunds/);
  assert.match(message.text, /\+1 415 555 0142/);
  assert.doesNotMatch(JSON.stringify(responseBody), /ada@example\.com/);
});

test("rejects abusive and invalid project inquiries before email delivery", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("inquiry-rejection-test", `${process.pid}-${Date.now()}`);
  const { handleProjectInquiry } = await import(workerUrl.href);
  let sendCount = 0;
  const env = {
    CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
    CLOUDFLARE_EMAIL_API_TOKEN: "runtime-only-token",
  };
  const sendRequest = async () => {
    sendCount += 1;
    return Response.json({ success: true });
  };
  const validBody = {
    name: "Grace Hopper",
    email: "grace@example.com",
    phone: "",
    organization: "",
    stage: "production",
    helpArea: "evidence",
    project: "Our production agent changes customer state and needs verifiable authorization and execution evidence.",
    website: "",
    startedAt: Date.now() - 5000,
  };
  const request = (body, origin = "https://agentaction.dev") => new Request(
    "https://agentaction.dev/api/project-inquiry",
    {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  assert.equal((await handleProjectInquiry(request(validBody, "https://attacker.example"), env, sendRequest)).status, 403);
  assert.equal((await handleProjectInquiry(request({ ...validBody, website: "https://spam.example" }), env, sendRequest)).status, 400);
  assert.equal((await handleProjectInquiry(request({ ...validBody, phone: "not a phone" }), env, sendRequest)).status, 400);
  assert.equal((await handleProjectInquiry(request({ ...validBody, name: "Grace\nBcc: attacker@example.com" }), env, sendRequest)).status, 400);
  assert.equal((await handleProjectInquiry(request({ ...validBody, startedAt: Date.now() }), env, sendRequest)).status, 400);
  assert.equal((await handleProjectInquiry(request({ ...validBody, project: "x".repeat(17_000) }), env, sendRequest)).status, 413);
  assert.equal(sendCount, 0);
});

test("returns a private, retryable error when inquiry delivery fails", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("inquiry-failure-test", `${process.pid}-${Date.now()}`);
  const { handleProjectInquiry } = await import(workerUrl.href);
  const response = await handleProjectInquiry(
    new Request("https://agentaction.dev/api/project-inquiry", {
      method: "POST",
      headers: { origin: "https://agentaction.dev", "content-type": "application/json" },
      body: JSON.stringify({
        name: "Katherine Johnson",
        email: "katherine@example.com",
        phone: "",
        organization: "",
        stage: "exploring",
        helpArea: "integration",
        project: "We are mapping an agent integration that can change durable state across several internal systems.",
        website: "",
        startedAt: Date.now() - 5000,
      }),
    }),
    {
      CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
      CLOUDFLARE_EMAIL_API_TOKEN: "runtime-only-token",
    },
    async () => Response.json({ success: false }, { status: 503 }),
  );

  assert.equal(response.status, 503);
  const body = JSON.stringify(await response.json());
  assert.doesNotMatch(body, /katherine@example\.com/);
});

test("fails closed before delivery when Cloudflare email configuration is missing", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("inquiry-config-test", `${process.pid}-${Date.now()}`);
  const { handleProjectInquiry } = await import(workerUrl.href);
  let sendCount = 0;
  const response = await handleProjectInquiry(
    new Request("https://agentaction.dev/api/project-inquiry", {
      method: "POST",
      headers: { origin: "https://agentaction.dev", "content-type": "application/json" },
      body: JSON.stringify({
        name: "Dorothy Vaughan",
        email: "dorothy@example.com",
        phone: "",
        organization: "",
        stage: "prototype",
        helpArea: "gateway",
        project: "We are prototyping a governed agent gateway and need an initial action-boundary review.",
        website: "",
        startedAt: Date.now() - 5000,
      }),
    }),
    {},
    async () => {
      sendCount += 1;
      return Response.json({ success: true });
    },
  );

  assert.equal(response.status, 503);
  assert.equal(sendCount, 0);
  assert.doesNotMatch(JSON.stringify(await response.json()), /dorothy@example\.com/);
});

test("positions AgentAction as a privacy-safe trust layer across the agent lifecycle", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /Useful agents need more than a connection/i);
  assert.match(html, /policies, approvals, and outcome evidence—without inspecting hidden chain-of-thought/i);
  assert.match(html, /Traditional IAM and agent systems comparison/i);
  const platformMarkup = html.match(/<section id="platform"[\s\S]*?<\/section>/i)?.[0] ?? "";
  assert.match(platformMarkup, /Build, evaluate, and govern your agents/);
  assert.match(platformMarkup, /Agent Creation &amp; Evaluation/);
  assert.match(platformMarkup, /Available now/);
  assert.match(platformMarkup, /Discover → inspect → connect → supervise/);
  assert.match(platformMarkup, /Find servers by capability/);
  assert.match(platformMarkup, /href="https:\/\/observability-console\.agentaction\.dev\/agents"[^>]*>Open My agents/);
  assert.match(html, /Decision Assurance/);
  assert.match(html, /Action Authorization/);
  assert.match(html, /normalized decision evidence—not private chain-of-thought/i);
  assert.match(html, /intent → assessed → authorized → executed → evidenced → evaluated/i);

  const lifecycleMarkup = html.match(/<ol class="lifecycle">([\s\S]*?)<\/ol>/i)?.[1] ?? "";
  const lifecycleOrder = [
    "Declare intent",
    "Assure the decision",
    "Enforce policy",
    "Execute",
    "Preserve evidence",
    "Evaluate continuously",
  ].map((label) => lifecycleMarkup.indexOf(label));

  assert.ok(lifecycleOrder.every((index) => index >= 0));
  assert.deepEqual(lifecycleOrder, [...lifecycleOrder].sort((left, right) => left - right));
  assert.match(html, /<meta property="og:title" content="AgentAction — Control what agents do\. Prove what happened\."/i);
  assert.match(html, /<meta name="twitter:title" content="AgentAction — Control what agents do\. Prove what happened\."/i);

  const graph = structuredData(html).flatMap((entry) => entry["@graph"] ?? []);
  const organization = graph.find((entry) => entry["@type"] === "Organization");
  const website = graph.find((entry) => entry["@type"] === "WebSite");
  assert.equal(organization?.["@id"], "https://agentaction.dev/#organization");
  assert.equal(organization?.url, "https://agentaction.dev/");
  assert.deepEqual(organization?.sameAs, ["https://github.com/dinpd/AgentAction"]);
  assert.equal(website?.["@id"], "https://agentaction.dev/#website");
  assert.equal(website?.publisher?.["@id"], organization?.["@id"]);
  const description = "AgentAction evaluates agent decisions, enforces policy before actions execute, and checks outcomes against the intended job.";
  assert.equal(website?.description, description);
  for (const name of ["og:description", "twitter:description"]) {
    const tag = html.match(new RegExp(`<meta (?:property|name)="${name}"[^>]*>`))?.[0];
    assert.ok(tag?.includes(`content="${description}"`));
  }
});

test("presents passive MCP observation as the preferred low-risk onboarding path", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /Recommended onboarding: run the customer-controlled adapter/i);
  assert.match(html, /Observe first\. Enforce when ready\./);
  assert.match(html, /forwards every MCP call unchanged/i);
  assert.match(html, /counterfactual allow, deny, or challenge decision/i);
  assert.match(html, /process-local shadow state/i);
  assert.match(html, /quick onboarding and integration path/i);
  assert.match(html, /not yet a production-complete MCP gateway/i);
  assert.match(html, /MCP client[\s\S]*Observer adapter[\s\S]*MCP server/i);
  assert.match(html, /gateway_outcome[\s\S]*forwarded/i);
  assert.match(html, /counterfactual_decision[\s\S]*deny/i);
  assert.match(html, /observe → enforce/i);
  assert.match(
    html,
    /href="https:\/\/github\.com\/dinpd\/AgentAction#recommended-observe-an-mcp-workflow"[^>]*>\s*Observe an MCP workflow/i,
  );

  const observerPosition = html.indexOf("Run the observer quick start");
  const guardPosition = html.indexOf("Embed the TypeScript guard");
  assert.ok(observerPosition >= 0);
  assert.ok(guardPosition > observerPosition);
});

test("unifies the five-stage path, blueprint download, and transition assessment", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /Enterprise transition blueprint/i);
  assert.match(html, /Move from AI assistance to bounded autonomy/i);
  assert.match(html, /earned the right to perform/i);
  assert.match(html, /href="\/enterprise-agentic-ai-transition-blueprint\.pdf"[^>]*download/i);
  await access(new URL("../public/enterprise-agentic-ai-transition-blueprint.pdf", import.meta.url));

  const transitionMarkup = html.match(/<ol class="transition-stages"[^>]*>([\s\S]*?)<\/ol>/i)?.[1] ?? "";
  const stageOrder = [
    "Frame",
    "Prove offline",
    "Shadow",
    "Supervise",
    "Bound and scale",
  ].map((label) => transitionMarkup.indexOf(label));

  assert.ok(stageOrder.every((index) => index >= 0));
  assert.deepEqual(stageOrder, [...stageOrder].sort((left, right) => left - right));
  const assessmentMarkup = html.match(/<section id="transition"[^>]*>([\s\S]*?)<\/section>/i)?.[1] ?? "";
  assert.match(assessmentMarkup, /id="project"/);
  assert.match(assessmentMarkup, /class="project-form"/);
  assert.doesNotMatch(html, /<section[^>]+id="project"/i);
  assert.match(transitionMarkup, /Evidence must answer/g);
  assert.match(assessmentMarkup, /Action-class map and baseline/);
  assert.match(assessmentMarkup, /Evaluation and shadow-readiness plan/);
  assert.match(assessmentMarkup, /Supervised launch and 90-day roadmap/);
  assert.match(assessmentMarkup, /Start a transition assessment/);
  assert.match(assessmentMarkup, /Start the assessment/);
});

test("keeps the observer deployment model readable at narrow widths", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const narrowStart = styles.indexOf("@media (max-width: 720px)");
  const nextMedia = styles.indexOf("@media (", narrowStart + 1);
  const narrowRules = styles.slice(narrowStart, nextMedia >= 0 ? nextMedia : undefined);

  assert.ok(narrowStart >= 0);
  assert.match(narrowRules, /\.observer-topology\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(narrowRules, /\.observer-event > div\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(narrowRules, /\.observer-transition\s*\{[\s\S]*?flex-direction:\s*column/);
});

test("server-renders the AgentAction Gateway product page with route metadata", async () => {
  const response = await render("/gateway");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>AgentAction Gateway — Govern model and tool traffic<\/title>/i);
  assert.match(html, /<meta name="description" content="Route enterprise AI through one governed endpoint for cost-aware model selection, corporate policy, safe action replay, and execution evidence\."/i);
  assert.match(html, /<link rel="canonical" href="https:\/\/agentaction\.dev\/gateway"/i);
  assert.match(html, /<meta property="og:title" content="AgentAction Gateway — One governed endpoint for enterprise AI"/i);
  assert.match(html, /<meta property="og:description" content="Route intelligently, enforce company policy, execute consequential actions once, and prove what happened\."/i);
  assert.match(html, /<meta name="twitter:title" content="AgentAction Gateway — One governed endpoint for enterprise AI"/i);
  assert.match(html, /<meta name="twitter:description" content="Route intelligently, enforce company policy, execute consequential actions once, and prove what happened\."/i);
  assert.match(html, /One governed endpoint for enterprise AI/);
  assert.match(html, /Inference control is not action authority/);
  assert.match(html, /Risk-aware routing/);
  assert.match(html, /Safe action replay/);
  assert.match(html, /Observe first\. Enforce with evidence/);
  assert.match(html, /Managed gateway/);
  assert.match(html, /Available now/);
  assert.match(html, /MCP 2026-07-28/);
  assert.match(html, /OpenID AuthZEN Authorization API 1\.0/);
  assert.match(html, /A2A 1\.0/);
  assert.match(html, /Discuss a gateway pilot/);
  assert.match(html, /class="brand-symbol"/i);
  assert.doesNotMatch(html, /class="brand-symbol-(?:gate|action|proof)"/i);
  assert.doesNotMatch(html, /class="brand-mark"/i);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/);
});

test("server-renders the governance landscape survey", async () => {
  const response = await render("/landscape");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>The AI Agent Governance Landscape — AgentAction<\/title>/i);
  assert.match(html, /<link rel="canonical" href="https:\/\/agentaction\.dev\/landscape"/i);
  assert.match(html, /The AI agent governance landscape/);
  assert.match(html, /Six findings\./);
  assert.match(html, /Ordered by backing, not by preference/);
  assert.match(html, /What is adopted, and what is one person/);
  assert.match(html, /Gating became table stakes\. Evidence did not/);

  // discloses that we maintain it and lists ourselves honestly
  assert.match(html, /Maintained by AgentAction/);
  assert.match(html, /Inclusion is not endorsement/);
  assert.match(html, /listed in the independent tier\s+below/);
  assert.match(html, /Self-listed by the maintainer/);
  assert.match(html, /class="landscape-row landscape-row-self"/);
  // our own row must keep its honest caveats
  assert.match(html, /Solo-maintained and thinly adopted/);
  assert.match(html, /product direction, not shipped/);

  // live-versus-theory labelling must survive
  assert.match(html, /Early as OSS, Live in AgentCore/);
  assert.match(html, /Individual draft, expires Sept 2026/);
  assert.match(html, /Concept/);
  assert.match(html, /Dormant/);
  assert.match(html, /class="status-label status-live"/);
  assert.match(html, /class="status-label status-concept"/);
  assert.match(html, /class="status-label status-dormant"/);
  assert.match(html, /class="status-scale-rule"/);

  assert.match(html, /class="brand-symbol"/i);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/);

  const headings = html.match(/<h1\b/gi) ?? [];
  assert.equal(headings.length, 1);

  const localLinks = [...html.matchAll(/href=["']#([^"']+)["']/gi)].map((match) => match[1]);
  for (const id of localLinks) {
    assert.match(html, new RegExp(`id=["']${id}["']`, "i"));
  }

  const article = structuredData(html).find((entry) => entry["@type"] === "Article");
  assert.equal(article?.mainEntityOfPage?.["@id"], "https://agentaction.dev/landscape");
  assert.equal(article?.headline, "The AI Agent Governance Landscape");
  assert.equal(article?.image, "https://agentaction.dev/og.png");
  assert.equal(article?.datePublished, "2026-08-26");
  assert.equal(article?.dateModified, "2026-09-29");
  assert.equal(article?.publisher?.["@id"], "https://agentaction.dev/#organization");
});

test("landscape explains the four governance jobs before presenting capability evidence", async () => {
  const html = await (await render("/landscape")).text();
  const overview = html.match(/<section id="governance-map"[\s\S]*?<\/section>/)?.[0];
  assert.ok(overview);
  assert.ok(html.indexOf('id="governance-map"') < html.indexOf('id="capability-map"'));
  for (const label of ["Control", "Evidence", "Business task", "Execution environment", "Govern actions", "Verify outcomes", "Bound access", "Monitor runtime"]) {
    assert.ok(overview.includes(label), `missing organizing concept: ${label}`);
  }
  const sources = [...overview.matchAll(/<a href="(https:[^"]+)" title="([^"]+)" aria-label="([^"]+)">/g)];
  assert.equal(sources.length, 11, "every representative placement links directly to its evidence");
  for (const [, url, scope, accessibleName] of sources) {
    assert.equal(new URL(url).protocol, "https:");
    assert.ok(scope.length > 50);
    assert.ok(accessibleName.includes(scope));
  }
  assert.match(overview, /Documented available capability/);
  assert.match(overview, /Early \/ draft implementation/);
  assert.match(overview, /Announced reference design/);
  assert.match(overview, /AP2 is scoped to payments/);
  assert.match(overview, /early, self-listed implementation/);
  assert.match(overview, /not a product-wide score/);
  assert.match(overview, /not arbitrary business-goal evaluation/);
  assert.match(overview, /neither establishes a verified business outcome/);
  assert.match(overview, /href="#capability-map"/);
  const doc = await readFile(new URL("../../docs/agent-governance-landscape.md", import.meta.url), "utf8");
  for (const title of ["Govern actions", "Verify outcomes", "Bound access", "Monitor runtime"]) {
    assert.ok(doc.includes(title), `${title} must also be explained in the Markdown survey`);
  }
});

test("landscape renders sourced coverage separately from maturity and preserves review scope", async () => {
  const html = await (await render("/landscape")).text();
  const map = html.match(/<section id="capability-map"[\s\S]*?<\/section>/)?.[0];
  assert.ok(map);
  assert.equal((map.match(/data-project=/g) ?? []).length, 8);
  assert.equal((map.match(/<td /g) ?? []).length, 48);
  assert.equal((map.match(/Read source ↗/g) ?? []).length, 48);
  assert.equal((map.match(/<th scope="col"/g) ?? []).length, 7);
  assert.equal((map.match(/<th scope="row"/g) ?? []).length, 8);
  assert.match(map, /Filter the capability map/);
  assert.match(map, /role="status"/);
  assert.match(map, /8<!-- --> of <!-- -->8<!-- --> approaches shown|8 of 8 approaches shown/);
  assert.match(map, /Self-listed by the maintainer/);
  assert.match(map, /no universal exactly-once guarantee/);
  assert.match(map, /not that it is absent/);
  assert.match(map, /Reference design/);
  assert.match(map, /Announced/);
  assert.match(map, /Reviewed <!-- -->2026-09-29|Reviewed 2026-09-29/);
  assert.match(html, /August 2026 baseline/);
  assert.match(html, /not all reverified/);
  assert.match(html, /NVIDIA announcement/);
  assert.doesNotMatch(html, /Nothing production-grade ships this|Every mature project stops/);
  const doc = await readFile(new URL("../../docs/agent-governance-landscape.md", import.meta.url), "utf8");
  for (const name of ["OpenShell", "Sentry", "AgentCore Policy", "Entra Agent ID", "agentgateway", "Auth0 AI SDKs", "AP2", "AgentAction"]) {
    assert.ok(doc.includes(`### ${name} <a id="map-`), `${name} must have a qualified Markdown counterpart`);
  }
});

test("publishes canonical sitemap and robots discovery endpoints", async () => {
  const [sitemapResponse, robotsResponse] = await Promise.all([
    render("/sitemap.xml"),
    render("/robots.txt"),
  ]);

  assert.equal(sitemapResponse.status, 200);
  assert.match(sitemapResponse.headers.get("content-type") ?? "", /application\/xml|text\/xml/i);
  const sitemap = await sitemapResponse.text();
  assert.match(sitemap, /<loc>https:\/\/agentaction\.dev\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/agentaction\.dev\/gateway<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/agentaction\.dev\/landscape<\/loc>/);

  assert.equal(robotsResponse.status, 200);
  assert.match(robotsResponse.headers.get("content-type") ?? "", /^text\/plain\b/i);
  const robots = await robotsResponse.text();
  assert.match(robots, /User-Agent: \*/i);
  assert.match(robots, /Allow: \//i);
  assert.match(robots, /Sitemap: https:\/\/agentaction\.dev\/sitemap\.xml/i);
});

test("removes starter-only assets and metadata", async () => {
  const [page, layout, styles, packageJson, hosting] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /AgentAction/);
  assert.match(layout, /https:\/\/agentaction\.dev/);
  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview/);
  assert.match(layout, /favicon\.png/);
  assert.match(layout, /logo\.png/);
  assert.match(layout, /og-trust-layer\.png/);
  assert.match(layout, /apple-touch-icon\.png/);
  assert.match(styles, /background-image:\s*url\("\/logo\.png"\)/);
  assert.doesNotMatch(styles, /brand-symbol-(?:gate|action|proof)/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(hosting, /credential|token|secret/i);
  await access(new URL("public/favicon.png", templateRoot));
  await access(new URL("public/logo.png", templateRoot));
  await access(new URL("public/apple-touch-icon.png", templateRoot));
  await access(new URL("public/observability-console.png", templateRoot));
  await assert.rejects(access(new URL("public/favicon.svg", templateRoot)));
  await assert.rejects(access(new URL("public/logo.svg", templateRoot)));
  await assert.rejects(access(new URL("../app/_sites-preview", templateRoot)));
});

test("keeps navigation and local links accessible", async () => {
  const response = await render();
  const html = await response.text();
  assert.match(html, /class="button button-secondary" href="https:\/\/observability-console\.agentaction\.dev\/#setup">Start monitoring your agents/);
  assert.doesNotMatch(html, /Browse agent recipes/);
  assert.match(html, /id="home-recipes-title"/);
  assert.ok(html.indexOf('id="home-recipes-title"') > html.indexOf('id="community-title"'));
  assert.ok(html.indexOf('id="home-recipes-title"') < html.indexOf('id="transition-title"'));
  for (const id of ['competitor-pricing', 'support-help-articles', 'incident-to-ticket']) {
    assert.ok(html.includes(`href="/recipes/${id}"`));
  }
  assert.match(html, /Powered by/);
  assert.match(html, /Sentry \+ Linear/);
  assert.match(html, /synthetic test cases/);
  const headings = html.match(/<h1\b/gi) ?? [];
  const localLinks = [...html.matchAll(/href=["']#([^"']+)["']/gi)].map(
    (match) => match[1],
  );

  assert.equal(headings.length, 1);
  assert.match(html, /<html lang="en">/i);
  assert.match(html, /class="skip-link" href="#content"/i);
  assert.match(html, /<nav aria-label="Primary navigation">/i);
  assert.match(html, /aria-labelledby="hero-title"/i);
  assert.match(html, /role="table" aria-label="Traditional IAM and agent systems comparison"/i);
  assert.match(html, /role="table" aria-label="AgentAction trust model"/i);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/agentaction\.dev\/og-trust-layer\.png"/i);
  assert.match(html, /rel="icon"[^>]+href="https:\/\/agentaction\.dev\/favicon\.png"/i);
  assert.match(html, /rel="apple-touch-icon"[^>]+href="https:\/\/agentaction\.dev\/apple-touch-icon\.png"/i);

  for (const id of localLinks) {
    assert.match(html, new RegExp(`id=["']${id}["']`, "i"));
  }
});

test("renders recipe discovery, details and provider publishing with honest evidence labels", async () => {
  const directory = await render('/recipes');
  assert.equal(directory.status, 200);
  const html = await directory.text();
  assert.match(html, /What should your agent get done/);
  assert.match(html, /href="\/recipes\/support-refund"/);
  assert.match(html, /fixture checks pass/);
  for (const id of ['support-refund','support-triage']) {
    const response = await render(`/recipes/${id}`);
    assert.equal(response.status, 200);
    const detail = await response.text();
    assert.match(detail, /Connections you’ll need/);
    assert.match(detail, /Run fixture checks/);
    assert.match(detail, /Download agent instructions/);
    assert.match(detail, /Download recipe bundle/);
    assert.match(detail, new RegExp(`recipe=${id}(?:&amp;|&)recipe_version=1.0.0#create`));
    assert.match(detail, /No live model or connected service was tested/);
  }
  const publish = await render('/recipes/publish');
  assert.equal(publish.status, 200);
  assert.match(await publish.text(), /recipe-submission.yml/);
  assert.equal((await render('/recipes/nonexistent')).status, 404);
});


test("delivers customized recipe downloads with pinned content and safe attachment headers", async () => {
  const response = await render('/recipes/support-refund/download?name=Acme%20helper&format=json');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), /attachment; filename="support-refund-starter.json"/);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const bundle = await response.json();
  assert.equal(bundle.agentName, 'Acme helper');
  assert.equal(bundle.recipe.id, 'support-refund');
  assert.equal(bundle.recipe.version, '1.0.0');
  assert.equal(bundle.recipe.fixtures.length, 5);
  assert.equal(bundle.connections[0].endpoint, '');
  const markdown = await render('/recipes/support-triage/download?format=markdown');
  assert.match(await markdown.text(), /support-triage@1.0.0/);
  assert.equal((await render('/recipes/support-refund/download?format=html')).status, 400);
  assert.equal((await render('/recipes/unknown/download')).status, 404);
});

test("practical recipes expose usable setup and preserve it in both download formats", async () => {
  const expected = {
    'competitor-pricing': ['https://mcp.firecrawl.dev/v2/mcp'],
    'support-help-articles': ['https://mcp.intercom.com/mcp'],
    'incident-to-ticket': ['https://mcp.sentry.dev/mcp', 'https://mcp.linear.app/mcp'],
  };
  const directory = await (await render('/recipes')).text();
  const sitemap = await (await render('/sitemap.xml')).text();
  assert.match(directory, /Powered by/);
  assert.match(directory, /Sentry \+ Linear/);
  assert.match(directory, /Required servers/);
  assert.doesNotMatch(directory, /Recipe maintained by/);

  assert.ok(directory.indexOf('href="/recipes/competitor-pricing"') < directory.indexOf('href="/recipes/support-refund"'));
  for (const [id, endpoints] of Object.entries(expected)) {
    assert.ok(directory.includes(`href="/recipes/${id}"`));
    assert.ok(sitemap.includes(`https://agentaction.dev/recipes/${id}`));
    const page = await render(`/recipes/${id}`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Powered by/);
    assert.match(html, /Recipe maintained by/);
    assert.match(html, /AgentAction/);
    assert.match(html, /Example result/);
    assert.match(html, /Illustrative output using synthetic data/);
    assert.match(html, /Make it work in your environment/);
    assert.match(html, /Runtime requirements/);
    assert.match(html, /not completed live-agent tests/);
    assert.ok(html.includes(`href="https://observability-console.agentaction.dev/agents?recipe=${id}&amp;recipe_version=1.0.0#create"`));
    assert.match(html, /Use this recipe →/);
    const bundleResponse = await render(`/recipes/${id}/download?format=json&name=My%20business%20agent`);
    assert.equal(bundleResponse.status, 200);
    const bundle = await bundleResponse.json();
    assert.equal(bundle.agentName, 'My business agent');
    assert.equal(bundle.recipe.publisher.kind, 'maintainer');
    assert.deepEqual(bundle.connections.map(c => c.endpoint), endpoints);
    const markdown = await (await render(`/recipes/${id}/download?format=markdown`)).text();
    for (const endpoint of endpoints) {
      assert.ok(html.includes(endpoint));
      assert.ok(markdown.includes(endpoint));
    }
    assert.ok(markdown.includes(bundle.recipe.adoption.exampleOutput));
    for (const input of bundle.recipe.adoption.inputs) assert.ok(markdown.includes(input.description));
    for (const scenario of bundle.recipe.adoption.validation) assert.ok(markdown.includes(scenario.expected));
  }
});

test("serves a recorded interactive research report with restricted assets and sharing metadata", async () => {
  const response = await render("/research/jev");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  const csp = response.headers.get("content-security-policy");
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline/);
  const html = await response.text();
  assert.match(html, /Recorded experiment · September 27, 2026/);
  assert.match(html, /rel="canonical" href="https:\/\/agentaction.dev\/research\/jev"/);
  assert.match(html, /property="og:title"/);
  assert.match(html, /Source &amp; methodology/);
  assert.match(html, /No new model calls or real actions/);
  assert.match(html, /<noscript>/);
  assert.doesNotMatch(html, /<script>/);
  for (const id of ["phase", "cohort", "scenario", "repeat", "payload", "questions"]) assert.match(html, new RegExp(`id="${id}"`));
  const script = await readFile(new URL("../dist/client/research/jev/dashboard.js", import.meta.url), "utf8");
  await access(new URL("../dist/client/research/jev/dashboard.css", import.meta.url));
  const dataPath = script.match(/fetch\('([^']+)'\)/)?.[1];
  assert.match(dataPath, /^\/research\/jev\/recorded-[a-f0-9]{16}\.json$/);
  const snapshot = JSON.parse(await readFile(new URL(`../dist/client${dataPath}`, import.meta.url), "utf8"));
  assert.equal(snapshot.data.complete, true);
  assert.equal(snapshot.data.fixture, false);
  assert.equal(snapshot.rows.length, 528);
  assert.equal(snapshot.rows.flatMap(r => r.attempts).length, 678);
});

test("uses the requested ordered header menu with working section destinations", async () => {
  for (const path of ["/", "/gateway", "/landscape", "/research/completion-assessment"]) {
    const html = await (await render(path)).text();
    const nav = html.match(/<nav aria-label="Primary navigation">([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(nav);
    const explore = nav.match(/aria-label="Explore">([\s\S]*?)<\/div><\/div>/)?.[1];
    const tools = nav.match(/aria-label="Visitor tools">([\s\S]*?)<\/div><\/div>/)?.[1];
    assert.ok(explore);
    assert.ok(tools);
    assert.doesNotMatch(tools, /MCP Directory|\/servers/);
    assert.match(tools, /href="https:\/\/mcpcheck\.agentaction\.dev">MCP Checker/);
    assert.match(tools, /href="https:\/\/observability-console\.agentaction\.dev\/agents">Console/);
    assert.doesNotMatch(explore, /mcpcheck|observability-console/);
    assert.match(nav, /class="nav-cta" href="https:\/\/github\.com\/dinpd\/AgentAction">GitHub/);
    const entries = [...explore.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(([, href, label]) => ({ href, label }));
    const prefix = path === "/" ? "" : "/";
    assert.deepEqual(entries, [
      { href: `${prefix}#platform`, label: "Platform" },
      { href: "/landscape", label: "Landscape" },
      { href: `${prefix}#whats-new`, label: "Research" },
      { href: "/blog", label: "Blog" },
      { href: `${prefix}#observe`, label: "Start here" },
    ]);
    if (path === "/") assert.match(explore, /href="#observe" class="nav-start">Start here/);
    for (const [, id] of explore.matchAll(/href="#([^"]+)"/g)) {
      assert.ok(html.includes(`id="${id}"`), `missing header target ${path}#${id}`);
    }
  }
});

test("places the MCP directory beneath Open My agents in platform section 4", async () => {
  const html = await (await render("/")).text();
  assert.doesNotMatch(html, /id="mcp-directory"|directory-card/);
  const platform = html.match(/<section id="platform"[\s\S]*?<\/section>/)?.[0];
  assert.ok(platform);
  const creation = platform.match(/<article>[\s\S]*?<\/article>/)?.[0];
  assert.ok(creation);
  assert.match(creation, /Agent Creation &amp; Evaluation/);
  assert.match(creation, /href="https:\/\/mcpcheck\.agentaction\.dev\/servers">Browse MCP servers/);
  assert.ok(creation.indexOf('Open My agents') < creation.indexOf('Browse MCP servers'));
  assert.match(creation, /Public findings are not safety certification/);
});

test("publishes the dated IAM digest with sources, context, image and homepage lead-in", async () => {
  const path = "/blog/agentic-iam-digest-2026-10-07";
  const index = await render("/blog");
  assert.equal(index.status, 200);
  const indexHtml = await index.text();
  assert.ok(indexHtml.includes(`href="${path}"`));
  assert.match(indexHtml, /September 25–October 7, 2026/);
  assert.match(indexHtml, /rel="canonical" href="https:\/\/agentaction.dev\/blog"/);
  const response = await render(path);
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const pattern of [/Identity moves into/, /dateTime="2026-10-07"/i, /13-day window/, /By AgentAction/, /Earlier context, outside this issue/, /Editorial outlook/, /longer-term developments vector/, /November 16, 2026/, /first half of 2027/, /Q4 FY27/, /v2 revised October 6, 2026; first submitted September 24/, /not certification/, /Research summaries are based on the linked abstracts/]) assert.match(html, pattern);
  assert.ok(html.includes(`rel="canonical" href="https://agentaction.dev${path}"`));
  assert.match(html, /property="og:type" content="article"/);
  assert.match(html, /property="article:published_time" content="2026-10-07"/);
  const articleData = structuredData(html).find((item) => item["@type"] === "BlogPosting");
  assert.equal(articleData.datePublished, "2026-10-07");
  assert.equal(articleData.mainEntityOfPage, `https://agentaction.dev${path}`);
  for (const source of [
    "https://www.nist.gov/news-events/news/2026/09/comments-software-and-agentic-ai-identity-concept-paper",
    "https://investor.sailpoint.com/node/8276/pdf",
    "https://www.rsa.com/news/press-releases/rsa-agent-id-world-summit-ai/",
    "https://arxiv.org/abs/2609.33371v1", "https://arxiv.org/abs/2610.03213v1",
    "https://arxiv.org/abs/2609.30614v2", "https://arxiv.org/abs/2610.04544v1",
  ]) assert.ok(html.includes(`href="${source}"`), `missing primary source ${source}`);
  for (const anchor of ["new", "research", "vector", "watch"]) assert.ok(html.includes(`id="${anchor}"`));
  assert.match(html, /<img[^>]+alt="Abstract agent nodes/);
  const jpg = await readFile(new URL("../dist/client/blog/agentic-iam-2026-10-07.jpg", import.meta.url));
  assert.equal(jpg.subarray(0, 3).toString("hex"), "ffd8ff");
  const home = await (await render("/")).text();
  const highlight = home.match(/<section id="iam-digest"[\s\S]*?<\/section>/)?.[0];
  assert.ok(highlight);
  assert.match(highlight, /bounded delegation/);
  assert.ok(highlight.includes(`href="${path}"`));
  assert.ok(home.indexOf('id="iam-digest"') < home.indexOf('id="permissions-title"'));
  const sitemap = await (await render("/sitemap.xml")).text();
  for (const route of ["/blog", path]) assert.ok(sitemap.includes(`https://agentaction.dev${route}`));
});
