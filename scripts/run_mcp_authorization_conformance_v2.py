#!/usr/bin/env python3
"""Run the experimental AgentAction MCP authorization conformance suite v2."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from agentid.provider import (
    provider_receipt_failure_codes,
    sign_provider_receipt_jws,
    verify_provider_receipt,
)


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
        "arguments": {
            key: value
            for key, value in arguments.items()
            if key != "_agentid_receipt"
        },
    }


def action_digest(call: dict[str, Any], *, audience: str, protocol_version: str) -> str:
    return sha256_json(
        canonical_action(call, audience=audience, protocol_version=protocol_version)
    )


def _set_path(value: dict[str, Any], path: str, replacement: Any) -> None:
    parts = path.split(".")
    current: dict[str, Any] = value
    for part in parts[:-1]:
        child = current.get(part)
        if not isinstance(child, dict):
            raise ValueError(f"override path does not resolve to an object: {path}")
        current = child
    current[parts[-1]] = replacement


def _rsa_signing_material(key_id: str) -> tuple[str, dict[str, Any]]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("ascii")
    public_jwk = json.loads(RSAAlgorithm.to_jwk(private_key.public_key()))
    public_jwk.update({"alg": "RS256", "kid": key_id, "use": "sig"})
    return private_pem, {"keys": [public_jwk]}


def _parse_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _append_once(findings: list[str], finding: str) -> None:
    if finding not in findings:
        findings.append(finding)


def _jws_trust_findings(findings: list[str]) -> list[str]:
    return [
        finding
        for finding in findings
        if finding.startswith("receipt JWS") or finding.startswith("receipt JWKS")
    ]


def _verify_case(
    vector: dict[str, Any],
    case: dict[str, Any],
    call: dict[str, Any],
    receipt: dict[str, Any],
    signed_receipt: dict[str, Any],
    trusted_jwks: dict[str, Any],
) -> list[str]:
    provider = vector["provider"]
    expected = provider["expected_bindings"]
    expected_audience = case.get("provider_audience", provider["audience"])
    now = _parse_timestamp(vector["now"])
    if now is None:
        raise ValueError("vector now must be an ISO-8601 timestamp")

    verification = verify_provider_receipt(
        signed_receipt,
        jwks=trusted_jwks,
        expected_issuer=provider["trusted_issuer"],
        expected_audience=expected_audience,
        allowed_algs=["RS256"],
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
        now=now,
    )
    trust_findings = _jws_trust_findings(verification.findings)
    if trust_findings:
        return trust_findings

    findings = list(verification.findings)
    actual_digest = action_digest(
        call,
        audience=receipt["audience"],
        protocol_version=vector["protocol_version"],
    )
    if receipt.get("action_digest") != actual_digest:
        _append_once(findings, "receipt action_digest mismatch")

    for field, expected_value in expected.items():
        if receipt.get(field) != expected_value:
            _append_once(findings, f"receipt {field} mismatch")

    approval_expires_at = _parse_timestamp(receipt.get("approval_expires_at"))
    if approval_expires_at is None:
        _append_once(findings, "receipt approval_expires_at is invalid")
    elif approval_expires_at <= now:
        _append_once(findings, "receipt approval is expired")

    revoked_risk_refs = case.get("revoked_risk_state_refs", [])
    if receipt.get("risk_state_ref") in revoked_risk_refs:
        _append_once(findings, "receipt risk state is revoked")

    return findings


def _execution_closure(
    vector: dict[str, Any],
    receipt: dict[str, Any],
    *,
    attempt: int,
    status: str,
) -> dict[str, Any]:
    provider = vector["provider"]
    result = provider["partial_result"] if status == "partial" else provider["result"]
    closure = {
        "schema_version": "agentpass.execution-closure.v2",
        "closure_id": f"{provider['closure_id_prefix']}-{attempt}",
        "decision_id": receipt["decision_id"],
        "authorization_evidence_digest": sha256_json(receipt),
        "action_digest": receipt["action_digest"],
        "provider_id": provider["id"],
        "status": status,
        "executed_at": provider["attempt_times"][attempt - 1],
        "idempotency_key": receipt["idempotency_key"],
        "result_digest": sha256_json(result),
    }
    closure["link_valid"] = (
        closure["decision_id"] == receipt["decision_id"]
        and closure["action_digest"] == receipt["action_digest"]
    )
    return closure


def _execute_case(
    vector: dict[str, Any], case: dict[str, Any], receipt: dict[str, Any]
) -> dict[str, Any]:
    attempts: list[dict[str, Any]] = []
    completed_closure: dict[str, Any] | None = None
    completed_mutations = 0
    partial_attempts = 0

    for attempt_number, instruction in enumerate(
        case.get("execution_plan", ["execute"]), start=1
    ):
        if instruction == "retry":
            if completed_closure is None:
                raise ValueError("retry requires a prior completed closure")
            attempts.append(
                {
                    "attempt": attempt_number,
                    "disposition": "replayed",
                    "closure": copy.deepcopy(completed_closure),
                }
            )
            continue

        if instruction == "partial":
            partial_attempts += 1
            status = "partial"
            disposition = "partial"
        elif instruction == "execute":
            completed_mutations += 1
            status = "executed"
            disposition = "executed"
        else:
            raise ValueError(f"unsupported execution instruction: {instruction}")

        closure = _execution_closure(
            vector,
            receipt,
            attempt=attempt_number,
            status=status,
        )
        attempts.append(
            {
                "attempt": attempt_number,
                "disposition": disposition,
                "closure": closure,
            }
        )
        if status == "executed":
            completed_closure = closure

    return {
        "attempts": attempts,
        "completed_mutations": completed_mutations,
        "partial_attempts": partial_attempts,
    }


def _observed_result(result: dict[str, Any]) -> dict[str, Any]:
    attempts = result.get("attempts", [])
    return {
        "ok": result["ok"],
        "codes": result["codes"],
        "closure_statuses": [attempt["closure"]["status"] for attempt in attempts],
        "dispositions": [attempt["disposition"] for attempt in attempts],
        "completed_mutations": result["completed_mutations"],
        "partial_attempts": result["partial_attempts"],
    }


def _expected_result(case: dict[str, Any]) -> dict[str, Any]:
    expected = case["expect"]
    return {
        "ok": expected["ok"],
        "codes": expected.get("codes", []),
        "closure_statuses": expected.get("closure_statuses", []),
        "dispositions": expected.get("dispositions", []),
        "completed_mutations": expected.get("completed_mutations", 0),
        "partial_attempts": expected.get("partial_attempts", 0),
    }


def run_suite(vector: dict[str, Any]) -> dict[str, Any]:
    provider = vector["provider"]
    trusted_private_key, trusted_jwks = _rsa_signing_material(provider["key_id"])
    untrusted_private_key, _ = _rsa_signing_material("untrusted-test-key")

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
        for override in case.get("receipt_overrides", []):
            _set_path(receipt, override["path"], override["value"])

        signer = (
            untrusted_private_key
            if case.get("signing_key") == "untrusted"
            else trusted_private_key
        )
        key_id = (
            "untrusted-test-key"
            if case.get("signing_key") == "untrusted"
            else provider["key_id"]
        )
        signed_receipt = sign_provider_receipt_jws(
            receipt,
            signer,
            issuer=receipt["issuer"],
            subject=receipt["agent_id"],
            audience=receipt["audience"],
            key_id=key_id,
            algorithm="RS256",
        )

        findings = _verify_case(
            vector,
            case,
            call,
            receipt,
            signed_receipt,
            trusted_jwks,
        )
        execution = (
            _execute_case(vector, case, receipt)
            if not findings
            else {"attempts": [], "completed_mutations": 0, "partial_attempts": 0}
        )
        result = {
            "id": case["id"],
            "ok": not findings,
            "codes": provider_receipt_failure_codes(findings),
            "findings": findings,
            **execution,
        }
        result["matches_expected"] = _observed_result(result) == _expected_result(case)
        results.append(result)

    return {
        "schema_version": "agentpass.mcp-authorization-conformance-result.v2",
        "suite_id": vector["suite_id"],
        "signing_profile": "RS256/JWKS",
        "trusted_key_id": provider["key_id"],
        "all_cases_match": all(result["matches_expected"] for result in results),
        "cases": results,
    }


def load_vector(path: str | Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("vector", type=Path, help="Path to the v2 suite vector JSON")
    args = parser.parse_args()
    result = run_suite(load_vector(args.vector))
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["all_cases_match"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
