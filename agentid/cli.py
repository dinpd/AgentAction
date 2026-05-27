from __future__ import annotations

import argparse
import json
import os
import sys

from agentid.audit import audit_events, load_audit_log
from agentid.config_ui import write_config_ui
from agentid.explain import explain_manifest
from agentid.gateway import serve
from agentid.manifest import ManifestError, load_manifest, validate_manifest
from agentid.mcp import (
    analysis_to_dict,
    analyze_tools,
    diff_to_dict,
    diff_tools,
    format_analysis,
    format_diff,
    load_tools_list,
)
from agentid.policy import generate_policy
from agentid.risk import risk_label, risk_score
from agentid.schema import schema_json


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="agentid",
        description="Validate, explain, score, generate policy for, and audit AI agent authority manifests.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate_parser = subparsers.add_parser("validate", help="Validate an AgentID manifest.")
    validate_parser.add_argument("manifest")

    explain_parser = subparsers.add_parser("explain", help="Explain an AgentID manifest in plain English.")
    explain_parser.add_argument("manifest")

    risk_parser = subparsers.add_parser("risk-score", help="Generate a rough risk score for an AgentID manifest.")
    risk_parser.add_argument("manifest")

    policy_parser = subparsers.add_parser("generate-policy", help="Generate starter policy from an AgentID manifest.")
    policy_parser.add_argument("manifest")
    policy_parser.add_argument("--target", choices=["opa"], default="opa")

    subparsers.add_parser("schema", help="Print the AgentID JSON Schema.")

    config_ui_parser = subparsers.add_parser("config-ui", help="Write the browser-based policy builder UI.")
    config_ui_parser.add_argument("--output", default="agentid-policy-builder.html")

    gateway_parser = subparsers.add_parser("gateway", help="Run the AgentID authorization gateway.")
    gateway_parser.add_argument("manifest")
    gateway_parser.add_argument("--host", default="127.0.0.1")
    gateway_parser.add_argument("--port", type=int, default=8787)
    gateway_parser.add_argument("--api-key", default=os.environ.get("AGENTID_GATEWAY_API_KEY"))

    audit_parser = subparsers.add_parser("audit", help="Audit a tool-call log against an AgentID manifest.")
    audit_parser.add_argument("audit_log")
    audit_parser.add_argument("--manifest", required=True)

    mcp_parser = subparsers.add_parser("mcp", help="Analyze MCP tool surfaces.")
    mcp_subparsers = mcp_parser.add_subparsers(dest="mcp_command", required=True)
    mcp_analyze_parser = mcp_subparsers.add_parser("analyze", help="Score an MCP tools/list response.")
    mcp_analyze_parser.add_argument("tools_list")
    mcp_analyze_parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    mcp_diff_parser = mcp_subparsers.add_parser("diff", help="Compare two MCP tools/list responses for drift.")
    mcp_diff_parser.add_argument("before")
    mcp_diff_parser.add_argument("after")
    mcp_diff_parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")

    args = parser.parse_args(argv)

    if args.command == "schema":
        print(schema_json(), end="")
        return 0

    if args.command == "config-ui":
        path = write_config_ui(args.output)
        print(f"Wrote config UI: {path}")
        return 0

    if args.command == "gateway":
        try:
            serve(args.manifest, args.host, args.port, args.api_key)
        except ManifestError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 2
        return 0

    if args.command == "mcp":
        try:
            if args.mcp_command == "analyze":
                analysis = analyze_tools(load_tools_list(args.tools_list))
                if args.json:
                    print(json.dumps(analysis_to_dict(analysis), indent=2))
                else:
                    print(format_analysis(analysis), end="")
                return 0
            if args.mcp_command == "diff":
                diff = diff_tools(load_tools_list(args.before), load_tools_list(args.after))
                if args.json:
                    print(json.dumps(diff_to_dict(diff), indent=2))
                else:
                    print(format_diff(diff), end="")
                return 0
        except Exception as exc:
            print(f"ERROR: failed to analyze MCP tools: {exc}", file=sys.stderr)
            return 2

    try:
        manifest = load_manifest(args.manifest)
    except ManifestError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    if args.command == "validate":
        result = validate_manifest(manifest)
        _print_validation(result)
        return 0 if result.ok else 1

    if args.command == "explain":
        result = validate_manifest(manifest)
        _print_validation(result, include_success=False)
        print(explain_manifest(manifest))
        return 0 if result.ok else 1

    if args.command == "risk-score":
        result = validate_manifest(manifest)
        _print_validation(result, include_success=False)
        score, reasons = risk_score(manifest)
        print(f"Risk score: {score}/100 ({risk_label(score)})")
        if reasons:
            print("Reasons:")
            for reason in reasons:
                print(f"- {reason}")
        return 0 if result.ok else 1

    if args.command == "generate-policy":
        result = validate_manifest(manifest)
        if not result.ok:
            _print_validation(result)
            return 1
        print(generate_policy(manifest, args.target))
        return 0

    if args.command == "audit":
        result = validate_manifest(manifest)
        if not result.ok:
            _print_validation(result)
            return 1
        try:
            events = load_audit_log(args.audit_log)
        except Exception as exc:
            print(f"ERROR: failed to load audit log: {exc}", file=sys.stderr)
            return 2
        ok, findings = audit_events(manifest, events)
        if ok:
            print("Audit passed. No policy violations found.")
            return 0
        print("Audit findings:")
        for finding in findings:
            print(f"- {finding}")
        return 1

    return 0


def _print_validation(result, include_success: bool = True) -> None:
    if include_success and result.ok:
        print("Manifest is valid.")
    if result.errors:
        print("Errors:")
        for error in result.errors:
            print(f"- {error}")
    if result.warnings:
        print("Warnings:")
        for warning in result.warnings:
            print(f"- {warning}")


if __name__ == "__main__":
    raise SystemExit(main())
