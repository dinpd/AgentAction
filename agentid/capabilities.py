from __future__ import annotations

from typing import Any


LEGACY_TOOL_KIND = "mcp_tool"


def capability_id(capability: dict[str, Any]) -> str | None:
    value = capability.get("id") or capability.get("name")
    return str(value) if value else None


def declared_capabilities(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    capabilities: list[dict[str, Any]] = []

    raw_capabilities = manifest.get("capabilities", [])
    if isinstance(raw_capabilities, list):
        for capability in raw_capabilities:
            if not isinstance(capability, dict):
                continue
            normalized = dict(capability)
            normalized.setdefault("kind", LEGACY_TOOL_KIND)
            if "name" not in normalized and normalized.get("id"):
                normalized["name"] = normalized["id"]
            if "id" not in normalized and normalized.get("name"):
                normalized["id"] = normalized["name"]
            capabilities.append(normalized)

    raw_tools = manifest.get("tools", [])
    if isinstance(raw_tools, list):
        for tool in raw_tools:
            if not isinstance(tool, dict):
                continue
            normalized = dict(tool)
            normalized.setdefault("kind", LEGACY_TOOL_KIND)
            if "id" not in normalized and normalized.get("name"):
                normalized["id"] = normalized["name"]
            capabilities.append(normalized)

    return capabilities


def capabilities_by_id(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for capability in declared_capabilities(manifest):
        name = capability_id(capability)
        if name and name not in result:
            result[name] = capability
    return result
