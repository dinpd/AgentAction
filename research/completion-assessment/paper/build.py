"""Build Markdown, LaTeX, figures, and a review PDF from measured results."""
from pathlib import Path
import functools
import html
import json
import os
import re
import tempfile

os.environ.setdefault("MPLCONFIGDIR", str(Path(tempfile.gettempdir()) / "agentaction-paper-mpl"))
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
import numpy as np
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
RESULTS = ROOT / "results"
OUT = ROOT / "output" / "pdf"
FIGURES = HERE / "figures"
TITLE = "When Is an Agent Task Complete? A Fault-Injection Study of Evidence-Based Assessment"
METHOD_NAMES = {"tool": "Tool", "trace": "Trace", "content_any": "Content-any", "local_any": "Local-any",
                "ingress_any": "Ingress-any", "ingress_all": "Ingress-all", "ingress_latest": "Ingress-latest"}


def read(name):
    return json.loads((RESULTS / name).read_text())


def percentage(n):
    return "undefined" if n is None else f"{100 * n:.1f}%"


def table(headers, rows):
    return "\n".join(["| " + " | ".join(headers) + " |", "| " + " | ".join(["---"] * len(headers)) + " |"] +
                     ["| " + " | ".join(map(str, row)) + " |" for row in rows])


def make_figures(summary, loss):
    FIGURES.mkdir(exist_ok=True)
    plt.rcParams.update({"font.size": 10, "font.family": "DejaVu Sans", "axes.spines.top": False,
                         "axes.spines.right": False, "pdf.fonttype": 42, "svg.hashsalt": "agentaction-research-v1"})
    methods = list(METHOD_NAMES)
    scenarios = list(summary["by_scenario"])
    grid, labels = [], []
    for scenario in scenarios:
        values, row_labels = [], []
        for method in methods:
            s = summary["by_scenario"][scenario][method]
            if s["abstained"] == s["total"]:
                label, code = "U", 0
            elif s["false_success"] or s["false_failure"]:
                assert s["false_success"] + s["false_failure"] == s["total"]
                label, code = ("S" if s["false_success"] else "F"), 3
            else:
                assert s["abstained"] == 0
                label, code = ("S", 1) if s["positive"] else ("F", 2)
            values.append(code)
            row_labels.append(label)
        grid.append(values)
        labels.append(row_labels)
    fig, ax = plt.subplots(figsize=(7.2, 6.5), layout="constrained")
    ax.imshow(grid, cmap=ListedColormap(["#e9edf0", "#c6ddd1", "#c9d9e8", "#eab8b3"]), vmin=0, vmax=3, aspect="auto")
    ax.set_xticks(range(len(methods)), ["Tool", "Trace", "Content", "Local", "Ingress\nany", "Ingress\nall", "Ingress\nlatest"])
    ax.xaxis.tick_top()
    ax.set_yticks(range(len(scenarios)), [s.replace("_", " ") + (" (+)" if summary["by_scenario"][s]["tool"]["positive"] else " (-)") for s in scenarios])
    ax.tick_params(axis="both", length=0, labelsize=9)
    for y, line in enumerate(labels):
        for x, label in enumerate(line):
            ax.text(x, y, label, ha="center", va="center", fontsize=9, color="#222222")
    for y in np.arange(0.5, len(scenarios), 1):
        ax.axhline(y, color="white", linewidth=1)
    for x in np.arange(0.5, len(methods), 1):
        ax.axvline(x, color="white", linewidth=1)
    ax.set_xlabel("(+) true success; (-) true failure. Red = incorrect decisive assessment.", fontsize=9, labelpad=10)
    for suffix in ("png", "pdf"):
        fig.savefig(FIGURES / f"scenario-matrix.{suffix}", dpi=220,
                    metadata={"CreationDate": None} if suffix == "pdf" else None)
    plt.close(fig)
    fig, axes = plt.subplots(1, 2, figsize=(7.2, 2.6), layout="constrained")
    for method, color, marker in [("tool", "#9c4038", "s"), ("ingress_any", "#244f70", "o")]:
        xs = [100 * r["loss_fraction"] for r in loss]
        for ax, field in zip(axes, ["coverage", "selective_error"]):
            ys = [100 * r["methods"][method][field] if r["methods"][method][field] is not None else np.nan for r in loss]
            ax.plot(xs, ys, color=color, marker=marker, markersize=4, linewidth=1.5, label=METHOD_NAMES[method])
            ax.set_xticks([0, 25, 50, 75, 100])
            ax.set_ylim(-4, 104)
            ax.grid(axis="y", alpha=0.18)
            ax.set_xlabel("Observations removed (%)")
    axes[0].set_ylabel("Decisive coverage (%)")
    axes[1].set_ylabel("Selective error (%)")
    axes[1].legend(loc="upper right", frameon=False, fontsize=9)
    for suffix in ("png", "pdf"):
        fig.savefig(FIGURES / f"observation-loss.{suffix}", dpi=220,
                    metadata={"CreationDate": None} if suffix == "pdf" else None)
    plt.close(fig)


def substitutions(summary, loss, omission, timing, refs):
    overall = summary["overall"]
    ingress = overall["ingress_any"]
    cell = next(c for c in omission if c["mask"] == 2)["representations"]
    tokens = {
        "scenario_count": len(summary["design"]["scenarios"]), "case_count": summary["design"]["cases"],
        "assessment_count": summary["design"]["assessments"], "stratum_count": summary["design"]["strata"],
        "tool_fs": overall["tool"]["false_success"], "ingress_fs": ingress["false_success"],
        "negative_count": ingress["negative"], "positive_count": ingress["positive"],
        "ingress_coverage": percentage(ingress["coverage"]), "content_fs": overall["content_any"]["false_success"],
        "ingress_positive": ingress["admitted_positive"], "per_family": summary["by_scenario"]["clean"]["tool"]["total"],
        "policy_delta": ingress["false_success"] - overall["ingress_all"]["false_success"],
        "latest_fs": overall["ingress_latest"]["false_success"],
        "loss_cases": loss[0]["methods"]["tool"]["total"], "loss_tool_error": percentage(loss[-1]["methods"]["tool"]["selective_error"]),
        "omission_count": sum(v["total"] for mask in omission for v in mask["representations"].values()),
        "omission_cell_count": cell["absent"]["total"], "omission_empty_fs": cell["empty"]["false_success"],
        "timing_cpu": timing["cpu"], "timing_platform": f'{timing["platform"]} {timing["arch"]}',
        "timing_node": timing["node"], "timing_n": timing["results"]["ingress_any"]["n"],
    }
    tokens["table_overall"] = table(["Method", "FS/N-", "FF/N+", "Coverage", "Sel. error", "Positive admit"], [
        [METHOD_NAMES[m], f'{v["false_success"]}/{v["negative"]}', f'{v["false_failure"]}/{v["positive"]}',
         percentage(v["coverage"]), percentage(v["selective_error"]), f'{v["admitted_positive"]}/{v["positive"]}']
        for m, v in overall.items()])
    tokens["table_omission"] = table(["Receipt source", "False success", "Abstentions", "Coverage"], [
        [k.capitalize(), f'{v["false_success"]}/{v["negative"]}', f'{v["abstained"]}/{v["total"]}', percentage(v["coverage"])]
        for k, v in cell.items()])
    tokens["table_timing"] = table(["Method", "Median (ms)", "95th percentile (ms)"], [
        [METHOD_NAMES[m], f'{v["p50"]:.4f}', f'{v["p95"]:.4f}'] for m, v in timing["results"].items()])
    tokens["figure_matrix"] = "![Scenario assessment matrix](figures/scenario-matrix.png)"
    tokens["figure_loss"] = "![Observation loss and assessment coverage](figures/observation-loss.png)"
    tokens["references"] = "\n\n".join(f'[{i}] {r["authors"]}. **{r["title"]}.** {r["venue"]}, {r["year"]}. [Source]({r["url"]})' for i, r in enumerate(refs, 1))
    return tokens


def blocks(text):
    return [b.strip() for b in text.split("\n\n") if b.strip()]


def inline(s):
    s = html.escape(s)
    s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<link href="\2" color="#244f70">\1</link>', s)
    s = re.sub(r"\*\*(.*?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"`([^`]+)`", r'<font name="Courier" size="8.8">\1</font>', s)
    return s


def render_pdf(text):
    OUT.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle("BodyPaper", fontName="Times-Roman", fontSize=10.5, leading=14.1,
                              alignment=TA_JUSTIFY, spaceAfter=7))
    styles.add(ParagraphStyle("PaperTitle", fontName="Times-Bold", fontSize=18, leading=21.5,
                              alignment=TA_CENTER, spaceAfter=14))
    styles.add(ParagraphStyle("Author", fontName="Times-Roman", fontSize=11, leading=14,
                              alignment=TA_CENTER, spaceAfter=4))
    styles.add(ParagraphStyle("H1Paper", fontName="Times-Bold", fontSize=12, leading=15,
                              spaceBefore=13, spaceAfter=6, keepWithNext=True))
    styles.add(ParagraphStyle("H2Paper", fontName="Times-Bold", fontSize=10.8, leading=14,
                              spaceBefore=9, spaceAfter=5, keepWithNext=True))
    styles.add(ParagraphStyle("Cell", fontName="Times-Roman", fontSize=9, leading=11.5))
    styles.add(ParagraphStyle("CaptionPaper", fontName="Times-Roman", fontSize=9.2, leading=12, spaceAfter=10))
    styles.add(ParagraphStyle("ReferencePaper", fontName="Times-Roman", fontSize=9, leading=12, spaceAfter=6))
    story, pending = [], None
    in_refs = False
    parts = blocks(text)
    for i, block in enumerate(parts):
        if block.startswith("# "):
            story.append(Paragraph(inline(block[2:]), styles["PaperTitle"]))
        elif i in (1, 2, 3):
            story.append(Paragraph(inline(block), styles["Author"]))
            if i == 3:
                story.append(Spacer(1, 10))
        elif block.startswith("## "):
            in_refs = block == "## References"
            story.append(Paragraph(inline(block[3:]), styles["H1Paper"]))
        elif block.startswith("### "):
            story.append(Paragraph(inline(block[4:]), styles["H2Paper"]))
        elif block.startswith("| "):
            rows = [[c.strip() for c in line.strip("|").split("|")] for line in block.splitlines()]
            rows.pop(1)
            formatted = [[Paragraph(inline(c if r else f"**{c}**"), styles["Cell"]) for c in row] for r, row in enumerate(rows)]
            if len(rows[0]) == 6:
                widths = [94, 67, 67, 76, 80, 96]
            else:
                widths = [480 / len(rows[0])] * len(rows[0])
            pending = Table(formatted, colWidths=widths, repeatRows=1, hAlign="CENTER")
            pending.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, 0), 0.7, colors.black),
                ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.black), ("LINEBELOW", (0, -1), (-1, -1), 0.7, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5), ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f6f7")])]))
        elif block.startswith("!["):
            path = HERE / re.search(r"\]\(([^)]+)\)", block)[1]
            width, height = ImageReader(str(path)).getSize()
            pending = Image(str(path), width=480, height=480 * height / width)
        elif block.startswith("**Table ") or block.startswith("**Figure "):
            caption = Paragraph(inline(block), styles["CaptionPaper"])
            assert pending is not None
            story.append(KeepTogether([Spacer(1, 6), pending, Spacer(1, 6), caption]))
            pending = None
        else:
            story.append(Paragraph(inline(block), styles["ReferencePaper"] if in_refs else styles["BodyPaper"]))
    assert pending is None
    doc = SimpleDocTemplate(str(OUT / "agent-task-completion.pdf"), pagesize=(612, 792),
        rightMargin=60, leftMargin=60, topMargin=49, bottomMargin=48, title=TITLE,
        author="Dan Itkis", subject="Research draft: evidence-based agent task assessment")
    def page(c, d):
        c.saveState()
        c.setFont("Times-Roman", 8)
        c.setFillColor(colors.HexColor("#666666"))
        if d.page > 1:
            c.drawString(60, 765, "When Is an Agent Task Complete?")
            c.drawRightString(552, 765, "Research draft")
        c.drawString(60, 27, "Dan Itkis | AgentAction.dev")
        c.drawRightString(552, 27, str(d.page))
        c.restoreState()
    doc.build(story, onFirstPage=page, onLaterPages=page,
              canvasmaker=functools.partial(canvas.Canvas, invariant=1))


def tex_escape(s):
    return "".join({"\\": r"\textbackslash{}", "&": r"\&", "%": r"\%", "$": r"\$",
        "#": r"\#", "_": r"\_", "{": r"\{", "}": r"\}", "~": r"\textasciitilde{}", "^": r"\textasciicircum{}"}.get(c, c) for c in s)


def tex_inline(s, refs):
    s = tex_escape(s)
    s = re.sub(r"\*\*(.*?)\*\*", r"\\textbf{\1}", s)
    s = re.sub(r"`([^`]+)`", r"\\texttt{\1}", s)
    s = re.sub(r"\[(\d+)\]", lambda m: r"\cite{" + refs[int(m[1]) - 1]["id"] + "}", s)
    return s


def render_tex(text, refs):
    lines = [r"\documentclass[11pt]{article}", r"\usepackage[margin=0.85in]{geometry}",
             r"\usepackage[T1]{fontenc}", r"\usepackage{mathptmx,graphicx,booktabs,tabularx,array,hyperref}",
             r"\hypersetup{colorlinks=true,urlcolor=blue,citecolor=blue}", r"\setlength{\parskip}{0.45em}",
             r"\setlength{\parindent}{0pt}", r"\title{" + tex_escape(TITLE) + "}",
             r"\author{Dan Itkis\\AgentAction.dev}", r"\date{Research draft -- September 24, 2026}",
             r"\begin{document}", r"\maketitle"]
    for i, b in enumerate(blocks(text)):
        if i <= 3:
            continue
        if b == "## References":
            break
        if b.startswith("### "):
            lines.append(r"\subsection{" + tex_escape(re.sub(r"^\d+\.\d+\.\s*", "", b[4:])) + "}")
        elif b.startswith("## "):
            heading = re.sub(r"^\d+\.\s*", "", b[3:])
            numbered = bool(re.match(r"\d+\.", b[3:]))
            lines.append((r"\section{" if numbered else r"\section*{") + tex_escape(heading) + "}")
        elif b.startswith("| "):
            rows = [[c.strip() for c in line.strip("|").split("|")] for line in b.splitlines()]
            rows.pop(1)
            lines.extend([r"\begin{center}\small", r"\begin{tabularx}{\linewidth}{@{}l" +
                          "*{" + str(len(rows[0]) - 1) + r"}{>{\raggedleft\arraybackslash}X}@{}}", r"\toprule"])
            for j, row in enumerate(rows):
                lines.append(" & ".join(tex_inline(c, refs) for c in row) + r" \\")
                if j == 0:
                    lines.append(r"\midrule")
            lines.extend([r"\bottomrule", r"\end{tabularx}\end{center}"])
        elif b.startswith("!["):
            path = re.search(r"\]\(([^)]+)\)", b)[1].replace(".png", ".pdf")
            lines.append(r"\begin{center}\includegraphics[width=\linewidth]{" + path + r"}\end{center}")
        else:
            lines.append(tex_inline(b, refs) + "\n")
    lines.append(r"\begin{thebibliography}{99}\raggedright")
    for r in refs:
        lines.append(r"\bibitem{" + r["id"] + "} " + tex_escape(f'{r["authors"]}. {r["title"]}. {r["venue"]}, {r["year"]}. ') + r"\url{" + r["url"] + "}")
    lines.extend([r"\end{thebibliography}", r"\end{document}"])
    (HERE / "manuscript.tex").write_text("\n".join(lines) + "\n")
    (HERE / "references.bib").write_text("\n\n".join("@misc{" + r["id"] + ",\n" +
        "\n".join("  " + k + " = {" + v + "}," for k, v in [("author", r["authors"].replace(", and ", " and ").replace(", ", " and ")),
         ("title", r["title"]), ("year", r["year"]), ("note", r["venue"]), ("url", r["url"])]) + "\n}" for r in refs) + "\n")


def main():
    summary, loss, omission, timing = [read(x) for x in ["summary.json", "observation-loss-summary.json", "stream-omission-summary.json", "timing.json"]]
    refs = json.loads((HERE / "references.json").read_text())
    make_figures(summary, loss)
    values = substitutions(summary, loss, omission, timing, refs)
    text = (HERE / "manuscript.template.md").read_text()
    for key, value in values.items():
        text = text.replace("{{" + key + "}}", str(value))
    assert not re.search(r"{{.*?}}", text), "Unresolved result token"
    ids = {r["id"]: str(i) for i, r in enumerate(refs, 1)}
    text = re.sub(r"\[@([a-z]+)\]", lambda m: "[" + ids[m[1]] + "]", text)
    (HERE / "manuscript.md").write_text(text)
    (HERE / "generated-values.json").write_text(json.dumps({k: v for k, v in values.items() if not k.startswith(("table_", "figure_")) and k != "references"}, indent=2) + "\n")
    render_tex(text, refs)
    render_pdf(text)
    print(OUT / "agent-task-completion.pdf")


if __name__ == "__main__":
    main()
