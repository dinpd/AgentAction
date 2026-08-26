import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

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
  assert.match(html, /<title>AgentAction — Trust infrastructure for autonomous AI agents<\/title>/i);
  assert.match(html, /Give agents permission to act\./);
  assert.match(html, /Prove the decision was justified\./);
  assert.match(html, /AgentAction is the canonical project brand/);
  assert.match(html, /Trusted action boundary/);
  assert.match(html, /href="\/gateway"[^>]*>Action gateway</i);
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
  assert.match(html, /Build interoperability before vocabulary/);
  assert.match(html, /Bring us a consequential agent workflow/);
  assert.match(html, /Map the action boundary/);
  assert.match(html, /Prove the integration/);
  assert.match(html, /Validate before rollout/);
  assert.match(html, /Start a project conversation/);
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

  assert.match(html, /trust layer between autonomous agents and enterprise systems/i);
  assert.match(html, /Agents need more than permissions/i);
  assert.match(html, /Traditional IAM and agent systems comparison/i);
  assert.match(html, /Agent Evaluation/);
  assert.match(html, /Decision Assurance/);
  assert.match(html, /Action Authorization/);
  assert.match(html, /Foundation available/);
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
  assert.match(html, /<meta property="og:title" content="AgentAction — The trust layer for autonomous AI agents"/i);
  assert.match(html, /<meta name="twitter:title" content="AgentAction — The trust layer for autonomous AI agents"/i);

  const graph = structuredData(html).flatMap((entry) => entry["@graph"] ?? []);
  const organization = graph.find((entry) => entry["@type"] === "Organization");
  const website = graph.find((entry) => entry["@type"] === "WebSite");
  assert.equal(organization?.["@id"], "https://agentaction.dev/#organization");
  assert.equal(organization?.url, "https://agentaction.dev/");
  assert.deepEqual(organization?.sameAs, ["https://github.com/dinpd/AgentAction"]);
  assert.equal(website?.["@id"], "https://agentaction.dev/#website");
  assert.equal(website?.publisher?.["@id"], organization?.["@id"]);
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
  assert.equal(article?.dateModified, "2026-08-26");
  assert.equal(article?.publisher?.["@id"], "https://agentaction.dev/#organization");
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
  await assert.rejects(access(new URL("public/favicon.svg", templateRoot)));
  await assert.rejects(access(new URL("public/logo.svg", templateRoot)));
  await assert.rejects(access(new URL("../app/_sites-preview", templateRoot)));
});

test("keeps navigation and local links accessible", async () => {
  const response = await render();
  const html = await response.text();
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
