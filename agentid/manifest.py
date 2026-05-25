from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

import yaml


class ManifestError(Exception):
    """Raised when a manifest cannot be loaded or parsed."""


@dataclass
class ValidationResult:
    ok: bool
    errors: list[str]
    warnings: list[str]


REQUIRED_AGENT_FIELDS = ["id", "name", "owner", "environment", "purpose"]
VALID_ACCESS = {"read", "write", "admin", "execute"}
VALID_APPROVAL = {"none", "notify", "required", "human_confirm", "step_up", "manager", "block"}
VALID_AUTH_MODE = {"delegated", "service", "just_in_time"}
VALID_OIDC_TOKEN_MODES = {"jwks", "demo_hs256"}


def load_manifest(path: str | Path) -> dict[str, Any]:
    manifest_path = Path(path)

    if not manifest_path.exists():
        raise ManifestError(f"Manifest not found: {manifest_path}")

    try:
        data = yaml.safe_load(manifest_path.read_text()) or {}
    except yaml.YAMLError as exc:
        raise ManifestError(f"Invalid YAML: {exc}") from exc

    if not isinstance(data, dict):
        raise ManifestError("Manifest root must be a mapping/object.")

    return data


def validate_manifest(manifest: dict[str, Any]) -> ValidationResult:
    errors: list[str] = []
    warnings: list[str] = []

    agent = manifest.get("agent")
    if not isinstance(agent, dict):
        errors.append("Missing required section: agent")
        agent = {}

    for field in REQUIRED_AGENT_FIELDS:
        if not agent.get(field):
            errors.append(f"Missing required field: agent.{field}")

    _validate_jit_authorization(manifest, errors, warnings)
    _validate_oidc(manifest, errors, warnings)
    _validate_tools(manifest, errors, warnings)
    _validate_delegation_chain(manifest, errors, warnings)
    _validate_intent(manifest, errors, warnings)
    _validate_data_flows(manifest, errors, warnings)
    _validate_runtime(manifest, errors, warnings)
    _validate_audit(manifest, errors, warnings)
    _validate_kill_switch(manifest, errors, warnings)

    expires_at = agent.get("expires_at")
    if expires_at:
        _validate_expiry(expires_at, warnings, errors)
    else:
        warnings.append("agent.expires_at is not set. Consider expiring production agent authority.")

    return ValidationResult(ok=not errors, errors=errors, warnings=warnings)


def _validate_oidc(manifest: dict[str, Any], errors: list[str], warnings: list[str]) -> None:
    oidc = manifest.get("oidc")
    if oidc is None:
        warnings.append("oidc is not set. Gateway access may rely on static bearer secrets instead of identity claims.")
        return

    if not isinstance(oidc, dict):
        errors.append("oidc must be an object.")
        return

    if not oidc.get("enabled"):
        warnings.append("oidc.enabled is not true.")
        return

    issuer = oidc.get("issuer")
    if not issuer:
        errors.append("oidc.issuer is required when oidc.enabled is true.")

    audiences = oidc.get("audiences")
    if not isinstance(audiences, list) or not audiences:
        errors.append("oidc.audiences must be a non-empty list when oidc.enabled is true.")

    token_mode = oidc.get("token_validation", "jwks")
    if token_mode not in VALID_OIDC_TOKEN_MODES:
        errors.append(f"oidc.token_validation must be one of: {', '.join(sorted(VALID_OIDC_TOKEN_MODES))}.")
    if token_mode == "jwks" and not oidc.get("jwks_uri"):
        errors.append("oidc.jwks_uri is required when oidc.token_validation is jwks.")
    if token_mode == "demo_hs256":
        warnings.append("oidc.token_validation=demo_hs256 is for demos only. Use jwks for production IdPs.")

    claim_mapping = oidc.get("claim_mapping")
    if not isinstance(claim_mapping, dict):
        errors.append("oidc.claim_mapping must be an object.")
    else:
        for field in ["tenant_id", "user_id", "agent_id"]:
            if not claim_mapping.get(field):
                errors.append(f"oidc.claim_mapping.{field} is required.")

    required_scopes = oidc.get("required_scopes")
    if not isinstance(required_scopes, dict):
        errors.append("oidc.required_scopes must be an object.")
    else:
        for field in ["authorize", "policy_read", "jit_grant"]:
            if not required_scopes.get(field):
                warnings.append(f"oidc.required_scopes.{field} is not set.")


def _validate_jit_authorization(manifest: dict[str, Any], errors: list[str], warnings: list[str]) -> None:
    jit = manifest.get("jit_authorization")
    tools = manifest.get("tools", [])
    uses_jit = any(isinstance(t, dict) and t.get("auth_mode") == "just_in_time" for t in tools)

    if jit is None:
        if uses_jit:
            errors.append("jit_authorization is required when any tool uses auth_mode=just_in_time.")
        else:
            warnings.append("jit_authorization is not set. Sensitive tools may rely on standing authority.")
        return

    if not isinstance(jit, dict):
        errors.append("jit_authorization must be an object.")
        return

    if uses_jit and not jit.get("enabled"):
        errors.append("jit_authorization.enabled must be true when just-in-time tools are declared.")

    ttl = jit.get("default_ttl_seconds")
    if ttl is None:
        warnings.append("jit_authorization.default_ttl_seconds is not set.")
    elif not isinstance(ttl, int) or ttl <= 0:
        errors.append("jit_authorization.default_ttl_seconds must be a positive integer.")
    elif ttl > 900:
        warnings.append("jit_authorization.default_ttl_seconds is greater than 15 minutes.")

    bind_token_to = jit.get("bind_token_to", [])
    if bind_token_to and not isinstance(bind_token_to, list):
        errors.append("jit_authorization.bind_token_to must be a list.")
    else:
        recommended = {"agent_id", "user_id", "tool", "action", "resource", "approval_id"}
        missing = recommended - set(bind_token_to)
        if missing:
            warnings.append("jit_authorization.bind_token_to is missing recommended bindings: " + ", ".join(sorted(missing)))

    if uses_jit and not jit.get("revoke_after_use"):
        warnings.append("jit_authorization.revoke_after_use is not true for just-in-time tools.")


def _validate_tools(manifest: dict[str, Any], errors: list[str], warnings: list[str]) -> None:
    tools = manifest.get("tools", [])
    if not tools:
        warnings.append("No tools declared. Agent authority may be incomplete or intentionally empty.")

    if tools and not isinstance(tools, list):
        errors.append("tools must be a list.")
        return

    for idx, tool in enumerate(tools):
        prefix = f"tools[{idx}]"
        if not isinstance(tool, dict):
            errors.append(f"{prefix} must be an object.")
            continue

        if not tool.get("name"):
            errors.append(f"{prefix}.name is required.")

        access = tool.get("access")
        if access not in VALID_ACCESS:
            errors.append(f"{prefix}.access must be one of: {', '.join(sorted(VALID_ACCESS))}.")

        auth_mode = tool.get("auth_mode", "delegated")
        if auth_mode not in VALID_AUTH_MODE:
            errors.append(f"{prefix}.auth_mode must be one of: {', '.join(sorted(VALID_AUTH_MODE))}.")

        approval = tool.get("approval", "none")
        if approval not in VALID_APPROVAL:
            errors.append(f"{prefix}.approval must be one of: {', '.join(sorted(VALID_APPROVAL))}.")

        if access in {"write", "admin", "execute"} and approval in {"none", "notify"}:
            warnings.append(f"{prefix} has {access} access with weak approval setting: {approval}.")

        if access in {"write", "admin", "execute"} and auth_mode != "just_in_time":
            warnings.append(f"{prefix} has {access} access without auth_mode=just_in_time.")

        if access == "admin":
            warnings.append(f"{prefix} uses admin access. Prefer narrower tool permissions.")

        constraints = tool.get("constraints", {})
        if access in {"write", "admin", "execute"} and not constraints:
            warnings.append(f"{prefix} has {access} access without constraints.")

        if auth_mode == "just_in_time":
            ttl = constraints.get("token_ttl_seconds") if isinstance(constraints, dict) else None
            if ttl is not None and (not isinstance(ttl, int) or ttl <= 0):
                errors.append(f"{prefix}.constraints.token_ttl_seconds must be a positive integer.")
            elif ttl is not None and ttl > 900:
                warnings.append(f"{prefix}.constraints.token_ttl_seconds is greater than 15 minutes.")


def _validate_delegation_chain(manifest: dict[str, Any], errors: list[str], warnings: list[str]) -> None:
    chain = manifest.get("delegation_chain")
    if chain is None:
        warnings.append("delegation_chain is not set. Explicitly declare whether this agent can call other agents.")
        return

    if not isinstance(chain, dict):
        errors.append("delegation_chain must be an object.")
        return

    if chain.get("may_call_agents") is True and not chain.get("allowed_agents"):
        warnings.append("delegation_chain.may_call_agents is true but allowed_agents is empty.")


def _validate_intent(manifest: dict[str, Any], errors: list[str], warnings: list[str]) -> None:
    intent = manifest.get("intent")
    if intent is None:
        warnings.append("intent is not set. Consider listing actions that require explicit confirmation.")
        return

    if not isinstance(intent, dict):
        errors.append("intent must be an object.")
        return

    confirmations = intent.get("confirmation_required_for", [])
    if confirmations and not isinstance(confirmations, list):
        errors.append("intent.confirmation_required_for must be a list.")


def _validate_data_flows(manifest: dict[str, Any], errors: list[str], warnings: list[str]) -> None:
    flows = manifest.get("data_flows")
    if flows is None:
        warnings.append("data_flows is not set. Tool permissions may miss source-to-destination risk.")
        return

    if not isinstance(flows, list):
        errors.append("data_flows must be a list.")
        return

    for idx, flow in enumerate(flows):
        prefix = f"data_flows[{idx}]"
        if not isinstance(flow, dict):
            errors.append(f"{prefix} must be an object.")
            continue
        if not flow.get("from"):
            errors.append(f"{prefix}.from is required.")
        if not flow.get("to"):
            errors.append(f"{prefix}.to is required.")
        if "allowed" not in flow:
            errors.append(f"{prefix}.allowed is required.")


def _validate_runtime(manifest: dict[str, Any], errors: list[str], warnings: list[str]) -> None:
    runtime = manifest.get("runtime")
    if runtime is None:
        warnings.append("runtime is not set. Consider declaring enforcement and drift-detection expectations.")
        return

    if not isinstance(runtime, dict):
        errors.append("runtime must be an object.")
        return

    for field in ["enforce_manifest", "detect_tool_drift", "detect_new_destinations"]:
        if not runtime.get(field):
            warnings.append(f"runtime.{field} is not true.")


def _validate_audit(manifest: dict[str, Any], errors: list[str], warnings: list[str]) -> None:
    audit = manifest.get("audit", {})
    if not isinstance(audit, dict):
        errors.append("audit must be an object if provided.")
    else:
        if not audit.get("log_tool_calls"):
            warnings.append("audit.log_tool_calls is not enabled.")
        if not audit.get("log_decisions"):
            warnings.append("audit.log_decisions is not enabled.")
        if manifest.get("jit_authorization", {}).get("enabled") and not audit.get("log_jit_grants"):
            warnings.append("audit.log_jit_grants is not enabled.")


def _validate_kill_switch(manifest: dict[str, Any], errors: list[str], warnings: list[str]) -> None:
    kill_switch = manifest.get("kill_switch", {})
    if not isinstance(kill_switch, dict):
        errors.append("kill_switch must be an object if provided.")
    elif not kill_switch.get("enabled"):
        warnings.append("kill_switch.enabled is not true.")


def _validate_expiry(value: Any, warnings: list[str], errors: list[str]) -> None:
    try:
        if isinstance(value, date):
            expiry = value
        else:
            expiry = datetime.strptime(str(value), "%Y-%m-%d").date()
    except ValueError:
        errors.append("agent.expires_at must be YYYY-MM-DD.")
        return

    if expiry < date.today():
        warnings.append("agent.expires_at is in the past.")
