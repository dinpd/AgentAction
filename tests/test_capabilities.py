from agentid.audit import audit_events
from agentid.explain import explain_manifest
from agentid.policy import generate_policy
from agentid.risk import risk_score


def _manifest():
    return {
        "agent": {
            "id": "support-copilot-prod",
            "name": "Support Copilot",
            "owner": "support-platform",
            "environment": "production",
            "purpose": "Resolve support cases with a reviewed skill.",
        },
        "jit_authorization": {
            "enabled": True,
            "default_ttl_seconds": 300,
            "bind_token_to": ["agent_id", "user_id", "tool", "action", "resource", "approval_id"],
            "revoke_after_use": True,
        },
        "capabilities": [
            {
                "id": "support-refund-workflow",
                "kind": "skill",
                "source": "./skills/support-refund-workflow",
                "version": "1.0.0",
                "hash": "sha256:test",
                "access": "execute",
                "auth_mode": "just_in_time",
                "approval": "human_confirm",
                "may_invoke": ["provider.billing.issue_credit"],
                "constraints": {"token_ttl_seconds": 300, "max_amount_usd": 100},
            },
            {
                "id": "provider.billing.issue_credit",
                "kind": "mcp_tool",
                "access": "write",
                "auth_mode": "just_in_time",
                "approval": "manager",
                "constraints": {"token_ttl_seconds": 300, "max_amount_usd": 100},
            },
        ],
        "data_flows": [{"from": "provider.billing", "to": "provider.billing", "allowed": True}],
        "runtime": {"enforce_manifest": True, "detect_tool_drift": True, "detect_new_destinations": True},
        "audit": {"log_tool_calls": True, "log_decisions": True, "log_jit_grants": True},
        "kill_switch": {"enabled": True},
    }


def test_audit_allows_skill_to_call_declared_downstream_tool():
    ok, findings = audit_events(
        _manifest(),
        [
            {
                "agent_id": "support-copilot-prod",
                "skill_id": "support-refund-workflow",
                "tool": "provider.billing.issue_credit",
                "action": "write",
                "approved": True,
                "jit_grant_id": "jit-1",
                "jit_grant_valid": True,
            }
        ],
    )

    assert ok
    assert findings == []


def test_audit_denies_skill_downstream_tool_outside_may_invoke():
    manifest = _manifest()
    manifest["capabilities"].append(
        {
            "id": "email.send_external",
            "kind": "mcp_tool",
            "access": "write",
            "auth_mode": "just_in_time",
            "approval": "human_confirm",
            "constraints": {"token_ttl_seconds": 120},
        }
    )

    ok, findings = audit_events(
        manifest,
        [
            {
                "agent_id": "support-copilot-prod",
                "skill_id": "support-refund-workflow",
                "tool": "email.send_external",
                "action": "write",
                "approved": True,
                "jit_grant_id": "jit-1",
                "jit_grant_valid": True,
            }
        ],
    )

    assert not ok
    assert "event[0]: skill support-refund-workflow may not invoke tool: email.send_external" in findings


def test_policy_supports_capability_input_alias():
    policy = generate_policy(_manifest(), "opa")

    assert 'requested_capability := object.get(input, "tool", object.get(input, "capability", ""))' in policy
    assert 'allowed_tools["support-refund-workflow"] := "execute"' in policy


def test_explain_and_risk_include_skill_capabilities():
    explanation = explain_manifest(_manifest())
    score, reasons = risk_score(_manifest())

    assert "support-refund-workflow: kind=skill" in explanation
    assert "may invoke provider.billing.issue_credit" in explanation
    assert score >= 0
    assert "support-refund-workflow is a skill capability" in reasons
