# Publish an agent recipe

A recipe gives users a specific job, the MCP tools needed to do it, and inspectable outcome checks. The public directory is `/recipes`; each reviewed entry has a shareable page and downloadable agent starter.

## Submit

1. Copy an entry in `recipes/catalog.json`. Choose a stable lowercase ID and semantic version. Use your actual publisher name and HTTPS source URL. `kind` is `provider`, `community`, or `maintainer`; it is attribution, not verification.
2. Describe one job, the required server tools, instructions, and boundaries. Include approval and side-effect requirements where relevant. Do not embed credentials, customer data, executable code, or third-party endorsement claims.
3. Define named outcome checks using flat observation fields and strict equality to a string, number, or boolean. Missing fields evaluate as indeterminate; an explicit failed check makes the outcome not met. These checks evaluate observations, not authority or provenance. The caller must verify the source of observations.
4. Include synthetic fixtures with expected `met`, `not_met`, and `indeterminate` outcomes. Show failure cases such as a partial update or duplicate action. The initial format supports `evidence.level: "fixture"` only. Do not describe fixture results as agent success rates, certification, or a live server test.
5. From the repository root, with Node 22.13 or later, run:

   ```sh
   node --experimental-strip-types recipes/check.ts
   node --experimental-strip-types --test recipes/registry.test.ts
   ```

6. Open a pull request. Include your relationship to the publisher, server documentation/schema links, what the tests establish, permission requirements, and any separately linked redacted live-run evidence. Maintainers verify attribution and review compatibility, data boundaries and tests before merging. A submitted PR is not a published listing. Proposals can start with the Recipe submission issue form.

## Adoption

Users download Markdown instructions or a JSON starter with blank connection slots, required tool names, a pinned recipe version, outcome rules and fixtures. The JSON is a portable recipe document, not a universal MCP runtime configuration. Users configure their runtime's MCP connections and approvals, load the instructions, then run the real agent against sandbox cases. No account is connected and no action is authorized by downloading a recipe.

The console handoff preserves the reviewed recipe ID/version and offers setup guidance. Users create or select their own workspace, connect their runtime, and configure Evals. Existing AgentAction integrations emit Jobs; downloaded fixture rules do not automatically install Evals or trusted provider observations. Compare actual outcomes with the recipe criteria and keep self-attestations distinct from independent evidence.

## Versioning and evidence

Bump the recipe version when instructions, tools, boundaries, or outcome rules change. This first catalog retains one published version per ID; historical starters remain pinned downloads but a stale console link asks users to review the current version. Live benchmarks can be linked during review; richer evidence types need an explicit format and UI change before they can appear as directory badges.
