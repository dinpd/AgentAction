import pytest

from agentid.config_ui import write_config_ui
from agentid.config_ui_server import create_config_ui_server
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


def _approve_request(gateway, **overrides):
    request = {
        "tool": "zendesk.ticket.update",
        "action": "write",
        "resource": "tickets/123",
        "requested_by": "user-1",
        "reason": "approved maintenance",
    }
    request.update(overrides)
    approval = gateway.create_approval_request(request)
    gateway.approve_approval_request(approval.approval_id, {"decided_by": "manager-1"})
    return approval


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
    approval = _approve_request(gateway)
    grant = gateway.create_jit_grant(
        {
            "tool": "zendesk.ticket.update",
            "action": "write",
            "resource": "tickets/123",
            "approval_id": approval.approval_id,
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


def test_gateway_requires_approved_request_for_jit_grant():
    gateway = AgentGateway(_manifest())
    approval = gateway.create_approval_request(
        {
            "approval_id": "approval-1",
            "tool": "zendesk.ticket.update",
            "action": "write",
            "resource": "tickets/123",
            "requested_by": "user-1",
            "reason": "update a production ticket",
        }
    )

    with pytest.raises(ValueError, match="approval request is not approved"):
        gateway.create_jit_grant(
            {
                "tool": "zendesk.ticket.update",
                "action": "write",
                "resource": "tickets/123",
                "approval_id": approval.approval_id,
                "user_id": "user-1",
            }
        )

    gateway.approve_approval_request(approval.approval_id, {"decided_by": "manager-1"})
    grant = gateway.create_jit_grant(
        {
            "tool": "zendesk.ticket.update",
            "action": "write",
            "resource": "tickets/123",
            "approval_id": approval.approval_id,
            "user_id": "user-1",
        }
    )

    assert grant.approval_id == approval.approval_id


def test_gateway_rejects_denied_approval_request_for_jit_grant():
    gateway = AgentGateway(_manifest())
    approval = gateway.create_approval_request(
        {
            "tool": "zendesk.ticket.update",
            "action": "write",
            "resource": "tickets/123",
            "requested_by": "user-1",
            "reason": "update a production ticket",
        }
    )
    gateway.deny_approval_request(approval.approval_id, {"decided_by": "manager-1"})

    with pytest.raises(ValueError, match="approval request is denied"):
        gateway.create_jit_grant(
            {
                "tool": "zendesk.ticket.update",
                "action": "write",
                "resource": "tickets/123",
                "approval_id": approval.approval_id,
                "user_id": "user-1",
            }
        )


def test_gateway_rejects_jit_grant_when_approval_context_drifts():
    manifest = _manifest()
    manifest["tools"][1]["name"] = "devops.deploy.production"
    manifest["tools"][1]["access"] = "execute"
    manifest["tools"][1]["constraints"] = {
        "token_ttl_seconds": 300,
        "required_context": ["environment", "service_id", "change_request_id", "commit_sha"],
        "allowed_values": {"environment": ["production"], "service_id": ["checkout-api"]},
    }
    gateway = AgentGateway(manifest)
    approval = _approve_request(
        gateway,
        tool="devops.deploy.production",
        action="execute",
        resource="service/checkout-api/environment/production",
        environment="production",
        service_id="checkout-api",
        change_request_id="CHG-1042",
        commit_sha="abc123",
    )

    with pytest.raises(ValueError, match="approval request environment mismatch"):
        gateway.create_jit_grant(
            {
                "tool": "devops.deploy.production",
                "action": "execute",
                "resource": "service/checkout-api/environment/production",
                "approval_id": approval.approval_id,
                "user_id": "user-1",
                "environment": "staging",
                "service_id": "checkout-api",
                "change_request_id": "CHG-1042",
                "commit_sha": "abc123",
            }
        )


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


def test_gateway_enforces_job_boundary():
    manifest = _manifest()
    manifest["job_boundary"] = {
        "required": True,
        "allowed_jobs": ["refund_triage"],
        "out_of_scope": ["plan_change"],
        "require_job_id": True,
        "bind_authorization_to": ["job_id", "case_id", "customer_id"],
    }
    gateway = AgentGateway(manifest)

    allowed = gateway.authorize(
        {
            "agent_id": "support-copilot-prod",
            "tool": "zendesk.ticket.read",
            "action": "read",
            "data_from": "zendesk",
            "data_to": "agent_context",
            "job_id": "refund_triage",
            "case_id": "case-1042",
            "customer_id": "cus_123",
        }
    )
    denied = gateway.authorize(
        {
            "agent_id": "support-copilot-prod",
            "tool": "zendesk.ticket.read",
            "action": "read",
            "data_from": "zendesk",
            "data_to": "agent_context",
            "job_id": "plan_change",
            "case_id": "case-1042",
        }
    )

    assert allowed.allow
    assert not denied.allow
    assert "event[0]: job_id is not allowed by job_boundary: plan_change" in denied.findings
    assert "event[0]: job_id is explicitly out of scope: plan_change" in denied.findings
    assert "event[0]: job_boundary binding field is missing: customer_id" in denied.findings


def test_gateway_binds_jit_grant_to_job_boundary_fields():
    manifest = _manifest()
    manifest["job_boundary"] = {
        "required": True,
        "allowed_jobs": ["refund_triage"],
        "require_job_id": True,
        "bind_authorization_to": ["job_id", "case_id", "customer_id"],
    }
    gateway = AgentGateway(manifest)
    approval = _approve_request(
        gateway,
        resource="tickets/123",
        job_id="refund_triage",
        case_id="case-1042",
        customer_id="cus_123",
    )
    grant = gateway.create_jit_grant(
        {
            "tool": "zendesk.ticket.update",
            "action": "write",
            "resource": "tickets/123",
            "job_id": "refund_triage",
            "case_id": "case-1042",
            "customer_id": "cus_123",
            "approval_id": approval.approval_id,
            "user_id": "user-1",
        }
    )

    decision = gateway.authorize(
        {
            "agent_id": "support-copilot-prod",
            "tool": "zendesk.ticket.update",
            "action": "write",
            "resource": "tickets/123",
            "job_id": "refund_triage",
            "case_id": "case-9999",
            "customer_id": "cus_123",
            "approved": True,
            "jit_grant_id": grant.grant_id,
        }
    )

    assert not decision.allow
    assert "JIT grant case_id mismatch" in decision.findings


def test_gateway_enforces_required_context_and_allowed_values():
    manifest = _manifest()
    manifest["tools"][1]["name"] = "devops.deploy.production"
    manifest["tools"][1]["access"] = "execute"
    manifest["tools"][1]["constraints"] = {
        "token_ttl_seconds": 300,
        "required_context": ["environment", "service_id", "change_request_id", "commit_sha"],
        "allowed_values": {"environment": ["production"], "service_id": ["checkout-api"]},
    }
    gateway = AgentGateway(manifest)
    approval = _approve_request(
        gateway,
        tool="devops.deploy.production",
        action="execute",
        resource="service/checkout-api/environment/production",
        environment="production",
        service_id="checkout-api",
        change_request_id="CHG-1042",
        commit_sha="abc123",
    )
    grant = gateway.create_jit_grant(
        {
            "tool": "devops.deploy.production",
            "action": "execute",
            "resource": "service/checkout-api/environment/production",
            "approval_id": approval.approval_id,
            "user_id": "user-1",
            "environment": "production",
            "service_id": "checkout-api",
            "change_request_id": "CHG-1042",
            "commit_sha": "abc123",
        }
    )

    denied = gateway.authorize(
        {
            "agent_id": "support-copilot-prod",
            "tool": "devops.deploy.production",
            "action": "execute",
            "resource": "service/checkout-api/environment/production",
            "approved": True,
            "jit_grant_id": grant.grant_id,
            "environment": "staging",
            "service_id": "checkout-api",
            "change_request_id": "CHG-1042",
        }
    )

    assert not denied.allow
    assert "JIT grant environment mismatch" in denied.findings
    assert "event[0]: required context field is missing: commit_sha" in denied.findings
    assert "event[0]: environment is not allowed: staging" in denied.findings


def test_config_ui_writer_creates_browser_builder(tmp_path):
    output = write_config_ui(tmp_path / "builder.html")

    html = output.read_text()

    assert "AgentAction Policy Builder" in html
    assert "Manifest YAML" in html
    assert "OPA Policy" in html
    assert "Skill Guardrails" in html
    assert "1. Source" in html
    assert "2. Review Tools" in html
    assert "Policy Summary" in html
    assert "Review & Export" in html
    assert "Import MCP Tools" in html
    assert "Build From MCP" in html
    assert "Build policy from MCP" in html
    assert "quickMcpUrl" in html
    assert "agentaction config-ui --serve" in html
    assert "Analyze import" in html
    assert "Apply selected tools" in html
    assert "Accept safe defaults" in html
    assert "analyzeMcpImportText" in html
    assert "buildPolicyFromMcp" in html
    assert "/api/fetch-tools" in html
    assert "support-refund-workflow" in html


def test_config_ui_server_uses_policy_builder_handler(monkeypatch):
    created = {}

    class FakeServer:
        def __init__(self, server_address, handler_class):
            created["server_address"] = server_address
            created["handler_class"] = handler_class

    monkeypatch.setattr("agentid.config_ui_server.ThreadingHTTPServer", FakeServer)

    create_config_ui_server("127.0.0.1", 8798)

    assert created["server_address"] == ("127.0.0.1", 8798)
    assert created["handler_class"].server_version == "AgentActionPolicyBuilder/0.1"
