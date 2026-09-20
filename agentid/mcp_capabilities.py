"""Evidence-labeled static capability inventory, separate from risk scoring."""

from __future__ import annotations

import re

from jsonschema import Draft202012Validator, SchemaError

from agentid.mcp_catalog import SURFACES, normalize_catalog


REPORT_VERSION = "agentaction.mcp-capabilities.v1"
OPERATIONS = {"search", "list", "get", "read", "create", "update", "assign", "close", "delete",
              "export", "import", "send", "execute", "run", "manage"}
LIMIT_WORDS = re.compile(r"\b(only|limits?|maximum|minimum|at most|up to|unsupported|unavailable|omitted|not included|does not|cannot|truncat\w*|restricted)\b", re.I)


def finding(code, detail, evidence="inferred", level="advisory"):
    return {"code": code, "detail": detail, "evidence": evidence, "level": level}


def schema_findings(schema, label):
    if schema is None:
        return [finding("missing_schema", f"{label} schema is absent; field coverage is unknown.")]
    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError:
        return [finding("invalid_schema", f"{label} schema is invalid; field coverage is unknown.")]
    if not isinstance(schema, dict) or not schema.get("properties"):
        # An explicitly closed, zero-argument object is useful, not opaque.
        if (isinstance(schema, dict) and schema.get("type") == "object" and schema.get("additionalProperties") is False
                and not schema.get("properties") and not schema.get("required")
                and not (set(schema) & {"$ref", "allOf", "anyOf", "oneOf", "patternProperties"})):
            return []
        return [finding("opaque_schema", f"{label} schema does not enumerate fields; inspect generic operations or external contracts.")]
    return []


def capability_report(payload):
    catalog = normalize_catalog(payload)
    entries = []
    for surface, (_, _, identity) in SURFACES.items():
        for item in catalog["surfaces"][surface]["items"]:
            description = item.get("description") if isinstance(item.get("description"), str) else ""
            name = item.get("name", item[identity])
            words = set(re.findall(r"[a-z]+", re.sub(r"([a-z])([A-Z])", r"\1 \2", str(name)).lower()))
            operations = sorted(words & OPERATIONS) if surface == "tools" else ["read"]
            restrictions = [sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+|\n", description)
                            if LIMIT_WORDS.search(sentence)]
            findings = []
            if len(description.split()) < 4 or ("manage" in operations and len(description.split()) < 12):
                findings.append(finding("vague_description", "Description does not clearly explain the operation and its boundaries."))
            if not restrictions:
                findings.append(finding("limits_not_disclosed", "No explicit limit language identified; actual limits are unknown."))
            if surface == "tools":
                findings.extend(schema_findings(item.get("inputSchema"), "Input"))
                findings.extend(schema_findings(item.get("outputSchema"), "Output"))
                if words & {"search", "list", "export"}:
                    findings.append(finding("result_completeness_unverified", "Pagination, record caps and content fidelity require fixture-based verification."))
            entries.append({"surface": surface, "id": item[identity], "name": name,
                "description": description, "evidence": "declared", "operations": {"values": operations, "evidence": "inferred"},
                "mime_type": item.get("mimeType"),
                "input_schema": item.get("inputSchema"), "output_schema": item.get("outputSchema"),
                "annotations": item.get("annotations", {}), "declared_restrictions": restrictions,
                "findings": findings})
    return {"format": REPORT_VERSION, "catalog_hash": catalog["catalog_hash"],
        "captured_at": catalog.get("captured_at"), "server": catalog.get("server", {}),
        "protocol_version": catalog.get("protocol_version"), "evidence": "declared",
        "behavior_verified": False, "account_access": "unknown",
        "surfaces": {key: {"status": value["status"], "count": len(value["items"])} for key, value in catalog["surfaces"].items()},
        "entries": entries, "findings": catalog.get("findings", []),
        "limitations": ["Catalog metadata and imported captures are untrusted declarations, not behavioral or authorization proof.",
            "Discovery status describes this capture; unadvertised surfaces and missing named tools do not prove product-wide impossibility.",
            "Generic tools, resources and tool combinations may provide additional routes; operation labels are name-based heuristics."]}


def printable(value):
    """Escape terminal controls in provider-controlled strings."""
    return str(value).encode("unicode_escape").decode("ascii")


def format_capabilities(report):
    lines = ["MCP capability inventory (declared; behavior and account access unverified)",
             f"Catalog SHA-256: {report['catalog_hash']}"]
    for name, surface in report["surfaces"].items():
        lines.append(f"{name}: {surface['count']} entries; discovery {surface['status']}")
    for item in report["entries"]:
        operations = ", ".join(item["operations"]["values"]) or "unknown"
        lines.append(f"- {printable(item['id'])} [{item['surface']}] operations: {operations} (inferred)")
        lines.append(f"  Description (declared): {printable(item['description'])}")
        for label in (("input_schema", "output_schema") if item["surface"] == "tools" else ()):
            schema = item[label]
            fields = schema.get("properties") if isinstance(schema, dict) else None
            lines.append(f"  {label}: {(', '.join(printable(key) for key in fields) or 'no fields declared') if isinstance(fields, dict) else 'unknown'}")
        for restriction in item["declared_restrictions"]:
            lines.append(f"  Restriction (declared): {printable(restriction)}")
        for item_finding in item["findings"]:
            lines.append(f"  {item_finding['code']}: {item_finding['detail']}")
    for message in report["findings"] + report["limitations"]:
        lines.append(f"- {printable(message)}")
    if "workflow" in report:
        workflow = report["workflow"]
        lines.append(f"Workflow {printable(workflow['name'])}: {workflow['status']} (static evidence only)")
        for step in workflow["steps"]:
            lines.append(f"- {printable(step['id'])}: {step['status']}")
            for issue in step["findings"]:
                lines.append(f"  {issue['code']}: {printable(issue['detail'])}")
    return "\n".join(lines) + "\n"
