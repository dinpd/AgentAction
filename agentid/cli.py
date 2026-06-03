from __future__ import annotations

import argparse
import json
import os
import sys

import yaml

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
from agentid.provider import (
    ProviderContractError,
    ProviderReceiptJwksCache,
    diff_provider_contracts,
    format_provider_diff,
    import_provider_contract,
    load_provider_contract,
    provider_contract_from_openapi,
    provider_contract_yaml,
    provider_diff_to_dict,
    provider_manifest_yaml,
    provider_schema_json,
    validate_provider_contract,
    verify_provider_receipt,
)
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

    provider_parser = subparsers.add_parser("provider", help="Work with provider-published MCP authorization contracts.")
    provider_subparsers = provider_parser.add_subparsers(dest="provider_command", required=True)
    provider_subparsers.add_parser("schema", help="Print the provider MCP authorization contract JSON Schema.")
    provider_validate_parser = provider_subparsers.add_parser("validate", help="Validate a provider MCP authorization contract.")
    provider_validate_parser.add_argument("contract")
    provider_diff_parser = provider_subparsers.add_parser("diff", help="Compare two provider MCP authorization contracts.")
    provider_diff_parser.add_argument("before")
    provider_diff_parser.add_argument("after")
    provider_diff_parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    provider_import_parser = provider_subparsers.add_parser("import", help="Generate a reviewable AgentID manifest from a provider contract.")
    provider_import_parser.add_argument("contract")
    provider_import_parser.add_argument("--agent", required=True, help="Agent ID for the generated manifest.")
    provider_import_parser.add_argument("--name", help="Agent display name for the generated manifest.")
    provider_import_parser.add_argument("--owner", default="enterprise-ai-platform")
    provider_import_parser.add_argument("--environment", default="production")
    provider_import_parser.add_argument("--output", default="-", help="Output path, or '-' for stdout.")
    provider_openapi_parser = provider_subparsers.add_parser("from-openapi", help="Generate a provider MCP authorization contract from an OpenAPI document.")
    provider_openapi_parser.add_argument("openapi")
    provider_openapi_parser.add_argument("--provider", help="Provider key for generated resources and contract metadata.")
    provider_openapi_parser.add_argument("--mcp-server", help="MCP server key for generated contract metadata.")
    provider_openapi_parser.add_argument("--tool-prefix", help="Tool name prefix. Defaults to provider key.")
    provider_openapi_parser.add_argument("--output", default="-", help="Output path, or '-' for stdout.")
    provider_receipt_parser = provider_subparsers.add_parser("verify-receipt", help="Verify a provider authorization receipt.")
    provider_receipt_parser.add_argument("receipt", help="YAML or JSON receipt payload, or '-' for stdin.")
    provider_receipt_parser.add_argument("--secret", help="HMAC secret for signed receipts.")
    provider_receipt_parser.add_argument("--secret-env", help="Environment variable containing the HMAC secret.")
    provider_receipt_parser.add_argument("--jwks", help="JWKS file for JWS signed receipts.")
    provider_receipt_parser.add_argument("--jwks-uri", help="JWKS URI for JWS signed receipts.")
    provider_receipt_parser.add_argument("--jwks-cache-ttl", type=int, default=300, help="Remote JWKS cache TTL in seconds.")
    provider_receipt_parser.add_argument(
        "--jwks-stale-if-error",
        type=int,
        default=300,
        help="How long to reuse an expired remote JWKS after refresh failures, in seconds.",
    )
    provider_receipt_parser.add_argument("--jwks-timeout", type=float, default=5.0, help="Remote JWKS fetch timeout in seconds.")
    provider_receipt_parser.add_argument("--issuer", help="Expected JWS issuer.")
    provider_receipt_parser.add_argument("--audience", help="Expected JWS audience.")
    provider_receipt_parser.add_argument("--allowed-alg", action="append", help="Allowed JWS algorithm. Can be repeated.")
    provider_receipt_parser.add_argument("--require-signed", action="store_true", help="Fail if the receipt is not signed.")
    provider_receipt_parser.add_argument("--tenant", help="Expected tenant_id.")
    provider_receipt_parser.add_argument("--agent", help="Expected agent_id.")
    provider_receipt_parser.add_argument("--tool", help="Expected tool.")
    provider_receipt_parser.add_argument("--action", help="Expected action.")
    provider_receipt_parser.add_argument("--resource", help="Expected resource.")
    provider_receipt_parser.add_argument("--job", help="Expected job_id.")
    provider_receipt_parser.add_argument("--case", help="Expected case_id.")
    provider_receipt_parser.add_argument("--customer", help="Expected customer_id.")
    provider_receipt_parser.add_argument("--approval", help="Expected approval_id.")
    provider_receipt_parser.add_argument("--jit-grant", help="Expected jit_grant_id.")
    provider_receipt_parser.add_argument("--amount", help="Expected amount.")
    provider_receipt_parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")

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

    if args.command == "provider":
        if args.provider_command == "schema":
            print(provider_schema_json(), end="")
            return 0
        try:
            if args.provider_command == "validate":
                contract = load_provider_contract(args.contract)
            else:
                contract = None
        except ProviderContractError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 2
        if args.provider_command == "validate":
            result = validate_provider_contract(contract)
            if result.ok:
                print("Provider MCP contract is valid.")
            _print_validation(result, include_success=False)
            return 0 if result.ok else 1
        if args.provider_command == "diff":
            try:
                diff = diff_provider_contracts(load_provider_contract(args.before), load_provider_contract(args.after))
            except ProviderContractError as exc:
                print(f"ERROR: {exc}", file=sys.stderr)
                return 2
            if args.json:
                print(json.dumps(provider_diff_to_dict(diff), indent=2))
            else:
                print(format_provider_diff(diff), end="")
            return 0
        if args.provider_command == "import":
            try:
                manifest = import_provider_contract(
                    load_provider_contract(args.contract),
                    args.agent,
                    agent_name=args.name,
                    owner=args.owner,
                    environment=args.environment,
                )
            except ProviderContractError as exc:
                print(f"ERROR: {exc}", file=sys.stderr)
                return 2
            output = provider_manifest_yaml(manifest)
            if args.output == "-":
                print(output, end="")
            else:
                with open(args.output, "w", encoding="utf-8") as handle:
                    handle.write(output)
                print(f"Wrote AgentID manifest: {args.output}")
            return 0
        if args.provider_command == "from-openapi":
            try:
                contract = provider_contract_from_openapi(
                    load_provider_contract(args.openapi),
                    provider=args.provider,
                    mcp_server=args.mcp_server,
                    tool_prefix=args.tool_prefix,
                )
            except ProviderContractError as exc:
                print(f"ERROR: {exc}", file=sys.stderr)
                return 2
            output = provider_contract_yaml(contract)
            if args.output == "-":
                print(output, end="")
            else:
                with open(args.output, "w", encoding="utf-8") as handle:
                    handle.write(output)
                print(f"Wrote provider MCP contract: {args.output}")
            return 0
        if args.provider_command == "verify-receipt":
            try:
                receipt = load_yaml_object(args.receipt, "receipt")
            except ProviderContractError as exc:
                print(f"ERROR: {exc}", file=sys.stderr)
                return 2
            secret = args.secret
            if args.secret_env:
                secret = os.environ.get(args.secret_env)
                if not secret:
                    print(f"ERROR: environment variable is not set: {args.secret_env}", file=sys.stderr)
                    return 2
            jwks = None
            if args.jwks:
                try:
                    jwks = load_yaml_object(args.jwks, "JWKS")
                except ProviderContractError as exc:
                    print(f"ERROR: {exc}", file=sys.stderr)
                    return 2
            result = verify_provider_receipt(
                receipt,
                secret=secret,
                jwks=jwks,
                jwks_uri=args.jwks_uri,
                jwks_cache=ProviderReceiptJwksCache(),
                jwks_cache_ttl_seconds=args.jwks_cache_ttl,
                jwks_stale_if_error_seconds=args.jwks_stale_if_error,
                jwks_timeout_seconds=args.jwks_timeout,
                expected_issuer=args.issuer,
                expected_audience=args.audience,
                allowed_algs=args.allowed_alg,
                require_signed=args.require_signed,
                expected_tenant=args.tenant,
                expected_agent=args.agent,
                expected_tool=args.tool,
                expected_action=args.action,
                expected_resource=args.resource,
                expected_job=args.job,
                expected_case=args.case,
                expected_customer=args.customer,
                expected_approval=args.approval,
                expected_jit_grant=args.jit_grant,
                expected_amount=args.amount,
            )
            if args.json:
                print(json.dumps({"ok": result.ok, "findings": result.findings, "receipt": result.receipt}, indent=2))
            elif result.ok:
                print("Provider authorization receipt is valid.")
            else:
                print("Provider authorization receipt is invalid:")
                for finding in result.findings:
                    print(f"- {finding}")
            return 0 if result.ok else 1

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


def load_yaml_object(path: str, label: str) -> dict:
    try:
        if path == "-":
            data = yaml.safe_load(sys.stdin.read()) or {}
        else:
            with open(path, encoding="utf-8") as handle:
                data = yaml.safe_load(handle) or {}
    except OSError as exc:
        raise ProviderContractError(f"Failed to load {label}: {exc}") from exc
    except yaml.YAMLError as exc:
        raise ProviderContractError(f"Invalid YAML {label}: {exc}") from exc
    if not isinstance(data, dict):
        raise ProviderContractError(f"{label} root must be a mapping/object.")
    return data


if __name__ == "__main__":
    raise SystemExit(main())
