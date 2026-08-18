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

test("server-renders the complete AgentAction project site", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>AgentAction — Action authorization for AI agents<\/title>/i);
  assert.match(html, /Control the action\./);
  assert.match(html, /Prove what happened\./);
  assert.match(html, /AgentAction is the public brand for AgentPass/);
  assert.match(html, /Trusted action boundary/);
  assert.match(html, /href="\/gateway"[^>]*>Gateway</i);
  assert.match(html, /class="brand-symbol"/i);
  assert.match(html, /class="brand-symbol-gate"/i);
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
  assert.match(html, /https:\/\/github\.com\/dinpd\/AgentPass/);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/);
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
  assert.match(html, /class="brand-symbol-proof"/i);
  assert.doesNotMatch(html, /class="brand-mark"/i);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/);
});

test("removes starter-only assets and metadata", async () => {
  const [page, layout, packageJson, hosting] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /AgentAction/);
  assert.match(layout, /https:\/\/agentaction\.dev/);
  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview/);
  assert.match(layout, /favicon\.png/);
  assert.match(layout, /logo\.png/);
  assert.match(layout, /apple-touch-icon\.png/);
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
  assert.match(html, /role="table" aria-label="AgentAction trust model"/i);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/agentaction\.dev\/og\.png"/i);
  assert.match(html, /rel="icon"[^>]+href="https:\/\/agentaction\.dev\/favicon\.png"/i);
  assert.match(html, /rel="apple-touch-icon"[^>]+href="https:\/\/agentaction\.dev\/apple-touch-icon\.png"/i);

  for (const id of localLinks) {
    assert.match(html, new RegExp(`id=["']${id}["']`, "i"));
  }
});
