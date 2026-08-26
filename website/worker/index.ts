/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  EMAIL?: {
    send(message: {
      to: string;
      from: { email: string; name: string };
      replyTo: { email: string; name: string };
      subject: string;
      text: string;
      html: string;
    }): Promise<{ messageId: string }>;
  };
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ProjectInquiry {
  name: string;
  email: string;
  phone: string;
  organization: string;
  stage: "exploring" | "prototype" | "production" | "live";
  helpArea: "boundary" | "integration" | "evidence" | "gateway" | "other";
  project: string;
  website: string;
  startedAt: number;
}

const PROJECT_INBOX = "info@agentaction.dev";
const PROJECT_SENDER = "website@agentaction.dev";
const MAX_INQUIRY_BYTES = 16_384;
const VALID_STAGES = new Set(["exploring", "prototype", "production", "live"]);
const VALID_HELP_AREAS = new Set(["boundary", "integration", "evidence", "gateway", "other"]);

function json(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function parseInquiry(value: unknown): ProjectInquiry | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const inquiry = {
    name: clean(input.name),
    email: clean(input.email).toLowerCase(),
    phone: clean(input.phone),
    organization: clean(input.organization),
    stage: clean(input.stage),
    helpArea: clean(input.helpArea),
    project: clean(input.project),
    website: clean(input.website),
    startedAt: typeof input.startedAt === "number" ? input.startedAt : 0,
  };

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phonePattern = /^[+()0-9 .-]{7,40}$/;
  const hasHeaderControl = /[\u0000-\u001f\u007f]/.test(inquiry.name);
  if (
    inquiry.name.length < 2 || inquiry.name.length > 80 || hasHeaderControl ||
    inquiry.email.length > 254 || !emailPattern.test(inquiry.email) ||
    (inquiry.phone.length > 0 && !phonePattern.test(inquiry.phone)) ||
    inquiry.organization.length > 120 ||
    !VALID_STAGES.has(inquiry.stage) ||
    !VALID_HELP_AREAS.has(inquiry.helpArea) ||
    inquiry.project.length < 40 || inquiry.project.length > 4000 ||
    inquiry.website.length > 0 ||
    !Number.isFinite(inquiry.startedAt)
  ) return null;

  return inquiry as ProjectInquiry;
}

export async function handleProjectInquiry(
  request: Request,
  env: Env,
): Promise<Response> {
  const requestUrl = new URL(request.url);
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (request.headers.get("origin") !== requestUrl.origin) return json({ error: "Forbidden" }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Unsupported content type" }, 415);
  }

  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_INQUIRY_BYTES) return json({ error: "Request too large" }, 413);

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_INQUIRY_BYTES) {
    return json({ error: "Request too large" }, 413);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const inquiry = parseInquiry(parsed);
  const now = Date.now();
  if (!inquiry || now - inquiry.startedAt < 1200 || now - inquiry.startedAt > 86_400_000) {
    return json({ error: "Check the form and try again" }, 400);
  }

  if (!env.EMAIL) {
    return json({ error: "Project inquiries are temporarily unavailable" }, 503);
  }

  const organization = inquiry.organization || "Not provided";
  const phone = inquiry.phone || "Not provided";
  const text = [
    "New AgentAction project inquiry",
    "",
    `Name: ${inquiry.name}`,
    `Email: ${inquiry.email}`,
    `Phone: ${phone}`,
    `Organization: ${organization}`,
    `Project stage: ${inquiry.stage}`,
    `Help area: ${inquiry.helpArea}`,
    "",
    "Project context:",
    inquiry.project,
  ].join("\n");
  const html = `<h1>New AgentAction project inquiry</h1>
    <dl>
      <dt>Name</dt><dd>${escapeHtml(inquiry.name)}</dd>
      <dt>Email</dt><dd>${escapeHtml(inquiry.email)}</dd>
      <dt>Phone</dt><dd>${escapeHtml(phone)}</dd>
      <dt>Organization</dt><dd>${escapeHtml(organization)}</dd>
      <dt>Project stage</dt><dd>${escapeHtml(inquiry.stage)}</dd>
      <dt>Help area</dt><dd>${escapeHtml(inquiry.helpArea)}</dd>
    </dl>
    <h2>Project context</h2>
    <p>${escapeHtml(inquiry.project).replace(/\n/g, "<br>")}</p>`;

  try {
    await env.EMAIL.send({
      to: PROJECT_INBOX,
      from: { email: PROJECT_SENDER, name: "AgentAction website" },
      replyTo: { email: inquiry.email, name: inquiry.name },
      subject: `[Project inquiry] ${inquiry.stage}: ${inquiry.name}`,
      text,
      html,
    });
  } catch {
    return json({ error: "We could not send your note. Please try again." }, 503);
  }

  return json({ received: true }, 200);
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    if (url.pathname === "/api/project-inquiry") {
      return handleProjectInquiry(request, env);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
