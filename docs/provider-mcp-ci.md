# Provider MCP Contract CI

Provider MCP contracts should be checked before they are published or imported
by customers. The goal is to catch high-blast-radius changes before a new MCP
tool surface reaches production.

CI should answer four questions:

- Is the contract structurally valid?
- Does it match the published JSON Schema?
- Did any tool, resource mapping, input schema, receipt binding, TTL, or risk
  level change?
- Did a new high-blast-radius tool appear without explicit JIT, approval, and
  receipt requirements?

## Minimal Check

```bash
python -m pip install "agentid @ git+https://github.com/dinpd/AgentPass.git@main"
agentid provider validate provider-mcp-contract.yaml
```

This validates AgentPass's provider-specific rules. In particular, high-risk
tools must declare:

- `receipt_required: true`
- `requires_jit: true`
- explicit approval
- protected-resource mapping
- required authorization context
- receipt binding fields
- receipt TTL
- `single_use: true`

## JSON Schema Check

Use the provider contract schema for editor and CI validation:

```bash
agentid provider schema > provider-mcp-contract.schema.json
```

Contracts can also point at the hosted schema:

```yaml
$schema: https://raw.githubusercontent.com/dinpd/AgentPass/main/schema/provider-mcp-contract.schema.json
```

In Python CI:

```python
import json
import urllib.request

import yaml
from jsonschema import Draft202012Validator

schema_url = "https://raw.githubusercontent.com/dinpd/AgentPass/main/schema/provider-mcp-contract.schema.json"
schema = json.load(urllib.request.urlopen(schema_url))
contract = yaml.safe_load(open("provider-mcp-contract.yaml", encoding="utf-8"))
Draft202012Validator.check_schema(schema)
Draft202012Validator(schema).validate(contract)
```

## Drift Check

Compare a proposed contract against the reviewed contract on the base branch:

```bash
agentid provider diff old-provider-mcp-contract.yaml provider-mcp-contract.yaml
```

The diff reports:

- added tools
- removed tools
- changed tools
- risk increases
- high-blast-radius additions
- changed protected resources
- changed receipt requirements
- changed receipt binding fields
- changed input schemas
- changed constraints

Use this in pull requests so reviewers can focus on meaningful authorization
changes rather than reading the entire contract.

## GitHub Actions Example

A copyable workflow lives at
[`../.github/workflows/examples/provider-contract-check.yml`](../.github/workflows/examples/provider-contract-check.yml).

To use it in another repository:

1. Copy the file to `.github/workflows/provider-contract-check.yml`.
2. Put the provider contract at `provider-mcp-contract.yaml`, or adjust the path.
3. Ensure the workflow installs AgentPass and `jsonschema`.
4. Require the workflow before publishing an updated MCP server or toolset.

## Recommended Review Policy

Treat these findings as requiring explicit review:

- any new `write`, `admin`, or `execute` tool
- any new financial, deletion, export, external-send, identity, permission, or
  code-execution capability
- any risk increase
- any protected-resource mapping change
- any receipt TTL increase
- any removal of `approval`, `requires_jit`, `receipt_required`, or
  `single_use`
- any input-schema change for high-risk tools

For low-risk read tools, CI can start as advisory. For high-blast-radius tools,
CI should block publication until the provider contract includes enforceable
authorization and receipt requirements.
