from pathlib import Path

import yaml

from agentid.cli import main
from agentid.manifest import validate_manifest
from agentid.provider import (
    diff_provider_contracts,
    import_provider_contract,
    load_provider_contract,
    provider_contract_from_openapi,
    validate_provider_contract,
)


def test_provider_contract_example_is_valid():
    contract = load_provider_contract(Path(__file__).resolve().parent.parent / "examples" / "provider-mcp-contract.yaml")

    result = validate_provider_contract(contract)

    assert result.ok
    assert result.errors == []


def test_provider_contract_requires_receipts_for_high_blast_radius_tools():
    contract = {
        "provider_agentid": {
            "provider": "example",
            "mcp_server": "example-mcp",
            "tools": {
                "provider.crm.update_customer": {
                    "action": "write",
                    "risk": "high",
                    "resource_template": "provider/customer/{customer_id}",
                    "data_from": "enterprise_crm",
                    "data_to": "provider_crm",
                    "requires_jit": False,
                    "approval": "none",
                }
            },
        }
    }

    result = validate_provider_contract(contract)

    assert not result.ok
    assert "provider_agentid.tools.provider.crm.update_customer.receipt_required must be true for high-blast-radius tools." in result.errors
    assert "provider_agentid.tools.provider.crm.update_customer.requires_jit must be true for high-blast-radius tools." in result.errors
    assert "provider_agentid.tools.provider.crm.update_customer.approval must require explicit approval for high-blast-radius tools." in result.errors
    assert "provider_agentid.tools.provider.crm.update_customer.authorization_requirements is required for high-blast-radius tools." in result.errors


def test_cli_provider_validate(tmp_path, capsys):
    contract_path = tmp_path / "provider-contract.yaml"
    contract_path.write_text(
        yaml.safe_dump(
            {
                "provider_agentid": {
                    "provider": "example",
                    "mcp_server": "example-mcp",
                    "tools": {
                        "provider.docs.search": {
                            "action": "read",
                            "risk": "low",
                            "resource_template": "provider/docs/{query}",
                            "data_from": "provider_docs",
                            "data_to": "agent_context",
                            "requires_jit": False,
                            "receipt_required": False,
                        }
                    },
                }
            }
        ),
        encoding="utf-8",
    )

    code = main(["provider", "validate", str(contract_path)])
    output = capsys.readouterr().out

    assert code == 0
    assert "Provider MCP contract is valid." in output


def test_provider_contract_diff_flags_added_high_blast_radius_tool():
    before = provider_contract(
        {
            "provider.crm.search_customer": {
                "action": "read",
                "risk": "low",
                "resource_template": "provider/customer/{customer_id}",
                "data_from": "provider_crm",
                "data_to": "agent_context",
                "requires_jit": False,
                "receipt_required": False,
            }
        }
    )
    after = provider_contract(
        {
            **before["provider_agentid"]["tools"],
            "provider.crm.update_customer": high_risk_tool(),
        }
    )

    diff = diff_provider_contracts(before, after)

    assert diff.added_tools == ["provider.crm.update_customer"]
    assert "new high-blast-radius tool: provider.crm.update_customer (high)" in diff.findings


def test_provider_contract_diff_flags_changed_receipt_requirements():
    before_tool = high_risk_tool()
    after_tool = high_risk_tool()
    after_tool["authorization_requirements"] = {
        **after_tool["authorization_requirements"],
        "receipt_ttl_seconds": 600,
    }
    after_tool["risk"] = "critical"

    diff = diff_provider_contracts(
        provider_contract({"provider.crm.update_customer": before_tool}),
        provider_contract({"provider.crm.update_customer": after_tool}),
    )

    assert diff.changed_tools == ["provider.crm.update_customer"]
    assert "provider.crm.update_customer risk increased: high -> critical" in diff.findings
    assert "provider.crm.update_customer changed authorization_requirements.receipt_ttl_seconds" in diff.findings


def test_cli_provider_diff_json(tmp_path, capsys):
    before_path = tmp_path / "before.yaml"
    after_path = tmp_path / "after.yaml"
    before_path.write_text(yaml.safe_dump(provider_contract({})), encoding="utf-8")
    after_path.write_text(yaml.safe_dump(provider_contract({"provider.crm.update_customer": high_risk_tool()})), encoding="utf-8")

    code = main(["provider", "diff", str(before_path), str(after_path), "--json"])
    output = yaml.safe_load(capsys.readouterr().out)

    assert code == 0
    assert output["added_tools"] == ["provider.crm.update_customer"]
    assert "new high-blast-radius tool: provider.crm.update_customer (high)" in output["findings"]


def test_cli_provider_diff_text(tmp_path, capsys):
    before_path = tmp_path / "before.yaml"
    after_path = tmp_path / "after.yaml"
    before_path.write_text(yaml.safe_dump(provider_contract({})), encoding="utf-8")
    after_path.write_text(yaml.safe_dump(provider_contract({"provider.crm.update_customer": high_risk_tool()})), encoding="utf-8")

    code = main(["provider", "diff", str(before_path), str(after_path)])
    output = capsys.readouterr().out

    assert code == 0
    assert "Provider MCP contract diff" in output
    assert "Added tools: 1" in output
    assert "- provider.crm.update_customer" in output


def test_import_provider_contract_generates_valid_manifest():
    contract = load_provider_contract(Path(__file__).resolve().parent.parent / "examples" / "provider-mcp-contract.yaml")

    manifest = import_provider_contract(contract, "enterprise-support-agent")
    result = validate_manifest(manifest)

    assert result.ok
    assert manifest["agent"]["id"] == "enterprise-support-agent"
    assert manifest["mcp_gateway"]["provider"] == "example-crm"
    assert manifest["mcp_gateway"]["downstream_server"] == "provider-crm-mcp"
    assert manifest["mcp_gateway"]["tool_argument_mapping"]["provider.crm.search_customer"]["customer_id_arg"] == "customer_id"
    assert manifest["mcp_gateway"]["tool_argument_mapping"]["provider.crm.update_customer"]["resource_template"] == "provider/customer/{customer_id}"
    assert manifest["mcp_gateway"]["tool_argument_mapping"]["provider.crm.update_customer"]["approval_id_arg"] == "approval_id"

    tools = {tool["name"]: tool for tool in manifest["tools"]}
    assert tools["provider.crm.search_customer"]["auth_mode"] == "delegated"
    assert tools["provider.crm.update_customer"]["auth_mode"] == "just_in_time"
    assert tools["provider.crm.update_customer"]["constraints"]["token_ttl_seconds"] == 300
    assert tools["provider.billing.issue_credit"]["constraints"]["max_amount_usd"] == 100
    assert {"from": "enterprise_crm", "to": "provider_crm", "allowed": True} in manifest["data_flows"]


def test_cli_provider_import_writes_manifest(tmp_path, capsys):
    output = tmp_path / "generated.yaml"
    contract_path = Path(__file__).resolve().parent.parent / "examples" / "provider-mcp-contract.yaml"

    code = main(["provider", "import", str(contract_path), "--agent", "enterprise-support-agent", "--output", str(output)])
    message = capsys.readouterr().out
    manifest = yaml.safe_load(output.read_text(encoding="utf-8"))

    assert code == 0
    assert "Wrote AgentID manifest" in message
    assert manifest["agent"]["id"] == "enterprise-support-agent"
    assert validate_manifest(manifest).ok


def test_provider_contract_from_openapi_generates_reviewable_contract():
    contract = provider_contract_from_openapi(openapi_spec(), provider="example-crm", tool_prefix="provider.crm")
    result = validate_provider_contract(contract)

    assert result.ok
    tools = contract["provider_agentid"]["tools"]
    assert "provider.crm.search_customer" in tools
    assert "provider.crm.update_customer" in tools
    assert "provider.crm.issue_credit" in tools
    assert tools["provider.crm.search_customer"]["action"] == "read"
    assert tools["provider.crm.search_customer"]["risk"] == "low"
    assert tools["provider.crm.update_customer"]["requires_jit"] is True
    assert tools["provider.crm.update_customer"]["receipt_required"] is True
    assert tools["provider.crm.issue_credit"]["approval"] == "manager"
    assert tools["provider.crm.issue_credit"]["authorization_requirements"]["amount_arg"] == "amount_usd"


def test_cli_provider_from_openapi_writes_contract(tmp_path, capsys):
    openapi_path = tmp_path / "openapi.yaml"
    output = tmp_path / "provider-contract.yaml"
    openapi_path.write_text(yaml.safe_dump(openapi_spec()), encoding="utf-8")

    code = main(
        [
            "provider",
            "from-openapi",
            str(openapi_path),
            "--provider",
            "example-crm",
            "--tool-prefix",
            "provider.crm",
            "--output",
            str(output),
        ]
    )
    message = capsys.readouterr().out
    contract = yaml.safe_load(output.read_text(encoding="utf-8"))

    assert code == 0
    assert "Wrote provider MCP contract" in message
    assert validate_provider_contract(contract).ok
    assert "provider.crm.update_customer" in contract["provider_agentid"]["tools"]


def provider_contract(tools):
    return {
        "provider_agentid": {
            "provider": "example",
            "mcp_server": "example-mcp",
            "tools": tools,
        }
    }


def high_risk_tool():
    return {
        "action": "write",
        "risk": "high",
        "resource_template": "provider/customer/{customer_id}",
        "data_from": "enterprise_crm",
        "data_to": "provider_crm",
        "requires_jit": True,
        "approval": "human_confirm",
        "receipt_required": True,
        "authorization_requirements": {
            "required_context": ["tenant_id", "agent_id", "user_id", "approval_id"],
            "bind_receipt_to": ["tenant_id", "agent_id", "tool", "action", "resource", "approval_id", "jit_grant_id"],
            "resource_arg": "customer_id",
            "receipt_ttl_seconds": 300,
            "single_use": True,
        },
    }


def openapi_spec():
    return {
        "openapi": "3.1.0",
        "info": {"title": "Example CRM", "version": "1.0.0"},
        "paths": {
            "/customers/{customer_id}": {
                "get": {
                    "operationId": "searchCustomer",
                    "parameters": [
                        {
                            "name": "customer_id",
                            "in": "path",
                            "required": True,
                            "schema": {"type": "string"},
                        }
                    ],
                },
                "patch": {
                    "operationId": "updateCustomer",
                    "parameters": [
                        {
                            "name": "customer_id",
                            "in": "path",
                            "required": True,
                            "schema": {"type": "string"},
                        }
                    ],
                    "requestBody": {
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["billing_email"],
                                    "properties": {"billing_email": {"type": "string"}},
                                }
                            }
                        }
                    },
                },
            },
            "/customers/{customer_id}/credits": {
                "post": {
                    "operationId": "issueCredit",
                    "parameters": [
                        {
                            "name": "customer_id",
                            "in": "path",
                            "required": True,
                            "schema": {"type": "string"},
                        }
                    ],
                    "requestBody": {
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["amount_usd"],
                                    "properties": {
                                        "amount_usd": {"type": "number"},
                                        "reason": {"type": "string"},
                                    },
                                }
                            }
                        }
                    },
                }
            },
        },
    }
