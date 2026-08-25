# Skill Authorization

Skills package agent workflow knowledge: instructions, examples, scripts,
templates, and domain playbooks. AgentAction authorization contracts should travel
with those skills so each skill declares the tools it may call, the resources it
may touch, the approvals it needs, and the evidence it must emit.

AgentAction treats a skill as a capability that can be reviewed before activation
and constrained before it invokes downstream tools.

MCP remains the runtime integration surface for external tools. Skills are the
workflow packaging surface. AgentAction should govern both.

## Skill, tool, and flow

AgentAction uses these terms deliberately:

```text
Skill = workflow package
Tool = executable operation
Flow = data movement boundary
```

- A **skill** packages instructions, scripts, examples, and workflow logic. It
  can orchestrate multiple downstream calls.
- A **tool** is the concrete operation being executed, such as
  `provider.billing.issue_credit`.
- A **flow** is the movement of data between sources and destinations, such as
  `provider_billing -> agent_context`.

For a skill-originated call, AgentAction can check both the skill and the tool: the
skill must be declared and allowed to invoke the downstream tool through
`may_invoke`, and the downstream tool must still satisfy its own approval, JIT,
resource, and data-flow rules.

## Skill-local guardrails

A skill can carry its own AgentAction guardrail contract in one of these places:

- `agentid.yaml`
- `agentid.skill.yaml`
- `SKILL.md` YAML frontmatter under `agentid_skill`

Example:

```yaml
agentid_skill:
  id: support-refund-workflow
  kind: skill
  source: ./skills/support-refund-workflow
  version: 1.0.0
  hash: sha256:replace-with-skill-bundle-digest
  access: execute
  auth_mode: just_in_time
  approval: human_confirm
  may_invoke:
    - provider.crm.search_customer
    - provider.billing.issue_credit
  constraints:
    token_ttl_seconds: 300
    max_amount_usd: 100
```

Validate it with:

```bash
agentaction skill validate ./skills/support-refund-workflow
agentaction skill validate examples/skill-guardrail-contract.yaml
```

The skill-local contract is not a permission grant. It is the skill's requested
authority envelope. Enterprise policy can import, review, narrow, or reject it.
This keeps skill authors from smuggling authorization into workflow packaging:
the skill declares what it needs, while the runtime decides what is allowed.

## Enterprise manifest support

AgentAction manifests now support `capabilities` alongside the legacy `tools`
field:

```yaml
capabilities:
  - id: support-refund-workflow
    kind: skill
    source: ./skills/support-refund-workflow
    version: 1.0.0
    hash: sha256:replace-with-skill-bundle-digest
    access: execute
    auth_mode: just_in_time
    approval: human_confirm
    may_invoke:
      - provider.crm.search_customer
      - provider.billing.issue_credit

  - id: provider.billing.issue_credit
    kind: mcp_tool
    access: write
    auth_mode: just_in_time
    approval: manager
    constraints:
      token_ttl_seconds: 300
      max_amount_usd: 100
```

The legacy `tools` field remains supported and is normalized internally as
`kind: mcp_tool`.

## Runtime checks

Skill-aware enforcement should happen at two points:

1. Skill activation: can this agent use this skill for this user, job, case,
   customer, approval, and time window?
2. Downstream execution: can this skill-originated workflow invoke this MCP
   tool or API operation with these arguments?

Audit events can include `skill_id` to bind downstream calls to the skill that
initiated them. AgentAction checks whether the declared skill exists and whether
the downstream tool is listed in `may_invoke`.

Receipts for skill-originated calls should include the skill identity and
bundle digest:

```yaml
agent_id: support-copilot-prod
skill_id: support-refund-workflow
skill_hash: sha256:replace-with-skill-bundle-digest
tool: provider.billing.issue_credit
action: write
resource: provider/customer/cus_123
job_id: refund_triage
approval_id: approval-123
jit_grant_id: jit-456
```

This lets providers and gateways distinguish a direct tool call from a
skill-orchestrated workflow, while keeping the downstream MCP authorization
model intact.
