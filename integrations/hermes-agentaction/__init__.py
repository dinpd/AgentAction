"""Hermes Agent registration for AgentAction shadow observability."""

from __future__ import annotations

import atexit
import logging
import os
from typing import Any

from .observer import HermesShadowObserver, ObserverConfig, StateSpool


_observer: HermesShadowObserver | None = None
_logger = logging.getLogger(__name__)


def register(ctx: Any) -> None:
    """Register privacy-safe, fail-open observer callbacks with Hermes."""
    global _observer

    tenant_id = ctx.get_config("tenant_id", default="")
    token = os.environ.get("AGENTACTION_INGEST_TOKEN", "")
    if not str(tenant_id or "").strip() or not token.strip():
        _logger.warning(
            "AgentAction observability is not configured; set tenant_id and "
            "AGENTACTION_INGEST_TOKEN, then restart Hermes"
        )
        return

    config = ObserverConfig.from_mapping(
        {
            "endpoint": ctx.get_config("endpoint", default="https://gateway.agentaction.dev"),
            "tenant_id": tenant_id,
            "source_id": ctx.get_config("source_id", default="hermes"),
            "agent_id": ctx.get_config("agent_id", default="hermes-agent"),
            "intent_id": ctx.get_config("intent_id", default=""),
            "intent_digest": ctx.get_config("intent_digest", default=""),
            "tool_policies": ctx.get_config("tool_policies", default={}),
            "batch_size": ctx.get_config("batch_size", default=25),
            "flush_interval_seconds": ctx.get_config("flush_interval_seconds", default=2.0),
            "queue_capacity": ctx.get_config("queue_capacity", default=1000),
            "spool_capacity": ctx.get_config("spool_capacity", default=500),
            "token": token,
        }
    )
    _observer = HermesShadowObserver(
        config,
        spool=StateSpool(ctx.state, config.spool_capacity),
        job_spool=StateSpool(ctx.state, config.spool_capacity, key="job_retry_spool_v1"),
    )
    _observer.start()
    atexit.register(_observer.close)

    ctx.register_hook("pre_tool_call", _observer.pre_tool_call)
    ctx.register_hook("post_tool_call", _observer.post_tool_call)
    ctx.register_hook("pre_api_request", _observer.pre_api_request)
    ctx.register_hook("post_api_request", _observer.post_api_request)
    ctx.register_hook("api_request_error", _observer.api_request_error)
    ctx.register_hook("on_session_start", _observer.on_session_start)
    ctx.register_hook("pre_llm_call", _observer.pre_llm_call)
    ctx.register_hook("on_session_end", _observer.on_session_end)
    ctx.register_hook("on_session_finalize", _observer.on_session_finalize)
    ctx.register_hook("subagent_start", _observer.subagent_start)
    ctx.register_hook("subagent_stop", _observer.subagent_stop)


__all__ = ["register"]
