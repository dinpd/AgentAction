import json

from agentid.cli import main
from agentid.openclaw import OpenClawDoctorCheck, OpenClawDoctorResult, format_openclaw_doctor, openclaw_doctor_to_dict


def test_format_openclaw_doctor_success():
    result = OpenClawDoctorResult(
        ok=True,
        demo="budget",
        checks=[
            OpenClawDoctorCheck("manifest", True, "manifest is valid"),
            OpenClawDoctorCheck("budget-demo", True, "repeatedReads=[allow, allow, challenge_required], oversizedContext=deny"),
        ],
        budget_result={"outcome": "passed"},
    )

    output = format_openclaw_doctor(result)

    assert "AgentAction OpenClaw budget doctor" in output
    assert "[ok] manifest: manifest is valid" in output
    assert "Budget demo passed" in output
    assert "Full heartbeat/prompt-context enforcement still needs" in output


def test_openclaw_doctor_to_dict():
    result = OpenClawDoctorResult(
        ok=False,
        demo="budget",
        checks=[OpenClawDoctorCheck("openclaw-adapter-build", False, "missing build")],
        budget_result=None,
    )

    payload = openclaw_doctor_to_dict(result)

    assert payload["ok"] is False
    assert payload["demo"] == "budget"
    assert payload["checks"][0]["name"] == "openclaw-adapter-build"


def test_cli_openclaw_doctor_json(monkeypatch, capsys):
    def fake_doctor(**kwargs):
        assert kwargs["root"] == "/tmp/agentpass"
        assert kwargs["build"] is True
        return OpenClawDoctorResult(
            ok=True,
            demo="budget",
            checks=[OpenClawDoctorCheck("budget-demo", True, "passed")],
            budget_result={"outcome": "passed"},
        )

    monkeypatch.setattr("agentid.cli.run_openclaw_budget_doctor", fake_doctor)

    code = main(["openclaw", "doctor", "--demo", "budget", "--root", "/tmp/agentpass", "--build", "--json"])
    payload = json.loads(capsys.readouterr().out)

    assert code == 0
    assert payload["ok"] is True
    assert payload["checks"][0]["name"] == "budget-demo"


def test_cli_openclaw_doctor_failure(monkeypatch, capsys):
    def fake_doctor(**kwargs):
        return OpenClawDoctorResult(
            ok=False,
            demo="budget",
            checks=[OpenClawDoctorCheck("budget-demo", False, "failed")],
            budget_result=None,
        )

    monkeypatch.setattr("agentid.cli.run_openclaw_budget_doctor", fake_doctor)

    code = main(["openclaw", "doctor"])
    output = capsys.readouterr().out

    assert code == 1
    assert "[fail] budget-demo: failed" in output
