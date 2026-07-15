from __future__ import annotations

import hashlib
import inspect
import json
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Callable, Protocol, TypeVar

from agentid.provider import (
    ProviderReceiptJwksCache,
    provider_receipt_failure_codes,
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
        self._lock = Lock()

    def consume(self, receipt_id: str, expires_at: datetime) -> bool:
        with self._lock:
            now = datetime.now(timezone.utc)
            expired = [key for key, expiry in self._used.items() if expiry <= now]
            for key in expired:
                del self._used[key]
            if receipt_id in self._used:
                return False
            self._used[receipt_id] = expires_at
            return True


class RevocationStore(Protocol):
    """Answers whether receipt authority was revoked before expiry."""

    def is_revoked(self, receipt_id: str) -> bool:
        ...


class InMemoryRevocationStore:
    def __init__(self) -> None:
        self._revoked: set[str] = set()
        self._lock = Lock()

    def revoke(self, receipt_id: str) -> None:
        with self._lock:
            self._revoked.add(receipt_id)

    def is_revoked(self, receipt_id: str) -> bool:
        with self._lock:
            return receipt_id in self._revoked


@dataclass(frozen=True)
class LedgerConsumption:
    allowed: bool
    finding: str | None = None


class ReceiptLedgerStore(Protocol):
    """Atomically consumes bounded receipt authority before execution."""

    def consume(
        self,
        receipt_id: str,
        expires_at: datetime,
        *,
        max_uses: int | None,
        max_amount: Decimal | None,
        amount: Decimal | None,
        now: datetime,
    ) -> LedgerConsumption:
        ...


@dataclass
class _LedgerEntry:
    expires_at: datetime
    uses: int = 0
    amount: Decimal = Decimal("0")


class InMemoryReceiptLedger:
    def __init__(self) -> None:
        self._entries: dict[str, _LedgerEntry] = {}
        self._lock = Lock()

    def consume(
        self,
        receipt_id: str,
        expires_at: datetime,
        *,
        max_uses: int | None,
        max_amount: Decimal | None,
        amount: Decimal | None,
        now: datetime,
    ) -> LedgerConsumption:
        with self._lock:
            expired = [key for key, entry in self._entries.items() if entry.expires_at <= now]
            for key in expired:
                del self._entries[key]
            entry = self._entries.setdefault(receipt_id, _LedgerEntry(expires_at=expires_at))
            if max_uses is not None and entry.uses >= max_uses:
                finding = "receipt was already used" if max_uses == 1 else "receipt use budget is exhausted"
                return LedgerConsumption(False, finding)
            if max_amount is not None:
                if amount is None:
                    return LedgerConsumption(False, "receipt spend amount is required")
                if entry.amount + amount > max_amount:
                    return LedgerConsumption(False, "receipt spend budget is exhausted")
            entry.uses += 1
            if amount is not None:
                entry.amount += amount
            return LedgerConsumption(True)


@dataclass(frozen=True)
class ExecutionStoreEntry:
    status: str
    request_digest: str
    result: Any | None = None
    replay_count: int = 0


class ExecutionResultStore(Protocol):
    """Atomically reserves, records, and replays provider execution results."""

    def begin(self, receipt_id: str, request_digest: str, expires_at: datetime, *, now: datetime) -> ExecutionStoreEntry:
        ...

    def complete(self, receipt_id: str, request_digest: str, result: Any, *, now: datetime) -> None:
        ...

    def abandon(self, receipt_id: str, request_digest: str) -> None:
        ...


@dataclass
class _ExecutionRecord:
    expires_at: datetime
    request_digest: str
    status: str = "pending"
    result: Any | None = None
    replay_count: int = 0


class InMemoryExecutionResultStore:
    def __init__(self) -> None:
        self._records: dict[str, _ExecutionRecord] = {}
        self._lock = Lock()

    def begin(self, receipt_id: str, request_digest: str, expires_at: datetime, *, now: datetime) -> ExecutionStoreEntry:
        with self._lock:
            expired = [key for key, entry in self._records.items() if entry.expires_at <= now]
            for key in expired:
                del self._records[key]
            record = self._records.get(receipt_id)
            if record is None:
                self._records[receipt_id] = _ExecutionRecord(expires_at=expires_at, request_digest=request_digest)
                return ExecutionStoreEntry("execute", request_digest)
            if record.request_digest != request_digest:
                return ExecutionStoreEntry("out_of_scope", record.request_digest)
            if record.status == "completed":
                record.replay_count += 1
                return ExecutionStoreEntry("replayed", request_digest, record.result, record.replay_count)
            return ExecutionStoreEntry("in_progress", request_digest)

    def complete(self, receipt_id: str, request_digest: str, result: Any, *, now: datetime) -> None:
        with self._lock:
            record = self._records.get(receipt_id)
            if record and record.request_digest == request_digest:
                record.status = "completed"
                record.result = result

    def abandon(self, receipt_id: str, request_digest: str) -> None:
        with self._lock:
            record = self._records.get(receipt_id)
            if record and record.status == "pending" and record.request_digest == request_digest:
                del self._records[receipt_id]


@dataclass(frozen=True)
class ToolReceiptPolicy:
    required: bool = True
    action: str | None = None
    resource: str | Callable[[dict[str, Any]], str | None] | None = None
    resource_template: str | None = None
    required_receipt_fields: list[str] = field(default_factory=list)
    required_receipt_values: dict[str, str | list[str]] = field(default_factory=dict)
    bind_args: dict[str, str] = field(default_factory=dict)
    single_use: bool = True
    max_uses: int | None = None
    max_amount: Decimal | str | int | float | None = None
    amount_arg: str | None = None
    contract_digest: str | None = None


@dataclass(frozen=True)
class ReceiptVerification:
    ok: bool
    receipt: dict[str, Any] | None
    findings: list[str]

    @property
    def codes(self) -> list[str]:
        return provider_receipt_failure_codes(self.findings)


@dataclass(frozen=True)
class ProviderExecutionOutcome:
    status: str
    receipt: dict[str, Any] | None
    result: Any | None = None
    findings: list[str] = field(default_factory=list)
    replay_count: int = 0

    @property
    def executed(self) -> bool:
        return self.status in {"executed", "replayed"}

    @property
    def replayed(self) -> bool:
        return self.status == "replayed"

    @property
    def codes(self) -> list[str]:
        return provider_receipt_failure_codes(self.findings)


class AgentIdReceiptError(Exception):
    def __init__(self, findings: list[str], status_code: int = 403) -> None:
        super().__init__("AgentPass provider authorization receipt denied")
        self.findings = findings
        self.status_code = status_code


class ProviderReceiptVerifier:
    def __init__(
        self,
        *,
        secret: str | Callable[[], str | None] | None = None,
        jwks: dict[str, Any] | Callable[[], dict[str, Any] | None] | None = None,
        jwks_uri: str | None = None,
        jwks_cache: ProviderReceiptJwksCache | None = None,
        jwks_cache_ttl_seconds: int = 300,
        jwks_stale_if_error_seconds: int = 300,
        jwks_timeout_seconds: float = 5.0,
        issuer: str | None = None,
        audience: str | None = None,
        allowed_algs: list[str] | None = None,
        require_signed: bool = True,
        receipt_argument: str = "_agentid_receipt",
        tools: dict[str, ToolReceiptPolicy] | None = None,
        replay_store: ReplayStore | None = None,
        revocation_store: RevocationStore | None = None,
        receipt_ledger: ReceiptLedgerStore | None = None,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self.secret = secret
        self.jwks = jwks
        self.jwks_uri = jwks_uri
        self.jwks_cache = jwks_cache or ProviderReceiptJwksCache()
        self.jwks_cache_ttl_seconds = jwks_cache_ttl_seconds
        self.jwks_stale_if_error_seconds = jwks_stale_if_error_seconds
        self.jwks_timeout_seconds = jwks_timeout_seconds
        self.issuer = issuer
        self.audience = audience
        self.allowed_algs = allowed_algs
        self.require_signed = require_signed
        self.receipt_argument = receipt_argument
        self.tools = tools or {}
        self.replay_store = replay_store
        self.revocation_store = revocation_store
        self.receipt_ledger = receipt_ledger
        self.now = now or (lambda: datetime.now(timezone.utc))

    async def dependency(self, body: dict[str, Any]) -> dict[str, Any] | None:
        verification = self.verify_body(body)
        if not verification.ok:
            raise AgentIdReceiptError(verification.findings)
        return verification.receipt

    def verify_body(self, body: dict[str, Any], *, consume_receipt: bool = True) -> ReceiptVerification:
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
            jwks_uri=self.jwks_uri,
            jwks_cache=self.jwks_cache,
            jwks_cache_ttl_seconds=self.jwks_cache_ttl_seconds,
            jwks_stale_if_error_seconds=self.jwks_stale_if_error_seconds,
            jwks_timeout_seconds=self.jwks_timeout_seconds,
            issuer=self.issuer,
            audience=self.audience,
            allowed_algs=self.allowed_algs,
            require_signed=self.require_signed,
            tool=tool,
            args=args,
            policy=policy,
            replay_store=self.replay_store,
            revocation_store=self.revocation_store,
            receipt_ledger=self.receipt_ledger,
            consume_receipt=consume_receipt,
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


class ProviderExecutionGate:
    """Runs a verified provider handler once and returns its prior outcome on retry."""

    def __init__(self, verifier: ProviderReceiptVerifier, result_store: ExecutionResultStore) -> None:
        self.verifier = verifier
        self.result_store = result_store

    async def execute(
        self,
        body: dict[str, Any],
        handler: Callable[[dict[str, Any]], Any],
    ) -> ProviderExecutionOutcome:
        parsed = parse_mcp_tool_call(body)
        if parsed is None:
            return ProviderExecutionOutcome("denied", None, findings=["MCP tools/call request is required"])

        preflight = self.verifier.verify_body(body, consume_receipt=False)
        if not preflight.ok or preflight.receipt is None:
            return ProviderExecutionOutcome("denied", preflight.receipt, findings=preflight.findings)

        receipt_id = string_value(preflight.receipt.get("decision_id"))
        expires_at = parse_timestamp(preflight.receipt.get("expires_at"))
        if not receipt_id or expires_at is None:
            return ProviderExecutionOutcome("denied", preflight.receipt, findings=["receipt execution identity is invalid"])
        tool, args = parsed
        request_digest = provider_request_digest(tool, args, self.verifier.receipt_argument)
        state = self.result_store.begin(receipt_id, request_digest, expires_at, now=self.verifier.now())
        if state.status == "replayed":
            return ProviderExecutionOutcome("replayed", preflight.receipt, state.result, replay_count=state.replay_count)
        if state.status == "out_of_scope":
            return ProviderExecutionOutcome("denied", preflight.receipt, findings=["provider execution retry has different request digest"])
        if state.status == "in_progress":
            return ProviderExecutionOutcome("denied", preflight.receipt, findings=["provider execution is already in progress"])

        verified = self.verifier.verify_body(body)
        if not verified.ok or verified.receipt is None:
            self.result_store.abandon(receipt_id, request_digest)
            return ProviderExecutionOutcome("denied", verified.receipt, findings=verified.findings)
        try:
            result = handler(verified.receipt)
            if inspect.isawaitable(result):
                result = await result
        except Exception:
            self.result_store.abandon(receipt_id, request_digest)
            raise
        self.result_store.complete(receipt_id, request_digest, result, now=self.verifier.now())
        return ProviderExecutionOutcome("executed", verified.receipt, result)


def verify_provider_receipt(
    value: Any,
    *,
    secret: str | None = None,
    jwks: dict[str, Any] | None = None,
    jwks_uri: str | None = None,
    jwks_cache: ProviderReceiptJwksCache | None = None,
    jwks_cache_ttl_seconds: int = 300,
    jwks_stale_if_error_seconds: int = 300,
    jwks_timeout_seconds: float = 5.0,
    issuer: str | None = None,
    audience: str | None = None,
    allowed_algs: list[str] | None = None,
    require_signed: bool = True,
    tool: str | None = None,
    args: dict[str, Any] | None = None,
    policy: ToolReceiptPolicy | None = None,
    replay_store: ReplayStore | None = None,
    revocation_store: RevocationStore | None = None,
    receipt_ledger: ReceiptLedgerStore | None = None,
    consume_receipt: bool = True,
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
        jwks_uri=jwks_uri,
        jwks_cache=jwks_cache,
        jwks_cache_ttl_seconds=jwks_cache_ttl_seconds,
        jwks_stale_if_error_seconds=jwks_stale_if_error_seconds,
        jwks_timeout_seconds=jwks_timeout_seconds,
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
        if not has_value(receipt.get(field_name)):
            findings.append(f"receipt {field_name} is required")

    if policy:
        for field_name, expected in policy.required_receipt_values.items():
            actual = receipt.get(field_name)
            if isinstance(expected, list):
                actual_values = value_list(actual)
                for expected_value in expected:
                    if expected_value not in actual_values:
                        findings.append(f"receipt {field_name} missing value: {expected_value}")
            elif string_value(actual) != expected:
                findings.append(f"receipt {field_name} mismatch")

    if policy:
        for receipt_field, arg_name in policy.bind_args.items():
            if string_value(receipt.get(receipt_field)) != string_value(args.get(arg_name)):
                findings.append(f"receipt {receipt_field} mismatch")
        if policy.contract_digest and string_value(receipt.get("provider_contract_digest")) != policy.contract_digest:
            findings.append("receipt provider contract digest mismatch")

    receipt_id = string_value(receipt.get("decision_id"))
    expires_at = parse_timestamp(receipt.get("expires_at"))
    if findings == [] and revocation_store and receipt_id and revocation_store.is_revoked(receipt_id):
        findings.append("receipt is revoked")

    if consume_receipt and findings == [] and receipt_ledger and policy and receipt_id and expires_at:
        ledger_options, ledger_finding = ledger_options_for_receipt(receipt, args, policy)
        if ledger_finding:
            findings.append(ledger_finding)
        elif ledger_options is not None:
            consumption = receipt_ledger.consume(receipt_id, expires_at, now=current_time, **ledger_options)
            if not consumption.allowed:
                findings.append(consumption.finding or "receipt budget is exhausted")

    if consume_receipt and findings == [] and replay_store and policy and policy.single_use and receipt_id and expires_at:
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


def provider_request_digest(tool: str, args: dict[str, Any], receipt_argument: str) -> str:
    bound_args = {key: value for key, value in args.items() if key != receipt_argument}
    payload = json.dumps({"tool": tool, "arguments": bound_args}, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


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


def ledger_options_for_receipt(
    receipt: dict[str, Any], args: dict[str, Any], policy: ToolReceiptPolicy
) -> tuple[dict[str, Any] | None, str | None]:
    receipt_max_uses, uses_error = positive_int(receipt.get("max_uses"))
    if "max_uses" in receipt and uses_error:
        return None, "receipt max_uses is invalid"
    policy_max_uses, policy_uses_error = positive_int(policy.max_uses)
    if policy.max_uses is not None and policy_uses_error:
        return None, "provider max_uses policy is invalid"

    receipt_max_amount, amount_error = positive_decimal(receipt.get("max_amount"))
    if "max_amount" in receipt and amount_error:
        return None, "receipt max_amount is invalid"
    policy_max_amount, policy_amount_error = positive_decimal(policy.max_amount)
    if policy.max_amount is not None and policy_amount_error:
        return None, "provider max_amount policy is invalid"

    max_uses = most_restrictive(receipt_max_uses, policy_max_uses)
    max_amount = most_restrictive(receipt_max_amount, policy_max_amount)
    if max_uses is None and max_amount is None:
        return None, None

    amount = None
    if max_amount is not None:
        if not policy.amount_arg:
            return None, "provider amount_arg is required for a spend-capped receipt"
        amount, value_error = positive_decimal(args.get(policy.amount_arg))
        if value_error:
            return None, f"receipt amount is invalid: {policy.amount_arg}"
    return {"max_uses": max_uses, "max_amount": max_amount, "amount": amount}, None


def positive_int(value: Any) -> tuple[int | None, bool]:
    if value is None:
        return None, False
    if isinstance(value, bool):
        return None, True
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None, True
    return (parsed, False) if parsed > 0 and str(parsed) == str(value).strip() else (None, True)


def positive_decimal(value: Any) -> tuple[Decimal | None, bool]:
    if value is None:
        return None, False
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None, True
    return (parsed, False) if parsed > 0 else (None, True)


Limit = TypeVar("Limit", int, Decimal)


def most_restrictive(first: Limit | None, second: Limit | None) -> Limit | None:
    if first is None:
        return second
    if second is None:
        return first
    return min(first, second)


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


def has_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, list):
        return len(value) > 0
    return bool(str(value))


def value_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    text = string_value(value)
    if not text:
        return []
    return [item.strip() for item in text.replace(",", " ").split() if item.strip()]
