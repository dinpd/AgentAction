from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from agentid_provider_fastapi import InMemoryReplayStore, ToolReceiptPolicy, sign_provider_receipt, verify_provider_receipt


FIXTURES = Path(__file__).resolve().parents[3] / "fixtures" / "provider-receipt-v1" / "cases.json"


def test_provider_receipt_v1_conformance_cases():
    corpus = json.loads(FIXTURES.read_text(encoding="utf-8"))
    now = datetime.fromisoformat(corpus["now"].replace("Z", "+00:00"))
    policy = ToolReceiptPolicy(
        action="write",
        resource_template="provider/customer/{customer_id}",
        required_receipt_fields=["tenant_id", "user_id", "approval_id", "jit_grant_id", "job_id", "case_id", "customer_id"],
        bind_args={
            "job_id": "job_id",
            "case_id": "case_id",
            "customer_id": "customer_id",
            "approval_id": "approval_id",
            "jit_grant_id": "jit_grant_id",
        },
        single_use=True,
    )

    for case in corpus["cases"]:
        receipt = {**corpus["receipt"], **case.get("receipt_overrides", {})}
        value = None if case.get("missing_receipt") else sign_provider_receipt(receipt, case.get("signing_secret", corpus["secret"]))
        store = InMemoryReplayStore()
        options = {
            "secret": corpus["secret"],
            "require_signed": True,
            "tool": receipt["tool"],
            "args": corpus["args"],
            "policy": policy,
            "replay_store": store,
            "now": lambda: now,
        }
        if case.get("preconsume"):
            assert verify_provider_receipt(value, **options).ok

        result = verify_provider_receipt(value, **options)

        assert result.ok is case["expect"]["ok"], case["id"]
        assert result.codes == case["expect"]["codes"], (case["id"], result.findings)
