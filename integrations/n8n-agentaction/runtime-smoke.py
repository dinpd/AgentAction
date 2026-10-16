"""Import and execute native workflows against local n8n and workerd runtimes.

Requires Node 24+, npm ci in this directory, and n8n 2.43.7 installed separately.
Only loopback ports and generated synthetic credentials are used.
"""

import argparse
import hashlib
import json
import os
import secrets
import shutil
import socket
import subprocess
import tempfile
import time
from http.cookiejar import CookieJar
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import HTTPCookieProcessor, Request, build_opener

ROOT = Path(__file__).resolve().parent


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def execution_data(value):
    # The native REST endpoint returns execution data encoded with flatted.
    if not isinstance(value, str):
        return value
    pool = json.loads(value)
    cache = {}

    def resolve(index):
        if index in cache:
            return cache[index]
        item = pool[index]
        if not isinstance(item, (dict, list)):
            return item
        result = {} if isinstance(item, dict) else []
        cache[index] = result

        def child(v):
            if isinstance(v, str):
                return resolve(int(v))
            if isinstance(v, list):
                return [child(x) for x in v]
            if isinstance(v, dict):
                return {k: child(x) for k, x in v.items()}
            return v

        if isinstance(item, dict):
            result.update({k: child(v) for k, v in item.items()})
        else:
            result.extend(child(v) for v in item)
        return result

    return resolve(0)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--n8n-bin", default=shutil.which("n8n"))
    parser.add_argument(
        "--keep-running",
        action="store_true",
        help="Keep the tested demo available locally",
    )
    parser.add_argument("--directory", type=Path)
    args = parser.parse_args()
    if not args.n8n_bin:
        parser.error("Install n8n 2.43.7 separately and supply --n8n-bin")
    installed_version = subprocess.check_output(
        [args.n8n_bin, "--version"], text=True
    ).strip()
    if installed_version != "2.43.7":
        parser.error("The acceptance harness requires the tested n8n version 2.43.7")
    directory = args.directory or Path(tempfile.mkdtemp(prefix="agentaction-n8n-"))
    if (directory / ".n8n").exists():
        parser.error("Use a fresh directory; existing n8n data is preserved")
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    directory.chmod(0o700)
    port, adapter_port, broker_port = free_port(), free_port(), free_port()
    origin, adapter = f"http://127.0.0.1:{port}", f"http://127.0.0.1:{adapter_port}"
    workflow_token, reviewer_token = (
        secrets.token_urlsafe(40),
        secrets.token_urlsafe(40),
    )
    owner = {
        "email": "demo@agentaction.example",
        "firstName": "AgentAction",
        "lastName": "Demo",
        "password": secrets.token_urlsafe(32) + "aA1!",
    }
    private = directory / "private-access.json"
    private.write_text(
        json.dumps(
            {
                "n8n_url": origin,
                "adapter_url": adapter,
                "owner": owner,
                "reviewer_token": reviewer_token,
            },
            indent=2,
        )
    )
    private.chmod(0o600)
    principals = [
        {
            "token_sha256": hashlib.sha256(token.encode()).hexdigest(),
            "tenant_id": "demo",
            "subject": subject,
            "agent_id": "support",
            "role": role,
        }
        for token, subject, role in [
            (workflow_token, "n8n", "recipe"),
            (reviewer_token, "human", "reviewer"),
        ]
    ]
    env = {
        **os.environ,
        "N8N_USER_FOLDER": str(directory),
        "N8N_LISTEN_ADDRESS": "127.0.0.1",
        "N8N_PORT": str(port),
        "N8N_RUNNERS_BROKER_PORT": str(broker_port),
        "N8N_DIAGNOSTICS_ENABLED": "false",
        "N8N_VERSION_NOTIFICATIONS_ENABLED": "false",
        "N8N_TEMPLATES_ENABLED": "false",
        "N8N_SECURE_COOKIE": "false",
        "N8N_UNVERIFIED_PACKAGES_ENABLED": "false",
        "N8N_COMMUNITY_PACKAGES_ENABLED": "false",
        "N8N_PERSONALIZATION_ENABLED": "false",
        "NODES_INCLUDE": json.dumps(
            [
                "n8n-nodes-base." + node
                for node in (
                    "manualTrigger",
                    "set",
                    "if",
                    "wait",
                    "httpRequest",
                    "stickyNote",
                )
            ]
        ),
    }
    processes, logs = [], []

    def start(command, log, **kwargs):
        stream = (directory / log).open("a")
        logs.append(stream)
        process = subprocess.Popen(
            command, stdout=stream, stderr=subprocess.STDOUT, **kwargs
        )
        processes.append(process)
        return process

    def start_n8n():
        return start([args.n8n_bin, "start"], "n8n.log", env=env)

    api = build_opener(HTTPCookieProcessor(CookieJar()))

    def call(base, path, method="GET", data=None, token=None):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        request = Request(
            base + path,
            method=method,
            headers=headers,
            data=None if data is None else json.dumps(data).encode(),
        )
        try:
            with api.open(request, timeout=40) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)

    def n8n(path, method="GET", data=None):
        status, response = call(origin, "/rest" + path, method, data)
        assert status < 300, f"n8n {method} {path}: HTTP {status}; logs in {directory}"
        return response.get("data", response)

    def wait_for(base, path, timeout=120):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                if call(base, path)[0] == 200:
                    return
            except (URLError, ConnectionError, TimeoutError, json.JSONDecodeError):
                pass
            time.sleep(0.5)
        raise AssertionError(f"Runtime startup failed; logs in {directory}")

    def stop(process):
        process.terminate()
        try:
            process.wait(timeout=25)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()

    try:
        start(
            [
                str(ROOT / "node_modules/.bin/wrangler"),
                "dev",
                "--local",
                "--ip",
                "127.0.0.1",
                "--port",
                str(adapter_port),
                "--persist-to",
                str(directory / "worker-state"),
                "--var",
                "N8N_CLIENTS_JSON:" + json.dumps(principals),
            ],
            "worker.log",
            cwd=ROOT,
        )
        server = start_n8n()
        wait_for(adapter, "/health")
        wait_for(origin, "/rest/settings")
        n8n("/owner/setup", "POST", owner)
        credential = n8n(
            "/credentials",
            "POST",
            {
                "name": "AgentAction workflow token",
                "type": "httpHeaderAuth",
                "data": {"name": "Authorization", "value": "Bearer " + workflow_token},
            },
        )

        def import_workflow(mode, request_id, amount=4900, deadline_ms=1800000):
            workflow = json.loads((ROOT / "workflows" / f"{mode}.json").read_text())
            for node in workflow["nodes"]:
                if node["name"] == "Refund inputs":
                    values = {
                        "adapter_url": adapter,
                        "request_id": request_id,
                        "payment_id": "pi_demo_001",
                        "amount_cents": amount,
                        "currency": "USD",
                        "reason": "duplicate_charge",
                    }
                    fields = [
                        json.dumps(key) + ":" + json.dumps(value)
                        for key, value in values.items()
                    ]
                    fields.append('"poll_deadline": Date.now() + ' + str(deadline_ms))
                    node["parameters"]["jsonOutput"] = (
                        "={{ JSON.stringify({" + ",".join(fields) + "}) }}"
                    )
                if node["type"] == "n8n-nodes-base.httpRequest":
                    node["credentials"] = {
                        "httpHeaderAuth": {
                            "id": credential["id"],
                            "name": credential["name"],
                        }
                    }
            workflow.pop("active")
            return n8n("/workflows", "POST", workflow)

        def run(workflow):
            result = n8n(
                f"/workflows/{workflow['id']}/run",
                "POST",
                {"triggerToStartFrom": {"name": "Run demo"}},
            )
            assert result.get("executionId"), result
            return result["executionId"]

        def execution(execution_id):
            return n8n(f"/executions/{execution_id}")

        def wait_execution(execution_id, expected, timeout=120):
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                result = execution(execution_id)
                if result["status"] == expected:
                    return result
                assert result["status"] not in ("error", "crashed", "canceled"), (
                    f"Execution {execution_id} failed; logs in {directory}"
                )
                time.sleep(0.5)
            raise AssertionError(
                f"Execution {execution_id} did not reach {expected}; logs in {directory}"
            )

        def outcome(execution_id):
            result = wait_execution(execution_id, "success")
            return execution_data(result["data"])["resultData"]["runData"][
                "Refund outcome"
            ][-1]["data"]["main"][0][0]["json"]

        automatic = import_workflow("automatic", "native-auto-001")
        success_id = run(automatic)
        success = outcome(success_id)
        assert (
            success["qualified_success"]
            and success["mutation_count"] == 1
            and success["approval_id"] == ""
        )
        assert success["evidence"]["observation"]["issuer"] == "n8n-mock-provider"
        assert success["evidence"]["correlations"] == [
            {"workflow_id": automatic["id"], "execution_id": str(success_id)}
        ]
        assert (
            success["evidence"]["finalization"]["snapshot"]["evidence"]["job"][
                "n8n_correlations"
            ]
            == success["evidence"]["correlations"]
        )
        replay_id = run(automatic)
        replay = outcome(replay_id)
        assert (
            replay["replayed"]
            and replay["refund_id"] == success["refund_id"]
            and replay["mutation_count"] == 1
        )
        denied_id = run(import_workflow("automatic", "native-cap-001", 10100))
        denied = outcome(denied_id)
        assert (
            denied["status"] == "denied"
            and denied["mutation_count"] == 0
            and not denied["qualified_success"]
        )
        print("Native automatic success, replay and policy denial passed.", flush=True)
        human = import_workflow("human-review", "native-review-001")
        review_id = run(human)
        waiting = wait_execution(review_id, "waiting")
        assert waiting.get("waitTill")
        status, pending = call(
            adapter, "/requests/native-review-001", token=workflow_token
        )
        assert (
            status == 200
            and pending["status"] == "pending"
            and pending["mutation_count"] == 0
        )
        decision = {
            "scope_digest": pending["scope_digest"],
            "decision_reason": "Automated native-runtime acceptance fixture",
        }
        assert (
            call(
                adapter,
                "/requests/native-review-001/approve",
                "POST",
                decision,
                workflow_token,
            )[0]
            == 403
        )
        # Stop the process while the 70-second Wait is persisted. Resume after restart.
        stop(server)
        status, approved = call(
            adapter,
            "/requests/native-review-001/approve",
            "POST",
            decision,
            reviewer_token,
        )
        assert (
            status == 200
            and approved["qualified_success"]
            and approved["mutation_count"] == 1
        )
        server = start_n8n()
        wait_for(origin, "/rest/settings")
        reviewed = outcome(review_id)
        assert (
            reviewed["qualified_success"]
            and reviewed["mutation_count"] == 1
            and reviewed["authorization_mode"] == "human"
        )
        print(
            "Native human review persisted across n8n restart and resumed successfully.",
            flush=True,
        )
        timeout_id = run(
            import_workflow("human-review", "native-timeout-001", deadline_ms=-1)
        )
        timed_out = outcome(timeout_id)
        assert (
            timed_out["status"] == "pending"
            and timed_out["polling_timed_out"]
            and not timed_out["qualified_success"]
            and timed_out["mutation_count"] == 0
        )
        report = {
            "passed": True,
            "n8n_version": installed_version,
            "n8n_url": origin,
            "adapter_url": adapter,
            "workflow_ids": {"automatic": automatic["id"], "human_review": human["id"]},
            "executions": {
                "success": success_id,
                "replay": replay_id,
                "denied": denied_id,
                "review_restart": review_id,
                "poll_timeout": timeout_id,
            },
            "refund_id": success["refund_id"],
            "mutation_count": 1,
            "signed_observation": True,
            "durable_restart": True,
        }
        report_path = directory / "validation.json"
        report_path.write_text(json.dumps(report, indent=2))
        print(json.dumps(report), flush=True)
        print(f"Private local login/reviewer credentials: {private}", flush=True)
        if args.keep_running:
            print(
                "Local demo is running. Stop this process to shut it down.", flush=True
            )
            while True:
                time.sleep(1)
    finally:
        for process in reversed(processes):
            if process.poll() is None:
                stop(process)
        for stream in logs:
            stream.close()


if __name__ == "__main__":
    main()
