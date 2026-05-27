import json

from agentid.cli import main
from agentid.mcp import analyze_tools, diff_tools, tools_from_payload


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
