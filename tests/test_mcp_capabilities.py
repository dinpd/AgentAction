import copy
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from agentid.cli import main
from agentid.mcp_catalog import CATALOG_VERSION, SURFACES, discover_catalog, normalize_catalog
from agentid.mcp_capabilities import capability_report, format_capabilities
from agentid.mcp_workflows import PROFILE_VERSION, evaluate_workflow


@pytest.mark.parametrize("case", json.loads((Path(__file__).parents[1] / "fixtures/mcp-capability-coverage-v1/cases.json").read_text()), ids=lambda case: case["name"])
def test_shared_console_workflow_coverage(case):
    catalog = {"format": CATALOG_VERSION, "surfaces": {
        key: {"status": "complete", "items": [], "pages": 1} for key in SURFACES}}
    catalog["surfaces"]["tools"].update(items=case["tools"], status="complete" if case["complete"] else "incomplete")
    report = evaluate_workflow(catalog, case["profile"])
    assert report["status"] == case["expected"]["status"]
    if "steps" in case["expected"]:
        assert [step["status"] for step in report["steps"]] == case["expected"]["steps"]
    if "code" in case["expected"]:
        assert any(f["code"] == case["expected"]["code"] for step in report["steps"] for f in step["findings"])
    assert not report["behavior_verified"]
    assert report["account_access"] == "unknown"


def obj(properties, required=None, closed=True):
    return {"type": "object", "properties": properties,
            "required": list(properties) if required is None else required, "additionalProperties": not closed}


def tool(name, inputs, outputs=None):
    result = {"name": name, "description": "Search fixture records, returning only supported fields.", "inputSchema": inputs}
    if outputs is not None:
        result["outputSchema"] = outputs
    return result


@pytest.fixture
def catalog():
    surfaces = {key: {"status": "complete", "items": [], "pages": 1} for key in SURFACES}
    surfaces["tools"]["items"] = [
        tool("tickets.search", obj({"query": {"type": "string"}}),
             obj({"tickets": {"type": "array", "items": obj({"id": {"type": "string"}, "title": {"type": "string"}})}})),
        tool("tickets.update", obj({"ticket_id": {"type": "string"}, "status": {"type": "string", "enum": ["open", "closed"]}})),
    ]
    return {"format": CATALOG_VERSION, "surfaces": surfaces}


@pytest.fixture
def profile():
    return {"format": PROFILE_VERSION, "name": "Find and close a ticket", "steps": [
        {"id": "find", "tool": "tickets.search", "arguments": {"query": "broken widget"},
         "required_outputs": ["/tickets/*/title"]},
        {"id": "close", "tool": "tickets.update", "arguments": {"status": "closed"},
         "bindings": [{"input": "/ticket_id", "from_step": "find", "output": "/tickets/*/id"}]},
    ]}


def fake_server(fail=None):
    calls = []

    def post(url, payload, headers, timeout):
        calls.append((payload, headers))
        method = payload["method"]
        assert method in {"initialize", "notifications/initialized", *(s[1] for s in SURFACES.values())}
        if method == "notifications/initialized":
            return None, {}
        if method == "initialize":
            result = {"protocolVersion": "2025-11-25", "serverInfo": {"name": "fixture", "version": "1"},
                      "capabilities": {"tools": {}, "resources": {}}}
        else:
            surface, identity = next((k, v[2]) for k, v in SURFACES.items() if v[1] == method)
            page = 2 if payload["params"].get("cursor") else 1
            if fail:
                custom = fail(method, page)
                if custom is not None:
                    return {"jsonrpc": "2.0", "id": payload["id"], "result": custom}, {}
            result = {surface: [{identity: f"{surface}-{page}"}]}
            if page == 1:
                result["nextCursor"] = "next"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": result}, {"Mcp-Session-Id": "private-session"}

    return post, calls


def test_discovery_follows_every_surface_and_preserves_protocol_without_secrets():
    post, calls = fake_server()
    capture = discover_catalog("https://example.test/?secret=not-for-reports", {"Authorization": "Bearer private-token"}, post_json=post)
    assert all(s["status"] == "complete" and len(s["items"]) == 2 and s["pages"] == 2 for s in capture["surfaces"].values())
    assert capture["server"] == {"name": "fixture", "version": "1"}
    assert capture["protocol_version"] == "2025-11-25"
    assert len(calls) == 8
    assert calls[2][1]["MCP-Protocol-Version"] == "2025-11-25"
    assert calls[2][1]["Mcp-Session-Id"] == "private-session"
    assert "private-session" not in json.dumps(capture)
    assert "private-token" not in json.dumps(capture)
    assert "not-for-reports" not in json.dumps(capture)


@pytest.mark.parametrize("failure", ["repeated_cursor", "bad_page", "duplicate", "error"])
def test_discovery_partial_failure_preserves_entries_and_other_surfaces(failure):
    def fail(method, page):
        if method == "tools/list" and page == 2:
            if failure == "error":
                raise ValueError("private-token must not be in diagnostics")
            return {"repeated_cursor": {"tools": [{"name": "second"}], "nextCursor": "next"},
                    "bad_page": {"tools": None}, "duplicate": {"tools": [{"name": "tools-1"}]}}[failure]
    post, _ = fake_server(fail)
    capture = discover_catalog("https://example.test", post_json=post)
    assert capture["surfaces"]["tools"]["status"] == "incomplete"
    assert capture["surfaces"]["tools"]["items"][0]["name"] == "tools-1"
    assert capture["surfaces"]["resources"]["status"] == "complete"
    assert "private-token" not in json.dumps(capture)


@pytest.mark.parametrize("kwargs", [{"max_pages": 1}, {"max_items": 1}])
def test_discovery_limits_are_not_complete(kwargs):
    post, _ = fake_server()
    capture = discover_catalog("https://example.test", post_json=post, **kwargs)
    assert all(s["status"] == "incomplete" for s in capture["surfaces"].values())


def test_initialization_failure_stays_unknown():
    def fail(*args):
        raise ValueError("secret")
    capture = discover_catalog("https://example.test", post_json=fail)
    assert all(s["status"] == "unknown" for s in capture["surfaces"].values())
    assert "secret" not in json.dumps(capture)


def test_unsupported_negotiated_version_and_wrong_response_id_stay_unknown():
    for response_id, result in (
        (1, {"protocolVersion": "2099-01-01", "capabilities": {}, "serverInfo": {}}),
        (99, {"protocolVersion": "2025-11-25", "capabilities": {}, "serverInfo": {}}),
        (1, {"protocolVersion": "2025-11-25", "capabilities": {"tools": None}, "serverInfo": {}}),
    ):
        capture = discover_catalog("https://example.test", post_json=lambda *args: ({"jsonrpc": "2.0", "id": response_id, "result": result}, {}))
        assert all(s["status"] == "unknown" for s in capture["surfaces"].values())


def test_unadvertised_surfaces_are_not_equated_with_no_product_access():
    post, _ = fake_server()
    def wrapped(url, payload, headers, timeout):
        result, response_headers = post(url, payload, headers, timeout)
        if payload["method"] == "initialize":
            result["result"]["capabilities"] = {}
        return result, response_headers
    capture = discover_catalog("https://example.test", post_json=wrapped)
    assert all(s["status"] == "not_advertised" for s in capture["surfaces"].values())
    assert capability_report(capture)["account_access"] == "unknown"


def test_legacy_catalog_never_claims_full_discovery(catalog):
    payload = {"tools": catalog["surfaces"]["tools"]["items"]}
    assert normalize_catalog(payload)["surfaces"]["tools"]["status"] == "unknown"
    payload["nextCursor"] = "next"
    assert normalize_catalog(payload)["surfaces"]["tools"]["status"] == "incomplete"


def test_inventory_keeps_evidence_and_restrictions_separate(catalog):
    report = capability_report(catalog)
    assert not report["behavior_verified"]
    search = report["entries"][0]
    assert search["operations"] == {"values": ["search"], "evidence": "inferred"}
    assert search["declared_restrictions"]
    assert search["output_schema"]["properties"]["tickets"]["type"] == "array"
    assert "result_completeness_unverified" in {f["code"] for f in search["findings"]}
    assert "missing_schema" in {f["code"] for f in report["entries"][1]["findings"]}


def test_hash_ignores_capture_time_and_order_but_tracks_output_schema(catalog):
    before = capability_report(catalog)["catalog_hash"]
    catalog["captured_at"] = "later"
    catalog["surfaces"]["tools"]["items"].reverse()
    assert capability_report(catalog)["catalog_hash"] == before
    catalog["surfaces"]["tools"]["items"][0]["outputSchema"] = {"type": "string"}
    assert capability_report(catalog)["catalog_hash"] != before


def test_workflow_declared_coverage_is_not_verified(catalog, profile):
    report = evaluate_workflow(catalog, profile)
    assert report["status"] == "declared_coverage"
    assert all(s["status"] == "covered" for s in report["steps"])
    assert not report["behavior_verified"]
    assert report["account_access"] == "unknown"


def test_closed_schema_missing_identifier_blocks_even_with_both_tools(catalog, profile):
    item = catalog["surfaces"]["tools"]["items"][0]["outputSchema"]["properties"]["tickets"]["items"]
    del item["properties"]["id"]
    item["required"].remove("id")
    report = evaluate_workflow(catalog, profile)
    assert report["status"] == "blocked"
    assert any(f["code"] == "binding_field_missing" for f in report["steps"][1]["findings"])


@pytest.mark.parametrize("mode", ["missing_schema", "open_schema", "optional", "reference", "composition", "dialect"])
def test_uncertain_output_is_unknown_never_absent(catalog, profile, mode):
    search = catalog["surfaces"]["tools"]["items"][0]
    if mode == "missing_schema":
        search.pop("outputSchema")
    elif mode == "reference":
        search["outputSchema"] = {"$ref": "https://never-fetch.invalid/schema"}
    elif mode == "composition":
        search["outputSchema"] = {"allOf": [search["outputSchema"]]}
    elif mode == "dialect":
        search["outputSchema"]["$schema"] = "http://json-schema.org/draft-07/schema#"
    else:
        item = search["outputSchema"]["properties"]["tickets"]["items"]
        item["required"].remove("id")
        if mode == "open_schema":
            del item["properties"]["id"]
            item["additionalProperties"] = True
    report = evaluate_workflow(catalog, profile)
    assert report["status"] == "unknown"
    assert not any(f["code"] == "binding_field_missing" for s in report["steps"] for f in s["findings"])


def test_mapped_absence_depends_on_discovery_completeness(catalog, profile):
    catalog["surfaces"]["tools"]["items"].pop()
    assert evaluate_workflow(catalog, profile)["steps"][1]["status"] == "not_exposed"
    catalog["surfaces"]["tools"]["status"] = "incomplete"
    assert evaluate_workflow(catalog, profile)["steps"][1]["status"] == "unknown"


def test_unmapped_step_remains_unknown_even_for_complete_catalog(catalog, profile):
    del profile["steps"][1]["tool"]
    assert evaluate_workflow(catalog, profile)["steps"][1]["status"] == "unknown"


@pytest.mark.parametrize("mode", ["wrong_type", "missing_argument", "invalid_enum"])
def test_workflow_detects_argument_and_binding_blockers(catalog, profile, mode):
    if mode == "wrong_type":
        catalog["surfaces"]["tools"]["items"][1]["inputSchema"]["properties"]["ticket_id"] = {"type": "integer"}
    elif mode == "missing_argument":
        profile["steps"][1]["arguments"] = {}
    else:
        profile["steps"][1]["arguments"]["status"] = "unsupported"
    assert evaluate_workflow(catalog, profile)["status"] == "blocked"


@pytest.mark.parametrize("mode", ["duplicate_step", "forward_reference", "duplicate_source", "bad_version", "unknown_key", "nested_input"])
def test_invalid_profiles_fail_actionably(catalog, profile, mode):
    if mode == "duplicate_step":
        profile["steps"][1]["id"] = "find"
    elif mode == "forward_reference":
        profile["steps"][1]["bindings"][0]["from_step"] = "close"
    elif mode == "duplicate_source":
        profile["steps"][1]["arguments"]["ticket_id"] = "secret-not-echoed"
    elif mode == "bad_version":
        profile["format"] = "v99"
    elif mode == "nested_input":
        profile["steps"][1]["bindings"][0]["input"] = "/ticket/id"
    else:
        profile["extra"] = "secret-not-echoed"
    with pytest.raises(ValueError) as exc:
        evaluate_workflow(catalog, profile)
    assert "secret-not-echoed" not in str(exc.value)


def test_cli_reports_json_text_and_opt_in_gate(tmp_path, capsys, catalog, profile):
    capture_path, profile_path = tmp_path / "catalog.json", tmp_path / "profile.json"
    capture_path.write_text(json.dumps(catalog))
    profile_path.write_text(json.dumps(profile))
    args = ["mcp", "capabilities", str(capture_path), "--workflow", str(profile_path)]
    assert main([*args, "--json", "--require-covered"]) == 0
    report = json.loads(capsys.readouterr().out)
    assert report["workflow"]["status"] == "declared_coverage"
    profile["steps"][1]["arguments"] = {}
    profile_path.write_text(json.dumps(profile))
    assert main(args) == 0
    assert "Workflow Find and close a ticket: blocked" in capsys.readouterr().out
    assert main([*args, "--require-covered"]) == 1
    capsys.readouterr()
    assert main(["mcp", "capabilities", str(capture_path), "--require-covered"]) == 2
    assert "requires --workflow" in capsys.readouterr().err


def test_cli_catalog_writes_partial_capture(tmp_path, capsys, monkeypatch):
    post, _ = fake_server()
    monkeypatch.setattr("agentid.mcp_catalog.discovery_post", post)
    target = tmp_path / "capture.json"
    assert main(["mcp", "catalog", "https://example.test", "--max-pages", "1", "--output", str(target)]) == 1
    assert json.loads(target.read_text())["surfaces"]["tools"]["status"] == "incomplete"
    assert "Wrote MCP catalog" in capsys.readouterr().out


def test_terminal_controls_are_escaped(catalog):
    catalog["surfaces"]["tools"]["items"][0]["description"] = "provider\x1b[2J\rmalicious text"
    text = format_capabilities(capability_report(catalog))
    assert "\x1b" not in text and "\r" not in text


def test_empty_closed_inputs_are_not_opaque():
    report = capability_report({"tools": [tool("clock", obj({}), obj({"time": {"type": "string"}}))]})
    assert "opaque_schema" not in {f["code"] for f in report["entries"][0]["findings"]}


def test_invalid_and_duplicate_catalogs_are_rejected(catalog):
    catalog["surfaces"]["tools"]["items"].append(copy.deepcopy(catalog["surfaces"]["tools"]["items"][0]))
    with pytest.raises(ValueError, match="duplicate"):
        capability_report(catalog)


def test_discovery_transport_roundtrip_and_redirect_refusal():
    post, calls = fake_server()
    paths = []

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *args):
            pass

        def do_POST(self):
            paths.append(self.path)
            if self.path == "/redirect":
                self.send_response(307)
                self.send_header("Location", "/sink")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            result, headers = post("fixture", payload, dict(self.headers), 10)
            body = json.dumps(result).encode() if result is not None else b""
            sse = self.path == "/sse" and result is not None
            if sse:
                body = b': keepalive\r\n\r\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\r\n\r\ndata: ' + body + b"\r\n\r\n"
            self.send_response(200 if body else 202)
            if not sse:
                self.send_header("Content-Length", str(len(body)))
            self.send_header("Content-Type", "text/event-stream" if sse else "application/json")
            for name, value in headers.items():
                self.send_header(name, value)
            self.end_headers()
            self.wfile.write(body)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        url = f"http://127.0.0.1:{server.server_port}"
        report = discover_catalog(url)
        assert all(s["status"] == "complete" for s in report["surfaces"].values())
        assert len(calls) == 8
        report = discover_catalog(url + "/sse", timeout=3)
        assert all(s["status"] == "complete" for s in report["surfaces"].values())
        report = discover_catalog(url + "/redirect", headers={"Authorization": "Bearer fixture"})
        assert report["surfaces"]["tools"]["status"] == "unknown"
        assert "/sink" not in paths
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def test_catalog_total_byte_limit_preserves_unknown_remainder(monkeypatch):
    monkeypatch.setattr("agentid.mcp_catalog.MAX_CATALOG_BYTES", 10)
    post, _ = fake_server()
    report = discover_catalog("https://example.test", post_json=post)
    assert all(s["status"] == "incomplete" for s in report["surfaces"].values())


def test_untrusted_regex_is_not_executed(catalog, profile):
    catalog["surfaces"]["tools"]["items"][1]["inputSchema"]["properties"]["status"]["pattern"] = "(a+)+$"
    profile["steps"][1]["arguments"]["status"] = "a" * 100 + "!"
    assert evaluate_workflow(catalog, profile)["status"] == "unknown"


def test_generic_tool_can_be_explicitly_mapped(catalog):
    catalog["surfaces"]["tools"]["items"] = [tool("request", obj({"method": {"const": "GET", "type": "string"}, "path": {"type": "string"}}))]
    profile = {"format": PROFILE_VERSION, "name": "Explicit API route", "steps": [
        {"id": "read", "tool": "request", "arguments": {"method": "GET", "path": "/tickets"}},
    ]}
    assert evaluate_workflow(catalog, profile)["status"] == "declared_coverage"


def test_nested_argument_constraints_and_escaped_output_paths(catalog, profile):
    catalog["surfaces"]["tools"]["items"][0]["outputSchema"] = obj({"ticket/id": {"type": "string"}})
    profile["steps"][0]["required_outputs"] = ["/ticket~1id"]
    profile["steps"][1]["bindings"][0]["output"] = "/ticket~1id"
    assert evaluate_workflow(catalog, profile)["status"] == "declared_coverage"
    catalog["surfaces"]["tools"]["items"][1]["inputSchema"]["properties"]["status"] = obj({"value": {"enum": ["closed"]}})
    profile["steps"][1]["arguments"]["status"] = {"value": "invalid"}
    assert evaluate_workflow(catalog, profile)["status"] == "blocked"


@pytest.mark.parametrize("name,status", [("close-ticket.json", "declared_coverage"), ("assign-ticket.json", "blocked")])
def test_documented_examples_match_outcomes(name, status):
    root = Path(__file__).resolve().parents[1] / "examples" / "mcp-capabilities"
    catalog = json.loads((root / "ticket-catalog.json").read_text())
    profile = json.loads((root / name).read_text())
    assert evaluate_workflow(catalog, profile)["status"] == status


def test_number_to_integer_binding_is_unknown_not_impossible(catalog, profile):
    catalog["surfaces"]["tools"]["items"][0]["outputSchema"]["properties"]["tickets"]["items"]["properties"]["id"] = {"type": "number"}
    catalog["surfaces"]["tools"]["items"][1]["inputSchema"]["properties"]["ticket_id"] = {"type": "integer"}
    assert evaluate_workflow(catalog, profile)["status"] == "unknown"
