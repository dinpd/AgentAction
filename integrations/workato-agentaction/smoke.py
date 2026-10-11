"""Exercise a deployed synthetic demo; credentials are read from private files."""
import argparse
import json
import uuid
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--recipe-token-file", type=Path, required=True)
    parser.add_argument("--reviewer-token-file", type=Path, required=True)
    args = parser.parse_args()
    assert args.url.startswith("https://")
    recipe = args.recipe_token_file.read_text().strip()
    reviewer = args.reviewer_token_file.read_text().strip()

    def call(path, method="GET", value=None, token=recipe):
        req = Request(args.url.rstrip("/") + path, method=method,
                      data=None if value is None else json.dumps(value).encode(),
                      headers={"Authorization": "Bearer " + token, "Content-Type": "application/json",
                               "User-Agent": "AgentAction-reference-smoke/1.0"})
        try:
            response = urlopen(req, timeout=30)
        except HTTPError as error:
            response = error
        with response:
            raw = response.read()
            if "application/json" not in response.headers.get("Content-Type", ""):
                raise RuntimeError(f"Non-JSON response from {path}: HTTP {response.status}")
            return response.status, json.loads(raw)

    run = "smoke-" + uuid.uuid4().hex[:12]
    scope = dict(request_id=run, payment_id="pi_demo_smoke", amount_cents=4900,
                 currency="USD", reason="duplicate_charge")
    status, pending = call("/requests", "POST", scope)
    assert status == 201 and pending["status"] == "pending" and pending["mutation_count"] == 0
    decision = dict(scope_digest=pending["scope_digest"], decision_reason="Automated synthetic acceptance check")
    assert call(f"/requests/{run}/approve", "POST", decision)[0] == 403
    assert call("/requests", "POST", {**scope, "amount_cents": 5000})[0] == 409
    status, approved = call(f"/requests/{run}/approve", "POST", decision, reviewer)
    assert status == 200 and approved["status"] == "succeeded" and approved["mutation_count"] == 1
    assert approved["qualified_success"] and approved["outcome_verdict"] == "completed"
    status, replay = call(f"/requests/{run}/execute", "POST", {})
    assert status == 200 and replay["replayed"] and replay["refund_id"] == approved["refund_id"]
    assert replay["mutation_count"] == 1
    _, evidence = call(f"/requests/{run}/evidence")
    assert evidence["observation"]["provenance"]["verification_method"] == "jws"
    assert evidence["finalization"]["snapshot"]["evidence_digest"]
    assert recipe not in json.dumps(evidence) and reviewer not in json.dumps(evidence)
    _, denied = call("/requests", "POST", {**scope, "request_id": run + "-cap", "amount_cents": 10100})
    assert denied["status"] == "denied" and denied["mutation_count"] == 0
    lost_scope = {**scope, "request_id": run + "-lost", "simulate_response_loss": True}
    assert call("/requests", "POST", lost_scope)[0] == 504
    _, recovered = call("/requests", "POST", lost_scope)
    assert recovered["replayed"] and recovered["status"] == "pending" and recovered["mutation_count"] == 0
    print(json.dumps({"passed": True, "request_id": run, "refund_id": approved["refund_id"],
                      "mutation_count": 1, "qualified_success": True, "signed_observation": True}))


if __name__ == "__main__":
    main()
