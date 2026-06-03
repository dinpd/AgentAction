from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Protocol

from agentid.provider import (
    sign_provider_receipt,
    sign_provider_receipt_jws,
    verify_provider_receipt as verify_receipt_envelope,
)


class ReplayStore(Protocol):
    """Atomically records receipt IDs and rejects already-used IDs."""

    def consume(self, receipt_id: str, expires_at: datetime) -> bool:
        ...


class InMemoryReplayStore:
    def __init__(self) -> None:
        self._used: dict[str, datetime] = {}

    def consume(self, receipt_id: str, expires_at: datetime) -> bool:
        now = datetime.now(timezone.utc)
        expired = [key for key, expiry in self._used.items() if expiry <= now]
        for key in expired:
            del self._used[key]
        if receipt_id in self._used:
            return False
        self._used[receipt_id] = expires_at
        return True


@dataclass(frozen=True)
class ToolReceiptPolicy:
    required: bool = True
    action: str | None = None
    resource: str | Callable[[dict[str, Any]], str | None] | None = None
    resource_template: str | None = None
    required_receipt_fields: list[str] = field(default_factory=list)
    bind_args: dict[str, str] = field(default_factory=dict)
    single_use: bool = True


@dataclass(frozen=True)
class ReceiptVerification:
    ok: bool
    receipt: dict[str, Any] | None
    findings: list[str]


class AgentIdReceiptError(Exception):
    def __init__(self, findings: list[str], status_code: int = 403) -> None:
        super().__init__("AgentID provider authorization receipt denied")
        self.findings = findings
        self.status_code = status_code


class ProviderReceiptVerifier:
    def __init__(
        self,
        *,
        secret: str | Callable[[], str | None] | None = None,
        jwks: dict[str, Any] | Callable[[], dict[str, Any] | None] | None = None,
        issuer: str | None = None,
        audience: str | None = None,
        allowed_algs: list[str] | None = None,
        require_signed: bool = True,
        receipt_argument: str = "_agentid_receipt",
        tools: dict[str, ToolReceiptPolicy] | None = None,
        replay_store: ReplayStore | None = None,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self.secret = secret
        self.jwks = jwks
        self.issuer = issuer
        self.audience = audience
        self.allowed_algs = allowed_algs
        self.require_signed = require_signed
        self.receipt_argument = receipt_argument
        self.tools = tools or {}
        self.replay_store = replay_store
        self.now = now or (lambda: datetime.now(timezone.utc))

    async def dependency(self, body: dict[str, Any]) -> dict[str, Any] | None:
        verification = self.verify_body(body)
        if not verification.ok:
            raise AgentIdReceiptError(verification.findings)
        return verification.receipt

    def verify_body(self, body: dict[str, Any]) -> ReceiptVerification:
        parsed = parse_mcp_tool_call(body)
        if parsed is None:
            return ReceiptVerification(ok=True, receipt=None, findings=[])
        tool, args = parsed
        policy = self.tools.get(tool)
        if policy is None or not policy.required:
            return ReceiptVerification(ok=True, receipt=None, findings=[])
        return verify_provider_receipt(
            args.get(self.receipt_argument),
            secret=self._secret(),
            jwks=self._jwks(),
            issuer=self.issuer,
            audience=self.audience,
            allowed_algs=self.allowed_algs,
            require_signed=self.require_signed,
            tool=tool,
            args=args,
            policy=policy,
            replay_store=self.replay_store,
            now=self.now,
        )

    def _secret(self) -> str | None:
        if callable(self.secret):
            return self.secret()
        return self.secret

    def _jwks(self) -> dict[str, Any] | None:
        if callable(self.jwks):
            return self.jwks()
        return self.jwks


def verify_provider_receipt(
    value: Any,
    *,
    secret: str | None = None,
    jwks: dict[str, Any] | None = None,
    issuer: str | None = None,
    audience: str | None = None,
    allowed_algs: list[str] | None = None,
    require_signed: bool = True,
    tool: str | None = None,
    args: dict[str, Any] | None = None,
    policy: ToolReceiptPolicy | None = None,
    replay_store: ReplayStore | None = None,
    now: Callable[[], datetime] | None = None,
) -> ReceiptVerification:
    if value is None:
        return ReceiptVerification(ok=False, receipt=None, findings=["missing _agentid_receipt"])

    args = args or {}
    current_time = now() if now else datetime.now(timezone.utc)
    expected_resource = expected_resource_for_policy(policy, args)
    result = verify_receipt_envelope(
        value,
        secret=secret,
        jwks=jwks,
        expected_issuer=issuer,
        expected_audience=audience,
        allowed_algs=allowed_algs,
        require_signed=require_signed,
        expected_tool=tool,
        expected_action=policy.action if policy else None,
        expected_resource=expected_resource,
        now=current_time,
    )
    receipt = result.receipt
    findings = list(result.findings)
    if receipt is None:
        return ReceiptVerification(ok=False, receipt=None, findings=findings or ["receipt payload is required"])

    for field_name in policy.required_receipt_fields if policy else []:
        if not string_value(receipt.get(field_name)):
            findings.append(f"receipt {field_name} is required")

    if policy:
        for receipt_field, arg_name in policy.bind_args.items():
            if string_value(receipt.get(receipt_field)) != string_value(args.get(arg_name)):
                findings.append(f"receipt {receipt_field} mismatch")

    expires_at = parse_timestamp(receipt.get("expires_at"))
    if findings == [] and replay_store and policy and policy.single_use and string_value(receipt.get("decision_id")) and expires_at:
        if not replay_store.consume(str(receipt["decision_id"]), expires_at):
            findings.append("receipt was already used")

    return ReceiptVerification(ok=not findings, receipt=receipt, findings=findings)


def parse_mcp_tool_call(body: dict[str, Any]) -> tuple[str, dict[str, Any]] | None:
    if body.get("method") != "tools/call":
        return None
    params = body.get("params")
    if not isinstance(params, dict):
        return None
    tool = params.get("name")
    if not isinstance(tool, str) or not tool:
        return None
    args = params.get("arguments")
    if not isinstance(args, dict):
        args = {}
    return tool, args


def expected_resource_for_policy(policy: ToolReceiptPolicy | None, args: dict[str, Any]) -> str | None:
    if policy is None:
        return None
    if callable(policy.resource):
        return policy.resource(args)
    if isinstance(policy.resource, str):
        return policy.resource
    if policy.resource_template:
        return render_template(policy.resource_template, args)
    return None


def render_template(template: str, args: dict[str, Any]) -> str:
    result = template
    for key, value in args.items():
        result = result.replace("{" + key + "}", string_value(value))
    return result


def parse_timestamp(value: Any) -> datetime | None:
    text = string_value(value)
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def string_value(value: Any) -> str:
    if value is None:
        return ""
    return str(value)
