from __future__ import annotations

import re
from datetime import date
from pathlib import Path

import yaml


ROOT = Path("examples/hermes-support-triage")
DECISIONS = {"eligible", "ineligible", "manual_review"}
VERDICTS = {"completed", "partial", "failed", "indeterminate"}


def load_yaml(relative_path: str):
    return yaml.safe_load((ROOT / relative_path).read_text(encoding="utf-8"))


def test_support_triage_fixtures_are_consistent() -> None:
    policy = load_yaml("policy.yaml")
    expectations = load_yaml("expected-outcomes.yaml")

    assert policy["schema_version"] == "agentaction.hermes-support-triage-policy.v1"
    assert policy["scenario"] == "synthetic"
    rule_ids = [rule["id"] for rule in policy["rules"]]
    assert len(rule_ids) >= 5
    assert len(rule_ids) == len(set(rule_ids))
    assert all(re.fullmatch(r"REFUND-[0-9]{2}", rule_id) for rule_id in rule_ids)

    cases = expectations["cases"]
    assert len(cases) >= 2
    assert {value["expected_decision"] for value in cases.values()} >= {
        "eligible",
        "manual_review",
    }
    assert {value["expected_qualified_success"] for value in cases.values()} == {
        True,
        False,
    }

    seen_order_ids: set[str] = set()
    for case_id, expected in cases.items():
        case = load_yaml(expected["case_file"])
        assert case["schema_version"] == "agentaction.hermes-support-triage-case.v1"
        assert case["scenario"] == "synthetic"
        assert case["case_id"] == case_id
        assert case["order_id"].startswith("demo-order-")
        assert case["order_id"] not in seen_order_ids
        seen_order_ids.add(case["order_id"])
        assert date.fromisoformat(case["delivered_at"]) <= date.fromisoformat(
            case["request_received_at"]
        )
        assert expected["expected_decision"] in DECISIONS
        assert expected["expected_job_verdict"] in VERDICTS
        assert expected["expected_constraint_compliance"] == "pass"
        assert set(expected["expected_rule_ids"]) <= set(rule_ids)


def test_prompts_bind_named_fixtures_and_read_only_tools() -> None:
    expectations = load_yaml("expected-outcomes.yaml")
    prompt_files = {
        "demo-case-eligible-001": ROOT / "prompts/eligible.md",
        "demo-case-manual-review-001": ROOT / "prompts/manual-review.md",
    }

    for case_id, prompt_path in prompt_files.items():
        prompt = prompt_path.read_text(encoding="utf-8")
        case_file = expectations["cases"][case_id]["case_file"]
        assert case_file in prompt
        assert "policy.yaml" in prompt
        assert "agentaction_declare_intent" in prompt
        assert "agentaction_report_outcome" in prompt
        assert "read_file" in prompt
        assert re.search(r"Do not\s+use\s+code execution", prompt)
        assert "Decision" in prompt
        assert "Policy rules" in prompt
        assert "Recommended next action" in prompt


def test_example_contains_no_obvious_credentials_or_contact_data() -> None:
    text = "\n".join(
        path.read_text(encoding="utf-8")
        for path in sorted(ROOT.rglob("*"))
        if path.is_file()
    )
    assert not re.search(r"\bsk-[A-Za-z0-9_-]{12,}\b", text)
    assert not re.search(r"\bBearer\s+[A-Za-z0-9._~-]{12,}\b", text, re.IGNORECASE)
    assert not re.search(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", text, re.IGNORECASE)
    assert not re.search(r"\b(?:\+?1[-. ]?)?\(?[2-9][0-9]{2}\)?[-. ][0-9]{3}[-. ][0-9]{4}\b", text)
