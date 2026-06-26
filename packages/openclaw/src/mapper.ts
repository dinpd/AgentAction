import { createHash } from "node:crypto";

import type { AgentAction, GuardCheck } from "@dinpd/ai-agent-guard";

import type { AgentPassOpenClawConfig, OpenClawBeforeToolCallEvent, OpenClawToolContext } from "./types.js";

export function mapOpenClawToolCallToAgentPass(
  event: OpenClawBeforeToolCallEvent,
  ctx: OpenClawToolContext,
  config: Pick<AgentPassOpenClawConfig, "defaultAction"> = { defaultAction: "read" },
): GuardCheck {
  const action = inferAction(event.toolName, event.params, config.defaultAction);
  const resource = inferResource(event);
  const fieldSet = inferFieldSet(event.params);
  const classifications = inferDataClassification(event.params, fieldSet);

  return {
    agentId: ctx.agentId || "openclaw",
    jobId: ctx.runId || event.runId || ctx.sessionId || ctx.sessionKey,
    tool: event.toolName,
    action,
    resource,
    callFingerprint: stableHash({
      toolName: event.toolName,
      params: event.params,
      toolCallId: event.toolCallId || ctx.toolCallId,
      runId: event.runId || ctx.runId,
    }),
    idempotencyKey: inferIdempotencyKey(event, ctx, action, resource),
    dataFrom: inferDataFrom(event),
    dataTo: inferDataTo(event, action),
    destinationType: inferDestinationType(event, action),
    dataClassification: classifications,
    fieldSet,
    policyFindings: inferPolicyFindings(event, ctx),
  };
}

export function inferAction(toolName: string, params: Record<string, unknown>, fallback: AgentAction = "read"): AgentAction {
  const normalized = normalize(toolName);
  const actionParam = readString(params.action);
  if (actionParam) return normalizeAction(actionParam, fallback);

  if (normalized.includes("read") || normalized.includes("search") || normalized.includes("fetch")) return "read";
  if (normalized.includes("write") || normalized.includes("edit") || normalized.includes("patch")) return "write";
  if (normalized.includes("browser")) return inferBrowserAction(params);
  if (normalized.includes("exec") || normalized.includes("process") || normalized.includes("bash")) return "admin";
  if (normalized.includes("cron") || normalized.includes("schedule")) return "write";
  if (normalized.includes("message") || normalized.includes("send") || normalized.includes("slack") || normalized.includes("discord")) {
    return "send";
  }
  if (normalized.includes("session")) return normalized.includes("spawn") ? "admin" : "send";
  if (normalized.includes("delete") || normalized.includes("remove")) return "delete";
  if (normalized.includes("deploy") || normalized.includes("release")) return "deploy";
  if (normalized.includes("refund") || normalized.includes("payment")) return "pay";
  if (normalized.includes("export")) return "export";
  return fallback;
}

export function summarizeAgentPassDecision(decision: { reasons?: string[]; type?: string; decision?: string }): string {
  const reasons = decision.reasons?.filter(Boolean) || [];
  if (reasons.length > 0) return `AgentPass ${decision.type || decision.decision || "decision"}: ${reasons.join("; ")}`;
  return `AgentPass ${decision.type || decision.decision || "decision"} blocked this tool call`;
}

export function approvalTitle(check: GuardCheck): string {
  const verb = check.action === "admin" ? "Run" : titleCase(check.action);
  return `Approve ${verb} with ${check.tool}`;
}

export function approvalDescription(check: GuardCheck, decision: { reasons?: string[] }): string {
  const parts = [
    `Tool: ${check.tool}`,
    `Action: ${check.action}`,
    check.resource ? `Resource: ${check.resource}` : undefined,
    decision.reasons && decision.reasons.length > 0 ? `Reason: ${decision.reasons.join("; ")}` : undefined,
  ].filter(Boolean);
  return truncate(parts.join("\n"), 256);
}

export function approvalSeverity(check: GuardCheck): "info" | "warning" | "critical" {
  if (["admin", "delete", "deploy", "pay"].includes(check.action)) return "critical";
  if (["write", "send", "export"].includes(check.action)) return "warning";
  return "info";
}

function inferBrowserAction(params: Record<string, unknown>): AgentAction {
  const action = normalize(readString(params.action) || readString(params.type) || "");
  if (["submit", "click", "fill", "type", "navigate"].some((word) => action.includes(word))) return "write";
  return "read";
}

function normalizeAction(value: string, fallback: AgentAction): AgentAction {
  const normalized = normalize(value);
  if (["read", "write", "send", "delete", "pay", "deploy", "export", "admin"].includes(normalized)) {
    return normalized;
  }
  if (["execute", "exec", "shell", "process"].includes(normalized)) return "admin";
  return fallback;
}

function inferResource(event: OpenClawBeforeToolCallEvent): string | undefined {
  const explicit =
    readString(event.params.resource) ||
    readString(event.params.path) ||
    readString(event.params.file) ||
    readString(event.params.url) ||
    readString(event.params.command) ||
    readString(event.params.to);
  if (explicit) return explicit;
  return event.derivedPaths && event.derivedPaths.length > 0 ? event.derivedPaths.join(",") : undefined;
}

function inferIdempotencyKey(
  event: OpenClawBeforeToolCallEvent,
  ctx: OpenClawToolContext,
  action: AgentAction,
  resource?: string,
): string | undefined {
  const explicit = readString(event.params.idempotencyKey) || readString(event.params.idempotency_key);
  if (explicit) return explicit;
  if (!["write", "send", "delete", "pay", "deploy", "export", "admin"].includes(action)) return undefined;
  return stableHash({
    session: ctx.sessionId || ctx.sessionKey,
    run: ctx.runId || event.runId,
    tool: event.toolName,
    resource,
    params: event.params,
  });
}

function inferDataFrom(event: OpenClawBeforeToolCallEvent): string | undefined {
  if (event.derivedPaths && event.derivedPaths.length > 0) return "local_files";
  const from = readString(event.params.dataFrom) || readString(event.params.data_from);
  if (from) return from;
  if (hasSecretField(event.params)) return "secrets_manager";
  return undefined;
}

function inferDataTo(event: OpenClawBeforeToolCallEvent, action: AgentAction): string | undefined {
  const to = readString(event.params.dataTo) || readString(event.params.data_to);
  if (to) return to;
  const normalized = normalize(event.toolName);
  if (normalized.includes("browser") && action !== "read") return "browser_form";
  if (normalized.includes("message") || normalized.includes("send") || normalized.includes("slack") || normalized.includes("discord")) {
    return "external_channel";
  }
  if (normalized.includes("export")) return "file_export";
  return undefined;
}

function inferDestinationType(event: OpenClawBeforeToolCallEvent, action: AgentAction): string | undefined {
  const destination = readString(event.params.destinationType) || readString(event.params.destination_type);
  if (destination) return destination;
  const normalized = normalize(event.toolName);
  if (normalized.includes("browser") && action !== "read") return "browser_form";
  if (normalized.includes("message") || normalized.includes("send") || normalized.includes("slack") || normalized.includes("discord")) {
    return "external_message";
  }
  if (normalized.includes("export")) return "file_export";
  return undefined;
}

function inferFieldSet(params: Record<string, unknown>): string[] {
  const fields = new Set<string>();
  collectFieldNames(params, fields);
  return [...fields].sort();
}

function inferDataClassification(params: Record<string, unknown>, fieldSet: string[]): string[] {
  const explicit = params.dataClassification || params.data_classification;
  if (Array.isArray(explicit)) return explicit.filter((value): value is string => typeof value === "string");

  const classifications = new Set<string>();
  const normalizedFields = fieldSet.map(normalize);
  if (normalizedFields.some((field) => ["ssn", "email", "phone", "address", "dob", "date_of_birth"].includes(field))) {
    classifications.add("pii");
  }
  if (normalizedFields.some((field) => ["api_key", "access_token", "password", "private_key", "secret"].includes(field))) {
    classifications.add("secret");
  }
  if (containsLikelyPii(params)) classifications.add("pii");
  return [...classifications].sort();
}

function inferPolicyFindings(event: OpenClawBeforeToolCallEvent, ctx: OpenClawToolContext): string[] {
  return [
    event.toolKind ? `openclaw.toolKind=${event.toolKind}` : undefined,
    event.toolInputKind ? `openclaw.toolInputKind=${event.toolInputKind}` : undefined,
    ctx.channelId ? `openclaw.channelId=${ctx.channelId}` : undefined,
  ].filter((value): value is string => Boolean(value));
}

function collectFieldNames(value: unknown, fields: Set<string>, prefix = ""): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectFieldNames(item, fields, prefix);
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    fields.add(path);
    if (nested && typeof nested === "object") collectFieldNames(nested, fields, path);
  }
}

function hasSecretField(params: Record<string, unknown>): boolean {
  return inferFieldSet(params).some((field) =>
    ["api_key", "access_token", "password", "private_key", "secret"].includes(normalize(field)),
  );
}

function containsLikelyPii(value: unknown): boolean {
  const text = stableStringify(value);
  return /\b\d{3}-\d{2}-\d{4}\b/.test(text) || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "_");
}

function titleCase(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`).join(",")}}`;
}
