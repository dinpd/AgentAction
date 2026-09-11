# Practical recipe sources and connection checks

Checked 2026-09-11. The recipes are maintained by AgentAction, not endorsed or published by these providers.

## Public Firecrawl probe

[Machine-readable result](firecrawl-public-probe.json) records a successful anonymous
MCP initialize, tools/list and one firecrawl_scrape call against the provider's public
pricing page. The response included pricing Markdown. No model was involved and no
historical comparison, scheduler, baseline persistence or end-to-end agent behavior was
tested. Full page content is not redistributed; the record includes its hash and length.
This is point-in-time connection evidence, not an uptime guarantee or agent certification.

To repeat with an MCP client, connect to `https://mcp.firecrawl.dev/v2/mcp`, initialize,
list tools, and call `firecrawl_scrape` with:

```json
{"url":"https://www.firecrawl.dev/pricing","formats":["markdown"],"onlyMainContent":true,"maxAge":0}
```

Do not use this single retrieval as a claim of price changes. Establish a baseline and
run the recipe's sandbox scenarios separately. Keyless usage limits may change.

## Provider sources

- [Firecrawl official server](https://github.com/firecrawl/firecrawl-mcp-server): endpoint, authentication and scrape tool.
- [Intercom MCP guide](https://developers.intercom.com/docs/guides/mcp): US workspace support, conversation/article reads, create_article with draft state. No conversation write is assumed by this recipe.
- [Sentry official server](https://github.com/getsentry/sentry-mcp) and [provider tool usage](https://github.com/getsentry/sentry-agent-skills/blob/main/skills/sentry-fix-issues/SKILL.md): hosted connection and get_issue_details.
- [Linear MCP guide](https://linear.app/docs/mcp) and [provider tool list](https://linear.app/integrations/slack): list_issues, get_issue and save_issue.

Intercom, Sentry and Linear were checked against documentation only. No authenticated
workspace was connected and no article or ticket was created. Their live schemas and
permissions must be checked during adoption. All catalog fixtures are synthetic
observations; sandbox procedures are test plans, not completed test records.
