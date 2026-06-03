import { createHmac, createPrivateKey, createPublicKey, createSign, createVerify, timingSafeEqual } from "node:crypto";

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
  alg: "HS256" | "RS256";
  payload: ProviderAuthorizationReceipt;
  signature: string;
};

export type JwsProviderAuthorizationReceipt = {
  jws: string;
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
  jwks?: { keys?: JsonWebKey[] } | (() => { keys?: JsonWebKey[] } | Promise<{ keys?: JsonWebKey[] }>);
  issuer?: string;
  audience?: string;
  allowedAlgorithms?: string[];
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
      const jwks = await resolveJwks(options.jwks);
      const verification = await verifyProviderReceipt(parsed.args[receiptArgument], {
        secret,
        jwks,
        issuer: options.issuer,
        audience: options.audience,
        allowedAlgorithms: options.allowedAlgorithms,
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

export function signProviderReceiptJws(
  receipt: ProviderAuthorizationReceipt,
  privateKeyPem: string,
  options: {
    issuer?: string;
    subject?: string;
    audience?: string;
    keyId?: string;
    algorithm?: "RS256";
  } = {},
): JwsProviderAuthorizationReceipt {
  const algorithm = options.algorithm || "RS256";
  const header = compactJson({ alg: algorithm, typ: "JWT", kid: options.keyId });
  const issuedAt = parseTimestamp(receipt.issued_at);
  const expiresAt = parseTimestamp(receipt.expires_at);
  const claims = compactJson({
    receipt,
    iss: options.issuer,
    sub: options.subject,
    aud: options.audience,
    iat: issuedAt ? Math.floor(issuedAt.getTime() / 1000) : undefined,
    exp: expiresAt ? Math.floor(expiresAt.getTime() / 1000) : undefined,
    jti: receipt.decision_id,
  });
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(claims)}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(createPrivateKey(privateKeyPem)).toString("base64url");
  return { jws: `${signingInput}.${signature}` };
}

export async function verifyProviderReceipt(
  value: unknown,
  options: {
    secret?: string;
    jwks?: { keys?: JsonWebKey[] };
    issuer?: string;
    audience?: string;
    allowedAlgorithms?: string[];
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
  const unwrapped = unwrapProviderReceipt(value, options.secret, options.jwks, {
    issuer: options.issuer,
    audience: options.audience,
    allowedAlgorithms: options.allowedAlgorithms,
    now: options.now,
  });

  if (!value) {
    return { ok: false, findings: ["missing _agentid_receipt"] };
  }
  if (requireSigned && !isSignedReceiptEnvelope(value) && !isJwsReceipt(value)) {
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

export function unwrapProviderReceipt(
  value: unknown,
  secret?: string,
  jwks?: { keys?: JsonWebKey[] },
  jwsOptions: { issuer?: string; audience?: string; allowedAlgorithms?: string[]; now?: () => Date } = {},
): { receipt?: ProviderAuthorizationReceipt; findings: string[] } {
  if (!isRecord(value)) return { findings: [] };
  if (isJwsReceipt(value)) {
    if (!jwks) return { findings: ["receipt JWKS is required"] };
    return verifyJwsProviderReceipt(value, jwks, jwsOptions);
  }
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

export function verifyJwsProviderReceipt(
  value: unknown,
  jwks: { keys?: JsonWebKey[] },
  options: { issuer?: string; audience?: string; allowedAlgorithms?: string[]; now?: () => Date } = {},
): { receipt?: ProviderAuthorizationReceipt; findings: string[] } {
  if (!isJwsReceipt(value)) return { findings: ["receipt jws is required"] };
  const parts = value.jws.split(".");
  if (parts.length !== 3) return { findings: ["receipt JWS compact serialization is invalid"] };

  const header = parseBase64UrlJson(parts[0]);
  const claims = parseBase64UrlJson(parts[1]);
  if (!isRecord(header)) return { findings: ["receipt JWS header is invalid"] };
  if (!isRecord(claims)) return { findings: ["receipt JWS payload is invalid"] };

  const allowedAlgorithms = options.allowedAlgorithms || ["RS256"];
  const alg = stringValue(header.alg);
  const findings: string[] = [];
  if (!allowedAlgorithms.includes(alg)) findings.push(`receipt JWS alg is not allowed: ${alg}`);

  const key = jwkForHeader(jwks, header);
  if (!key) findings.push(`receipt JWS key not found: ${stringValue(header.kid) || "missing-kid"}`);
  if (findings.length || !key) return { findings };

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  if (!verifier.verify(createPublicKey({ key, format: "jwk" }), Buffer.from(parts[2], "base64url"))) {
    return { findings: ["receipt JWS signature invalid"] };
  }

  if (options.issuer && stringValue(claims.iss) !== options.issuer) findings.push("receipt JWS issuer mismatch");
  if (options.audience && stringValue(claims.aud) !== options.audience) findings.push("receipt JWS audience mismatch");
  const nowSeconds = Math.floor((options.now ? options.now() : new Date()).getTime() / 1000);
  if (typeof claims.exp === "number" && claims.exp <= nowSeconds) findings.push("receipt JWS is expired");
  if (typeof claims.nbf === "number" && claims.nbf > nowSeconds) findings.push("receipt JWS not before is in the future");
  if (typeof claims.iat === "number" && claims.iat > nowSeconds) findings.push("receipt JWS issued_at is in the future");

  const receipt = isRecord(claims.receipt)
    ? claims.receipt as ProviderAuthorizationReceipt
    : isRecord(claims.payload)
      ? claims.payload as ProviderAuthorizationReceipt
      : undefined;
  if (!receipt) findings.push("receipt JWS payload is required");
  return { receipt, findings };
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

async function resolveJwks(jwks: AgentIdProviderExpressOptions["jwks"]): Promise<{ keys?: JsonWebKey[] } | undefined> {
  if (!jwks) return undefined;
  if (typeof jwks === "function") return jwks();
  return jwks;
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

function isJwsReceipt(value: unknown): value is JwsProviderAuthorizationReceipt {
  return isRecord(value) && typeof value.jws === "string";
}

function jwkForHeader(jwks: { keys?: JsonWebKey[] }, header: Record<string, unknown>): JsonWebKey | undefined {
  const keys = Array.isArray(jwks.keys) ? jwks.keys : [];
  const kid = stringValue(header.kid);
  if (kid) return keys.find((key) => stringValue((key as unknown as Record<string, unknown>).kid) === kid);
  return keys.length === 1 ? keys[0] : undefined;
}

function compactJson(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function base64UrlJson(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function parseBase64UrlJson(value: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
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
