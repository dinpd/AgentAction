from __future__ import annotations

from typing import Any

from agentid.capabilities import capability_id, declared_capabilities


def explain_manifest(manifest: dict[str, Any]) -> str:
    agent = manifest.get("agent", {})
    delegation = manifest.get("delegation", {})
    chain = manifest.get("delegation_chain", {})
    intent = manifest.get("intent", {})
    jit = manifest.get("jit_authorization", {})
    capabilities = declared_capabilities(manifest)
    flows = manifest.get("data_flows", [])
    runtime = manifest.get("runtime", {})
    audit = manifest.get("audit", {})
    kill_switch = manifest.get("kill_switch", {})
    oidc = manifest.get("oidc", {})
    trusted_issuers = manifest.get("trusted_issuers", [])
    attestations = manifest.get("attestations", [])

    lines: list[str] = []

    lines.append(f"Agent: {agent.get('name', 'Unnamed agent')} ({agent.get('id', 'missing-id')})")
    lines.append(f"Owner: {agent.get('owner', 'missing-owner')}")
    lines.append(f"Environment: {agent.get('environment', 'unspecified')}")
    lines.append(f"Purpose: {agent.get('purpose', 'unspecified')}")
    if agent.get("did"):
        lines.append(f"DID: {agent['did']}")
    if agent.get("expires_at"):
        lines.append(f"Authority expires: {agent['expires_at']}")

    acts_for = delegation.get("acts_for", {})
    if acts_for:
        required = "required" if acts_for.get("required") else "optional"
        lines.append(f"Delegation: acts for {acts_for.get('type', 'unknown')} ({required})")

    if delegation.get("allowed_subjects"):
        lines.append("Allowed subjects: " + ", ".join(delegation["allowed_subjects"]))

    lines.append(f"May call other agents: {bool(chain.get('may_call_agents'))}")

    if intent.get("confirmation_required_for"):
        lines.append("Intent confirmation required for: " + ", ".join(intent["confirmation_required_for"]))

    lines.append("")
    lines.append("OIDC access:")
    lines.append(f"- Enabled: {bool(oidc.get('enabled'))}")
    if oidc.get("issuer"):
        lines.append(f"- Issuer: {oidc['issuer']}")
    if oidc.get("audiences"):
        lines.append("- Audiences: " + ", ".join(oidc["audiences"]))
    if oidc.get("token_validation"):
        lines.append(f"- Token validation: {oidc['token_validation']}")
    if oidc.get("required_scopes"):
        scopes = oidc["required_scopes"]
        lines.append(
            "- Required scopes: "
            + ", ".join(f"{name}={scope}" for name, scope in scopes.items())
        )

    lines.append("")
    lines.append("Trust and attestations:")
    if trusted_issuers:
        lines.append("- Trusted issuers: " + ", ".join(trusted_issuers))
    else:
        lines.append("- Trusted issuers: none declared")
    if not attestations:
        lines.append("- No attestations declared.")
    else:
        for attestation in attestations:
            summary = (
                f"- {attestation.get('type', 'unnamed-attestation')}: "
                f"issuer={attestation.get('issuer', 'missing-issuer')}, "
                f"result={attestation.get('result', 'unknown')}"
            )
            if attestation.get("standard"):
                summary += f", standard={attestation['standard']}"
            if attestation.get("expires_at"):
                summary += f", expires={attestation['expires_at']}"
            lines.append(summary)

    lines.append("")
    lines.append("Just-in-time authorization:")
    lines.append(f"- Enabled: {bool(jit.get('enabled'))}")
    if jit.get("default_ttl_seconds"):
        lines.append(f"- Default TTL: {jit['default_ttl_seconds']} seconds")
    if jit.get("bind_token_to"):
        lines.append("- Token bound to: " + ", ".join(jit["bind_token_to"]))
    lines.append(f"- Revoke after use: {bool(jit.get('revoke_after_use'))}")

    lines.append("")
    lines.append("Capabilities:")
    if not capabilities:
        lines.append("- No capabilities declared.")
    else:
        for capability in capabilities:
            name = capability_id(capability) or "unnamed-capability"
            line = (
                f"- {name}: "
                f"kind={capability.get('kind', 'mcp_tool')}, "
                f"{capability.get('access', 'unknown')} access, "
                f"auth_mode={capability.get('auth_mode', 'delegated')}, "
                f"approval={capability.get('approval', 'none')}"
            )
            constraints = capability.get("constraints")
            if constraints:
                line += f", constrained by {', '.join(constraints.keys())}"
            if capability.get("kind") == "skill" and capability.get("may_invoke"):
                line += f", may invoke {', '.join(capability['may_invoke'])}"
            lines.append(line)

    lines.append("")
    lines.append("Data flows:")
    if not flows:
        lines.append("- No data flows declared.")
    else:
        for flow in flows:
            status = "allowed" if flow.get("allowed") else "blocked"
            lines.append(f"- {flow.get('from', 'unknown')} -> {flow.get('to', 'unknown')}: {status}")

    lines.append("")
    lines.append("Runtime:")
    lines.append(f"- Enforce manifest: {bool(runtime.get('enforce_manifest'))}")
    lines.append(f"- Detect tool drift: {bool(runtime.get('detect_tool_drift'))}")
    lines.append(f"- Detect new destinations: {bool(runtime.get('detect_new_destinations'))}")
    lines.append(f"- Require valid attestations: {bool(runtime.get('require_valid_attestations'))}")
    lines.append(f"- Deny if attestation expired: {bool(runtime.get('deny_if_attestation_expired'))}")
    lines.append(f"- Deny if credential revoked: {bool(runtime.get('deny_if_credential_revoked'))}")

    lines.append("")
    lines.append("Audit:")
    lines.append(f"- Log prompt summaries: {bool(audit.get('log_prompt_summary'))}")
    lines.append(f"- Log tool calls: {bool(audit.get('log_tool_calls'))}")
    lines.append(f"- Log decisions: {bool(audit.get('log_decisions'))}")
    lines.append(f"- Log JIT grants: {bool(audit.get('log_jit_grants'))}")

    lines.append("")
    lines.append("Kill switch:")
    lines.append(f"- Enabled: {bool(kill_switch.get('enabled'))}")
    lines.append(f"- Revoke on policy violation: {bool(kill_switch.get('revoke_on_policy_violation'))}")

    return "\n".join(lines)
