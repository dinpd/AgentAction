from agentid.manifest import validate_manifest


def test_valid_manifest_minimum():
    manifest = {
        "agent": {
            "id": "a1",
            "name": "Test Agent",
            "owner": "team",
            "environment": "dev",
            "purpose": "test",
        },
        "oidc": {
            "enabled": True,
            "issuer": "https://idp.example.com/oauth2/default",
            "audiences": ["agentid-gateway"],
            "jwks_uri": "https://idp.example.com/oauth2/default/v1/keys",
            "token_validation": "jwks",
            "claim_mapping": {
                "tenant_id": "tid",
                "user_id": "sub",
                "agent_id": "agent_id",
            },
            "required_scopes": {
                "authorize": "agentid.authorize",
                "policy_read": "agentid.policy.read",
                "jit_grant": "agentid.jit.grant",
            },
        },
        "jit_authorization": {
            "enabled": True,
            "default_ttl_seconds": 300,
            "bind_token_to": ["agent_id", "user_id", "tool", "action", "resource", "approval_id"],
            "revoke_after_use": True,
        },
        "delegation_chain": {"may_call_agents": False, "allowed_agents": []},
        "intent": {"confirmation_required_for": ["external_email"]},
        "tools": [
            {
                "name": "docs.search",
                "access": "read",
                "auth_mode": "delegated",
                "approval": "none",
            }
        ],
        "data_flows": [{"from": "docs", "to": "agent", "allowed": True}],
        "runtime": {
            "enforce_manifest": True,
            "detect_tool_drift": True,
            "detect_new_destinations": True,
        },
        "audit": {"log_tool_calls": True, "log_decisions": True, "log_jit_grants": True},
    }

    result = validate_manifest(manifest)

    assert result.ok


def test_oidc_demo_mode_warns_but_validates():
    manifest = {
        "agent": {
            "id": "a1",
            "name": "Test Agent",
            "owner": "team",
            "environment": "dev",
            "purpose": "test",
        },
        "oidc": {
            "enabled": True,
            "issuer": "https://demo.agentid.local",
            "audiences": ["agentid-gateway"],
            "token_validation": "demo_hs256",
            "claim_mapping": {
                "tenant_id": "tid",
                "user_id": "sub",
                "agent_id": "agent_id",
            },
            "required_scopes": {
                "authorize": "agentid.authorize",
                "policy_read": "agentid.policy.read",
                "jit_grant": "agentid.jit.grant",
            },
        },
        "jit_authorization": {
            "enabled": False,
            "default_ttl_seconds": 300,
            "bind_token_to": ["agent_id", "user_id", "tool", "action", "resource", "approval_id"],
            "revoke_after_use": True,
        },
        "delegation_chain": {"may_call_agents": False, "allowed_agents": []},
        "intent": {"confirmation_required_for": []},
        "tools": [{"name": "docs.search", "access": "read", "auth_mode": "delegated", "approval": "none"}],
        "data_flows": [{"from": "docs", "to": "agent", "allowed": True}],
        "runtime": {"enforce_manifest": True, "detect_tool_drift": True, "detect_new_destinations": True},
        "audit": {"log_tool_calls": True, "log_decisions": True, "log_jit_grants": True},
    }

    result = validate_manifest(manifest)

    assert result.ok
    assert "oidc.token_validation=demo_hs256 is for demos only. Use jwks for production IdPs." in result.warnings


def test_job_boundary_rejects_overlapping_jobs():
    manifest = {
        "agent": {
            "id": "a1",
            "name": "Test Agent",
            "owner": "team",
            "environment": "dev",
            "purpose": "test",
        },
        "delegation_chain": {"may_call_agents": False, "allowed_agents": []},
        "job_boundary": {
            "required": True,
            "allowed_jobs": ["refund_triage"],
            "out_of_scope": ["refund_triage"],
            "require_job_id": True,
            "bind_authorization_to": ["job_id"],
        },
        "tools": [{"name": "docs.search", "access": "read", "auth_mode": "delegated", "approval": "none"}],
    }

    result = validate_manifest(manifest)

    assert not result.ok
    assert "job_boundary allowed_jobs and out_of_scope overlap: refund_triage" in result.errors
