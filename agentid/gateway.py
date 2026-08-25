from __future__ import annotations

import argparse
import json
import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from agentid.audit import audit_events
from agentid.capabilities import capabilities_by_id
from agentid.manifest import ManifestError, load_manifest, validate_manifest
from agentid.policy import generate_policy


APPROVAL_REQUIRED = {"required", "human_confirm", "step_up", "manager"}


@dataclass
class Decision:
    allow: bool
    findings: list[str]
    event: dict[str, Any]


@dataclass
class JitGrant:
    grant_id: str
    agent_id: str
    tool: str
    action: str
    resource: str
    approval_id: str
    user_id: str
    expires_at: datetime
    job_id: str = ""
    case_id: str = ""
    customer_id: str = ""
    context: dict[str, str] | None = None
    used: bool = False

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "jit_grant_id": self.grant_id,
            "agent_id": self.agent_id,
            "tool": self.tool,
            "action": self.action,
            "resource": self.resource,
            "approval_id": self.approval_id,
            "user_id": self.user_id,
            "expires_at": self.expires_at.isoformat().replace("+00:00", "Z"),
            "job_id": self.job_id,
            "case_id": self.case_id,
            "customer_id": self.customer_id,
            "used": self.used,
        }
        if self.context:
            data["context"] = self.context
        return data


@dataclass
class ApprovalRequest:
    approval_id: str
    status: str
    agent_id: str
    tool: str
    action: str
    resource: str
    requested_by: str
    reason: str
    created_at: datetime
    decided_at: datetime | None = None
    decided_by: str = ""
    job_id: str = ""
    case_id: str = ""
    customer_id: str = ""
    context: dict[str, str] | None = None
    findings: list[str] | None = None

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "approval_id": self.approval_id,
            "status": self.status,
            "agent_id": self.agent_id,
            "tool": self.tool,
            "action": self.action,
            "resource": self.resource,
            "requested_by": self.requested_by,
            "reason": self.reason,
            "created_at": self.created_at.isoformat().replace("+00:00", "Z"),
            "decided_by": self.decided_by,
            "job_id": self.job_id,
            "case_id": self.case_id,
            "customer_id": self.customer_id,
            "findings": self.findings or [],
        }
        if self.decided_at:
            data["decided_at"] = self.decided_at.isoformat().replace("+00:00", "Z")
        if self.context:
            data["context"] = self.context
        return data


class ApprovalRequestStore:
    def __init__(self) -> None:
        self._requests: dict[str, ApprovalRequest] = {}

    def create(self, manifest: dict[str, Any], request: dict[str, Any]) -> ApprovalRequest:
        agent_id = str(manifest.get("agent", {}).get("id", ""))
        tool_name = str(request.get("tool", ""))
        action = str(request.get("action", ""))
        tool = _tool_by_name(manifest, tool_name)
        if not tool:
            raise ValueError(f"unknown tool: {tool_name}")
        if tool.get("access") != action:
            raise ValueError(f"action does not match manifest access for {tool_name}")
        if not _approval_required(tool):
            raise ValueError(f"{tool_name} does not require approval")

        approval_id = str(request.get("approval_id") or secrets.token_urlsafe(18))
        approval = ApprovalRequest(
            approval_id=approval_id,
            status="pending",
            agent_id=agent_id,
            tool=tool_name,
            action=action,
            resource=str(request.get("resource", "")),
            requested_by=str(request.get("requested_by", request.get("user_id", ""))),
            reason=str(request.get("reason", "")),
            created_at=datetime.now(timezone.utc),
            job_id=str(request.get("job_id", "")),
            case_id=str(request.get("case_id", "")),
            customer_id=str(request.get("customer_id", "")),
            context=_string_context(request),
            findings=[],
        )
        self._requests[approval.approval_id] = approval
        return approval

    def get(self, approval_id: str) -> ApprovalRequest | None:
        return self._requests.get(approval_id)

    def approve(self, approval_id: str, payload: dict[str, Any] | None = None) -> ApprovalRequest:
        approval = self._require(approval_id)
        approval.status = "approved"
        approval.decided_at = datetime.now(timezone.utc)
        approval.decided_by = str((payload or {}).get("decided_by", (payload or {}).get("user_id", "")))
        approval.findings = _findings(payload or {})
        return approval

    def deny(self, approval_id: str, payload: dict[str, Any] | None = None) -> ApprovalRequest:
        approval = self._require(approval_id)
        approval.status = "denied"
        approval.decided_at = datetime.now(timezone.utc)
        approval.decided_by = str((payload or {}).get("decided_by", (payload or {}).get("user_id", "")))
        approval.findings = _findings(payload or {})
        return approval

    def require_approved_for_grant(self, manifest: dict[str, Any], request: dict[str, Any]) -> None:
        tool_name = str(request.get("tool", ""))
        tool = _tool_by_name(manifest, tool_name)
        if not tool or not _approval_required(tool):
            return

        approval_id = str(request.get("approval_id", ""))
        if not approval_id:
            raise ValueError("approval_id is required for approval-gated JIT grants")
        approval = self.get(approval_id)
        if not approval:
            raise ValueError(f"approval request not found: {approval_id}")
        if approval.status == "denied":
            raise ValueError(f"approval request is denied: {approval_id}")
        if approval.status != "approved":
            raise ValueError(f"approval request is not approved: {approval_id}")

        expected_agent_id = str(manifest.get("agent", {}).get("id", ""))
        if approval.agent_id != expected_agent_id:
            raise ValueError("approval request agent_id mismatch")
        if approval.tool != tool_name:
            raise ValueError("approval request tool mismatch")
        if approval.action != str(request.get("action", "")):
            raise ValueError("approval request action mismatch")
        _assert_matching("resource", approval.resource, request.get("resource"))
        _assert_matching("job_id", approval.job_id, request.get("job_id"))
        _assert_matching("case_id", approval.case_id, request.get("case_id"))
        _assert_matching("customer_id", approval.customer_id, request.get("customer_id"))
        for key, value in (approval.context or {}).items():
            _assert_matching(key, value, request.get(key))

    def _require(self, approval_id: str) -> ApprovalRequest:
        approval = self.get(approval_id)
        if not approval:
            raise ValueError(f"approval request not found: {approval_id}")
        return approval


class JitGrantStore:
    def __init__(self) -> None:
        self._grants: dict[str, JitGrant] = {}

    def create(self, manifest: dict[str, Any], request: dict[str, Any]) -> JitGrant:
        agent_id = manifest.get("agent", {}).get("id")
        tool_name = str(request.get("tool", ""))
        action = str(request.get("action", ""))
        tool = _tool_by_name(manifest, tool_name)
        if not tool:
            raise ValueError(f"unknown tool: {tool_name}")
        if tool.get("access") != action:
            raise ValueError(f"action does not match manifest access for {tool_name}")
        if tool.get("auth_mode") != "just_in_time":
            raise ValueError(f"{tool_name} does not require just-in-time authorization")
        if tool.get("approval") in APPROVAL_REQUIRED and not request.get("approval_id"):
            raise ValueError("approval_id is required for approval-gated JIT grants")

        ttl_seconds = _grant_ttl_seconds(manifest, tool)
        grant = JitGrant(
            grant_id=secrets.token_urlsafe(24),
            agent_id=str(agent_id),
            tool=tool_name,
            action=action,
            resource=str(request.get("resource", "")),
            approval_id=str(request.get("approval_id", "")),
            user_id=str(request.get("user_id", "")),
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds),
            job_id=str(request.get("job_id", "")),
            case_id=str(request.get("case_id", "")),
            customer_id=str(request.get("customer_id", "")),
            context=_string_context(request),
        )
        self._grants[grant.grant_id] = grant
        return grant

    def bind_event(self, manifest: dict[str, Any], event: dict[str, Any]) -> list[str]:
        tool = _tool_by_name(manifest, str(event.get("tool", "")))
        if not tool or tool.get("auth_mode") != "just_in_time":
            return []

        grant_id = event.get("jit_grant_id")
        if not grant_id:
            event["jit_grant_valid"] = False
            return ["missing jit_grant_id"]

        grant = self._grants.get(str(grant_id))
        if not grant:
            event["jit_grant_valid"] = False
            return ["unknown jit_grant_id"]

        findings: list[str] = []
        now = datetime.now(timezone.utc)
        if grant.expires_at <= now:
            findings.append("JIT grant is expired")
        if grant.used:
            findings.append("JIT grant was already used")
        if grant.agent_id != event.get("agent_id"):
            findings.append("JIT grant agent_id mismatch")
        if grant.tool != event.get("tool"):
            findings.append("JIT grant tool mismatch")
        if grant.action != event.get("action"):
            findings.append("JIT grant action mismatch")
        if grant.resource and event.get("resource") and grant.resource != event.get("resource"):
            findings.append("JIT grant resource mismatch")
        if grant.job_id and event.get("job_id") and grant.job_id != event.get("job_id"):
            findings.append("JIT grant job_id mismatch")
        if grant.case_id and event.get("case_id") and grant.case_id != event.get("case_id"):
            findings.append("JIT grant case_id mismatch")
        if grant.customer_id and event.get("customer_id") and grant.customer_id != event.get("customer_id"):
            findings.append("JIT grant customer_id mismatch")
        for key, value in (grant.context or {}).items():
            if event.get(key) and str(event.get(key)) != value:
                findings.append(f"JIT grant {key} mismatch")

        event["jit_grant_valid"] = not findings
        event["jit_grant_agent_id"] = grant.agent_id
        event["jit_grant_tool"] = grant.tool
        event["jit_grant_action"] = grant.action
        event["jit_grant_job_id"] = grant.job_id
        event["jit_grant_case_id"] = grant.case_id
        event["jit_grant_customer_id"] = grant.customer_id
        if grant.context:
            event["jit_grant_context"] = grant.context

        if not findings and manifest.get("jit_authorization", {}).get("revoke_after_use"):
            grant.used = True

        return findings


class AgentGateway:
    def __init__(
        self,
        manifest: dict[str, Any],
        grants: JitGrantStore | None = None,
        approvals: ApprovalRequestStore | None = None,
    ) -> None:
        validation = validate_manifest(manifest)
        if not validation.ok:
            raise ManifestError("; ".join(validation.errors))
        self.manifest = manifest
        self.grants = grants or JitGrantStore()
        self.approvals = approvals or ApprovalRequestStore()

    def authorize(self, event: dict[str, Any]) -> Decision:
        normalized = {
            "agent_id": event.get("agent_id", self.manifest.get("agent", {}).get("id")),
            "tool": event.get("tool"),
            "capability": event.get("capability"),
            "skill_id": event.get("skill_id"),
            "action": event.get("action"),
            "data_from": event.get("data_from", ""),
            "data_to": event.get("data_to", ""),
            "approved": bool(event.get("approved", False)),
            "jit_grant_id": event.get("jit_grant_id"),
            "resource": event.get("resource", ""),
            "called_agent": event.get("called_agent"),
            "delegated_tool": event.get("delegated_tool"),
            "delegation_depth": event.get("delegation_depth"),
            "delegation_grant_id": event.get("delegation_grant_id"),
            "approval_source": event.get("approval_source"),
            "approval_agent": event.get("approval_agent"),
            "tenant_id": event.get("tenant_id"),
            "user_id": event.get("user_id"),
            "job_id": event.get("job_id"),
            "case_id": event.get("case_id"),
            "customer_id": event.get("customer_id"),
        }
        normalized.update(_string_context(event))
        findings = self.grants.bind_event(self.manifest, normalized)
        ok, audit_findings = audit_events(self.manifest, [normalized])
        findings.extend(audit_findings)
        return Decision(allow=not findings and ok, findings=findings, event=normalized)

    def create_jit_grant(self, request: dict[str, Any]) -> JitGrant:
        self.approvals.require_approved_for_grant(self.manifest, request)
        return self.grants.create(self.manifest, request)

    def create_approval_request(self, request: dict[str, Any]) -> ApprovalRequest:
        return self.approvals.create(self.manifest, request)

    def get_approval_request(self, approval_id: str) -> ApprovalRequest | None:
        return self.approvals.get(approval_id)

    def approve_approval_request(self, approval_id: str, payload: dict[str, Any] | None = None) -> ApprovalRequest:
        return self.approvals.approve(approval_id, payload)

    def deny_approval_request(self, approval_id: str, payload: dict[str, Any] | None = None) -> ApprovalRequest:
        return self.approvals.deny(approval_id, payload)

    def policy(self, target: str = "opa") -> str:
        return generate_policy(self.manifest, target)


def serve(manifest_path: str | Path, host: str, port: int, api_key: str | None = None) -> None:
    gateway = AgentGateway(load_manifest(manifest_path))

    class Handler(BaseHTTPRequestHandler):
        server_version = "AgentActionGateway/0.1"

        def do_GET(self) -> None:
            if not self._authorized():
                return
            parsed = urlparse(self.path)
            if parsed.path == "/health":
                self._json({"ok": True, "agent_id": gateway.manifest.get("agent", {}).get("id")})
                return
            if parsed.path == "/policy":
                target = parse_qs(parsed.query).get("target", ["opa"])[0]
                try:
                    self._text(gateway.policy(target))
                except Exception as exc:
                    self._json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
                return
            if parsed.path.startswith("/approval-requests/"):
                approval_id = parsed.path.removeprefix("/approval-requests/").strip("/")
                approval = gateway.get_approval_request(approval_id)
                if not approval:
                    self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)
                    return
                self._json(approval.to_dict())
                return
            self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)

        def do_POST(self) -> None:
            if not self._authorized():
                return
            parsed = urlparse(self.path)
            try:
                payload = self._read_json()
            except ValueError as exc:
                self._json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
                return

            if parsed.path == "/authorize":
                decision = gateway.authorize(payload)
                self._json(
                    {
                        "allow": decision.allow,
                        "findings": decision.findings,
                        "decision": "allow" if decision.allow else "deny",
                        "event": decision.event,
                    },
                    HTTPStatus.OK if decision.allow else HTTPStatus.FORBIDDEN,
                )
                return
            if parsed.path == "/approval-requests":
                try:
                    approval = gateway.create_approval_request(payload)
                except ValueError as exc:
                    self._json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
                    return
                self._json(approval.to_dict(), HTTPStatus.CREATED)
                return
            if parsed.path.startswith("/approval-requests/"):
                parts = [part for part in parsed.path.split("/") if part]
                if len(parts) != 3 or parts[2] not in {"approve", "deny"}:
                    self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)
                    return
                try:
                    if parts[2] == "approve":
                        approval = gateway.approve_approval_request(parts[1], payload)
                    else:
                        approval = gateway.deny_approval_request(parts[1], payload)
                except ValueError as exc:
                    self._json({"error": str(exc)}, HTTPStatus.NOT_FOUND)
                    return
                self._json(approval.to_dict())
                return
            if parsed.path == "/jit-grants":
                try:
                    grant = gateway.create_jit_grant(payload)
                except ValueError as exc:
                    self._json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
                    return
                self._json(grant.to_dict(), HTTPStatus.CREATED)
                return
            self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)

        def do_OPTIONS(self) -> None:
            self.send_response(HTTPStatus.NO_CONTENT)
            self._cors()
            self.end_headers()

        def log_message(self, fmt: str, *args: Any) -> None:
            print("%s - %s" % (self.address_string(), fmt % args))

        def _authorized(self) -> bool:
            if not api_key:
                return True
            supplied = self.headers.get("authorization", "")
            if supplied == f"Bearer {api_key}":
                return True
            self._json({"error": "unauthorized"}, HTTPStatus.UNAUTHORIZED)
            return False

        def _read_json(self) -> dict[str, Any]:
            length = int(self.headers.get("content-length", "0"))
            if length <= 0:
                return {}
            try:
                payload = json.loads(self.rfile.read(length))
            except json.JSONDecodeError as exc:
                raise ValueError(f"invalid JSON: {exc}") from exc
            if not isinstance(payload, dict):
                raise ValueError("JSON body must be an object")
            return payload

        def _json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
            body = json.dumps(payload, indent=2).encode()
            self.send_response(status)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)

        def _text(self, payload: str, status: HTTPStatus = HTTPStatus.OK) -> None:
            body = payload.encode()
            self.send_response(status)
            self.send_header("content-type", "text/plain; charset=utf-8")
            self.send_header("content-length", str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)

        def _cors(self) -> None:
            self.send_header("access-control-allow-origin", "*")
            self.send_header("access-control-allow-methods", "GET, POST, OPTIONS")
            self.send_header("access-control-allow-headers", "authorization, content-type")

    httpd = ThreadingHTTPServer((host, port), Handler)
    print(f"AgentAction gateway listening on http://{host}:{port}")
    httpd.serve_forever()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="agentid-gateway")
    parser.add_argument("manifest")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--api-key", default=os.environ.get("AGENTID_GATEWAY_API_KEY"))
    args = parser.parse_args(argv)
    serve(args.manifest, args.host, args.port, args.api_key)
    return 0


def _tool_by_name(manifest: dict[str, Any], name: str) -> dict[str, Any] | None:
    return capabilities_by_id(manifest).get(name)


def _grant_ttl_seconds(manifest: dict[str, Any], tool: dict[str, Any]) -> int:
    constraints = tool.get("constraints", {})
    ttl = constraints.get("token_ttl_seconds") if isinstance(constraints, dict) else None
    if isinstance(ttl, int) and ttl > 0:
        return ttl
    default_ttl = manifest.get("jit_authorization", {}).get("default_ttl_seconds")
    if isinstance(default_ttl, int) and default_ttl > 0:
        return default_ttl
    return 300


def _approval_required(tool: dict[str, Any]) -> bool:
    return tool.get("approval") in APPROVAL_REQUIRED


def _assert_matching(field: str, approved_value: Any, requested_value: Any) -> None:
    if not _has_value(approved_value):
        return
    if not _has_value(requested_value) or str(approved_value) != str(requested_value):
        raise ValueError(f"approval request {field} mismatch")


def _findings(payload: dict[str, Any]) -> list[str]:
    findings = payload.get("findings", [])
    if isinstance(findings, list):
        return [str(finding) for finding in findings]
    if isinstance(findings, str):
        return [findings]
    return []


def _has_value(value: Any) -> bool:
    return value is not None and str(value) != ""


_RESERVED_EVENT_FIELDS = {
    "agent_id",
    "tool",
    "capability",
    "skill_id",
    "action",
    "data_from",
    "data_to",
    "approved",
    "jit_grant_id",
    "approval_id",
    "resource",
    "called_agent",
    "delegated_tool",
    "delegation_depth",
    "delegation_grant_id",
    "approval_source",
    "approval_agent",
    "tenant_id",
    "user_id",
    "job_id",
    "case_id",
    "customer_id",
    "context",
    "requested_by",
    "reason",
    "decided_by",
    "findings",
}


def _string_context(payload: dict[str, Any]) -> dict[str, str]:
    context: dict[str, str] = {}
    raw_context = payload.get("context")
    if isinstance(raw_context, dict):
        for key, value in raw_context.items():
            if isinstance(key, str) and _is_context_scalar(value):
                context[key] = str(value)
    for key, value in payload.items():
        if key not in _RESERVED_EVENT_FIELDS and _is_context_scalar(value):
            context[str(key)] = str(value)
    return context


def _is_context_scalar(value: Any) -> bool:
    return isinstance(value, (str, int, float, bool)) and value is not None


if __name__ == "__main__":
    raise SystemExit(main())
