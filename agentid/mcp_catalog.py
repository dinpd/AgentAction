"""Bounded, discovery-only MCP catalog capture. No tool or resource execution."""

from __future__ import annotations

import hashlib
import json
import math
import time
from datetime import datetime, timezone
from urllib import request
from urllib.parse import urlsplit

from agentid import __version__
from agentid.mcp import DEFAULT_PROTOCOL_VERSION, PostJson, parse_json_or_sse


SURFACES = {
    "tools": ("tools", "tools/list", "name"),
    "resources": ("resources", "resources/list", "uri"),
    "resourceTemplates": ("resources", "resources/templates/list", "uriTemplate"),
}
CATALOG_VERSION = "agentaction.mcp-catalog.v1"
MAX_BYTES = 2 * 1024 * 1024
MAX_CATALOG_BYTES = 8 * 1024 * 1024


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("MCP discovery redirects are not allowed")


def discovery_post(url, payload, headers, timeout):
    req = request.Request(url, data=json.dumps(payload).encode(), headers=headers, method="POST")
    deadline = time.monotonic() + timeout
    with request.build_opener(NoRedirect()).open(req, timeout=timeout) as response:
        chunks, size, events = [], 0, b""
        is_sse = "text/event-stream" in response.headers.get("Content-Type", "").lower()
        response_headers = {k.lower(): v for k, v in response.headers.items()}
        while True:
            if time.monotonic() >= deadline:
                raise ValueError("MCP discovery response exceeded time limit")
            chunk = response.read1(min(65536, MAX_BYTES + 1 - size))
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_BYTES:
                raise ValueError("MCP discovery response exceeds byte limit")
            chunks.append(chunk)
            if is_sse:
                events += chunk
                # Find complete events without waiting for a persistent stream
                # to close. Ignore unrelated notifications/responses.
                while b"\n\n" in events.replace(b"\r\n", b"\n"):
                    event, events = events.replace(b"\r\n", b"\n").split(b"\n\n", 1)
                    if not any(line.startswith(b"data:") for line in event.splitlines()):
                        continue
                    candidate = parse_json_or_sse(event.decode())
                    if "id" in payload and candidate.get("id") == payload["id"]:
                        return candidate, response_headers
        raw = b"".join(chunks)
        data = parse_json_or_sse(raw.decode()) if raw.strip() else None
        return data, response_headers


def catalog_hash(surfaces):
    normalized = {
        key: sorted(value["items"], key=lambda item: json.dumps(item, sort_keys=True))
        for key, value in surfaces.items()
    }
    return hashlib.sha256(json.dumps(normalized, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def discover_catalog(url: str, headers=None, timeout=30, max_pages=20, max_items=2000,
                     protocol_version=DEFAULT_PROTOCOL_VERSION, post_json: PostJson | None = None):
    """Capture advertised surfaces; partial failures are data, never empty success.

    This transport targets the initialized MCP protocol through 2025-11-25.
    Unsupported negotiated versions fail closed rather than guessing semantics.
    The caller explicitly selects the destination, including local test servers.
    """
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        raise ValueError("discovery requires an HTTP(S) URL without userinfo or fragment")
    if not math.isfinite(timeout) or not 0 < timeout <= 300 or not 1 <= max_pages <= 100 or not 1 <= max_items <= 10000:
        raise ValueError("timeout must be 0–300 seconds, pages 1–100, items 1–10000")
    if protocol_version not in {"2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"}:
        raise ValueError("unsupported initialized MCP protocol version")
    started = time.monotonic()
    post = post_json or discovery_post
    operation_headers = {"accept": "application/json, text/event-stream", "content-type": "application/json", **(headers or {})}
    counter = 0

    def rpc(method, params=None, notification=False):
        nonlocal counter
        remaining = timeout - (time.monotonic() - started)
        if remaining <= 0:
            raise ValueError("discovery time limit reached")
        counter += 1
        payload = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            payload["params"] = params
        if not notification:
            payload["id"] = counter
        response, response_headers = post(url, payload, operation_headers.copy(), remaining)
        if notification:
            return {}, response_headers
        if (not isinstance(response, dict) or response.get("jsonrpc") != "2.0"
                or response.get("id") != counter or "error" in response
                or not isinstance(response.get("result"), dict)):
            raise ValueError("invalid or failed discovery response")
        return response["result"], response_headers

    surfaces = {key: {"status": "unknown", "items": [], "pages": 0} for key in SURFACES}
    catalog = {"format": CATALOG_VERSION, "captured_at": datetime.now(timezone.utc).isoformat(),
               "protocol_version": None, "server": {}, "surfaces": surfaces, "findings": []}
    try:
        result, response_headers = rpc("initialize", {"protocolVersion": protocol_version, "capabilities": {},
            "clientInfo": {"name": "agentaction", "version": __version__}})
        negotiated = result.get("protocolVersion")
        if negotiated not in {"2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"}:
            raise ValueError("unsupported negotiated protocol")
        capabilities = result.get("capabilities")
        if not isinstance(capabilities, dict) or not isinstance(result.get("serverInfo"), dict):
            raise ValueError("missing initialization metadata")
        if any(key in capabilities and not isinstance(capabilities[key], dict) for key in ("tools", "resources")):
            raise ValueError("malformed discovery capabilities")
        catalog["protocol_version"] = negotiated
        catalog["server"] = {key: result["serverInfo"][key] for key in ("name", "version")
                             if isinstance(result["serverInfo"].get(key), str)}
        operation_headers["MCP-Protocol-Version"] = negotiated
        session = next((v for k, v in response_headers.items() if k.lower() == "mcp-session-id"), None)
        if session:
            operation_headers["Mcp-Session-Id"] = session
        rpc("notifications/initialized", notification=True)
    except Exception:
        # Exception bodies and URLs can contain credentials or provider data.
        catalog["findings"].append("Initialization failed, exceeded limits, or negotiated an unsupported protocol; surfaces remain unknown.")
    else:
        captured_bytes = 0
        for key, (capability, method, identity) in SURFACES.items():
            surface = surfaces[key]
            if capability not in capabilities:
                surface["status"] = "not_advertised"
                continue
            surface["status"] = "incomplete"
            cursor, seen, identities = None, set(), set()
            try:
                for _ in range(max_pages):
                    result, _ = rpc(method, {"cursor": cursor} if cursor is not None else {})
                    items = result.get(key)
                    if not isinstance(items, list):
                        raise ValueError("missing result list")
                    if any(not isinstance(item, dict) or not isinstance(item.get(identity), str)
                           or not item[identity] for item in items):
                        raise ValueError("malformed catalog item")
                    surface["pages"] += 1
                    for item in items:
                        captured_bytes += len(json.dumps(item).encode())
                        if item[identity] in identities or len(surface["items"]) >= max_items or captured_bytes > MAX_CATALOG_BYTES:
                            raise ValueError("duplicate identity or item limit reached")
                        identities.add(item[identity])
                        surface["items"].append(item)
                    cursor = result.get("nextCursor")
                    if cursor is None:
                        surface["status"] = "complete"
                        break
                    if not isinstance(cursor, str) or not cursor or cursor in seen:
                        raise ValueError("invalid or repeated cursor")
                    seen.add(cursor)
            except Exception:
                pass
            if surface["status"] != "complete":
                catalog["findings"].append(f"{key}: discovery incomplete (failed/malformed page, repeated cursor/identity, or configured limit).")
    catalog["catalog_hash"] = catalog_hash(surfaces)
    return catalog


def normalize_catalog(payload):
    """Accept captures or legacy tools/list without inventing server completeness."""
    if isinstance(payload, dict) and payload.get("format") == CATALOG_VERSION:
        if not isinstance(payload.get("findings", []), list) or any(not isinstance(item, str) for item in payload.get("findings", [])):
            raise ValueError("catalog findings must be a string array")
        if not isinstance(payload.get("server", {}), dict):
            raise ValueError("catalog server metadata must be an object")
        surfaces = payload.get("surfaces")
        if not isinstance(surfaces, dict) or set(surfaces) != set(SURFACES):
            raise ValueError("catalog must include tools, resources and resourceTemplates surfaces")
        for key, (_, _, identity) in SURFACES.items():
            surface = surfaces[key]
            if (not isinstance(surface, dict) or surface.get("status") not in
                    {"complete", "incomplete", "unknown", "not_advertised"} or not isinstance(surface.get("items"), list)):
                raise ValueError(f"invalid catalog surface: {key}")
            seen = set()
            for item in surface["items"]:
                if not isinstance(item, dict) or not isinstance(item.get(identity), str) or not item[identity] or item[identity] in seen:
                    raise ValueError(f"invalid or duplicate catalog identity: {key}")
                seen.add(item[identity])
            if surface["status"] == "not_advertised" and surface["items"]:
                raise ValueError(f"unadvertised surface contains items: {key}")
        return {**payload, "catalog_hash": catalog_hash(surfaces)}
    if isinstance(payload, dict) and "format" in payload:
        raise ValueError("unsupported catalog format")
    from agentid.mcp import tools_from_payload

    tools = tools_from_payload(payload)
    surfaces = {key: {"status": "unknown", "items": [], "pages": 0} for key in SURFACES}
    result = payload.get("result", payload) if isinstance(payload, dict) else {}
    surfaces["tools"] = {"status": "incomplete" if result.get("nextCursor") is not None else "unknown", "items": tools, "pages": 1}
    return normalize_catalog({"format": CATALOG_VERSION, "captured_at": None, "protocol_version": None, "server": {},
        "surfaces": surfaces, "findings": ["Imported tools/list only; full server discovery and account permissions are unknown."]})
