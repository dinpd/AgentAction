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
    check_tools,
    diff_to_dict,
    diff_tools,
    fetch_tools_list,
    format_analysis,
    format_diff,
    load_tools_list,
)
from agentid.mcp_ui import write_mcp_ui
from agentid.mcp_ui_server import serve_mcp_ui
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
    mcp_check_parser = mcp_subparsers.add_parser("check", help="CI-friendly MCP risk check.")
    mcp_check_parser.add_argument("tools_list")
    mcp_check_parser.add_argument("--max-risk", choices=["low", "medium", "high", "critical"], default="high")
    mcp_check_parser.add_argument("--before", help="Previous tools/list response for drift checks.")
    mcp_check_parser.add_argument("--fail-on-drift", action="store_true")
    mcp_check_parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    mcp_ui_parser = mcp_subparsers.add_parser("ui", help="Write the browser-based MCP analyzer UI.")
    mcp_ui_parser.add_argument("--output", default="agentid-mcp-analyzer.html")
    mcp_fetch_parser = mcp_subparsers.add_parser("fetch", help="Fetch tools/list from an HTTP MCP server.")
    mcp_fetch_parser.add_argument("url")
    mcp_fetch_parser.add_argument("--output", default="-", help="Output path, or '-' for stdout.")
    mcp_fetch_parser.add_argument("--header", action="append", default=[], help="HTTP header as 'Name: value'. Can be repeated.")
    mcp_fetch_parser.add_argument("--timeout", type=float, default=20)
    mcp_fetch_parser.add_argument("--protocol-version", default="2025-11-25")
    mcp_fetch_parser.add_argument("--no-initialize", action="store_true", help="Skip initialize and call tools/list directly.")
    mcp_serve_ui_parser = mcp_subparsers.add_parser("serve-ui", help="Serve the MCP analyzer UI with local fetch support.")
    mcp_serve_ui_parser.add_argument("--host", default="127.0.0.1")
    mcp_serve_ui_parser.add_argument("--port", type=int, default=8799)

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
            if args.mcp_command == "check":
                check = check_tools(
                    load_tools_list(args.tools_list),
                    max_risk=args.max_risk,
                    before_tools=load_tools_list(args.before) if args.before else None,
                    fail_on_drift=args.fail_on_drift,
                )
                if args.json:
                    print(
                        json.dumps(
                            {
                                "ok": check.ok,
                                "findings": check.findings,
                                "analysis": analysis_to_dict(check.analysis),
                                "drift": diff_to_dict(check.diff) if check.diff else None,
                            },
                            indent=2,
                        )
                    )
                elif check.ok:
                    print(f"MCP check passed. Risk is {check.analysis.risk_label}.")
                else:
                    print("MCP check failed:")
                    for finding in check.findings:
                        print(f"- {finding}")
                return 0 if check.ok else 1
            if args.mcp_command == "ui":
                path = write_mcp_ui(args.output)
                print(f"Wrote MCP analyzer UI: {path}")
                return 0
            if args.mcp_command == "fetch":
                fetch_result = fetch_tools_list(
                    args.url,
                    headers=parse_headers(args.header),
                    timeout=args.timeout,
                    protocol_version=args.protocol_version,
                    initialize=not args.no_initialize,
                )
                output = json.dumps(fetch_result.payload, indent=2)
                if args.output == "-":
                    print(output)
                else:
                    with open(args.output, "w", encoding="utf-8") as handle:
                        handle.write(output + "\n")
                    print(f"Wrote MCP tools/list: {args.output}")
                return 0
            if args.mcp_command == "serve-ui":
                serve_mcp_ui(args.host, args.port)
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


def parse_headers(values: list[str]) -> dict[str, str]:
    headers: dict[str, str] = {}
    for value in values:
        if ":" not in value:
            raise ValueError(f"header must be formatted as 'Name: value': {value}")
        name, header_value = value.split(":", 1)
        name = name.strip()
        if not name:
            raise ValueError(f"header name is empty: {value}")
        headers[name] = header_value.strip()
    return headers


if __name__ == "__main__":
    raise SystemExit(main())
