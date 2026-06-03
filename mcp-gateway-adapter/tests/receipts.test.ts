import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import {
  canonicalJson,
  signProviderReceiptJws,
  signProviderReceipt,
  unwrapProviderReceipt,
  verifyJwsProviderReceipt,
  verifySignedProviderReceipt,
} from "../src/receipts.ts";
import type { ProviderAuthorizationReceipt } from "../src/types.ts";

test("canonicalJson sorts object keys recursively", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: 4, c: 3 } }), '{"a":{"c":3,"d":4},"b":1}');
});

test("signs and verifies provider receipts", () => {
  const signed = signProviderReceipt(receipt, "test-secret");
  const verified = verifySignedProviderReceipt(signed, "test-secret");

  assert.deepEqual(verified.findings, []);
  assert.deepEqual(verified.receipt, receipt);
});

test("detects signed receipt tampering", () => {
  const signed = signProviderReceipt(receipt, "test-secret");
  const verified = verifySignedProviderReceipt(
    { ...signed, payload: { ...signed.payload, resource: "provider/customer/cus_456" } },
    "test-secret",
  );

  assert.deepEqual(verified.findings, ["receipt signature mismatch"]);
});

test("signs and verifies JWS provider receipts", () => {
  const { privateKey, jwks } = rsaKeyPair();
  const signed = signProviderReceiptJws(receipt, privateKey, {
    issuer: "https://enterprise.example.com",
    audience: "provider-crm-mcp",
    keyId: "agentid-2026-06",
  });
  const verified = verifyJwsProviderReceipt(signed, jwks, {
    issuer: "https://enterprise.example.com",
    audience: "provider-crm-mcp",
    now: () => new Date("2026-05-28T12:01:00.000Z"),
  });

  assert.deepEqual(verified.findings, []);
  assert.deepEqual(verified.receipt, receipt);
});

test("detects JWS issuer mismatch", () => {
  const { privateKey, jwks } = rsaKeyPair();
  const signed = signProviderReceiptJws(receipt, privateKey, {
    issuer: "https://enterprise.example.com",
    audience: "provider-crm-mcp",
    keyId: "agentid-2026-06",
  });
  const verified = verifyJwsProviderReceipt(signed, jwks, {
    issuer: "https://other.example.com",
    audience: "provider-crm-mcp",
    now: () => new Date("2026-05-28T12:01:00.000Z"),
  });

  assert.deepEqual(verified.findings, ["receipt JWS issuer mismatch"]);
});

test("unwrapProviderReceipt accepts raw receipts and verifies signed envelopes", () => {
  assert.deepEqual(unwrapProviderReceipt(receipt), { receipt, findings: [] });

  const signed = signProviderReceipt(receipt, "test-secret");
  assert.deepEqual(unwrapProviderReceipt(signed, "test-secret"), { receipt, findings: [] });
  assert.deepEqual(unwrapProviderReceipt(signed), { findings: ["receipt signature secret is required"] });
});

test("unwrapProviderReceipt forwards JWS trust policy options", () => {
  const { privateKey, jwks } = rsaKeyPair();
  const signed = signProviderReceiptJws(receipt, privateKey, {
    issuer: "https://enterprise.example.com",
    audience: "provider-crm-mcp",
    keyId: "agentid-2026-06",
  });

  const verified = unwrapProviderReceipt(signed, undefined, jwks, {
    issuer: "https://other.example.com",
    audience: "provider-crm-mcp",
    now: () => new Date("2026-05-28T12:01:00.000Z"),
  });

  assert.deepEqual(verified.findings, ["receipt JWS issuer mismatch"]);
});

const receipt: ProviderAuthorizationReceipt = {
  decision_id: "dec-1",
  tenant_id: "tenant-a",
  agent_id: "enterprise-support-agent",
  tool: "provider.crm.update_customer",
  action: "write",
  resource: "provider/customer/cus_123",
  job_id: "support_case_resolution",
  case_id: "case-1042",
  customer_id: "cus_123",
  approval_id: "approval-1",
  jit_grant_id: "grant-1",
  issued_at: "2026-05-28T12:00:00.000Z",
  expires_at: "2026-05-28T12:05:00.000Z",
};

function rsaKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  jwk.kid = "agentid-2026-06";
  jwk.alg = "RS256";
  jwk.use = "sig";
  return {
    privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    jwks: { keys: [jwk] },
  };
}
