import assert from "node:assert/strict";
import test from "node:test";
import {
  recipes,
  evaluate,
  runFixtures,
  starter,
  starterMarkdown,
} from "./registry.ts";
import { validateCatalog } from "./validate.ts";
test("catalog checks cover success, failure and missing evidence", () => {
  validateCatalog(recipes);
  for (const r of recipes) assert.ok(runFixtures(r).every((f) => f.passed));
});
test("failure is not erased by missing evidence; missing values never imply success", () => {
  assert.equal(evaluate(recipes[0], {}).verdict, "indeterminate");
  assert.equal(evaluate(recipes[0], { refund_count: 2 }).verdict, "not_met");
  assert.equal(
    evaluate(recipes[0], {
      refund_status: "succeeded",
      ticket_status: "resolved",
      refund_count: "1",
    }).verdict,
    "not_met",
  );
});
test("publishing rejects malformed, unsafe and unsupported evidence claims", () => {
  for (const change of [
    (r: (typeof recipes)[number]) => {
      r.id = "../bad";
    },
    (r: (typeof recipes)[number]) => {
      r.version = "latest";
    },
    (r: (typeof recipes)[number]) => {
      r.publisher.url = "javascript:alert(1)";
    },
    (r: (typeof recipes)[number]) => {
      r.evidence.level = "certified";
    },
    (r: (typeof recipes)[number]) => {
      r.instructions = [];
    },
    (r: (typeof recipes)[number]) => {
      r.fixtures[0].expected = "not_met";
    },
    (r: (typeof recipes)[number]) => {
      r.outcomes = [];
    },
  ]) {
    const copy = structuredClone(recipes);
    change(copy[0]);
    assert.throws(() => validateCatalog(copy));
  }
  assert.throws(() => validateCatalog([recipes[0], recipes[0]]));
});
test("adoption retains recipe version, instructions, connection slots and checks", () => {
  const bundle = starter(recipes[0], " My support agent ");
  assert.equal(bundle.agentName, "My support agent");
  assert.equal(bundle.recipe.version, "1.0.0");
  assert.deepEqual(bundle.recipe.fixtures, recipes[0].fixtures);
  assert.ok(
    bundle.connections.every(
      (c) => c.endpoint === "" && c.requiredTools.length,
    ),
  );
  assert.match(starterMarkdown(recipes[0], ""), /support-refund@1.0.0/);
  assert.match(starterMarkdown(recipes[0], "Agent"), /refund_count = 1/);
});

test("practical starters retain real connections and complete adoption context", () => {
  for (const id of ["competitor-pricing", "support-help-articles", "incident-to-ticket"]) {
    const r = recipes.find((r) => r.id === id)!;
    assert.ok(r.adoption);
    const bundle = starter(r, "My agent");
    assert.deepEqual(bundle.recipe.adoption, r.adoption);
    for (const [i, s] of r.servers.entries()) {
      assert.equal(bundle.connections[i].endpoint, s.connection!.endpoint);
      const markdown = starterMarkdown(r, "My agent");
      assert.ok(markdown.includes(s.connection!.endpoint));
      assert.ok(markdown.includes(s.connection!.authentication));
      assert.ok(markdown.includes(r.adoption.exampleOutput));
      for (const v of r.adoption.validation) assert.ok(markdown.includes(v.expected));
    }
    assert.equal(r.publisher.kind, "maintainer");
    assert.equal(r.evidence.level, "fixture");
  }
});

test("connection metadata rejects executable URLs and embedded credentials", () => {
  const seed = recipes.find((r) => r.id === "competitor-pricing")!;
  for (const key of ["endpoint", "documentation"] as const) {
    for (const url of ["javascript:alert(1)", "http://example.com", "https://user:secret@example.com/mcp", "https://example.com/mcp?api_key=secret", "https://example.com/#token", ""]) {
      const r = structuredClone(seed);
      r.servers[0].connection![key] = url;
      assert.throws(() => validateCatalog([r]));
    }
  }
  for (const value of [null, {}, { inputs: [] }]) {
    const r = { ...seed, adoption: value };
    assert.throws(() => validateCatalog([r]));
  }
});

test("practical rules reject adverse evidence even with other observations absent", () => {
  const cases = [
    ["competitor-pricing", { comparisons_supported: false }],
    ["competitor-pricing", { baseline_integrity_verified: false }],
    ["support-help-articles", { privacy_reviewed: false }],
    ["support-help-articles", { approval_recorded: false }],
    ["incident-to-ticket", { duplicates_created: 1 }],
    ["incident-to-ticket", { destination_verified: false }],
  ] as const;
  for (const [id, observation] of cases) {
    const r = recipes.find((r) => r.id === id)!;
    assert.equal(evaluate(r, observation).verdict, "not_met");
    assert.equal(evaluate(r, {}).verdict, "indeterminate");
  }
});
