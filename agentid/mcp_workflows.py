"""Conservative schema-based checks of explicit workflow mappings.

No tool execution, semantic mapping, reference fetching, or authorization inference.
"""

from __future__ import annotations

import hashlib
import json

from jsonschema import Draft202012Validator, SchemaError

from agentid.mcp_catalog import normalize_catalog


PROFILE_VERSION = "agentaction.mcp-workflow.v1"
PATH = {"type": "string", "pattern": r"^/(?:[^~]|~[01])+$"}
PROFILE_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["format", "name", "steps"],
    "properties": {
        "format": {"const": PROFILE_VERSION}, "name": {"type": "string", "minLength": 1},
        "steps": {"type": "array", "minItems": 1, "maxItems": 100, "items": {
            "type": "object", "additionalProperties": False, "required": ["id"],
            "properties": {
                "id": {"type": "string", "pattern": "^[A-Za-z0-9_-]+$"},
                "tool": {"type": "string", "minLength": 1},
                "arguments": {"type": "object"},
                "required_inputs": {"type": "array", "uniqueItems": True, "items": PATH},
                "required_outputs": {"type": "array", "uniqueItems": True, "items": PATH},
                "bindings": {"type": "array", "items": {
                    "type": "object", "additionalProperties": False,
                    "required": ["input", "from_step", "output"],
                    "properties": {"input": PATH, "from_step": {"type": "string"}, "output": PATH},
                }},
            },
        }},
    },
}
METADATA = {"title", "description", "default", "examples", "$comment", "$id", "$schema", "readOnly", "writeOnly", "deprecated"}
STRUCTURE = {"type", "properties", "required", "additionalProperties", "items"}
LEAF = {"enum", "const", "minLength", "maxLength", "minimum", "maximum",
        "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minItems", "maxItems", "uniqueItems"}


def parts(path):
    return [part.replace("~1", "/").replace("~0", "~") for part in path[1:].split("/")]


def validate_profile(profile):
    errors = list(Draft202012Validator(PROFILE_SCHEMA).iter_errors(profile))
    if errors:
        # Avoid echoing arguments, which may contain user-supplied sensitive values.
        location = "/".join(map(str, errors[0].absolute_path)) or "root"
        raise ValueError(f"invalid workflow profile at {location}: violates {errors[0].validator}")
    seen = set()
    for step in profile["steps"]:
        if step["id"] in seen:
            raise ValueError(f"duplicate workflow step: {step['id']}")
        bound = set()
        for binding in step.get("bindings", []):
            target = parts(binding["input"])
            if len(target) != 1:
                raise ValueError("binding inputs must name a top-level argument; nested output paths are supported")
            if binding["from_step"] not in seen:
                raise ValueError(f"binding in {step['id']} must reference an earlier step")
            if target[0] in bound or target[0] in step.get("arguments", {}):
                raise ValueError(f"duplicate argument source in {step['id']}")
            bound.add(target[0])
        seen.add(step["id"])


def schema_issue(schema):
    if schema is None:
        return "schema is absent"
    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError:
        return "schema is invalid"
    if isinstance(schema, dict) and schema.get("$schema", "https://json-schema.org/draft/2020-12/schema") not in {
            "https://json-schema.org/draft/2020-12/schema", "https://json-schema.org/draft/2020-12/schema#"}:
        return "schema dialect is not supported by this static evaluator"
    return None


def node_supported(node):
    # Composition, references, patternProperties, dependencies, formats and other
    # unsupported keywords remain unknown. Never resolve external schema URLs.
    return isinstance(node, dict) and not (set(node) - METADATA - STRUCTURE - LEAF)


def field_schema(schema, path, require_output=False):
    """Return declared, absent, or unknown. '*' traverses homogeneous array items."""
    problem = schema_issue(schema)
    if problem:
        return "unknown", None, problem
    node, guaranteed = schema, True
    for part in parts(path):
        if node is False:
            return "absent", None, "schema forbids this value"
        if not node_supported(node):
            return "unknown", None, "schema is open, complex or uses unsupported keywords"
        kind = node.get("type")
        if kind == "array" and part == "*":
            node = node.get("items", {})
        elif kind == "object":
            properties = node.get("properties", {})
            if part not in properties:
                if node.get("additionalProperties") is False:
                    return "absent", None, "closed schema does not expose this field"
                return "unknown", None, "open schema does not enumerate this field"
            guaranteed = guaranteed and part in node.get("required", [])
            node = properties[part]
        elif isinstance(kind, str) and kind in {"string", "number", "integer", "boolean", "null", "array"}:
            return "absent", None, "schema type cannot contain this field path"
        else:
            return "unknown", None, "object or array type is not explicit"
    if node is False:
        return "absent", None, "schema forbids this field"
    if not node_supported(node):
        return "unknown", None, "field schema is open, complex or uses unsupported keywords"
    if require_output and not guaranteed:
        return "unknown", node, "output field is optional; availability is not guaranteed"
    return "declared", node, "field is declared"


def simple_tree(schema):
    if isinstance(schema, bool):
        return True
    if not node_supported(schema):
        return False
    children = list(schema.get("properties", {}).values())
    children += [schema[key] for key in ("items", "additionalProperties") if key in schema]
    return all(simple_tree(child) for child in children)


def type_set(schema):
    kind = schema.get("type")
    return {kind} if isinstance(kind, str) else set(kind or [])


def compatibility(source, target):
    source_types, target_types = type_set(source), type_set(target)
    if not source_types or not target_types:
        return "unknown", "binding type is not explicit"
    def assignable(kind):
        return kind in target_types or kind == "integer" and "number" in target_types

    def overlaps(kind):
        return assignable(kind) or kind == "number" and "integer" in target_types

    if not any(overlaps(kind) for kind in source_types):
        return "partial", "binding output type cannot satisfy input type"
    if not all(assignable(kind) for kind in source_types):
        return "unknown", "some declared output types cannot satisfy the input"
    if (source_types | target_types) & {"object", "array"}:
        return "unknown", "compound argument compatibility requires a fixture or explicit scalar binding"
    restrictions = {key: value for key, value in target.items() if key not in METADATA | {"type"}}
    if restrictions:
        values = [source["const"]] if "const" in source else source.get("enum")
        if values is not None:
            valid = [Draft202012Validator(target).is_valid(value) for value in values]
            if not any(valid):
                return "partial", "no declared output values satisfy the input constraints"
            if not all(valid):
                return "unknown", "only some declared output values satisfy the input constraints"
        elif any(source.get(key) != value for key, value in restrictions.items()):
            return "unknown", "input constraints are not proven by the output schema"
    return "covered", "scalar binding is compatible according to declared schemas"


def evaluate_workflow(payload, profile):
    validate_profile(profile)
    catalog = normalize_catalog(payload)
    surface = catalog["surfaces"]["tools"]
    tools = {tool["name"]: tool for tool in surface["items"]}
    prior, results = {}, []
    for step in profile["steps"]:
        findings, statuses = [], []

        def add(status, code, detail):
            statuses.append(status)
            findings.append({"code": code, "detail": detail, "status": status, "evidence": "declared" if status == "covered" else "inferred"})

        tool = tools.get(step.get("tool"))
        if tool is None:
            status = "not_exposed" if step.get("tool") and surface["status"] == "complete" else "unknown"
            add(status, "mapped_tool_missing" if step.get("tool") else "unmapped_step",
                "Mapped tool is absent from this capture; alternate routes are not assessed." if step.get("tool")
                else "No explicit tool mapping; generic tools, resources or combinations may provide a route.")
        else:
            input_schema, output_schema = tool.get("inputSchema"), tool.get("outputSchema")
            for label, schema, paths in (("input", input_schema, step.get("required_inputs", [])),
                                          ("output", output_schema, step.get("required_outputs", []))):
                for path in paths:
                    state, _, reason = field_schema(schema, path, require_output=label == "output")
                    add({"declared": "covered", "absent": "partial", "unknown": "unknown"}[state],
                        f"{label}_field", f"{path}: {reason}")
            supplied = set(step.get("arguments", {})) | {parts(b["input"])[0] for b in step.get("bindings", [])}
            problem = schema_issue(input_schema)
            if problem or not node_supported(input_schema) or input_schema.get("type") != "object":
                add("unknown", "input_contract_unknown", problem or "input contract is not a supported explicit object schema")
            else:
                missing = set(input_schema.get("required", [])) - supplied
                if missing:
                    add("partial", "required_arguments_missing", "No argument source for: " + ", ".join(sorted(missing)))
                if set(input_schema) & LEAF:
                    add("unknown", "object_constraints", "Object-level value constraints require full input verification.")
            for key, value in step.get("arguments", {}).items():
                path = "/" + key.replace("~", "~0").replace("/", "~1")
                state, schema, reason = field_schema(input_schema, path)
                if state != "declared":
                    add("partial" if state == "absent" else "unknown", "argument_field", f"{path}: {reason}")
                elif not simple_tree(schema):
                    add("unknown", "argument_constraints_unknown", f"{path}: complex value constraints are not evaluated")
                elif not Draft202012Validator(schema).is_valid(value):
                    add("partial", "argument_invalid", f"{path}: provided value does not satisfy declared constraints")
            for binding in step.get("bindings", []):
                predecessor = prior[binding["from_step"]]
                source_tool = tools.get(predecessor["step"].get("tool"))
                if predecessor["result"]["status"] != "covered":
                    add("partial" if predecessor["result"]["status"] in {"partial", "not_exposed"} else "unknown",
                        "predecessor_unavailable", f"{binding['from_step']}: prerequisite step is not fully covered")
                source_state, source_schema, source_reason = field_schema(
                    source_tool.get("outputSchema") if source_tool else None, binding["output"], require_output=True)
                target_state, target_schema, target_reason = field_schema(input_schema, binding["input"])
                label = f"{binding['from_step']}{binding['output']} -> {step['id']}{binding['input']}"
                if "absent" in {source_state, target_state}:
                    add("partial", "binding_field_missing", f"{label}: {source_reason}; {target_reason}")
                elif "unknown" in {source_state, target_state}:
                    add("unknown", "binding_unknown", f"{label}: {source_reason}; {target_reason}")
                else:
                    state, reason = compatibility(source_schema, target_schema)
                    add(state, "binding_compatibility", f"{label}: {reason}")
            if not statuses:
                add("covered", "mapped_contract", "Mapped tool and supplied arguments are schema-declared; behavior is unverified.")
        status = next((s for s in ("not_exposed", "partial", "unknown") if s in statuses), "covered")
        result = {"id": step["id"], "tool": step.get("tool"), "status": status, "findings": findings}
        results.append(result)
        prior[step["id"]] = {"step": step, "result": result}
    states = {step["status"] for step in results}
    outcome = "blocked" if states & {"not_exposed", "partial"} else "unknown" if "unknown" in states else "declared_coverage"
    return {"name": profile["name"], "profile_format": PROFILE_VERSION,
        "profile_hash": hashlib.sha256(json.dumps(profile, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
        "status": outcome, "steps": results, "behavior_verified": False, "account_access": "unknown",
        "limitations": ["Coverage applies only to the explicit mapping, supplied arguments and required fields.",
            "Descriptions and schemas are declarations, not proof of semantics, identifier identity, permissions or execution.",
            "Array paths describe each returned item; nonempty results and record selection are not guaranteed.",
            "Resource-based and alternate tool routes need an explicit tool adapter/profile; no automatic route search is performed."]}
