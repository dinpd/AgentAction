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
