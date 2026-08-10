from __future__ import annotations

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
PYPROJECT = (ROOT / "pyproject.toml").read_text(encoding="utf-8")

CATEGORY = "Action authorization and execution assurance for AI agents."
PROMISE = (
    "AgentPass controls consequential AI agent actions and produces independently\n"
    "> verifiable evidence of what was authorized and executed."
)
LAYERS = [
    "Runtime authorization and control",
    "Portable provider trust and interoperability",
    "Execution and outcome assurance",
]
AAM_URL = "https://blog.cloudflare.com/the-agent-access-model/"


def test_readme_leads_with_product_category_and_canonical_positioning():
    assert README.startswith(f"# AgentPass\n\n**{CATEGORY}**")
    assert PROMISE in README
    assert "[Project Positioning](docs/positioning.md)" in README
    assert (
        "conformance work demonstrates interoperability; it is not the product category"
        in README
    )
    assert (ROOT / "docs" / "positioning.md").is_file()


def test_canonical_positioning_contains_required_hierarchy_and_boundaries():
    assert f"**{CATEGORY}**" in POSITIONING
    assert PROMISE in POSITIONING
    for heading in [
        "## Product Hierarchy",
        "## Capability Story",
        "## Audience Entry Points",
        "## Standards And Open-Source Strategy",
        "## What AgentPass Is Not",
        "## Messaging Guardrails",
    ]:
        assert heading in POSITIONING
    for audience in [
        "Enterprise and security teams",
        "Agent and application developers",
        "MCP gateway and platform builders",
        "SaaS, API, and MCP providers",
        "Standards and open-source communities",
    ]:
        assert audience in POSITIONING
    assert "Conformance is how AgentPass proves portability" in POSITIONING
    assert "not certification by an external standards body" in POSITIONING


def test_readme_and_roadmap_share_the_three_product_layers():
    assert "[Project Positioning](positioning.md)" in ROADMAP
    for layer in LAYERS:
        assert layer in README
        assert layer in ROADMAP
        assert layer.title() in POSITIONING
    assert "Framework wrappers and conformance suites are delivery mechanisms" in README
    assert "They advance these layers rather than forming separate product" in ROADMAP


def test_aam_reference_is_visible_and_preserves_agentpass_boundaries():
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
        assert f"https://github.com/dinpd/AgentPass/issues/{issue_number}" in ROADMAP
    assert "Ordinary approval cannot restore a" in ROADMAP
    assert "A parallel call under the prior state version is denied" in ROADMAP


def test_interoperability_and_package_metadata_support_product_positioning():
    assert "open ecosystem strategy" in INTEROPERABILITY
    assert "[Project Positioning](positioning.md)" in INTEROPERABILITY
    assert (
        "AgentPass's product category is action authorization and execution assurance"
        in STANDARDS
    )
    assert "Within its standards work" in STANDARDS
    assert (
        'description = "Action authorization, runtime controls, and independently '
        'verifiable execution evidence for AI agent tool calls."'
    ) in PYPROJECT


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
