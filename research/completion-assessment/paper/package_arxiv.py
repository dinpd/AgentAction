"""Build/check a minimal, deterministic arXiv source ZIP and matching metadata."""
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import zipfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = ROOT / "output/arxiv"
ARCHIVE = "agent-task-completion-arxiv-source.zip"
LICENSES = {
    None: "Pending author selection; choose in the arXiv form before submission.",
    "CC-BY-4.0": "CC BY 4.0 (Creative Commons Attribution 4.0 International)",
    "arXiv-nonexclusive": "arXiv.org perpetual, non-exclusive license 1.0",
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def outputs():
    source = (HERE / "manuscript.tex").read_bytes()
    tex = source.decode()
    manuscript = (HERE / "manuscript.md").read_text()
    settings = json.loads((HERE / "submission.json").read_text())
    title = manuscript.splitlines()[0].removeprefix("# ")
    abstract = manuscript.split("## Abstract\n\n", 1)[1].split("\n\n## ", 1)[0].strip()
    assert title.isascii() and abstract.isascii() and 0 < len(abstract) <= 1920
    assert r"\title{" + title + "}" in tex
    assert r"\author{Dan Itkis, MsETM\\AgentAction.dev}" in tex
    tex_abstract = tex.split(r"\section*{Abstract}", 1)[1].split(r"\section{", 1)[0].strip().replace(r"\%", "%")
    assert tex_abstract == abstract, "Metadata and TeX abstracts differ"
    for content in (tex, manuscript):
        assert "research draft" not in content.lower() and "accessed on" not in content.lower()
        assert "the human author must review and take responsibility" not in content.lower()
        assert not re.search(r"\{\{.*?\}\}|/Users/|/private/tmp/|BEGIN (?:RSA )?PRIVATE KEY", content)
    assert settings["authors"] == "Dan Itkis (AgentAction.dev)"
    assert settings["primary_category"] == "cs.AI" and settings["cross_list"] == ["cs.SE"]
    assert settings["processor"] == "xelatex" and settings["tex_live"] == "2025"
    assert settings["license"] in LICENSES
    # Inline bibliography: no .bib/.bbl or input files are needed to compile.
    assert not re.search(r"\\(?:input|include|bibliography|bibliographystyle)\s*\{", tex)
    refs = re.findall(r"\\bibitem\{([^}]+)\}", tex)
    cites = {key for group in re.findall(r"\\cite\{([^}]+)\}", tex) for key in group.split(",")}
    assert len(refs) == len(set(refs)) == 18 and cites == set(refs)
    figures = re.findall(r"\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}", tex)
    assert len(figures) == len(set(figures)) == 4
    files = {"main.tex": source}
    for name in figures:
        path = PurePosixPath(name)
        assert len(path.parts) == 2 and path.parts[0] == "figures" and path.suffix == ".pdf"
        assert all(re.fullmatch(r"[a-zA-Z0-9_.-]+", part) and not part.startswith(".") for part in path.parts)
        local = HERE / name
        assert not local.is_symlink() and local.resolve().parent == (HERE / "figures").resolve()
        files[name] = local.read_bytes()
        assert files[name].startswith(b"%PDF-")
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_STORED) as out:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            out.writestr(info, data)
    zipped = archive.getvalue()
    with zipfile.ZipFile(io.BytesIO(zipped)) as check:
        assert check.testzip() is None and set(check.namelist()) == set(files)
        assert all(check.read(name) == data for name, data in files.items())
    refs_json = json.loads((HERE / "references.json").read_text())
    artifact = next(r["url"] for r in refs_json if r["id"] == "artifact")
    assert re.search(r"/tree/[0-9a-f]{40}/research/completion-assessment$", artifact)
    metadata = {
        "title": title, "authors": settings["authors"], "manuscript_byline": "Dan Itkis, MsETM",
        "affiliation": "AgentAction.dev", "abstract": abstract, "abstract_characters": len(abstract),
        "primary_category_recommendation": settings["primary_category"],
        "cross_list_recommendation": settings["cross_list"],
        "comments": f"{settings['pages']} pages, 4 figures, 10 tables. Reproducible code and data: {artifact}",
        "journal_reference": "", "doi": "", "report_number": "",
        "license": settings["license"], "license_label": LICENSES[settings["license"]],
        "main_file": "main.tex", "processor": settings["processor"], "tex_live": settings["tex_live"],
        "status": "Prepared locally; not uploaded or submitted to arXiv.",
    }
    json_bytes = lambda value: (json.dumps(value, indent=2, ensure_ascii=True) + "\n").encode()
    metadata_data = json_bytes(metadata)
    manifest = {
        "schema_version": 1, "archive": ARCHIVE, "archive_sha256": digest(zipped), "archive_bytes": len(zipped),
        "files": {name: {"bytes": len(data), "sha256": digest(data)} for name, data in sorted(files.items())},
        "metadata_sha256": digest(metadata_data), "experiment_artifact": artifact,
        "bibliography": "18 entries embedded in main.tex; no external bibliography dependency",
    }
    guide = f"""# arXiv submission fields and upload steps

Files are prepared locally. No arXiv upload, account check or submission has been performed.

## Files to use

- Upload `{ARCHIVE}`. It contains `main.tex` and four required PDF figures.
- The bibliography is embedded in `main.tex`; no `.bib` or `.bbl` file is needed.
- `../pdf/agent-task-completion-arxiv.pdf` is the preview compiled from the extracted ZIP.
- Keep this guide, metadata, preview PDF and manifest outside the source upload.
- Code and experimental data are linked through the pinned artifact citation.

## Copyable form fields

**Title**

{title}

**Authors**

{settings['authors']}

The manuscript byline is **Dan Itkis, MsETM**, with AgentAction.dev below it.
arXiv's searchable Authors field excludes degree suffixes, so the form value
above deliberately follows its metadata format. [Author-field rules](https://info.arxiv.org/help/prep.html)

**Abstract** ({len(abstract)} characters; limit 1,920)

{abstract}

**Primary category recommendation:** cs.AI (Artificial Intelligence).
**Cross-list recommendation:** cs.SE (Software Engineering).
The central application is agent completion assessment; its executable testing
protocol and metrics also fit software engineering. These are recommendations
based on the [category descriptions](https://arxiv.org/category_taxonomy).

**Comments**

{metadata['comments']}

Leave journal reference, DOI and report number blank: none is claimed for this preprint.

**License:** {metadata['license_label']}

This is a submission preference, not a record of a license selected on arXiv.
See [arXiv's license choices](https://info.arxiv.org/help/license/index.html).

## Upload sequence

1. Sign in to arXiv and start a new submission. Select the category; complete
   endorsement if the account requests it. Account/endorsement status has not
   been checked. [Endorsement help](https://info.arxiv.org/help/endorsement.html)
2. Select the author's chosen license and supply the fields above.
3. Upload the ZIP, select `main.tex`, and use **XeLaTeX, TeX Live 2025**.
   The local preview uses Tectonic's XeTeX engine; it is not a run on arXiv's
   server or an exact reproduction of its TeX Live installation.
4. Process the source and inspect arXiv's generated PDF, especially the byline,
   four figures, ten tables and 18 bibliography entries. Use the local preview
   for comparison. Resolve any processing errors before finalizing.
5. Review the metadata and finalize the submission when ready. Files being
   locally prepared does not establish acceptance or publication by arXiv.

[TeX source requirements](https://info.arxiv.org/help/submit_tex.html) and
[supported processors](https://info.arxiv.org/help/faq/texlive.html).
"""
    return {ARCHIVE: zipped, "metadata.json": metadata_data, "abstract.txt": (abstract + "\n").encode(),
            "manifest.json": json_bytes(manifest), "SUBMISSION.md": guide.encode()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify existing artifacts without writing")
    parser.add_argument("--pdf", action="store_true", help="Also verify the recorded compiled preview (requires manuscript dependencies)")
    args = parser.parse_args()
    expected = outputs()
    assert expected == outputs(), "Packaging is not deterministic"
    if not args.check:
        OUT.mkdir(parents=True, exist_ok=True)
    for name, content in expected.items():
        path = OUT / name
        if args.check:
            assert path.read_bytes() == content, f"Stale submission artifact: {name}"
        else:
            path.write_bytes(content)
    if args.pdf:
        from pypdf import PdfReader
        import pdfplumber
        record = json.loads((OUT / "compilation.json").read_text())
        preview = ROOT / "output/pdf/agent-task-completion-arxiv.pdf"
        assert record["archive_sha256"] == digest(expected[ARCHIVE]), "Recompile the changed source ZIP"
        assert record["pdf_sha256"] == digest(preview.read_bytes()), "Compiled preview differs from its record"
        reader = PdfReader(preview)
        settings = json.loads((HERE / "submission.json").read_text())
        assert len(reader.pages) == settings["pages"] == record["pages"]
        content = " ".join(page.extract_text() or "" for page in reader.pages)
        assert "Dan Itkis, MsETM" in content and reader.metadata.author == "Dan Itkis, MsETM"
        assert "research draft" not in content.lower() and "accessed on" not in content.lower()
        assert "the human author must review and take responsibility" not in " ".join(content.split()).lower()
        assert "\ufffd" not in content and "\u25a0" not in content
        assert set(re.findall(r"Table\s+(\d+)\.", content)) == set(map(str, range(1, 11)))
        assert set(re.findall(r"Figure\s+(\d+)\.", content)) == set(map(str, range(1, 5)))
        assert all(number in content for number in ("1200", "8400", "620", "3100", "26.6%", "72.9%"))
        with pdfplumber.open(preview) as document:
            for index, page in enumerate(document.pages, 1):
                assert page.chars, index
                for char in page.chars:
                    assert 20 < char["x0"] < char["x1"] < page.width - 20, (index, char)
                    assert 15 < char["top"] < char["bottom"] < page.height - 15, (index, char)
        print(f"Verified compiled preview: {len(reader.pages)} pages, metadata, tables, figures, bounds and source binding")
    print(f"{'Verified' if args.check else 'Wrote'} arXiv package: 5 source files, 18 references, matching ASCII metadata")


if __name__ == "__main__":
    main()
