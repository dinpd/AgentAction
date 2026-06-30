from __future__ import annotations

from typing import Any

from agentid.capabilities import capability_id, declared_capabilities


STRONG_APPROVAL = {"required", "human_confirm", "step_up", "manager", "block"}


def risk_score(manifest: dict[str, Any]) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []

    if manifest.get("agent", {}).get("environment") == "production":
        score += 15
        reasons.append("production environment")

    oidc = manifest.get("oidc", {})
    if oidc.get("enabled"):
        score -= 6
        if oidc.get("token_validation") == "demo_hs256":
            score += 10
            reasons.append("demo OIDC token validation is enabled")
        required_scopes = oidc.get("required_scopes", {})
        if isinstance(required_scopes, dict) and required_scopes:
            score -= 4
    else:
        score += 8
        reasons.append("OIDC access controls not enabled")

    jit = manifest.get("jit_authorization", {})
    jit_enabled = bool(jit.get("enabled"))
    if jit_enabled:
        score -= 8
        if jit.get("revoke_after_use"):
            score -= 4
        ttl = jit.get("default_ttl_seconds")
        if isinstance(ttl, int) and ttl <= 300:
            score -= 4
        elif isinstance(ttl, int) and ttl > 900:
            score += 8
            reasons.append("JIT default TTL exceeds 15 minutes")
    else:
        score += 10
        reasons.append("just-in-time authorization not enabled")

    capabilities = declared_capabilities(manifest)
    if len(capabilities) > 5:
        score += 10
        reasons.append("large number of capabilities")

    for capability in capabilities:
        name = capability_id(capability) or "unnamed-capability"
        kind = capability.get("kind", "mcp_tool")
        access = capability.get("access")
        approval = capability.get("approval", "none")
        auth_mode = capability.get("auth_mode", "delegated")
        constraints = capability.get("constraints", {})

        if access == "read":
            score += 3
        elif access == "send":
            score += 14
            reasons.append(f"{name} has send access")
        elif access == "write":
            score += 12
            reasons.append(f"{name} has write access")
        elif access == "execute":
            score += 18
            reasons.append(f"{name} has execute access")
        elif access == "admin":
            score += 30
            reasons.append(f"{name} has admin access")

        if kind == "skill":
            score += 8
            reasons.append(f"{name} is a skill capability")
            if not capability.get("hash"):
                score += 8
                reasons.append(f"{name} lacks a skill hash")
            if not capability.get("may_invoke"):
                score += 10
                reasons.append(f"{name} does not constrain downstream tool use")

        if access in {"write", "send", "execute", "admin"}:
            if auth_mode == "just_in_time":
                score -= 8
            else:
                score += 10
                reasons.append(f"{name} does not use just-in-time auth")

        if approval in STRONG_APPROVAL:
            score -= 5
        elif access in {"write", "send", "execute", "admin"}:
            score += 10
            reasons.append(f"{name} has weak approval: {approval}")

        if constraints:
            score -= 4
            ttl = constraints.get("token_ttl_seconds") if isinstance(constraints, dict) else None
            if isinstance(ttl, int) and ttl <= 300:
                score -= 2
        elif access in {"write", "send", "execute", "admin"}:
            score += 8
            reasons.append(f"{name} lacks constraints")

    data_flows = manifest.get("data_flows")
    if data_flows is None:
        score += 10
        reasons.append("data flows not declared")
    else:
        for flow in data_flows:
            if flow.get("allowed") is True and str(flow.get("to", "")).lower() in {"external_email", "public_web", "external_api"}:
                score += 12
                reasons.append(f"data flow to external destination: {flow.get('to')}")
            if flow.get("allowed") is False:
                score -= 2

    chain = manifest.get("delegation_chain", {})
    if chain.get("may_call_agents"):
        score += 12
        reasons.append("agent-to-agent delegation enabled")
        if not chain.get("allowed_agents"):
            score += 8
            reasons.append("agent delegation lacks allowed_agents list")

    intent = manifest.get("intent", {})
    if not intent.get("confirmation_required_for"):
        score += 8
        reasons.append("intent confirmation rules not declared")
    else:
        score -= 4

    runtime = manifest.get("runtime", {})
    if runtime.get("enforce_manifest"):
        score -= 6
    else:
        score += 10
        reasons.append("manifest enforcement not enabled")

    if runtime.get("detect_tool_drift"):
        score -= 4
    else:
        score += 6
        reasons.append("tool drift detection not enabled")

    if runtime.get("detect_new_destinations"):
        score -= 4
    else:
        score += 6
        reasons.append("new destination detection not enabled")

    audit = manifest.get("audit", {})
    if audit.get("log_tool_calls"):
        score -= 5
    else:
        score += 8
        reasons.append("tool-call logging not enabled")

    if audit.get("log_decisions"):
        score -= 5
    else:
        score += 8
        reasons.append("decision logging not enabled")

    if jit_enabled and audit.get("log_jit_grants"):
        score -= 4
    elif jit_enabled:
        score += 6
        reasons.append("JIT grant logging not enabled")

    kill_switch = manifest.get("kill_switch", {})
    if kill_switch.get("enabled"):
        score -= 8
    else:
        score += 12
        reasons.append("kill switch not enabled")

    score = max(0, min(100, score))
    return score, sorted(set(reasons))


def risk_label(score: int) -> str:
    if score < 25:
        return "low"
    if score < 50:
        return "medium"
    if score < 75:
        return "high"
    return "critical"
