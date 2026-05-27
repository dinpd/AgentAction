from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable
from urllib import request


RISKY_NAME_KEYWORDS: dict[str, tuple[str, int]] = {
    "delete": ("delete/destructive", 24),
    "remove": ("delete/destructive", 20),
    "destroy": ("delete/destructive", 24),
    "drop": ("delete/destructive", 24),
    "truncate": ("delete/destructive", 24),
    "write": ("write", 16),
    "update": ("write", 16),
    "create": ("write", 14),
    "insert": ("write", 14),
    "send": ("external send", 18),
    "email": ("external send", 14),
    "slack": ("external send", 12),
    "deploy": ("deployment", 22),
    "exec": ("execution", 28),
    "execute": ("execution", 28),
    "shell": ("execution", 30),
    "command": ("execution", 26),
    "admin": ("admin", 26),
    "permission": ("identity/access", 22),
    "role": ("identity/access", 18),
    "policy": ("identity/access", 18),
    "token": ("secrets", 22),
    "secret": ("secrets", 24),
    "key": ("secrets", 12),
    "payment": ("payment", 24),
    "refund": ("payment", 18),
    "charge": ("payment", 22),
    "sql": ("database", 20),
    "query": ("database", 10),
    "database": ("database", 18),
    "file": ("filesystem", 12),
    "path": ("filesystem", 12),
    "browser": ("browser/network", 14),
    "url": ("browser/network", 10),
    "http": ("browser/network", 10),
    "cloud": ("cloud", 18),
}

SENSITIVE_ARGUMENTS: dict[str, tuple[str, int]] = {
    "command": ("arbitrary command argument", 24),
    "cmd": ("arbitrary command argument", 24),
    "script": ("script argument", 20),
    "path": ("filesystem path argument", 16),
    "file": ("filesystem argument", 12),
    "filename": ("filesystem argument", 12),
    "directory": ("filesystem path argument", 14),
    "url": ("network URL argument", 14),
    "uri": ("network URI argument", 10),
    "query": ("query argument", 14),
    "sql": ("SQL argument", 24),
    "token": ("token argument", 22),
    "secret": ("secret argument", 24),
    "password": ("password argument", 24),
    "key": ("key argument", 12),
    "recipient": ("recipient argument", 12),
    "email": ("email argument", 10),
    "amount": ("amount argument", 16),
    "role": ("role argument", 16),
    "permission": ("permission argument", 20),
    "policy": ("policy argument", 18),
}

WRITE_HINTS = {"write", "update", "create", "insert", "send", "post", "put", "patch", "delete", "remove", "destroy"}
ADMIN_HINTS = {"admin", "permission", "policy", "role", "token", "secret", "key"}
EXECUTE_HINTS = {"exec", "execute", "shell", "command", "run", "deploy"}
DEFAULT_PROTOCOL_VERSION = "2025-11-25"


@dataclass(frozen=True)
class ToolAnalysis:
    name: str
    risk_score: int
    risk_label: str
    action: str
    categories: list[str]
    sensitive_arguments: list[str]
    findings: list[str]
    remediation: list[str]


@dataclass(frozen=True)
class McpAnalysis:
    risk_score: int
    risk_label: str
    tool_count: int
    highest_risk_tools: list[str]
    findings: list[str]
    tools: list[ToolAnalysis]


@dataclass(frozen=True)
class McpDiff:
    added_tools: list[str]
    removed_tools: list[str]
    changed_tools: list[str]
    findings: list[str]


@dataclass(frozen=True)
class FetchResult:
    payload: dict[str, Any]
    protocol_version: str
    session_id: str | None = None


PostJson = Callable[[str, dict[str, Any], dict[str, str], float], tuple[dict[str, Any] | None, dict[str, str]]]


def load_tools_list(path: str | Path) -> list[dict[str, Any]]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    return tools_from_payload(payload)


def fetch_tools_list(
    url: str,
    headers: dict[str, str] | None = None,
    timeout: float = 20,
    protocol_version: str = DEFAULT_PROTOCOL_VERSION,
    initialize: bool = True,
    post_json: PostJson | None = None,
) -> FetchResult:
    post = post_json or http_post_json
    request_headers = {
        "accept": "application/json, text/event-stream",
        "content-type": "application/json",
        **(headers or {}),
    }
    negotiated_version = protocol_version
    session_id: str | None = None

    if initialize:
        init_payload, init_headers = post(
            url,
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": protocol_version,
                    "capabilities": {},
                    "clientInfo": {"name": "agentid", "version": "0.1.2"},
                },
            },
            request_headers,
            timeout,
        )
        if not init_payload:
            raise ValueError("initialize did not return a JSON-RPC response")
        raise_for_json_rpc_error(init_payload)
        result = init_payload.get("result")
        if isinstance(result, dict) and isinstance(result.get("protocolVersion"), str):
            negotiated_version = result["protocolVersion"]
        session_id = header_value(init_headers, "mcp-session-id")

        operation_headers = {**request_headers, "MCP-Protocol-Version": negotiated_version}
        if session_id:
            operation_headers["Mcp-Session-Id"] = session_id
        post(
            url,
            {"jsonrpc": "2.0", "method": "notifications/initialized"},
            operation_headers,
            timeout,
        )
    else:
        operation_headers = {**request_headers, "MCP-Protocol-Version": negotiated_version}

    tools_payload, _headers = post(
        url,
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
        operation_headers,
        timeout,
    )
    if not tools_payload:
        raise ValueError("tools/list did not return a JSON-RPC response")
    raise_for_json_rpc_error(tools_payload)
    tools_from_payload(tools_payload)
    return FetchResult(payload=tools_payload, protocol_version=negotiated_version, session_id=session_id)


def http_post_json(
    url: str,
    payload: dict[str, Any],
    headers: dict[str, str],
    timeout: float,
) -> tuple[dict[str, Any] | None, dict[str, str]]:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(url, data=body, headers=headers, method="POST")
    with request.urlopen(req, timeout=timeout) as response:
        raw = response.read().decode("utf-8")
        response_headers = {key.lower(): value for key, value in response.headers.items()}
        if not raw.strip():
            return None, response_headers
        return parse_json_or_sse(raw), response_headers


def parse_json_or_sse(raw: str) -> dict[str, Any]:
    stripped = raw.strip()
    if stripped.startswith("{"):
        payload = json.loads(stripped)
        if not isinstance(payload, dict):
            raise ValueError("JSON-RPC response must be an object")
        return payload

    data_lines: list[str] = []
    for line in raw.splitlines():
        if line.startswith("data:"):
            data_lines.append(line[5:].strip())
    if data_lines:
        payload = json.loads("\n".join(data_lines))
        if not isinstance(payload, dict):
            raise ValueError("SSE data payload must be a JSON object")
        return payload
    raise ValueError("response was not JSON or JSON-bearing SSE")


def raise_for_json_rpc_error(payload: dict[str, Any]) -> None:
    error = payload.get("error")
    if isinstance(error, dict):
        message = error.get("message") or error
        raise ValueError(f"MCP JSON-RPC error: {message}")


def header_value(headers: dict[str, str], name: str) -> str | None:
    return headers.get(name.lower())


def tools_from_payload(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        tools = payload
    elif isinstance(payload, dict) and isinstance(payload.get("tools"), list):
        tools = payload["tools"]
    elif (
        isinstance(payload, dict)
        and isinstance(payload.get("result"), dict)
        and isinstance(payload["result"].get("tools"), list)
    ):
        tools = payload["result"]["tools"]
    else:
        raise ValueError("expected a tools/list response, an object with tools, or a tools array")

    result: list[dict[str, Any]] = []
    for index, tool in enumerate(tools):
        if not isinstance(tool, dict):
            raise ValueError(f"tool at index {index} is not an object")
        result.append(tool)
    return result


def analyze_tools(tools: list[dict[str, Any]]) -> McpAnalysis:
    analyses = [analyze_tool(tool) for tool in tools]
    if analyses:
        score = max(tool.risk_score for tool in analyses)
        if len(analyses) > 10:
            score = min(100, score + 8)
        if len(analyses) > 25:
            score = min(100, score + 8)
    else:
        score = 0

    findings: list[str] = []
    high_risk = [tool.name for tool in analyses if 50 <= tool.risk_score < 75]
    critical = [tool.name for tool in analyses if tool.risk_score >= 75]
    if high_risk:
        findings.append(f"{len(high_risk)} high-risk {plural('tool', len(high_risk))} detected")
    if critical:
        findings.append(f"{len(critical)} critical-risk {plural('tool', len(critical))} detected")
    if len(analyses) > 10:
        findings.append("large MCP tool surface")

    highest = sorted(analyses, key=lambda tool: tool.risk_score, reverse=True)[:5]
    return McpAnalysis(
        risk_score=score,
        risk_label=risk_label(score),
        tool_count=len(analyses),
        highest_risk_tools=[tool.name for tool in highest if tool.risk_score >= 25],
        findings=findings,
        tools=sorted(analyses, key=lambda tool: (-tool.risk_score, tool.name)),
    )


def analyze_tool(tool: dict[str, Any]) -> ToolAnalysis:
    name = str(tool.get("name", ""))
    description = str(tool.get("description", ""))
    schema = tool.get("inputSchema") or tool.get("input_schema") or {}
    argument_names = input_argument_names(schema)
    haystack = f"{name} {description}".lower()
    tokens = set(split_words(haystack))

    score = 0
    categories: set[str] = set()
    findings: list[str] = []

    for keyword, (category, points) in RISKY_NAME_KEYWORDS.items():
        if keyword in haystack:
            categories.add(category)
            score += points

    sensitive_arguments: list[str] = []
    for arg in argument_names:
        arg_lower = arg.lower()
        for keyword, (finding, points) in SENSITIVE_ARGUMENTS.items():
            if keyword in arg_lower:
                sensitive_arguments.append(arg)
                score += points
                findings.append(f"{arg}: {finding}")
                break

    action = infer_action(tokens)
    if action == "read":
        score += 8
    elif action == "write":
        score += 22
        findings.append("tool appears to modify state")
    elif action == "execute":
        score += 34
        findings.append("tool appears to execute commands or deployments")
    elif action == "admin":
        score += 38
        findings.append("tool appears to affect identity, secrets, policy, or administration")

    if not name:
        findings.append("tool is missing a name")
        score += 8
    if not description:
        findings.append("tool is missing a description")
        score += 6
    if not argument_names:
        findings.append("tool input schema has no declared arguments")
        score += 4

    score = max(0, min(100, score))
    return ToolAnalysis(
        name=name or "<unnamed>",
        risk_score=score,
        risk_label=risk_label(score),
        action=action,
        categories=sorted(categories),
        sensitive_arguments=sorted(set(sensitive_arguments)),
        findings=sorted(set(findings)),
        remediation=remediation_for(score, action, categories, sensitive_arguments),
    )


def diff_tools(before: list[dict[str, Any]], after: list[dict[str, Any]]) -> McpDiff:
    before_by_name = {str(tool.get("name", "")): tool for tool in before if tool.get("name")}
    after_by_name = {str(tool.get("name", "")): tool for tool in after if tool.get("name")}

    added = sorted(set(after_by_name) - set(before_by_name))
    removed = sorted(set(before_by_name) - set(after_by_name))
    changed = sorted(
        name for name in set(before_by_name) & set(after_by_name) if normalized_tool(before_by_name[name]) != normalized_tool(after_by_name[name])
    )

    findings: list[str] = []
    if added:
        findings.append(f"{len(added)} new tools exposed")
    if removed:
        findings.append(f"{len(removed)} tools removed")
    if changed:
        findings.append(f"{len(changed)} tool schemas or descriptions changed")

    for name in added:
        analysis = analyze_tool(after_by_name[name])
        if analysis.risk_score >= 50:
            findings.append(f"new high-risk tool: {name} ({analysis.risk_label})")
    for name in changed:
        before_analysis = analyze_tool(before_by_name[name])
        after_analysis = analyze_tool(after_by_name[name])
        if after_analysis.risk_score > before_analysis.risk_score:
            findings.append(
                f"tool risk increased: {name} ({before_analysis.risk_label} -> {after_analysis.risk_label})"
            )

    return McpDiff(added_tools=added, removed_tools=removed, changed_tools=changed, findings=findings)


def analysis_to_dict(analysis: McpAnalysis) -> dict[str, Any]:
    return {
        "risk_score": analysis.risk_score,
        "risk_label": analysis.risk_label,
        "tool_count": analysis.tool_count,
        "highest_risk_tools": analysis.highest_risk_tools,
        "findings": analysis.findings,
        "tools": [tool.__dict__ for tool in analysis.tools],
    }


def diff_to_dict(diff: McpDiff) -> dict[str, Any]:
    return {
        "added_tools": diff.added_tools,
        "removed_tools": diff.removed_tools,
        "changed_tools": diff.changed_tools,
        "findings": diff.findings,
    }


def format_analysis(analysis: McpAnalysis) -> str:
    lines = [
        f"MCP risk score: {analysis.risk_score}/100 ({analysis.risk_label})",
        f"Tools analyzed: {analysis.tool_count}",
    ]
    if analysis.highest_risk_tools:
        lines.append("Highest-risk tools:")
        lines.extend(f"- {name}" for name in analysis.highest_risk_tools)
    if analysis.findings:
        lines.append("Findings:")
        lines.extend(f"- {finding}" for finding in analysis.findings)
    if analysis.tools:
        lines.append("Tool details:")
        for tool in analysis.tools:
            lines.append(f"- {tool.name}: {tool.risk_score}/100 ({tool.risk_label}, {tool.action})")
            for finding in tool.findings[:4]:
                lines.append(f"  - {finding}")
            for remediation in tool.remediation[:3]:
                lines.append(f"  - Remediate: {remediation}")
    return "\n".join(lines) + "\n"


def format_diff(diff: McpDiff) -> str:
    lines: list[str] = []
    lines.append(f"Added tools: {len(diff.added_tools)}")
    lines.extend(f"- {name}" for name in diff.added_tools)
    lines.append(f"Removed tools: {len(diff.removed_tools)}")
    lines.extend(f"- {name}" for name in diff.removed_tools)
    lines.append(f"Changed tools: {len(diff.changed_tools)}")
    lines.extend(f"- {name}" for name in diff.changed_tools)
    if diff.findings:
        lines.append("Findings:")
        lines.extend(f"- {finding}" for finding in diff.findings)
    return "\n".join(lines) + "\n"


def input_argument_names(schema: Any) -> list[str]:
    if not isinstance(schema, dict):
        return []
    properties = schema.get("properties")
    if not isinstance(properties, dict):
        return []
    return [str(key) for key in properties.keys()]


def infer_action(tokens: set[str]) -> str:
    if tokens & ADMIN_HINTS:
        return "admin"
    if tokens & EXECUTE_HINTS:
        return "execute"
    if tokens & WRITE_HINTS:
        return "write"
    return "read"


def remediation_for(score: int, action: str, categories: set[str], sensitive_arguments: list[str]) -> list[str]:
    remediation: list[str] = []
    if score >= 50:
        remediation.append("run this tool behind a gateway authorization check")
    if action in {"write", "execute", "admin"}:
        remediation.append("require approval or just-in-time authority before execution")
        remediation.append("bind authorization to user, agent, job, resource, and time window")
    if sensitive_arguments:
        remediation.append("validate and constrain sensitive input arguments")
    if {"secrets", "identity/access", "admin"} & categories:
        remediation.append("add audit logging and a kill-switch for this capability")
    if not remediation:
        remediation.append("declare this tool in an AgentID manifest and audit usage")
    return remediation


def split_words(value: str) -> list[str]:
    normalized = "".join(character.lower() if character.isalnum() else " " for character in value)
    return [word for word in normalized.split() if word]


def normalized_tool(tool: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": tool.get("name"),
        "description": tool.get("description"),
        "inputSchema": tool.get("inputSchema") or tool.get("input_schema"),
    }


def risk_label(score: int) -> str:
    if score < 25:
        return "low"
    if score < 50:
        return "medium"
    if score < 75:
        return "high"
    return "critical"


def plural(word: str, count: int) -> str:
    if count == 1:
        return word
    return f"{word}s"
