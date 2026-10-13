from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "check_release.py"
SPEC = importlib.util.spec_from_file_location("check_release", SCRIPT)
assert SPEC and SPEC.loader
check_release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(check_release)


def test_release_metadata_is_consistent():
    project_version, notes, errors = check_release.validate()

    assert check_release.version_to_tag(project_version).startswith("v")
    assert not errors
    assert notes.strip()


def test_release_versions_map_to_expected_tags():
    assert check_release.version_to_tag("0.3.0") == "v0.3.0"
    assert check_release.version_to_tag("0.4.0rc2") == "v0.4.0-rc.2"


def test_feature_releases_require_reviewed_public_highlights():
    notes = "### Added\n\n- Technical feature."
    assert check_release.validate_website_highlight("0.51.0-rc.1", notes)
    assert not check_release.validate_website_highlight("0.51.1", notes)
    assert not check_release.validate_website_highlight("0.51.0", "### Fixed\n\n- Maintenance.")
    public = "### Website highlight\n\n- A public feature: What you can now do. Preview only.\n\n" + notes
    assert not check_release.validate_website_highlight("0.51.0-rc.1", public)
    assert check_release.validate_website_highlight("0.51.0", public + "\n\n### Website highlight\n\n- Duplicate: Copy.")
    assert check_release.validate_website_highlight("0.51.0", public.replace("What you can now do.", "x" * 231))
    assert check_release.validate_website_highlight("0.51.0", public.replace("A public feature", "x" * 91))
    assert check_release.validate_website_highlight("0.51.0", public.replace("A public feature", "<b>Feature</b>"))
