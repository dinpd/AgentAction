# AgentAction shadow observer installed

1. Enable the plugin with `hermes plugins enable agentaction`.
2. Configure `tenant_id`, `source_id`, and `agent_id` under
   `plugins.entries.agentaction.settings`.
3. Restart the Hermes gateway.

The plugin is fail-open and metadata-only by default. An ingestion token grants
write-only access to one registered tenant/source and cannot read dashboard
data.
