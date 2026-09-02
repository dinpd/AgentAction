"""Fail-open Hermes observer and bounded AgentAction batch exporter.

The module intentionally depends only on the Python standard library so a
Hermes plugin install does not mutate the agent's managed environment.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
import hashlib
import json
import queue
import threading
import time
from typing import Any, Callable, Mapping, Protocol
from urllib import error, request


SCHEMA_VERSION = "agentaction.hermes-observation.v1"
BATCH_SCHEMA_VERSION = "agentaction.observation-batch.v1"
JOB_SCHEMA_VERSION = "agentaction.activity-job.v1"
DECLARED_INTENT_SCHEMA_VERSION = "agentaction.declared-intent.v1"
REPORTED_OUTCOME_SCHEMA_VERSION = "agentaction.reported-outcome.v1"
MODEL_USAGE_MAX_REQUESTS = 10_000
MODEL_USAGE_MAX_MODELS = 20
VALID_DECISIONS = {"allow", "deny", "challenge_required"}
VALID_EXECUTION_STATUSES = {"ok", "error", "blocked", "cancelled", "unknown"}
DECLARED_INTENT_CONTEXT = (
    "AgentAction intent capture is enabled for observability only; it does not authorize actions. "
    "Before substantive work, call agentaction_declare_intent once with a concise goal, measurable "
    "success criteria, constraints, and confidence. Before the final answer, call "
    "agentaction_report_outcome once with the terminal status and self-assessment. Never include "
    "secrets, personal data, raw prompt text, tool arguments/results, or the final response."
)

DECLARE_INTENT_TOOL_SCHEMA = {
    "name": "agentaction_declare_intent",
    "description": "Declare a concise, non-authoritative intent summary for AgentAction observability.",
    "parameters": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "goal": {"type": "string", "minLength": 1, "maxLength": 500},
            "success_criteria": {
                "type": "array",
                "minItems": 1,
                "maxItems": 8,
                "items": {"type": "string", "minLength": 1, "maxLength": 240},
            },
            "constraints": {
                "type": "array",
                "maxItems": 8,
                "items": {"type": "string", "minLength": 1, "maxLength": 240},
            },
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        },
        "required": ["goal", "success_criteria", "constraints", "confidence"],
    },
}

REPORT_OUTCOME_TOOL_SCHEMA = {
    "name": "agentaction_report_outcome",
    "description": "Report a non-authoritative, self-attested terminal outcome for the declared intent.",
    "parameters": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "status": {"type": "string", "enum": ["achieved", "partial", "failed", "unknown"]},
            "success_criteria_met": {"type": "string", "enum": ["all", "some", "none", "unknown"]},
            "constraints_respected": {"type": "string", "enum": ["pass", "fail", "unknown"]},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        },
        "required": ["status", "success_criteria_met", "constraints_respected", "confidence"],
    },
}


class PluginState(Protocol):
    def get(self, key: str, default: Any = None) -> Any: ...
    def set(self, key: str, value: Any) -> None: ...


class Spool(Protocol):
    def load(self) -> list[dict[str, Any]]: ...
    def save(self, events: list[dict[str, Any]]) -> None: ...


@dataclass(frozen=True)
class ObserverConfig:
    endpoint: str
    tenant_id: str
    source_id: str
    agent_id: str
    token: str
    intent_id: str = ""
    intent_digest: str = ""
    capture_declared_intent: bool = False
    tool_policies: Mapping[str, Mapping[str, Any]] = field(default_factory=dict)
    batch_size: int = 25
    flush_interval_seconds: float = 2.0
    queue_capacity: int = 1000
    spool_capacity: int = 500

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> "ObserverConfig":
        endpoint = str(value.get("endpoint") or "").strip().rstrip("/")
        tenant_id = _identifier(value.get("tenant_id"), "tenant_id")
        source_id = _identifier(value.get("source_id"), "source_id")
        agent_id = _identifier(value.get("agent_id"), "agent_id")
        token = str(value.get("token") or "").strip()
        if not endpoint.startswith("https://") and not endpoint.startswith("http://127.0.0.1") and not endpoint.startswith("http://localhost"):
            raise ValueError("endpoint must use HTTPS or a loopback HTTP origin")
        if not token:
            raise ValueError("AGENTACTION_INGEST_TOKEN is required")
        intent_id = str(value.get("intent_id") or "").strip()
        intent_digest = str(value.get("intent_digest") or "").strip()
        if bool(intent_id) != bool(intent_digest):
            raise ValueError("intent_id and intent_digest must be configured together")
        policies = value.get("tool_policies")
        if not isinstance(policies, Mapping):
            policies = {}
        return cls(
            endpoint=endpoint,
            tenant_id=tenant_id,
            source_id=source_id,
            agent_id=agent_id,
            token=token,
            intent_id=_bounded(intent_id, 160),
            intent_digest=_bounded(intent_digest, 160),
            capture_declared_intent=_boolean(value.get("capture_declared_intent"), False),
            tool_policies={str(name): policy for name, policy in policies.items() if isinstance(policy, Mapping)},
            batch_size=_bounded_int(value.get("batch_size"), 25, 1, 100),
            flush_interval_seconds=_bounded_float(value.get("flush_interval_seconds"), 2.0, 0.1, 60.0),
            queue_capacity=_bounded_int(value.get("queue_capacity"), 1000, 10, 10_000),
            spool_capacity=_bounded_int(value.get("spool_capacity"), 500, 10, 5_000),
        )


class StateSpool:
    """Bounded retry spool backed by Hermes's profile-scoped plugin state."""

    def __init__(self, state: PluginState, capacity: int, key: str = "retry_spool_v1") -> None:
        self.state = state
        self.capacity = capacity
        self.key = key

    def load(self) -> list[dict[str, Any]]:
        value = self.state.get(self.key, default=[])
        if not isinstance(value, list):
            return []
        return [event for event in value[-self.capacity :] if isinstance(event, dict)]

    def save(self, events: list[dict[str, Any]]) -> None:
        self.state.set(self.key, events[-self.capacity :])


class MemorySpool:
    """Small test/local fallback with the same bounded semantics."""

    def __init__(self, capacity: int = 500) -> None:
        self.capacity = capacity
        self.events: list[dict[str, Any]] = []

    def load(self) -> list[dict[str, Any]]:
        return list(self.events)

    def save(self, events: list[dict[str, Any]]) -> None:
        self.events = list(events[-self.capacity :])


class HermesShadowObserver:
    """Normalize Hermes hooks without returning behavior-changing directives."""

    def __init__(
        self,
        config: ObserverConfig,
        *,
        spool: Spool | None = None,
        sender: Callable[[dict[str, Any]], None] | None = None,
        job_spool: Spool | None = None,
        job_sender: Callable[[dict[str, Any]], Mapping[str, Any]] | None = None,
    ) -> None:
        self.config = config
        self.spool = spool or MemorySpool(config.spool_capacity)
        self.sender = sender or self._send_http
        self.job_spool = job_spool or MemorySpool(config.spool_capacity)
        self.job_sender = job_sender or self._send_job_http
        self.events: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=config.queue_capacity)
        self.jobs: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=config.queue_capacity)
        self._pending: dict[str, dict[str, Any]] = {}
        self._run_started_at: dict[str, str] = {}
        self._run_correlations: dict[str, dict[str, str]] = {}
        self._active_runs: dict[tuple[str, str, str], str] = {}
        self._run_bindings: dict[str, dict[str, str]] = {}
        self._declared_intents: dict[str, dict[str, Any]] = {}
        self._reported_outcomes: dict[str, dict[str, Any]] = {}
        self._run_model_usage: dict[str, dict[str, Any]] = {}
        self._seen_model_requests: defaultdict[str, set[str]] = defaultdict(set)
        self._model_request_sequence = 0
        self._declared_started_runs: set[str] = set()
        self._started_runs: set[str] = set()
        self._completed_runs: set[str] = set()
        self._finalized_sessions: set[str] = set()
        self._tool_counts: defaultdict[tuple[str, str], int] = defaultdict(int)
        self._fingerprint_counts: defaultdict[tuple[str, str, str], int] = defaultdict(int)
        self._lock = threading.Lock()
        self._event_id_lock = threading.Lock()
        self._event_sequence = 0
        self._stop = threading.Event()
        self._wake = threading.Event()
        self._thread: threading.Thread | None = None
        self.dropped_events = 0

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._worker, name="agentaction-hermes-export", daemon=True)
        self._thread.start()

    def close(self) -> None:
        self._stop.set()
        self._wake.set()
        thread = self._thread
        if thread and thread.is_alive() and thread is not threading.current_thread():
            thread.join(timeout=min(2.0, self.config.flush_interval_seconds + 0.5))
        try:
            pending_jobs = self.jobs.qsize() + len(self.job_spool.load())
            maximum_job_flushes = max(1, pending_jobs)
            for _ in range(maximum_job_flushes):
                if not self.flush_jobs_once():
                    break
                if self.jobs.empty() and not self.job_spool.load():
                    break
            pending_count = self.events.qsize() + len(self.spool.load())
            maximum_flushes = max(
                1,
                (pending_count + self.config.batch_size - 1) // self.config.batch_size,
            )
            for _ in range(maximum_flushes):
                if not self.flush_once():
                    break
                if self.events.empty() and not self.spool.load():
                    break
        except Exception:
            pass
        pending_jobs = self.job_spool.load()
        while True:
            try:
                pending_jobs.append(self.jobs.get_nowait())
            except queue.Empty:
                break
        self.job_spool.save(pending_jobs)
        pending = self.spool.load()
        while True:
            try:
                pending.append(self.events.get_nowait())
            except queue.Empty:
                break
        self.spool.save(pending)

    def pre_tool_call(self, **kwargs: Any) -> None:
        """Evaluate counterfactually, remember the result, and never direct Hermes."""
        try:
            tool_name = _bounded(kwargs.get("tool_name"), 160)
            correlation = _correlation(kwargs)
            key = _tool_key(tool_name, kwargs.get("args"), correlation)
            evaluation = self._evaluate_tool(tool_name, kwargs.get("args"), correlation)
            with self._lock:
                self._pending[key] = evaluation
        except Exception:
            pass
        return None

    def post_tool_call(self, **kwargs: Any) -> None:
        try:
            tool_name = _bounded(kwargs.get("tool_name"), 160)
            correlation = _correlation(kwargs)
            key = _tool_key(tool_name, kwargs.get("args"), correlation)
            with self._lock:
                evaluation = self._pending.pop(key, None)
            if evaluation is None:
                evaluation = {
                    "status": "skipped",
                    "decision": None,
                    "findings": ["pre_tool_observation_missing"],
                    "action": _action_for(self.config.tool_policies.get(tool_name, {})),
                }
            execution_status = str(kwargs.get("status") or "unknown")
            if execution_status not in VALID_EXECUTION_STATUSES:
                execution_status = "unknown"
            event = self._base_event("tool_action", correlation)
            event.update(
                {
                    "tool": {"name": tool_name, "action": evaluation.get("action") or "unknown"},
                    "evaluation": {
                        "status": evaluation["status"],
                        "counterfactual_decision": evaluation.get("decision"),
                        "findings": evaluation["findings"],
                    },
                    "execution": {
                        "status": execution_status,
                        "duration_ms": _nonnegative_number(kwargs.get("duration_ms")),
                        **({"error_type": _safe_code(kwargs.get("error_type"))} if _safe_code(kwargs.get("error_type")) else {}),
                    },
                }
            )
            self._submit(self._finish_event(event))
        except Exception:
            pass
        return None

    def pre_api_request(self, **kwargs: Any) -> None:
        try:
            event = self._base_event("model_request_started", _correlation(kwargs))
            event["model"] = _model_metadata(kwargs)
            event["request"] = {
                "api_call_count": _nonnegative_integer(kwargs.get("api_call_count")),
                "approx_input_tokens": _nonnegative_integer(kwargs.get("approx_input_tokens")),
                "tool_count": _nonnegative_integer(kwargs.get("tool_count")),
            }
            self._submit(self._finish_event(event))
        except Exception:
            pass
        return None

    def post_api_request(self, **kwargs: Any) -> None:
        try:
            event = self._base_event("model_request_completed", _correlation(kwargs))
            event["model"] = _model_metadata(kwargs)
            event["execution"] = {"status": "ok", "duration_ms": _seconds_to_milliseconds(kwargs.get("api_duration"))}
            event["usage"] = _usage_metadata(kwargs.get("usage"))
            self._record_model_request(kwargs, event["model"], event["usage"])
            self._submit(self._finish_event(event))
        except Exception:
            pass
        return None

    def api_request_error(self, **kwargs: Any) -> None:
        try:
            event = self._base_event("model_request_completed", _correlation(kwargs))
            event["model"] = _model_metadata(kwargs)
            event["execution"] = {
                "status": "error",
                "duration_ms": _seconds_to_milliseconds(kwargs.get("api_duration")),
                **({"error_type": _safe_code(_mapping(kwargs.get("error")).get("type"))} if _safe_code(_mapping(kwargs.get("error")).get("type")) else {}),
            }
            self._record_model_request(kwargs, event["model"], {})
            self._submit(self._finish_event(event))
        except Exception:
            pass
        return None

    def subagent_start(self, **kwargs: Any) -> None:
        self._subagent_event("subagent_started", "running", kwargs)
        return None

    def subagent_stop(self, **kwargs: Any) -> None:
        self._subagent_event("subagent_completed", _safe_code(kwargs.get("child_status")) or "unknown", kwargs)
        return None

    def on_session_start(self, **kwargs: Any) -> None:
        try:
            session_id = _activity_id(kwargs.get("session_id"), "session_id")
            event = self._base_event("session_started", {"session_id": session_id})
            event["execution"] = {"status": "running"}
            self._submit(self._finish_event(event))
        except Exception:
            pass
        return None

    def pre_llm_call(self, **kwargs: Any) -> dict[str, str] | None:
        try:
            correlation = _run_correlation(kwargs)
            run_key = _run_key(correlation)
            started_at = _date_time(kwargs.get("started_at")) or _now()
            with self._lock:
                if run_key in self._started_runs:
                    return None
                self._started_runs.add(run_key)
                self._run_started_at[run_key] = started_at
                self._run_correlations[run_key] = dict(correlation)
                self._active_runs[
                    (
                        correlation["session_id"],
                        correlation.get("task_id", ""),
                        correlation.get("turn_id", ""),
                    )
                ] = run_key
            if not self.config.intent_id and not self.config.capture_declared_intent:
                self._submit_job(self._job_lifecycle("started", correlation, started_at))
            event = self._base_event("job_started", correlation)
            event["execution"] = {"status": "running"}
            self._submit(self._finish_event(event))
            if self.config.capture_declared_intent and not self.config.intent_id:
                return {"context": DECLARED_INTENT_CONTEXT}
        except Exception:
            pass
        return None

    def declare_intent(self, args: Mapping[str, Any], **kwargs: Any) -> str:
        """Capture the first bounded declaration for the active run without blocking Hermes."""
        try:
            declaration = _declared_intent(args)
            run_key, correlation, started_at = self._active_run(kwargs)
            with self._lock:
                existing = self._declared_intents.get(run_key)
                if existing is not None:
                    if existing == declaration:
                        return _tool_response("captured", "agent_declared", replayed=True)
                    return _tool_response("rejected", error="intent_already_declared")
                self._declared_intents[run_key] = declaration
                self._declared_started_runs.add(run_key)
            self._submit_job(
                self._job_lifecycle(
                    "started",
                    correlation,
                    started_at,
                    declared_intent=declaration,
                )
            )
            return _tool_response("captured", "agent_declared")
        except Exception:
            return _tool_response("rejected", error="invalid_declared_intent")

    def report_outcome(self, args: Mapping[str, Any], **kwargs: Any) -> str:
        """Capture the first bounded self-attested outcome for the active run."""
        try:
            outcome = _reported_outcome(args)
            run_key, _correlation_value, _started_at = self._active_run(kwargs)
            with self._lock:
                if run_key not in self._declared_intents:
                    return _tool_response("rejected", error="intent_not_declared")
                existing = self._reported_outcomes.get(run_key)
                if existing is not None:
                    if existing == outcome:
                        return _tool_response("captured", "agent_self_attested", replayed=True)
                    return _tool_response("rejected", error="outcome_already_reported")
                self._reported_outcomes[run_key] = outcome
            return _tool_response("captured", "agent_self_attested")
        except Exception:
            return _tool_response("rejected", error="invalid_reported_outcome")

    def on_session_end(self, **kwargs: Any) -> None:
        self._complete_run(kwargs)
        return None

    def on_session_finalize(self, **kwargs: Any) -> None:
        try:
            session_id = _activity_id(kwargs.get("session_id"), "session_id")
            with self._lock:
                if session_id in self._finalized_sessions:
                    return None
                self._finalized_sessions.add(session_id)
            event = self._base_event("session_completed", {"session_id": session_id})
            event["execution"] = {"status": "ok"}
            self._submit(self._finish_event(event))
            self._wake.set()
        except Exception:
            pass
        return None

    def flush_once(self) -> bool:
        existing = self.spool.load()
        drained: list[dict[str, Any]] = []
        while len(drained) < self.config.batch_size:
            try:
                drained.append(self.events.get_nowait())
            except queue.Empty:
                break
        pending = _deduplicate_events(existing + drained)
        combined = pending[: self.config.batch_size]
        remainder = pending[self.config.batch_size :]
        if not combined:
            return True
        bound = [self._bind_run_event(event) for event in combined]
        payload = {
            "schema_version": BATCH_SCHEMA_VERSION,
            "batch_id": _batch_id(bound),
            "tenant_id": self.config.tenant_id,
            "source_id": self.config.source_id,
            "sent_at": _now(),
            "events": bound,
        }
        try:
            self.sender(payload)
        except Exception:
            self.spool.save(pending)
            return False
        self.spool.save(remainder)
        return True

    def flush_jobs_once(self) -> bool:
        existing = self.job_spool.load()
        drained: list[dict[str, Any]] = []
        while len(drained) < self.config.batch_size:
            try:
                drained.append(self.jobs.get_nowait())
            except queue.Empty:
                break
        combined = (existing + drained)[: self.config.batch_size]
        remainder = (existing + drained)[self.config.batch_size :]
        if not combined:
            return True
        for index, lifecycle in enumerate(combined):
            try:
                response = self.job_sender(lifecycle)
                self._remember_run_binding(lifecycle, response)
            except Exception:
                self.job_spool.save(combined[index:] + remainder)
                return False
        self.job_spool.save(remainder)
        return True

    def _worker(self) -> None:
        while not self._stop.is_set():
            self._wake.wait(self.config.flush_interval_seconds)
            self._wake.clear()
            try:
                self.flush_jobs_once()
                self.flush_once()
            except Exception:
                pass
        try:
            self.flush_jobs_once()
            self.flush_once()
        except Exception:
            pass

    def _submit(self, event: dict[str, Any]) -> None:
        try:
            self.events.put_nowait(event)
            if self.events.qsize() >= self.config.batch_size:
                self._wake.set()
        except queue.Full:
            self.dropped_events += 1

    def _submit_job(self, lifecycle: dict[str, Any]) -> None:
        try:
            self.jobs.put_nowait(lifecycle)
            self._wake.set()
        except queue.Full:
            self.dropped_events += 1

    def _evaluate_tool(self, tool_name: str, args: Any, correlation: Mapping[str, str]) -> dict[str, Any]:
        policy = self.config.tool_policies.get(tool_name)
        if not isinstance(policy, Mapping):
            return {"status": "unmapped", "decision": None, "findings": ["tool_not_mapped"], "action": "unknown"}
        action = _action_for(policy)
        decision = str(policy.get("decision") or "allow")
        if decision not in VALID_DECISIONS:
            decision = "allow"
        findings: list[str] = []
        if policy.get("blocked") is True:
            decision = "deny"
            findings.append("tool_blocked_by_policy")
        elif policy.get("requires_approval") is True and decision == "allow":
            decision = "challenge_required"
            findings.append("approval_required")

        task_key = correlation.get("task_id") or correlation.get("session_id") or "unknown"
        fingerprint = hashlib.sha256(_canonical_json(args if isinstance(args, Mapping) else {}).encode()).hexdigest()
        with self._lock:
            tool_counter = (task_key, tool_name)
            fingerprint_counter = (task_key, tool_name, fingerprint)
            self._tool_counts[tool_counter] += 1
            self._fingerprint_counts[fingerprint_counter] += 1
            tool_count = self._tool_counts[tool_counter]
            identical_count = self._fingerprint_counts[fingerprint_counter]
        max_calls = _optional_positive_int(policy.get("max_calls_per_task"))
        max_identical = _optional_positive_int(policy.get("max_identical_calls_per_task"))
        if max_calls is not None and tool_count > max_calls:
            decision = "deny"
            findings.append("tool_call_budget_exceeded")
        if max_identical is not None and identical_count > max_identical:
            decision = "deny"
            findings.append("identical_tool_call_budget_exceeded")
        return {"status": "evaluated", "decision": decision, "findings": findings, "action": action}

    def _base_event(self, event_type: str, correlation: Mapping[str, str]) -> dict[str, Any]:
        intent_bound = bool(self.config.intent_id and self.config.intent_digest)
        return {
            "schema_version": SCHEMA_VERSION,
            "event_type": event_type,
            "observed_at": _now(),
            "source_id": self.config.source_id,
            "agent_id": self.config.agent_id,
            "correlation": dict(correlation),
            "intent": {
                "binding_status": "bound" if intent_bound else "unbound",
                **({"intent_id": self.config.intent_id, "intent_digest": self.config.intent_digest} if intent_bound else {}),
            },
        }

    def _complete_run(self, kwargs: Mapping[str, Any]) -> None:
        try:
            correlation = _run_correlation(kwargs)
            run_key = _run_key(correlation)
            with self._lock:
                if run_key in self._completed_runs:
                    return
                self._completed_runs.add(run_key)
                started_at = self._run_started_at.get(run_key)
                declaration = self._declared_intents.get(run_key)
                outcome = self._reported_outcomes.get(run_key)
                declared_started = run_key in self._declared_started_runs
                model_usage = self._model_usage_summary_locked(run_key)
            completed_at = _date_time(kwargs.get("completed_at")) or _now()
            started_at = started_at or _date_time(kwargs.get("started_at")) or completed_at
            interrupted = kwargs.get("interrupted") is True
            failed = kwargs.get("failed") is True
            completed = kwargs.get("completed") is True and not interrupted and not failed
            reason = _safe_code(kwargs.get("turn_exit_reason") or kwargs.get("reason"))
            status = "completed" if completed else "interrupted" if interrupted else "error" if failed else "incomplete"
            if not self.config.intent_id:
                if self.config.capture_declared_intent and declaration is None:
                    self._submit_job(self._job_lifecycle("started", correlation, started_at))
                elif declaration is not None and not declared_started:
                    self._submit_job(
                        self._job_lifecycle(
                            "started",
                            correlation,
                            started_at,
                            declared_intent=declaration,
                        )
                    )
                self._submit_job(
                    self._job_lifecycle(
                        "completed",
                        correlation,
                        started_at,
                        completed_at,
                        status,
                        declared_intent=declaration,
                        reported_outcome=outcome,
                        model_usage=model_usage,
                    )
                )
            event = self._base_event("job_completed", correlation)
            event["execution"] = {
                "status": "ok" if completed else "cancelled" if interrupted else "error" if status == "error" else "unknown",
                "duration_ms": _duration_ms(started_at, completed_at),
                **({"error_type": reason} if reason else {}),
            }
            self._submit(self._finish_event(event))
            with self._lock:
                self._run_model_usage.pop(run_key, None)
                self._seen_model_requests.pop(run_key, None)
        except Exception:
            pass

    def _job_lifecycle(
        self,
        phase: str,
        correlation: Mapping[str, str],
        started_at: str,
        completed_at: str = "",
        status: str = "",
        declared_intent: Mapping[str, Any] | None = None,
        reported_outcome: Mapping[str, Any] | None = None,
        model_usage: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        return {
            "schema_version": JOB_SCHEMA_VERSION,
            "phase": phase,
            "tenant_id": self.config.tenant_id,
            "source_id": self.config.source_id,
            "agent_id": self.config.agent_id,
            "session_id": correlation["session_id"],
            **({"task_id": correlation["task_id"]} if correlation.get("task_id") else {}),
            **({"turn_id": correlation["turn_id"]} if correlation.get("turn_id") else {}),
            "started_at": started_at,
            **({"declared_intent": dict(declared_intent)} if declared_intent is not None else {}),
            **({"reported_outcome": dict(reported_outcome)} if reported_outcome is not None else {}),
            **({"model_usage": dict(model_usage)} if model_usage is not None else {}),
            **({"completed_at": completed_at, "status": status} if phase == "completed" else {}),
        }

    def _record_model_request(
        self,
        kwargs: Mapping[str, Any],
        model: Mapping[str, Any],
        usage: Mapping[str, Any],
    ) -> None:
        try:
            run_key, _correlation_value, _started_at = self._active_run(kwargs)
        except Exception:
            return
        request_id = _bounded(kwargs.get("api_request_id"), 160)
        api_call_count = _nonnegative_integer(kwargs.get("api_call_count"))
        with self._lock:
            if request_id:
                dedupe_key = f"id:{request_id}"
            elif api_call_count is not None:
                dedupe_key = f"count:{api_call_count}"
            else:
                self._model_request_sequence += 1
                dedupe_key = f"sequence:{self._model_request_sequence}"
            if dedupe_key in self._seen_model_requests[run_key]:
                return
            if len(self._seen_model_requests[run_key]) >= MODEL_USAGE_MAX_REQUESTS:
                existing = self._run_model_usage.get(run_key)
                if existing is not None:
                    existing["requests_truncated"] = True
                return
            self._seen_model_requests[run_key].add(dedupe_key)
            summary = self._run_model_usage.setdefault(
                run_key,
                {
                    "request_count": 0,
                    "requests_with_model": 0,
                    "requests_with_usage": 0,
                    "models": {},
                },
            )
            summary["request_count"] += 1
            provider = _bounded(model.get("provider"), 160)
            model_name = _bounded(model.get("model"), 160)
            has_model = bool(provider or model_name)
            has_usage = any(key in usage for key in ("input_tokens", "output_tokens", "total_tokens"))
            if has_model:
                summary["requests_with_model"] += 1
            if has_usage:
                summary["requests_with_usage"] += 1
            for key in ("input_tokens", "output_tokens", "total_tokens"):
                value = _nonnegative_integer(usage.get(key))
                if value is not None:
                    summary[key] = summary.get(key, 0) + value
            if not has_model:
                return
            model_key = (provider, model_name)
            models = summary["models"]
            group = models.get(model_key)
            if group is None:
                if len(models) >= MODEL_USAGE_MAX_MODELS:
                    summary["models_truncated"] = True
                    return
                group = {
                    **({"provider": provider} if provider else {}),
                    **({"model": model_name} if model_name else {}),
                    "request_count": 0,
                    "requests_with_usage": 0,
                }
                models[model_key] = group
            group["request_count"] += 1
            if has_usage:
                group["requests_with_usage"] += 1
            for key in ("input_tokens", "output_tokens", "total_tokens"):
                value = _nonnegative_integer(usage.get(key))
                if value is not None:
                    group[key] = group.get(key, 0) + value

    def _model_usage_summary_locked(self, run_key: str) -> dict[str, Any] | None:
        summary = self._run_model_usage.get(run_key)
        if not summary or summary["request_count"] == 0:
            return None
        models = sorted(
            summary["models"].values(),
            key=lambda item: (
                -item["request_count"],
                str(item.get("provider") or ""),
                str(item.get("model") or ""),
            ),
        )
        return {
            key: value
            for key, value in {
                **summary,
                "models": [dict(item) for item in models],
            }.items()
            if key != "models" or value
        }

    def _active_run(self, kwargs: Mapping[str, Any]) -> tuple[str, dict[str, str], str]:
        session_id = _activity_id(kwargs.get("session_id"), "session_id")
        task_id = _bounded(kwargs.get("task_id"), 160)
        turn_id = _bounded(kwargs.get("turn_id"), 160)
        with self._lock:
            run_key = self._active_runs.get((session_id, task_id, turn_id))
            direct_key = _run_key({
                "session_id": session_id,
                **({"task_id": task_id} if task_id else {}),
                **({"turn_id": turn_id} if turn_id else {}),
            })
            if run_key is None and direct_key in self._run_correlations:
                run_key = direct_key
            if run_key is None:
                candidates = [
                    key
                    for key, correlation in self._run_correlations.items()
                    if correlation["session_id"] == session_id
                    and (not task_id or correlation.get("task_id") == task_id)
                    and (not turn_id or correlation.get("turn_id") == turn_id)
                    and key not in self._completed_runs
                ]
                run_key = candidates[-1] if len(candidates) == 1 else None
            if run_key is None:
                raise ValueError("active run is unavailable")
            correlation = dict(self._run_correlations[run_key])
            started_at = self._run_started_at[run_key]
        return run_key, correlation, started_at

    def _remember_run_binding(self, lifecycle: Mapping[str, Any], response: Mapping[str, Any]) -> None:
        run_key = _run_key(_run_correlation(lifecycle))
        binding = {
            key: _bounded(response.get(key), 160)
            for key in ("job_id", "intent_id", "intent_digest")
        }
        if run_key and all(binding.values()):
            with self._lock:
                self._run_bindings[run_key] = binding

    def _bind_run_event(self, event: dict[str, Any]) -> dict[str, Any]:
        correlation = {
            key: _bounded(value, 160)
            for key, value in _mapping(event.get("correlation")).items()
            if key in {"session_id", "task_id", "turn_id"} and _bounded(value, 160)
        }
        if not correlation.get("session_id"):
            return event
        run_key = _run_key(correlation)
        with self._lock:
            binding = dict(self._run_bindings.get(run_key, {}))
        if not binding:
            return event
        return {
            **event,
            "correlation": {**_mapping(event.get("correlation")), "job_id": binding["job_id"]},
            "intent": {
                "binding_status": "bound",
                "intent_id": binding["intent_id"],
                "intent_digest": binding["intent_digest"],
            },
        }

    def _finish_event(self, event: dict[str, Any]) -> dict[str, Any]:
        with self._event_id_lock:
            self._event_sequence += 1
            sequence = self._event_sequence
        material = {
            "source_id": event["source_id"],
            "event_type": event["event_type"],
            "correlation": event["correlation"],
            "tool": event.get("tool"),
            "observed_at": event["observed_at"],
            "sequence": sequence,
        }
        event["event_id"] = f"obs_{hashlib.sha256(_canonical_json(material).encode()).hexdigest()[:32]}"
        return event

    def _subagent_event(self, event_type: str, status: str, kwargs: Mapping[str, Any]) -> None:
        try:
            correlation = _correlation(kwargs)
            correlation.update(
                {
                    key: value
                    for key in ("parent_session_id", "child_session_id", "parent_turn_id", "child_subagent_id")
                    if (value := _bounded(kwargs.get(key), 160))
                }
            )
            event = self._base_event(event_type, correlation)
            event["subagent"] = {
                "role": _bounded(kwargs.get("child_role"), 80) or "unknown",
                "status": status,
                **({"duration_ms": _nonnegative_number(kwargs.get("duration_ms"))} if kwargs.get("duration_ms") is not None else {}),
            }
            self._submit(self._finish_event(event))
        except Exception:
            pass

    def _send_http(self, payload: dict[str, Any]) -> None:
        body = _canonical_json(payload).encode("utf-8")
        url = (
            f"{self.config.endpoint}/tenants/{self.config.tenant_id}/activity/batches"
        )
        req = request.Request(
            url,
            data=body,
            method="POST",
            headers={
                "authorization": f"Bearer {self.config.token}",
                "content-type": "application/json",
                "user-agent": "agentaction-hermes/0.8.0",
                "x-agentaction-source-id": self.config.source_id,
            },
        )
        try:
            with request.urlopen(req, timeout=5) as response:
                if response.status < 200 or response.status >= 300:
                    raise RuntimeError(f"AgentAction ingestion returned HTTP {response.status}")
        except error.HTTPError as exc:
            raise RuntimeError(f"AgentAction ingestion returned HTTP {exc.code}") from exc

    def _send_job_http(self, payload: dict[str, Any]) -> Mapping[str, Any]:
        body = _canonical_json(payload).encode("utf-8")
        url = f"{self.config.endpoint}/tenants/{self.config.tenant_id}/activity/jobs"
        req = request.Request(
            url,
            data=body,
            method="POST",
            headers={
                "authorization": f"Bearer {self.config.token}",
                "content-type": "application/json",
                "user-agent": "agentaction-hermes/0.8.0",
                "x-agentaction-source-id": self.config.source_id,
            },
        )
        try:
            with request.urlopen(req, timeout=5) as response:
                if response.status < 200 or response.status >= 300:
                    raise RuntimeError(f"AgentAction job ingestion returned HTTP {response.status}")
                response_body = response.read(16_385)
                if len(response_body) > 16_384:
                    raise RuntimeError("AgentAction job ingestion response exceeds 16 KiB")
                value = json.loads(response_body.decode("utf-8"))
                if not isinstance(value, Mapping):
                    raise RuntimeError("AgentAction job ingestion returned an invalid response")
                return value
        except error.HTTPError as exc:
            raise RuntimeError(f"AgentAction job ingestion returned HTTP {exc.code}") from exc


def _declared_intent(value: Any) -> dict[str, Any]:
    fields = {"goal", "success_criteria", "constraints", "confidence"}
    submitted = _strict_tool_args(value, fields)
    return {
        "schema_version": DECLARED_INTENT_SCHEMA_VERSION,
        "goal": _required_text(submitted["goal"], 500),
        "success_criteria": _text_list(submitted["success_criteria"], 8, 240, minimum=1),
        "constraints": _text_list(submitted["constraints"], 8, 240),
        "confidence": _confidence(submitted["confidence"]),
    }


def _reported_outcome(value: Any) -> dict[str, Any]:
    fields = {"status", "success_criteria_met", "constraints_respected", "confidence"}
    submitted = _strict_tool_args(value, fields)
    status = _enum_value(submitted["status"], {"achieved", "partial", "failed", "unknown"})
    criteria = _enum_value(submitted["success_criteria_met"], {"all", "some", "none", "unknown"})
    constraints = _enum_value(submitted["constraints_respected"], {"pass", "fail", "unknown"})
    return {
        "schema_version": REPORTED_OUTCOME_SCHEMA_VERSION,
        "status": status,
        "success_criteria_met": criteria,
        "constraints_respected": constraints,
        "confidence": _confidence(submitted["confidence"]),
    }


def _strict_tool_args(value: Any, fields: set[str]) -> Mapping[str, Any]:
    if not isinstance(value, Mapping) or set(value) != fields:
        raise ValueError("tool arguments are invalid")
    return value


def _required_text(value: Any, maximum: int) -> str:
    if not isinstance(value, str):
        raise ValueError("text is invalid")
    normalized = value.strip()
    if not normalized or len(normalized) > maximum:
        raise ValueError("text is invalid")
    return normalized


def _text_list(value: Any, maximum_items: int, maximum_length: int, minimum: int = 0) -> list[str]:
    if not isinstance(value, list) or len(value) < minimum or len(value) > maximum_items:
        raise ValueError("text list is invalid")
    normalized = [_required_text(item, maximum_length) for item in value]
    if len(set(normalized)) != len(normalized):
        raise ValueError("text list contains duplicates")
    return normalized


def _confidence(value: Any) -> float | int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("confidence is invalid")
    number = float(value)
    if number != number or number < 0 or number > 1:
        raise ValueError("confidence is invalid")
    return int(number) if number.is_integer() else number


def _enum_value(value: Any, allowed: set[str]) -> str:
    if not isinstance(value, str) or value not in allowed:
        raise ValueError("enum is invalid")
    return value


def _tool_response(
    status: str,
    provenance: str = "",
    *,
    error: str = "",
    replayed: bool = False,
) -> str:
    return _canonical_json(
        {
            "status": status,
            **({"provenance": provenance} if provenance else {}),
            **({"error": error} if error else {}),
            **({"replayed": True} if replayed else {}),
        }
    )


def _tool_key(tool_name: str, args: Any, correlation: Mapping[str, str]) -> str:
    call_id = correlation.get("tool_call_id")
    if call_id:
        return call_id
    material = {
        "task_id": correlation.get("task_id"),
        "turn_id": correlation.get("turn_id"),
        "tool": tool_name,
        "args": args if isinstance(args, Mapping) else {},
    }
    return f"fallback_{hashlib.sha256(_canonical_json(material).encode()).hexdigest()}"


def _correlation(value: Mapping[str, Any]) -> dict[str, str]:
    result: dict[str, str] = {}
    for key in ("session_id", "task_id", "turn_id", "tool_call_id", "api_request_id"):
        normalized = _bounded(value.get(key), 160)
        if normalized:
            result[key] = normalized
    return result


def _run_correlation(value: Mapping[str, Any]) -> dict[str, str]:
    correlation = _correlation(value)
    session_id = _activity_id(correlation.get("session_id"), "session_id")
    return {
        "session_id": session_id,
        **({"task_id": correlation["task_id"]} if correlation.get("task_id") else {}),
        **({"turn_id": correlation["turn_id"]} if correlation.get("turn_id") else {}),
    }


def _run_key(correlation: Mapping[str, Any]) -> str:
    session_id = _activity_id(correlation.get("session_id"), "session_id")
    run_id = _bounded(correlation.get("turn_id") or correlation.get("task_id") or session_id, 160)
    return f"{session_id}:{run_id}"


def _model_metadata(value: Mapping[str, Any]) -> dict[str, Any]:
    return {
        key: normalized
        for key in ("model", "provider", "api_mode", "platform")
        if (normalized := _bounded(value.get(key), 160))
    }


def _usage_metadata(value: Any) -> dict[str, int]:
    usage = _mapping(value)
    result: dict[str, int] = {}
    for source, target in (
        ("input_tokens", "input_tokens"),
        ("prompt_tokens", "input_tokens"),
        ("output_tokens", "output_tokens"),
        ("completion_tokens", "output_tokens"),
        ("total_tokens", "total_tokens"),
    ):
        if target in result:
            continue
        number = _nonnegative_integer(usage.get(source))
        if number is not None:
            result[target] = number
    if "total_tokens" not in result and "input_tokens" in result and "output_tokens" in result:
        result["total_tokens"] = result["input_tokens"] + result["output_tokens"]
    return result


def _batch_id(events: list[dict[str, Any]]) -> str:
    ids = [str(event.get("event_id") or "") for event in events]
    return f"batch_{hashlib.sha256(_canonical_json(ids).encode()).hexdigest()[:32]}"


def _deduplicate_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for event in events:
        event_id = str(event.get("event_id") or "")
        if event_id and event_id in seen_ids:
            continue
        if event_id:
            seen_ids.add(event_id)
        result.append(event)
    return result


def _action_for(policy: Mapping[str, Any]) -> str:
    action = _safe_code(policy.get("action"))
    return action or "unknown"


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, default=str)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _date_time(value: Any) -> str:
    normalized = _bounded(value, 64)
    if not normalized:
        return ""
    try:
        datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    except ValueError:
        return ""
    return normalized


def _duration_ms(started_at: str, completed_at: str) -> float:
    try:
        started = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
        completed = datetime.fromisoformat(completed_at.replace("Z", "+00:00"))
        return max(0.0, (completed - started).total_seconds() * 1000)
    except ValueError:
        return 0.0


def _activity_id(value: Any, label: str) -> str:
    normalized = _bounded(value, 160)
    if not normalized or not normalized[0].isalnum() or any(
        character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._:-"
        for character in normalized
    ):
        raise ValueError(f"{label} is invalid")
    return normalized


def _identifier(value: Any, label: str) -> str:
    normalized = _bounded(value, 128)
    if not normalized or not normalized[0].isalnum() or any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._:-" for character in normalized):
        raise ValueError(f"{label} is invalid")
    return normalized


def _bounded(value: Any, maximum: int) -> str:
    return str(value or "").strip()[:maximum]


def _safe_code(value: Any) -> str:
    normalized = _bounded(value, 80)
    if not normalized or any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._:-" for character in normalized):
        return ""
    return normalized


def _bounded_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default
    return max(minimum, min(maximum, number))


def _bounded_float(value: Any, default: float, minimum: float, maximum: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = default
    return max(minimum, min(maximum, number))


def _boolean(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "on"}:
            return True
        if normalized in {"false", "0", "no", "off"}:
            return False
    raise ValueError("boolean setting is invalid")


def _optional_positive_int(value: Any) -> int | None:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _nonnegative_integer(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number >= 0 else None


def _nonnegative_number(value: Any) -> float | int | None:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number < 0 or number != number:
        return None
    return int(number) if number.is_integer() else number


def _seconds_to_milliseconds(value: Any) -> float | int | None:
    seconds = _nonnegative_number(value)
    if seconds is None:
        return None
    return _nonnegative_number(float(seconds) * 1000)
