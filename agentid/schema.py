from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def load_schema() -> dict[str, Any]:
    schema_path = Path(__file__).resolve().parent.parent / "schema" / "agentid.schema.json"
    return json.loads(schema_path.read_text())


def schema_json(indent: int = 2) -> str:
    return json.dumps(load_schema(), indent=indent) + "\n"
