# Releasing AgentAction

AgentAction uses semantic versioning for the repository-level product release.
While the project is below 1.0, new or breaking functionality increments the
minor version and backward-compatible fixes increment the patch version.

The canonical product release consists of a GitHub tag and release, the Python
source distribution and wheel attached to that release, release notes, and an
explicit compatibility statement. Hosted services and the website deploy from
`main` and are identified by commit SHA; a deployment alone is not a product
release. npm packages retain independent versions and are published only when
their own metadata changes and registry publishing has been explicitly
configured.

## Release impact

Classify every pull request as one of:

- **Significant functionality:** a new or materially changed user-visible
  capability, public API, CLI behavior, schema, package export, authorization
  or evidence behavior, hosted gateway contract, or migration. Prepare a minor
  release in the same delivery task.
- **Patch:** a backward-compatible defect or security fix. Prepare a patch
  release promptly; target 24–48 hours for urgent fixes.
- **No release:** documentation, tests, internal refactoring, or experimental
  work that does not change a supported user-visible surface. State why.

Use a release candidate when a change alters a schema or compatibility
boundary, requires migration, or has elevated operational risk. The Python
version `X.Y.ZrcN` maps to the Git tag `vX.Y.Z-rc.N`. Validate an RC for three to
five business days when practical, then release the same validated code as the
stable version with only release metadata changes.

Review release readiness at least every two weeks. Significant functionality
must not remain only under `Unreleased` for more than 30 days.

## Prepare the release

1. Create or confirm a release issue with observable acceptance criteria.
2. Branch from the current remote default branch.
3. Move accumulated notes from `Unreleased` to a dated version section and
   recreate an empty `Unreleased` section.
4. Update the version in `pyproject.toml` and `agentid/__init__.py`. Runtime
   protocol metadata must read the package version rather than duplicate it.
5. Run `python scripts/check_release.py` and the relevant project checks.
6. Build the Python artifacts and inspect them before merging.
7. Merge only after required CI checks are green and release notes explain:
   what became possible, compatibility impact, installation target, and any
   migration.

## Release gates

At minimum, a stable product release requires:

```bash
python scripts/check_release.py
python -m pytest
python -m build
```

Also run `npm ci`, `npm test`, and `npm run build` in each changed TypeScript
package. For a repository-wide minor release, validate the guard, client SDK,
provider middleware, OpenClaw package, and MCP gateway adapter. Run the
Cloudflare tests and dry runs when hosted gateway, console, or simulation code
changed.

Review the complete diff for compatibility, accidental files, credentials,
unsafe publishing permissions, and generated artifacts. A successful scan does
not replace this review.

## Publish and verify

After the release-prep pull request is merged, create an annotated tag that
matches the Python version and push it:

```bash
git tag -a vX.Y.Z -m "AgentAction X.Y.Z"
git push origin vX.Y.Z
```

The tag-triggered release workflow revalidates metadata, runs the Python and
TypeScript gates, builds the Python artifacts, and creates the GitHub release
from the matching changelog entry. Verify that:

- the workflow is green;
- the GitHub release points to the intended merge commit;
- the wheel and source distribution are attached;
- installation from the wheel succeeds in a clean environment;
- the remote default branch and local branch are synchronized.

Registry publication is not implied by the GitHub release. Add trusted PyPI or
npm publishing as a separately reviewed change before claiming those artifacts
were published to a registry.

