from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import time

import yaml


ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "integrations" / "hermes-agentaction"


def load_observer_module():
    spec = importlib.util.spec_from_file_location("agentaction_hermes_observer", PLUGIN / "observer.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def load_plugin_module():
    spec = importlib.util.spec_from_file_location(
        "agentaction_hermes_plugin",
        PLUGIN / "__init__.py",
        submodule_search_locations=[str(PLUGIN)],
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


observer = load_observer_module()


def test_manifest_is_installable_by_current_hermes_release():
    manifest = yaml.safe_load((PLUGIN / "plugin.yaml").read_text(encoding="utf-8"))

    assert manifest["manifest_version"] == 1
    assert manifest["api_version"] == 1


def test_unconfigured_plugin_registration_is_inert(monkeypatch):
    monkeypatch.delenv("AGENTACTION_INGEST_TOKEN", raising=False)
    plugin = load_plugin_module()
    registered_hooks = []

    class Context:
        def get_config(self, _key, default=None):
            return default

        def register_hook(self, name, callback):
            registered_hooks.append((name, callback))

    assert plugin.register(Context()) is None
    assert registered_hooks == []
    assert plugin._observer is None


def test_configured_plugin_registers_observation_hooks(monkeypatch):
    monkeypatch.setenv("AGENTACTION_INGEST_TOKEN", "source-token")
    plugin = load_plugin_module()
    registered_hooks = []

    class State:
        values = {}

        def get(self, key, default=None):
            return self.values.get(key, default)

        def set(self, key, value):
            self.values[key] = value

    class Context:
        state = State()
        settings = {
            "endpoint": "https://gateway.example.test",
            "tenant_id": "tenant-a",
            "source_id": "hermes-smoke",
            "agent_id": "hermes-smoke-agent",
        }

        def get_config(self, key, default=None):
            return self.settings.get(key, default)

        def register_hook(self, name, callback):
            registered_hooks.append((name, callback))

    plugin.register(Context())
    assert [name for name, _callback in registered_hooks] == [
        "pre_tool_call",
        "post_tool_call",
        "pre_api_request",
        "post_api_request",
        "api_request_error",
        "on_session_start",
        "pre_llm_call",
        "on_session_end",
        "on_session_finalize",
        "subagent_start",
        "subagent_stop",
    ]
    assert plugin._observer is not None
    plugin._observer.close()


def test_session_lifecycle_creates_metadata_only_job_and_binds_activity():
    activity_payloads = []
    job_payloads = []

    def send_job(payload):
        job_payloads.append(payload)
        return {
            "job_id": "hermes_job_1",
            "intent_id": "intent_job_1",
            "intent_digest": "a" * 64,
        }

    instance = observer.HermesShadowObserver(
        config(),
        sender=activity_payloads.append,
        job_sender=send_job,
    )
    assert instance.on_session_start(
        session_id="session-1",
        started_at="2026-08-31T18:00:00.000Z",
        user_message="private prompt",
    ) is None
    assert instance.pre_llm_call(
        session_id="session-1",
        task_id="task-1",
        turn_id="turn-1",
        started_at="2026-08-31T18:00:00.000Z",
        user_message="private prompt",
    ) is None
    # Hermes can invoke the LLM hook more than once inside one turn. The run
    # still owns one immutable Job and one lifecycle-start Activity event.
    assert instance.pre_llm_call(
        session_id="session-1",
        task_id="task-1",
        turn_id="turn-1",
        started_at="2026-08-31T18:00:01.000Z",
    ) is None
    assert instance.on_session_end(
        session_id="session-1",
        task_id="task-1",
        turn_id="turn-1",
        completed=True,
        completed_at="2026-08-31T18:00:04.000Z",
        assistant_response="private response",
    ) is None
    assert instance.on_session_finalize(session_id="session-1", reason="shutdown") is None

    assert instance.flush_jobs_once() is True
    assert [payload["phase"] for payload in job_payloads] == ["started", "completed"]
    assert job_payloads[1]["status"] == "completed"
    serialized_jobs = str(job_payloads)
    assert "private prompt" not in serialized_jobs
    assert "private response" not in serialized_jobs
    assert instance.flush_once() is True

    [batch] = activity_payloads
    assert [event["event_type"] for event in batch["events"]] == [
        "session_started",
        "job_started",
        "job_completed",
        "session_completed",
    ]
    job_events = [event for event in batch["events"] if event["event_type"].startswith("job_")]
    assert all(event["correlation"]["job_id"] == "hermes_job_1" for event in job_events)
    assert all(event["intent"]["intent_id"] == "intent_job_1" for event in job_events)
    assert job_events[1]["execution"] == {"status": "ok", "duration_ms": 4000.0}
    assert "user_message" not in str(batch)
    assert "assistant_response" not in str(batch)


def test_session_job_delivery_retries_and_remains_fail_open():
    attempts = []

    def failing_sender(payload):
        attempts.append(payload)
        raise RuntimeError("offline")

    instance = observer.HermesShadowObserver(config(), job_sender=failing_sender)
    assert instance.pre_llm_call(session_id="session-retry", turn_id="turn-retry") is None
    assert instance.flush_jobs_once() is False
    assert len(instance.job_spool.load()) == 1

    instance.job_sender = lambda payload: {
        "job_id": "hermes_job_retry",
        "intent_id": "intent_job_retry",
        "intent_digest": "b" * 64,
    }
    assert instance.flush_jobs_once() is True
    assert instance.job_spool.load() == []


def test_explicit_semantic_intent_takes_precedence_over_observed_execution_job():
    job_payloads = []
    activity_payloads = []
    instance = observer.HermesShadowObserver(
        config(intent_id="intent-explicit", intent_digest="c" * 64),
        sender=activity_payloads.append,
        job_sender=lambda payload: job_payloads.append(payload) or {},
    )
    instance.pre_llm_call(session_id="session-explicit", turn_id="turn-explicit")
    instance.on_session_end(
        session_id="session-explicit",
        turn_id="turn-explicit",
        completed=True,
    )
    assert instance.flush_jobs_once() is True
    assert job_payloads == []
    assert instance.flush_once() is True
    assert all(
        event["intent"] == {
            "binding_status": "bound",
            "intent_id": "intent-explicit",
            "intent_digest": "c" * 64,
        }
        for event in activity_payloads[0]["events"]
    )


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
