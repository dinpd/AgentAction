"""Independent Python truth, reference decision, metric, and hash checks."""
from pathlib import Path
import hashlib
import json
import math

from verify_results import recount

ROOT = Path(__file__).resolve().parent
RESULTS = ROOT / "results/service"


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def records_digest(records):
    return hashlib.sha256(canonical(sorted(records, key=lambda r: r["seq"])).encode()).hexdigest()


def truth_from_tables(audit):
    task, effects = audit["task"], audit["effects"]
    if len(effects) != 1:
        return False
    effect = effects[0]
    return (effect["resource"] == task["resource"] and effect["amount"] == task["amount"]
            and effect["settled"] == 1 and effect["approved"] == 1
            and all(r["approved"] == 1 for r in audit["ledger"]))


def reference_label(case, method):
    """Independent finite-domain reference, not a replacement JWS verifier.

    Signed-envelope faults are the recorded interventions; actual cryptographic
    validation is rerun in Node. This reference checks their semantic handling.
    """
    data = case["input"]
    evidence = data["evidence"]
    observations = [] if data["signatureFault"] != "none" else evidence["observations"]
    remedy = method in ("closure_only", "revision_only", "closure_revision")
    if method != "ingress_any" and observations:
        latest = max(o["observed_at"] for o in observations)
        observations = [o for o in observations if o["observed_at"] == latest]
        if len({canonical(o["value"]) for o in observations}) != 1:
            observations = []
        else:
            observations = observations[:1]
    if remedy:
        if not observations:
            return "U"
        closure = observations[0]["value"].get("_closure")
        if not closure or closure["schema"] != "research.closure.v1":
            return "U"
        if method != "revision_only":
            for source in ("decision_events", "execution_receipts"):
                records = evidence.get(source)
                if records is None:
                    return "U"
                if (closure[source]["count"] != len(records)
                        or sorted(r["seq"] for r in records) != list(range(1, len(records) + 1))
                        or records_digest(records) != closure[source]["digest"]):
                    return "U"
        if method != "closure_only":
            if "head" not in data or data["headFault"] != "none":
                return "U"
            proof = data["head"]["value"]["_head"]
            if (proof["challenge"] != data["challenge"] or proof["job"] != data["contract"]["job_id"]
                    or proof["resource"] != observations[0]["resource"] or proof["revision"] != closure["revision"]):
                return "U"
    missing = not observations
    failed = False
    if observations:
        wanted = data["contract"]["profile_variables"]
        failed = any(not any(o["value"].get(field) == expected for o in observations)
                     for field, expected in wanted.items())
    decisions = evidence.get("decision_events")
    receipts = evidence.get("execution_receipts")
    if decisions is None or receipts is None:
        missing = True
    if decisions is not None:
        failed |= any(not d["approved"] for d in decisions)
    if receipts is not None:
        failed |= sum(r["status"] == "executed" for r in receipts) > 1
    return "F" if failed else "U" if missing else "S"


def verify_service():
    read = lambda name: json.loads((RESULTS / name).read_text())
    cases = [json.loads(line) for line in (RESULTS / "cases.jsonl").read_text().splitlines()]
    rows = [json.loads(line) for line in (RESULTS / "assessments.jsonl").read_text().splitlines()]
    summary, manifest = read("summary.json"), read("manifest.json")
    lookup = {c["id"]: c for c in cases}
    assert len(lookup) == len(cases) == summary["design"]["cases"]
    assert len(rows) == summary["design"]["assessments"] == len(cases) * len(summary["design"]["methods"])
    assert len({(r["id"], r["method"]) for r in rows}) == len(rows)
    for c in cases:
        assert truth_from_tables(c["audit"]) == c["truth"] == c["audit"]["truth"], c["id"]
        assert c["audit"]["task"]["revision"] == c["final_revision"]
        assert set(c["input"]) <= {"contract", "evidence", "toolStatus", "signatureFault", "challenge", "head", "headFault"}
        assert c["assumptions_hold"] == (c["scenario"] not in ("unmediated_duplicate", "lying_collector"))
        if c["scenario"] in ("lost_response_retry", "restart_retry", "concurrent_same_key"):
            assert len(c["audit"]["effects"]) == 1
            assert [r["status"] for r in c["audit"]["ledger"]] == ["executed", "replayed"]
        if c["scenario"] == "snapshot_before_duplicate_commit":
            assert "snapshot_returned_while_writer_blocked" in c["schedule"]
            assert c["input"]["evidence"]["observations"][0]["value"]["_closure"]["revision"] < c["final_revision"]
        if c["scenario"].startswith("concurrent_"):
            assert "second_request_arrived_before_first_commit" in c["schedule"]
        if c["scenario"] == "crash_before_commit":
            assert c["final_revision"] == 1 and len(c["audit"]["effects"]) == 1
            assert "state_ledger_revision_rolled_back" in c["schedule"]
    for r in rows:
        c = lookup[r["id"]]
        assert r["truth"] == c["truth"] and r["assumptions_hold"] == c["assumptions_hold"]
        assert r["label"] == reference_label(c, r["method"]), (r["id"], r["method"], r["label"])
    for group in ("overall", "within_assumptions", "outside_assumptions"):
        selected = rows if group == "overall" else [r for r in rows if r["assumptions_hold"] == (group == "within_assumptions")]
        for m, result in summary[group].items():
            assert recount([r for r in selected if r["method"] == m]) == result
    for scenario, methods in summary["by_scenario"].items():
        assert sum(c["scenario"] == scenario for c in cases) == summary["design"]["repetitions"]
        for m, result in methods.items():
            assert recount([r for r in rows if r["scenario"] == scenario and r["method"] == m]) == result
    for name in ("cases", "assessments"):
        assert hashlib.sha256((RESULTS / (name + ".jsonl")).read_bytes()).hexdigest() == manifest[name + "_sha256"]
    for path, digest in manifest["sources"].items():
        assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == digest, path
    timing = read("timing.json")
    for path, digest in timing["sources"].items():
        assert hashlib.sha256((ROOT / "src" / path).read_bytes()).hexdigest() == digest, path
    for category in timing["results"].values():
        for result in category.values():
            xs = sorted(x for block in result["samples"] for x in block)
            assert len(xs) == result["n"] and all(x >= 0 for x in xs)
            assert xs[math.ceil(len(xs) * .5) - 1] == result["p50"]
            assert xs[math.ceil(len(xs) * .95) - 1] == result["p95"]
    print(f"Independently verified {len(cases)} HTTP/SQLite cases, {len(rows)} decisions, reference labels, timings, and source hashes")


if __name__ == "__main__":
    verify_service()
