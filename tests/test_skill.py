from agentid.skill import load_skill_contract, skill_capability_from_contract, validate_skill_contract


def test_validate_skill_guardrail_contract():
    contract = {
        "agentid_skill": {
            "id": "support-refund-workflow",
            "kind": "skill",
            "source": "./skills/support-refund-workflow",
            "version": "1.0.0",
            "hash": "sha256:test",
            "access": "execute",
            "auth_mode": "just_in_time",
            "approval": "human_confirm",
            "may_invoke": ["provider.billing.issue_credit"],
            "constraints": {"token_ttl_seconds": 300},
        }
    }

    result = validate_skill_contract(contract)

    assert result.ok


def test_skill_contract_can_be_root_capability():
    contract = {
        "id": "support-refund-workflow",
        "source": "./skills/support-refund-workflow",
        "hash": "sha256:test",
        "may_invoke": ["provider.billing.issue_credit"],
    }

    capability = skill_capability_from_contract(contract)

    assert capability["kind"] == "skill"
    assert capability["access"] == "execute"


def test_load_skill_contract_from_directory_agentid_yaml(tmp_path):
    skill_dir = tmp_path / "support-refund-workflow"
    skill_dir.mkdir()
    (skill_dir / "agentid.yaml").write_text(
        """
agentid_skill:
  id: support-refund-workflow
  source: ./skills/support-refund-workflow
  hash: sha256:test
  may_invoke:
    - provider.billing.issue_credit
""",
        encoding="utf-8",
    )

    contract = load_skill_contract(skill_dir)

    assert contract["agentid_skill"]["id"] == "support-refund-workflow"


def test_load_skill_contract_from_skill_md_frontmatter(tmp_path):
    skill_dir = tmp_path / "support-refund-workflow"
    skill_dir.mkdir()
    (skill_dir / "SKILL.md").write_text(
        """---
agentid_skill:
  id: support-refund-workflow
  source: ./skills/support-refund-workflow
  hash: sha256:test
  may_invoke:
    - provider.billing.issue_credit
---
# Support refund workflow
""",
        encoding="utf-8",
    )

    contract = load_skill_contract(skill_dir)

    assert contract["agentid_skill"]["id"] == "support-refund-workflow"
