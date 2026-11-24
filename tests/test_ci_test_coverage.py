"""Every package.json ``test*`` script must run in a workflow that gates pull requests.

Two packages had unit tests that ran only in the release workflow, on a tag push, so a change that
broke them was found after it had merged (#438). This file runs in the root ``pytest`` job, which
has no path filter, so it also sees a package added in a directory no workflow knows about.
"""

from __future__ import annotations

import itertools
import json
import re
import subprocess
from pathlib import Path
from typing import Iterator

import yaml


ROOT = Path(__file__).resolve().parent.parent

# "<package directory>:<script>" -> why no pull-request workflow can run it.
EXCLUDED: dict[str, str] = {}

Scripts = dict[str, str]


def triggers(workflow: dict) -> dict[str, dict]:
    # PyYAML reads the bare key `on` as the boolean true.
    on = workflow.get("on", workflow.get(True)) or {}
    if isinstance(on, str):
        on = [on]
    if isinstance(on, list):
        return {name: {} for name in on}
    return {name: config or {} for name, config in on.items()}


def covers(pull_request: dict, directory: str) -> bool:
    """Whether the trigger starts the workflow for any change inside the package.

    `paths-ignore` and `types` are not evaluated, so a trigger that uses either does not count.
    A `branches` filter is not read.
    """
    if "paths-ignore" in pull_request or "types" in pull_request:
        return False
    paths = pull_request.get("paths")
    return paths is None or "**" in paths or f"{directory}/**" in paths


def not_gating(node: dict) -> bool:
    """A job or step that may be skipped, or whose failure does not fail the check.

    An `if:` is not evaluated: any condition means the step is not counted, so select a package with
    `working-directory` rather than with a condition on the test step.
    """
    return bool(node.get("continue-on-error") or node.get("if"))


def matrix_rows(job: dict) -> list[dict]:
    """List-valued axes multiplied out without `exclude` rows, plus `include` rows."""
    matrix = (job.get("strategy") or {}).get("matrix") or {}
    axes = {key: values for key, values in matrix.items() if key not in ("include", "exclude") and isinstance(values, list)}
    rows = [dict(zip(axes, combination)) for combination in itertools.product(*axes.values())] if axes else []
    rows = [row for row in rows if not any(excluded.items() <= row.items() for excluded in matrix.get("exclude") or [])]
    return rows + list(matrix.get("include") or []) or [{}]


def expand(text: str, row: dict) -> str:
    return re.sub(r"\$\{\{\s*matrix\.([\w-]+)\s*\}\}", lambda match: str(row.get(match[1], match[0])), text)


def run_steps(workflow: dict) -> Iterator[tuple[str, str]]:
    """(working directory, command) of every `run:` step that can fail a pull request."""
    workflow_default = ((workflow.get("defaults") or {}).get("run") or {}).get("working-directory", ".")
    for job in (workflow.get("jobs") or {}).values():
        if not_gating(job):
            continue
        default = ((job.get("defaults") or {}).get("run") or {}).get("working-directory", workflow_default)
        for row in matrix_rows(job):
            for step in job.get("steps") or []:
                if "run" in step and not not_gating(step):
                    directory = expand(step.get("working-directory", default), row)
                    yield Path(directory).as_posix(), expand(step["run"], row)


def scripts_run(command: str, scripts: Scripts, seen: frozenset[str] = frozenset()) -> set[str]:
    """Scripts a command runs: by name, by repeating a script's own command line, or through a script it calls.

    Known limits: `cd <dir> && npm test` and `npm --prefix <dir> test` are not followed (use
    `working-directory`), and a command that only prints a script's command line, or that discards
    the exit status (`npm test || true`), counts as running it.
    """
    named = set(re.findall(r"\bnpm run(?:-script)? ([\w:.-]+)", command))
    if re.search(r"\bnpm t(?:est)?(?![\w:.-])", command):
        named.add("test")
    found = {name for name, body in scripts.items() if name in named or (body and body in command)} - seen
    for name in list(found):
        found |= scripts_run(scripts[name], scripts, seen | found)
    return found


def unwired(workflows: list[dict], packages: dict[str, Scripts]) -> list[str]:
    """`<directory>:<script>` for every `test*` script no pull-request workflow runs."""
    ran: dict[str, set[str]] = {directory: set() for directory in packages}
    for workflow in workflows:
        pull_request = triggers(workflow).get("pull_request")
        if pull_request is None:
            continue
        for directory, command in run_steps(workflow):
            if directory in packages and covers(pull_request, directory):
                ran[directory] |= scripts_run(command, packages[directory])
    return sorted(
        f"{directory}:{name}"
        for directory, scripts in packages.items()
        for name in scripts
        if name.startswith("test") and name not in ran[directory]
    )


def repository_packages() -> dict[str, Scripts]:
    # Tracked and new-but-not-ignored files, so node_modules and build output are never read.
    listed = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "--", "package.json", "*/package.json"],
        cwd=ROOT, check=True, capture_output=True, text=True,
    ).stdout.split("\n")
    manifests = [ROOT / line for line in listed if line and (ROOT / line).is_file()]
    return {
        manifest.parent.relative_to(ROOT).as_posix(): json.loads(manifest.read_text(encoding="utf-8")).get("scripts") or {}
        for manifest in manifests
    }


def repository_workflows() -> list[dict]:
    return [yaml.safe_load(path.read_text(encoding="utf-8")) for path in sorted((ROOT / ".github" / "workflows").glob("*.y*ml"))]


PACKAGES = repository_packages()
UNWIRED = unwired(repository_workflows(), PACKAGES)


def test_every_package_test_script_runs_on_pull_requests_or_is_excluded_with_a_reason():
    missing = [script for script in UNWIRED if script not in EXCLUDED]
    assert not missing, (
        "No pull-request workflow runs these package.json test scripts: "
        + ", ".join(missing)
        + ". Run each one in a workflow triggered by `pull_request` whose `paths` filter, if it has one, "
        "includes `<package directory>/**` (the `package-tests` matrix in .github/workflows/agentaction-check.yml "
        "runs on every pull request), or list it in EXCLUDED with the reason."
    )


def exclusion_errors(excluded: dict[str, str], packages: dict[str, Scripts], not_wired: list[str]) -> list[str]:
    known = {f"{directory}:{name}" for directory, scripts in packages.items() for name in scripts}
    return [
        f"{script}: {problem}"
        for script, reason in excluded.items()
        for problem, found in (
            ("no package.json defines it", script not in known),
            ("it runs on pull requests; remove it from EXCLUDED", script in known and script not in not_wired),
            ("say why it cannot run on pull requests", len(reason.strip()) < 20),
        )
        if found
    ]


def test_the_exclusion_list_names_only_unwired_scripts_and_states_a_reason():
    assert exclusion_errors(EXCLUDED, PACKAGES, UNWIRED) == []

    packages = {"pkg": {"test": "node --test", "test:live": "node live.mjs"}}
    reason = "Needs a production credential that pull requests cannot read."
    assert exclusion_errors({"pkg:test:live": reason}, packages, ["pkg:test:live"]) == []
    assert exclusion_errors({"pkg:test": reason, "pkg:test:live": "later", "gone:test": reason}, packages, ["pkg:test:live"]) == [
        "pkg:test: it runs on pull requests; remove it from EXCLUDED",
        "pkg:test:live: say why it cannot run on pull requests",
        "gone:test: no package.json defines it",
    ]


def workflow(on: object, steps: list[dict], **job: object) -> dict:
    return {"on": on, "jobs": {"verify": {"steps": steps, **job}}}


def test_only_a_gating_pull_request_step_in_the_package_directory_counts():
    packages = {"pkg": {"test": "node --test tests/*.test.ts", "build": "tsc"}}
    step = {"working-directory": "pkg", "run": "npm test"}

    assert unwired([workflow({"pull_request": None}, [step])], packages) == []
    assert unwired([yaml.safe_load("on: pull_request\njobs: {verify: {steps: [{working-directory: pkg, run: npm test}]}}")], packages) == []
    assert unwired([workflow({"pull_request": {"paths": ["pkg/**"]}}, [step])], packages) == []
    assert unwired([workflow(["pull_request"], [{"run": "npm test"}], defaults={"run": {"working-directory": "pkg"}})], packages) == []

    for not_wired in (
        workflow({"push": {"tags": ["v*"]}}, [step]),
        workflow({"push": {"branches": ["main"]}, "workflow_dispatch": None}, [step]),
        workflow({"pull_request": {"paths": ["other/**", "pkg/src/one-file.ts"]}}, [step]),
        workflow({"pull_request": {"paths-ignore": ["pkg/**"]}}, [step]),
        workflow({"pull_request": {"types": ["closed"]}}, [step]),
        workflow({"pull_request": None}, [{"working-directory": "other", "run": "npm test"}]),
        workflow({"pull_request": None}, [{"working-directory": "pkg", "run": "npm ci && npm run build"}]),
        workflow({"pull_request": None}, [{**step, "if": "github.event_name != 'pull_request'"}]),
        workflow({"pull_request": None}, [{**step, "if": "matrix.package == 'other'"}]),
        workflow({"pull_request": None}, [{"working-directory": "pkg", "run": "echo hi"}]),
        workflow({"pull_request": None}, [{**step, "continue-on-error": True}]),
        workflow({"pull_request": None}, [step], **{"if": "github.event_name != 'pull_request'"}),
    ):
        assert unwired([not_wired], packages) == ["pkg:test"], not_wired


def test_matrix_directories_script_chains_and_repeated_command_lines_are_followed():
    packages = {
        "packages/a": {"test": "npm run test:unit && npm run test:e2e", "test:unit": "node --test", "test:e2e": "node e2e.mjs", "test:manual": "node manual.mjs"},
        "packages/b": {"test": "node --test tests/*.test.ts", "test:browser": "node tests/site-browser.mts"},
    }
    matrix = workflow(
        {"pull_request": None},
        [
            {"working-directory": "${{ matrix.package }}", "run": "npm ci\nnpm test"},
            {"working-directory": "packages/b", "run": "node tests/site-browser.mts"},
        ],
        strategy={"matrix": {"package": ["packages/a"], "include": [{"package": "packages/b"}]}},
    )

    assert unwired([matrix], packages) == ["packages/a:test:manual"]

    excluded = workflow(
        {"pull_request": None},
        [{"working-directory": "${{ matrix.package }}", "run": "npm test"}],
        strategy={"matrix": {"package": ["packages/a", "packages/b"], "exclude": [{"package": "packages/b"}]}},
    )
    assert unwired([excluded], packages) == ["packages/a:test:manual", "packages/b:test", "packages/b:test:browser"]
