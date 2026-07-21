import json
from pathlib import Path

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


def test_skill_capability_manifest_matches_json_schema():
    schema = load_schema()
    manifest = {
        "agent": {
            "id": "a1",
            "name": "Test Agent",
            "owner": "team",
            "environment": "dev",
            "purpose": "test",
        },
        "capabilities": [
            {
                "id": "support-refund-workflow",
                "kind": "skill",
                "source": "./skills/support-refund-workflow",
                "version": "1.0.0",
                "hash": "sha256:test",
                "access": "execute",
                "auth_mode": "just_in_time",
                "approval": "human_confirm",
                "may_invoke": ["provider.billing.issue_credit"],
                "constraints": {"token_ttl_seconds": 300},
            }
        ],
    }

    Draft202012Validator(schema).validate(manifest)


def test_schema_cli_payload_is_json():
    payload = json.loads(schema_json())

    assert payload["title"] == "AgentPass Manifest"


def test_intent_schemas_and_refund_examples_are_valid():
    contract_schema = json.loads(Path("schema/intent-contract.schema.json").read_text())
    evaluation_schema = json.loads(Path("schema/intent-evaluation.schema.json").read_text())
    observation_schema = json.loads(Path("schema/intent-observation.schema.json").read_text())
    contract = json.loads(Path("packages/guard/examples/support-refund-intent.json").read_text())
    evaluation = json.loads(Path("packages/guard/examples/support-refund-evaluation.json").read_text())

    Draft202012Validator.check_schema(contract_schema)
    Draft202012Validator.check_schema(evaluation_schema)
    Draft202012Validator.check_schema(observation_schema)
    Draft202012Validator(contract_schema).validate(contract)
    Draft202012Validator(evaluation_schema).validate(evaluation)
    Draft202012Validator(observation_schema).validate({
        "schema_version": "agentpass.intent-observation.v1",
        "observation_id": "obs-refund-1",
        "tenant_id": "acme",
        "intent_id": contract["intent_id"],
        "intent_digest": evaluation["intent_digest"],
        "predicate": "refund.status",
        "value": "succeeded",
        "observed_at": "2026-07-20T18:00:01.000Z",
        "issued_at": "2026-07-20T18:00:01.000Z",
        "expires_at": "2026-07-20T18:05:01.000Z",
        "issuer": "stripe-adapter",
        "resource": "payment/pi_123",
        "payload_digest": "a" * 64,
        "provenance": {
            "verification_method": "oidc",
            "verified_issuer": "stripe-adapter",
            "verified_at": "2026-07-20T18:00:02.000Z",
            "verified_subject": "stripe-observer",
        },
    })


def test_intent_observation_trust_policy_matches_manifest_schema():
    schema = load_schema()
    manifest = {
        "agent": {
            "id": "a1",
            "name": "Test Agent",
            "owner": "team",
            "environment": "production",
            "purpose": "test",
        },
        "intent_assurance": {
            "observations": {
                "max_age_seconds": 300,
                "max_future_skew_seconds": 30,
                "trusted_issuers": [{
                    "issuer": "stripe-adapter",
                    "profiles": ["support_refund.v1"],
                    "predicates": ["refund.status"],
                    "verification_methods": ["oidc", "jws"],
                    "oidc_subjects": ["stripe-observer"],
                    "oidc_issuers": ["https://idp.example.com"],
                    "jws_subjects": ["stripe-observer"],
                    "jwks_uri": "https://stripe.example.com/.well-known/jwks.json",
                    "audiences": ["agentpass-observations"],
                }],
            }
        },
    }

    Draft202012Validator(schema).validate(manifest)
