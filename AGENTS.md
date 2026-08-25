# AgentAction Delivery Instructions

Follow the `issue-to-merge` workflow for every software change in this
repository. Preserve unrelated local changes and do not report completion until
the remote default branch contains the verified change.

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
2. run the release gates documented in `docs/releasing.md`;
3. merge through the normal issue-to-merge process;
4. create and push the matching version tag;
5. verify that the release workflow publishes the GitHub release and artifacts.

