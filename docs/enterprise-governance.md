# Enterprise Governance

AgentPass has a local runtime guard for developers and an enterprise governance
track for teams that need shared enforcement across apps, MCP gateways,
provider-hosted tools, and security-controlled policy services.

Start with the runtime guard if you want to wrap tool calls in-process. Use this
enterprise track when you need reviewable manifests, provider contracts, scoped
receipts, centralized approvals, durable audit, or gateway-level enforcement.

## Architecture

```text
Enterprise Agent
  -> App Runtime or MCP Gateway
  -> AgentPass policy check
  -> Internal Tool, SaaS API, or Provider MCP Server
```

The enterprise track keeps normal business authorization in the downstream
system. AgentPass answers whether the agent-originated action is eligible for
execution under the current policy, job, user, approval, and data-flow context.

## What It Covers

- Enterprise manifests for reviewing agent authority before deployment.
- MCP gateway checks before forwarding `tools/call`.
- Provider-published MCP authorization contracts.
- Scoped receipts for high-blast-radius provider tools.
- JIT grants and approval flows for sensitive enterprise actions.
- OIDC claim mapping, DID/VC metadata, and standards alignment.
- Audit and decision-event expectations for regulated environments.

## Key Docs

- Runtime guard roadmap: [action-gate-roadmap.md](action-gate-roadmap.md)
- Integration patterns: [integration-patterns.md](integration-patterns.md)
- MCP gateway integration: [mcp-gateway-integration.md](mcp-gateway-integration.md)
- Provider MCP authorization: [provider-mcp-authorization.md](provider-mcp-authorization.md)
- Provider MCP demo: [provider-mcp-demo.md](provider-mcp-demo.md)
- Provider MCP CI checks: [provider-mcp-ci.md](provider-mcp-ci.md)
- Receipt profiles: [receipt-profiles.md](receipt-profiles.md)
- Skills authorization: [skills-authorization.md](skills-authorization.md)
- Standards alignment: [standards-alignment.md](standards-alignment.md)
- Job boundaries: [job-boundaries.md](job-boundaries.md)
- Agent-to-agent delegation: [agent-to-agent-delegation.md](agent-to-agent-delegation.md)

## Provider Contracts

For providers turning APIs into MCP servers, AgentPass defines an auth-first
pattern:

1. Provider publishes an MCP authorization contract describing tool semantics,
   protected resources, required context, risk, receipt bindings, and business
   constraints.
2. Enterprise imports or reviews that contract.
3. Enterprise overlays local agent, user, job, approval, and data-flow policy.
4. The enterprise gateway authorizes the agent-originated request.
5. The provider verifies the forwarded receipt before applying its own business
   authorization and executing the tool.

See [Turn Your API Into MCP, Safely](turn-your-api-into-mcp-safely.md) and
[provider-mcp-authorization.md](provider-mcp-authorization.md).

## CLI

```bash
agentpass validate examples/provider-mcp-support-agent.yaml
agentpass explain examples/provider-mcp-support-agent.yaml
agentpass risk-score examples/provider-mcp-support-agent.yaml
agentpass generate-policy examples/provider-mcp-support-agent.yaml --target opa
agentpass provider validate examples/provider-mcp-contract.yaml
agentpass provider import examples/provider-mcp-contract.yaml --agent enterprise-support-agent --output generated-agent.yaml
agentpass provider verify-receipt examples/provider-signed-receipt.json --secret dev-provider-receipt-secret --require-signed
agentpass gateway examples/provider-mcp-support-agent.yaml --host 127.0.0.1 --port 8787
```

The Python CLI and schema filenames still include `agentid` compatibility names
in some places. The product-facing name is AgentPass.

## Demos And Packages

- Hosted gateway-control demo:
  [agentid-refund-demo.drisw.workers.dev](https://agentid-refund-demo.drisw.workers.dev/)
- Hosted DevOps-control demo:
  [agentid-devops-demo.drisw.workers.dev](https://agentid-devops-demo.drisw.workers.dev/)
- Policy builder:
  [agentid-policy-builder.pages.dev](https://agentid-policy-builder.pages.dev/)
- DevOps/SRE solution pack: [solutions/devops-sre/](../solutions/devops-sre/)
- MCP gateway adapter: [mcp-gateway-adapter/](../mcp-gateway-adapter/)
- Provider Express middleware: [packages/provider-express/](../packages/provider-express/)
- Provider FastAPI helpers: [packages/provider-fastapi/](../packages/provider-fastapi/)

## Relationship To The Runtime Guard

The local guard in [packages/guard/](../packages/guard/) is the fastest path for
agent developers to test the action-gate model. The enterprise track is for
shared enforcement, policy distribution, provider interoperability, and audit
across teams and systems.
