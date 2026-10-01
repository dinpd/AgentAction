type EmailEnv = { CLOUDFLARE_ACCOUNT_ID?: string; CLOUDFLARE_EMAIL_API_TOKEN?: string };
type SendRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const MAX_BYTES = 4096;

function reply(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

// Stop reading once the limit is exceeded, including requests without Content-Length.
async function readBody(request: Request): Promise<string | null> {
  if (Number(request.headers.get("content-length")) > MAX_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return body + decoder.decode();
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); return null; }
      body += decoder.decode(value, { stream: true });
    }
  } finally { reader.releaseLock(); }
}

export async function handleResearchDownload(request: Request, env: EmailEnv, sendRequest: SendRequest = fetch): Promise<Response> {
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  if (request.headers.get("origin") !== new URL(request.url).origin) return reply({ error: "Forbidden" }, 403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return reply({ error: "Unsupported content type" }, 415);
  }
  let input: Record<string, unknown>;
  try {
    const raw = await readBody(request);
    if (raw === null) return reply({ error: "Request too large" }, 413);
    input = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid body");
  } catch { return reply({ error: "Invalid request" }, 400); }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const organization = typeof input.organization === "string" ? input.organization.trim() : "";
  const elapsed = typeof input.startedAt === "number" ? Date.now() - input.startedAt : NaN;
  if (
    name.length > 80 || organization.length > 120 || email.length > 254 ||
    /[\u0000-\u001f\u007f]/.test(name + email + organization) ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ||
    input.website !== "" || !Number.isFinite(elapsed) || elapsed < 1200 || elapsed > 86_400_000
  ) return reply({ error: "Check the form and try again" }, 400);

  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
  const token = env.CLOUDFLARE_EMAIL_API_TOKEN?.trim() ?? "";
  const unavailable = () => reply({ error: "Registration is unavailable. You can still download the paper directly." }, 503);
  if (!/^[a-f0-9]{32}$/i.test(accountId) || !token) return unavailable();
  try {
    const delivery = await sendRequest(`https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        to: "info@agentaction.dev",
        from: { address: "website@agentaction.dev", name: "AgentAction website" },
        reply_to: { address: email, name: name || "Research reader" },
        subject: "[Research reader] Can We Trust 'Done'?",
        text: ["Optional paper download registration", "Paper: Can We Trust 'Done'? (September 25, 2026)",
          "https://agentaction.dev/research/completion-assessment", "", `Name: ${name || "Not provided"}`,
          `Email: ${email}`, `Organization: ${organization || "Not provided"}`, "",
          "Purpose: understand readership and, if useful, follow up about this research. No mailing-list subscription."].join("\n"),
      }),
    });
    const result = await delivery.json() as { success?: boolean };
    if (!delivery.ok || result.success !== true) return unavailable();
  } catch { return unavailable(); }
  return reply({ received: true }, 200);
}
