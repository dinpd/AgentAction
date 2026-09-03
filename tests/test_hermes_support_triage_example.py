from __future__ import annotations

import importlib.util
import json
import re
from datetime import date
from pathlib import Path
import sys

import yaml


ROOT = Path("examples/hermes-support-triage")
PLUGIN = Path("integrations/hermes-agentaction")
DECISIONS = {"eligible", "ineligible", "manual_review"}
VERDICTS = {"completed", "partial", "failed", "indeterminate"}
CRITERION_IDS = {
    "policy-outcome-correct",
    "applicable-rule-evidence",
    "no-invented-customer-facts",
    "ambiguity-escalated",
    "no-refund-execution",
    "evidence-captured",
}


def load_yaml(relative_path: str):
    return yaml.safe_load((ROOT / relative_path).read_text(encoding="utf-8"))


def load_observer_module():
    spec = importlib.util.spec_from_file_location("agentaction_hermes_triage_observer", PLUGIN / "observer.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


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
    assert len(cases) >= 3
    assert {value["expected_decision"] for value in cases.values()} >= {
        "eligible",
        "ineligible",
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
        criteria = expected["criterion_evidence"]
        assert {criterion["criterion_id"] for criterion in criteria} == CRITERION_IDS
        assert all(criterion["status"] in {"pass", "fail", "insufficient_evidence"} for criterion in criteria)
        assert all(
            1 <= len(criterion["evidence_refs"]) <= 4
            and all(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,79}", reference) for reference in criterion["evidence_refs"])
            for criterion in criteria
        )


def test_prompts_bind_named_fixtures_and_read_only_tools() -> None:
    expectations = load_yaml("expected-outcomes.yaml")
    prompt_files = {
        "demo-case-eligible-001": ROOT / "prompts/eligible.md",
        "demo-case-ineligible-001": ROOT / "prompts/ineligible.md",
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
        assert "Self-attested" in prompt or "self-attested" in prompt
        assert all(criterion_id in prompt for criterion_id in CRITERION_IDS)


def test_three_fixtures_flow_through_maintained_self_attested_reporter() -> None:
    observer = load_observer_module()
    expectations = load_yaml("expected-outcomes.yaml")
    for case_id, expected in expectations["cases"].items():
        job_payloads = []
        instance = observer.HermesShadowObserver(
            observer.ObserverConfig.from_mapping({
                "endpoint": "https://gateway.agentaction.dev",
                "tenant_id": "hermes-agents-poc",
                "source_id": "hermes-poc",
                "agent_id": "hermes-smoke-agent",
                "capture_declared_intent": True,
                "token": "synthetic-test-token",
            }),
            job_sender=lambda payload, case_id=case_id: job_payloads.append(payload) or {
                "job_id": f"hermes-{case_id}",
                "intent_id": f"intent-{case_id}",
                "intent_digest": "a" * 64,
            },
        )
        correlation = {
            "session_id": f"session-{case_id}",
            "task_id": f"task-{case_id}",
            "turn_id": f"turn-{case_id}",
        }
        instance.pre_llm_call(**correlation)
        declared = json.loads(instance.declare_intent(
            {
                "goal": "Recommend the synthetic refund-policy outcome.",
                "success_criteria": ["Apply the named policy rules."],
                "constraints": ["Remain read-only."],
                "confidence": 0.8,
            },
            **correlation,
        ))
        assert declared["status"] == "captured"
        partial = expected["expected_job_verdict"] == "partial"
        reported = json.loads(instance.report_outcome(
            {
                "status": "partial" if partial else "achieved",
                "success_criteria_met": "some" if partial else "all",
                "constraints_respected": "pass",
                "confidence": 0.8,
                "criterion_evidence": expected["criterion_evidence"],
            },
            **correlation,
        ))
        assert reported == {"status": "captured", "provenance": "agent_self_attested"}
        instance.post_api_request(
            **correlation,
            api_request_id=f"request-{case_id}",
            provider="openai-codex",
            model="gpt-5.6-luna",
            usage={
                "prompt_tokens": 100,
                "input_tokens": 70,
                "cache_read_tokens": 20,
                "cache_write_tokens": 10,
                "output_tokens": 15,
                "total_tokens": 115,
            },
        )
        instance.on_session_end(**correlation, completed=True)
        assert instance.flush_jobs_once() is True
        completed = job_payloads[-1]
        report = completed["reported_outcome"]["criterion_evidence"]
        assert report["job_id"] == f"hermes-{case_id}"
        assert report["eval_id"] == "refund_triage"
        assert report["eval_version"] == "v2"
        assert report["trust"] == "agent_self_attested"
        assert report["criteria"] == expected["criterion_evidence"]
        assert completed["model_usage"]["uncached_input_tokens"] == 70
        assert completed["model_usage"]["cached_input_tokens"] == 30
        assert completed["model_usage"]["output_tokens"] == 15
        assert completed["model_usage"]["total_tokens"] == 115
        serialized = json.dumps(completed)
        assert "case_note" not in serialized
        assert load_yaml(expected["case_file"])["case_note"] not in serialized


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
