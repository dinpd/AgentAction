"""Build a credential-free n8n workflow import archive from reviewed assets."""

import argparse
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent


def build(output: Path):
    assets = [
        ROOT / "workflows" / name for name in ("automatic.json", "human-review.json")
    ]
    for path in assets:
        workflow = json.loads(path.read_text())
        assert workflow["active"] is False and not workflow.get("id")
        assert not workflow.get("pinData")
        assert all(not node.get("credentials") for node in workflow["nodes"])
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        for path in [*assets, ROOT / "README.md"]:
            archive.write(path, path.relative_to(ROOT))
    print(output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output", type=Path, default=Path("/tmp/agentaction-n8n-reference.zip")
    )
    build(parser.parse_args().output)
