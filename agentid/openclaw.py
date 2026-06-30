from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from agentid.manifest import ManifestError, load_manifest, validate_manifest


BUDGET_DEMO_LIMITATION = (
    "Covers OpenClaw tool-call loops and tool-call payload budgets. Full "
    "heartbeat/prompt-context enforcement still needs an OpenClaw pre-model "
    "or heartbeat contribution hook."
)


@dataclass(frozen=True)
class OpenClawDoctorCheck:
    name: str
    ok: bool
    detail: str


@dataclass(frozen=True)
class OpenClawDoctorResult:
    ok: bool
    demo: str
    checks: list[OpenClawDoctorCheck]
    budget_result: dict[str, Any] | None
    limitation: str = BUDGET_DEMO_LIMITATION


def run_openclaw_budget_doctor(
    *,
    root: str | Path = ".",
    build: bool = False,
    node_bin: str = "node",
    npm_bin: str = "npm",
) -> OpenClawDoctorResult:
    repo_root = Path(root).resolve()
    solution_dir = repo_root / "solutions" / "openclaw-agentpass"
    package_dir = repo_root / "packages" / "openclaw"
    manifest_path = solution_dir / "agentpass-openclaw-manifest.yaml"
    adapter_path = package_dir / "dist" / "index.js"
    demo_script = solution_dir / "tool-loop-budget-use-case.mjs"

    checks: list[OpenClawDoctorCheck] = []
    budget_result: dict[str, Any] | None = None

    manifest_ok = False
    try:
        validation = validate_manifest(load_manifest(manifest_path))
        manifest_ok = validation.ok
        if validation.ok:
            detail = f"{manifest_path.relative_to(repo_root)} is valid"
            if validation.warnings:
                detail += f" ({len(validation.warnings)} warning(s))"
        else:
            detail = "; ".join(validation.errors)
    except (ManifestError, OSError) as exc:
        detail = str(exc)
    checks.append(OpenClawDoctorCheck("manifest", manifest_ok, detail))

    build_ok = adapter_path.exists()
    if not build_ok and build:
        build_process = subprocess.run(
            [npm_bin, "run", "build"],
            cwd=package_dir,
            capture_output=True,
            text=True,
            check=False,
        )
        build_ok = build_process.returncode == 0 and adapter_path.exists()
        build_detail = "npm run build completed" if build_ok else _process_failure_detail(build_process)
    elif build_ok:
        build_detail = f"{adapter_path.relative_to(repo_root)} exists"
    else:
        build_detail = "packages/openclaw/dist/index.js is missing; run `cd packages/openclaw && npm run build` or pass --build"
    checks.append(OpenClawDoctorCheck("openclaw-adapter-build", build_ok, build_detail))

    script_ok = demo_script.exists()
    checks.append(
        OpenClawDoctorCheck(
            "budget-demo-script",
            script_ok,
            f"{demo_script.relative_to(repo_root)} exists" if script_ok else f"missing {demo_script}",
        )
    )

    if manifest_ok and build_ok and script_ok:
        demo_process = subprocess.run(
            [node_bin, str(demo_script.relative_to(repo_root))],
            cwd=repo_root,
            capture_output=True,
            text=True,
            check=False,
        )
        if demo_process.returncode == 0:
            try:
                budget_result = json.loads(demo_process.stdout)
                demo_ok = _budget_demo_passed(budget_result)
                detail = _budget_demo_detail(budget_result) if demo_ok else "budget demo returned unexpected decisions"
            except json.JSONDecodeError as exc:
                demo_ok = False
                detail = f"budget demo did not print JSON: {exc}"
        else:
            demo_ok = False
            detail = _process_failure_detail(demo_process)
        checks.append(OpenClawDoctorCheck("budget-demo", demo_ok, detail))
    else:
        checks.append(OpenClawDoctorCheck("budget-demo", False, "skipped because prerequisite checks failed"))

    return OpenClawDoctorResult(
        ok=all(check.ok for check in checks),
        demo="budget",
        checks=checks,
        budget_result=budget_result,
    )


def openclaw_doctor_to_dict(result: OpenClawDoctorResult) -> dict[str, Any]:
    return {
        "ok": result.ok,
        "demo": result.demo,
        "checks": [check.__dict__ for check in result.checks],
        "budgetResult": result.budget_result,
        "limitation": result.limitation,
    }


def format_openclaw_doctor(result: OpenClawDoctorResult) -> str:
    lines = ["AgentPass OpenClaw budget doctor"]
    for check in result.checks:
        status = "ok" if check.ok else "fail"
        lines.append(f"[{status}] {check.name}: {check.detail}")
    lines.append("")
    if result.ok:
        lines.append("Budget demo passed: repeated reads allow, allow, then challenge; oversized payload denies.")
    else:
        lines.append("Budget demo is not ready. Fix failed checks above and rerun.")
    lines.append(f"Note: {result.limitation}")
    return "\n".join(lines) + "\n"


def _budget_demo_passed(payload: dict[str, Any]) -> bool:
    repeated = payload.get("repeatedReads")
    oversized = payload.get("oversizedContext")
    if not isinstance(repeated, list) or len(repeated) != 3 or not isinstance(oversized, dict):
        return False
    return (
        payload.get("useCase") == "tool-loop-budget-gate"
        and payload.get("outcome") == "passed"
        and [item.get("decision") for item in repeated] == ["allow", "allow", "challenge_required"]
        and oversized.get("decision") == "deny"
    )


def _budget_demo_detail(payload: dict[str, Any]) -> str:
    repeated = payload.get("repeatedReads") or []
    decisions = ", ".join(str(item.get("decision")) for item in repeated if isinstance(item, dict))
    oversized = payload.get("oversizedContext") or {}
    return f"repeatedReads=[{decisions}], oversizedContext={oversized.get('decision')}"


def _process_failure_detail(process: subprocess.CompletedProcess[str]) -> str:
    stderr = process.stderr.strip()
    stdout = process.stdout.strip()
    output = stderr or stdout
    if not output:
        output = f"process exited with code {process.returncode}"
    return output.splitlines()[-1][:500]
