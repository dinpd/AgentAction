import gateway, { AgentIdJitGrants } from "../../../cloudflare/src/worker.ts";
import {
  bindIntentContract,
  digestIntentObservation,
  type IntentContract,
  type IntentObservation,
} from "../../../packages/guard/src/intent.ts";
import { REVIEW_UI } from "./review-ui.ts";

export { AgentIdJitGrants };
type Json = Record<string, any>;
type Storage = {
  get<T = any>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
};
type State = { storage: Storage };
type Namespace = {
  idFromName(name: string): any;
  get(id: any): { fetch(request: Request): Promise<Response> };
};
export type Principal = {
  token_sha256: string;
  tenant_id: string;
  subject: string;
  agent_id: string;
  role: "recipe" | "reviewer";
};
export type Env = {
  WORKATO_CLIENTS_JSON?: string;
  REFUNDS: Namespace;
  MOCK_PROVIDER: Namespace;
  JIT_GRANTS: Namespace;
};
type Scope = {
  request_id: string;
  payment_id: string;
  amount_cents: number;
  currency: "USD";
  reason: string;
};
type Refund = {
  scope: Scope;
  scope_digest: string;
  tenant_id: string;
  agent_id: string;
  requested_by: string;
  status: string;
  created_at: string;
  contract: IntentContract;
  event: Json;
  timeline: Json[];
  correlations: Json[];
  approval?: Json;
  grant?: Json;
  execution?: Json;
  provider_result?: Json;
  observation?: IntentObservation;
  provider_attestation?: { jws: string; public_jwk: Json };
  finalization?: Json;
  finalization_job?: Json;
};
const ID = /^[a-zA-Z0-9_-]{1,80}$/;
const REASONS = ["duplicate_charge", "service_failure"];
const LIMIT = 10000;
const MAX_REQUESTS = 250;
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
function timestamp(): string {
  return new Date().toISOString();
}
export async function sha256(text: string): Promise<string> {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
function id(value: unknown, name: string): string {
  if (typeof value !== "string" || !ID.test(value))
    throw new HttpError(400, `invalid_${name}`);
  return value;
}
async function body(request: Request): Promise<Json> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "json_required");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "body_required");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.length;
    if (length > 8192) {
      await reader.cancel();
      throw new HttpError(413, "body_too_large");
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let value;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, "invalid_json");
  }
  if (!value || Array.isArray(value) || typeof value !== "object")
    throw new HttpError(400, "object_required");
  return value;
}
function scopeFrom(input: Json): Scope {
  const allowed = [
    "request_id",
    "payment_id",
    "amount_cents",
    "currency",
    "reason",
    "workato_recipe_id",
    "workato_job_id",
    "simulate_response_loss",
  ];
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new HttpError(400, "unknown_input_field");
  if (
    !Number.isSafeInteger(input.amount_cents) ||
    input.amount_cents <= 0 ||
    input.amount_cents > 1000000
  )
    throw new HttpError(400, "invalid_amount_cents");
  if (input.currency !== "USD")
    throw new HttpError(400, "unsupported_currency");
  if (!REASONS.includes(input.reason))
    throw new HttpError(400, "unsupported_reason");
  if (
    input.simulate_response_loss !== undefined &&
    typeof input.simulate_response_loss !== "boolean"
  )
    throw new HttpError(400, "invalid_response_loss_flag");
  for (const key of ["workato_recipe_id", "workato_job_id"])
    if (input[key] !== undefined && input[key] !== "")
      id(String(input[key]), key);
  return {
    request_id: id(input.request_id, "request_id"),
    payment_id: id(input.payment_id, "payment_id"),
    amount_cents: input.amount_cents,
    currency: "USD",
    reason: input.reason,
  };
}
async function authenticate(request: Request, env: Env): Promise<Principal> {
  let clients: Principal[];
  try {
    clients = JSON.parse(env.WORKATO_CLIENTS_JSON || "null");
  } catch {
    throw new HttpError(503, "credentials_not_configured");
  }
  if (
    !Array.isArray(clients) ||
    clients.length === 0 ||
    clients.some(
      (c) =>
        !c ||
        !/^[a-f0-9]{64}$/.test(c.token_sha256) ||
        !["tenant_id", "subject", "agent_id"].every(
          (key) => typeof c[key] === "string" && ID.test(c[key]),
        ) ||
        !["recipe", "reviewer"].includes(c.role),
    )
  )
    throw new HttpError(503, "credentials_not_configured");
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([^\s]{32,256})$/)?.[1];
  if (!token) throw new HttpError(401, "unauthorized");
  const digest = await sha256(token);
  const matches = clients.filter((c) => c.token_sha256 === digest);
  if (matches.length !== 1) throw new HttpError(401, "unauthorized");
  return matches[0];
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (
        request.method === "GET" &&
        (url.pathname === "/" || url.pathname === "/review")
      )
        return new Response(REVIEW_UI, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "content-security-policy":
              "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
            "x-content-type-options": "nosniff",
          },
        });
      if (request.method === "GET" && url.pathname === "/health")
        return json({
          service: "agentaction-workato-reference",
          provider: "synthetic-only",
          credentials_configured: Boolean(env.WORKATO_CLIENTS_JSON),
        });
      const principal = await authenticate(request, env);
      if (request.method === "GET" && url.pathname === "/connection")
        return json({
          tenant_id: principal.tenant_id,
          subject: principal.subject,
          role: principal.role,
          provider: "synthetic-only",
        });
      if (url.searchParams.size)
        throw new HttpError(400, "query_parameters_not_supported");
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] !== "requests" || parts.length > 3)
        throw new HttpError(404, "not_found");
      if (parts[1]) id(parts[1], "request_id");
      if (
        (parts.length === 1 && request.method === "GET") ||
        ["approve", "deny"].includes(parts[2])
      ) {
        if (principal.role !== "reviewer")
          throw new HttpError(403, "reviewer_required");
      }
      // Principal headers exist only on internal binding requests. Public
      // caller-supplied identity headers are discarded rather than forwarded.
      const headers = new Headers({
        "content-type": "application/json",
        "x-principal": JSON.stringify(principal),
        "x-origin": url.origin,
      });
      const forwarded = new Request(`https://refunds.internal${url.pathname}`, {
        method: request.method,
        headers,
        body:
          request.method === "POST"
            ? JSON.stringify(await body(request))
            : undefined,
      });
      return await env.REFUNDS.get(
        env.REFUNDS.idFromName(principal.tenant_id),
      ).fetch(forwarded);
    } catch (error) {
      return json(
        {
          error:
            error instanceof HttpError ? error.message : "service_unavailable",
        },
        error instanceof HttpError ? error.status : 503,
      );
    }
  },
};

function manifest(agentId: string): Json {
  return {
    agent: { id: agentId },
    jit_authorization: {
      enabled: true,
      default_ttl_seconds: 300,
      revoke_after_use: true,
    },
    tools: [
      {
        name: "mock.create_refund",
        access: "write",
        auth_mode: "just_in_time",
        approval: "human_confirm",
        constraints: {
          approval_ttl_seconds: 1800,
          token_ttl_seconds: 300,
          required_context: ["policy_eligible"],
          allowed_values: { policy_eligible: ["true"] },
        },
      },
    ],
    intent_assurance: {
      observations: {
        trusted_issuers: [
          {
            issuer: "workato-mock-provider",
            profiles: ["workato_refund.v1"],
            predicates: ["refund.status"],
            verification_methods: ["jws"],
            jwks_uri: "https://mock-provider.internal/jwks",
            audiences: ["agentaction-workato-reference"],
          },
        ],
      },
    },
  };
}
function contractFor(scope: Scope, createdAt: string): IntentContract {
  return bindIntentContract({
    schema_version: "agentpass.intent-contract.v1",
    intent_id: `workato-${scope.request_id}`,
    profile: "workato_refund.v1",
    issuer: "workato-reference-adapter",
    job_id: scope.request_id,
    objective: "Refund the approved synthetic payment exactly once",
    issued_at: createdAt,
    required_outcomes: [
      {
        id: "refund-once",
        source: "execution_receipts",
        assertion: { operator: "count_equals", value: 1 },
      },
      {
        id: "provider-succeeded",
        source: "observations",
        where: [
          { path: "predicate", operator: "equals", value: "refund.status" },
        ],
        assertion: { operator: "equals", path: "value", value: "succeeded" },
      },
      {
        id: "exact-amount",
        source: "execution_receipts",
        assertion: {
          operator: "equals",
          path: "amount",
          value: scope.amount_cents / 100,
          quantifier: "all",
        },
      },
    ],
    hard_constraints: [
      {
        id: "amount-within-policy",
        source: "execution_receipts",
        assertion: {
          operator: "lte",
          path: "amount",
          value: 100,
          quantifier: "all",
        },
      },
      {
        id: "exact-payment",
        source: "execution_receipts",
        assertion: {
          operator: "equals",
          path: "resource",
          value: `payment/${scope.payment_id}`,
          quantifier: "all",
        },
      },
    ],
    evidence_requirements: [
      "decision_events",
      "execution_receipts",
      "observations",
      "job",
    ],
    trusted_observation_requirements: [
      {
        predicate: "refund.status",
        issuers: ["workato-mock-provider"],
        verification_methods: ["jws"],
      },
    ],
  });
}

export class WorkatoRefunds {
  state: State;
  env: Env;
  private queue: Promise<unknown> = Promise.resolve();
  // Tests inject a failure after durable boundaries; no HTTP input selects it.
  failpoint?: (name: string) => void;
  constructor(state: State, env: Env) {
    this.state = state;
    this.env = env;
  }
  async fetch(request: Request): Promise<Response> {
    const run = this.queue.then(() => this.handle(request));
    this.queue = run.catch(() => undefined);
    try {
      return await run;
    } catch (error) {
      return json(
        {
          error:
            error instanceof HttpError ? error.message : "service_unavailable",
        },
        error instanceof HttpError ? error.status : 503,
      );
    }
  }
  async handle(request: Request): Promise<Response> {
    const p = JSON.parse(
      request.headers.get("x-principal") || "null",
    ) as Principal;
    if (!p) throw new HttpError(401, "unauthorized");
    const origin = request.headers.get("x-origin") || "";
    const parts = new URL(request.url).pathname.split("/").filter(Boolean);
    const input = request.method === "POST" ? await body(request) : {};
    if (parts.length === 1 && request.method === "GET") {
      if (p.role !== "reviewer") throw new HttpError(403, "reviewer_required");
      const ids = (await this.state.storage.get<string[]>("index")) || [];
      const records = await Promise.all(
        ids.map((key) => this.state.storage.get<Refund>(`request:${key}`)),
      );
      return json({
        requests: records.filter(Boolean).map((r) => this.view(r!, origin)),
      });
    }
    if (parts.length === 1 && request.method === "POST") {
      if (p.role !== "recipe") throw new HttpError(403, "recipe_required");
      const scope = scopeFrom(input);
      const digest = await sha256(JSON.stringify(scope));
      let r = await this.state.storage.get<Refund>(
        `request:${scope.request_id}`,
      );
      const replayed = Boolean(r);
      if (
        r &&
        (r.scope_digest !== digest ||
          r.agent_id !== p.agent_id ||
          r.requested_by !== p.subject)
      )
        throw new HttpError(409, "request_scope_mismatch");
      if (!r) {
        const ids = (await this.state.storage.get<string[]>("index")) || [];
        if (ids.length >= MAX_REQUESTS)
          throw new HttpError(429, "demo_request_limit");
        const createdAt = timestamp();
        const contract = contractFor(scope, createdAt);
        r = {
          scope,
          scope_digest: digest,
          status: "created",
          tenant_id: p.tenant_id,
          agent_id: p.agent_id,
          requested_by: p.subject,
          created_at: createdAt,
          contract,
          timeline: [],
          correlations: [],
          event: {
            agent_id: p.agent_id,
            user_id: p.subject,
            requested_by: p.subject,
            tool: "mock.create_refund",
            action: "write",
            resource: `payment/${scope.payment_id}`,
            amount: scope.amount_cents / 100,
            currency: scope.currency,
            reason: scope.reason,
            job_id: scope.request_id,
            idempotency_key: scope.request_id,
            intent_id: contract.intent_id,
            intent_digest: contract.intent_digest,
            policy_eligible: String(scope.amount_cents <= LIMIT),
          },
        };
        await this.save(r);
      }
      const index = (await this.state.storage.get<string[]>("index")) || [];
      if (!index.includes(scope.request_id))
        await this.state.storage.put("index", [scope.request_id, ...index]);
      this.correlate(r, input);
      if (r.status === "created") await this.initialize(r);
      await this.save(r);
      if (
        input.simulate_response_loss === true &&
        !r.timeline.some((e) => e.type === "demo.response_lost")
      ) {
        this.add(
          r,
          "demo.response_lost",
          "Response deliberately lost after durable acceptance; retry the same business request ID.",
        );
        await this.save(r);
        return json(
          { error: "simulated_response_loss", request_id: scope.request_id },
          504,
        );
      }
      return json(this.view(r, origin, replayed), replayed ? 200 : 201);
    }
    const r = await this.state.storage.get<Refund>(`request:${parts[1]}`);
    if (
      !r ||
      r.tenant_id !== p.tenant_id ||
      (p.role === "recipe" &&
        (r.agent_id !== p.agent_id || r.requested_by !== p.subject))
    )
      throw new HttpError(404, "not_found");
    if (request.method === "GET" && parts.length === 2) {
      if (
        r.status === "pending" &&
        r.approval &&
        Date.parse(r.approval.expires_at) <= Date.now()
      ) {
        r.status = "expired";
        this.add(r, "approval.expired", "Approval expired without execution.");
        await this.save(r);
      }
      return json(this.view(r, origin));
    }
    if (request.method === "GET" && parts[2] === "evidence")
      return json({
        ...this.view(r, origin),
        contract: r.contract,
        authorization: r.execution,
        observation: r.observation,
        provider_attestation: r.provider_attestation,
        finalization: r.finalization,
        timeline: r.timeline,
        correlations: r.correlations,
        provenance:
          "synthetic mock provider; runtime journal and signed provider read-back, not an independent financial audit",
      });
    if (request.method === "POST" && ["approve", "deny"].includes(parts[2])) {
      if (p.role !== "reviewer") throw new HttpError(403, "reviewer_required");
      if (
        Object.keys(input).some(
          (key) => !["scope_digest", "decision_reason"].includes(key),
        ) ||
        input.scope_digest !== r.scope_digest
      )
        throw new HttpError(409, "review_scope_mismatch");
      if (
        typeof input.decision_reason !== "string" ||
        !input.decision_reason.trim() ||
        input.decision_reason.length > 300
      )
        throw new HttpError(400, "decision_reason_required");
      if (r.status !== "pending" || !r.approval)
        throw new HttpError(409, "request_not_pending");
      r.approval = await this.callGateway(
        r,
        "POST",
        `/approval-requests/${r.approval.approval_id}/${parts[2]}`,
        {
          decided_by: p.subject,
          decision_reason: input.decision_reason.trim(),
        },
      );
      r.status = parts[2] === "approve" ? "approved" : "denied";
      this.add(r, `approval.${r.status}`, input.decision_reason.trim());
      await this.save(r);
      if (r.status === "approved") await this.execute(r);
      return json(this.view(r, origin));
    }
    if (request.method === "POST" && parts[2] === "execute") {
      if (Object.keys(input).length)
        throw new HttpError(400, "execute_body_must_be_empty");
      const replayed = r.status === "succeeded";
      await this.execute(r);
      return json(this.view(r, origin, replayed));
    }
    throw new HttpError(404, "not_found");
  }
  async initialize(r: Refund): Promise<void> {
    await this.callGateway(r, "POST", "/intent-contracts", r.contract);
    const decision = await this.callGateway(
      r,
      "POST",
      "/authorize",
      r.event,
      true,
    );
    this.add(
      r,
      "authorization.preflight",
      (decision.findings || []).join("; "),
    );
    if (r.scope.amount_cents > LIMIT) {
      r.status = "denied";
      this.add(r, "policy.denied", "Synthetic refunds are limited to USD 100.");
      return;
    }
    // Preflight is deliberately unapproved and ungranted. Any unrelated denial
    // fails closed; only the known missing approval/JIT findings may proceed.
    const expected = new Set([
      "missing jit_grant_id",
      "event[0]: mock.create_refund requires approval but event is not approved",
      "event[0]: mock.create_refund requires JIT authorization but no jit_grant_id is present",
      "event[0]: JIT grant is marked invalid",
    ]);
    if (
      decision.allow ||
      !decision.findings?.length ||
      !decision.findings.every((finding: string) => expected.has(finding))
    )
      throw new HttpError(503, "preflight_not_approval_only");
    r.approval = await this.callGateway(r, "POST", "/approval-requests", {
      ...r.event,
      approval_id: `workato-${r.scope.request_id}`,
    });
    r.status = "pending";
    this.add(
      r,
      "approval.pending",
      "Exact payment, amount, currency, reason, business request and intent await human review.",
    );
  }
  async callGateway(
    r: Refund,
    method: string,
    path: string,
    input?: unknown,
    allowDenied = false,
  ): Promise<Json> {
    const tasks: Promise<unknown>[] = [];
    const response = await gateway.fetch(
      new Request(
        `https://agentaction.internal/tenants/${r.tenant_id}${path}`,
        {
          method,
          headers: { "content-type": "application/json" },
          body: input === undefined ? undefined : JSON.stringify(input),
        },
      ),
      {
        JIT_GRANTS: this.env.JIT_GRANTS,
        AGENTID_MANIFESTS: {
          async get() {
            return JSON.stringify(manifest(r.agent_id));
          },
          async put() {
            throw new Error("read-only manifest");
          },
        },
      },
      {
        waitUntil(task: Promise<unknown>) {
          tasks.push(task);
        },
      } as any,
    );
    await Promise.all(tasks);
    const output = (await response.json()) as Json;
    if (!response.ok && !(allowDenied && response.status === 403))
      throw new HttpError(
        response.status >= 500 ? 503 : 409,
        "authorization_service_rejected",
      );
    return output;
  }
  async provider(r: Refund, path: string, input?: unknown): Promise<Json> {
    const response = await this.env.MOCK_PROVIDER.get(
      this.env.MOCK_PROVIDER.idFromName(r.tenant_id),
    ).fetch(
      new Request(`https://mock.internal${path}`, {
        method: input === undefined ? "GET" : "POST",
        headers: { "content-type": "application/json" },
        body: input === undefined ? undefined : JSON.stringify(input),
      }),
    );
    if (!response.ok) throw new HttpError(503, "provider_unavailable");
    return (await response.json()) as Json;
  }
  async execute(r: Refund): Promise<void> {
    if (r.status === "succeeded") return;
    if (["pending", "denied", "expired", "created"].includes(r.status))
      throw new HttpError(409, "approval_required");
    if (r.status === "approved") {
      if (!r.approval || Date.parse(r.approval.expires_at) <= Date.now()) {
        r.status = "expired";
        await this.save(r);
        throw new HttpError(409, "approval_expired");
      }
      if (
        r.scope.amount_cents > LIMIT ||
        r.scope_digest !== (await sha256(JSON.stringify(r.scope)))
      )
        throw new HttpError(409, "scope_invalid");
      if (!r.grant) {
        r.grant = await this.callGateway(r, "POST", "/jit-grants", {
          ...r.event,
          approval_id: r.approval.approval_id,
        });
        await this.save(r);
      }
      // Persist the uncertainty boundary BEFORE the single-use grant can be
      // consumed. Recovery never blindly authorizes or mutates a second time.
      r.status = "authorizing";
      await this.save(r);
      const decision = await this.callGateway(
        r,
        "POST",
        "/authorize",
        {
          ...r.event,
          approval_id: r.approval.approval_id,
          jit_grant_id: r.grant.jit_grant_id,
          approved: true,
        },
        true,
      );
      if (!decision.allow) {
        r.status = "denied";
        this.add(
          r,
          "authorization.denied",
          (decision.findings || []).join("; "),
        );
        await this.save(r);
        return;
      }
      r.execution = decision.event;
      r.status = "executing";
      this.add(
        r,
        "authorization.allowed",
        "Exact-scope single-use authority consumed.",
      );
      await this.save(r);
      this.failpoint?.("before_provider");
      r.provider_result = await this.provider(r, "/refund", {
        scope: r.scope,
        event: r.execution,
        tenant_id: r.tenant_id,
      });
      this.failpoint?.("after_provider");
      r.status = "evidence_pending";
      await this.save(r);
    } else if (["authorizing", "executing", "unknown"].includes(r.status)) {
      const found = await this.provider(r, `/refunds/${r.scope.request_id}`);
      if (!found.refund || !r.execution) {
        r.status = "unknown";
        this.add(
          r,
          "execution.uncertain",
          "No confirmed provider result; operator reconciliation required. No new mutation issued.",
        );
        await this.save(r);
        return;
      }
      r.provider_result = found.refund;
      r.status = "evidence_pending";
      this.add(
        r,
        "execution.recovered",
        "Recovered the durable original provider result.",
      );
      await this.save(r);
    }
    if (r.status === "evidence_pending") {
      if (!r.execution || !r.provider_result)
        throw new HttpError(503, "execution_evidence_missing");
      await this.callGateway(r, "POST", "/execution-results", {
        ...r.execution,
        result: r.provider_result,
      });
      this.failpoint?.("after_execution_result");
      const observationResponse = await this.provider(r, "/observation", {
        request_id: r.scope.request_id,
        event: r.execution,
      });
      const observation = await verifyMockObservation(observationResponse, r);
      r.provider_attestation = {
        jws: observationResponse.jws,
        public_jwk: observationResponse.public_jwk,
      };
      r.observation = observation;
      r.status = "observation_pending";
      await this.save(r);
      this.failpoint?.("after_verified_observation");
    }
    if (r.status === "observation_pending") {
      if (!r.observation) throw new HttpError(503, "observation_missing");
      // This internal storage endpoint accepts already-verified observations.
      // The public gateway verification endpoint and contracts are unchanged.
      const stored = await this.env.JIT_GRANTS.get(
        this.env.JIT_GRANTS.idFromName(r.tenant_id),
      ).fetch(
        new Request(
          `https://agentaction.internal/intent-contracts/${r.contract.intent_id}/observations`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ observation: r.observation }),
          },
        ),
      );
      if (!stored.ok) throw new HttpError(503, "observation_rejected");
      r.finalization_job = {
        intent_id: r.contract.intent_id,
        intent_digest: r.contract.intent_digest,
        job_id: r.scope.request_id,
        agent_id: r.agent_id,
        status: "completed",
        workato_correlations: r.correlations,
      };
      r.status = "finalizing";
      await this.save(r);
      this.failpoint?.("after_observation");
    }
    if (r.status === "finalizing") {
      r.finalization = await this.callGateway(
        r,
        "POST",
        `/intent-contracts/${r.contract.intent_id}/finalize`,
        { job: r.finalization_job },
      );
      this.failpoint?.("after_finalize");
      this.add(
        r,
        "provider.executed",
        `One synthetic refund: ${r.provider_result.refund_id}.`,
      );
      this.add(
        r,
        "outcome.verified",
        "RS256-signed mock-provider read-back verified separately from authorization.",
      );
      this.add(
        r,
        "intent.finalized",
        String(r.finalization.evaluation?.verdict || "indeterminate"),
      );
      r.status = "succeeded";
      await this.save(r);
    }
  }
  add(r: Refund, type: string, detail: string): void {
    r.timeline.push({ type, at: timestamp(), detail });
    r.timeline = r.timeline.slice(-40);
  }
  correlate(r: Refund, input: Json): void {
    const correlation = {
      recipe_id: String(input.workato_recipe_id || ""),
      job_id: String(input.workato_job_id || ""),
    };
    if (
      (correlation.recipe_id || correlation.job_id) &&
      !r.correlations.some(
        (c) => JSON.stringify(c) === JSON.stringify(correlation),
      )
    )
      r.correlations = [...r.correlations, correlation].slice(-20);
  }
  async save(r: Refund): Promise<void> {
    await this.state.storage.put(`request:${r.scope.request_id}`, r);
  }
  view(r: Refund, origin: string, replayed = false): Json {
    return {
      ...r.scope,
      tenant_id: r.tenant_id,
      agent_id: r.agent_id,
      status: r.status,
      scope_digest: r.scope_digest,
      intent_id: r.contract.intent_id,
      intent_digest: r.contract.intent_digest,
      approval_id: r.approval?.approval_id || "",
      approval_expires_at: r.approval?.expires_at || "",
      approval_url: `${origin}/review#${r.scope.request_id}`,
      evidence_url: `${origin}/review#${r.scope.request_id}`,
      replayed,
      refund_id: r.provider_result?.refund_id || "",
      mutation_count: r.provider_result?.mutation_count || 0,
      outcome_verdict: r.finalization?.evaluation?.verdict || "",
      constraint_compliance:
        r.finalization?.evaluation?.constraint_compliance || "",
      qualified_success: r.finalization?.evaluation?.qualified_success === true,
      created_at: r.created_at,
    };
  }
}

// A separate Durable Object is the synthetic provider trust boundary. It has
// no public route, stores its signing key privately, and supports read-back.
export class MockRefundProvider {
  state: State;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(state: State) {
    this.state = state;
  }
  async fetch(request: Request): Promise<Response> {
    const run = this.queue.then(() => this.handle(request));
    this.queue = run.catch(() => undefined);
    return await run;
  }
  async handle(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path.startsWith("/refunds/"))
      return json({
        refund:
          (await this.state.storage.get(`refund:${path.split("/")[2]}`)) ||
          null,
      });
    const input = await body(request);
    if (request.method === "POST" && path === "/refund") {
      const scope = input.scope as Scope;
      const event = input.event as Json;
      if (
        !scope ||
        !event ||
        event.approved !== true ||
        !event.jit_grant_valid ||
        event.tool !== "mock.create_refund" ||
        event.resource !== `payment/${scope.payment_id}` ||
        event.amount !== scope.amount_cents / 100 ||
        event.currency !== scope.currency ||
        event.idempotency_key !== scope.request_id ||
        scope.amount_cents > LIMIT ||
        input.tenant_id !== event.tenant_id
      )
        return json({ error: "invalid_authority" }, 403);
      const digest = await sha256(JSON.stringify(scope));
      const existing = await this.state.storage.get<Json>(
        `refund:${scope.request_id}`,
      );
      if (existing)
        return existing.scope_digest === digest
          ? json(existing)
          : json({ error: "provider_scope_mismatch" }, 409);
      const result = {
        refund_id: `mock_re_${crypto.randomUUID()}`,
        payment_id: scope.payment_id,
        amount_cents: scope.amount_cents,
        currency: scope.currency,
        status: "succeeded",
        mutation_count: 1,
        scope_digest: digest,
        tenant_id: input.tenant_id,
        intent_id: event.intent_id,
        intent_digest: event.intent_digest,
      };
      await this.state.storage.put(`refund:${scope.request_id}`, result);
      return json(result, 201);
    }
    if (request.method === "POST" && path === "/observation") {
      const result = await this.state.storage.get<Json>(
        `refund:${input.request_id}`,
      );
      if (!result || result.intent_digest !== input.event?.intent_digest)
        return json({ error: "not_found" }, 404);
      let keys = await this.state.storage.get<Json>("signing-key");
      if (!keys) {
        const pair = await crypto.subtle.generateKey(
          {
            name: "RSASSA-PKCS1-v1_5",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256",
          },
          true,
          ["sign", "verify"],
        );
        keys = {
          private: await crypto.subtle.exportKey("jwk", pair.privateKey),
          public: await crypto.subtle.exportKey("jwk", pair.publicKey),
        };
        await this.state.storage.put("signing-key", keys);
      }
      const now = timestamp();
      const observation: Json = {
        schema_version: "agentpass.intent-observation.v1",
        observation_id: `obs-${input.request_id}`,
        tenant_id: result.tenant_id,
        intent_id: result.intent_id,
        intent_digest: result.intent_digest,
        predicate: "refund.status",
        value: result.status,
        resource: `payment/${result.payment_id}`,
        issuer: "workato-mock-provider",
        observed_at: now,
        issued_at: now,
        expires_at: new Date(Date.now() + 300000).toISOString(),
      };
      observation.payload_digest = digestIntentObservation(observation);
      const header = encode({ alg: "RS256", typ: "JWT", kid: "mock-v1" });
      const payload = encode({
        iss: observation.issuer,
        sub: "mock-provider",
        aud: "agentaction-workato-reference",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
        observation,
      });
      const key = await crypto.subtle.importKey(
        "jwk",
        keys.private,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        new TextEncoder().encode(`${header}.${payload}`),
      );
      return json({
        jws: `${header}.${payload}.${base64url(new Uint8Array(signature))}`,
        public_jwk: keys.public,
      });
    }
    return json({ error: "not_found" }, 404);
  }
}
function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
function encode(value: unknown): string {
  return base64url(new TextEncoder().encode(JSON.stringify(value)));
}
function decode(value: string): Uint8Array {
  return Uint8Array.from(
    atob(value.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
}
export async function verifyMockObservation(
  envelope: Json,
  r: Refund,
): Promise<IntentObservation> {
  const parts = String(envelope.jws).split(".");
  if (parts.length !== 3)
    throw new HttpError(503, "invalid_provider_signature");
  const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
  if (header.alg !== "RS256" || header.kid !== "mock-v1")
    throw new HttpError(503, "invalid_provider_signature");
  const key = await crypto.subtle.importKey(
    "jwk",
    envelope.public_jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  if (
    !(await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      decode(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    ))
  )
    throw new HttpError(503, "invalid_provider_signature");
  const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
  const observation = claims.observation;
  const now = Date.now();
  if (
    claims.iss !== "workato-mock-provider" ||
    claims.sub !== "mock-provider" ||
    claims.aud !== "agentaction-workato-reference" ||
    !Number.isFinite(claims.exp) ||
    claims.exp * 1000 <= now ||
    !Number.isFinite(claims.iat) ||
    Math.abs(claims.iat * 1000 - now) > 300000 ||
    observation?.issuer !== claims.iss ||
    observation?.tenant_id !== r.tenant_id ||
    observation?.intent_id !== r.contract.intent_id ||
    observation?.intent_digest !== r.contract.intent_digest ||
    observation?.resource !== `payment/${r.scope.payment_id}` ||
    observation?.predicate !== "refund.status" ||
    observation?.value !== "succeeded" ||
    observation?.payload_digest !== digestIntentObservation(observation) ||
    !Number.isFinite(Date.parse(observation.expires_at)) ||
    Date.parse(observation.expires_at) <= now ||
    !Number.isFinite(Date.parse(observation.observed_at)) ||
    Math.abs(Date.parse(observation.observed_at) - now) > 300000
  )
    throw new HttpError(503, "provider_observation_mismatch");
  return {
    ...observation,
    provenance: {
      verification_method: "jws",
      verified_issuer: claims.iss,
      verified_subject: claims.sub,
      signature_kid: header.kid,
      verified_at: timestamp(),
    },
  };
}
