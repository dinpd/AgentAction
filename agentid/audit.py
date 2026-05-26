from __future__ import annotations

import json
from pathlib import Path
from typing import Any


APPROVAL_REQUIRED = {"required", "human_confirm", "step_up", "manager"}


def load_audit_log(path: str | Path) -> list[dict[str, Any]]:
    audit_path = Path(path)
    raw = json.loads(audit_path.read_text())
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict) and isinstance(raw.get("events"), list):
        return raw["events"]
    raise ValueError("Audit log must be a JSON list or an object with an 'events' list.")


def audit_events(manifest: dict[str, Any], events: list[dict[str, Any]]) -> tuple[bool, list[str]]:
    findings: list[str] = []
    agent_id = manifest.get("agent", {}).get("id")
    tools = {tool.get("name"): tool for tool in manifest.get("tools", [])}
    allowed_flows = {
        (flow.get("from"), flow.get("to")): flow.get("allowed")
        for flow in manifest.get("data_flows", [])
    }

    for idx, event in enumerate(events):
        prefix = f"event[{idx}]"

        if agent_id and event.get("agent_id") != agent_id:
            findings.append(f"{prefix}: agent_id mismatch: {event.get('agent_id')} != {agent_id}")

        tool_name = event.get("tool")
        if tool_name not in tools:
            findings.append(f"{prefix}: undeclared tool used: {tool_name}")
            continue

        manifest_tool = tools[tool_name]
        if manifest_tool.get("access") != event.get("action"):
            findings.append(
                f"{prefix}: action mismatch for {tool_name}: actual={event.get('action')}, allowed={manifest_tool.get('access')}"
            )

        approval = manifest_tool.get("approval", "none")
        if approval in APPROVAL_REQUIRED and not event.get("approved"):
            findings.append(f"{prefix}: {tool_name} requires approval but event is not approved")
        if approval == "block":
            findings.append(f"{prefix}: {tool_name} is blocked by manifest policy")

        auth_mode = manifest_tool.get("auth_mode", "delegated")
        if auth_mode == "just_in_time":
            if not event.get("jit_grant_id"):
                findings.append(f"{prefix}: {tool_name} requires JIT authorization but no jit_grant_id is present")
            if event.get("jit_grant_valid") is False:
                findings.append(f"{prefix}: JIT grant is marked invalid")

        job_boundary = manifest.get("job_boundary")
        if isinstance(job_boundary, dict):
            job_id = event.get("job_id")
            if (job_boundary.get("required") or job_boundary.get("require_job_id")) and not job_id:
                findings.append(f"{prefix}: job_id is required by job_boundary")

            allowed_jobs = set(job_boundary.get("allowed_jobs", []))
            if job_id and allowed_jobs and job_id not in allowed_jobs:
                findings.append(f"{prefix}: job_id is not allowed by job_boundary: {job_id}")

            out_of_scope = set(job_boundary.get("out_of_scope", []))
            if job_id and job_id in out_of_scope:
                findings.append(f"{prefix}: job_id is explicitly out of scope: {job_id}")

            for field in job_boundary.get("bind_authorization_to", []):
                if not event.get(field):
                    findings.append(f"{prefix}: job_boundary binding field is missing: {field}")

        data_from = event.get("data_from")
        data_to = event.get("data_to")
        if data_from and data_to:
            allowed = allowed_flows.get((data_from, data_to))
            if allowed is False:
                findings.append(f"{prefix}: blocked data flow used: {data_from} -> {data_to}")
            elif allowed is None:
                findings.append(f"{prefix}: undeclared data flow: {data_from} -> {data_to}")

        called_agent = event.get("called_agent")
        if called_agent:
            chain = manifest.get("delegation_chain", {})
            allowed_agents = set(chain.get("allowed_agents", []))
            if not chain.get("may_call_agents"):
                findings.append(f"{prefix}: agent-to-agent delegation is not allowed")
            elif called_agent not in allowed_agents:
                findings.append(f"{prefix}: called agent is not in allowed_agents: {called_agent}")
            if chain.get("requires_approval") and not event.get("approved"):
                findings.append(f"{prefix}: agent-to-agent delegation requires approval but event is not approved")
            approval_source = event.get("approval_source")
            allowed_approval_sources = set(chain.get("approval_sources", []))
            if event.get("approved") and allowed_approval_sources and approval_source not in allowed_approval_sources:
                findings.append(f"{prefix}: approval_source is not allowed for delegation: {approval_source}")

            approval_agent = event.get("approval_agent")
            allowed_approval_agents = set(chain.get("approval_agents", []))
            if approval_source == "agent" and allowed_approval_agents and approval_agent not in allowed_approval_agents:
                findings.append(f"{prefix}: approval_agent is not allowed for delegation: {approval_agent}")
            if approval_agent and approval_agent in {called_agent, event.get("agent_id")}:
                findings.append(f"{prefix}: delegation approval agent must be independent of source and target agents")

            max_depth = chain.get("max_depth")
            depth = event.get("delegation_depth")
            if isinstance(max_depth, int) and isinstance(depth, int) and depth > max_depth:
                findings.append(f"{prefix}: delegation depth {depth} exceeds max_depth {max_depth}")

            delegated_tool = event.get("delegated_tool")
            allowed_delegated_tools = set(chain.get("allowed_delegated_tools", []))
            if delegated_tool and allowed_delegated_tools and delegated_tool not in allowed_delegated_tools:
                findings.append(f"{prefix}: delegated tool is not allowed: {delegated_tool}")

    return not findings, findings
