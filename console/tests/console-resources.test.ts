import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import worker from "../src/worker.ts";
import demo from "../src/demo-worker.ts";

const production = { ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com", ACCESS_AUD: "console" };
const env = { CONSOLE_ENVIRONMENT: "development", CONSOLE_ENABLE_MOCK_IDENTITY: "true", CONSOLE_MOCK_TENANT_ID: "workspace-a", CONSOLE_MOCK_SUBJECT: "local-operator" };

test("console HTML rejects transformations without relaxing CSP or private caching", async () => {
  for (const path of ["/", "/agents"]) {
    const response = await worker.fetch(new Request(`https://console.test${path}`), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0, no-transform");
    const csp = response.headers.get("content-security-policy")!;
    assert.match(csp, /(?:^|;)\s*script-src 'self';/); assert.match(csp, /connect-src 'self';/);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|cloudflareinsights|font-src[^;]*data:/);
    const html = await response.text(); assert.match(html, /rel="icon" type="image\/png" href="\/favicon.png"/);
    assert.doesNotMatch(html, /@font-face|data:font|beacon\.min\.js/);
  }
  const rejected = await worker.fetch(new Request("https://console.test/agents", {headers:{accept:"text/html"}}), production);
  assert.equal(rejected.status, 401); assert.match(rejected.headers.get("cache-control")!, /no-transform/);
  assert.match(rejected.headers.get("content-security-policy")!, /default-src 'none'/);
});

test("same-origin favicon and legacy URL serve the existing product image", async () => {
  const expected = readFileSync(new URL("../../website/public/favicon.png", import.meta.url));
  for (const path of ["/favicon.png", "/favicon.ico"]) {
    const response = await worker.fetch(new Request(`https://console.test${path}`), env);
    assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
    assert.equal((await worker.fetch(new Request(`https://console.test${path}`), production)).status, 401);
    assert.equal((await demo.fetch(new Request(`https://console.test${path}`))).status, 200);
  }
});
