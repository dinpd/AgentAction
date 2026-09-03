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
   shows the agent's declared goal, terminal self-assessment, model, and
   provider-reported token usage.
5. Optionally open **Evals**. Workspace owners can create an immutable eval
   version and assign it to this source, this agent, both, or the workspace
   default. The assignment affects new Jobs; it does not change the source
   credential or rewrite historical Jobs.

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
terminal self-assessment, and optional refund-triage criterion statuses supplied
through its tools. Criterion evidence is limited to the six known
`refund_triage.v2` IDs, one status, and one to four identifier-only references
per criterion. It cannot contain free-form explanations, prompts, customer
content, or arbitrary fields. The injected guidance
explicitly tells the model not to include secrets, personal data, or copied raw
content. Tool arguments may be hashed in memory only for
counterfactual duplicate-call budgets; that fingerprint is not exported.
Model telemetry is metadata-only: provider/model names, request counts, and
nonnegative token counters reported by the provider. Pre-request input counts
are labeled approximate in Activity. Completed requests and Jobs show only
provider-reported actual usage, including separate uncached and cached input
when Hermes supplies that split, along with coverage when some requests omit
usage. An explicitly reported zero cache count remains zero; a missing cache
count remains not reported. Per-job aggregation is capped at 10,000 requests
and 20 model groups.

## Intent binding

Without an explicit intent binding, each completed Hermes turn/run is routed
to the built-in `observed_execution.v1` eval/profile. This makes
the run visible in **Jobs** and evaluates only whether the observed run
reached a successful terminal lifecycle state. The console labels it **Observed
execution** and states that no semantic intent was inferred.

Set `capture_declared_intent: true` to give Hermes a short `pre_llm_call`
instruction and the `agentaction_declare_intent` and
`agentaction_report_outcome` tools. The first tool freezes a concise declared
goal, success criteria, constraints, and confidence for the run. The second
records the agent's terminal status, criteria/constraint assessment, and
confidence. By default, the gateway evaluates these under the built-in
`agent_declared_intent.v1` eval/profile. A pass requires a completed run plus
the agent reporting `achieved`, all criteria met, and constraints respected.

When the workspace assigns `refund_triage.v2`, the outcome tool also accepts an
optional `criterion_evidence` list for its six fixed criteria. The plugin binds
that list to the active server-issued Job and exports it with immutable
`agent_self_attested` trust. The gateway rejects unknown or duplicate criteria,
unbounded or free-form references, a mismatched Job/eval binding, and conflicting
replays. An omitted criterion remains insufficient evidence; the plugin does not
invent a pass. System-observed evidence still takes precedence when it exists.

These values are agent-generated claims. The console labels them
**Agent-declared intent** and **Self-attested by agent**; they are not trusted user intent,
independent outcome evidence, authorization, or approval. If the model omits
the declaration, the plugin falls back to the observed-execution lifecycle Job.
If capture or export fails, Hermes continues normally.

Workspace eval assignments can replace either built-in with a named,
immutable version of the same evaluator kind. Routing precedence is exact
source+agent, agent, source, then workspace default. The gateway freezes the
resolved eval and assignment when the Job starts. V1 does not define arbitrary
rubrics or invoke an independent model judge: `agent_declared` remains an
explicitly self-attested evaluator, while `observed_execution` remains a
lifecycle-state evaluator. An assignment whose kind does not match the Job is
rejected rather than silently evaluating different evidence.

The console also offers a versioned `refund_triage.v2` deterministic template.
It freezes six bounded checks for the policy outcome, applicable rules,
invented facts, ambiguity escalation, shadow-mode non-execution, and evidence
capture. Criterion results contain only pass, fail, or insufficient evidence,
bounded explanations and evidence references, and frozen evaluator provenance;
the template does not send prompts or results to an independent model judge.

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

## Meaningful demo workflow

The [synthetic support-triage example](../../examples/hermes-support-triage/)
provides a repeatable Hermes workflow with a bounded refund policy, eligible,
ineligible, and manual-review cases, read-only constraints, expected decisions, and live
AgentAction verification steps. Use it to demonstrate meaningful declared goals
and honest non-qualified outcomes without introducing real customer data or
external side effects.
