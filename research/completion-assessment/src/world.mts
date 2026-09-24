export const DOMAINS = ["refund", "deployment", "export"] as const;
export type Domain = typeof DOMAINS[number];
export type Spec = {
  domain: Domain; target: string; amount: number; version: string;
  replicas: number; rows: number; destination: string;
};
type Refund = { payment: string; amount: number; settled: boolean; approved: boolean };
type Deployment = { service: string; version: string; healthyReplicas: number; approved: boolean };
type Export = { dataset: string; rows: number; destination: string; redacted: boolean; approved: boolean };
export type World = {
  domain: Domain; refunds: Refund[]; deployments: Deployment[]; exports: Export[];
  idempotencyKeys: string[];
};

export function specification(domain: Domain, variant: number): Spec {
  return { domain, target: `${domain}-${variant}`, amount: 10 + variant,
    version: `release-${variant + 1}`, replicas: 1 + variant % 4,
    rows: 20 + variant, destination: `approved-bucket-${variant}` };
}

export function emptyWorld(domain: Domain): World {
  return { domain, refunds: [], deployments: [], exports: [], idempotencyKeys: [] };
}

export function execute(world: World, spec: Spec, options: {
  complete?: boolean; approved?: boolean; target?: string; key?: string;
} = {}): "executed" | "replayed" {
  if (options.key && world.idempotencyKeys.includes(options.key)) return "replayed";
  if (options.key) world.idempotencyKeys.push(options.key);
  const complete = options.complete ?? true;
  const approved = options.approved ?? true;
  const target = options.target ?? spec.target;
  if (world.domain === "refund") {
    world.refunds.push({ payment: target, amount: spec.amount, settled: complete, approved });
  } else if (world.domain === "deployment") {
    world.deployments.push({ service: target, version: spec.version,
      healthyReplicas: complete ? spec.replicas : 0, approved });
  } else {
    world.exports.push({ dataset: target, rows: complete ? spec.rows : 0,
      destination: spec.destination, redacted: true, approved });
  }
  return "executed";
}

export function setCompletion(world: World, spec: Spec, complete: boolean): void {
  if (world.domain === "refund") world.refunds.at(-1)!.settled = complete;
  if (world.domain === "deployment") world.deployments.at(-1)!.healthyReplicas = complete ? spec.replicas : 0;
  if (world.domain === "export") world.exports.at(-1)!.rows = complete ? spec.rows : 0;
}

// The oracle reads complete emulator state, never a receipt, contract predicate,
// observation, assessment, or scenario name. It is unavailable to the methods.
export function oracle(world: World, spec: Spec): boolean {
  if (world.domain === "refund") {
    return world.refunds.length === 1 && world.refunds.every(r =>
      r.payment === spec.target && r.amount === spec.amount && r.settled && r.approved);
  }
  if (world.domain === "deployment") {
    return world.deployments.length === 1 && world.deployments.every(d =>
      d.service === spec.target && d.version === spec.version &&
      d.healthyReplicas === spec.replicas && d.approved);
  }
  return world.exports.length === 1 && world.exports.every(e =>
    e.dataset === spec.target && e.rows === spec.rows &&
    e.destination === spec.destination && e.redacted && e.approved);
}

// A provider read returns the latest resource state, not a completeness claim
// about the full history. That intentional limitation is tested by omission.
export function observe(world: World, spec: Spec): Record<string, unknown> {
  if (world.domain === "refund") {
    const r = world.refunds.at(-1);
    return { resource: r?.payment ?? spec.target, amount: r?.amount ?? 0, settled: r?.settled ?? false };
  }
  if (world.domain === "deployment") {
    const d = world.deployments.at(-1);
    return { resource: d?.service ?? spec.target, version: d?.version ?? "none",
      healthy_replicas: d?.healthyReplicas ?? 0 };
  }
  const e = world.exports.at(-1);
  return { resource: e?.dataset ?? spec.target, rows: e?.rows ?? 0,
    destination: e?.destination ?? "none", redacted: e?.redacted ?? false };
}
