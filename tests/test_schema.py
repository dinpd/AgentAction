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
    profile_schema = json.loads(Path("schema/intent-profile.schema.json").read_text())
    contract_schema = json.loads(Path("schema/intent-contract.schema.json").read_text())
    evaluation_schema = json.loads(Path("schema/intent-evaluation.schema.json").read_text())
    observation_schema = json.loads(Path("schema/intent-observation.schema.json").read_text())
    snapshot_schema = json.loads(Path("schema/intent-evidence-snapshot.schema.json").read_text())
    quality_schema = json.loads(Path("schema/intent-quality-rollup.schema.json").read_text())
    profile = json.loads(Path("packages/guard/examples/support-refund-profile.json").read_text())
    contract = json.loads(Path("packages/guard/examples/support-refund-intent.json").read_text())
    evaluation = json.loads(Path("packages/guard/examples/support-refund-evaluation.json").read_text())
    quality_rollup = json.loads(Path("packages/guard/examples/support-refund-quality-rollup.json").read_text())

    Draft202012Validator.check_schema(profile_schema)
    Draft202012Validator.check_schema(contract_schema)
    Draft202012Validator.check_schema(evaluation_schema)
    Draft202012Validator.check_schema(observation_schema)
    Draft202012Validator.check_schema(snapshot_schema)
    Draft202012Validator.check_schema(quality_schema)
    Draft202012Validator(profile_schema).validate(profile)
    Draft202012Validator(contract_schema).validate(contract)
    profile_contract = {
        **contract,
        "profile_version": "v1",
        "profile_digest": "d" * 64,
        "profile_variables": {"payment_id": "pi_123", "refund_amount": 49, "currency": "USD"},
        "trusted_observation_requirements": profile["trusted_observation_requirements"],
    }
    Draft202012Validator(contract_schema).validate(profile_contract)
    Draft202012Validator(evaluation_schema).validate(evaluation)
    Draft202012Validator(quality_schema).validate(quality_rollup)
    no_runtime_rollup = json.loads(json.dumps(quality_rollup))
    no_runtime_rollup["rollups"][0]["execution_discipline"]["averages"]["runtime_ms"] = None
    no_runtime_rollup["rollups"][0]["execution_discipline"]["coverage"]["runtime_ms_records"] = 0
    Draft202012Validator(quality_schema).validate(no_runtime_rollup)
    Draft202012Validator(evaluation_schema).validate({
        **evaluation,
        "profile_version": "v1",
        "profile_digest": "d" * 64,
        "evaluation_mode": "final",
        "snapshot_id": f"snapshot_{'b' * 24}",
        "evidence_digest": "c" * 64,
    })
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
    Draft202012Validator(snapshot_schema).validate({
        "schema_version": "agentpass.intent-evidence-snapshot.v1",
        "snapshot_id": f"snapshot_{'b' * 24}",
        "tenant_id": "acme",
        "intent_id": contract["intent_id"],
        "intent_digest": evaluation["intent_digest"],
        "job_id": contract["job_id"],
        "captured_at": "2026-07-20T18:00:02.000Z",
        "evidence_digest": "c" * 64,
        "sources": {
            source: {"count": 0, "evidence_ids": [], "digest": "d" * 64}
            for source in ["decision_events", "execution_receipts", "observations", "job"]
        },
        "evidence": {
            "decision_events": [],
            "execution_receipts": [],
            "observations": [],
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
            "contract_issuance": {
                "mode": "registered_profile_required",
            },
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
