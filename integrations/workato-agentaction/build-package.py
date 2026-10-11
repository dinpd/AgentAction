"""Build an importable Workato zip from reviewed, credential-free source assets."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo
import argparse
import json

ROOT = Path(__file__).resolve().parent


def build(output):
    assets = {p.name: p.read_bytes() for p in (ROOT / "recipe-package").glob("*.json")}
    assets["agentaction_governed_refund_reference.custom_adapter.rb"] = (ROOT / "connector.rb").read_bytes()
    connection = json.loads(assets["agentaction_reference_refunds_recipe_only.connection.json"])
    assert set(connection) == {"name", "provider", "root_folder"}, "Connection export must exclude credentials"
    assert connection["provider"]["zip_name"] in assets, "Connector dependency must be included"
    for name, expected in (
        ("governed_support_refund_agentaction_reference.recipe.json", ["request_refund", "wait_for_refund", "return_result"]),
        ("automatic_support_refund_agentaction_reference.recipe.json", ["automatic_refund", "get_refund", "return_result"]),
    ):
        recipe = json.loads(assets[name])
        for config in recipe["config"]:
            if isinstance(config.get("account_id"), dict):
                assert config["account_id"]["zip_name"] in assets, "Connection dependency must be included"
                assert config["account_id"]["name"] == connection["name"]
        assert recipe["private"] is True
        actions = recipe["code"]["block"]
        assert [a["name"] for a in actions] == expected
        assert "job_id" in actions[0]["input"]["workato_job_id"]
        assert "parameters" in actions[0]["input"]["request_id"]
        assert "qualified_success" in actions[2]["input"]["result"]
        assert "389e03c8" in actions[2]["input"]["result"]["replayed"], "Return the mutation action's replay flag"
    with ZipFile(output, "w", ZIP_DEFLATED) as package:
        for name, blob in sorted(assets.items()):
            info = ZipInfo(name, date_time=(2026, 10, 10, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            package.writestr(info, blob)
    print(output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("/tmp/agentaction-workato-reference.zip"))
    build(parser.parse_args().output)
