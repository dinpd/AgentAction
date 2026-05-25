from __future__ import annotations

import argparse
import glob
import sys
from pathlib import Path

from agentid.manifest import ManifestError, load_manifest, validate_manifest
from agentid.risk import risk_label, risk_score


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate AgentID manifests and enforce a risk threshold.")
    parser.add_argument("patterns", nargs="+", help="Manifest paths or glob patterns.")
    parser.add_argument("--max-risk", type=int, default=100)
    args = parser.parse_args(argv)

    paths = _expand_paths(args.patterns)
    if not paths:
        print("ERROR: no manifest files matched.", file=sys.stderr)
        return 2

    failed = False
    for path in paths:
        try:
            manifest = load_manifest(path)
        except ManifestError as exc:
            print(f"::error file={path}::{exc}")
            failed = True
            continue

        result = validate_manifest(manifest)
        score, reasons = risk_score(manifest)
        print(f"{path}: risk {score}/100 ({risk_label(score)})")

        for warning in result.warnings:
            print(f"::warning file={path}::{warning}")
        for error in result.errors:
            print(f"::error file={path}::{error}")
        if reasons:
            print("  risk reasons: " + "; ".join(reasons))

        if not result.ok:
            failed = True
        if score > args.max_risk:
            print(f"::error file={path}::Risk score {score} exceeds max-risk {args.max_risk}.")
            failed = True

    return 1 if failed else 0


def _expand_paths(patterns: list[str]) -> list[Path]:
    paths: list[Path] = []
    for pattern in patterns:
        matches = glob.glob(pattern, recursive=True)
        if matches:
            paths.extend(Path(match) for match in matches)
        else:
            paths.append(Path(pattern))
    return sorted({path for path in paths if path.is_file()})


if __name__ == "__main__":
    raise SystemExit(main())
