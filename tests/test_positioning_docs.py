from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
README = (ROOT / "README.md").read_text(encoding="utf-8")
POSITIONING = (ROOT / "docs" / "positioning.md").read_text(encoding="utf-8")
ROADMAP = (ROOT / "docs" / "action-gate-roadmap.md").read_text(encoding="utf-8")
INTEROPERABILITY = (ROOT / "docs" / "interoperability-positioning.md").read_text(
    encoding="utf-8"
)
STANDARDS = (ROOT / "docs" / "standards-alignment.md").read_text(encoding="utf-8")
WEBSITE_PAGE = (ROOT / "website" / "app" / "page.tsx").read_text(encoding="utf-8")
PYPROJECT = (ROOT / "pyproject.toml").read_text(encoding="utf-8")
ACTION = (ROOT / "action.yml").read_text(encoding="utf-8")
WORKFLOW = (ROOT / ".github" / "workflows" / "agentaction-check.yml").read_text(
    encoding="utf-8"
)

CATEGORY = "Trust infrastructure for autonomous AI agents."
PROMISE = (
    "AgentAction evaluates decisions, enforces policy, authorizes actions, and\n"
    "> preserves verifiable evidence from intent through execution and continuous\n"
    "> evaluation."
)
CONTROL_SURFACES = [
    "Agent Evaluation",
    "Decision Assurance",
    "Action Authorization",
]
LIFECYCLE_FLOW = (
    "Intent -> decision assurance -> policy enforcement -> action authorization\n"
    "       -> execution -> evidence -> continuous evaluation"
)
ACTION_GATE_FLOW = (
    "Agent proposes tool call -> AgentAction checks policy + state -> "
    "allow / deny / challenge"
)
AAM_URL = "https://blog.cloudflare.com/the-agent-access-model/"


def test_readme_leads_with_trust_lifecycle_and_preserves_action_gate_wedge():
    assert README.startswith(f"# AgentAction\n\n**{CATEGORY}**")
    assert PROMISE in README
    assert "[AgentAction.dev](https://agentaction.dev/)" in README
    assert "[Project Positioning](docs/positioning.md)" in README

    assert LIFECYCLE_FLOW in README
    assert README.index(LIFECYCLE_FLOW) < README.index("## Try AgentAction")

    action_heading = README.index("### Action Authorization")
    assert action_heading < README.index(ACTION_GATE_FLOW)


def test_readme_prefers_passive_mcp_observation_for_onboarding():
    quick_start = README[
        README.index("## Quick Start") : README.index("## How It Works")
    ]
    observe_heading = "### Recommended: Observe An MCP Workflow"
    embed_heading = "### Alternative: Embed The Guard"

    assert observe_heading in quick_start
    assert embed_heading in quick_start
    assert quick_start.index(observe_heading) < quick_start.index(embed_heading)
    assert "npm run demo:observe" in quick_start
    assert (
        "MCP client -> customer-run observer adapter -> downstream MCP server"
        in quick_start
    )
    assert 'set `"mode": "observe"`' in quick_start
    assert "process-local shadow state" in quick_start
    assert "not yet a production-complete MCP gateway" in quick_start
    assert (
        "[observe-mode configuration, transition to enforcement, and limitations]"
        "(mcp-gateway-adapter/#observe-before-enforce)"
        in quick_start
    )
    assert "recommended passive observer quick start" in README
    assert "Passive observe and fail-closed enforce modes" in README


def test_canonical_positioning_defines_brand_lifecycle_and_control_surfaces():
    assert f"**{CATEGORY}**" in POSITIONING
    assert PROMISE in POSITIONING
    assert "AgentAction is the canonical project and product brand" in POSITIONING
    for heading in [
        "## Brand And Category",
        "## Trust Lifecycle",
        "## Platform Control Surfaces",
        "## Capability Story",
        "## Audience Entry Points",
        "## Standards And Open-Source Strategy",
        "## What AgentAction Is Not",
        "## Messaging Guardrails",
    ]:
        assert heading in POSITIONING
    for surface in CONTROL_SURFACES:
        assert surface in README
        assert surface in POSITIONING
    assert LIFECYCLE_FLOW in POSITIONING
    assert ACTION_GATE_FLOW in POSITIONING
    assert re.search(r"not the whole project\s+scope", POSITIONING)


def test_repository_positioning_matches_agentaction_website():
    assert "Trust infrastructure for autonomous AI agents" in WEBSITE_PAGE
    assert "trust layer between autonomous agents and" in WEBSITE_PAGE
    for surface in CONTROL_SURFACES:
        assert surface in WEBSITE_PAGE
    for label in [
        "Declare intent",
        "Assure the decision",
        "Enforce policy",
        "Execute",
        "Preserve evidence",
        "Evaluate continuously",
    ]:
        assert label in WEBSITE_PAGE
    assert "without inspecting hidden chain-of-thought" in README
    assert "without inspecting hidden chain-of-thought" in WEBSITE_PAGE


def test_action_gate_roadmap_is_scoped_within_the_platform():
    assert "[Project Positioning](positioning.md)" in ROADMAP
    assert PROMISE in ROADMAP
    assert "current enforcement wedge" in ROADMAP
    assert "broader category of\ntrust infrastructure for autonomous AI agents" in ROADMAP
    assert "## Action-Gate Capability Stack" in ROADMAP
    for layer in [
        "Runtime authorization and control",
        "Portable provider trust and interoperability",
        "Execution and outcome assurance",
    ]:
        assert layer in ROADMAP
    assert "not a competing project-level hierarchy" in ROADMAP


def test_aam_reference_is_visible_and_preserves_agentaction_boundaries():
    assert AAM_URL in README
    assert AAM_URL in ROADMAP
    assert "implements the action-control and evidence layers" in README
    assert re.search(
        r"integrating with external identity brokers and network\s+enforcement",
        README,
    )
    assert "does not claim to implement the complete AAM architecture" in ROADMAP
    assert "network enforcement remains an independent enforcement point" in ROADMAP


def test_roadmap_prioritizes_monotonic_capability_state_before_distribution():
    headings = [
        "#### P4: Provider Trust Gate",
        "#### P5: Monotonic Task Capability State And Protected-Result Release",
        "#### P6: Framework And Workflow Distribution",
        "#### P7: Downstream Agent Attribution",
    ]
    positions = [ROADMAP.index(heading) for heading in headings]
    assert positions == sorted(positions)
    for issue_number in [78, 79, 80, 81, 82, 83]:
        assert f"https://github.com/dinpd/AgentAction/issues/{issue_number}" in ROADMAP
    assert "Ordinary approval cannot restore a" in ROADMAP
    assert "A parallel call under the prior state version is denied" in ROADMAP


def test_interoperability_standards_and_metadata_preserve_scoped_boundaries():
    assert "open ecosystem strategy for AgentAction" in INTEROPERABILITY
    assert "[Project Positioning](positioning.md)" in INTEROPERABILITY
    assert "Action Authorization control surface" in INTEROPERABILITY
    assert "trust infrastructure for autonomous AI\nagents" in STANDARDS
    assert "Within that broader\nlifecycle, AgentAction standards work" in STANDARDS
    assert "Within this standards track, the primary job" in STANDARDS
    assert (
        'description = "Trust infrastructure for autonomous AI agents: decision '
        'assurance, action authorization, runtime controls, and verifiable lifecycle '
        'evidence."'
    ) in PYPROJECT


def test_agentaction_is_canonical_and_legacy_cli_aliases_remain_available():
    assert 'name = "agentaction-dev"' in PYPROJECT
    assert 'agentaction = "agentid.cli:main"' in PYPROJECT
    assert 'agentpass = "agentid.cli:main"' in PYPROJECT
    assert 'agentid = "agentid.cli:main"' in PYPROJECT
    assert "agentaction validate" in README
    assert "`agentaction` is the primary CLI" in README
    assert "# AgentAction" in README
    assert "# AgentPass" not in README


def test_agentaction_brand_is_canonical_in_package_and_action_metadata():
    assert '\nname = "agentaction-dev"\n' in PYPROJECT
    assert 'authors = [{ name = "AgentAction contributors" }]' in PYPROJECT

    package_names = {
        json.loads((ROOT / path).read_text(encoding="utf-8"))["name"]
        for path in [
            "packages/openclaw/package.json",
            "packages/provider-express/package.json",
            "sdk/typescript/package.json",
            "mcp-gateway-adapter/package.json",
        ]
    }
    assert package_names == {
        "@agentaction/openclaw",
        "@agentaction/provider-express",
        "@agentaction/client",
        "@agentaction/mcp-gateway-adapter",
    }
    assert ACTION.startswith("name: AgentAction Manifest Check\n")
    assert WORKFLOW.startswith("name: AgentAction Check\n")
    assert "https://github.com/dinpd/AgentAction" in README


def test_changed_positioning_documents_have_valid_local_links():
    documents = [
        ROOT / "README.md",
        ROOT / "docs" / "positioning.md",
        ROOT / "docs" / "interoperability-positioning.md",
        ROOT / "docs" / "standards-alignment.md",
    ]
    for document in documents:
        text = document.read_text(encoding="utf-8")
        for link in re.findall(r"!?\[[^\]]*\]\(([^)]+)\)", text):
            path = link.split("#", 1)[0]
            if not path or "://" in path or path.startswith("mailto:"):
                continue
            assert (document.parent / path).exists(), f"broken link in {document}: {link}"
