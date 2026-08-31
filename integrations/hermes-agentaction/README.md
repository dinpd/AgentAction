# AgentAction for Hermes Agent

This native Hermes plugin observes model, tool, and subagent lifecycles in
fail-open shadow mode. It does not proxy MCP, return hook directives, change
tool arguments, attach receipts, or make observability a runtime dependency.

## Install

Hermes supports repository subdirectory installs:

```bash
hermes plugins install dinpd/AgentAction/integrations/hermes-agentaction --no-enable
hermes plugins enable agentaction
```

Set the tenant- and source-scoped token when prompted. Then configure the
plugin under `plugins.entries.agentaction.settings` in `~/.hermes/config.yaml`:

```yaml
plugins:
  entries:
    agentaction:
      settings:
        endpoint: https://gateway.example.com
        tenant_id: acme
        source_id: hermes-production
        agent_id: customer-support-hermes
        tool_policies:
          terminal:
            action: execute
            requires_approval: true
            max_calls_per_task: 20
          provider.billing.issue_credit:
            action: pay
            max_identical_calls_per_task: 1
```

Restart the Hermes gateway after enabling or changing the plugin.

## Hosted onboarding

The Hermes operator does not deploy a separate dashboard. Sign in to the hosted
AgentAction Observability operator console through Cloudflare Access, open
**Setup**, and:

1. Create or select a workspace, or redeem an invitation from its owner.
2. Under **Agent connections**, choose **Hermes Agent**, then name the source
   and agent. The console displays its source
   token once, plus the matching environment variable and YAML.
3. Store the token as `AGENTACTION_INGEST_TOKEN`, install and enable the plugin,
   and copy the tenant/source/agent values into the Hermes configuration.
4. Restart Hermes and perform one action. Setup changes from **Waiting for
   activity** to **Activity received**, and the event appears in Activity.

Owners and operators can create a source per environment, rotate a compromised
or lost token, and disable a retired source in the same screen. Only token
digests are retained. Viewers can inspect connection health and activity but
cannot change credentials.

For a self-hosted or manually managed deployment, provision one tenant record
and one source credential directly:

1. Generate a high-entropy token and give it only to the Hermes deployment as
   `AGENTACTION_INGEST_TOKEN`.
2. Store its lowercase SHA-256 digest—not the token—in the tenant manifest:

   ```yaml
   observability:
     ingestion:
       sources:
         hermes-production:
           enabled: true
           token_sha256: sha256:<64-lowercase-hex-digest>
           agent_ids:
             - customer-support-hermes
   ```

3. Make the plugin `tenant_id`, `source_id`, and `agent_id` exactly match that
   registration.
4. Grant operators the same tenant in the signed Cloudflare Access tenant
   claim. They can then open the hosted console's Activity view; the browser
   receives neither the source token nor the gateway credential.

Use one source token per environment or deployment. Rotation is a manifest
digest update plus an environment-secret update. Disabling a source immediately
stops new batches without affecting Hermes execution or previously stored
events.

The ingestion endpoint accepts only the strict privacy-safe schema, caps each
batch at 100 events and 256 KiB, treats exact retries as duplicates, and rejects
an event ID reused for different content. Storage and reads use the route
tenant's own durable namespace.

Until Hermes preserves Git metadata for subdirectory installs, update with a
fresh install:

```bash
hermes plugins install dinpd/AgentAction/integrations/hermes-agentaction --force
```

## Privacy boundary

The plugin constructs a strict observation object. It never serializes raw
prompts, user messages, conversation history, tool arguments, terminal
commands, tool results, subagent goals, subagent summaries, or provider
request/response bodies. Tool arguments may be hashed in memory only for
counterfactual duplicate-call budgets; that fingerprint is not exported.

## Intent binding

Set both `intent_id` and `intent_digest` only when the Hermes deployment is
already operating under an explicit AgentAction contract. The plugin marks all
other events `unbound`. It never converts prompt text, a Hermes session/task
identifier, or a model-generated goal into authoritative intent.

Intent profiles, contract issuance, trusted outcome observations, immutable
evidence snapshots, and final evaluation continue through the hosted
AgentAction intent-assurance APIs.

This makes intent a folded-in dimension of the Activity stream, not a second
Hermes integration. It remains a distinct assurance surface: Activity explains
what ran and what policy would have decided; intent contracts and final receipts
evaluate whether the declared outcome was achieved within its constraints.
