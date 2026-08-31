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
VALID_DECISIONS = {"allow", "deny", "challenge_required"}
VALID_EXECUTION_STATUSES = {"ok", "error", "blocked", "cancelled", "unknown"}


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
    ) -> None:
        self.config = config
        self.spool = spool or MemorySpool(config.spool_capacity)
        self.sender = sender or self._send_http
        self.events: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=config.queue_capacity)
        self._pending: dict[str, dict[str, Any]] = {}
        self._tool_counts: defaultdict[tuple[str, str], int] = defaultdict(int)
        self._fingerprint_counts: defaultdict[tuple[str, str, str], int] = defaultdict(int)
        self._lock = threading.Lock()
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

    def flush_once(self) -> bool:
        existing = self.spool.load()
        drained: list[dict[str, Any]] = []
        while len(drained) < self.config.batch_size:
            try:
                drained.append(self.events.get_nowait())
            except queue.Empty:
                break
        combined = (existing + drained)[: self.config.batch_size]
        remainder = (existing + drained)[self.config.batch_size :]
        if not combined:
            return True
        payload = {
            "schema_version": BATCH_SCHEMA_VERSION,
            "batch_id": _batch_id(combined),
            "tenant_id": self.config.tenant_id,
            "source_id": self.config.source_id,
            "sent_at": _now(),
            "events": combined,
        }
        try:
            self.sender(payload)
        except Exception:
            self.spool.save(existing + drained)
            return False
        self.spool.save(remainder)
        return True

    def _worker(self) -> None:
        while not self._stop.is_set():
            self._wake.wait(self.config.flush_interval_seconds)
            self._wake.clear()
            try:
                self.flush_once()
            except Exception:
                pass
        try:
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

    def _finish_event(self, event: dict[str, Any]) -> dict[str, Any]:
        material = {
            "source_id": event["source_id"],
            "event_type": event["event_type"],
            "correlation": event["correlation"],
            "tool": event.get("tool"),
            "observed_at": event["observed_at"] if not event["correlation"] else None,
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
                "user-agent": "agentaction-hermes/0.6.0",
                "x-agentaction-source-id": self.config.source_id,
            },
        )
        try:
            with request.urlopen(req, timeout=5) as response:
                if response.status < 200 or response.status >= 300:
                    raise RuntimeError(f"AgentAction ingestion returned HTTP {response.status}")
        except error.HTTPError as exc:
            raise RuntimeError(f"AgentAction ingestion returned HTTP {exc.code}") from exc


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
    return result


def _batch_id(events: list[dict[str, Any]]) -> str:
    ids = [str(event.get("event_id") or "") for event in events]
    return f"batch_{hashlib.sha256(_canonical_json(ids).encode()).hexdigest()[:32]}"


def _action_for(policy: Mapping[str, Any]) -> str:
    action = _safe_code(policy.get("action"))
    return action or "unknown"


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, default=str)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


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
