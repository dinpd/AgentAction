from __future__ import annotations

from datetime import datetime, timezone

import pytest

from agentid_provider_fastapi import (
    AgentIdReceiptError,
    InMemoryReplayStore,
    ProviderReceiptVerifier,
    ToolReceiptPolicy,
    sign_provider_receipt,
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


def test_verifier_dependency_returns_receipt_for_configured_tool():
    verifier = ProviderReceiptVerifier(
        secret="secret-1",
        now=lambda: instant("2026-05-28T12:01:00Z"),
        tools={"provider.crm.update_customer": policy()},
    )

    result = verifier.verify_body(mcp_request(sign_provider_receipt(receipt(), "secret-1")))

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


@pytest.fixture
def anyio_backend():
    return "asyncio"
