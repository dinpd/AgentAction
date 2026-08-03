#!/usr/bin/env python3
"""Run the non-normative AgentPass MCP authorization interoperability vector."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from agentid.provider import (
    provider_receipt_failure_codes,
    sign_provider_receipt,
    verify_provider_receipt,
)


PUBLIC_TEST_KEY = hashlib.sha256(b"agentpass-public-mcp-interop-vector-v1").hexdigest()


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def sha256_json(value: Any) -> str:
    return "sha256:" + hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def canonical_action(
    call: dict[str, Any], *, audience: str, protocol_version: str
) -> dict[str, Any]:
    params = call.get("params") if isinstance(call.get("params"), dict) else {}
    arguments = params.get("arguments") if isinstance(params.get("arguments"), dict) else {}
    return {
        "protocol": "mcp",
        "protocol_version": protocol_version,
        "audience": audience,
        "method": call.get("method"),
        "tool": params.get("name"),
        "arguments": {key: value for key, value in arguments.items() if key != "_agentid_receipt"},
    }


def action_digest(call: dict[str, Any], *, audience: str, protocol_version: str) -> str:
    return sha256_json(canonical_action(call, audience=audience, protocol_version=protocol_version))


def _set_path(value: dict[str, Any], path: str, replacement: Any) -> None:
    parts = path.split(".")
    current: dict[str, Any] = value
    for part in parts[:-1]:
        child = current.get(part)
        if not isinstance(child, dict):
            raise ValueError(f"override path does not resolve to an object: {path}")
        current = child
    current[parts[-1]] = replacement


def _execution_closure(
    vector: dict[str, Any],
    signed_receipt: dict[str, Any],
    receipt: dict[str, Any],
) -> dict[str, Any]:
    result = vector["provider"]["result"]
    closure = {
        "schema_version": "agentpass.execution-closure.v1",
        "closure_id": vector["provider"]["closure_id"],
        "decision_id": receipt["decision_id"],
        "authorization_evidence_digest": sha256_json(signed_receipt),
        "action_digest": receipt["action_digest"],
        "provider_id": vector["provider"]["id"],
        "status": "executed",
        "executed_at": vector["provider"]["executed_at"],
        "idempotency_key": receipt["idempotency_key"],
        "result_digest": sha256_json(result),
    }
    closure["link_valid"] = (
        closure["decision_id"] == receipt["decision_id"]
        and closure["action_digest"] == receipt["action_digest"]
    )
    return closure


def _expected_result(case: dict[str, Any]) -> dict[str, Any]:
    expected = case["expect"]
    return {
        "ok": expected["ok"],
        "codes": expected["codes"],
        "closure_status": expected.get("closure_status"),
    }


def _observed_result(result: dict[str, Any]) -> dict[str, Any]:
    closure = result.get("closure")
    return {
        "ok": result["ok"],
        "codes": result["codes"],
        "closure_status": closure.get("status") if isinstance(closure, dict) else None,
    }


def run_vector(vector: dict[str, Any]) -> dict[str, Any]:
    receipt_template = copy.deepcopy(vector["authorization_evidence"])
    receipt_template["action_digest"] = action_digest(
        vector["mcp_call"],
        audience=receipt_template["audience"],
        protocol_version=vector["protocol_version"],
    )

    results: list[dict[str, Any]] = []
    for case in vector["cases"]:
        call = copy.deepcopy(vector["mcp_call"])
        for override in case.get("call_overrides", []):
            _set_path(call, override["path"], override["value"])

        receipt = copy.deepcopy(receipt_template)
        signed_receipt = sign_provider_receipt(receipt, PUBLIC_TEST_KEY)
        expected = vector["provider"]["expected_bindings"]
        verification = verify_provider_receipt(
            signed_receipt,
            secret=PUBLIC_TEST_KEY,
            require_signed=True,
            expected_tenant=expected["tenant_id"],
            expected_agent=expected["agent_id"],
            expected_tool=expected["tool"],
            expected_action=expected["action"],
            expected_resource=expected["resource"],
            expected_job=expected["job_id"],
            expected_case=expected["case_id"],
            expected_customer=expected["customer_id"],
            expected_approval=expected["approval_id"],
            expected_jit_grant=expected["jit_grant_id"],
            now=datetime.fromisoformat(vector["now"].replace("Z", "+00:00")),
        )
        findings = list(verification.findings)

        expected_audience = case.get("provider_audience", vector["provider"]["audience"])
        if receipt["audience"] != expected_audience:
            findings.append("receipt audience mismatch")

        actual_action_digest = action_digest(
            call,
            audience=receipt["audience"],
            protocol_version=vector["protocol_version"],
        )
        if receipt["action_digest"] != actual_action_digest:
            findings.append("receipt action_digest mismatch")

        for field, expected_value in expected.items():
            if receipt.get(field) != expected_value:
                findings.append(f"receipt {field} mismatch")

        used_receipts: set[str] = set()
        if case.get("preconsume"):
            used_receipts.add(receipt["decision_id"])
        if not findings and receipt["decision_id"] in used_receipts:
            findings.append("receipt was already used")

        closure = None
        if not findings:
            used_receipts.add(receipt["decision_id"])
            closure = _execution_closure(vector, signed_receipt, receipt)

        result = {
            "id": case["id"],
            "ok": not findings,
            "codes": provider_receipt_failure_codes(findings),
            "findings": findings,
            "closure": closure,
        }
        result["matches_expected"] = _observed_result(result) == _expected_result(case)
        results.append(result)

    return {
        "schema_version": "agentpass.mcp-authorization-interoperability-result.v1",
        "vector_id": vector["vector_id"],
        "all_cases_match": all(result["matches_expected"] for result in results),
        "cases": results,
    }


def load_vector(path: str | Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("vector", type=Path, help="Path to an interoperability vector JSON file")
    args = parser.parse_args()
    result = run_vector(load_vector(args.vector))
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["all_cases_match"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
