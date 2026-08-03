from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
VECTOR = ROOT / "fixtures" / "mcp-authorization-interoperability-v1" / "vector.json"
RUNNER = ROOT / "scripts" / "run_mcp_authorization_vector.py"


def run_vector() -> dict:
    completed = subprocess.run(
        [sys.executable, str(RUNNER), str(VECTOR)],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def test_mcp_authorization_interoperability_vector_is_deterministic():
    first = run_vector()
    second = run_vector()

    assert first == second
    assert first["all_cases_match"] is True


def test_mcp_authorization_interoperability_vector_covers_required_boundaries():
    result = run_vector()
    cases = {case["id"]: case for case in result["cases"]}

    valid = cases["valid_single_use_execution"]
    assert valid["ok"] is True
    assert valid["closure"]["status"] == "executed"
    assert valid["closure"]["link_valid"] is True

    assert cases["mutated_action_rejected"]["codes"] == ["out_of_scope"]
    assert cases["mutated_action_rejected"]["findings"] == ["receipt action_digest mismatch"]
    assert cases["wrong_audience_rejected"]["codes"] == ["wrong_audience"]
    assert cases["replay_rejected"]["codes"] == ["already_consumed"]
