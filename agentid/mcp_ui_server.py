from __future__ import annotations

import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

from agentid.mcp import analysis_to_dict, analyze_tools, fetch_tools_list, tools_from_payload
from agentid.mcp_ui import MCP_UI_HTML


def serve_mcp_ui(host: str = "127.0.0.1", port: int = 8799) -> None:
    httpd = create_mcp_ui_server(host, port)
    print(f"AgentID MCP analyzer UI listening on http://{host}:{port}")
    httpd.serve_forever()


def create_mcp_ui_server(host: str = "127.0.0.1", port: int = 8799) -> ThreadingHTTPServer:
    class Handler(BaseHTTPRequestHandler):
        server_version = "AgentIDMcpAnalyzer/0.1"

        def do_GET(self) -> None:
            parsed = urlparse(self.path)
            if parsed.path in {"/", "/index.html"}:
                self._html(MCP_UI_HTML)
                return
            self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)

        def do_POST(self) -> None:
            parsed = urlparse(self.path)
            if parsed.path != "/api/fetch-tools":
                self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)
                return
            try:
                payload = self._read_json()
                url = str(payload.get("url", "")).strip()
                if not url:
                    raise ValueError("url is required")
                headers = payload.get("headers", {})
                if not isinstance(headers, dict):
                    raise ValueError("headers must be an object")
                timeout = float(payload.get("timeout", 20))
                protocol_version = str(payload.get("protocol_version", "2025-11-25"))
                initialize = bool(payload.get("initialize", True))
                self._json(fetch_tools_response(url, headers, timeout, protocol_version, initialize))
            except Exception as exc:
                self._json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)

        def do_OPTIONS(self) -> None:
            self.send_response(HTTPStatus.NO_CONTENT)
            self._cors()
            self.end_headers()

        def log_message(self, fmt: str, *args: Any) -> None:
            print("%s - %s" % (self.address_string(), fmt % args))

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

        def _html(self, payload: str, status: HTTPStatus = HTTPStatus.OK) -> None:
            body = payload.encode("utf-8")
            self.send_response(status)
            self.send_header("content-type", "text/html; charset=utf-8")
            self.send_header("content-length", str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)

        def _json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
            body = json.dumps(payload, indent=2).encode("utf-8")
            self.send_response(status)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)

        def _cors(self) -> None:
            self.send_header("access-control-allow-origin", f"http://{host}:{port}")
            self.send_header("access-control-allow-methods", "GET, POST, OPTIONS")
            self.send_header("access-control-allow-headers", "content-type")

    return ThreadingHTTPServer((host, port), Handler)


def fetch_tools_response(
    url: str,
    headers: dict[str, Any],
    timeout: float = 20,
    protocol_version: str = "2025-11-25",
    initialize: bool = True,
) -> dict[str, Any]:
    fetch_result = fetch_tools_list(
        url,
        headers={str(key): str(value) for key, value in headers.items()},
        timeout=timeout,
        protocol_version=protocol_version,
        initialize=initialize,
    )
    tools = tools_from_payload(fetch_result.payload)
    return {
        "tools_list": fetch_result.payload,
        "analysis": analysis_to_dict(analyze_tools(tools)),
        "protocol_version": fetch_result.protocol_version,
        "session_id": fetch_result.session_id,
    }
