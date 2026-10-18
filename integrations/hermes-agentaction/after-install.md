# AgentAction shadow observer installed

1. Store the source token as `AGENTACTION_INGEST_TOKEN`.
2. Configure `tenant_id`, `source_id`, and `agent_id` under
   `plugins.entries.agentaction.settings`.
3. Optionally set `capture_declared_intent: true` to add bounded intent/outcome
   self-attestation tools. This changes model context and is not pure shadow mode.
4. Enable the plugin with `hermes plugins enable agentaction`.
5. Restart the Hermes gateway.

The plugin is fail-open and metadata-only by default. An ingestion token grants
write-only access to one registered tenant/source and cannot read dashboard
data. Completed Hermes turns/runs appear in Jobs under the built-in **Observed
execution** lifecycle profile; this does not infer semantic intent from prompts.
With declared-intent capture enabled, Jobs labels the model's declaration and
terminal report as self-attested rather than trusted user intent.

For opt-in enforcement, open **My agents → Connect a Hermes agent** in the
protected console and follow the [execution adapter setup](README.md#opt-in-execution-supervisor-preview).
Save its separate execution token as `AGENTACTION_EXECUTION_TOKEN`, copy the
supervisor settings and enable `execution_enabled: true` in a dedicated trusted
profile. Every tool then blocks until an exact console approval and durable
single-use claim. Ingestion configuration is optional for execution mode.
