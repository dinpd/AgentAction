import { performance } from "node:perf_hooks";
import { cpus, platform, arch, release } from "node:os";
import { writeFileSync } from "node:fs";
import { makeCase } from "./cases.mts";
import { METHODS, assess, inputFor, createVerifier } from "./methods.mts";

const verifier = createVerifier();
try {
  const results: Record<string, unknown> = {};
  for (const method of METHODS) {
    const input = inputFor(makeCase("refund", "clean", 1, method === "ingress_all" ? "all" : "any"));
    const prepared = input.evidence.observations!.map(o => verifier.envelope(o as Record<string, any>));
    for (let n = 0; n < 100; n++) await assess(method, input, verifier, prepared);
    const blocks: number[][] = [];
    for (let b = 0; b < 5; b++) {
      const samples: number[] = [];
      for (let n = 0; n < 200; n++) {
        const start = performance.now();
        await assess(method, input, verifier, prepared);
        samples.push(performance.now() - start);
      }
      blocks.push(samples);
    }
    const sorted = blocks.flat().sort((a, b) => a - b);
    results[method] = { unit: "ms", samples: blocks, n: sorted.length,
      p50: sorted[Math.ceil(sorted.length * 0.50) - 1], p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
      block_means: blocks.map(xs => xs.reduce((a, b) => a + b, 0) / xs.length),
      input_bytes: Buffer.byteLength(JSON.stringify(input)), jws_bytes: Buffer.byteLength(prepared[0]) };
  }
  const report = { measured_at: new Date().toISOString(), node: process.version,
    platform: platform(), arch: arch(), os_release: release(), cpu: cpus()[0]?.model,
    protocol: "Five sequential blocks of 200 after 100 warm-ups; fixed method order; no CPU isolation.",
    exclusions: "Key generation, signing, network, provider, model, and persistent storage excluded. Local JWKS fetch/parse and key import included.",
    results };
  writeFileSync(new URL("../results/timing.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([m, r]) => [m,
    { p50: (r as any).p50, p95: (r as any).p95 }])), null, 2));
} finally { verifier.close(); }
