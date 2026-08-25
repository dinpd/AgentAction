#!/usr/bin/env python3
"""Validate release metadata and extract notes for the tagged release."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
PYPROJECT = ROOT / "pyproject.toml"
PACKAGE_INIT = ROOT / "agentid" / "__init__.py"
CHANGELOG = ROOT / "CHANGELOG.md"

PROJECT_VERSION_RE = re.compile(
    r"^\[project\]\s*$.*?^version\s*=\s*\"([^\"]+)\"\s*$",
    re.MULTILINE | re.DOTALL,
)
PACKAGE_VERSION_RE = re.compile(r'^__version__\s*=\s*"([^"]+)"\s*$', re.MULTILINE)
CHANGELOG_RELEASE_RE = re.compile(
    r"^## (?P<version>\d+\.\d+\.\d+(?:-rc\.\d+)?) - (?P<date>\d{4}-\d{2}-\d{2})\s*$\n"
    r"(?P<body>.*?)(?=^## |\Z)",
    re.MULTILINE | re.DOTALL,
)
VERSION_RE = re.compile(r"^(?P<base>\d+\.\d+\.\d+)(?:rc(?P<rc>\d+))?$")


def read_version(path: Path, pattern: re.Pattern[str], label: str) -> str:
    match = pattern.search(path.read_text(encoding="utf-8"))
    if not match:
        raise ValueError(f"could not find {label} version in {path.relative_to(ROOT)}")
    return match.group(1)


def version_to_release(version: str) -> str:
    match = VERSION_RE.fullmatch(version)
    if not match:
        raise ValueError(f"unsupported project version: {version}")
    base = match.group("base")
    rc = match.group("rc")
    return f"{base}-rc.{rc}" if rc else base


def version_to_tag(version: str) -> str:
    return f"v{version_to_release(version)}"


def release_entry(changelog: str, release_version: str) -> tuple[str, str]:
    for match in CHANGELOG_RELEASE_RE.finditer(changelog):
        if match.group("version") == release_version:
            return match.group("date"), match.group("body").strip()
    raise ValueError(f"CHANGELOG.md has no dated {release_version} release entry")


def validate(tag: str | None = None) -> tuple[str, str, list[str]]:
    errors: list[str] = []
    try:
        project_version = read_version(PYPROJECT, PROJECT_VERSION_RE, "project")
        package_version = read_version(PACKAGE_INIT, PACKAGE_VERSION_RE, "package")
        release_version = version_to_release(project_version)
    except ValueError as error:
        return "", "", [str(error)]

    if package_version != project_version:
        errors.append(
            f"agentid/__init__.py version {package_version} does not match "
            f"pyproject.toml version {project_version}"
        )

    changelog = CHANGELOG.read_text(encoding="utf-8")
    if not changelog.startswith("# Changelog\n\n## Unreleased\n"):
        errors.append("CHANGELOG.md must begin with a fresh Unreleased section")

    release_matches = list(CHANGELOG_RELEASE_RE.finditer(changelog))
    if release_matches and release_matches[0].group("version") != release_version:
        errors.append(
            f"newest changelog release {release_matches[0].group('version')} does not "
            f"match project release {release_version}"
        )

    notes = ""
    try:
        _, notes = release_entry(changelog, release_version)
    except ValueError as error:
        errors.append(str(error))
    if not notes:
        errors.append(f"CHANGELOG.md release {release_version} has no notes")

    expected_tag = version_to_tag(project_version)
    if tag is not None and tag != expected_tag:
        errors.append(f"tag {tag} does not match project version tag {expected_tag}")

    return project_version, notes, errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag", help="Require the project version to match this Git tag")
    parser.add_argument("--notes-output", type=Path, help="Write release notes to this path")
    args = parser.parse_args()

    project_version, notes, errors = validate(args.tag)
    if errors:
        for error in errors:
            print(f"release metadata error: {error}", file=sys.stderr)
        return 1

    if args.notes_output:
        args.notes_output.write_text(f"{notes}\n", encoding="utf-8")
    print(f"release metadata valid for {version_to_tag(project_version)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
