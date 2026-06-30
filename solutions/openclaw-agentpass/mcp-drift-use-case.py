#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "solutions" / "openclaw-agentpass" / "fixtures"
sys.path.insert(0, str(ROOT))

from agentid.mcp import check_tools, diff_to_dict, load_tools_list  # noqa: E402


def main() -> int:
    approved = load_tools_list(FIXTURES / "mcp-tools-approved.json")
    drifted = load_tools_list(FIXTURES / "mcp-tools-drifted.json")

    baseline = check_tools(approved, max_risk="high")
    drift = check_tools(drifted, max_risk="high", before_tools=approved, fail_on_drift=True)

    if not baseline.ok:
        raise SystemExit(f"expected approved MCP surface to pass, got: {baseline.findings}")
    if drift.ok:
        raise SystemExit("expected drifted MCP surface to fail")

    expected_fragments = [
        "new tools exposed",
        "new high-risk tool: github.repo.delete",
        "tool schemas or descriptions changed",
        "tool risk increased: github.pr.list_comments",
    ]
    missing = [
        fragment
        for fragment in expected_fragments
        if not any(fragment in finding for finding in drift.findings)
    ]
    if missing:
        raise SystemExit(f"missing expected drift findings {missing}; got: {drift.findings}")

    print(
        json.dumps(
            {
                "useCase": "mcp-drift-gate",
                "outcome": "passed",
                "baseline": {
                    "ok": baseline.ok,
                    "toolCount": baseline.analysis.tool_count,
                    "risk": baseline.analysis.risk_label,
                },
                "drifted": {
                    "ok": drift.ok,
                    "risk": drift.analysis.risk_label,
                    "findings": drift.findings,
                    "diff": diff_to_dict(drift.diff) if drift.diff else None,
                },
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
