from __future__ import annotations

import json
import time
import sys
from types import SimpleNamespace

import pytest

from test_hermes_observer import load_plugin_module


@pytest.fixture(autouse=True)
def middleware_api(monkeypatch):
    monkeypatch.setitem(sys.modules, "hermes_cli", SimpleNamespace())
    monkeypatch.setitem(sys.modules, "hermes_cli.middleware", SimpleNamespace(VALID_MIDDLEWARE={"tool_execution"}))
    monkeypatch.setitem(sys.modules, "model_tools", SimpleNamespace(coerce_tool_args=lambda _name, args: args))


class Context:
    def __init__(self, **settings):
        self.settings = {"execution_enabled": True, "supervisor_endpoint": "https://console.test", "supervisor_workspace": "acme", "supervisor_agent_id": "external-agent", **settings}
        self.hooks, self.middleware = [], []

    def get_config(self, key, default=None):
        return self.settings.get(key, default)

    def register_hook(self, name, callback):
        self.hooks.append((name, callback))

    def register_middleware(self, name, callback):
        self.middleware.append((name, callback))


def adapter(monkeypatch, **settings):
    monkeypatch.setenv("AGENTACTION_EXECUTION_TOKEN", "aae_secret")
    monkeypatch.delenv("AGENTACTION_INGEST_TOKEN", raising=False)
    plugin = load_plugin_module()
    ctx = Context(**settings)
    plugin.register(ctx)
    instance = plugin._execution
    assert ctx.middleware == [("tool_execution", instance.execute)]
    assert plugin._observer is None
    monkeypatch.setattr(instance, "compatible", lambda: True)
    return instance


def test_execution_is_independent_of_ingestion_and_missing_config_blocks(monkeypatch):
    instance = adapter(monkeypatch, supervisor_workspace="")
    calls = []
    assert "blocked" in instance.execute("refund", {}, calls.append, session_id="s")
    assert calls == []
    monkeypatch.delenv("AGENTACTION_EXECUTION_TOKEN")
    plugin = load_plugin_module()
    ctx = Context()
    plugin.register(ctx)
    assert "blocked" in plugin._execution.execute("refund", {}, calls.append, session_id="s")
    assert calls == []


@pytest.mark.parametrize("failure", ["start", "propose", "claim", "complete"])
def test_every_transport_failure_blocks_without_fallback_dispatch_or_secret_errors(monkeypatch, failure):
    instance = adapter(monkeypatch)
    effects, requests = [], []

    def request(action, body):
        requests.append(action)
        if action == failure:
            raise RuntimeError("aae_secret private arguments provider result")
        return {"runId": "run", "actionId": "action", "bindingDigest": "digest", "state": "awaiting_approval", "approved": True, "claimed": True, "deadline": time.time() * 1000 + 10000}

    monkeypatch.setattr(instance, "request", request)
    out = instance.execute("refund", {"amount": 10}, lambda args: effects.append(args) or '{"ok":true}', session_id="s")
    assert "blocked" in out and "aae_secret" not in out and "private arguments" not in out
    assert len(effects) == (1 if failure == "complete" else 0)
    assert requests.count("claim") <= 1


@pytest.mark.parametrize("state,approved", [("awaiting_approval", False), ("succeeded", True), ("dispatch_claimed", True), ("uncertain", True), ("cancelled", True)])
def test_pending_and_consumed_proposals_never_dispatch(monkeypatch, state, approved):
    instance = adapter(monkeypatch)
    monkeypatch.setattr(instance, "request", lambda *_: {"runId": "run", "state": state, "approved": approved})
    effects = []
    assert "blocked" in instance.execute("refund", {}, effects.append, session_id="s")
    assert effects == []


def test_claim_precedes_exact_dispatch_and_result_is_never_exported(monkeypatch):
    instance = adapter(monkeypatch)
    order, payloads = [], []

    def request(action, body):
        order.append(action)
        payloads.append(body)
        return {"runId": "run", "actionId": "action", "bindingDigest": "digest", "state": "awaiting_approval", "approved": True, "claimed": True, "deadline": time.time() * 1000 + 10000}

    def tool(args):
        order.append("effect")
        assert args == {"amount": 10}
        return '{"provider_secret":"hidden"}'

    monkeypatch.setattr(instance, "request", request)
    assert "provider_secret" in instance.execute("refund", {"amount": 10}, tool, session_id="stable-session")
    assert order == ["start", "propose", "claim", "effect", "complete"]
    assert "provider_secret" not in json.dumps(payloads)


def test_unsupported_sessions_tools_profiles_deadlines_and_provider_errors(monkeypatch):
    instance = adapter(monkeypatch)
    effects = []
    for tool, session in [("refund", ""), ("delegate_task", "s"), ("execute_code", "s")]:
        assert "blocked" in instance.execute(tool, {}, effects.append, session_id=session)
    monkeypatch.setattr(instance, "compatible", lambda: False)
    assert "blocked" in instance.execute("refund", {}, effects.append, session_id="s")
    monkeypatch.setattr(instance, "compatible", lambda: True)
    requests = []

    def request(action, body):
        requests.append((action, body))
        return {"runId": "run", "actionId": "action", "bindingDigest": "digest", "state": "awaiting_approval", "approved": True, "claimed": True, "deadline": 0}

    monkeypatch.setattr(instance, "request", request)
    assert "blocked" in instance.execute("refund", {}, effects.append, session_id="s")
    assert effects == []
    def live(action, body):
        requests.append((action, body))
        return {"runId": "run", "actionId": "action", "bindingDigest": "digest", "state": "awaiting_approval", "approved": True, "claimed": True, "deadline": time.time() * 1000 + 10000}
    monkeypatch.setattr(instance, "request", live)
    assert "blocked" in instance.execute("refund", {}, lambda _: '{"error":"partial provider effect"}', session_id="s")
    assert requests[-1][1]["status"] == "uncertain"


def test_redirects_https_and_oversized_responses_fail_closed(monkeypatch):
    instance = adapter(monkeypatch, supervisor_endpoint="http://unsafe.test")
    assert instance.error
    instance = adapter(monkeypatch)
    module = __import__(instance.__module__, fromlist=["_NoRedirect"])
    assert module._NoRedirect().redirect_request(None, None, None, None, None, None) is None

    class Response:
        def __enter__(self): return self
        def __exit__(self, *_): pass
        def read(self, count): return b"x" * count

    instance.opener = SimpleNamespace(open=lambda *_args, **_kwargs: Response())
    with pytest.raises(ValueError, match="too large"):
        instance.request("start", {"sessionId": "s"})


def test_older_hermes_registers_explicit_deny_hook(monkeypatch):
    monkeypatch.delenv("AGENTACTION_INGEST_TOKEN", raising=False)
    plugin = load_plugin_module()
    ctx = Context()
    ctx.register_middleware = None
    plugin.register(ctx)
    assert ctx.hooks[0][0] == "pre_tool_call"
    assert ctx.hooks[0][1]()["action"] == "block"


def test_observation_config_failure_does_not_remove_enforcement(monkeypatch):
    monkeypatch.setenv("AGENTACTION_EXECUTION_TOKEN", "aae_secret")
    monkeypatch.setenv("AGENTACTION_INGEST_TOKEN", "source-token")
    plugin = load_plugin_module()
    def fail(_):
        raise ValueError("private observation setting")
    monkeypatch.setattr(plugin, "_register_observer", fail)
    ctx = Context()
    plugin.register(ctx)
    assert ctx.middleware == [("tool_execution", plugin._execution.execute)]


def test_malformed_enable_flag_cannot_silently_disable_the_gate(monkeypatch):
    instance = adapter(monkeypatch, execution_enabled="true")
    assert "YAML boolean" in instance.error
    effects = []
    assert "blocked" in instance.execute("refund", {}, effects.append, session_id="s")
    assert effects == []


@pytest.mark.parametrize('number', [9007199254740993, -9007199254740993, 1e30, float('nan'), float('inf')])
def test_numbers_cannot_round_between_review_and_dispatch(monkeypatch, number):
    instance = adapter(monkeypatch)
    def no_request(*_):
        pytest.fail('Inexact numeric arguments must fail before any proposal')
    monkeypatch.setattr(instance, 'request', no_request)
    effects = []
    assert 'blocked' in instance.execute('refund', {'nested': [{'amount': number}]}, effects.append, session_id='s')
    assert effects == []


def test_effective_normalized_args_are_reviewed_and_dispatched_from_a_private_copy(monkeypatch):
    instance = adapter(monkeypatch)
    def coerce(_name, args):
        args['amount'] = float(args['amount'])
        args['targets'] = json.loads(args['targets']) if isinstance(args['targets'], str) else args['targets']
        return args
    monkeypatch.setattr(sys.modules['model_tools'], 'coerce_tool_args', coerce)
    payloads, effects = [], []
    def request(action, body):
        payloads.append((action, body))
        return {'runId':'run','actionId':'action','bindingDigest':'digest','state':'awaiting_approval','approved':True,'claimed':True,'deadline':time.time()*1000+10000}
    monkeypatch.setattr(instance, 'request', request)
    original = {'amount':'10','targets':'["one"]'}
    assert instance.execute('refund', original, lambda args: effects.append(args) or '{"ok":true}', session_id='s') == '{"ok":true}'
    expected = {'amount':10.0,'targets':['one']}
    assert payloads[1] == ('propose', {'runId':'run','tool':'refund','arguments':expected})
    assert effects == [expected]
    assert original == {'amount':'10','targets':'["one"]'}


@pytest.mark.parametrize('mode', ['raises','unsafe','non_json','unstable'])
def test_failed_or_inexact_normalization_never_requests_dispatch_authority(monkeypatch, mode):
    instance = adapter(monkeypatch)
    def coerce(_name, args):
        if mode == 'raises': raise ValueError('private tool argument')
        if mode == 'unsafe': return {'amount':int(args['amount'])}
        if mode == 'non_json': return {'value':object()}
        return {**args,'sequence':args.get('sequence',0)+1}
    monkeypatch.setattr(sys.modules['model_tools'], 'coerce_tool_args', coerce)
    def no_request(*_): pytest.fail('Normalization must succeed before supervisor requests')
    monkeypatch.setattr(instance, 'request', no_request)
    effects = []
    result = instance.execute('refund', {'amount':'9007199254740993'}, effects.append, session_id='s')
    assert 'blocked' in result and 'private tool argument' not in result
    assert effects == []
