"""Independent recount and manuscript/PDF checks; never imports experiment code."""
from pathlib import Path
from collections import Counter
import hashlib
import json
import math
import re
import sys

ROOT = Path(__file__).resolve().parent
R = ROOT / "results"


def rows(name):
    return [json.loads(line) for line in (R / name).read_text().splitlines()]


def recount(records):
    c = Counter((r["truth"], r["label"]) for r in records)
    positive = sum(v for (truth, _), v in c.items() if truth)
    negative = len(records) - positive
    fs, ff = c[False, "S"], c[True, "F"]
    abstained = c[False, "U"] + c[True, "U"]
    decisive = len(records) - abstained
    rate = lambda n, d: n / d if d else None
    return dict(total=len(records), positive=positive, negative=negative,
                false_success=fs, false_failure=ff, admitted_positive=c[True, "S"],
                abstained=abstained, decisive=decisive,
                false_success_rate=rate(fs, negative), false_failure_rate=rate(ff, positive),
                coverage=rate(decisive, len(records)), selective_error=rate(fs + ff, decisive),
                positive_admission=rate(c[True, "S"], positive),
                confusion={"positive": {k: c[True, k] for k in "SFU"},
                           "negative": {k: c[False, k] for k in "SFU"}},
                missed_success=positive - c[True, "S"],
                completion_precision=rate(c[True, "S"], c[True, "S"] + fs),
                completion_recall=rate(c[True, "S"], positive),
                completion_f1=rate(2 * c[True, "S"], 2 * c[True, "S"] + fs + positive - c[True, "S"]))


def oracle(case):
    s, w = case["spec"], case["world"]
    if s["domain"] == "refund":
        history = w["refunds"]
        return len(history) == 1 and all(x["payment"] == s["target"] and x["amount"] == s["amount"] and x["settled"] and x["approved"] for x in history)
    if s["domain"] == "deployment":
        history = w["deployments"]
        return len(history) == 1 and all(x["service"] == s["target"] and x["version"] == s["version"] and x["healthyReplicas"] == s["replicas"] and x["approved"] for x in history)
    history = w["exports"]
    return len(history) == 1 and all(x["dataset"] == s["target"] and x["rows"] == s["rows"] and x["destination"] == s["destination"] and x["redacted"] and x["approved"] for x in history)


def verify():
    from verify_service import verify_service
    verify_service()
    from verify_external import verify_external
    verify_external()
    from verify_requests import verify_requests
    verify_requests()
    cases, assessments = rows("cases.jsonl"), rows("assessments.jsonl")
    summary = json.loads((R / "summary.json").read_text())
    manifest = json.loads((R / "manifest.json").read_text())
    assert len(cases) == summary["design"]["cases"]
    assert len(assessments) == summary["design"]["assessments"]
    lookup = {c["id"]: c for c in cases}
    assert len(lookup) == len(cases)
    assert len({(r["id"], r["method"]) for r in assessments}) == len(assessments)
    for c in cases:
        assert oracle(c) == c["truth"], c["id"]
    for row in assessments:
        assert row["truth"] == lookup[row["id"]]["truth"]
    for method, result in summary["overall"].items():
        assert recount([r for r in assessments if r["method"] == method]) == result
    for dimension in ("scenario", "domain"):
        for key, methods in summary["by_" + dimension].items():
            for method, result in methods.items():
                assert recount([r for r in assessments if r[dimension] == key and r["method"] == method]) == result
    for name in ("cases", "assessments"):
        assert hashlib.sha256((R / (name + ".jsonl")).read_bytes()).hexdigest() == manifest[name + "_sha256"]
    for path, digest in manifest["sources"].items():
        assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == digest, path
    for c in cases:
        if c["scenario"] == "missing_success":
            other = lookup[c["id"].replace("missing_success", "missing_failure")]
            for field in ("contract", "evidence", "toolStatus", "signatureFault"):
                assert c[field] == other[field]
            assert c["truth"] != other["truth"]
    bad_success = [r for r in assessments if r["method"] == "ingress_any" and not r["truth"] and r["label"] == "S"]
    assert bad_success and all(r["confidence"] == 1 for r in bad_success)
    loss = rows("observation-loss.jsonl")
    for level in json.loads((R / "observation-loss-summary.json").read_text()):
        for method, result in level["methods"].items():
            assert recount([r for r in loss if r["method"] == method and r["loss_fraction"] == level["loss_fraction"]]) == result
    omissions = rows("stream-omission.jsonl")
    for mask in json.loads((R / "stream-omission-summary.json").read_text()):
        for rep, result in mask["representations"].items():
            assert recount([r for r in omissions if r["mask"] == mask["mask"] and r["representation"] == rep]) == result
    assert summary["overall"]["ingress_all"]["false_failure"] == summary["overall"]["ingress_any"]["false_success"] - summary["overall"]["ingress_all"]["false_success"]
    timing = json.loads((R / "timing.json").read_text())
    for result in timing["results"].values():
        samples = sorted(t for block in result["samples"] for t in block)
        assert len(samples) == result["n"] and all(t >= 0 for t in samples)
        assert samples[math.ceil(len(samples) * .5) - 1] == result["p50"]
        assert samples[math.ceil(len(samples) * .95) - 1] == result["p95"]
    paper = ROOT / "paper"
    manuscript = (paper / "manuscript.md").read_text()
    assert not re.search(r"{{.*?}}|\[@|TODO|TBD|PLACEHOLDER", manuscript)
    assert "Dan Itkis" in manuscript and "AgentAction.dev" in manuscript
    refs = json.loads((paper / "references.json").read_text())
    citations = set(map(int, re.findall(r"\[(\d+)\]", manuscript)))
    assert citations == set(range(1, len(refs) + 1))
    # Independently check every generated result string and numeric table row.
    generated = json.loads((paper / "generated-values.json").read_text())
    assert generated["case_count"] == len(cases)
    assert generated["assessment_count"] == len(assessments)
    assert generated["omission_count"] == len(omissions)
    service = json.loads((R / "service/summary.json").read_text())
    service_timing = json.loads((R / "service/timing.json").read_text())
    assert generated["service_cases"] == service["design"]["cases"]
    assert generated["service_assessments"] == service["design"]["assessments"]
    combined = service["within_assumptions"]["closure_revision"]
    assert generated["service_unknown"] == combined["abstained"]
    assert generated["service_coverage"] == f'{100 * combined["coverage"]:.1f}%'
    for result in service["within_assumptions"].values():
        assert f'{result["false_success"]}/{result["negative"]}' in manuscript
        assert f'{result["false_failure"]}/{result["positive"]}' in manuscript
        assert f'{result["abstained"]}/{result["total"]}' in manuscript
    for category in service_timing["results"].values():
        for result in category.values():
            assert f'{result["p50"]:.4f}' in manuscript
            assert f'{result["p95"]:.4f}' in manuscript
    for result in summary["overall"].values():
        assert f'{result["false_success"]}/{result["negative"]}' in manuscript
        assert f'{result["false_failure"]}/{result["positive"]}' in manuscript
        assert f'{100 * result["coverage"]:.1f}%' in manuscript
    for result in timing["results"].values():
        assert f'{result["p50"]:.4f}' in manuscript
        assert f'{result["p95"]:.4f}' in manuscript
    external = json.loads((R / "external/summary.json").read_text())
    assert generated["external_tasks"] == external["design"]["selected_tasks"]
    assert generated["external_cases"] == external["design"]["cases"]
    requests = json.loads((R / "requests/summary.json").read_text())
    assert generated["request_cases"] == requests["design"]["cases"] == 620
    assert generated["request_assessments"] == requests["design"]["assessments"] == 3100
    recovered = requests["by_condition"]["recovered"]
    for prefix, result in [("request_recovered", recovered["overall"]["gate_targeted"]),
                           ("request_targeted", requests["overall"]["gate_targeted"]),
                           ("request_refresh", requests["overall"]["latest_refresh"])]:
        for metric in ("precision", "recall", "f1"):
            assert generated[f"{prefix}_{metric}"] == f'{100 * result[f"completion_{metric}"]:.1f}%'
    for method in ("gate_full", "gate_targeted", "latest_refresh"):
        for key, value in recovered["costs"][method].items():
            assert generated[f"request_recovered_{method}_{key}"] == value
    saving = 1 - recovered["costs"]["gate_targeted"]["evidence_bytes"] / recovered["costs"]["gate_full"]["evidence_bytes"]
    assert generated["request_evidence_saving"] == f'{100 * saving:.1f}%'
    for method, result in requests["overall"].items():
        for metric in ("completion_precision", "completion_recall", "completion_f1", "coverage"):
            assert f'{100 * result[metric]:.1f}%' in manuscript
        assert str(requests["costs"][method]["provider_reads"]) in manuscript
    for group in requests["by_condition"].values():
        for method in ("latest_refresh", "gate_full", "gate_targeted"):
            result = group["overall"][method]
            assert f'{result["admitted_positive"]}/{result["positive"]}' in manuscript
    target, refresh = requests["overall"]["gate_targeted"], requests["overall"]["latest_refresh"]
    assert (target["false_success"], target["missed_success"], requests["costs"]["gate_targeted"]["provider_reads"]) == (40, 105, 480)
    assert (refresh["false_success"], refresh["missed_success"], requests["costs"]["latest_refresh"]["provider_reads"]) == (60, 75, 1085)
    assert "20a + 605c > 30b" in manuscript
    assert requests["within_assumptions"]["gate_targeted"]["coverage"] == 370 / 580
    assert "63.8% coverage" in manuscript and "same scenario-by-method verdict pattern" in manuscript
    for prefix, result in [("service_latest", service["overall"]["ingress_latest"]),
                           ("service_all", service["overall"]["closure_revision"]),
                           ("service_in", service["within_assumptions"]["closure_revision"]),
                           ("external_replay", external["overall"]["upstream_replay"]),
                           ("external_closure", external["overall"]["closure_replay"])]:
        for metric in ("precision", "recall", "f1"):
            assert generated[f"{prefix}_{metric}"] == f'{100 * result[f"completion_{metric}"]:.1f}%'
    assert "positive/F + positive/U" in manuscript
    assert "not official tau-bench scores" in manuscript
    assert "accessed on" not in manuscript.lower()
    assert service["overall"]["closure_revision"]["completion_f1"] < service["overall"]["ingress_latest"]["completion_f1"]
    if "--pdf" in sys.argv:
        import pdfplumber
        from pypdf import PdfReader
        path = ROOT / "output/pdf/agent-task-completion.pdf"
        reader = PdfReader(path)
        assert 8 <= len(reader.pages) <= 22
        text = " ".join(p.extract_text() or "" for p in reader.pages)
        assert "Dan Itkis" in text and "References" in text
        assert "1200" in text and "8400" in text
        assert str(service["design"]["cases"]) in text and "Closure + revision" in text
        assert "the human author must review and take responsibility" not in " ".join(text.split())
        assert "\ufffd" not in text and "\u25a0" not in text
        with pdfplumber.open(path) as document:
            for i, page in enumerate(document.pages, 1):
                assert page.chars, i
                for char in page.chars:
                    assert 20 < char["x0"] < char["x1"] < page.width - 20, (i, char)
                    assert 15 < char["top"] < char["bottom"] < page.height - 15, (i, char)
        print(f"PDF verified: {len(reader.pages)} pages, valid text and page bounds")
    print(f"Independently verified {len(cases)} cases, {len(assessments)} primary assessments, {len(loss)} loss assessments, and {len(omissions)} omission assessments")


if __name__ == "__main__":
    verify()
