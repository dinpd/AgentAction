import json

import yaml
from jsonschema import Draft202012Validator

from agentid.schema import load_schema, schema_json


def test_schema_is_valid_draft_2020_12():
    schema = load_schema()

    Draft202012Validator.check_schema(schema)


def test_example_manifest_matches_json_schema():
    schema = load_schema()
    manifest = json.loads(json.dumps(yaml.safe_load(open("examples/customer-support-refund-agent.yaml")), default=str))

    Draft202012Validator(schema).validate(manifest)


def test_schema_cli_payload_is_json():
    payload = json.loads(schema_json())

    assert payload["title"] == "AgentID Manifest"
