# AgentAction Delivery Instructions

Follow the `issue-to-merge` workflow for every software change in this
repository. Preserve unrelated local changes and do not report completion until
the remote default branch contains the verified change.

## Public demo addresses

Use an `agentaction.dev` subdomain for public demo entrypoints and promotional
links in documentation, the website, posts, and videos. Name the subdomain for the
specific demo; do not use a generic `demo` hostname. Configure and verify HTTPS
before promotion. Use `https://shared-authority.agentaction.dev/` for shared
authority and `https://refund.agentaction.dev/` for the original refund demo.
Keep signed provider/issuer identifiers stable unless their migration is
explicitly part of the task.

## Release responsibility

Classify the release impact before implementing each change and record it in
the issue and pull request.

A change is **significant functionality** when it adds or materially changes a
user-visible capability, public API, CLI behavior, schema, package export,
authorization or evidence behavior, hosted gateway contract, or required
migration. Significant functionality must execute the release process in
[`docs/releasing.md`](docs/releasing.md) in the same delivery task unless the
user explicitly narrows the task to an earlier gate. Do not wait for the user
to remember or separately request the release.

Use a minor release for significant functionality while the project is below
1.0, a patch release for backward-compatible fixes, and a prerelease when the
release policy identifies elevated compatibility or operational risk. Pure
documentation, test-only, internal refactoring, and unreleased experimental
changes may be marked `no release`, with a brief rationale.

For a release-bearing task:

1. update version metadata and `CHANGELOG.md` in the pull request;
   for a significant feature release, include a `### Website highlight` with
   one `- Public headline: Public summary` bullet (headline at most 90 characters,
   summary at most 230). Explain what a visitor can now do in plain language,
   retaining meaningful preview/synthetic/availability limits. Do not copy Git
   subjects, implementation details or marketing claims. The homepage pulls this
   reviewed copy automatically from CI-published release notes.
   Lead with the enduring capability or integration and its user benefit. Name
   demo scenarios as supporting examples, not as the product feature. Describe
   shipped scope precisely: do not imply general production support from a
   synthetic reference integration. Prefer clear capability names over narrow
   demo actions, technical identifiers, superlatives or vague novelty.
2. run the release gates documented in `docs/releasing.md`;
3. merge through the normal issue-to-merge process;
4. create and push the matching version tag;
5. verify that the release workflow publishes the GitHub release and artifacts.

