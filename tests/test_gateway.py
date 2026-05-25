from agentid.config_ui import write_config_ui
from agentid.gateway import AgentGateway


def _manifest():
    return {
        "agent": {
            "id": "support-copilot-prod",
            "name": "Support Copilot",
            "owner": "support-platform",
            "environment": "production",
            "purpose": "Update customer support tickets after approval.",
        },
        "jit_authorization": {
            "enabled": True,
            "default_ttl_seconds": 300,
            "bind_token_to": ["agent_id", "user_id", "tool", "action", "resource", "approval_id"],
            "revoke_after_use": True,
        },
        "delegation_chain": {"may_call_agents": False, "allowed_agents": []},
        "intent": {"confirmation_required_for": ["zendesk.ticket.update"]},
        "tools": [
            {
                "name": "zendesk.ticket.read",
                "access": "read",
                "auth_mode": "delegated",
                "approval": "none",
            },
            {
                "name": "zendesk.ticket.update",
                "access": "write",
                "auth_mode": "just_in_time",
                "approval": "human_confirm",
                "constraints": {"resource": "tickets/*", "token_ttl_seconds": 300},
            },
        ],
        "data_flows": [{"from": "zendesk", "to": "agent_context", "allowed": True}],
        "runtime": {
            "enforce_manifest": True,
            "detect_tool_drift": True,
            "detect_new_destinations": True,
        },
        "audit": {"log_tool_calls": True, "log_decisions": True, "log_jit_grants": True},
        "kill_switch": {"enabled": True, "revoke_on_policy_violation": True},
    }


def test_gateway_allows_manifest_authorized_read():
    gateway = AgentGateway(_manifest())

    decision = gateway.authorize(
        {
            "agent_id": "support-copilot-prod",
            "tool": "zendesk.ticket.read",
            "action": "read",
            "data_from": "zendesk",
            "data_to": "agent_context",
        }
    )

    assert decision.allow
    assert decision.findings == []


def test_gateway_denies_jit_tool_without_grant():
    gateway = AgentGateway(_manifest())

    decision = gateway.authorize(
        {
            "agent_id": "support-copilot-prod",
            "tool": "zendesk.ticket.update",
            "action": "write",
            "approved": True,
        }
    )

    assert not decision.allow
    assert "missing jit_grant_id" in decision.findings


def test_gateway_allows_jit_tool_with_bound_grant_once():
    gateway = AgentGateway(_manifest())
    grant = gateway.create_jit_grant(
        {
            "tool": "zendesk.ticket.update",
            "action": "write",
            "resource": "tickets/123",
            "approval_id": "approval-1",
            "user_id": "user-1",
        }
    )

    first_decision = gateway.authorize(
        {
            "agent_id": "support-copilot-prod",
            "tool": "zendesk.ticket.update",
            "action": "write",
            "resource": "tickets/123",
            "approved": True,
            "jit_grant_id": grant.grant_id,
        }
    )
    second_decision = gateway.authorize(
        {
            "agent_id": "support-copilot-prod",
            "tool": "zendesk.ticket.update",
            "action": "write",
            "resource": "tickets/123",
            "approved": True,
            "jit_grant_id": grant.grant_id,
        }
    )

    assert first_decision.allow
    assert not second_decision.allow
    assert "JIT grant was already used" in second_decision.findings


def test_gateway_enforces_scoped_agent_delegation():
    manifest = _manifest()
    manifest["delegation_chain"] = {
        "may_call_agents": True,
        "allowed_agents": ["refund-risk-review-agent"],
        "max_depth": 1,
        "allowed_delegated_tools": ["billing.lookup_refunds"],
        "requires_approval": True,
        "approval_sources": ["human", "agent"],
        "approval_agents": ["delegation-policy-agent"],
        "delegation_ttl_seconds": 300,
    }
    gateway = AgentGateway(manifest)

    decision = gateway.authorize(
        {
            "agent_id": "support-copilot-prod",
            "tool": "zendesk.ticket.read",
            "action": "read",
            "data_from": "zendesk",
            "data_to": "agent_context",
            "called_agent": "refund-risk-review-agent",
            "delegated_tool": "billing.lookup_refunds",
            "delegation_depth": 1,
            "approved": True,
            "approval_source": "agent",
            "approval_agent": "delegation-policy-agent",
        }
    )

    assert decision.allow


def test_gateway_denies_unscoped_agent_delegation():
    manifest = _manifest()
    manifest["delegation_chain"] = {
        "may_call_agents": True,
        "allowed_agents": ["refund-risk-review-agent"],
        "max_depth": 1,
        "allowed_delegated_tools": ["billing.lookup_refunds"],
        "requires_approval": True,
        "approval_sources": ["human"],
        "approval_agents": ["delegation-policy-agent"],
    }
    gateway = AgentGateway(manifest)

    decision = gateway.authorize(
        {
            "agent_id": "support-copilot-prod",
            "tool": "zendesk.ticket.read",
            "action": "read",
            "data_from": "zendesk",
            "data_to": "agent_context",
            "called_agent": "undeclared-agent",
            "delegated_tool": "stripe.create_refund",
            "delegation_depth": 2,
            "approved": True,
            "approval_source": "agent",
            "approval_agent": "undeclared-agent",
        }
    )

    assert not decision.allow
    assert "event[0]: called agent is not in allowed_agents: undeclared-agent" in decision.findings
    assert "event[0]: approval_source is not allowed for delegation: agent" in decision.findings
    assert "event[0]: approval_agent is not allowed for delegation: undeclared-agent" in decision.findings
    assert "event[0]: delegation approval agent must be independent of source and target agents" in decision.findings
    assert "event[0]: delegation depth 2 exceeds max_depth 1" in decision.findings
    assert "event[0]: delegated tool is not allowed: stripe.create_refund" in decision.findings


def test_config_ui_writer_creates_browser_builder(tmp_path):
    output = write_config_ui(tmp_path / "builder.html")

    html = output.read_text()

    assert "AgentID Policy Builder" in html
    assert "Manifest YAML" in html
    assert "OPA Policy" in html
