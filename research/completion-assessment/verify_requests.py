"""Audit evidence-request labels, paired inputs, read costs and unchanged effects."""
from collections import Counter
import hashlib
import json
from pathlib import Path
from verify_results import recount
from verify_service import reference_label, truth_from_tables, records_digest

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "results/requests"


def verify_requests():
    read = lambda name: json.loads((OUT / name).read_text())
    lines = lambda name: [json.loads(line) for line in (OUT / name).read_text().splitlines()]
    cases, rows = lines("cases.jsonl"), lines("assessments.jsonl")
    summary, manifest = read("summary.json"), read("manifest.json")
    methods = ["latest_static", "gate_static", "latest_refresh", "gate_full", "gate_targeted"]
    conditions = ["recovered", "unavailable", "persistent_omission", "revision_race"]
    assert summary["design"] == dict(families=31, conditions=conditions, variants=5, cases=620,
                                   assessments=3100, methods=methods, max_rounds=1, max_reads=2)
    lookup = {c["id"]: c for c in cases}
    assert len(cases) == len(lookup) == 620 and len(rows) == 3100
    assert Counter((r["id"], r["method"]) for r in rows) == Counter({(c, m): 1 for c in lookup for m in methods})
    size = lambda value: len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode())
    for c in cases:
        assert c["truth"] == truth_from_tables(c["audit"])
        assert c["scenario"] == c["family"] + "/" + c["condition"]
        assert c["assumptions_hold"] == (c["family"] not in ("unmediated_duplicate", "lying_collector"))
    for r in rows:
        c = lookup[r["id"]]
        for key in ("truth", "scenario", "family", "condition", "variant", "assumptions_hold"):
            assert r[key] == c[key]
        latest = r["method"] in ("latest_static", "latest_refresh")
        evaluator = "ingress_latest" if latest else "closure_revision"
        assert r["initial"]["label"] == reference_label(c, evaluator)
        requested = r["method"] == "latest_refresh" or (r["method"] in ("gate_full", "gate_targeted") and r["initial"]["label"] == "U")
        assert bool(r["request"]) == requested
        before, after = c["audit"], r["audit_after"]
        assert before["effects"] == after["effects"] and before["ledger"] == after["ledger"]
        assert truth_from_tables(after) == r["truth"] == after["truth"]
        changed = requested and r["condition"] == "revision_race"
        assert after["task"] == {**before["task"], "revision": before["task"]["revision"] + int(changed)}
        reads = r["reads"]
        assert len(reads) <= 2
        assert r["cost"] == dict(requests=int(requested), provider_reads=len(reads),
                                 successful_reads=sum(x["status"] == "ok" for x in reads),
                                 provider_bytes=sum(x["provider_bytes"] for x in reads),
                                 evidence_bytes=size(r["delivery"]) if r["delivery"] else 0)
        if not requested:
            assert r["status"] == "not_requested" and not reads and r["final_input"] is None and r["delivery"] is None
            assert r["final"] == r["initial"]
        else:
            req, contract = r["request"], c["input"]["contract"]
            assert set(req) == {"schema", "intent_id", "intent_digest", "job_id", "resource", "kind", "reasons", "max_reads"}
            assert req["schema"] == "research.evidence-request.v1" and req["max_reads"] == 2
            assert req["resource"] == contract["profile_variables"]["resource"]
            assert all(req[k] == contract[k] for k in ("intent_id", "intent_digest", "job_id"))
            assert req["reasons"] == r["initial"]["rejected"]
            expected_scope = "snapshot"
            if r["method"] == "gate_targeted":
                reasons = req["reasons"]
                if set(reasons) & {"remedy_history_not_closed", "remedy_missing_closure_source", "remedy_history_binding"}:
                    expected_scope = "history"
                elif (set(reasons) & {"remedy_missing_head", "remedy_invalid_head_binding"}
                      or "observation_jws_signature_invalid" in reasons and "remedy_missing_observation" not in reasons):
                    expected_scope = "head"
            assert req["kind"] == expected_scope
            expected_reads = ["head"] if expected_scope == "head" else ["snapshot", "head"]
            if r["condition"] == "unavailable":
                assert r["status"] == "unavailable" and r["final_input"] is None and r["delivery"] is None
                assert [x["kind"] for x in reads] == expected_reads[:1]
                assert all(x["response"] is None and x["provider_bytes"] == 0 for x in reads)
                assert r["final"]["label"] == "U"
            else:
                assert r["status"] == "received" and [x["kind"] for x in reads] == expected_reads
                data = r["final_input"]
                assert data["contract"] == contract
                assert r["label"] == reference_label({"input": data}, evaluator)
                assert data["headFault"] == "none" and data["head"] == r["delivery"]["head"]
                assert data["challenge"] == r["delivery"]["challenge"] == data["head"]["value"]["_head"]["challenge"]
                for x in reads:
                    value = x["response"]
                    assert x["status"] == "ok" and x["provider_bytes"] == size(value)
                    assert value["job"] == contract["job_id"]
                    if x["kind"] == "head":
                        assert value["revision"] == after["task"]["revision"]
                        assert value["resource"] == before["task"]["resource"]
                        assert data["head"]["value"]["_head"] == {"schema": "research.head.v1", **value}
                    else:
                        assert value["revision"] == before["task"]["revision"]
                        assert value["ledger"] == before["ledger"]
                        effect = before["effects"][-1]
                        assert value["state"] == {"resource": effect["resource"], "amount": effect["amount"], "settled": bool(effect["settled"])}
                if expected_scope == "head":
                    assert data["evidence"] == c["input"]["evidence"]
                    assert data["signatureFault"] == c["input"]["signatureFault"]
                    assert set(r["delivery"]) == {"head", "challenge"}
                else:
                    bind = {k: contract[k] for k in ("intent_id", "intent_digest", "job_id")}
                    decisions = [{**bind, "seq": x["seq"], "decision_id": f'decision-{x["seq"]}', "decision": "allow", "approved": bool(x["approved"])} for x in before["ledger"]]
                    receipts = [{**bind, "seq": x["seq"], "execution_receipt_id": f'receipt-{x["seq"]}', "effect_id": x["effect_id"], "status": x["status"]} for x in before["ledger"]]
                    visible = receipts[:-1] if r["condition"] == "persistent_omission" else receipts
                    evidence = data["evidence"]
                    assert evidence["decision_events"] == decisions and evidence["execution_receipts"] == visible
                    if expected_scope == "history":
                        assert evidence["observations"] == c["input"]["evidence"]["observations"]
                        assert set(r["delivery"]) == {"decision_events", "execution_receipts", "head", "challenge"}
                        assert r["delivery"]["execution_receipts"] == visible and r["delivery"]["decision_events"] == decisions
                    else:
                        assert data["signatureFault"] == "none" and len(evidence["observations"]) == 1
                        assert r["delivery"]["evidence"] == evidence
                        assert set(r["delivery"]) == {"evidence", "head", "challenge"}
                        state = dict(reads[0]["response"]["state"])
                        if c["family"] == "lying_collector": state["settled"] = True
                        state["_closure"] = {"schema": "research.closure.v1", "revision": before["task"]["revision"],
                                             "decision_events": {"count": len(decisions), "digest": records_digest(decisions)},
                                             "execution_receipts": {"count": len(receipts), "digest": records_digest(receipts)}}
                        assert evidence["observations"][0]["value"] == state
        assert r["label"] == r["final"]["label"]
    def audit_summary(part, selected):
        for group in ("overall", "within_assumptions", "outside_assumptions"):
            filtered = selected if group == "overall" else [r for r in selected if r["assumptions_hold"] == (group == "within_assumptions")]
            for method in methods:
                assert part[group][method] == recount([r for r in filtered if r["method"] == method])
        for scenario, results in part["by_scenario"].items():
            for method in methods:
                assert results[method] == recount([r for r in selected if r["scenario"] == scenario and r["method"] == method])
        if "costs" in part:
            for method in methods:
                assert part["costs"][method] == {key: sum(r["cost"][key] for r in selected if r["method"] == method) for key in rows[0]["cost"]}
    audit_summary(summary, rows)
    audit_summary(summary["initial"], [{**r, "label": r["initial"]["label"]} for r in rows])
    for condition in conditions:
        audit_summary(summary["by_condition"][condition], [r for r in rows if r["condition"] == condition])
    for name, expected in manifest["data_sha256"].items():
        assert hashlib.sha256((OUT / name).read_bytes()).hexdigest() == expected, name
    for name, expected in manifest["sources"].items():
        assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected, name
    print("Request audit: 620 matched cases, 3100 decisions, reference labels, read costs and unchanged effects")


if __name__ == "__main__":
    verify_requests()
