import { createHmac, timingSafeEqual } from "node:crypto";

export type ProviderAuthorizationReceipt = {
  decision_id: string;
  tenant_id?: string;
  agent_id: string;
  user_id?: string;
  tool: string;
  action: string;
  resource?: string;
  job_id?: string;
  case_id?: string;
  customer_id?: string;
  approval_id?: string;
  jit_grant_id?: string;
  amount?: string;
  issued_at: string;
  expires_at: string;
};

export type SignedProviderAuthorizationReceipt = {
  alg: "HS256";
  payload: ProviderAuthorizationReceipt;
  signature: string;
};

export type ReceiptVerificationResult = {
  ok: boolean;
  receipt?: ProviderAuthorizationReceipt;
  findings: string[];
};

export type ReplayStore = {
  /**
   * Atomically records a receipt ID and returns false when it has already been
   * used. Implementations may expire entries at or after expiresAt.
   */
  consume(receiptId: string, expiresAt: Date): boolean | Promise<boolean>;
};

export type ToolReceiptPolicy = {
  required?: boolean;
  action?: string;
  resource?: string | ((args: Record<string, unknown>) => string | undefined);
  resourceTemplate?: string;
  requiredReceiptFields?: string[];
  bindArgs?: Record<string, string>;
  singleUse?: boolean;
};

export type AgentIdProviderExpressOptions = {
  secret?: string | (() => string | Promise<string>);
  requireSigned?: boolean;
  receiptArgument?: string;
  tools?: Record<string, ToolReceiptPolicy>;
  replayStore?: ReplayStore;
  now?: () => Date;
  onDenied?: (
    req: RequestLike,
    res: ResponseLike,
    result: ReceiptVerificationResult,
  ) => unknown | Promise<unknown>;
};

export type RequestLike = {
  body?: unknown;
  agentidReceipt?: ProviderAuthorizationReceipt;
};

export type ResponseLike = {
  status(code: number): ResponseLike;
  json(body: unknown): unknown;
};

export type NextFunction = (error?: unknown) => void;

export class MemoryReplayStore implements ReplayStore {
  private used = new Map<string, number>();

  consume(receiptId: string, expiresAt: Date): boolean {
    const now = Date.now();
    for (const [id, expiry] of this.used) {
      if (expiry <= now) this.used.delete(id);
    }
    if (this.used.has(receiptId)) return false;
    this.used.set(receiptId, expiresAt.getTime());
    return true;
  }
}

export function createAgentIdReceiptMiddleware(options: AgentIdProviderExpressOptions = {}) {
  const receiptArgument = options.receiptArgument || "_agentid_receipt";
  const requireSigned = options.requireSigned !== false;
  const now = options.now || (() => new Date());

  return async function agentIdReceiptMiddleware(req: RequestLike, res: ResponseLike, next: NextFunction) {
    try {
      const parsed = parseMcpToolCall(req.body);
      if (!parsed) return next();

      const policy = options.tools?.[parsed.tool];
      if (!policy || policy.required === false) return next();

      const secret = await resolveSecret(options.secret);
      const verification = await verifyProviderReceipt(parsed.args[receiptArgument], {
        secret,
        requireSigned,
        tool: parsed.tool,
        args: parsed.args,
        policy,
        replayStore: options.replayStore,
        now,
      });

      if (!verification.ok) {
        if (options.onDenied) {
          await options.onDenied(req, res, verification);
          return;
        }
        res.status(403).json({
          error: "AgentID provider authorization receipt denied",
          findings: verification.findings,
        });
        return;
      }

      req.agentidReceipt = verification.receipt;
      next();
    } catch (error) {
      next(error);
    }
  };
}

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

export async function verifyProviderReceipt(
  value: unknown,
  options: {
    secret?: string;
    requireSigned?: boolean;
    tool?: string;
    args?: Record<string, unknown>;
    policy?: ToolReceiptPolicy;
    replayStore?: ReplayStore;
    now?: () => Date;
  } = {},
): Promise<ReceiptVerificationResult> {
  const findings: string[] = [];
  const requireSigned = options.requireSigned !== false;
  const unwrapped = unwrapProviderReceipt(value, options.secret);

  if (!value) {
    return { ok: false, findings: ["missing _agentid_receipt"] };
  }
  if (requireSigned && !isSignedReceiptEnvelope(value)) {
    findings.push("receipt must be signed");
  }

  findings.push(...unwrapped.findings);
  const receipt = unwrapped.receipt;
  if (!receipt) return { ok: false, findings: findings.length ? findings : ["receipt payload is required"] };

  findings.push(...receiptFieldFindings(receipt, options.policy));
  if (options.tool && stringValue(receipt.tool) !== options.tool) findings.push("receipt tool mismatch");
  if (options.policy?.action && stringValue(receipt.action) !== options.policy.action) {
    findings.push("receipt action mismatch");
  }

  const expectedResource = expectedResourceForPolicy(options.policy, options.args || {});
  if (expectedResource && stringValue(receipt.resource) !== expectedResource) {
    findings.push("receipt resource mismatch");
  }

  if (options.policy?.bindArgs && options.args) {
    for (const [receiptField, argName] of Object.entries(options.policy.bindArgs)) {
      if (stringValue((receipt as unknown as Record<string, unknown>)[receiptField]) !== stringValue(options.args[argName])) {
        findings.push(`receipt ${receiptField} mismatch`);
      }
    }
  }

  const current = options.now ? options.now() : new Date();
  const issuedAt = parseTimestamp(receipt.issued_at);
  const expiresAt = parseTimestamp(receipt.expires_at);
  if (!issuedAt) findings.push("receipt issued_at is invalid");
  else if (issuedAt > current) findings.push("receipt issued_at is in the future");
  if (!expiresAt) findings.push("receipt expires_at is invalid");
  else if (expiresAt <= current) findings.push("receipt is expired");

  if (
    findings.length === 0 &&
    options.replayStore &&
    options.policy?.singleUse !== false &&
    stringValue(receipt.decision_id) &&
    expiresAt
  ) {
    const fresh = await options.replayStore.consume(receipt.decision_id, expiresAt);
    if (!fresh) findings.push("receipt was already used");
  }

  return {
    ok: findings.length === 0,
    receipt,
    findings,
  };
}

export function unwrapProviderReceipt(value: unknown, secret?: string): { receipt?: ProviderAuthorizationReceipt; findings: string[] } {
  if (!isRecord(value)) return { findings: [] };
  if (!isSignedReceiptEnvelope(value)) return { receipt: value as ProviderAuthorizationReceipt, findings: [] };
  if (!secret) return { findings: ["receipt signature secret is required"] };
  return verifySignedProviderReceipt(value, secret);
}

export function verifySignedProviderReceipt(value: unknown, secret: string): { receipt?: ProviderAuthorizationReceipt; findings: string[] } {
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

function parseMcpToolCall(body: unknown): { tool: string; args: Record<string, unknown> } | undefined {
  if (!isRecord(body) || body.method !== "tools/call" || !isRecord(body.params)) return undefined;
  const tool = typeof body.params.name === "string" ? body.params.name : "";
  if (!tool) return undefined;
  const args = isRecord(body.params.arguments) ? body.params.arguments : {};
  return { tool, args };
}

async function resolveSecret(secret: AgentIdProviderExpressOptions["secret"]): Promise<string | undefined> {
  if (!secret) return undefined;
  if (typeof secret === "function") return secret();
  return secret;
}

function receiptFieldFindings(receipt: ProviderAuthorizationReceipt, policy: ToolReceiptPolicy | undefined): string[] {
  const fields = new Set([
    "decision_id",
    "agent_id",
    "tool",
    "action",
    "issued_at",
    "expires_at",
    ...(policy?.requiredReceiptFields || []),
  ]);
  const findings: string[] = [];
  for (const field of fields) {
    if (!stringValue((receipt as unknown as Record<string, unknown>)[field])) {
      findings.push(`receipt ${field} is required`);
    }
  }
  return findings;
}

function expectedResourceForPolicy(policy: ToolReceiptPolicy | undefined, args: Record<string, unknown>): string | undefined {
  if (!policy) return undefined;
  if (typeof policy.resource === "function") return policy.resource(args);
  if (typeof policy.resource === "string") return policy.resource;
  if (policy.resourceTemplate) return renderTemplate(policy.resourceTemplate, args);
  return undefined;
}

function renderTemplate(template: string, args: Record<string, unknown>): string {
  return template.replace(/\{([^}]+)\}/g, (_, key: string) => stringValue(args[key]));
}

function receiptSignature(payload: Record<string, unknown>, secret: string): string {
  return createHmac("sha256", secret).update(canonicalJson(payload)).digest("base64url");
}

function isSignedReceiptEnvelope(value: unknown): boolean {
  return isRecord(value) && ("payload" in value || "signature" in value || "alg" in value);
}

function parseTimestamp(value: unknown): Date | undefined {
  const text = stringValue(value);
  if (!text) return undefined;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
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
