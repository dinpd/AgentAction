import { appendFileSync } from "node:fs";
import gateway, { AgentIdJitGrants, createBoundaryDecisionBasis } from "../../../cloudflare/src/worker.ts";
import { validateDecisionBasis } from "../../../cloudflare/src/decision-basis.ts";
import { manifest } from "./cases.mjs";

// Local storage adapter, not a simulation of Cloudflare's transactional/runtime
// performance. The actual gateway + Durable Object handlers run unchanged.
export function createGateway(journalPath) {
  const objects = new Map();
  const persist = record => appendFileSync(journalPath, JSON.stringify(record) + "\n", { flush: true });
  const namespace = {
    idFromName: name => name,
    get(id) {
      if (!objects.has(id)) {
        const values = new Map();
        const storage = {
          async get(key) {
            if (Array.isArray(key)) return new Map(key.filter(k => values.has(k)).map(k => [k, structuredClone(values.get(k))]));
            return structuredClone(values.get(key));
          },
          async list({ prefix = "" } = {}) { return new Map([...values].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key, structuredClone(value)])); },
          async put(key, value) {
            const entries = typeof key === "string" ? { [key]: value } : key;
            persist({ object: id, operation: "put", entries });
            for (const [k, v] of Object.entries(entries)) values.set(k, structuredClone(v));
          },
          async delete(key) { persist({ object: id, operation: "delete", key }); return values.delete(key); },
        };
        objects.set(id, new AgentIdJitGrants({ storage }));
      }
      return objects.get(id);
    },
  };
  return async (event, id) => {
    const pending = [];
    const response = await gateway.fetch(new Request("https://benchmark.invalid/authorize", {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer synthetic-local-only" },
      body: JSON.stringify({ ...event, decision_id: id }),
    }), {
      AGENTID_MANIFEST_JSON: JSON.stringify(manifest), AGENTID_API_KEY: "synthetic-local-only", JIT_GRANTS: namespace,
    }, { waitUntil: promise => pending.push(promise) });
    await Promise.all(pending);
    const body = await response.json();
    if (![200, 403].includes(response.status) || !["allow", "deny", "challenge_required"].includes(body.decision)) throw new Error("gateway_response_invalid");
    // These cases are deliberately not intent-registry-bound. Export an explicit
    // research basis via the real builder; do not claim a hosted intent snapshot.
    const basis = await createBoundaryDecisionBasis(manifest, {
      allow: body.allow, challengeRequired: body.decision === "challenge_required", findings: body.findings, event: body.event,
    }, "synthetic", "agentaction.local-research");
    if (validateDecisionBasis(basis).length) throw new Error("basis_invalid");
    persist({ operation: "research_basis", id, basis });
    return { decision: body.decision, findings: body.findings, basis };
  };
}
