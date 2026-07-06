import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/worker.ts";

const env = {
  AGENTID_GATEWAY_URL: "https://agentid-gateway.example.com",
  AGENTID_TENANT_ID: "refund-demo-agent",
  AGENTID_MCP_TENANT_ID: "provider-mcp-support-agent",
  AGENTID_OIDC_ISSUER: "https://demo.agentid.local",
  AGENTID_OIDC_AUDIENCE: "agentid-gateway",
};

test("enterprise MCP hosted demo allows a verified enterprise-bound provider receipt", async () => {
  const body = await enterpriseMcpDemo({});

  assert.equal(body.ok, true);
  assert.equal(body.steps.length, 4);
  assert.equal(body.steps[0].title, "Enterprise JWT validated");
  assert.equal(body.steps[1].response.allow, true);
  assert.equal(body.steps[2].response.enterprise_client_id, "claude-enterprise");
  assert.equal(body.steps[3].title, "Provider verified receipt and executed");
  assert.equal(body.steps[3].status, "allow");
});

test("enterprise MCP hosted demo denies a validly signed receipt with mismatched enterprise bindings", async () => {
  const body = await enterpriseMcpDemo({ variant: "binding_mismatch" });

  assert.equal(body.ok, false);
  assert.equal(body.steps.length, 4);
  assert.equal(body.steps[2].response.enterprise_client_id, "unapproved-mcp-client");
  assert.equal(body.steps[3].title, "Provider denied execution");
  assert.equal(body.steps[3].status, "deny");
  assert.deepEqual(body.steps[3].response.error.data.findings, ["enterprise_client_id mismatch"]);
});

async function enterpriseMcpDemo(payload: Record<string, unknown>): Promise<any> {
  const response = await worker.fetch(
    new Request("https://agentid-demo.test/api/enterprise-mcp/demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
    env,
  );
  assert.equal(response.status, 200);
  return response.json();
}
