import { evaluate, type Recipe } from "./registry.ts";
const id = /^[a-z][a-z0-9-]{1,63}$/;
const field = /^[a-z][a-z0-9_]{0,63}$/;
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function text(value: unknown) {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= 4000
  );
}
function list(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 100;
}
function httpsUrl(value: unknown) {
  assert(text(value), "Missing connection URL");
  const url = new URL(value as string);
  assert(url.protocol === "https:" && !url.username && !url.password &&
    !url.search && !url.hash, "Connection URLs must be HTTPS without credentials, queries or fragments");
}
export function validateCatalog(value: unknown): asserts value is Recipe[] {
  assert(list(value), "Catalog must contain recipes");
  const ids = new Set();
  for (const entry of value) {
    assert(entry && typeof entry === "object", "Recipe must be an object");
    const r = entry as Recipe;
    assert(
      r.schemaVersion === 1 && typeof r.id === "string" && id.test(r.id),
      "Invalid recipe ID or schema version",
    );
    assert(!ids.has(r.id), "Duplicate recipe ID");
    ids.add(r.id);
    assert(
      typeof r.version === "string" && /^\d+\.\d+\.\d+$/.test(r.version),
      "Invalid recipe version",
    );
    for (const key of ["title", "category", "summary", "intent"] as const)
      assert(text(r[key]), `Missing ${key}`);
    assert(
      ["Read only", "Supervised actions"].includes(r.mode),
      "Invalid action scope",
    );
    assert(
      r.publisher &&
      text(r.publisher.name) &&
      ["maintainer", "provider", "community"].includes(r.publisher.kind),
      "Invalid publisher",
    );
    const url = new URL(r.publisher.url);
    assert(
      url.protocol === "https:" && !url.username && !url.password,
      "Publisher URL must be HTTPS without credentials",
    );
    assert(
      r.evidence?.level === "fixture" && text(r.evidence.description),
      "Only explicitly labeled fixture evidence is supported",
    );
    for (const key of ["boundaries", "instructions"] as const)
      assert(list(r[key]) && r[key].every(text), `Missing ${key}`);
    assert(list(r.servers), "Missing servers");
    for (const s of r.servers) {
      assert(
        s &&
        text(s.name) &&
        text(s.purpose) &&
        list(s.tools) &&
        s.tools.every(
          (t) =>
            typeof t === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(t),
        ),
        "Invalid server tools",
      );
      if (s.connection !== undefined) {
        assert(s.connection && typeof s.connection === "object", "Invalid connection");
        httpsUrl(s.connection.endpoint);
        httpsUrl(s.connection.documentation);
        assert(text(s.connection.authentication), "Missing authentication instructions");
      }
    }
    if (r.adoption !== undefined) {
      const a = r.adoption;
      assert(a && typeof a === "object", "Invalid adoption setup");
      assert(list(a.inputs) && a.inputs.every((i) => i && typeof i === "object" &&
        text(i.name) && text(i.description) && text(i.example)), "Invalid adoption inputs");
      assert(list(a.requirements) && a.requirements.every(text), "Missing runtime requirements");
      assert(text(a.exampleOutput), "Missing example output");
      assert(list(a.validation) && a.validation.every((v) => v && typeof v === "object" &&
        text(v.name) && text(v.procedure) && text(v.expected)), "Invalid sandbox procedures");
    }
    assert(list(r.outcomes), "Missing outcome checks");
    const checkIds = new Set();
    for (const c of r.outcomes) {
      assert(
        c &&
        typeof c.id === "string" &&
        id.test(c.id) &&
        !checkIds.has(c.id) &&
        text(c.label) &&
        typeof c.field === "string" &&
        field.test(c.field),
        "Invalid outcome check",
      );
      assert(
        ["string", "boolean", "number"].includes(typeof c.equals) &&
        (typeof c.equals !== "number" || Number.isFinite(c.equals)),
        "Invalid equality value",
      );
      checkIds.add(c.id);
    }
    assert(list(r.fixtures), "Missing fixtures");
    const fixtureIds = new Set();
    for (const f of r.fixtures) {
      assert(
        f &&
        typeof f.id === "string" &&
        id.test(f.id) &&
        !fixtureIds.has(f.id) &&
        text(f.title),
        "Invalid fixture",
      );
      fixtureIds.add(f.id);
      assert(
        f.observation &&
        typeof f.observation === "object" &&
        !Array.isArray(f.observation),
        "Invalid observation",
      );
      for (const [key, value] of Object.entries(f.observation))
        assert(
          field.test(key) &&
          ["string", "number", "boolean"].includes(typeof value) &&
          (typeof value !== "number" || Number.isFinite(value)),
          "Invalid observation field",
        );
      assert(
        ["met", "not_met", "indeterminate"].includes(f.expected),
        "Invalid expected verdict",
      );
      assert(
        evaluate(r, f.observation).verdict === f.expected,
        `Fixture ${r.id}/${f.id} failed`,
      );
    }
    for (const verdict of ["met", "not_met", "indeterminate"])
      assert(
        r.fixtures.some((f) => f.expected === verdict),
        `Missing ${verdict} case`,
      );
  }
}
