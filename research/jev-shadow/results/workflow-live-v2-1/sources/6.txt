export function percentile(values, q) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)];
}

export function summarize(rows, elapsedMs, inputPricePerMillion = 0.042) {
  const completed = rows.filter(row => !row.dropped);
  const valid = completed.filter(row => !row.error && (!row.provider || row.provider.status === "ok"));
  const scored = completed.filter(row => row.counterfactual);
  const distribution = key => Object.fromEntries(["allow", "deny", "challenge_required"].map(label => [label, scored.filter(row => row[key] === label).length]));
  const inputTokens = completed.reduce((total, row) => total + (row.provider?.usage?.input_tokens ?? 0), 0);
  const providerRows = completed.filter(row => row.provider);
  const cost = p => p.reported_cost_usd ?? p.estimated_cost_usd ?? (p.model === "jev-1.13.0" && p.service !== "playground" ? p.usage.input_tokens / 1e6 * inputPricePerMillion : null);
  const costs = providerRows.map(row => cost(row.provider));
  const observedCost = costs.some(value => value !== null) ? costs.reduce((sum, value) => sum + (value ?? 0), 0) : null;
  return {
    offered: rows.length, completed: completed.length, successful: valid.length,
    dropped: rows.filter(row => row.dropped).length,
    elapsed_ms: elapsedMs, completed_rps: completed.length / (elapsedMs / 1000), successful_rps: valid.length / (elapsedMs / 1000),
    latency_ms: Object.fromEntries([0.5, 0.95, 0.99].map(q => [`p${q * 100}`, percentile(completed.map(row => row.latency_ms), q)])),
    provider_latency_ms: Object.fromEntries([0.5, 0.95, 0.99].map(q => [`p${q * 100}`, percentile(providerRows.map(row => row.provider.latency_ms), q)])),
    schedule_lag_p99_ms: percentile(rows.map(row => row.schedule_lag_ms ?? 0), 0.99),
    errors: Object.fromEntries([...new Set(completed.map(row => row.error ?? (row.provider?.status !== "ok" ? row.provider?.status : null)).filter(Boolean))].map(status => [status, completed.filter(row => (row.error ?? row.provider?.status) === status).length])),
    provider_requests: providerRows.length, questions_attempted: providerRows.length * 2,
    answered_questions: providerRows.filter(row => row.provider.status === "ok").length * 2,
    input_tokens: inputTokens, observed_token_cost_usd: observedCost,
    observed_cost_per_1000_provider_requests_usd: observedCost === null ? null : observedCost / providerRows.length * 1000,
    unknown_usage_requests: providerRows.filter(row => !row.provider.usage).length,
    unknown_cost_requests: costs.filter(value => value === null).length,
    quality: {
      scored: scored.length, unique_cases: new Set(scored.map(row => row.case_id)).size,
      actual_gateway: distribution("gateway_decision"), counterfactual: distribution("counterfactual"),
      unsafe_allows: scored.filter(row => row.truth !== "allow" && row.counterfactual === "allow").length,
      false_blocks: scored.filter(row => row.truth === "allow" && row.counterfactual === "deny").length,
      escalations: scored.filter(row => row.counterfactual === "challenge_required").length,
      exact_matches: scored.filter(row => row.counterfactual === row.truth).length,
      shadow_mutations: scored.filter(row => row.gateway_decision && row.actual_decision !== row.gateway_decision).length,
      confusion: Object.fromEntries(["allow", "deny", "challenge_required"].map(truth => [truth,
        Object.fromEntries(["allow", "deny", "challenge_required"].map(predicted => [predicted, scored.filter(row => row.truth === truth && row.counterfactual === predicted).length])),
      ])),
    },
  };
}

// Open-loop arrival schedule. No hidden request queue: record overload drops.
// The clock/sleep parameters allow deterministic scheduler tests.
export async function loadStage({ count, rate, concurrency, operation, now = () => performance.now(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const start = now();
  const inFlight = new Set();
  const rows = [];
  const failures = [];
  for (let index = 0; index < count; index++) {
    const target = start + index * 1000 / rate;
    await sleep(Math.max(0, target - now()));
    const lag = Math.max(0, now() - target);
    if (inFlight.size >= concurrency) {
      rows.push({ index, dropped: true, schedule_lag_ms: lag });
      continue;
    }
    const promise = (async () => {
      const row = await operation(index);
      rows.push({ ...row, index, schedule_lag_ms: lag, arrival_to_completion_ms: now() - target });
    })();
    inFlight.add(promise);
    // Attach rejection immediately and retain the error until all work drains.
    promise.then(() => inFlight.delete(promise), error => { failures.push(error); inFlight.delete(promise); });
  }
  await Promise.allSettled([...inFlight]);
  if (failures.length) throw failures[0];
  // Include the full offered interval and drain, including the last arrival slot.
  await sleep(Math.max(0, start + count * 1000 / rate - now()));
  return { rows: rows.sort((a, b) => a.index - b.index), elapsed_ms: now() - start };
}
