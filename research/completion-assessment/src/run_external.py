"""Pinned upstream retail replay experiment; no model or network calls."""
from pathlib import Path
import argparse
import hashlib
import importlib.metadata
import inspect
import json
import os
import socket
import subprocess
import sys
import types

ROOT = Path(__file__).resolve().parents[1]
REVISION = "b7ea9074c1cba482b30687fecdb5c8425fd6f619"
SCENARIOS = ("complete", "incomplete", "visible_extra", "hidden_extra", "truncated_success",
             "unavailable_success", "unavailable_incomplete", "unmediated_extra")
METHODS = ("upstream_replay", "closure_replay", "always_unknown")


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def changes(base, state):
    """Complete row replacements against one common baseline, not selected fields."""
    assert set(base) == set(state)
    return {table: {key: {"present": key in state[table], "value": state[table].get(key)}
                    for key in sorted(set(base[table]) | set(state[table]))
                    if base[table].get(key) != state[table].get(key)} for table in sorted(base)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upstream", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    upstream = args.upstream.resolve()
    rev = subprocess.check_output(["git", "-C", str(upstream), "rev-parse", "HEAD"], text=True).strip()
    if rev != REVISION:
        raise ValueError(f"Expected upstream {REVISION}, got {rev}")
    if subprocess.check_output(["git", "-C", str(upstream), "status", "--porcelain", "--untracked-files=no"]):
        raise ValueError("Upstream tracked source must be unmodified")
    os.environ["TAU2_DATA_DIR"] = str(upstream / "data")
    os.environ["PYTHON_DOTENV_DISABLED"] = "1"
    os.environ["LITELLM_LOCAL_MODEL_COST_MAP"] = "True"
    # Fail closed before importing the upstream package; never load user credentials.
    def no_network(*_args, **_kwargs):
        raise RuntimeError("External experiment prohibits network access")
    socket.socket.connect = no_network
    socket.socket.connect_ex = no_network
    socket.create_connection = no_network
    sys.path.insert(0, str(upstream / "src"))
    # The upstream convenience initializers eagerly import optional voice/LLM
    # runners. Load their package paths without those re-exports; all task,
    # environment, data model, tool and evaluator module bodies remain unchanged.
    for name in ("tau2", "tau2.voice.audio_native.openai"):
        package = types.ModuleType(name)
        package.__path__ = [str(upstream / "src" / name.replace(".", "/"))]
        package.__package__ = name
        sys.modules[name] = package
    from loguru import logger
    logger.remove()
    from tau2.data_model.message import AssistantMessage, ToolCall
    from tau2.domains.retail.environment import get_environment, get_tasks
    from tau2.evaluator.evaluator_env import EnvironmentEvaluator
    assert Path(inspect.getfile(EnvironmentEvaluator)).resolve().is_relative_to(upstream)
    base_environment = get_environment()
    base_db = base_environment.tools.db.model_dump(mode="json")
    # Separate environment and model instance on every construction; parsing cache
    # is only a speed optimization and never shares mutable task state.
    base_model = base_environment.tools.db.model_copy(deep=True)
    def environment_constructor(solo_mode=False):
        return get_environment(db=base_model.model_copy(deep=True), solo_mode=solo_mode)

    def execute(actions, task_id):
        env, trajectory = environment_constructor(), []
        for i, action in enumerate(actions):
            tc = ToolCall(id=f"{task_id}:{i}", name=action["name"], arguments=action["arguments"],
                          requestor=action.get("requestor", "assistant"))
            if tc.requestor != "assistant":
                raise ValueError("Retail adapter only supports assistant tools")
            tm = env.get_response(tc)
            if tm.error:
                raise ValueError(f"{tc.name}: {tm.content}")
            tm.timestamp = "2026-09-24T00:00:00"
            trajectory.extend([AssistantMessage(role="assistant", tool_calls=[tc], timestamp=tm.timestamp), tm])
        return env, trajectory

    # Upstream interface receives only task and exposed messages. No state or
    # scenario metadata enters the evaluator, and strict replay stays enabled.
    def replay_assessment(task, messages):
        reward = EnvironmentEvaluator.calculate_reward(environment_constructor, task, messages)
        assert reward.db_check is not None
        return "S" if reward.db_check.db_match else "F"

    tasks = sorted(get_tasks("base"), key=lambda task: int(task.id))
    artifacts, cases, assessments, exclusions = [], [], [], []
    for task in tasks:
        criteria = task.evaluation_criteria
        reason = None
        if criteria is None or "DB" not in criteria.reward_basis:
            reason = "no_db_criterion"
        elif task.initial_state is not None:
            reason = "initial_state_unsupported"
        actions = [a.model_dump(mode="json") for a in criteria.actions or []] if criteria else []
        mutating = [i for i, a in enumerate(actions) if base_environment.tools.tool_mutates_state(a["name"])]
        if not reason and not mutating:
            reason = "no_mutating_action"
        if reason:
            exclusions.append({"task_id": task.id, "reason": reason})
            continue
        try:
            goal_env, goal_trace = execute(actions, task.id)
            incomplete_actions = [a for i, a in enumerate(actions) if i != mutating[-1]]
            incomplete_env, incomplete_trace = execute(incomplete_actions, task.id)
        except ValueError as error:
            exclusions.append({"task_id": task.id, "reason": "action_replay_error", "detail": str(error)})
            continue
        goal_db = goal_env.tools.db.model_dump(mode="json")
        incomplete_db = incomplete_env.tools.db.model_dump(mode="json")
        if goal_db == base_db or goal_db == incomplete_db:
            exclusions.append({"task_id": task.id, "reason": "no_distinguishing_final_mutation"})
            continue
        user_id = min(goal_db["users"])
        address = dict(goal_db["users"][user_id]["address"])
        marker = "RESEARCH EXTRA WRITE"
        assert address["address1"] != marker
        address["address1"] = marker
        extra_action = {"name": "modify_user_address", "arguments": {"user_id": user_id, **address}}
        extra_env, extra_trace = execute([*actions, extra_action], task.id)
        extra_db = extra_env.tools.db.model_dump(mode="json")
        assert extra_db != goal_db
        traces = {"goal": goal_trace, "incomplete": incomplete_trace, "extra": extra_trace}
        states = {"goal": goal_db, "incomplete": incomplete_db, "extra": extra_db}
        serial_traces = {key: [m.model_dump(mode="json") for m in trace] for key, trace in traces.items()}
        commitments = {key: {"count": len(trace), "sha256": digest(trace)} for key, trace in serial_traces.items()}
        # Execute the unmodified evaluator for each distinct task/evidence input.
        # The two wrappers reuse these deterministic verdicts when closure permits.
        replay = {key: replay_assessment(task, trace) for key, trace in traces.items()}
        for key, state in states.items():
            assert (replay[key] == "S") == (state == goal_db), (task.id, key, replay[key])
        artifacts.append({"task_id": task.id, "task_sha256": digest(task.model_dump(mode="json")),
                          "base_db_sha256": digest(base_db), "goal_db_sha256": digest(goal_db),
                          "annotated_actions": actions, "omitted_action_index": mutating[-1], "extra_action": extra_action,
                          "states": {key: {"sha256": digest(state), "changes": changes(base_db, state)} for key, state in states.items()},
                          "traces": serial_traces, "commitments": commitments, "replay_labels": replay})
        conditions = [("goal", "goal", "goal"), ("incomplete", "incomplete", "incomplete"),
                      ("extra", "extra", "extra"), ("extra", "goal", "extra"),
                      ("goal", "incomplete", "goal"), ("goal", None, "goal"),
                      ("incomplete", None, "incomplete"), ("extra", "goal", "goal")]
        for scenario, (actual, exposed, recorded) in zip(SCENARIOS, conditions, strict=True):
            case = {"id": f"retail:{task.id}:{scenario}", "task_id": task.id, "scenario": scenario,
                    "actual_state": actual, "exposed_trace": exposed, "committed_trace": recorded,
                    "assumptions_hold": scenario != "unmediated_extra", "truth": states[actual] == goal_db}
            cases.append(case)
            for method in METHODS:
                # Cache only upstream replay, keyed by the exact task and trace;
                # no oracle or fault labels enter the label computation.
                label = "U"
                if method != "always_unknown" and exposed is not None:
                    valid = commitments[exposed] == commitments[recorded]
                    if method == "upstream_replay" or valid:
                        label = replay[exposed]
                assessments.append({**{k: case[k] for k in ("id", "task_id", "scenario", "assumptions_hold", "truth")},
                                    "method": method, "label": label})
        print(f"retail task {task.id} complete", flush=True)
    # Shared JS scorecard exercises the same adapter-independent metrics on the
    # external dataset; the standard-library verifier recounts separately.
    score_script = ROOT / "src/score_assessments.mts"
    summary = json.loads(subprocess.check_output(["node", "--experimental-strip-types", str(score_script)],
                        input=json.dumps(assessments), text=True))
    summary["design"] = {"upstream_revision": REVISION, "base_tasks": len(tasks),
                         "selected_tasks": len(artifacts), "excluded_tasks": len(exclusions),
                         "scenarios": list(SCENARIOS), "methods": list(METHODS),
                         "cases": len(cases), "assessments": len(assessments),
                         "scope": "Retail DB component; scripted annotated actions; no model/dialogue or full benchmark score."}
    output = ROOT / "results/external"
    output.mkdir(parents=True, exist_ok=True)
    def persist(name, data):
        content = ("".join(canonical(row) + "\n" for row in data) if name.endswith(".jsonl")
                   else json.dumps(data, indent=2) + "\n")
        if args.check:
            assert (output / name).read_text() == content, f"{name} differs from rerun"
        else:
            (output / name).write_text(content)
        return hashlib.sha256(content.encode()).hexdigest()
    data_hashes = {name: persist(name, data) for name, data in [("tasks.jsonl", artifacts), ("cases.jsonl", cases),
                  ("assessments.jsonl", assessments), ("summary.json", summary), ("selection.json", {
                    "selected": [t["task_id"] for t in artifacts], "excluded": exclusions})]}
    files = sorted((upstream / "src/tau2").rglob("*.py")) + [upstream / "LICENSE", upstream / "pyproject.toml"]
    files += [upstream / "data/tau2/domains/retail" / name for name in ("db.json", "tasks.json", "split_tasks.json", "policy.md")]
    file_hash = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    manifest = {"protocol_version": 1, "upstream_url": "https://github.com/sierra-research/tau2-bench",
                "upstream_revision": REVISION, "upstream_files": {str(p.relative_to(upstream)): file_hash(p) for p in files},
                "sources": {p: file_hash(ROOT / p) for p in ("src/run_external.py", "src/score_assessments.mts", "src/metrics.mts", "FRAMEWORK_PROTOCOL.md", "external-requirements.txt")},
                "data_sha256": data_hashes, "network": "socket connections prohibited; dotenv disabled; no LLM calls"}
    persist("manifest.json", manifest)
    if not args.check:
        packages = sorted(f"{d.metadata['Name']}=={d.version}" for d in importlib.metadata.distributions()
                          if d.metadata['Name'].lower() not in ("tau2", "pip", "setuptools"))
        (output / "environment.json").write_text(json.dumps({"python": sys.version.split()[0], "packages": packages}, indent=2) + "\n")
        (output / "UPSTREAM_LICENSE").write_bytes((upstream / "LICENSE").read_bytes())
    print(json.dumps({"mode": "verified" if args.check else "written", **summary["design"]}, indent=2))


if __name__ == "__main__":
    main()
