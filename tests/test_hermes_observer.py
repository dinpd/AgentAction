from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import time


ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "integrations" / "hermes-agentaction"


def load_observer_module():
    spec = importlib.util.spec_from_file_location("agentaction_hermes_observer", PLUGIN / "observer.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


observer = load_observer_module()


def config(**overrides):
    values = {
        "endpoint": "https://gateway.example.test",
        "tenant_id": "tenant-a",
        "source_id": "hermes-prod",
        "agent_id": "support-agent",
        "token": "secret-token",
        "tool_policies": {
            "billing.issue_credit": {
                "action": "pay",
                "max_identical_calls_per_task": 1,
            },
            "terminal": {
                "action": "execute",
                "requires_approval": True,
            },
        },
    }
    values.update(overrides)
    return observer.ObserverConfig.from_mapping(values)


def drain(instance):
    events = []
    while not instance.events.empty():
        events.append(instance.events.get_nowait())
    return events


def test_tool_observation_is_fail_open_correlated_and_privacy_safe():
    instance = observer.HermesShadowObserver(config())
    sensitive_args = {"amount": 49, "api_key": "secret", "customer_email": "person@example.test"}
    assert instance.pre_tool_call(
        tool_name="billing.issue_credit",
        args=sensitive_args,
        task_id="task-1",
        session_id="session-1",
        turn_id="turn-1",
        tool_call_id="call-1",
        api_request_id="api-1",
    ) is None
    assert instance.post_tool_call(
        tool_name="billing.issue_credit",
        args=sensitive_args,
        result='{"provider_secret":"do-not-export"}',
        status="ok",
        duration_ms=12,
        task_id="task-1",
        session_id="session-1",
        turn_id="turn-1",
        tool_call_id="call-1",
        api_request_id="api-1",
    ) is None

    [event] = drain(instance)
    assert event["correlation"]["tool_call_id"] == "call-1"
    assert event["evaluation"]["counterfactual_decision"] == "allow"
    assert event["execution"] == {"status": "ok", "duration_ms": 12}
    assert event["intent"] == {"binding_status": "unbound"}
    encoded = str(event)
    assert "secret" not in encoded
    assert "person@example.test" not in encoded
    assert "provider_secret" not in encoded
    assert "amount" not in encoded


def test_parallel_tool_calls_join_by_hermes_tool_call_id_and_detect_duplicate():
    instance = observer.HermesShadowObserver(config())
    common = {"tool_name": "billing.issue_credit", "args": {"customer": "c1"}, "task_id": "task-1"}
    instance.pre_tool_call(**common, tool_call_id="call-a")
    instance.pre_tool_call(**common, tool_call_id="call-b")
    instance.post_tool_call(**common, tool_call_id="call-b", status="ok", duration_ms=2)
    instance.post_tool_call(**common, tool_call_id="call-a", status="ok", duration_ms=3)

    events = drain(instance)
    by_id = {event["correlation"]["tool_call_id"]: event for event in events}
    assert by_id["call-a"]["evaluation"]["counterfactual_decision"] == "allow"
    assert by_id["call-b"]["evaluation"]["counterfactual_decision"] == "deny"
    assert by_id["call-b"]["evaluation"]["findings"] == ["identical_tool_call_budget_exceeded"]


def test_unmapped_and_approval_required_tools_remain_observations():
    instance = observer.HermesShadowObserver(config())
    instance.pre_tool_call(tool_name="unknown", args={}, tool_call_id="call-u")
    instance.post_tool_call(tool_name="unknown", args={}, tool_call_id="call-u", status="error", error_type="ToolError")
    instance.pre_tool_call(tool_name="terminal", args={"command": "sensitive"}, tool_call_id="call-t")
    instance.post_tool_call(tool_name="terminal", args={"command": "sensitive"}, tool_call_id="call-t", status="ok")

    unknown, terminal = drain(instance)
    assert unknown["evaluation"] == {
        "status": "unmapped",
        "counterfactual_decision": None,
        "findings": ["tool_not_mapped"],
    }
    assert terminal["evaluation"]["counterfactual_decision"] == "challenge_required"
    assert terminal["evaluation"]["findings"] == ["approval_required"]
    assert "sensitive" not in str(terminal)


def test_explicit_intent_requires_id_and_digest_and_is_preserved():
    try:
        config(intent_id="intent-1")
    except ValueError as exc:
        assert "configured together" in str(exc)
    else:
        raise AssertionError("partial intent binding should fail")

    instance = observer.HermesShadowObserver(config(intent_id="intent-1", intent_digest="abc123"))
    instance.pre_tool_call(tool_name="terminal", args={}, tool_call_id="call-1")
    instance.post_tool_call(tool_name="terminal", args={}, tool_call_id="call-1", status="ok")
    [event] = drain(instance)
    assert event["intent"] == {
        "binding_status": "bound",
        "intent_id": "intent-1",
        "intent_digest": "abc123",
    }


def test_model_and_subagent_hooks_export_metadata_without_content():
    instance = observer.HermesShadowObserver(config())
    assert instance.pre_api_request(
        api_request_id="api-1",
        turn_id="turn-1",
        model="model-a",
        provider="provider-a",
        user_message="private prompt",
        conversation_history=[{"content": "private history"}],
        request={"messages": ["private request"]},
        approx_input_tokens=42,
        tool_count=3,
    ) is None
    assert instance.post_api_request(
        api_request_id="api-1",
        turn_id="turn-1",
        model="model-a",
        provider="provider-a",
        response={"content": "private response"},
        assistant_message={"content": "private assistant"},
        usage={"input_tokens": 42, "output_tokens": 7, "total_tokens": 49},
        api_duration=0.25,
    ) is None
    assert instance.subagent_start(
        parent_session_id="parent",
        child_session_id="child",
        child_role="researcher",
        child_goal="private goal",
    ) is None
    assert instance.subagent_stop(
        parent_session_id="parent",
        child_session_id="child",
        child_role="researcher",
        child_status="completed",
        child_summary="private summary",
        tool_call_history=[{"args": "private"}],
        duration_ms=50,
    ) is None

    encoded = str(drain(instance))
    for private in ("private prompt", "private history", "private request", "private response", "private assistant", "private goal", "private summary"):
        assert private not in encoded


def test_batch_retry_spool_is_bounded_and_reuses_deterministic_ids():
    sent = []
    failures = {"remaining": 1}

    def sender(payload):
        if failures["remaining"]:
            failures["remaining"] -= 1
            raise RuntimeError("offline")
        sent.append(payload)

    spool = observer.MemorySpool(capacity=2)
    instance = observer.HermesShadowObserver(config(batch_size=2, spool_capacity=2), spool=spool, sender=sender)
    for index in range(3):
        instance.pre_tool_call(tool_name="terminal", args={}, tool_call_id=f"call-{index}")
        instance.post_tool_call(tool_name="terminal", args={}, tool_call_id=f"call-{index}", status="ok")

    assert instance.flush_once() is False
    first_ids = [event["event_id"] for event in spool.events]
    assert len(first_ids) == 2
    assert instance.flush_once() is True
    assert [event["event_id"] for event in sent[0]["events"]] == first_ids
    assert sent[0]["tenant_id"] == "tenant-a"
    assert sent[0]["source_id"] == "hermes-prod"


def test_queue_overflow_is_counted_without_raising_or_blocking():
    instance = observer.HermesShadowObserver(config(queue_capacity=10))
    started = time.monotonic()
    for index in range(20):
        instance.pre_tool_call(tool_name="terminal", args={}, tool_call_id=f"call-{index}")
        instance.post_tool_call(tool_name="terminal", args={}, tool_call_id=f"call-{index}", status="ok")
    assert instance.dropped_events == 10
    assert time.monotonic() - started < 1


def test_close_preserves_all_pending_events_when_export_is_unavailable():
    spool = observer.MemorySpool(capacity=10)

    def unavailable(_payload):
        raise RuntimeError("offline")

    instance = observer.HermesShadowObserver(
        config(batch_size=2, queue_capacity=10, spool_capacity=10),
        spool=spool,
        sender=unavailable,
    )
    for index in range(3):
        instance.pre_api_request(session_id="session-1", api_request_id=f"api-{index}")

    instance.close()

    assert [event["correlation"]["api_request_id"] for event in spool.load()] == ["api-0", "api-1", "api-2"]
