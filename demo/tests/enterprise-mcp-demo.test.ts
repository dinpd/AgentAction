import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/worker.ts";

test("enterprise MCP hosted demo allows a verified enterprise-bound provider receipt", async () => {
  const calls: string[] = [];
  const body = await enterpriseMcpDemo({}, calls);

  assert.equal(body.ok, true);
  assert.equal(body.steps.length, 5);
  assert.equal(body.steps[0].title, "Enterprise JWT validated");
  assert.equal(body.steps[1].title, "Real AgentPass gateway issued scoped JIT");
  assert.equal(body.steps[2].response.allow, true);
  assert.equal(body.steps[3].response.enterprise_client_id, "claude-enterprise");
  assert.equal(body.steps[4].title, "Provider verified receipt and executed");
  assert.equal(body.steps[4].status, "allow");
  assert.equal(calls.length, 4);
  assert.equal(calls[0], "/tenants/provider-mcp-support-agent/approval-requests");
  assert.match(calls[1], /^\/tenants\/provider-mcp-support-agent\/approval-requests\/approval-enterprise-.+\/approve$/);
  assert.equal(calls[2], "/tenants/provider-mcp-support-agent/jit-grants");
  assert.equal(calls[3], "/tenants/provider-mcp-support-agent/authorize");
});

test("enterprise MCP hosted demo denies a validly signed receipt with mismatched enterprise bindings", async () => {
  const body = await enterpriseMcpDemo({ variant: "binding_mismatch" });

  assert.equal(body.ok, false);
  assert.equal(body.steps.length, 5);
  assert.equal(body.steps[3].response.enterprise_client_id, "unapproved-mcp-client");
  assert.equal(body.steps[4].title, "Provider denied execution");
  assert.equal(body.steps[4].status, "deny");
  assert.deepEqual(body.steps[4].response.error.data.findings, ["enterprise_client_id mismatch"]);
});

async function enterpriseMcpDemo(payload: Record<string, unknown>, calls: string[] = []): Promise<any> {
  const response = await worker.fetch(
    new Request("https://agentid-demo.test/api/enterprise-mcp/demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
    mockEnv(calls),
  );
  assert.equal(response.status, 200);
  return response.json();
}

function mockEnv(calls: string[]): any {
  return {
    AGENTID_GATEWAY_URL: "https://agentid-gateway.example.com",
    AGENTID_TENANT_ID: "refund-demo-agent",
    AGENTID_MCP_TENANT_ID: "provider-mcp-support-agent",
    AGENTID_OIDC_ISSUER: "https://demo.agentid.local",
    AGENTID_OIDC_AUDIENCE: "agentid-gateway",
    AGENTID_DEMO_OIDC_SECRET: "test-secret",
    AGENTID_GATEWAY: {
      async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const body = await request.json() as Record<string, unknown>;
        calls.push(url.pathname);
        if (url.pathname.endsWith("/approval-requests")) {
          return json({ ...body, status: "pending" }, 201);
        }
        if (url.pathname.endsWith("/approve")) {
          assert.equal(body.decision_reason, "Demo approval for enterprise-managed MCP authorization");
          const approvalId = decodeURIComponent(url.pathname.split("/").at(-2) || "");
          return json({ approval_id: approvalId, status: "approved" });
        }
        if (url.pathname.endsWith("/jit-grants")) {
          return json({ ...body, jit_grant_id: "grant-real-1", status: "issued" }, 201);
        }
        if (url.pathname.endsWith("/authorize")) {
          return json({
            allow: true,
            decision: "allow",
            findings: [],
            event: { ...body, decision_id: "dec-real-1" },
          });
        }
        return json({ error: "not found" }, 404);
      },
    },
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
