from __future__ import annotations

from typing import Any

from agentid.capabilities import capability_id, declared_capabilities


APPROVAL_REQUIRED = {"required", "human_confirm", "step_up", "manager"}
BLOCKING_APPROVAL = {"block"}


def generate_opa_policy(manifest: dict[str, Any]) -> str:
    agent_id = manifest.get("agent", {}).get("id", "unknown-agent")
    capabilities = declared_capabilities(manifest)
    flows = manifest.get("data_flows", [])
    job_boundary = manifest.get("job_boundary", {})

    allowed_rules: list[str] = []
    approval_rules: list[str] = []
    blocked_rules: list[str] = []
    jit_rules: list[str] = []
    flow_rules: list[str] = []
    allowed_job_rules: list[str] = []
    blocked_job_rules: list[str] = []
    required_binding_rules: list[str] = []

    for capability in capabilities:
        name = capability_id(capability)
        access = capability.get("access")
        approval = capability.get("approval", "none")
        auth_mode = capability.get("auth_mode", "delegated")
        if not name or not access:
            continue
        allowed_rules.append(f'allowed_tools["{name}"] := "{access}"')
        if approval in APPROVAL_REQUIRED:
            approval_rules.append(f'requires_approval["{name}"]')
        if approval in BLOCKING_APPROVAL:
            blocked_rules.append(f'blocked_tools["{name}"]')
        if auth_mode == "just_in_time":
            jit_rules.append(f'requires_jit["{name}"]')

    for flow in flows:
        source = flow.get("from")
        dest = flow.get("to")
        if source and dest and flow.get("allowed") is True:
            flow_rules.append(f'allowed_flows["{source}::{dest}"]')

    if isinstance(job_boundary, dict):
        for job in job_boundary.get("allowed_jobs", []):
            allowed_job_rules.append(f'allowed_jobs["{job}"]')
        for job in job_boundary.get("out_of_scope", []):
            blocked_job_rules.append(f'blocked_jobs["{job}"]')
        for field in job_boundary.get("bind_authorization_to", []):
            required_binding_rules.append(f'required_job_bindings["{field}"]')

    allowed_block = "\n".join(allowed_rules) or "# No tools declared."
    approval_block = "\n".join(approval_rules) or "# No approval-required tools declared."
    blocked_block = "\n".join(blocked_rules) or "# No blocked tools declared."
    jit_block = "\n".join(jit_rules) or "# No JIT-required tools declared."
    flow_block = "\n".join(flow_rules) or "# No explicit allowed data flows declared."
    allowed_job_block = "\n".join(allowed_job_rules) or "# No explicit allowed jobs declared."
    blocked_job_block = "\n".join(blocked_job_rules) or "# No out-of-scope jobs declared."
    required_binding_block = "\n".join(required_binding_rules) or "# No job binding fields declared."
    job_required = "true" if isinstance(job_boundary, dict) and (job_boundary.get("required") or job_boundary.get("require_job_id")) else "false"

    return f"""package agentid

default allow := false

agent_id := "{agent_id}"

requested_capability := object.get(input, "tool", object.get(input, "capability", ""))

{allowed_block}

{approval_block}

{blocked_block}

{jit_block}

{flow_block}

job_required := {job_required}

{allowed_job_block}

{blocked_job_block}

{required_binding_block}

tool_allowed if {{
    input.agent_id == agent_id
    allowed_tools[requested_capability] == input.action
    not blocked_tools[requested_capability]
}}

flow_allowed if {{
    input.data_from == ""
    input.data_to == ""
}}

flow_allowed if {{
    allowed_flows[concat("::", [input.data_from, input.data_to])]
}}

job_allowed if {{
    not job_required
}}

job_allowed if {{
    job_required
    input.job_id != ""
    allowed_job
    not blocked_jobs[input.job_id]
    job_bindings_satisfied
}}

allowed_job if {{
    count(allowed_jobs) == 0
}}

allowed_job if {{
    allowed_jobs[input.job_id]
}}

job_bindings_satisfied if {{
    count(missing_job_bindings) == 0
}}

missing_job_bindings[field] if {{
    required_job_bindings[field]
    object.get(input, field, "") == ""
}}

jit_satisfied if {{
    not requires_jit[requested_capability]
}}

jit_satisfied if {{
    requires_jit[requested_capability]
    input.jit_grant_valid == true
    input.jit_grant_agent_id == input.agent_id
    input.jit_grant_tool == requested_capability
    input.jit_grant_action == input.action
}}

approval_satisfied if {{
    not requires_approval[requested_capability]
}}

approval_satisfied if {{
    requires_approval[requested_capability]
    input.approved == true
}}

allow if {{
    tool_allowed
    flow_allowed
    job_allowed
    jit_satisfied
    approval_satisfied
}}
"""


def generate_policy(manifest: dict[str, Any], target: str) -> str:
    if target != "opa":
        raise ValueError("Only target='opa' is currently supported.")
    return generate_opa_policy(manifest)
