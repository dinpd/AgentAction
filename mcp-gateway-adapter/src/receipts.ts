import { createHmac, timingSafeEqual } from "node:crypto";

import type { ProviderAuthorizationReceipt, SignedProviderAuthorizationReceipt } from "./types.js";

export type ReceiptUnwrapResult = {
  receipt?: ProviderAuthorizationReceipt;
  findings: string[];
};

export function signProviderReceipt(
  receipt: ProviderAuthorizationReceipt,
  secret: string,
): SignedProviderAuthorizationReceipt {
  return {
    alg: "HS256",
    payload: receipt,
    signature: receiptSignature(receipt, secret),
  };
}

export function verifySignedProviderReceipt(
  value: unknown,
  secret: string,
): ReceiptUnwrapResult {
  if (!isRecord(value)) return { findings: ["signed receipt envelope is required"] };

  const findings: string[] = [];
  if (value.alg !== "HS256") findings.push("receipt signature alg must be HS256");
  if (!isRecord(value.payload)) findings.push("receipt signed payload is required");
  if (!stringValue(value.signature)) findings.push("receipt signature is required");
  if (findings.length || !isRecord(value.payload)) return { findings };

  const expected = receiptSignature(value.payload, secret);
  if (!safeEqual(expected, stringValue(value.signature))) findings.push("receipt signature mismatch");
  return {
    receipt: value.payload as ProviderAuthorizationReceipt,
    findings,
  };
}

export function unwrapProviderReceipt(value: unknown, secret?: string): ReceiptUnwrapResult {
  if (!isRecord(value)) return { findings: [] };
  if (!isSignedReceiptEnvelope(value)) return { receipt: value as ProviderAuthorizationReceipt, findings: [] };
  if (!secret) return { findings: ["receipt signature secret is required"] };
  return verifySignedProviderReceipt(value, secret);
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function receiptSignature(payload: Record<string, unknown>, secret: string): string {
  return createHmac("sha256", secret).update(canonicalJson(payload)).digest("base64url");
}

function isSignedReceiptEnvelope(value: Record<string, unknown>): boolean {
  return "payload" in value || "signature" in value || "alg" in value;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value);
}
