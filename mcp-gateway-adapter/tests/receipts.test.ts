import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalJson,
  signProviderReceipt,
  unwrapProviderReceipt,
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

test("unwrapProviderReceipt accepts raw receipts and verifies signed envelopes", () => {
  assert.deepEqual(unwrapProviderReceipt(receipt), { receipt, findings: [] });

  const signed = signProviderReceipt(receipt, "test-secret");
  assert.deepEqual(unwrapProviderReceipt(signed, "test-secret"), { receipt, findings: [] });
  assert.deepEqual(unwrapProviderReceipt(signed), { findings: ["receipt signature secret is required"] });
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
