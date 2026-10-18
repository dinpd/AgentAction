"""Opt-in hosted execution control, independent from fail-open observation."""
from __future__ import annotations

import json
import os
import time
from typing import Any
from urllib.parse import quote, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None  # Never forward execution or Access credentials to a redirect.


def _exact_numbers(value: Any) -> None:
    # Python integers have arbitrary precision; the hosted JavaScript runtime
    # does not. Never approve a rounded value and then dispatch the original.
    if isinstance(value, (int, float)) and abs(value) > 9007199254740991:
        raise ValueError("Numeric tool argument outside the shared JSON safe range")
    if isinstance(value, dict):
        for item in value.values():
            _exact_numbers(item)
    elif isinstance(value, list):
        for item in value:
            _exact_numbers(item)


class HermesExecutionAdapter:
    def __init__(self, ctx: Any):
        self.ctx = ctx
        self.error = ""
        self.origin = str(ctx.get_config("supervisor_endpoint", default="")).rstrip("/")
        self.workspace = str(ctx.get_config("supervisor_workspace", default=""))
        self.agent = str(ctx.get_config("supervisor_agent_id", default=""))
        self.token = os.environ.get("AGENTACTION_EXECUTION_TOKEN", "")
        self.limits = ctx.get_config("supervisor_limits", default={})
        parsed = urlsplit(self.origin)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
            self.error = "Configure an HTTPS supervisor origin without a path or credentials."
        if not self.workspace or not self.agent or not self.token.startswith("aae_"):
            self.error = "Configure supervisor_workspace, supervisor_agent_id and AGENTACTION_EXECUTION_TOKEN."
        self.opener = build_opener(_NoRedirect())

    def request(self, action: str, body: dict) -> dict:
        headers = {"Authorization": "Bearer " + self.token, "Content-Type": "application/json"}
        for env, header in (("AGENTACTION_ACCESS_CLIENT_ID", "CF-Access-Client-Id"), ("AGENTACTION_ACCESS_CLIENT_SECRET", "CF-Access-Client-Secret")):
            if os.environ.get(env):
                headers[header] = os.environ[env]
        url = f"{self.origin}/api/external-agents/{quote(self.workspace, safe='')}/{action}"
        payload = json.dumps({"agentId": self.agent, **body}, allow_nan=False).encode()
        if len(payload) > 24000:
            raise ValueError("Supervisor request too large")
        with self.opener.open(Request(url, data=payload, headers=headers, method="POST"), timeout=10) as response:
            raw = response.read(24001)
            if len(raw) > 24000:
                raise ValueError("Supervisor response too large")
            value = json.loads(raw)
            if not isinstance(value, dict) or value.get("error") or value.get("blocked"):
                raise ValueError("Supervisor blocked the action")
            return value

    def compatible(self) -> bool:
        # Hermes executes hooks inside or outside execution middleware depending
        # on entry point. Other policy hooks/wrappers could rewrite arguments or
        # swallow our block. This preview therefore requires exclusive control.
        from hermes_cli.plugins import get_plugin_manager
        manager = get_plugin_manager()
        wrappers = manager._middleware.get("tool_execution", [])
        hooks = manager._hooks.get("pre_tool_call", [])
        return wrappers == [self.execute] and all(getattr(h, "__module__", "") == __package__ + ".observer" for h in hooks)

    @staticmethod
    def block(message: str) -> str:
        return json.dumps({"error": "AgentAction blocked execution: " + message})

    def execute(self, tool_name: str, args: dict, next_call: Any, session_id: str = "", **_kwargs: Any) -> Any:
        """Never raise: Hermes skips middleware that raises before next_call."""
        claimed = None
        run_id = None
        try:
            if self.error:
                return self.block(self.error)
            if not self.compatible():
                return self.block("Use a dedicated profile without other tool execution middleware or pre-tool policy hooks.")
            if not session_id or tool_name in {"delegate_task", "execute_code", "tool_call"}:
                return self.block("A stable session ID is required; delegation, execute_code and tool_call are unsupported.")
            # JSON roundtrip freezes a private plain-data copy for review/dispatch.
            frozen = json.loads(json.dumps(args, allow_nan=False))
            if not isinstance(frozen, dict):
                return self.block("Tool arguments must be an object.")
            _exact_numbers(frozen)
            run = self.request("start", {"sessionId": session_id, "supervisorLimits": self.limits})
            run_id = run["runId"]
            proposal = self.request("propose", {"runId": run_id, "tool": tool_name, "arguments": frozen})
            if proposal.get("state") != "awaiting_approval" or proposal.get("approved") is not True:
                return self.block("Review this exact call in the AgentAction console. After approval, retry the same tool and arguments in this session. Previously consumed calls cannot run again.")
            claimed = self.request("claim", {"runId": run_id, "actionId": proposal["actionId"], "bindingDigest": proposal["bindingDigest"]})
            if claimed.get("claimed") is not True or claimed.get("actionId") != proposal["actionId"] or not isinstance(claimed.get("deadline"), (int, float)) or time.time() * 1000 >= claimed["deadline"]:
                return self.block("No current single-use execution claim was received.")
            # The durable claim exists before this sole provider dispatch boundary.
            result = next_call(frozen)
            # Results can represent provider errors with partial effects. Treat
            # all explicit error results as uncertain, never automatically retry.
            try:
                parsed = json.loads(result) if isinstance(result, str) else result
                uncertain = isinstance(parsed, dict) and ("error" in parsed or parsed.get("isError") is True)
            except (ValueError, TypeError):
                uncertain = False
            status = "uncertain" if uncertain or time.time() * 1000 >= claimed["deadline"] else "succeeded"
            self.request("complete", {"runId": run_id, "actionId": claimed["actionId"], "status": status})
            return result if status == "succeeded" else self.block("Tool effect is uncertain; inspect the provider. Automatic redispatch is blocked.")
        except Exception:
            # Do not expose HTTP bodies, arguments, tokens or provider exceptions.
            if claimed and run_id:
                try:
                    self.request("complete", {"runId": run_id, "actionId": claimed["actionId"], "status": "uncertain"})
                except Exception:
                    pass  # Retained dispatch_claimed remains a replay fence.
            return self.block("Supervisor or tool completion unavailable. No automatic retry; review the console and provider.")


def register_enforcement(ctx: Any) -> HermesExecutionAdapter:
    try:
        adapter = HermesExecutionAdapter(ctx)
    except Exception:
        adapter = HermesExecutionAdapter.__new__(HermesExecutionAdapter)
        adapter.error = "Execution configuration could not be loaded. Fix settings and restart Hermes."
    try:
        from hermes_cli.middleware import VALID_MIDDLEWARE
        if "tool_execution" not in VALID_MIDDLEWARE or not callable(getattr(ctx, "register_middleware", None)):
            raise ValueError("Unsupported Hermes middleware API")
        ctx.register_middleware("tool_execution", adapter.execute)
    except Exception:
        # Older Hermes must never silently degrade opt-in enforcement to observe.
        adapter.error = "AgentAction execution mode requires Hermes tool_execution middleware. Upgrade Hermes."
        ctx.register_hook("pre_tool_call", lambda **_: {"action": "block", "message": adapter.error})
    return adapter
