#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATEWAY_URL="${AGENTPASS_GATEWAY_URL:-http://127.0.0.1:8787}"
API_KEY="${AGENTPASS_GATEWAY_API_KEY:-dev-token}"

request() {
  local fixture="$1"
  curl -s "${GATEWAY_URL}/authorize" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d @"${ROOT_DIR}/solutions/openclaw-agentaction/fixtures/${fixture}"
}

read_response="$(request allowed-read.json)"
write_response="$(request denied-write-no-jit.json)"

python3 - "$read_response" "$write_response" <<'PY'
import json
import sys

read = json.loads(sys.argv[1])
write = json.loads(sys.argv[2])

if read.get("allow") is not True:
    raise SystemExit(f"expected read allow, got: {read}")
if write.get("allow") is not False:
    raise SystemExit(f"expected write deny, got: {write}")
if "missing jit_grant_id" not in write.get("findings", []):
    raise SystemExit(f"expected missing JIT finding, got: {write.get('findings')}")

print("AgentAction OpenClaw smoke passed: read allowed, write denied without JIT.")
PY
