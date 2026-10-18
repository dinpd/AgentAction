"""Synthetic acceptance only: real Hermes plugin API and both dispatch paths.

The parent supplies an in-process HTTP bridge to the real Worker. No provider,
model, user Hermes home, or external network is used by this process.
"""
import importlib.util
import json
import os
from pathlib import Path
import sys
from types import SimpleNamespace

settings = json.loads(sys.stdin.readline())
os.environ["HERMES_HOME"] = settings["home"]
os.environ["AGENTACTION_EXECUTION_TOKEN"] = settings["token"]
os.environ.pop("AGENTACTION_INGEST_TOKEN", None)
if settings.get("observe"):
    os.environ["AGENTACTION_INGEST_TOKEN"] = "synthetic-observation-token"
sys.path.insert(0, settings["runtime"])
Path(settings["home"], "config.yaml").write_text(json.dumps({"plugins": {"entries": {"agentaction": {"settings": {
    "tenant_id": "acme" if settings.get("observe") else "", "source_id": "synthetic-hermes", "agent_id": "synthetic-hermes",
    "execution_enabled": True, "supervisor_endpoint": "https://console.test", "supervisor_workspace": "acme", "supervisor_agent_id": settings["agentId"], "supervisor_limits": settings.get("limits", {}),
}}}}}))

from hermes_cli.plugins import PluginContext, PluginManifest, get_plugin_manager
from hermes_cli.middleware import run_tool_execution_middleware
from tools.registry import registry
from model_tools import handle_function_call
from agent.tool_executor import _run_agent_tool_execution_middleware

plugin_dir = Path(settings["plugin"])
spec = importlib.util.spec_from_file_location("agentaction_acceptance_plugin", plugin_dir / "__init__.py", submodule_search_locations=[str(plugin_dir)])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
manager = get_plugin_manager()
manager._discovered = True
ctx = PluginContext(PluginManifest(name="agentaction", path=str(plugin_dir), version="0.9.0"), manager)
if settings.get("observe"):
    module.HermesShadowObserver.start = lambda self: None
module.register(ctx)
if settings.get("observe"):
    assert module._observer is not None
    module._observer.sender = lambda payload: None
    module._observer.job_sender = lambda payload: {"job_id": "synthetic-job", "intent_id": "synthetic-intent", "intent_digest": "a" * 64}


class Response:
    def __init__(self, value): self.value = value
    def __enter__(self): return self
    def __exit__(self, *_): pass
    def read(self, _): return json.dumps(self.value).encode()


class WorkerBridge:
    def open(self, request, timeout):
        print(json.dumps({"type": "rpc", "url": request.full_url, "headers": dict(request.header_items()), "body": request.data.decode()}), flush=True)
        response = json.loads(sys.stdin.readline())
        if response["status"] != 200:
            raise OSError("Synthetic supervisor HTTP failure")
        return Response(response["body"])


module._execution.opener = WorkerBridge()
effects = Path(settings["effects"])


def refund(args, **_):
    assert args == {"paymentId": "synthetic-payment", "amount": 10}
    effects.write_text(str(int(effects.read_text()) + 1 if effects.exists() else 1))
    if settings.get("lostResult"):
        raise OSError("Synthetic provider committed then lost response")
    return json.dumps({"refund": "synthetic-refund", "private_result": "never-export"})


registry.register(name="synthetic_refund", toolset="agentaction_acceptance", schema={"name": "synthetic_refund", "parameters": {"type": "object", "properties": {"paymentId": {"type": "string"}, "amount": {"type": "number"}}}}, handler=refund)
args = {"paymentId": "synthetic-payment", "amount": 10}
if settings.get("incompatible"):
    manager._hooks.setdefault("pre_tool_call", []).append(lambda **_: {"action": "modify", "args": {"amount": 9000}})
if settings.get("path") == "agent":
    agent = SimpleNamespace(session_id=settings["session"], _tool_guardrails=SimpleNamespace(before_call=lambda *_: SimpleNamespace(allows_execution=True)))
    value = _run_agent_tool_execution_middleware(agent, function_name="synthetic_refund", function_args=args, effective_task_id="fixture-task", tool_call_id="new-model-call-id", execute=lambda final: handle_function_call("synthetic_refund", final, session_id=settings["session"], skip_pre_tool_call_hook=True, skip_tool_request_middleware=True, skip_tool_execution_middleware=True), begin_execution=lambda callback: None).result
else:
    value = handle_function_call("synthetic_refund", args, session_id=settings["session"], tool_call_id="new-model-call-id")
print(json.dumps({"type": "done", "value": value}), flush=True)
