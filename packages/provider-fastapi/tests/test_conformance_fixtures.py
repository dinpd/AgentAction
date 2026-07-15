from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
import pytest

from agentid_provider_fastapi import (
    InMemoryReceiptLedger,
    InMemoryExecutionResultStore,
    InMemoryReplayStore,
    InMemoryRevocationStore,
    ProviderExecutionGate,
    ProviderReceiptVerifier,
    ToolReceiptPolicy,
    sign_provider_receipt,
    sign_provider_receipt_jws,
    verify_provider_receipt,
)


FIXTURES = Path(__file__).resolve().parents[3] / "fixtures" / "provider-receipt-v1" / "cases.json"


@pytest.mark.anyio
async def test_provider_receipt_v1_conformance_cases(anyio_backend):
    corpus = json.loads(FIXTURES.read_text(encoding="utf-8"))
    now = datetime.fromisoformat(corpus["now"].replace("Z", "+00:00"))
    policy_defaults = {
        "action": "write",
        "resource_template": "provider/customer/{customer_id}",
        "required_receipt_fields": ["tenant_id", "user_id", "approval_id", "jit_grant_id", "job_id", "case_id", "customer_id"],
        "bind_args": {
            "job_id": "job_id",
            "case_id": "case_id",
            "customer_id": "customer_id",
            "approval_id": "approval_id",
            "jit_grant_id": "jit_grant_id",
        },
        "single_use": True,
    }

    for case in corpus["cases"]:
        receipt = {**corpus["receipt"], **case.get("receipt_overrides", {})}
        value = None if case.get("missing_receipt") else sign_provider_receipt(receipt, case.get("signing_secret", corpus["secret"]))
        if case.get("jws_unknown_key"):
            value = sign_provider_receipt_jws(receipt, private_key(), key_id="fixture-unknown-key")
        store = InMemoryReplayStore()
        revoked = InMemoryRevocationStore()
        if case.get("revoke"):
            revoked.revoke(receipt["decision_id"])
        options = {
            "secret": corpus["secret"],
            "require_signed": True,
            "tool": receipt["tool"],
            "args": {**corpus["args"], **case.get("args_overrides", {})},
            "policy": ToolReceiptPolicy(**{**policy_defaults, **case.get("policy_overrides", {})}),
            "replay_store": store,
            "revocation_store": revoked,
            "receipt_ledger": InMemoryReceiptLedger() if case.get("ledger") else None,
            "now": lambda: now,
        }
        if case.get("jws_unknown_key"):
            options["jwks"] = {"keys": []}
        if case.get("execution_replay"):
            verifier = ProviderReceiptVerifier(
                secret=corpus["secret"],
                replay_store=store,
                now=lambda: now,
                tools={receipt["tool"]: options["policy"]},
            )
            gate = ProviderExecutionGate(verifier, InMemoryExecutionResultStore())
            body = {
                "method": "tools/call",
                "params": {"name": receipt["tool"], "arguments": {**options["args"], "_agentid_receipt": value}},
            }
            executions = 0

            def handler(verified_receipt):
                nonlocal executions
                executions += 1
                return {"provider_execution_id": "fixture-exec-1", "decision_id": verified_receipt["decision_id"]}

            await gate.execute(body, handler)
            replayed = await gate.execute(body, handler)
            assert replayed.status == case["expect"]["status"], case["id"]
            assert replayed.replay_count == case["expect"]["replay_count"], case["id"]
            assert executions == 1, case["id"]
            continue
        if case.get("preconsume"):
            assert verify_provider_receipt(value, **options).ok

        result = verify_provider_receipt(value, **options)

        assert result.ok is case["expect"]["ok"], case["id"]
        assert result.codes == case["expect"]["codes"], (case["id"], result.findings)


def private_key() -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("ascii")


@pytest.fixture
def anyio_backend():
    return "asyncio"
