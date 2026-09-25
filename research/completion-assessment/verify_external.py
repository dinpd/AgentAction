"""Independent external-result audit; no upstream install or network required."""
from collections import Counter
import hashlib
import json
from pathlib import Path
from verify_results import recount

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "results/external"


def verify_external():
    read = lambda name: json.loads((OUT / name).read_text())
    lines = lambda name: [json.loads(line) for line in (OUT / name).read_text().splitlines()]
    tasks, cases, rows = lines("tasks.jsonl"), lines("cases.jsonl"), lines("assessments.jsonl")
    summary, selection, manifest = read("summary.json"), read("selection.json"), read("manifest.json")
    lookup, case_lookup = {t["task_id"]: t for t in tasks}, {c["id"]: c for c in cases}
    assert len(lookup) == len(tasks) == summary["design"]["selected_tasks"]
    assert selection["selected"] == list(lookup)
    excluded = [t["task_id"] for t in selection["excluded"]]
    assert len(set(excluded)) == len(excluded) == summary["design"]["excluded_tasks"]
    assert not set(excluded) & set(lookup)
    assert set(excluded) | set(lookup) == set(map(str, range(summary["design"]["base_tasks"])))
    assert Counter(t["reason"] for t in selection["excluded"]) == {"no_mutating_action": 10, "action_replay_error": 13}
    assert len(cases) == len(case_lookup) == len(tasks) * 8 == summary["design"]["cases"]
    assert len(rows) == len(cases) * 3 == summary["design"]["assessments"]
    assert len({(r["id"], r["method"]) for r in rows}) == len(rows)
    canonical = lambda value: json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    digest = lambda value: hashlib.sha256(canonical(value).encode()).hexdigest()
    for task in tasks:
        assert len(task["base_db_sha256"]) == 64
        assert task["goal_db_sha256"] == task["states"]["goal"]["sha256"]
        assert task["states"]["goal"]["changes"] != task["states"]["incomplete"]["changes"]
        assert task["states"]["goal"]["changes"] != task["states"]["extra"]["changes"]
        actions = task["annotated_actions"]
        # Prove the exposed alternatives are actual trace omissions, including
        # read outputs, rather than traces with substituted observations.
        assert task["traces"]["extra"][:-2] == task["traces"]["goal"]
        truncated = json.loads(json.dumps(task["traces"]["goal"]))
        index = 2 * task["omitted_action_index"]
        del truncated[index:index + 2]
        for i in range(0, len(truncated), 2):
            call_id = f'{task["task_id"]}:{i // 2}'
            truncated[i]["tool_calls"][0]["id"] = call_id
            truncated[i + 1]["id"] = call_id
        assert truncated == task["traces"]["incomplete"]
        for key, trace in task["traces"].items():
            assert len(trace) % 2 == 0
            calls = []
            for i in range(0, len(trace), 2):
                msg, response = trace[i:i+2]
                assert msg["role"] == "assistant" and len(msg["tool_calls"]) == 1
                tc = msg["tool_calls"][0]
                assert tc["id"] == response["id"] == f'{task["task_id"]}:{i // 2}'
                assert response["role"] == "tool" and not response["error"]
                assert msg["timestamp"] == response["timestamp"] == "2026-09-24T00:00:00"
                calls.append({"name": tc["name"], "arguments": tc["arguments"]})
            expected = [a for i, a in enumerate(actions) if key != "incomplete" or i != task["omitted_action_index"]]
            if key == "extra": expected = [*expected, task["extra_action"]]
            assert calls == [{"name": a["name"], "arguments": a["arguments"]} for a in expected]
            assert task["commitments"][key] == {"count": len(trace), "sha256": digest(trace)}
            state_match = task["states"][key]["changes"] == task["states"]["goal"]["changes"]
            assert task["replay_labels"][key] == ("S" if state_match else "F")
    conditions = {
        "complete": ("goal", "goal", "goal"), "incomplete": ("incomplete", "incomplete", "incomplete"),
        "visible_extra": ("extra", "extra", "extra"), "hidden_extra": ("extra", "goal", "extra"),
        "truncated_success": ("goal", "incomplete", "goal"), "unavailable_success": ("goal", None, "goal"),
        "unavailable_incomplete": ("incomplete", None, "incomplete"), "unmediated_extra": ("extra", "goal", "goal")}
    assert summary["design"]["scenarios"] == list(conditions)
    assert Counter((c["task_id"], c["scenario"]) for c in cases) == Counter({(t, s): 1 for t in lookup for s in conditions})
    for case in cases:
        task = lookup[case["task_id"]]
        assert case["id"] == f'retail:{case["task_id"]}:{case["scenario"]}'
        assert (case["actual_state"], case["exposed_trace"], case["committed_trace"]) == conditions[case["scenario"]]
        assert case["truth"] == (task["states"][case["actual_state"]]["changes"] == task["states"]["goal"]["changes"])
        assert case["assumptions_hold"] == (case["scenario"] != "unmediated_extra")
    for row in rows:
        case, task = case_lookup[row["id"]], lookup[row["task_id"]]
        assert all(row[k] == case[k] for k in ("task_id", "truth", "scenario", "assumptions_hold"))
        assert row["method"] in summary["design"]["methods"]
        trace = case["exposed_trace"]
        label = "U"
        if trace is not None and row["method"] != "always_unknown":
            source = task["traces"][trace]
            commitment = task["commitments"][case["committed_trace"]]
            closed = len(source) == commitment["count"] and digest(source) == commitment["sha256"]
            if row["method"] == "upstream_replay" or closed:
                label = "S" if task["states"][trace]["changes"] == task["states"]["goal"]["changes"] else "F"
        assert row["label"] == label, row
    for group in ("overall", "within_assumptions", "outside_assumptions"):
        selected = rows if group == "overall" else [r for r in rows if r["assumptions_hold"] == (group == "within_assumptions")]
        for method, result in summary[group].items():
            assert recount([r for r in selected if r["method"] == method]) == result
    for scenario, methods in summary["by_scenario"].items():
        for method, result in methods.items():
            assert recount([r for r in rows if r["method"] == method and r["scenario"] == scenario]) == result
    for name, expected in manifest["data_sha256"].items():
        assert hashlib.sha256((OUT / name).read_bytes()).hexdigest() == expected, name
    for name, expected in manifest["sources"].items():
        assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected, name
    assert manifest["upstream_revision"] == summary["design"]["upstream_revision"] == "b7ea9074c1cba482b30687fecdb5c8425fd6f619"
    assert hashlib.sha256((OUT / "UPSTREAM_LICENSE").read_bytes()).hexdigest() == manifest["upstream_files"]["LICENSE"]
    print(f'External audit: {len(tasks)} tasks, {len(cases)} cases, {len(rows)} assessments; {len(excluded)} declared exclusions')


if __name__ == "__main__":
    verify_external()
