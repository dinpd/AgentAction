from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
VECTOR = ROOT / "fixtures" / "mcp-authorization-conformance-v2" / "vector.json"
RUNNER = ROOT / "scripts" / "run_mcp_authorization_conformance_v2.py"


def run_suite() -> dict:
    completed = subprocess.run(
        [sys.executable, str(RUNNER), str(VECTOR)],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def test_mcp_authorization_conformance_v2_is_deterministic():
    first = run_suite()
    second = run_suite()

    assert first == second
    assert first["signing_profile"] == "RS256/JWKS"
    assert first["trusted_key_id"] == "agentpass-conformance-v2"
    assert first["all_cases_match"] is True


def test_mcp_authorization_conformance_v2_covers_required_fail_closed_cases():
    result = run_suite()
    cases = {case["id"]: case for case in result["cases"]}

    expected_codes = {
        "mutated_action_rejected": ["out_of_scope"],
        "runtime_identity_mismatch_rejected": ["out_of_scope"],
        "delegation_escalation_rejected": ["out_of_scope"],
        "expired_approval_rejected": ["expired"],
        "revoked_risk_state_rejected": ["revoked"],
        "policy_drift_rejected": ["out_of_scope"],
        "wrong_audience_rejected": ["wrong_audience"],
        "unknown_signing_key_rejected": ["unknown_key"],
    }

    for case_id, codes in expected_codes.items():
        assert cases[case_id]["ok"] is False
        assert cases[case_id]["codes"] == codes
        assert cases[case_id]["attempts"] == []
        assert cases[case_id]["completed_mutations"] == 0


def test_mcp_authorization_conformance_v2_models_retry_and_partial_closure():
    result = run_suite()
    cases = {case["id"]: case for case in result["cases"]}

    valid = cases["valid_execution"]
    assert valid["ok"] is True
    assert valid["attempts"][0]["closure"]["status"] == "executed"
    assert valid["attempts"][0]["closure"]["link_valid"] is True

    retry = cases["retry_returns_prior_closure"]
    assert retry["completed_mutations"] == 1
    assert [attempt["disposition"] for attempt in retry["attempts"]] == [
        "executed",
        "replayed",
    ]
    assert retry["attempts"][0]["closure"] == retry["attempts"][1]["closure"]

    partial = cases["partial_then_completed_retry"]
    assert partial["completed_mutations"] == 1
    assert partial["partial_attempts"] == 1
    assert [attempt["closure"]["status"] for attempt in partial["attempts"]] == [
        "partial",
        "executed",
    ]
    assert all(attempt["closure"]["link_valid"] for attempt in partial["attempts"])
    assert len({attempt["closure"]["decision_id"] for attempt in partial["attempts"]}) == 1
    assert len({attempt["closure"]["action_digest"] for attempt in partial["attempts"]}) == 1
