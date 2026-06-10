from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from agentid.manifest import ValidationResult, validate_manifest


SKILL_CONTRACT_FILENAMES = ("agentid.yaml", "agentid.skill.yaml")


class SkillContractError(Exception):
    """Raised when a skill authority contract cannot be loaded or parsed."""


def load_skill_contract(path: str | Path) -> dict[str, Any]:
    skill_path = Path(path)
    if skill_path.is_dir():
        for filename in SKILL_CONTRACT_FILENAMES:
            contract_path = skill_path / filename
            if contract_path.exists():
                return _load_yaml_file(contract_path)
        skill_md = skill_path / "SKILL.md"
        if skill_md.exists():
            return _load_skill_md_frontmatter(skill_md)
        raise SkillContractError(
            f"Skill contract not found in {skill_path}. Expected agentid.yaml, agentid.skill.yaml, or SKILL.md frontmatter."
        )

    if not skill_path.exists():
        raise SkillContractError(f"Skill contract not found: {skill_path}")

    if skill_path.name == "SKILL.md":
        return _load_skill_md_frontmatter(skill_path)
    return _load_yaml_file(skill_path)


def validate_skill_contract(contract: dict[str, Any]) -> ValidationResult:
    capability = skill_capability_from_contract(contract)
    if not capability:
        return ValidationResult(
            ok=False,
            errors=["Skill contract must include agentid_skill, capability, or a root skill capability."],
            warnings=[],
        )

    jit_enabled = capability.get("auth_mode") == "just_in_time"
    manifest = {
        "agent": {
            "id": "skill-contract-validator",
            "name": "Skill Contract Validator",
            "owner": "agentid",
            "environment": "validation",
            "purpose": "Validate a skill-local AgentPass authority contract.",
        },
        "jit_authorization": {
            "enabled": jit_enabled,
            "default_ttl_seconds": 300,
            "bind_token_to": ["agent_id", "user_id", "skill_id", "tool", "action", "resource", "approval_id"],
            "revoke_after_use": True,
        },
        "capabilities": [capability],
    }
    result = validate_manifest(manifest)
    return ValidationResult(
        ok=result.ok,
        errors=result.errors,
        warnings=[
            warning
            for warning in result.warnings
            if warning.startswith("capabilities[0]") or warning.startswith("jit_authorization")
        ],
    )


def skill_capability_from_contract(contract: dict[str, Any]) -> dict[str, Any] | None:
    candidate = contract.get("agentid_skill") or contract.get("capability")
    if candidate is None and any(field in contract for field in ("id", "kind", "access")):
        candidate = contract
    if not isinstance(candidate, dict):
        return None

    capability = dict(candidate)
    capability.setdefault("kind", "skill")
    capability.setdefault("access", "execute")
    return capability


def _load_yaml_file(path: Path) -> dict[str, Any]:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as exc:
        raise SkillContractError(f"Invalid YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise SkillContractError("Skill contract root must be a mapping/object.")
    return data


def _load_skill_md_frontmatter(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise SkillContractError(f"SKILL.md has no YAML frontmatter: {path}")
    _, rest = text.split("---\n", 1)
    if "---\n" not in rest:
        raise SkillContractError(f"SKILL.md frontmatter is not terminated: {path}")
    frontmatter, _body = rest.split("---\n", 1)
    try:
        data = yaml.safe_load(frontmatter) or {}
    except yaml.YAMLError as exc:
        raise SkillContractError(f"Invalid SKILL.md frontmatter YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise SkillContractError("SKILL.md frontmatter must be a mapping/object.")
    return data
