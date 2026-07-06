from __future__ import annotations

import json
from dataclasses import dataclass
import base64
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib import error as urllib_error
from urllib import request as urllib_request

import jwt
import yaml

from agentid.manifest import ValidationResult


class ProviderContractError(Exception):
    """Raised when a provider MCP contract cannot be loaded or parsed."""


VALID_ACTIONS = {"read", "write", "send", "admin", "execute"}
VALID_APPROVALS = {"none", "notify", "required", "human_confirm", "step_up", "manager", "block"}
VALID_RISKS = {"low", "medium", "high", "critical"}
VALID_RECEIPT_CANONICALIZATION = {"agentid_canonical_json_v1"}
VALID_RECEIPT_DIGESTS = {"SHA-256"}
VALID_RECEIPT_BASIS_HANDLING = {"omit", "categorical", "reference", "categorical_or_reference"}
REQUIRED_HIGH_RISK_CONTEXT = {"tenant_id", "agent_id", "user_id"}
REQUIRED_HIGH_RISK_BINDINGS = {"tenant_id", "agent_id", "tool", "action", "resource"}
JIT_BINDINGS = {"approval_id", "jit_grant_id"}
FINANCIAL_HINTS = ("credit", "refund", "payment", "charge", "purchase", "discount")
ADMIN_HINTS = ("admin", "role", "permission", "policy", "token", "secret", "key")
RISK_ORDER = {"low": 1, "medium": 2, "high": 3, "critical": 4}
HTTP_METHODS = {"get", "post", "put", "patch", "delete"}
DEFAULT_RECEIPT_JWKS_CACHE_TTL_SECONDS = 300
DEFAULT_RECEIPT_JWKS_STALE_IF_ERROR_SECONDS = 300
DEFAULT_RECEIPT_JWKS_TIMEOUT_SECONDS = 5.0


@dataclass(frozen=True)
class ProviderContractDiff:
    added_tools: list[str]
    removed_tools: list[str]
    changed_tools: list[str]
    findings: list[str]


@dataclass(frozen=True)
class ProviderReceiptVerification:
    ok: bool
    receipt: dict[str, Any] | None
    findings: list[str]


@dataclass
class ProviderReceiptJwksCacheEntry:
    jwks: dict[str, Any]
    expires_at: datetime
    stale_until: datetime


class ProviderReceiptJwksCache:
    def __init__(self) -> None:
        self._entries: dict[str, ProviderReceiptJwksCacheEntry] = {}

    def get(
        self,
        jwks_uri: str,
        *,
        ttl_seconds: int = DEFAULT_RECEIPT_JWKS_CACHE_TTL_SECONDS,
        stale_if_error_seconds: int = DEFAULT_RECEIPT_JWKS_STALE_IF_ERROR_SECONDS,
        timeout_seconds: float = DEFAULT_RECEIPT_JWKS_TIMEOUT_SECONDS,
        now: datetime | None = None,
        force_refresh: bool = False,
    ) -> dict[str, Any]:
        current = now or datetime.now(timezone.utc)
        entry = self._entries.get(jwks_uri)
        if entry and not force_refresh and entry.expires_at > current:
            return entry.jwks

        try:
            jwks = fetch_provider_receipt_jwks(jwks_uri, timeout_seconds=timeout_seconds)
        except ProviderContractError:
            if entry and entry.stale_until > current:
                return entry.jwks
            raise

        expires_at = current + timedelta(seconds=max(ttl_seconds, 0))
        stale_until = expires_at + timedelta(seconds=max(stale_if_error_seconds, 0))
        self._entries[jwks_uri] = ProviderReceiptJwksCacheEntry(
            jwks=jwks,
            expires_at=expires_at,
            stale_until=stale_until,
        )
        return jwks


def load_provider_schema() -> dict[str, Any]:
    schema_path = Path(__file__).resolve().parent.parent / "schema" / "provider-mcp-contract.schema.json"
    return json.loads(schema_path.read_text(encoding="utf-8"))


def provider_schema_json(indent: int = 2) -> str:
    return json.dumps(load_provider_schema(), indent=indent) + "\n"


def load_provider_contract(path: str | Path) -> dict[str, Any]:
    contract_path = Path(path)
    if not contract_path.exists():
        raise ProviderContractError(f"Provider contract not found: {contract_path}")

    try:
        data = yaml.safe_load(contract_path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as exc:
        raise ProviderContractError(f"Invalid YAML: {exc}") from exc

    if not isinstance(data, dict):
        raise ProviderContractError("Provider contract root must be a mapping/object.")
    return data


def validate_provider_contract(contract: dict[str, Any]) -> ValidationResult:
    errors: list[str] = []
    warnings: list[str] = []

    root = contract.get("provider_agentid")
    if not isinstance(root, dict):
        errors.append("Missing required section: provider_agentid")
        return ValidationResult(ok=False, errors=errors, warnings=warnings)

    for field in ["provider", "mcp_server", "tools"]:
        if not root.get(field):
            errors.append(f"provider_agentid.{field} is required.")

    tools = root.get("tools")
    if not isinstance(tools, dict) or not tools:
        errors.append("provider_agentid.tools must be a non-empty object.")
        return ValidationResult(ok=False, errors=errors, warnings=warnings)

    receipt_profile = _receipt_profile(root.get("receipt"))
    _validate_receipt_trust_policy(root.get("receipt"), "provider_agentid.receipt", errors, warnings)

    for name, tool in tools.items():
        prefix = f"provider_agentid.tools.{name}"
        if not isinstance(tool, dict):
            errors.append(f"{prefix} must be an object.")
            continue
        _validate_provider_tool(str(name), tool, prefix, receipt_profile, errors, warnings)

    return ValidationResult(ok=not errors, errors=errors, warnings=warnings)


def diff_provider_contracts(before: dict[str, Any], after: dict[str, Any]) -> ProviderContractDiff:
    before_tools = _tools(before)
    after_tools = _tools(after)

    before_names = set(before_tools)
    after_names = set(after_tools)
    added = sorted(after_names - before_names)
    removed = sorted(before_names - after_names)
    common = sorted(before_names & after_names)

    changed: list[str] = []
    findings: list[str] = []

    for name in added:
        findings.append(f"added tool: {name}")
        tool = after_tools[name]
        if _is_high_blast_radius(name, tool):
            findings.append(f"new high-blast-radius tool: {name} ({tool.get('risk', 'unknown')})")

    for name in removed:
        findings.append(f"removed tool: {name}")

    for name in common:
        before_tool = before_tools[name]
        after_tool = after_tools[name]
        changes = _tool_changes(name, before_tool, after_tool)
        if changes:
            changed.append(name)
            findings.extend(changes)

    return ProviderContractDiff(
        added_tools=added,
        removed_tools=removed,
        changed_tools=changed,
        findings=findings,
    )


def provider_diff_to_dict(diff: ProviderContractDiff) -> dict[str, Any]:
    return {
        "added_tools": diff.added_tools,
        "removed_tools": diff.removed_tools,
        "changed_tools": diff.changed_tools,
        "findings": diff.findings,
    }


def format_provider_diff(diff: ProviderContractDiff) -> str:
    lines = [
        "Provider MCP contract diff",
        f"Added tools: {len(diff.added_tools)}",
        f"Removed tools: {len(diff.removed_tools)}",
        f"Changed tools: {len(diff.changed_tools)}",
    ]
    if diff.added_tools:
        lines.append("Added:")
        lines.extend(f"- {name}" for name in diff.added_tools)
    if diff.removed_tools:
        lines.append("Removed:")
        lines.extend(f"- {name}" for name in diff.removed_tools)
    if diff.changed_tools:
        lines.append("Changed:")
        lines.extend(f"- {name}" for name in diff.changed_tools)
    if diff.findings:
        lines.append("Findings:")
        lines.extend(f"- {finding}" for finding in diff.findings)
    return "\n".join(lines) + "\n"


def import_provider_contract(
    contract: dict[str, Any],
    agent_id: str,
    *,
    agent_name: str | None = None,
    owner: str = "enterprise-ai-platform",
    environment: str = "production",
) -> dict[str, Any]:
    validation = validate_provider_contract(contract)
    if not validation.ok:
        raise ProviderContractError("Provider contract is not valid: " + "; ".join(validation.errors))

    root = contract["provider_agentid"]
    tools = _tools(contract)
    generated_tools = []
    data_flows: list[dict[str, Any]] = []
    mappings: dict[str, dict[str, Any]] = {}
    bind_authorization_to = {"job_id", "case_id", "customer_id"}
    default_ttl = 300

    for name, tool in sorted(tools.items()):
        high_risk = _is_high_blast_radius(name, tool)
        auth = tool.get("authorization_requirements") if isinstance(tool.get("authorization_requirements"), dict) else {}
        action = str(tool.get("action", "read"))
        approval = str(tool.get("approval", "human_confirm" if high_risk else "none"))
        ttl = _receipt_ttl(tool)
        if high_risk and ttl:
            default_ttl = min(default_ttl, ttl)

        generated_tool: dict[str, Any] = {
            "name": name,
            "access": action,
            "auth_mode": "just_in_time" if high_risk else "delegated",
            "approval": approval,
        }
        constraints: dict[str, Any] = {}
        if high_risk and ttl:
            constraints["token_ttl_seconds"] = ttl
        if tool.get("resource_template"):
            constraints["resource"] = _resource_pattern(str(tool["resource_template"]))
        if isinstance(tool.get("constraints"), dict):
            constraints.update(tool["constraints"])
        if constraints:
            generated_tool["constraints"] = constraints
        generated_tools.append(generated_tool)

        mapping: dict[str, Any] = {"action": action}
        if tool.get("resource_template"):
            mapping["resource_template"] = tool["resource_template"]
        elif auth.get("resource_arg"):
            mapping["resource_arg"] = auth["resource_arg"]
        for context_field in ["job_id", "case_id", "customer_id", "user_id"]:
            if _context_required(auth, context_field) or _input_has_field(tool, context_field):
                mapping[f"{context_field}_arg"] = context_field
        if high_risk:
            mapping["approved_arg"] = "approved"
            mapping["jit_grant_id_arg"] = "jit_grant_id"
            mapping["approval_id_arg"] = "approval_id"
        if auth.get("amount_arg"):
            mapping["amount_arg"] = auth["amount_arg"]
        mappings[name] = mapping

        if tool.get("data_from") and tool.get("data_to"):
            flow = {"from": tool["data_from"], "to": tool["data_to"], "allowed": True}
            if flow not in data_flows:
                data_flows.append(flow)

    return {
        "agent": {
            "id": agent_id,
            "name": agent_name or _title_from_id(agent_id),
            "owner": owner,
            "environment": environment,
            "purpose": f"Uses reviewed MCP tools from {root.get('provider')} / {root.get('mcp_server')}",
            "expires_at": None,
        },
        "delegation": {
            "acts_for": {"type": "user", "required": True},
            "allowed_subjects": ["review_required"],
        },
        "delegation_chain": {
            "may_call_agents": False,
            "allowed_agents": [],
            "max_depth": 1,
        },
        "intent": {
            "confirmation_required_for": ["provider_write", "payment", "account_update", "external_send"],
        },
        "job_boundary": {
            "required": True,
            "allowed_jobs": ["review_required"],
            "out_of_scope": [],
            "require_job_id": True,
            "bind_authorization_to": sorted(bind_authorization_to),
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
                "policy_write": "agentid.policy.write",
                "jit_grant": "agentid.jit.grant",
            },
        },
        "jit_authorization": {
            "enabled": any(tool.get("auth_mode") == "just_in_time" for tool in generated_tools),
            "default_ttl_seconds": default_ttl,
            "require_fresh_context": True,
            "bind_token_to": [
                "agent_id",
                "user_id",
                "tool",
                "action",
                "resource",
                "approval_id",
                "job_id",
                "case_id",
                "customer_id",
            ],
            "revoke_after_use": True,
            "max_session_extensions": 0,
        },
        "mcp_gateway": {
            "mode": "enterprise_proxy",
            "provider": root.get("provider"),
            "downstream_server": root.get("mcp_server"),
            "tool_argument_mapping": mappings,
        },
        "tools": generated_tools,
        "data_flows": data_flows,
        "risk_tiers": {
            "low": {"approval": "none"},
            "medium": {"approval": "notify"},
            "high": {"approval": "human_confirm"},
            "critical": {"approval": "block"},
        },
        "runtime": {
            "enforce_manifest": True,
            "detect_tool_drift": True,
            "detect_new_destinations": True,
        },
        "audit": {
            "log_prompt_summary": True,
            "log_tool_calls": True,
            "log_decisions": True,
            "log_jit_grants": True,
            "retain_days": 365,
        },
        "kill_switch": {
            "enabled": True,
            "revoke_on_policy_violation": True,
        },
    }


def provider_manifest_yaml(manifest: dict[str, Any]) -> str:
    return yaml.safe_dump(manifest, sort_keys=False, allow_unicode=False)


def provider_contract_from_openapi(
    spec: dict[str, Any],
    *,
    provider: str | None = None,
    mcp_server: str | None = None,
    tool_prefix: str | None = None,
) -> dict[str, Any]:
    if not isinstance(spec, dict):
        raise ProviderContractError("OpenAPI document must be an object.")
    paths = spec.get("paths")
    if not isinstance(paths, dict) or not paths:
        raise ProviderContractError("OpenAPI document must contain a non-empty paths object.")

    inferred_provider = provider or _slug(str(spec.get("info", {}).get("title", "provider")))
    inferred_mcp_server = mcp_server or f"{inferred_provider}-mcp"
    prefix = tool_prefix or inferred_provider
    tools: dict[str, Any] = {}

    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue
        path_parameters = _parameters(path_item.get("parameters"), spec)
        for method, operation in path_item.items():
            if method.lower() not in HTTP_METHODS or not isinstance(operation, dict):
                continue
            tool_name = f"{prefix}.{_operation_slug(method.lower(), str(path), operation)}"
            input_schema = _input_schema(spec, operation, path_parameters)
            action = _action_for_method(method.lower())
            risk = _risk_for_operation(method.lower(), tool_name, operation)
            high_risk = risk in {"high", "critical"} or action in {"write", "send", "admin", "execute"}
            resource_template = _resource_template(inferred_provider, str(path))

            tool: dict[str, Any] = {
                "action": action,
                "risk": risk,
                "resource_template": resource_template,
                "data_from": f"{inferred_provider}_api" if action == "read" else "enterprise_context",
                "data_to": "agent_context" if action == "read" else f"{inferred_provider}_api",
                "requires_jit": high_risk,
                "receipt_required": high_risk,
                "input_schema": input_schema,
            }
            if operation.get("summary") or operation.get("description"):
                tool["description"] = operation.get("summary") or operation.get("description")

            if high_risk:
                tool["approval"] = "manager" if _looks_financial(tool_name) else "human_confirm"
                auth = {
                    "required_context": ["tenant_id", "agent_id", "user_id", "job_id", "case_id", "approval_id"],
                    "bind_receipt_to": [
                        "tenant_id",
                        "agent_id",
                        "user_id",
                        "tool",
                        "action",
                        "resource",
                        "job_id",
                        "case_id",
                        "approval_id",
                        "jit_grant_id",
                    ],
                    "receipt_ttl_seconds": 180 if _looks_financial(tool_name) else 300,
                    "single_use": True,
                }
                first_path_arg = _first_path_arg(str(path))
                if first_path_arg:
                    auth["resource_arg"] = first_path_arg
                amount_arg = _amount_arg(input_schema)
                if amount_arg:
                    auth["amount_arg"] = amount_arg
                tool["authorization_requirements"] = auth
            else:
                tool["approval"] = "none"

            tools[tool_name] = tool

    return {
        "provider_agentid": {
            "provider": inferred_provider,
            "mcp_server": inferred_mcp_server,
            "version": "review_required",
            "source": "openapi",
            "receipt": {
                "profile": _default_receipt_profile(),
            },
            "tools": tools,
        }
    }


def provider_contract_yaml(contract: dict[str, Any]) -> str:
    return yaml.safe_dump(contract, sort_keys=False, allow_unicode=False)


def sign_provider_receipt(receipt: dict[str, Any], secret: str) -> dict[str, Any]:
    return {
        "alg": "HS256",
        "payload": receipt,
        "signature": _receipt_signature(receipt, secret),
    }


def sign_provider_receipt_jws(
    receipt: dict[str, Any],
    private_key_pem: str,
    *,
    issuer: str | None = None,
    subject: str | None = None,
    audience: str | None = None,
    key_id: str | None = None,
    algorithm: str = "RS256",
) -> dict[str, Any]:
    claims: dict[str, Any] = {"receipt": receipt}
    if issuer:
        claims["iss"] = issuer
    if subject:
        claims["sub"] = subject
    if audience:
        claims["aud"] = audience
    issued_at = _parse_timestamp(receipt.get("issued_at"))
    expires_at = _parse_timestamp(receipt.get("expires_at"))
    if issued_at:
        claims["iat"] = int(issued_at.timestamp())
    if expires_at:
        claims["exp"] = int(expires_at.timestamp())
    if receipt.get("decision_id"):
        claims["jti"] = receipt["decision_id"]
    headers = {"kid": key_id} if key_id else None
    return {"jws": jwt.encode(claims, private_key_pem, algorithm=algorithm, headers=headers)}


def fetch_provider_receipt_jwks(
    jwks_uri: str,
    *,
    timeout_seconds: float = DEFAULT_RECEIPT_JWKS_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    try:
        with urllib_request.urlopen(
            urllib_request.Request(jwks_uri, headers={"accept": "application/json"}),
            timeout=timeout_seconds,
        ) as response:
            payload = response.read().decode("utf-8")
    except (ValueError, urllib_error.URLError, TimeoutError) as exc:
        raise ProviderContractError(f"failed to fetch receipt JWKS: {exc}") from exc

    try:
        jwks = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise ProviderContractError(f"receipt JWKS response is not valid JSON: {exc}") from exc
    if not isinstance(jwks, dict) or not isinstance(jwks.get("keys"), list):
        raise ProviderContractError("receipt JWKS response must be a JSON object with a keys array")
    return jwks


def verify_provider_receipt(
    value: Any,
    *,
    secret: str | None = None,
    jwks: dict[str, Any] | None = None,
    jwks_uri: str | None = None,
    jwks_cache: ProviderReceiptJwksCache | None = None,
    jwks_cache_ttl_seconds: int = DEFAULT_RECEIPT_JWKS_CACHE_TTL_SECONDS,
    jwks_stale_if_error_seconds: int = DEFAULT_RECEIPT_JWKS_STALE_IF_ERROR_SECONDS,
    jwks_timeout_seconds: float = DEFAULT_RECEIPT_JWKS_TIMEOUT_SECONDS,
    expected_issuer: str | None = None,
    expected_audience: str | None = None,
    allowed_algs: list[str] | None = None,
    require_signed: bool = False,
    expected_tenant: str | None = None,
    expected_agent: str | None = None,
    expected_tool: str | None = None,
    expected_action: str | None = None,
    expected_resource: str | None = None,
    expected_job: str | None = None,
    expected_case: str | None = None,
    expected_customer: str | None = None,
    expected_approval: str | None = None,
    expected_jit_grant: str | None = None,
    expected_amount: str | None = None,
    now: datetime | None = None,
) -> ProviderReceiptVerification:
    findings: list[str] = []
    receipt = value

    if isinstance(value, dict) and _is_jws_receipt(value):
        signature_result = _verify_jws_receipt_with_remote_jwks(
            value,
            jwks=jwks,
            jwks_uri=jwks_uri,
            jwks_cache=jwks_cache,
            jwks_cache_ttl_seconds=jwks_cache_ttl_seconds,
            jwks_stale_if_error_seconds=jwks_stale_if_error_seconds,
            jwks_timeout_seconds=jwks_timeout_seconds,
            expected_issuer=expected_issuer,
            expected_audience=expected_audience,
            allowed_algs=allowed_algs,
            now=now,
        )
        receipt = signature_result.receipt or {}
        findings.extend(signature_result.findings)
    elif isinstance(value, dict) and _is_signed_receipt(value):
        if secret is None:
            return ProviderReceiptVerification(False, None, ["receipt signature secret is required"])
        signature_result = _verify_signed_receipt(value, secret)
        receipt = signature_result.receipt or {}
        findings.extend(signature_result.findings)
    elif require_signed:
        findings.append("receipt must be signed")

    if not isinstance(receipt, dict) or not receipt:
        return ProviderReceiptVerification(False, None, findings or ["receipt payload is required"])

    for field in ["decision_id", "agent_id", "tool", "action", "issued_at", "expires_at"]:
        if not _string(receipt.get(field)):
            findings.append(f"receipt {field} is required")

    checks = {
        "tenant_id": expected_tenant,
        "agent_id": expected_agent,
        "tool": expected_tool,
        "action": expected_action,
        "resource": expected_resource,
        "job_id": expected_job,
        "case_id": expected_case,
        "customer_id": expected_customer,
        "approval_id": expected_approval,
        "jit_grant_id": expected_jit_grant,
        "amount": expected_amount,
    }
    for field, expected in checks.items():
        if expected is not None and _string(receipt.get(field)) != expected:
            findings.append(f"receipt {field} mismatch")

    current = now or datetime.now(timezone.utc)
    expires_at = _parse_timestamp(receipt.get("expires_at"))
    if expires_at is None:
        findings.append("receipt expires_at is invalid")
    elif expires_at <= current:
        findings.append("receipt is expired")

    issued_at = _parse_timestamp(receipt.get("issued_at"))
    if issued_at is None:
        findings.append("receipt issued_at is invalid")
    elif issued_at > current:
        findings.append("receipt issued_at is in the future")

    return ProviderReceiptVerification(ok=not findings, receipt=receipt, findings=findings)


def _validate_provider_tool(
    name: str,
    tool: dict[str, Any],
    prefix: str,
    receipt_profile: dict[str, Any] | None,
    errors: list[str],
    warnings: list[str],
) -> None:
    action = tool.get("action")
    if action not in VALID_ACTIONS:
        errors.append(f"{prefix}.action must be one of: {', '.join(sorted(VALID_ACTIONS))}.")

    risk = tool.get("risk")
    if risk not in VALID_RISKS:
        errors.append(f"{prefix}.risk must be one of: {', '.join(sorted(VALID_RISKS))}.")

    approval = tool.get("approval", "none")
    if approval not in VALID_APPROVALS:
        errors.append(f"{prefix}.approval must be one of: {', '.join(sorted(VALID_APPROVALS))}.")

    input_schema = tool.get("input_schema")
    if input_schema is not None and not isinstance(input_schema, dict):
        errors.append(f"{prefix}.input_schema must be an object.")

    if not tool.get("resource_template"):
        if _is_high_blast_radius(name, tool):
            errors.append(f"{prefix}.resource_template is required for high-blast-radius tools.")
        else:
            warnings.append(f"{prefix}.resource_template is not set.")

    if not tool.get("data_from"):
        warnings.append(f"{prefix}.data_from is not set.")
    if not tool.get("data_to"):
        warnings.append(f"{prefix}.data_to is not set.")

    if _is_high_blast_radius(name, tool):
        _validate_high_blast_radius_tool(name, tool, prefix, receipt_profile, errors, warnings)


def _receipt_profile(receipt: Any) -> dict[str, Any] | None:
    if not isinstance(receipt, dict):
        return None
    profile = receipt.get("profile")
    return profile if isinstance(profile, dict) else None


def _validate_receipt_trust_policy(
    receipt: Any,
    prefix: str,
    errors: list[str],
    warnings: list[str],
) -> None:
    if receipt is None:
        return
    if not isinstance(receipt, dict):
        errors.append(f"{prefix} must be an object.")
        return

    profile = receipt.get("profile")
    if profile is not None and not isinstance(profile, dict):
        errors.append(f"{prefix}.profile must be an object.")
        return
    if not isinstance(profile, dict):
        warnings.append(f"{prefix}.profile is not set. Receipt semantics will be deployment-specific.")
        return

    if not _string(profile.get("uri")):
        errors.append(f"{prefix}.profile.uri is required.")

    canonicalization = profile.get("canonicalization")
    if canonicalization not in VALID_RECEIPT_CANONICALIZATION:
        errors.append(
            f"{prefix}.profile.canonicalization must be one of: "
            + ", ".join(sorted(VALID_RECEIPT_CANONICALIZATION))
            + "."
        )

    digest_algorithm = profile.get("digest_algorithm")
    if digest_algorithm is not None and digest_algorithm not in VALID_RECEIPT_DIGESTS:
        errors.append(
            f"{prefix}.profile.digest_algorithm must be one of: "
            + ", ".join(sorted(VALID_RECEIPT_DIGESTS))
            + "."
        )

    default_bindings = profile.get("default_bindings")
    if default_bindings is not None and _string_set(default_bindings) is None:
        errors.append(f"{prefix}.profile.default_bindings must be a list of strings.")

    outcomes = profile.get("outcomes")
    if not isinstance(outcomes, list) or not outcomes:
        errors.append(f"{prefix}.profile.outcomes must be a non-empty list.")
    else:
        for index, outcome in enumerate(outcomes):
            outcome_prefix = f"{prefix}.profile.outcomes[{index}]"
            if not isinstance(outcome, dict):
                errors.append(f"{outcome_prefix} must be an object.")
                continue
            if not _string(outcome.get("value")):
                errors.append(f"{outcome_prefix}.value is required.")
            if not _string(outcome.get("description")):
                errors.append(f"{outcome_prefix}.description is required.")

    basis = profile.get("basis")
    if basis is not None:
        if not isinstance(basis, dict):
            errors.append(f"{prefix}.profile.basis must be an object.")
        elif basis.get("handling") not in VALID_RECEIPT_BASIS_HANDLING:
            errors.append(
                f"{prefix}.profile.basis.handling must be one of: "
                + ", ".join(sorted(VALID_RECEIPT_BASIS_HANDLING))
                + "."
            )


def _tools(contract: dict[str, Any]) -> dict[str, dict[str, Any]]:
    root = contract.get("provider_agentid")
    if not isinstance(root, dict):
        return {}
    tools = root.get("tools")
    if not isinstance(tools, dict):
        return {}
    return {str(name): tool for name, tool in tools.items() if isinstance(tool, dict)}


def _tool_changes(name: str, before: dict[str, Any], after: dict[str, Any]) -> list[str]:
    findings: list[str] = []
    for field in [
        "action",
        "risk",
        "resource_template",
        "requires_jit",
        "approval",
        "receipt_required",
    ]:
        if before.get(field) != after.get(field):
            findings.append(f"{name} changed {field}: {before.get(field)!r} -> {after.get(field)!r}")

    before_risk = str(before.get("risk", "low"))
    after_risk = str(after.get("risk", "low"))
    if RISK_ORDER.get(after_risk, 0) > RISK_ORDER.get(before_risk, 0):
        findings.append(f"{name} risk increased: {before_risk} -> {after_risk}")

    before_auth = before.get("authorization_requirements") if isinstance(before.get("authorization_requirements"), dict) else {}
    after_auth = after.get("authorization_requirements") if isinstance(after.get("authorization_requirements"), dict) else {}
    for field in [
        "required_context",
        "bind_receipt_to",
        "resource_arg",
        "amount_arg",
        "receipt_ttl_seconds",
        "single_use",
    ]:
        if _canonical(before_auth.get(field)) != _canonical(after_auth.get(field)):
            findings.append(f"{name} changed authorization_requirements.{field}")

    if _canonical(before.get("constraints")) != _canonical(after.get("constraints")):
        findings.append(f"{name} changed constraints")

    if _canonical(before.get("input_schema")) != _canonical(after.get("input_schema")):
        findings.append(f"{name} changed input_schema")

    if not _is_high_blast_radius(name, before) and _is_high_blast_radius(name, after):
        findings.append(f"{name} became high-blast-radius")

    return findings


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _validate_high_blast_radius_tool(
    name: str,
    tool: dict[str, Any],
    prefix: str,
    receipt_profile: dict[str, Any] | None,
    errors: list[str],
    warnings: list[str],
) -> None:
    if tool.get("receipt_required") is not True:
        errors.append(f"{prefix}.receipt_required must be true for high-blast-radius tools.")

    if tool.get("requires_jit") is not True:
        errors.append(f"{prefix}.requires_jit must be true for high-blast-radius tools.")

    approval = tool.get("approval", "none")
    if approval in {"none", "notify"}:
        errors.append(f"{prefix}.approval must require explicit approval for high-blast-radius tools.")

    auth = tool.get("authorization_requirements")
    if not isinstance(auth, dict):
        errors.append(f"{prefix}.authorization_requirements is required for high-blast-radius tools.")
        return

    required_context = _string_set(auth.get("required_context"))
    if required_context is None:
        errors.append(f"{prefix}.authorization_requirements.required_context must be a list of strings.")
    else:
        missing_context = REQUIRED_HIGH_RISK_CONTEXT - required_context
        if missing_context:
            errors.append(
                f"{prefix}.authorization_requirements.required_context is missing: "
                + ", ".join(sorted(missing_context))
            )
        if tool.get("requires_jit") is True and "approval_id" not in required_context:
            errors.append(f"{prefix}.authorization_requirements.required_context must include approval_id for JIT tools.")

    bindings = _string_set(auth.get("bind_receipt_to"))
    if bindings is None:
        errors.append(f"{prefix}.authorization_requirements.bind_receipt_to must be a list of strings.")
    else:
        missing_bindings = REQUIRED_HIGH_RISK_BINDINGS - bindings
        if missing_bindings:
            errors.append(
                f"{prefix}.authorization_requirements.bind_receipt_to is missing: "
                + ", ".join(sorted(missing_bindings))
            )
        if tool.get("requires_jit") is True:
            missing_jit = JIT_BINDINGS - bindings
            if missing_jit:
                errors.append(
                    f"{prefix}.authorization_requirements.bind_receipt_to is missing JIT bindings: "
                    + ", ".join(sorted(missing_jit))
                )
        if receipt_profile:
            default_bindings = _string_set(receipt_profile.get("default_bindings")) or set()
            missing_profile_bindings = default_bindings - bindings
            if missing_profile_bindings:
                errors.append(
                    f"{prefix}.authorization_requirements.bind_receipt_to is missing profile bindings: "
                    + ", ".join(sorted(missing_profile_bindings))
                )

    required_receipt_values = auth.get("required_receipt_values", {})
    if required_receipt_values and not _valid_required_receipt_values(required_receipt_values):
        errors.append(f"{prefix}.authorization_requirements.required_receipt_values must map fields to strings or string lists.")

    if not auth.get("resource_arg") and not auth.get("resource_template") and not tool.get("resource_template"):
        errors.append(f"{prefix}.authorization_requirements.resource_arg or resource_template is required.")

    ttl = auth.get("receipt_ttl_seconds")
    if not isinstance(ttl, int) or ttl <= 0:
        errors.append(f"{prefix}.authorization_requirements.receipt_ttl_seconds must be a positive integer.")
    elif ttl > 900:
        warnings.append(f"{prefix}.authorization_requirements.receipt_ttl_seconds is greater than 15 minutes.")

    if auth.get("single_use") is not True:
        errors.append(f"{prefix}.authorization_requirements.single_use must be true for high-blast-radius tools.")

    if any(hint in name.lower() for hint in FINANCIAL_HINTS) and not auth.get("amount_arg"):
        warnings.append(f"{prefix}.authorization_requirements.amount_arg is not set for financial-looking tool.")


def _is_high_blast_radius(name: str, tool: dict[str, Any]) -> bool:
    risk = tool.get("risk")
    action = tool.get("action")
    lowered = name.lower()
    return (
        risk in {"high", "critical"}
        or action in {"write", "send", "admin", "execute"}
        or tool.get("requires_jit") is True
        or tool.get("receipt_required") is True
        or any(hint in lowered for hint in FINANCIAL_HINTS)
    )


def _string_set(value: Any) -> set[str] | None:
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        return None
    return set(value)


def _valid_required_receipt_values(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    for key, item in value.items():
        if not isinstance(key, str) or not key:
            return False
        if isinstance(item, str):
            if not item:
                return False
            continue
        if isinstance(item, list) and item and all(isinstance(entry, str) and entry for entry in item):
            continue
        return False
    return True


def _parameters(value: Any, spec: dict[str, Any]) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    result = []
    for item in value:
        resolved = _resolve_openapi_ref(spec, item)
        if isinstance(resolved, dict):
            result.append(resolved)
    return result


def _input_schema(spec: dict[str, Any], operation: dict[str, Any], path_parameters: list[dict[str, Any]]) -> dict[str, Any]:
    properties: dict[str, Any] = {}
    required: list[str] = []

    for param in [*path_parameters, *_parameters(operation.get("parameters"), spec)]:
        name = param.get("name")
        if not isinstance(name, str):
            continue
        schema = _resolve_openapi_ref(spec, param.get("schema")) if isinstance(param.get("schema"), dict) else {}
        properties[name] = schema if isinstance(schema, dict) and schema else {"type": "string"}
        if param.get("required") is True or param.get("in") == "path":
            required.append(name)

    body_schema = _request_body_schema(spec, operation)
    if isinstance(body_schema, dict):
        if body_schema.get("type") == "object" or isinstance(body_schema.get("properties"), dict):
            body_properties = body_schema.get("properties", {})
            if isinstance(body_properties, dict):
                for name, schema in body_properties.items():
                    properties[str(name)] = _resolve_openapi_ref(spec, schema)
            for name in body_schema.get("required", []):
                if isinstance(name, str):
                    required.append(name)
        else:
            properties["body"] = body_schema
            required.append("body")

    return {
        "type": "object",
        "required": sorted(set(required)),
        "properties": properties,
    }


def _request_body_schema(spec: dict[str, Any], operation: dict[str, Any]) -> dict[str, Any] | None:
    body = _resolve_openapi_ref(spec, operation.get("requestBody"))
    if not isinstance(body, dict):
        return None
    content = body.get("content")
    if not isinstance(content, dict):
        return None
    media = content.get("application/json") or next(iter(content.values()), None)
    if not isinstance(media, dict):
        return None
    schema = _resolve_openapi_ref(spec, media.get("schema"))
    return schema if isinstance(schema, dict) else None


def _resolve_openapi_ref(spec: dict[str, Any], value: Any) -> Any:
    if not isinstance(value, dict):
        return value
    ref = value.get("$ref")
    if not isinstance(ref, str) or not ref.startswith("#/"):
        return value
    current: Any = spec
    for part in ref[2:].split("/"):
        if not isinstance(current, dict):
            return value
        current = current.get(part.replace("~1", "/").replace("~0", "~"))
    return current


def _action_for_method(method: str) -> str:
    if method == "get":
        return "read"
    if method == "delete":
        return "admin"
    return "write"


def _risk_for_operation(method: str, tool_name: str, operation: dict[str, Any]) -> str:
    text = " ".join(
        str(value)
        for value in [tool_name, operation.get("summary", ""), operation.get("description", "")]
    ).lower()
    if method == "delete" or any(hint in text for hint in ADMIN_HINTS):
        return "critical"
    if method in {"post", "put", "patch"}:
        return "high"
    if any(hint in text for hint in FINANCIAL_HINTS):
        return "high"
    return "low"


def _operation_slug(method: str, path: str, operation: dict[str, Any]) -> str:
    operation_id = operation.get("operationId")
    if isinstance(operation_id, str) and operation_id.strip():
        return _slug(operation_id)
    cleaned = path.strip("/").replace("{", "by_").replace("}", "")
    return _slug(f"{method}_{cleaned or 'root'}")


def _resource_template(provider: str, path: str) -> str:
    return f"{provider}/{path.strip('/') or 'root'}"


def _first_path_arg(path: str) -> str | None:
    for part in path.split("/"):
        if part.startswith("{") and part.endswith("}"):
            return part[1:-1]
    return None


def _amount_arg(input_schema: dict[str, Any]) -> str | None:
    properties = input_schema.get("properties")
    if not isinstance(properties, dict):
        return None
    for name in properties:
        lowered = str(name).lower()
        if "amount" in lowered or "price" in lowered or "total" in lowered:
            return str(name)
    return None


def _looks_financial(text: str) -> bool:
    lowered = text.lower()
    return any(hint in lowered for hint in FINANCIAL_HINTS)


def _slug(value: str) -> str:
    chars = []
    previous_sep = False
    previous_alnum = False
    for index, char in enumerate(value.strip()):
        if char.isupper() and previous_alnum and index > 0:
            if not previous_sep:
                chars.append("_")
            previous_sep = True
        if char.isalnum():
            chars.append(char.lower())
            previous_sep = False
            previous_alnum = True
        elif not previous_sep:
            chars.append("_")
            previous_sep = True
            previous_alnum = False
    return "".join(chars).strip("_") or "operation"


def _receipt_ttl(tool: dict[str, Any]) -> int | None:
    auth = tool.get("authorization_requirements")
    if isinstance(auth, dict) and isinstance(auth.get("receipt_ttl_seconds"), int):
        return auth["receipt_ttl_seconds"]
    return None


def _default_receipt_profile() -> dict[str, Any]:
    return {
        "uri": "https://agentid.dev/profiles/scoped-tool-receipt/v1",
        "canonicalization": "agentid_canonical_json_v1",
        "digest_algorithm": "SHA-256",
        "default_bindings": ["tenant_id", "agent_id", "user_id", "tool", "action", "resource", "job_id"],
        "outcomes": [
            {
                "value": "ALLOW",
                "description": "The action is authorized under the profile and may continue to provider business checks.",
            },
            {
                "value": "REFER",
                "description": "The action needs an external review, approval, or business decision before execution.",
            },
            {
                "value": "DENY",
                "description": "The action is not authorized under the profile and must not execute.",
            },
        ],
        "basis": {
            "handling": "categorical_or_reference",
            "category_field": "basis_category",
            "reference_field": "basis_ref",
        },
    }


def _resource_pattern(template: str) -> str:
    prefix = template.split("{", 1)[0]
    return prefix + "*" if prefix else "*"


def _context_required(auth: Any, field: str) -> bool:
    if not isinstance(auth, dict):
        return False
    values = auth.get("required_context")
    return isinstance(values, list) and field in values


def _input_has_field(tool: dict[str, Any], field: str) -> bool:
    schema = tool.get("input_schema")
    if not isinstance(schema, dict):
        return False
    properties = schema.get("properties")
    return isinstance(properties, dict) and field in properties


def _title_from_id(agent_id: str) -> str:
    return " ".join(part.capitalize() for part in agent_id.replace("_", "-").split("-") if part)


def _is_signed_receipt(value: dict[str, Any]) -> bool:
    return "alg" in value or "payload" in value or "signature" in value


def _is_jws_receipt(value: dict[str, Any]) -> bool:
    return isinstance(value.get("jws"), str)


def _verify_jws_receipt_with_remote_jwks(
    value: dict[str, Any],
    *,
    jwks: dict[str, Any] | None,
    jwks_uri: str | None,
    jwks_cache: ProviderReceiptJwksCache | None,
    jwks_cache_ttl_seconds: int,
    jwks_stale_if_error_seconds: int,
    jwks_timeout_seconds: float,
    expected_issuer: str | None = None,
    expected_audience: str | None = None,
    allowed_algs: list[str] | None = None,
    now: datetime | None = None,
) -> ProviderReceiptVerification:
    if jwks is not None:
        return _verify_jws_receipt(
            value,
            jwks,
            expected_issuer=expected_issuer,
            expected_audience=expected_audience,
            allowed_algs=allowed_algs,
        )
    if not jwks_uri:
        return ProviderReceiptVerification(False, None, ["receipt JWKS is required"])

    cache = jwks_cache or ProviderReceiptJwksCache()
    current = now or datetime.now(timezone.utc)
    try:
        resolved_jwks = cache.get(
            jwks_uri,
            ttl_seconds=jwks_cache_ttl_seconds,
            stale_if_error_seconds=jwks_stale_if_error_seconds,
            timeout_seconds=jwks_timeout_seconds,
            now=current,
        )
    except ProviderContractError as exc:
        return ProviderReceiptVerification(False, None, [str(exc)])

    result = _verify_jws_receipt(
        value,
        resolved_jwks,
        expected_issuer=expected_issuer,
        expected_audience=expected_audience,
        allowed_algs=allowed_algs,
    )
    if not _jwks_key_not_found(result.findings):
        return result

    try:
        refreshed_jwks = cache.get(
            jwks_uri,
            ttl_seconds=jwks_cache_ttl_seconds,
            stale_if_error_seconds=jwks_stale_if_error_seconds,
            timeout_seconds=jwks_timeout_seconds,
            now=current,
            force_refresh=True,
        )
    except ProviderContractError:
        return result
    if refreshed_jwks is resolved_jwks:
        return result
    return _verify_jws_receipt(
        value,
        refreshed_jwks,
        expected_issuer=expected_issuer,
        expected_audience=expected_audience,
        allowed_algs=allowed_algs,
    )


def _verify_jws_receipt(
    value: dict[str, Any],
    jwks: dict[str, Any],
    *,
    expected_issuer: str | None = None,
    expected_audience: str | None = None,
    allowed_algs: list[str] | None = None,
) -> ProviderReceiptVerification:
    token = _string(value.get("jws"))
    if not token:
        return ProviderReceiptVerification(False, None, ["receipt jws is required"])

    algorithms = allowed_algs or ["RS256", "ES256"]
    findings: list[str] = []
    try:
        header = jwt.get_unverified_header(token)
    except jwt.InvalidTokenError as exc:
        return ProviderReceiptVerification(False, None, [f"receipt JWS header is invalid: {exc}"])

    alg = _string(header.get("alg"))
    if alg not in algorithms:
        findings.append(f"receipt JWS alg is not allowed: {alg}")

    key = _jwk_for_header(jwks, header)
    if key is None:
        findings.append(f"receipt JWS key not found: {_string(header.get('kid')) or 'missing-kid'}")

    if findings or key is None:
        return ProviderReceiptVerification(False, None, findings)

    try:
        algorithm = jwt.algorithms.get_default_algorithms().get(alg)
        if algorithm is None:
            return ProviderReceiptVerification(False, None, [f"receipt JWS alg is unsupported: {alg}"])
        public_key = algorithm.from_jwk(json.dumps(key))
        claims = jwt.decode(
            token,
            public_key,
            algorithms=algorithms,
            audience=expected_audience,
            issuer=expected_issuer,
            options={
                "verify_aud": expected_audience is not None,
                "verify_iss": expected_issuer is not None,
                "verify_exp": False,
                "verify_iat": False,
                "verify_nbf": False,
            },
        )
    except jwt.ExpiredSignatureError:
        return ProviderReceiptVerification(False, None, ["receipt JWS is expired"])
    except jwt.InvalidAudienceError:
        return ProviderReceiptVerification(False, None, ["receipt JWS audience mismatch"])
    except jwt.InvalidIssuerError:
        return ProviderReceiptVerification(False, None, ["receipt JWS issuer mismatch"])
    except jwt.InvalidTokenError as exc:
        return ProviderReceiptVerification(False, None, [f"receipt JWS signature invalid: {exc}"])

    receipt = _receipt_from_jws_claims(claims)
    if not receipt:
        return ProviderReceiptVerification(False, None, ["receipt JWS payload is required"])
    return ProviderReceiptVerification(True, receipt, [])


def _jwks_key_not_found(findings: list[str]) -> bool:
    return any(finding.startswith("receipt JWS key not found:") for finding in findings)


def _jwk_for_header(jwks: dict[str, Any], header: dict[str, Any]) -> dict[str, Any] | None:
    keys = jwks.get("keys")
    if not isinstance(keys, list):
        return None
    kid = header.get("kid")
    if kid:
        for key in keys:
            if isinstance(key, dict) and key.get("kid") == kid:
                return key
        return None
    matching = [key for key in keys if isinstance(key, dict)]
    return matching[0] if len(matching) == 1 else None


def _receipt_from_jws_claims(claims: dict[str, Any]) -> dict[str, Any] | None:
    receipt = claims.get("receipt") or claims.get("payload")
    if isinstance(receipt, dict):
        return receipt
    registered = {"iss", "sub", "aud", "exp", "iat", "nbf", "jti"}
    candidate = {key: value for key, value in claims.items() if key not in registered}
    return candidate if candidate else None


def _verify_signed_receipt(value: dict[str, Any], secret: str) -> ProviderReceiptVerification:
    findings: list[str] = []
    if value.get("alg") != "HS256":
        findings.append("receipt signature alg must be HS256")
    payload = value.get("payload")
    if not isinstance(payload, dict):
        findings.append("receipt signed payload is required")
    signature = _string(value.get("signature"))
    if not signature:
        findings.append("receipt signature is required")
    if findings or not isinstance(payload, dict):
        return ProviderReceiptVerification(False, payload if isinstance(payload, dict) else None, findings)

    expected = _receipt_signature(payload, secret)
    if not hmac.compare_digest(expected, signature):
        findings.append("receipt signature mismatch")
    return ProviderReceiptVerification(ok=not findings, receipt=payload, findings=findings)


def _receipt_signature(payload: dict[str, Any], secret: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), _canonical_json(payload).encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _parse_timestamp(value: Any) -> datetime | None:
    text = _string(value)
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _string(value: Any) -> str:
    if value is None:
        return ""
    return str(value)
