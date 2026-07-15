import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import {
  MemoryReplayStore,
  RemoteJwksCache,
  createAgentIdReceiptMiddleware,
  createAgentPassReceiptMiddleware,
  signProviderReceiptJws,
  signProviderReceipt,
  verifyProviderReceipt,
  type ProviderAuthorizationReceipt,
  type ResponseLike,
} from "../src/index.ts";

test("verifyProviderReceipt accepts signed receipt bound to tool args", async () => {
  const receipt = signedReceipt();

  const result = await verifyProviderReceipt(signProviderReceipt(receipt, "secret-1"), {
    secret: "secret-1",
    requireSigned: true,
    tool: "provider.crm.update_customer",
    args: toolArgs(),
    policy,
    now: () => new Date("2026-05-28T12:01:00Z"),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.receipt, receipt);
});

test("verifyProviderReceipt enforces enterprise auth receipt bindings", async () => {
  const enterprisePolicy = {
    ...policy,
    requiredReceiptFields: [
      ...policy.requiredReceiptFields,
      "enterprise_issuer",
      "enterprise_subject",
      "enterprise_client_id",
      "enterprise_id_jag_grant_id",
      "enterprise_scopes",
      "enterprise_groups",
    ],
    requiredReceiptValues: {
      enterprise_issuer: "https://idp.example.com",
      enterprise_client_id: "claude-enterprise",
      enterprise_scopes: ["mcp:provider-crm", "crm.write"],
      enterprise_groups: ["support-admins"],
    },
  };

  const accepted = await verifyProviderReceipt(signProviderReceipt(signedReceipt(), "secret-1"), {
    secret: "secret-1",
    requireSigned: true,
    tool: "provider.crm.update_customer",
    args: toolArgs(),
    policy: enterprisePolicy,
    now: () => new Date("2026-05-28T12:01:00Z"),
  });
  const denied = await verifyProviderReceipt(
    signProviderReceipt(
      {
        ...signedReceipt(),
        enterprise_client_id: "untrusted-client",
        enterprise_scopes: ["openid", "mcp:provider-crm"],
        enterprise_groups: ["support"],
      },
      "secret-1",
    ),
    {
      secret: "secret-1",
      requireSigned: true,
      tool: "provider.crm.update_customer",
      args: toolArgs(),
      policy: enterprisePolicy,
      now: () => new Date("2026-05-28T12:01:00Z"),
    },
  );

  assert.equal(accepted.ok, true);
  assert.equal(denied.ok, false);
  assert.ok(denied.findings.includes("receipt enterprise_client_id mismatch"));
  assert.ok(denied.findings.includes("receipt enterprise_scopes missing value: crm.write"));
  assert.ok(denied.findings.includes("receipt enterprise_groups missing value: support-admins"));
});

test("verifyProviderReceipt accepts JWS receipt bound to tool args", async () => {
  const { privateKey, jwks } = rsaKeyPair();
  const result = await verifyProviderReceipt(
    signProviderReceiptJws(signedReceipt(), privateKey, {
      issuer: "https://enterprise.example.com",
      audience: "provider-crm-mcp",
      keyId: "agentid-2026-06",
    }),
    {
      jwks,
      issuer: "https://enterprise.example.com",
      audience: "provider-crm-mcp",
      requireSigned: true,
      tool: "provider.crm.update_customer",
      args: toolArgs(),
      policy,
      now: () => new Date("2026-05-28T12:01:00Z"),
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.receipt, signedReceipt());
});

test("verifyProviderReceipt accepts remote JWKS", async () => {
  const { privateKey, jwks } = rsaKeyPair();
  const fetch = mockFetch([jwks]);
  const result = await verifyProviderReceipt(
    signProviderReceiptJws(signedReceipt(), privateKey, {
      issuer: "https://enterprise.example.com",
      audience: "provider-crm-mcp",
      keyId: "agentid-2026-06",
    }),
    {
      jwksUri: "https://enterprise.example.com/.well-known/jwks.json",
      jwksCache: new RemoteJwksCache(),
      fetch,
      issuer: "https://enterprise.example.com",
      audience: "provider-crm-mcp",
      requireSigned: true,
      tool: "provider.crm.update_customer",
      args: toolArgs(),
      policy,
      now: () => new Date("2026-05-28T12:01:00Z"),
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.receipt, signedReceipt());
  assert.equal(fetch.calls.length, 1);
});

test("verifyProviderReceipt rejects JWS issuer mismatch", async () => {
  const { privateKey, jwks } = rsaKeyPair();
  const result = await verifyProviderReceipt(
    signProviderReceiptJws(signedReceipt(), privateKey, {
      issuer: "https://enterprise.example.com",
      audience: "provider-crm-mcp",
      keyId: "agentid-2026-06",
    }),
    {
      jwks,
      issuer: "https://other.example.com",
      audience: "provider-crm-mcp",
      requireSigned: true,
      now: () => new Date("2026-05-28T12:01:00Z"),
    },
  );

  assert.equal(result.ok, false);
  assert.ok(result.findings.includes("receipt JWS issuer mismatch"));
});

test("verifyProviderReceipt rejects tampered signatures and mismatched resources", async () => {
  const signed = signProviderReceipt(signedReceipt(), "secret-1");
  signed.payload = { ...signed.payload, resource: "provider/customer/cus_999" };

  const result = await verifyProviderReceipt(signed, {
    secret: "secret-1",
    tool: "provider.crm.update_customer",
    args: toolArgs(),
    policy,
    now: () => new Date("2026-05-28T12:01:00Z"),
  });

  assert.equal(result.ok, false);
  assert.ok(result.findings.includes("receipt signature mismatch"));
  assert.ok(result.findings.includes("receipt resource mismatch"));
});

test("verifyProviderReceipt rejects unsigned receipts when signatures are required", async () => {
  const result = await verifyProviderReceipt(signedReceipt(), {
    requireSigned: true,
    tool: "provider.crm.update_customer",
    args: toolArgs(),
    policy,
    now: () => new Date("2026-05-28T12:01:00Z"),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.findings, ["receipt must be signed"]);
});

test("verifyProviderReceipt rejects expired receipts", async () => {
  const receipt = { ...signedReceipt(), expires_at: "2026-05-28T12:00:30Z" };

  const result = await verifyProviderReceipt(signProviderReceipt(receipt, "secret-1"), {
    secret: "secret-1",
    tool: "provider.crm.update_customer",
    args: toolArgs(),
    policy,
    now: () => new Date("2026-05-28T12:01:00Z"),
  });

  assert.equal(result.ok, false);
  assert.ok(result.findings.includes("receipt is expired"));
});

test("MemoryReplayStore rejects reused receipts", async () => {
  const store = new MemoryReplayStore();
  const signed = signProviderReceipt(signedReceipt(), "secret-1");

  const first = await verifyProviderReceipt(signed, {
    secret: "secret-1",
    tool: "provider.crm.update_customer",
    args: toolArgs(),
    policy,
    replayStore: store,
    now: () => new Date("2026-05-28T12:01:00Z"),
  });
  const second = await verifyProviderReceipt(signed, {
    secret: "secret-1",
    tool: "provider.crm.update_customer",
    args: toolArgs(),
    policy,
    replayStore: store,
    now: () => new Date("2026-05-28T12:01:00Z"),
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.ok(second.findings.includes("receipt was already used"));
});

test("middleware attaches verified receipt and calls next", async () => {
  const req = {
    body: mcpRequest(signProviderReceipt(signedReceipt(), "secret-1")),
  };
  const res = fakeResponse();
  let nextCalled = false;
  const middleware = createAgentPassReceiptMiddleware({
    secret: "secret-1",
    now: () => new Date("2026-05-28T12:01:00Z"),
    tools: {
      "provider.crm.update_customer": policy,
    },
  });

  await middleware(req, res, (error) => {
    assert.equal(error, undefined);
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, undefined);
  assert.equal(req.agentpassReceipt?.decision_id, "dec-1");
  assert.equal(req.agentidReceipt?.decision_id, "dec-1");
});

test("middleware returns 403 for denied receipts", async () => {
  const req = {
    body: mcpRequest(undefined),
  };
  const res = fakeResponse();
  let nextCalled = false;
  const middleware = createAgentPassReceiptMiddleware({
    secret: "secret-1",
    tools: {
      "provider.crm.update_customer": policy,
    },
  });

  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    error: "AgentPass provider authorization receipt denied",
    codes: ["missing_receipt"],
    findings: ["missing _agentid_receipt"],
  });
});

test("middleware skips tools without a configured receipt policy", async () => {
  const req = { body: mcpRequest(undefined, "provider.crm.search_customer") };
  const res = fakeResponse();
  let nextCalled = false;
  const middleware = createAgentPassReceiptMiddleware({
    tools: {
      "provider.crm.update_customer": policy,
    },
  });

  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, undefined);
});

test("legacy createAgentIdReceiptMiddleware export remains a compatibility alias", () => {
  assert.equal(createAgentIdReceiptMiddleware, createAgentPassReceiptMiddleware);
});

const policy = {
  action: "write",
  resourceTemplate: "provider/customer/{customer_id}",
  requiredReceiptFields: ["tenant_id", "user_id", "approval_id", "jit_grant_id", "job_id", "case_id", "customer_id"],
  bindArgs: {
    job_id: "job_id",
    case_id: "case_id",
    customer_id: "customer_id",
    approval_id: "approval_id",
    jit_grant_id: "jit_grant_id",
  },
};

function signedReceipt(): ProviderAuthorizationReceipt {
  return {
    decision_id: "dec-1",
    tenant_id: "tenant-a",
    agent_id: "enterprise-support-agent",
    user_id: "support-rep-17",
    tool: "provider.crm.update_customer",
    action: "write",
    resource: "provider/customer/cus_123",
    job_id: "support_case_resolution",
    case_id: "case-1042",
    customer_id: "cus_123",
    approval_id: "approval-1",
    jit_grant_id: "grant-1",
    enterprise_issuer: "https://idp.example.com",
    enterprise_subject: "support-rep-17",
    enterprise_client_id: "claude-enterprise",
    enterprise_token_audience: "provider-crm-mcp",
    enterprise_id_jag_grant_id: "id-jag-1",
    enterprise_scopes: ["openid", "mcp:provider-crm", "crm.write"],
    enterprise_groups: ["support", "support-admins"],
    enterprise_acr: "urn:okta:loa:2fa",
    enterprise_amr: ["pwd", "mfa"],
    issued_at: "2026-05-28T12:00:00Z",
    expires_at: "2099-05-28T12:05:00Z",
  };
}

function toolArgs(): Record<string, unknown> {
  return {
    customer_id: "cus_123",
    job_id: "support_case_resolution",
    case_id: "case-1042",
    approval_id: "approval-1",
    jit_grant_id: "grant-1",
  };
}

function mcpRequest(receipt: unknown, tool = "provider.crm.update_customer") {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: tool,
      arguments: {
        ...toolArgs(),
        _agentid_receipt: receipt,
      },
    },
  };
}

function fakeResponse(): ResponseLike & { statusCode?: number; body?: unknown } {
  return {
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
    },
  };
}

function rsaKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  (jwk as unknown as Record<string, unknown>).kid = "agentid-2026-06";
  (jwk as unknown as Record<string, unknown>).alg = "RS256";
  (jwk as unknown as Record<string, unknown>).use = "sig";
  return {
    privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    jwks: { keys: [jwk] },
  };
}

function mockFetch(responses: Array<unknown>) {
  const queue = [...responses];
  const calls: string[] = [];
  const fetch = (async (input: string | URL) => {
    calls.push(String(input));
    const payload = queue.shift();
    if (payload === undefined) throw new Error("unexpected fetch");
    if (payload instanceof Error) throw payload;
    return {
      ok: true,
      status: 200,
      json: async () => payload,
    };
  }) as typeof globalThis.fetch & { calls: string[] };
  fetch.calls = calls;
  return fetch;
}
