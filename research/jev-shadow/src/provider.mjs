import { performance } from "node:perf_hooks";
import { questions, thresholds } from "./cases.mjs";

export const endpoint = "https://api.typesafe.ai/v1/systemone";
export const jevEndpoints = { typesafe: endpoint, playground: "https://jevtypesafeai.com/api/v1/decide" };
export const model = "jev-1.13.0";
const probability = value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

export function validateResponse(body, expectedModel = model) {
  if (body?.model !== expectedModel) throw new Error("model_mismatch");
  for (const key of Object.keys(questions)) {
    if (body?.answers?.[key]?.type !== "noul" || !probability(body.answers[key].noul)) throw new Error("invalid_answers");
  }
  for (const key of ["input_tokens", "output_tokens"]) {
    if (!Number.isSafeInteger(body?.usage?.[key]) || body.usage[key] < 0) throw new Error("invalid_usage");
  }
  // Persist only allowlisted fields, never upstream arbitrary text or headers.
  return {
    model: body.model,
    answers: Object.fromEntries(Object.keys(questions).map(key => [key, { type: "noul", noul: body.answers[key].noul }])),
    usage: { input_tokens: body.usage.input_tokens, output_tokens: body.usage.output_tokens },
  };
}

export function recommendation(result) {
  if (result.status !== "ok") return "challenge_required";
  const match = result.answers.intent_match.noul;
  const review = result.answers.needs_review.noul;
  if (review > thresholds.review_clear_max) return "challenge_required";
  if (match >= thresholds.allow_min) return "allow";
  if (match <= thresholds.deny_max) return "deny";
  return "challenge_required";
}

export function counterfactual(gatewayDecision, advisory) {
  return gatewayDecision === "allow" ? advisory : gatewayDecision;
}

export async function askLive(state, { key, timeoutMs = 2000, fetchImpl = fetch, service = "typesafe" } = {}) {
  if (!key) throw new Error("TYPESAFE_API_KEY is required; never supply it as a CLI argument");
  if (!Object.hasOwn(jevEndpoints, service)) throw new Error("unsupported Jev service");
  const started = performance.now();
  const controller = new AbortController();
  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => { controller.abort(); resolve({ status: "timeout" }); }, timeoutMs);
  });
  const operation = (async () => {
    try {
      const response = await fetchImpl(jevEndpoints[service], {
        method: "POST", redirect: "error", signal: controller.signal,
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model, state, questions }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        return { status: `http_${response.status}` };
      }
      // Deadline covers the response body as well as the connection.
      try {
        const body = await response.json();
        const missingOutput = service === "playground" && body.usage?.output_tokens === undefined;
        const result = validateResponse(missingOutput ? { ...body, usage: { ...body.usage, output_tokens: 0 } } : body);
        if (missingOutput) result.usage.output_tokens = null;
        if (service === "playground" && typeof body.usage?.cost_usd === "number" && Number.isFinite(body.usage.cost_usd) && body.usage.cost_usd >= 0) {
          result.reported_cost_usd = body.usage.cost_usd;
        }
        return { status: "ok", ...result, service, endpoint: jevEndpoints[service] };
      }
      catch { return { status: "invalid_response" }; }
    } catch { return { status: controller.signal.aborted ? "timeout" : "network_error" }; }
  })();
  try { return { ...await Promise.race([operation, timeout]), latency_ms: performance.now() - started }; }
  finally { clearTimeout(timer); }
}

// Explicit scripted test double. Its timing and answers are NOT Jev measurements.
export async function askFixture(kind, index = 0) {
  const start = performance.now();
  await new Promise(resolve => setTimeout(resolve, 5));
  const faults = ["http_429", "timeout", "invalid_response", "network_error"];
  if (index % 7 === 6) return { status: faults[Math.floor(index / 7) % faults.length], latency_ms: performance.now() - start };
  return {
    status: "ok", model: "scripted-fixture-NOT-JEV",
    answers: {
      intent_match: { type: "noul", noul: kind === "aligned" ? 0.99 : 0.01 },
      needs_review: { type: "noul", noul: kind === "uncertain" ? 0.99 : 0.01 },
    },
    usage: { input_tokens: 0, output_tokens: 0 }, latency_ms: performance.now() - start,
  };
}
