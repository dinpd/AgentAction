# AgentID

**AgentID** is a lightweight open-source toolkit for declaring, validating, reviewing, and auditing AI agent authority.

![AI Agents Need Eligibility Contracts](docs/AIAgentsNeedEligibilityContracts.png)

The core idea is simple:

> Every production agent should have an authority contract that says who it is, who owns it, what it can request, when authority should be issued just in time, where data can flow, when it needs approval, and how it can be stopped.

AgentID does **not** replace IAM, OAuth, MCP gateways, OPA, Cedar, or enterprise security tools. It sits one layer above them as a portable declaration format for agent identity, delegation, tool access, intent confirmation, just-in-time authorization, data-flow boundaries, approval rules, runtime enforcement expectations, audit behavior, and kill-switch behavior.

---

## Why this exists

Most agent projects define tools and credentials in ad hoc config files.

What is often missing is a clear answer to:

- What is this agent?
- Who owns it?
- What systems can it touch?
- What actions can it request?
- Which actions require just-in-time authority?
- Which actions require approval?
- What data is allowed to flow from one system to another?
- Can it call other agents?
- When does its authority expire?
- What should be logged?
- How can it be stopped?

AgentID turns those questions into a small manifest that can be reviewed by developers, security teams, platform teams, and product owners.

---

## Important framing

Identity is necessary, but not sufficient.

A valid agent identity does not imply a valid action. An agent can have the right token and still take the wrong action because the task was ambiguous, the context was poisoned, or a downstream tool interpreted the request differently.

AgentID treats identity as the foundation, runtime authorization as the control plane, and audit as the accountability layer.

The manifest should not be treated as a broad permission grant. It should be treated as an **eligibility contract**: what the agent may request, under what conditions, for how long, and with what approval.

For sensitive actions, actual authority should be issued **just in time** and bound to the agent, user, tool, action, resource, approval, and time window.

---

## CLI

```bash
agentid validate examples/customer-support-refund-agent.yaml
agentid explain examples/customer-support-refund-agent.yaml
agentid risk-score examples/customer-support-refund-agent.yaml
agentid generate-policy examples/customer-support-refund-agent.yaml --target opa
agentid audit examples/sample-tool-log.json --manifest examples/customer-support-refund-agent.yaml
agentid config-ui --output agentid-policy-builder.html
agentid gateway examples/customer-support-refund-agent.yaml --host 127.0.0.1 --port 8787
```

`config-ui` writes a self-contained browser UI for building an AgentID manifest and starter OPA policy.

`gateway` starts a lightweight HTTP authorization gateway for SaaS integration. The gateway exposes:

| Endpoint | Purpose |
|---|---|
| `GET /health` | Check gateway health and active agent ID |
| `GET /policy?target=opa` | Return generated policy for the active manifest |
| `POST /authorize` | Authorize a proposed tool call against the manifest |
| `POST /jit-grants` | Issue an in-memory JIT grant for a just-in-time tool |

Set `AGENTID_GATEWAY_API_KEY` or pass `--api-key` to require `Authorization: Bearer <key>`.

For edge deployment, see [`cloudflare/`](cloudflare/) for a Cloudflare Workers
gateway with Durable Object-backed JIT grants and a GitHub Actions deployment
workflow.

---

## Manifest concepts

| Concept | Meaning |
|---|---|
| `agent` | Unique identity, owner, purpose, environment, and expiry |
| `delegation` | Who or what the agent is allowed to act on behalf of |
| `delegation_chain` | Whether the agent can call other agents |
| `intent` | Actions that require explicit human confirmation |
| `jit_authorization` | Rules for issuing temporary, scoped authority at runtime |
| `tools` | External capabilities the agent may use |
| `auth_mode` | Whether access is `delegated`, `service`, or `just_in_time` |
| `approval` | Whether an action requires approval: `none`, `notify`, `human_confirm`, `step_up`, `manager`, or `block` |
| `constraints` | Limits such as max amount, allowed reasons, token TTL, domains, or resource patterns |
| `data_flows` | Allowed or blocked source-to-destination flows |
| `risk_tiers` | Default approval rules by risk category |
| `runtime` | Runtime enforcement and drift-detection expectations |
| `audit` | What must be logged and retained |
| `kill_switch` | Whether policy violations should revoke or suspend authority |

---

## Design principles

1. **Agents are first-class identities.**
2. **Authority should be explicit.**
3. **Delegation matters.**
4. **Eligibility is not the same as granted authority.**
5. **Sensitive authority should be issued just in time.**
6. **Intent confirmation is different from delegated access.**
7. **Data-flow boundaries matter as much as tool permissions.**
8. **Approval should be action-level and risk-tiered.**
9. **Auditability is part of identity.**
10. **Revocation must be practical.**

---

## Roadmap

- JSON Schema for the manifest
- GitHub Action for PR validation
- Stronger policy generation for OPA and Cedar
- MCP tool metadata import/export
- OAuth scope recommendation
- JIT grant simulator
- Web-based manifest builder
- SaaS authorization gateway adapters
- Hosted Cloudflare gateway package
- Risk policy profiles by environment
- Audit log normalization
- CI/CD gates for unsafe agent configs
- Delegation-chain visualization

---

## License

MIT
