from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm

from agentid_provider_fastapi import (
    AgentIdReceiptError,
    InMemoryReceiptLedger,
    InMemoryReplayStore,
    InMemoryRevocationStore,
    ProviderReceiptJwksCache,
    ProviderReceiptVerifier,
    ToolReceiptPolicy,
    sign_provider_receipt,
    sign_provider_receipt_jws,
    verify_provider_receipt,
)


def test_verify_provider_receipt_accepts_signed_receipt_bound_to_args():
    result = verify_provider_receipt(
        sign_provider_receipt(receipt(), "secret-1"),
        secret="secret-1",
        require_signed=True,
        tool="provider.crm.update_customer",
        args=tool_args(),
        policy=policy(),
        now=lambda: instant("2026-05-28T12:01:00Z"),
    )

    assert result.ok
    assert result.findings == []
    assert result.receipt == receipt()


def test_verify_provider_receipt_enforces_enterprise_auth_receipt_bindings():
    enterprise_policy = ToolReceiptPolicy(
        action="write",
        resource_template="provider/customer/{customer_id}",
        required_receipt_fields=[
            *policy().required_receipt_fields,
            "enterprise_issuer",
            "enterprise_subject",
            "enterprise_client_id",
            "enterprise_id_jag_grant_id",
            "enterprise_scopes",
            "enterprise_groups",
        ],
        required_receipt_values={
            "enterprise_issuer": "https://idp.example.com",
            "enterprise_client_id": "claude-enterprise",
            "enterprise_scopes": ["mcp:provider-crm", "crm.write"],
            "enterprise_groups": ["support-admins"],
        },
        bind_args=policy().bind_args,
    )

    accepted = verify_provider_receipt(
        sign_provider_receipt(receipt(), "secret-1"),
        secret="secret-1",
        require_signed=True,
        tool="provider.crm.update_customer",
        args=tool_args(),
        policy=enterprise_policy,
        now=lambda: instant("2026-05-28T12:01:00Z"),
    )
    denied = verify_provider_receipt(
        sign_provider_receipt(
            {
                **receipt(),
                "enterprise_client_id": "untrusted-client",
                "enterprise_scopes": ["openid", "mcp:provider-crm"],
                "enterprise_groups": ["support"],
            },
            "secret-1",
        ),
        secret="secret-1",
        require_signed=True,
        tool="provider.crm.update_customer",
        args=tool_args(),
        policy=enterprise_policy,
        now=lambda: instant("2026-05-28T12:01:00Z"),
    )

    assert accepted.ok
    assert not denied.ok
    assert "receipt enterprise_client_id mismatch" in denied.findings
    assert "receipt enterprise_scopes missing value: crm.write" in denied.findings
    assert "receipt enterprise_groups missing value: support-admins" in denied.findings


def test_verify_provider_receipt_accepts_jws_receipt_bound_to_args():
    private_key, jwks = rsa_key_and_jwks()

    result = verify_provider_receipt(
        sign_provider_receipt_jws(
            receipt(),
            private_key,
            issuer="https://enterprise.example.com",
            audience="provider-crm-mcp",
            key_id="agentid-2026-06",
        ),
        jwks=jwks,
        issuer="https://enterprise.example.com",
        audience="provider-crm-mcp",
        require_signed=True,
        tool="provider.crm.update_customer",
        args=tool_args(),
        policy=policy(),
        now=lambda: instant("2026-05-28T12:01:00Z"),
    )

    assert result.ok
    assert result.findings == []
    assert result.receipt == receipt()


def test_verify_provider_receipt_rejects_jws_issuer_mismatch():
    private_key, jwks = rsa_key_and_jwks()

    result = verify_provider_receipt(
        sign_provider_receipt_jws(
            receipt(),
            private_key,
            issuer="https://enterprise.example.com",
            audience="provider-crm-mcp",
            key_id="agentid-2026-06",
        ),
        jwks=jwks,
        issuer="https://other.example.com",
        audience="provider-crm-mcp",
        tool="provider.crm.update_customer",
        args=tool_args(),
        policy=policy(),
        now=lambda: instant("2026-05-28T12:01:00Z"),
    )

    assert not result.ok
    assert "receipt JWS issuer mismatch" in result.findings


def test_verify_provider_receipt_rejects_tampered_signature_and_resource_mismatch():
    signed = sign_provider_receipt(receipt(), "secret-1")
    signed["payload"] = {**signed["payload"], "resource": "provider/customer/cus_999"}

    result = verify_provider_receipt(
        signed,
        secret="secret-1",
        tool="provider.crm.update_customer",
        args=tool_args(),
        policy=policy(),
        now=lambda: instant("2026-05-28T12:01:00Z"),
    )

    assert not result.ok
    assert "receipt signature mismatch" in result.findings
    assert "receipt resource mismatch" in result.findings


def test_verify_provider_receipt_rejects_unsigned_when_required():
    result = verify_provider_receipt(
        receipt(),
        require_signed=True,
        tool="provider.crm.update_customer",
        args=tool_args(),
        policy=policy(),
        now=lambda: instant("2026-05-28T12:01:00Z"),
    )

    assert not result.ok
    assert result.findings == ["receipt must be signed"]


def test_verify_provider_receipt_rejects_expired_receipt():
    expired = {**receipt(), "expires_at": "2026-05-28T12:00:30Z"}

    result = verify_provider_receipt(
        sign_provider_receipt(expired, "secret-1"),
        secret="secret-1",
        tool="provider.crm.update_customer",
        args=tool_args(),
        policy=policy(),
        now=lambda: instant("2026-05-28T12:01:00Z"),
    )

    assert not result.ok
    assert "receipt is expired" in result.findings


def test_replay_store_rejects_reused_receipts():
    store = InMemoryReplayStore()
    signed = sign_provider_receipt(receipt(), "secret-1")

    first = verify_provider_receipt(
        signed,
        secret="secret-1",
        tool="provider.crm.update_customer",
        args=tool_args(),
        policy=policy(),
        replay_store=store,
        now=lambda: instant("2026-05-28T12:01:00Z"),
    )
    second = verify_provider_receipt(
        signed,
        secret="secret-1",
        tool="provider.crm.update_customer",
        args=tool_args(),
        policy=policy(),
        replay_store=store,
        now=lambda: instant("2026-05-28T12:01:00Z"),
    )

    assert first.ok
    assert not second.ok
    assert "receipt was already used" in second.findings


def test_revocation_store_rejects_a_receipt_before_consumption():
    revoked = InMemoryRevocationStore()
    revoked.revoke("dec-1")

    result = verify_provider_receipt(
        sign_provider_receipt(receipt(), "secret-1"),
        secret="secret-1",
        tool="provider.crm.update_customer",
        args=tool_args(),
        policy=policy(),
        revocation_store=revoked,
        now=lambda: instant("2026-05-28T12:01:00Z"),
    )

    assert not result.ok
    assert result.findings == ["receipt is revoked"]
    assert result.codes == ["revoked"]


def test_receipt_ledger_enforces_bounded_use_from_signed_receipt():
    ledger = InMemoryReceiptLedger()
    bounded = ToolReceiptPolicy(
        **{**policy().__dict__, "single_use": False, "max_uses": 3},
    )
    signed = sign_provider_receipt({**receipt(), "max_uses": 2}, "secret-1")
    options = {
        "secret": "secret-1",
        "tool": "provider.crm.update_customer",
        "args": tool_args(),
        "policy": bounded,
        "receipt_ledger": ledger,
        "now": lambda: instant("2026-05-28T12:01:00Z"),
    }

    assert verify_provider_receipt(signed, **options).ok
    assert verify_provider_receipt(signed, **options).ok
    exhausted = verify_provider_receipt(signed, **options)

    assert not exhausted.ok
    assert exhausted.findings == ["receipt use budget is exhausted"]
    assert exhausted.codes == ["budget_exhausted"]


def test_receipt_ledger_enforces_the_more_restrictive_spend_cap():
    ledger = InMemoryReceiptLedger()
    spend_capped = ToolReceiptPolicy(
        **{
            **policy().__dict__,
            "single_use": False,
            "max_amount": "100",
            "amount_arg": "amount",
        },
    )
    signed = sign_provider_receipt({**receipt(), "max_amount": "75"}, "secret-1")
    options = {
        "secret": "secret-1",
        "tool": "provider.crm.update_customer",
        "args": {**tool_args(), "amount": "40"},
        "policy": spend_capped,
        "receipt_ledger": ledger,
        "now": lambda: instant("2026-05-28T12:01:00Z"),
    }

    assert verify_provider_receipt(signed, **options).ok
    exhausted = verify_provider_receipt(signed, **options)

    assert not exhausted.ok
    assert exhausted.findings == ["receipt spend budget is exhausted"]
    assert exhausted.codes == ["budget_exhausted"]


def test_provider_contract_digest_must_match_the_active_contract():
    active_digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    contract_pinned = ToolReceiptPolicy(**{**policy().__dict__, "contract_digest": active_digest})
    options = {
        "secret": "secret-1",
        "tool": "provider.crm.update_customer",
        "args": tool_args(),
        "policy": contract_pinned,
        "now": lambda: instant("2026-05-28T12:01:00Z"),
    }

    allowed = verify_provider_receipt(
        sign_provider_receipt({**receipt(), "provider_contract_digest": active_digest}, "secret-1"), **options
    )
    drifted = verify_provider_receipt(
        sign_provider_receipt(
            {**receipt(), "provider_contract_digest": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},
            "secret-1",
        ),
        **options,
    )

    assert allowed.ok
    assert not drifted.ok
    assert drifted.findings == ["receipt provider contract digest mismatch"]
    assert drifted.codes == ["contract_drift"]


def test_verifier_dependency_returns_receipt_for_configured_tool():
    verifier = ProviderReceiptVerifier(
        secret="secret-1",
        now=lambda: instant("2026-05-28T12:01:00Z"),
        tools={"provider.crm.update_customer": policy()},
    )

    result = verifier.verify_body(mcp_request(sign_provider_receipt(receipt(), "secret-1")))

    assert result.ok
    assert result.receipt["decision_id"] == "dec-1"


def test_verifier_dependency_accepts_jws_receipt_for_configured_tool():
    private_key, jwks = rsa_key_and_jwks()
    verifier = ProviderReceiptVerifier(
        jwks=jwks,
        issuer="https://enterprise.example.com",
        audience="provider-crm-mcp",
        now=lambda: instant("2026-05-28T12:01:00Z"),
        tools={"provider.crm.update_customer": policy()},
    )

    signed = sign_provider_receipt_jws(
        receipt(),
        private_key,
        issuer="https://enterprise.example.com",
        audience="provider-crm-mcp",
        key_id="agentid-2026-06",
    )
    result = verifier.verify_body(mcp_request(signed))

    assert result.ok
    assert result.receipt["decision_id"] == "dec-1"


def test_verifier_dependency_accepts_remote_jwks_for_configured_tool(monkeypatch):
    private_key, jwks = rsa_key_and_jwks()
    verifier = ProviderReceiptVerifier(
        jwks_uri="http://placeholder.invalid",
        jwks_cache=ProviderReceiptJwksCache(),
        issuer="https://enterprise.example.com",
        audience="provider-crm-mcp",
        now=lambda: instant("2026-05-28T12:01:00Z"),
        tools={"provider.crm.update_customer": policy()},
    )
    signed = sign_provider_receipt_jws(
        receipt(),
        private_key,
        issuer="https://enterprise.example.com",
        audience="provider-crm-mcp",
        key_id="agentid-2026-06",
    )

    monkeypatch.setattr("agentid.provider.fetch_provider_receipt_jwks", lambda jwks_uri, *, timeout_seconds=5.0: jwks)
    verifier.jwks_uri = "https://enterprise.example.com/.well-known/jwks.json"
    result = verifier.verify_body(mcp_request(signed))

    assert result.ok
    assert result.receipt["decision_id"] == "dec-1"


@pytest.mark.anyio
async def test_dependency_raises_for_denied_receipt(anyio_backend):
    verifier = ProviderReceiptVerifier(
        secret="secret-1",
        tools={"provider.crm.update_customer": policy()},
    )

    with pytest.raises(AgentIdReceiptError) as exc:
        await verifier.dependency(mcp_request(None))

    assert exc.value.status_code == 403
    assert exc.value.findings == ["missing _agentid_receipt"]


def test_verifier_skips_tools_without_configured_receipt_policy():
    verifier = ProviderReceiptVerifier(
        tools={"provider.crm.update_customer": policy()},
    )

    result = verifier.verify_body(mcp_request(None, tool="provider.crm.search_customer"))

    assert result.ok
    assert result.receipt is None
    assert result.findings == []


def policy() -> ToolReceiptPolicy:
    return ToolReceiptPolicy(
        action="write",
        resource_template="provider/customer/{customer_id}",
        required_receipt_fields=[
            "tenant_id",
            "user_id",
            "job_id",
            "case_id",
            "customer_id",
            "approval_id",
            "jit_grant_id",
        ],
        bind_args={
            "job_id": "job_id",
            "case_id": "case_id",
            "customer_id": "customer_id",
            "approval_id": "approval_id",
            "jit_grant_id": "jit_grant_id",
        },
    )


def receipt():
    return {
        "decision_id": "dec-1",
        "tenant_id": "tenant-a",
        "agent_id": "enterprise-support-agent",
        "user_id": "support-rep-17",
        "tool": "provider.crm.update_customer",
        "action": "write",
        "resource": "provider/customer/cus_123",
        "job_id": "support_case_resolution",
        "case_id": "case-1042",
        "customer_id": "cus_123",
        "approval_id": "approval-1",
        "jit_grant_id": "grant-1",
        "enterprise_issuer": "https://idp.example.com",
        "enterprise_subject": "support-rep-17",
        "enterprise_client_id": "claude-enterprise",
        "enterprise_token_audience": "provider-crm-mcp",
        "enterprise_id_jag_grant_id": "id-jag-1",
        "enterprise_scopes": ["openid", "mcp:provider-crm", "crm.write"],
        "enterprise_groups": ["support", "support-admins"],
        "enterprise_acr": "urn:okta:loa:2fa",
        "enterprise_amr": ["pwd", "mfa"],
        "issued_at": "2026-05-28T12:00:00Z",
        "expires_at": "2099-05-28T12:05:00Z",
    }


def tool_args():
    return {
        "customer_id": "cus_123",
        "job_id": "support_case_resolution",
        "case_id": "case-1042",
        "approval_id": "approval-1",
        "jit_grant_id": "grant-1",
    }


def mcp_request(receipt_value, tool="provider.crm.update_customer"):
    return {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool,
            "arguments": {
                **tool_args(),
                "_agentid_receipt": receipt_value,
            },
        },
    }


def instant(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def rsa_key_and_jwks():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("ascii")
    public_jwk = json.loads(RSAAlgorithm.to_jwk(private_key.public_key()))
    public_jwk["kid"] = "agentid-2026-06"
    public_jwk["alg"] = "RS256"
    public_jwk["use"] = "sig"
    return private_pem, {"keys": [public_jwk]}




@pytest.fixture
def anyio_backend():
    return "asyncio"
