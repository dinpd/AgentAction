# Upstream MCP Targets

Last checked: 2026-05-27.

This document tracks public open-source projects where AgentID could integrate
with MCP gateways, routers, registries, or high-risk tool surfaces. It is a
working shortlist for maintainers and contributors. Inclusion here is not an
endorsement and does not mean a PR should be opened without first reading the
project's contribution guide and current issues.

## Contribution Rule

Start with the smallest contribution that helps the upstream maintainer evaluate
AgentID:

- Prefer a docs example, integration guide, or optional hook.
- Do not add AgentID as a mandatory dependency.
- Do not replace the project's existing authentication or authorization model.
- Keep enforcement at the gateway or router boundary when possible.
- Link to the reference adapter in [`../mcp-gateway-adapter/`](../mcp-gateway-adapter/)
  instead of copying large code into another project.

## Shortlist

| Project | Why it fits | First useful contribution | Priority |
|---|---|---|---|
| [agentgateway](https://agentgateway.dev/) | Open gateway for service, LLM, MCP, and A2A traffic with built-in policy, observability, RBAC, audit, and OPA-oriented positioning. | Open a discussion asking whether AgentID should be shown as an external pre-tool-call authorization pattern. If maintainers agree, propose a docs example mapping MCP tool calls to AgentID `/authorize`. | High |
| [IBM ContextForge](https://github.com/IBM/mcp-context-forge) | Gateway, registry, and proxy for MCP, A2A, REST, and gRPC with governance, observability, and plugin extensibility. | Add an optional plugin or plugin tutorial that calls AgentID before forwarding tool calls. Start with docs if the plugin interface is still changing. | High |
| [microsoft/mcp-gateway](https://github.com/microsoft/mcp-gateway) | Reverse proxy and management layer for MCP servers with dynamic tool routing, Entra ID auth, role authorization, and tool registration. | Open a discussion proposing AgentID as an agent-specific policy layer above existing Entra/RBAC checks. A first PR should be docs-only: "AgentID pre-authorization with the tool gateway router." | High |
| [Barbacane](https://barbacane.dev/) | Open-source AI gateway that exposes OpenAPI operations as MCP tools and runs tool calls through existing middleware, auth, rate limits, validation, and observability. | Propose an OpenAPI extension example that calls AgentID for selected operations before they are exposed or executed as MCP tools. | Medium |
| [Open MCP Gateway](https://openmcp.aof.sh/) | Vendor-neutral MCP server orchestration with local, remote, Docker, and Kubernetes runtime backends plus a single `/mcp` API. | Add a guide for running sensitive servers behind AgentID authorization before `tools/call` forwarding. | Medium |
| [modelcontextprotocol/registry](https://github.com/modelcontextprotocol/registry) | Community-driven registry service for MCP servers. | Do not start with runtime enforcement. Consider metadata guidance for policy posture, risky tools, or "tested behind gateway authorization" badges after the registry metadata model is understood. | Medium |
| [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) | Reference MCP servers and links to community servers; includes sensitive examples such as filesystem, git, browser, database, Slack, and GitHub-style tools. | Avoid broad code PRs. A targeted docs PR could show how to place sensitive reference servers behind a policy-enforcing gateway. | Low |

## Recommended First Target

Start with **IBM ContextForge** or **agentgateway**.

ContextForge is attractive because it already has a plugin surface and positions
itself around governance and observability. AgentID can fit as an optional
authorization plugin without asking the core gateway to adopt the full manifest
model.

agentgateway is attractive because it is explicitly about governing service,
LLM, MCP, and A2A traffic in one gateway. It is likely a higher-bar project, so
start with a discussion before a PR.

## First Issue Template

Use this shape when opening a discussion or issue:

```text
Title: Optional AgentID pre-tool-call authorization example for MCP tools

I am working on AgentID, an open-source authorization layer for AI agent tool
calls: https://github.com/dinpd/AgentID

The integration I am proposing is optional and gateway-side:

MCP client -> gateway/router -> AgentID /authorize -> downstream MCP server

The goal is not to replace this project's existing auth model. AgentID would add
an agent-specific authority check before `tools/call` is forwarded, covering
agent identity, job boundary, tool/action, data-flow policy, approval, JIT
grants, and structured decision logs.

The AgentID repo includes a small reference adapter and demo:
https://github.com/dinpd/AgentID/tree/main/mcp-gateway-adapter

Would maintainers be open to a docs/example PR showing how to wire this pattern
into the gateway/plugin/middleware path?
```

## PR Shapes to Avoid

- Mandatory AgentID dependency.
- Large rewrites of routing, session, auth, or transport code.
- Claims that AgentID replaces OAuth, OIDC, RBAC, OPA, Cedar, OpenFGA, or the
  downstream application's own business authorization.
- Project-specific policy logic copied from this repository.
- PRs to sensitive MCP servers before the gateway pattern has maintainer
  feedback.

## Useful AgentID Assets

- Reference adapter: [`../mcp-gateway-adapter/`](../mcp-gateway-adapter/)
- Demo walkthrough: [`mcp-gateway-demo.md`](mcp-gateway-demo.md)
- Gateway integration guide: [`mcp-gateway-integration.md`](mcp-gateway-integration.md)
- Example MCP manifest: [`../examples/provider-mcp-support-agent.yaml`](../examples/provider-mcp-support-agent.yaml)
