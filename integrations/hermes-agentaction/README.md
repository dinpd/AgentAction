# AgentAction for Hermes Agent

This native Hermes plugin observes session, model, tool, and subagent lifecycles in
fail-open shadow mode. It does not proxy MCP, change tool arguments, attach
receipts, or make observability a runtime dependency. Optional agent-declared
intent capture adds bounded model context and two structured self-attestation
tools, so that feature is explicit rather than pure shadow mode.

## Install

Hermes supports repository subdirectory installs:

```bash
hermes plugins install dinpd/AgentAction/integrations/hermes-agentaction --no-enable
```

Store the tenant- and source-scoped token as `AGENTACTION_INGEST_TOKEN`, then
configure the plugin under `plugins.entries.agentaction.settings` in
`~/.hermes/config.yaml`:

```yaml
plugins:
  entries:
    agentaction:
      settings:
        endpoint: https://gateway.example.com
        tenant_id: acme
        source_id: hermes-production
        agent_id: customer-support-hermes
        capture_declared_intent: true
        tool_policies:
          terminal:
            action: execute
            requires_approval: true
            max_calls_per_task: 20
          provider.billing.issue_credit:
            action: pay
            max_identical_calls_per_task: 1
```

Enable the configured plugin, then restart the Hermes gateway:

```bash
hermes plugins enable agentaction
```

An enabled plugin with missing connection settings stays inert so Hermes can
continue running. Add the missing token and tenant ID, then restart Hermes.

## Hosted onboarding

The Hermes operator does not deploy a separate dashboard. Sign in to the hosted
AgentAction Observability operator console through Cloudflare Access, open
**Setup**, and:

1. Create or select a workspace, or redeem an invitation from its owner.
2. Under **Agent connections**, choose **Hermes Agent**, then name the source
   and agent. The console displays its source
   token once, plus the matching environment variable and YAML.
3. Store the token as `AGENTACTION_INGEST_TOKEN`, install the plugin, copy the
   tenant/source/agent values into the Hermes configuration, and enable it.
4. Restart Hermes and run one turn. Setup changes from **Waiting for
   activity** to **Activity received**, lifecycle events appear in Activity,
   and the completed turn appears in Jobs. With the hosted YAML, Jobs also
   shows the agent's declared goal and terminal self-assessment.

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

The ingestion endpoints accept only strict privacy-safe schemas. Activity
batches are capped at 100 events and 256 KiB. Run lifecycle writes are
capped at 16 KiB, bound server-side to the authenticated tenant, source, and
agent, and cannot carry an arbitrary intent profile or contract. Exact retries
are idempotent. Storage and reads use the route tenant's own durable namespace.

Until Hermes preserves Git metadata for subdirectory installs, update with a
fresh install:

```bash
hermes plugins install dinpd/AgentAction/integrations/hermes-agentaction --force
```

## Privacy boundary

The plugin constructs strict observation and lifecycle objects. It never serializes raw
prompts, user messages, conversation history, tool arguments, terminal
commands, tool results, subagent goals, subagent summaries, or provider
request/response bodies. When declared-intent capture is enabled, it exports
only the allowlisted, bounded goal, success criteria, constraints, confidence,
and terminal self-assessment supplied through its tools. The injected guidance
explicitly tells the model not to include secrets, personal data, or copied raw
content. Tool arguments may be hashed in memory only for
counterfactual duplicate-call budgets; that fingerprint is not exported.

## Intent binding

Without an explicit intent binding, each completed Hermes turn/run is finalized
under the server-owned `agentaction_observed_execution.v1` profile. This makes
the run visible in **Jobs** and evaluates only whether the observed run
reached a successful terminal lifecycle state. The console labels it **Observed
execution** and states that no semantic intent was inferred.

Set `capture_declared_intent: true` to give Hermes a short `pre_llm_call`
instruction and the `agentaction_declare_intent` and
`agentaction_report_outcome` tools. The first tool freezes a concise declared
goal, success criteria, constraints, and confidence for the run. The second
records the agent's terminal status, criteria/constraint assessment, and
confidence. The gateway evaluates these under the server-owned
`agentaction_declared_intent.v1` profile. A pass requires a completed run plus
the agent reporting `achieved`, all criteria met, and constraints respected.

These values are agent-generated claims. The console labels them
**Agent-declared intent** and **self-attested**; they are not trusted user intent,
independent outcome evidence, authorization, or approval. If the model omits
the declaration, the plugin falls back to the observed-execution lifecycle Job.
If capture or export fails, Hermes continues normally.

Set both `intent_id` and `intent_digest` only when the Hermes deployment is
already operating under an explicit AgentAction contract. Explicit bindings
take precedence over the built-in observed-execution job. The plugin never
converts prompt text, a Hermes session/task/turn identifier, or a model-generated
goal into authoritative semantic intent.

Intent profiles, contract issuance, trusted outcome observations, immutable
evidence snapshots, and final evaluation continue through the hosted
AgentAction intent-assurance APIs.

This makes intent a folded-in dimension of the Activity stream, not a second
Hermes integration. It remains a distinct assurance surface: Activity explains
what ran and what policy would have decided; intent contracts and final receipts
evaluate whether the declared outcome was achieved within its constraints.
