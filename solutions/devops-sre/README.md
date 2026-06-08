# AgentID DevOps/SRE Solution Pack

This pack demonstrates an operational safety pattern for AI agents:

> Let agents help operate production without giving them standing production authority.

The pack models an SRE/release agent that may inspect logs and deployment
state, but needs short-lived scoped authority for production deploys,
rollbacks, and infrastructure apply actions.

## Included Files

- `provider-contract.yaml` - provider-published MCP authorization contract for
  DevOps control-plane tools.
- `enterprise-agent-manifest.yaml` - enterprise-side AgentID manifest for the
  platform release agent.
- `gateway-config.json` - reference MCP gateway adapter config using
  `context_args` for ops-specific bindings.
- `tools-list.json` - sample MCP `tools/list` output for analyzer and CI use.
- `mock-provider.ts` - mock DevOps MCP provider that verifies high-risk
  receipts and applies provider-side operational policy.
- `github-actions-provider.ts` - GitHub Actions MCP provider wrapper that
  verifies AgentID receipts before dispatching a workflow.
- `fixtures/` - sample JSON-RPC calls for allowed and denied flows.

## Operational Controls

Read-only diagnostics stay fast:

- `devops.logs.read`
- `devops.deployment.status`
- `devops.terraform.plan`

Production-changing actions require approval and JIT:

- `devops.deploy.production`
- `devops.rollback.production`
- `devops.terraform.apply`

The authorization decision is bound to operational context:

- `environment`
- `service_id`
- `repo`
- `branch`
- `commit_sha`
- `change_request_id`
- `incident_id`
- `deployment_id`
- `rollback_plan_id`
- `workspace`

## Validate The Pack

From the repository root:

```bash
agentid provider validate solutions/devops-sre/provider-contract.yaml
agentid validate solutions/devops-sre/enterprise-agent-manifest.yaml
agentid mcp analyze solutions/devops-sre/tools-list.json
agentid mcp check solutions/devops-sre/tools-list.json --max-risk critical
```

## Runtime Flow

```text
SRE / release agent
  -> enterprise MCP gateway
  -> AgentID /authorize
  -> downstream DevOps MCP server
```

## Run The Local Demo

Terminal 1: start the AgentID authorization service.

```bash
python -m agentid.cli gateway solutions/devops-sre/enterprise-agent-manifest.yaml \
  --host 127.0.0.1 \
  --port 8787 \
  --api-key dev-token
```

Terminal 2: start the mock DevOps MCP provider.

```bash
cd mcp-gateway-adapter
npm run mock-provider:devops
```

To use the GitHub Actions provider wrapper instead of the mock provider:

```bash
cd mcp-gateway-adapter
npm run github-provider:devops
```

By default, the GitHub provider runs in dry-run mode. To dispatch a real
workflow, set:

```bash
export GITHUB_TOKEN=github_pat_or_installation_token
export GITHUB_ACTIONS_EXECUTE=true
```

The token must be able to create workflow dispatch events for the target
repository. The workflow must support `workflow_dispatch`, and the request must
include `repo`, `workflow_id`, and `branch`.

Terminal 3: start the reference MCP gateway adapter.

```bash
cd mcp-gateway-adapter
npm run dev:devops
```

From the repository root, read logs through the gateway:

```bash
curl -s http://127.0.0.1:8788 \
  -H 'Content-Type: application/json' \
  -d @solutions/devops-sre/fixtures/allowed-read-logs.json
```

From the repository root, try a production deploy without JIT. AgentID should
deny it:

```bash
curl -s http://127.0.0.1:8788 \
  -H 'Content-Type: application/json' \
  -d @solutions/devops-sre/fixtures/denied-prod-deploy-no-jit.json
```

For high-risk actions, the gateway should request or receive a JIT grant first:

```bash
curl -s http://127.0.0.1:8787/jit-grants \
  -H 'Authorization: Bearer dev-token' \
  -H 'Content-Type: application/json' \
  -d '{
    "tool": "devops.deploy.production",
    "action": "execute",
    "resource": "service/checkout-api/environment/production",
    "approval_id": "approval-1",
    "user_id": "user-1",
    "job_id": "production_deploy",
    "environment": "production",
    "service_id": "checkout-api",
    "repo": "github.com/example/checkout",
    "workflow_id": "deploy-production.yml",
    "branch": "main",
    "commit_sha": "abc123",
    "change_request_id": "CHG-1042",
    "incident_id": "INC-2048"
  }'
```

The returned `jit_grant_id` is then inserted into
`fixtures/allowed-prod-deploy-with-jit.json`.

The allowed deploy then flows through both checks:

```text
AgentID allows the scoped tool call
  -> gateway forwards a signed HMAC demo receipt
  -> mock provider verifies the receipt
  -> mock provider logs agentid.provider.execution
```

Try the blocked Terraform workspace fixture after issuing a matching grant for
`devops.terraform.apply`. AgentID can authorize a scoped apply, but the mock
provider still denies `workspace=production-destroy` as provider business
authorization.

## Deployment Shape

For a real pilot:

1. Run AgentID as an internal authorization service or Cloudflare Worker.
2. Store tenant manifests outside process memory.
3. Persist JIT grants in Durable Objects, Redis, Postgres, or another
   single-use grant store.
4. Validate OIDC/JWT access tokens from the customer IdP.
5. Sign provider receipts with managed keys and publish JWKS.
6. Export decision logs to the existing audit/SIEM pipeline.
7. Keep provider business authorization in the DevOps control plane.

This pack is intentionally gateway-neutral. The same contract can sit in front
of an MCP server wrapping GitHub Actions, Argo CD, Kubernetes, Terraform Cloud,
PagerDuty, Datadog, or an internal deployment platform.
