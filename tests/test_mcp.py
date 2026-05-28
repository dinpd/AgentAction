import json

from agentid.cli import main
from agentid.mcp import FetchResult
from agentid.mcp import analyze_tools, check_tools, diff_tools, fetch_tools_list, parse_json_or_sse, tools_from_payload
from agentid.mcp_ui import write_mcp_ui
from agentid.mcp_ui_server import fetch_tools_response


def test_tools_from_json_rpc_response():
    tools = tools_from_payload(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "tools": [
                    {
                        "name": "crm.search_customer",
                        "description": "Search customer records",
                        "inputSchema": {"type": "object", "properties": {"customer_id": {"type": "string"}}},
                    }
                ]
            },
        }
    )

    assert tools[0]["name"] == "crm.search_customer"


def test_analyze_tools_flags_blast_radius():
    analysis = analyze_tools(
        [
            {
                "name": "crm.search_customer",
                "description": "Search customer records",
                "inputSchema": {"type": "object", "properties": {"customer_id": {"type": "string"}}},
            },
            {
                "name": "shell.execute_command",
                "description": "Execute a shell command on the host",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "command": {"type": "string"},
                        "working_directory": {"type": "string"},
                    },
                },
            },
        ]
    )

    shell = next(tool for tool in analysis.tools if tool.name == "shell.execute_command")

    assert analysis.risk_label == "critical"
    assert "shell.execute_command" in analysis.highest_risk_tools
    assert "crm.search_customer" not in analysis.highest_risk_tools
    assert shell.action == "execute"
    assert shell.risk_label == "critical"
    assert "command" in shell.sensitive_arguments
    assert "require approval or just-in-time authority before execution" in shell.remediation


def test_diff_tools_detects_new_high_risk_tool_and_schema_change():
    before = [
        {
            "name": "crm.search_customer",
            "description": "Search customer records",
            "inputSchema": {"type": "object", "properties": {"customer_id": {"type": "string"}}},
        }
    ]
    after = [
        {
            "name": "crm.search_customer",
            "description": "Search customer records by SQL query",
            "inputSchema": {"type": "object", "properties": {"sql": {"type": "string"}}},
        },
        {
            "name": "admin.delete_customer",
            "description": "Delete customer records",
            "inputSchema": {"type": "object", "properties": {"customer_id": {"type": "string"}}},
        },
    ]

    diff = diff_tools(before, after)

    assert diff.added_tools == ["admin.delete_customer"]
    assert diff.changed_tools == ["crm.search_customer"]
    assert "new high-risk tool: admin.delete_customer (critical)" in diff.findings
    assert "tool risk increased: crm.search_customer (low -> high)" in diff.findings


def test_cli_mcp_analyze_json(tmp_path, capsys):
    tools_path = tmp_path / "tools.json"
    tools_path.write_text(
        json.dumps(
            {
                "tools": [
                    {
                        "name": "email.send_message",
                        "description": "Send an email",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "recipient": {"type": "string"},
                                "body": {"type": "string"},
                            },
                        },
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    code = main(["mcp", "analyze", str(tools_path), "--json"])
    output = json.loads(capsys.readouterr().out)

    assert code == 0
    assert output["tool_count"] == 1
    assert output["tools"][0]["name"] == "email.send_message"
    assert output["tools"][0]["risk_label"] in {"high", "critical"}


def test_cli_mcp_diff(tmp_path, capsys):
    before_path = tmp_path / "before.json"
    after_path = tmp_path / "after.json"
    before_path.write_text(json.dumps({"tools": [{"name": "docs.search", "inputSchema": {"properties": {}}}]}), encoding="utf-8")
    after_path.write_text(
        json.dumps({"tools": [{"name": "docs.search", "inputSchema": {"properties": {}}}, {"name": "deploy.run", "inputSchema": {"properties": {"command": {"type": "string"}}}}]}),
        encoding="utf-8",
    )

    code = main(["mcp", "diff", str(before_path), str(after_path)])
    output = capsys.readouterr().out

    assert code == 0
    assert "Added tools: 1" in output
    assert "- deploy.run" in output
    assert "new high-risk tool: deploy.run" in output


def test_mcp_ui_writer_creates_browser_analyzer(tmp_path):
    output = write_mcp_ui(tmp_path / "mcp-analyzer.html")
    html = output.read_text(encoding="utf-8")

    assert "AgentID MCP Analyzer" in html
    assert "Analysis runs in this browser tab" in html
    assert "Compare Drift" in html
    assert "Copy Markdown" in html
    assert "Copy Manifest" in html
    assert "manifestSnippet" in html
    assert "markdownReport" in html


def test_cli_mcp_ui(tmp_path, capsys):
    output = tmp_path / "ui.html"

    code = main(["mcp", "ui", "--output", str(output)])

    assert code == 0
    assert "Wrote MCP analyzer UI" in capsys.readouterr().out
    assert "AgentID MCP Analyzer" in output.read_text(encoding="utf-8")


def test_fetch_tools_list_initializes_and_lists_tools():
    calls = []

    def fake_post(url, payload, headers, timeout):
        calls.append((url, payload, headers, timeout))
        if payload["method"] == "initialize":
            return (
                {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "result": {
                        "protocolVersion": "2025-11-25",
                        "capabilities": {"tools": {"listChanged": True}},
                        "serverInfo": {"name": "test", "version": "1"},
                    },
                },
                {"mcp-session-id": "session-1"},
            )
        if payload["method"] == "notifications/initialized":
            return None, {}
        return (
            {
                "jsonrpc": "2.0",
                "id": 2,
                "result": {
                    "tools": [
                        {
                            "name": "docs.search",
                            "description": "Search docs",
                            "inputSchema": {"properties": {"query": {"type": "string"}}},
                        }
                    ]
                },
            },
            {},
        )

    result = fetch_tools_list("https://mcp.example.com/mcp", headers={"Authorization": "Bearer token"}, post_json=fake_post)

    assert result.protocol_version == "2025-11-25"
    assert result.session_id == "session-1"
    assert result.payload["result"]["tools"][0]["name"] == "docs.search"
    assert [call[1]["method"] for call in calls] == ["initialize", "notifications/initialized", "tools/list"]
    assert calls[1][2]["Mcp-Session-Id"] == "session-1"
    assert calls[2][2]["MCP-Protocol-Version"] == "2025-11-25"
    assert calls[0][2]["Authorization"] == "Bearer token"


def test_fetch_tools_list_can_skip_initialize():
    calls = []

    def fake_post(url, payload, headers, timeout):
        calls.append(payload["method"])
        return {"jsonrpc": "2.0", "id": 2, "result": {"tools": []}}, {}

    result = fetch_tools_list("https://mcp.example.com/mcp", initialize=False, post_json=fake_post)

    assert result.payload["result"]["tools"] == []
    assert calls == ["tools/list"]


def test_parse_json_or_sse():
    payload = parse_json_or_sse('event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"tools":[]}}\n\n')

    assert payload["result"]["tools"] == []


def test_cli_mcp_fetch_writes_output(tmp_path, monkeypatch, capsys):
    output = tmp_path / "tools.json"

    def fake_fetch_tools_list(url, headers=None, timeout=20, protocol_version="2025-11-25", initialize=True):
        assert url == "https://mcp.example.com/mcp"
        assert headers == {"Authorization": "Bearer token"}
        assert initialize is True

        class Result:
            payload = {"jsonrpc": "2.0", "id": 2, "result": {"tools": []}}

        return Result()

    monkeypatch.setattr("agentid.cli.fetch_tools_list", fake_fetch_tools_list)

    code = main(
        [
            "mcp",
            "fetch",
            "https://mcp.example.com/mcp",
            "--header",
            "Authorization: Bearer token",
            "--output",
            str(output),
        ]
    )

    assert code == 0
    assert "Wrote MCP tools/list" in capsys.readouterr().out
    assert json.loads(output.read_text(encoding="utf-8"))["result"]["tools"] == []


def test_check_tools_fails_when_risk_exceeds_threshold():
    check = check_tools(
        [
            {
                "name": "shell.execute_command",
                "description": "Execute a shell command",
                "inputSchema": {"properties": {"command": {"type": "string"}}},
            }
        ],
        max_risk="high",
    )

    assert not check.ok
    assert "MCP risk critical exceeds max risk high" in check.findings


def test_check_tools_passes_at_threshold():
    check = check_tools(
        [{"name": "docs.search", "description": "Search docs", "inputSchema": {"properties": {"query": {"type": "string"}}}}],
        max_risk="medium",
    )

    assert check.ok


def test_cli_mcp_check_returns_nonzero_for_failure(tmp_path, capsys):
    tools_path = tmp_path / "tools.json"
    tools_path.write_text(
        json.dumps(
            {
                "tools": [
                    {
                        "name": "shell.execute_command",
                        "description": "Execute a shell command",
                        "inputSchema": {"properties": {"command": {"type": "string"}}},
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    code = main(["mcp", "check", str(tools_path), "--max-risk", "high"])
    output = capsys.readouterr().out

    assert code == 1
    assert "MCP check failed" in output


def test_cli_mcp_check_can_fail_on_drift(tmp_path, capsys):
    before_path = tmp_path / "before.json"
    after_path = tmp_path / "after.json"
    before_path.write_text(json.dumps({"tools": [{"name": "docs.search", "inputSchema": {"properties": {}}}]}), encoding="utf-8")
    after_path.write_text(json.dumps({"tools": [{"name": "docs.search", "inputSchema": {"properties": {}}}, {"name": "admin.delete_customer", "inputSchema": {"properties": {}}}]}), encoding="utf-8")

    code = main(["mcp", "check", str(after_path), "--max-risk", "critical", "--before", str(before_path), "--fail-on-drift"])
    output = capsys.readouterr().out

    assert code == 1
    assert "new tools exposed" in output


def test_mcp_ui_server_fetch_response(monkeypatch):
    def fake_fetch_tools_list(url, headers=None, timeout=20, protocol_version="2025-11-25", initialize=True):
        assert url == "https://mcp.example.com/mcp"
        assert headers == {"Authorization": "Bearer token"}
        return FetchResult(
            payload={
                "jsonrpc": "2.0",
                "id": 2,
                "result": {
                    "tools": [
                        {
                            "name": "email.send_message",
                            "description": "Send an email",
                            "inputSchema": {"properties": {"recipient": {"type": "string"}}},
                        }
                    ]
                },
            },
            protocol_version="2025-11-25",
            session_id="session-1",
        )

    monkeypatch.setattr("agentid.mcp_ui_server.fetch_tools_list", fake_fetch_tools_list)

    payload = fetch_tools_response("https://mcp.example.com/mcp", {"Authorization": "Bearer token"})

    assert payload["tools_list"]["result"]["tools"][0]["name"] == "email.send_message"
    assert payload["analysis"]["tool_count"] == 1
    assert payload["session_id"] == "session-1"
