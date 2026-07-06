import assert from "node:assert/strict";
import { createPrivateKey, createSign, generateKeyPairSync } from "node:crypto";

import { handleJsonRpc } from "../src/proxy.ts";
import { unwrapProviderReceiptWithJwks } from "../src/receipts.ts";
import type {
  AdapterConfig,
  AgentIdAuthorizeRequest,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonWebKeySet,
  ProviderAuthorizationReceipt,
} from "../src/types.ts";

const ENTERPRISE_JWT_KID = "enterprise-idp-2026-07";
const RECEIPT_SECRET = "dev-provider-receipt-secret";

async function main(): Promise<void> {
  const { privateKey, jwks } = rsaKeyPair(ENTERPRISE_JWT_KID);
  const enterpriseToken = signJwt(
    {
      iss: "https://idp.example.com",
      aud: "provider-crm-mcp",
      sub: "user-17",
      azp: "claude-enterprise",
      tid: "tenant-a",
      agent_id: "enterprise-support-agent",
      scp: ["openid", "mcp:provider-crm", "crm.write"],
      groups: ["support", "support-admins"],
      id_jag: "id-jag-1",
      acr: "urn:okta:loa:2fa",
      amr: ["pwd", "mfa"],
      iat: 1_781_437_140,
      exp: 4_102_444_800,
    },
    privateKey,
    ENTERPRISE_JWT_KID,
  );

  let authorizePayload: AgentIdAuthorizeRequest | undefined;
  let providerReceipt: ProviderAuthorizationReceipt | undefined;
  const providerFindings: string[] = [];
  const config = demoConfig(jwks);

  const response = await handleJsonRpc(
    demoRequest,
    config,
    { bearerToken: enterpriseToken },
    async (url, init) => {
      const request = JSON.parse(String(init?.body));
      if (String(url).includes("/authorize")) {
        authorizePayload = request as AgentIdAuthorizeRequest;
        assertEnterpriseAuthorizePayload(authorizePayload);
        return jsonResponse({
          allow: true,
          decision: "allow",
          findings: [],
          event: { decision_id: "dec-enterprise-1" },
        });
      }

      const providerResponse = await mockProvider(request as JsonRpcRequest);
      if (providerResponse.error?.data && isRecord(providerResponse.error.data)) {
        const findings = providerResponse.error.data.findings;
        if (Array.isArray(findings)) providerFindings.push(...findings.map(String));
      }
      providerReceipt = await verifiedReceiptFrom(request);
      return jsonResponse(providerResponse);
    },
  );

  assert.deepEqual(response, {
    jsonrpc: "2.0",
    id: 42,
    result: {
      content: [{ type: "text", text: "provider.crm.update_customer executed" }],
      agentpass: {
        decision_id: "dec-enterprise-1",
        enterprise_client_id: "claude-enterprise",
      },
    },
  });
  assert.ok(authorizePayload);
  assert.ok(providerReceipt);
  assert.deepEqual(providerFindings, []);

  console.log(JSON.stringify({
    ok: true,
    steps: [
      {
        step: "enterprise_jwt",
        ok: true,
        issuer: "https://idp.example.com",
        subject: "user-17",
        client_id: "claude-enterprise",
      },
      {
        step: "gateway_authorize",
        ok: true,
        tool: authorizePayload.tool,
        resource: authorizePayload.resource,
        scopes: authorizePayload.enterprise_auth?.scopes,
        groups: authorizePayload.enterprise_auth?.groups,
      },
      {
        step: "provider_receipt",
        ok: true,
        decision_id: providerReceipt.decision_id,
        enterprise_client_id: providerReceipt.enterprise_client_id,
        enterprise_id_jag_grant_id: providerReceipt.enterprise_id_jag_grant_id,
      },
      {
        step: "provider_execution",
        ok: true,
        response: response.result,
      },
    ],
  }, null, 2));
}

const demoRequest: JsonRpcRequest = {
  jsonrpc: "2.0",
  id: 42,
  method: "tools/call",
  params: {
    name: "provider.crm.update_customer",
    arguments: {
      customer_id: "cus_123",
      job_id: "support_case_resolution",
      case_id: "case-1042",
      approved: true,
      jit_grant_id: "grant-1",
      approval_id: "approval-1",
      patch: { plan: "enterprise" },
    },
  },
};

function demoConfig(jwks: JsonWebKeySet): AdapterConfig {
  return {
    agentid: {
      base_url: "https://agentid.example.com",
      tenant_id: "tenant-a",
    },
    downstream: {
      url: "https://provider.example.com/mcp",
    },
    agent: {
      id: "enterprise-support-agent",
    },
    enterprise_auth: {
      jwt: {
        issuer: "https://idp.example.com",
        audience: "provider-crm-mcp",
        jwks,
        required_scopes: ["mcp:provider-crm"],
        required_groups: ["support-admins"],
        claim_mapping: {
          tenant_id: "tid",
          user_id: "sub",
          agent_id: "agent_id",
          client_id: "azp",
          scopes: "scp",
          groups: "groups",
          id_jag_grant_id: "id_jag",
        },
      },
    },
    provider_receipts: {
      tenant_id: "tenant-a",
      hmac_secret: RECEIPT_SECRET,
    },
    tools: {
      "provider.crm.update_customer": {
        action: "write",
        data_from: "enterprise_crm",
        data_to: "provider_crm",
        resource_template: "provider/customer/{customer_id}",
        job_id_arg: "job_id",
        case_id_arg: "case_id",
        customer_id_arg: "customer_id",
        approved_arg: "approved",
        jit_grant_id_arg: "jit_grant_id",
        approval_id_arg: "approval_id",
        receipt_required: true,
        receipt_ttl_seconds: 300,
      },
    },
  };
}

async function mockProvider(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const params = isRecord(request.params) ? request.params : {};
  const args = isRecord(params.arguments) ? params.arguments : {};
  const receipt = await verifiedReceiptFrom(request);
  const findings = receiptFindings(receipt, params, args);

  if (findings.length > 0) {
    return {
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: -32010,
        message: "Provider denied MCP tool call",
        data: { findings },
      },
    };
  }

  return {
    jsonrpc: "2.0",
    id: request.id,
    result: {
      content: [{ type: "text", text: "provider.crm.update_customer executed" }],
      agentpass: {
        decision_id: receipt.decision_id,
        enterprise_client_id: receipt.enterprise_client_id,
      },
    },
  };
}

async function verifiedReceiptFrom(request: JsonRpcRequest): Promise<ProviderAuthorizationReceipt> {
  const params = isRecord(request.params) ? request.params : {};
  const args = isRecord(params.arguments) ? params.arguments : {};
  const verified = await unwrapProviderReceiptWithJwks(args._agentid_receipt, { secret: RECEIPT_SECRET });
  assert.deepEqual(verified.findings, []);
  assert.ok(verified.receipt);
  return verified.receipt;
}

function assertEnterpriseAuthorizePayload(payload: AgentIdAuthorizeRequest): void {
  assert.equal(payload.tenant_id, "tenant-a");
  assert.equal(payload.user_id, "user-17");
  assert.equal(payload.agent_id, "enterprise-support-agent");
  assert.equal(payload.tool, "provider.crm.update_customer");
  assert.equal(payload.action, "write");
  assert.equal(payload.resource, "provider/customer/cus_123");
  assert.equal(payload.enterprise_auth?.issuer, "https://idp.example.com");
  assert.equal(payload.enterprise_auth?.subject, "user-17");
  assert.equal(payload.enterprise_auth?.clientId, "claude-enterprise");
  assert.deepEqual(payload.enterprise_auth?.scopes, ["openid", "mcp:provider-crm", "crm.write"]);
  assert.deepEqual(payload.enterprise_auth?.groups, ["support", "support-admins"]);
  assert.equal(payload.enterprise_auth?.idJagGrantId, "id-jag-1");
}

function receiptFindings(
  receipt: ProviderAuthorizationReceipt,
  params: Record<string, unknown>,
  args: Record<string, unknown>,
): string[] {
  const findings: string[] = [];
  requireEqual(findings, "tool", receipt.tool, params.name);
  requireEqual(findings, "action", receipt.action, "write");
  requireEqual(findings, "tenant_id", receipt.tenant_id, "tenant-a");
  requireEqual(findings, "agent_id", receipt.agent_id, "enterprise-support-agent");
  requireEqual(findings, "user_id", receipt.user_id, "user-17");
  requireEqual(findings, "resource", receipt.resource, `provider/customer/${args.customer_id}`);
  requireEqual(findings, "job_id", receipt.job_id, args.job_id);
  requireEqual(findings, "case_id", receipt.case_id, args.case_id);
  requireEqual(findings, "customer_id", receipt.customer_id, args.customer_id);
  requireEqual(findings, "approval_id", receipt.approval_id, args.approval_id);
  requireEqual(findings, "jit_grant_id", receipt.jit_grant_id, args.jit_grant_id);
  requireEqual(findings, "enterprise_issuer", receipt.enterprise_issuer, "https://idp.example.com");
  requireEqual(findings, "enterprise_subject", receipt.enterprise_subject, "user-17");
  requireEqual(findings, "enterprise_client_id", receipt.enterprise_client_id, "claude-enterprise");
  requireEqual(findings, "enterprise_token_audience", receipt.enterprise_token_audience, "provider-crm-mcp");
  requireEqual(findings, "enterprise_id_jag_grant_id", receipt.enterprise_id_jag_grant_id, "id-jag-1");
  requireIncludes(findings, "enterprise_scopes", receipt.enterprise_scopes, "mcp:provider-crm");
  requireIncludes(findings, "enterprise_scopes", receipt.enterprise_scopes, "crm.write");
  requireIncludes(findings, "enterprise_groups", receipt.enterprise_groups, "support-admins");
  return findings;
}

function requireEqual(findings: string[], field: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) findings.push(`${field} mismatch: expected ${String(expected)}, got ${String(actual)}`);
}

function requireIncludes(findings: string[], field: string, actual: unknown, expected: string): void {
  if (!Array.isArray(actual) || !actual.includes(expected)) {
    findings.push(`${field} missing ${expected}`);
  }
}

function rsaKeyPair(kid: string): { privateKey: string; jwks: JsonWebKeySet } {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const jwk = publicKey.export({ format: "jwk" }) as JsonWebKey;
  return {
    privateKey: privateKeyPem,
    jwks: {
      keys: [{ ...jwk, kid, alg: "RS256", use: "sig" }],
    },
  };
}

function signJwt(claims: Record<string, unknown>, privateKeyPem: string, kid: string): string {
  const signingInput = [
    base64UrlJson({ alg: "RS256", typ: "JWT", kid }),
    base64UrlJson(claims),
  ].join(".");
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${signer.sign(createPrivateKey(privateKeyPem)).toString("base64url")}`;
}

function base64UrlJson(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
