# MCP behavior tests (preview)

Open the [MCP checker](https://mcpcheck.agentaction.dev/) and click **Run sample
tests**. All five checks run immediately against a synthetic fixture in your
browser. **Try a timeout** shows how an uncertain result stops further calls.
Neither sample contacts an MCP provider.

## Test your server

1. Choose **Test behavior → Test my server → Download local tester**. If you
   already inspected a server, its tools are available to prepare a plan first.
2. In the download folder, run this once using Node 22 or newer:

   ```bash
   node agentaction-mcp-tester.mjs
   ```

   No npm installation is needed. A local browser page opens automatically.
   Keep the terminal open; Ctrl+C stops the runner. If opening the browser fails,
   use the local URL printed in the terminal. Treat that per-launch URL as private.
3. Enter a staging endpoint and optional access token, then **Load tools**.
   Choose a tool and fill in synthetic sample inputs. Complex schemas use JSON.
4. Review the target and maximum call count, then click **Run tests**. Subsequent
   runs use the same button. Each run first reloads the catalog; a changed tool
   contract or negotiated protocol requires loading tools again.

The browser cannot start a native process from a website, so the setup command
is required for your own server. The hosted checker does not execute your tool
calls. The local runner talks directly to the selected endpoint and never uploads
the plan, token or results to AgentAction.

## Save once, run again

**Save plan** stores the current endpoint, selected tool contract, arguments,
expectations and probes in that browser. Choose a saved plan, **Load plan**, then
**Run tests**. Loading, importing and saving never execute calls.

**Export plan** downloads portable JSON. **Import plan** loads it for review.
The downloaded tester can include the current plan; running that file opens it
locally. There are at most 12 saved plans per browser origin. The local runner
prefers port 8789 so plans survive restarts; if occupied, it uses another port.
Use `--port 8789` to request a port or export JSON to move between origins.

Connection tokens are separate and excluded from plans. Sample arguments,
descriptions and expected text can themselves contain sensitive data: use staging
fixtures and review files before sharing. Clearing site data removes browser plans.

## What the five checks establish

| Check | Behavior and limits |
| --- | --- |
| Valid call | Validates sample inputs locally, then checks for a usable successful tool result and optional expected text. Does not prove the intended business action completed. |
| Argument rejection | Opt-in extra call removes the first required field and expects JSON-RPC invalid parameters or MCP `isError: true`. A subsequent discovery request checks that the server still responds. Use only a controlled fixture. |
| Structured output | Validates `structuredContent` against the tool's declared `outputSchema`. Without that schema the check is **Not run**; unsupported or unresolved schemas are **Inconclusive**. |
| Tool error handling | Opt-in extra call uses schema-valid arguments you deliberately expect to return `isError: true`. The runner does not invent provider-specific failure fixtures. |
| Response deadline | Measures the valid call against a configurable 50–10,000 ms deadline. The sample can simulate a timeout; the real runner does not inject delay into a provider. |

Each plan sends at most three tool calls, sequentially, with no automatic retry.
A timeout or transport failure stops further calls and leaves effects unknown.
Aborting a request does not roll back provider work. A process-wide limit also
ends unresponsive runs, reporting uncertainty rather than a confirmed dispatch
count. Optional checks stay **Not run** when not enabled. A **Passed** report can
therefore include untested checks; the summary always shows coverage out of five.

**Export report** writes a bounded report with fixed findings, call count,
timing, endpoint and tool name. Raw arguments, raw results and provider error
messages are excluded. Open it in the hosted checker under **Open a report from
a local or CI run**. Imported evidence is visibly labeled as not independently
verified. No report is a conformance, safety or exactly-once certificate.

## CI and command line

The standalone tester is also attached to the matching
[GitHub release](https://github.com/dinpd/AgentAction/releases).

```bash
node agentaction-mcp-tester.mjs --plan mcp-test-plan.json --run --out report.json
```

Set `MCP_TEST_TOKEN` in your CI secret environment when authentication is needed.
Never put it in the plan or command arguments. Exit codes are `0` passed, `1`
failed, and `2` inconclusive or startup failure. `--out` requires a new output
path and refuses to overwrite an existing file. `--no-open` disables automatic
browser opening; `--help` lists options.

## Transport and local boundary

Version one supports HTTP MCP endpoints with JSON/SSE response envelopes and an
optional bearer token, using the checker's supported protocol versions. Endpoints
must use HTTPS or HTTP loopback without query parameters, fragments or embedded
credentials. No stdio transport, OAuth login, custom headers or redirects.

The local UI listens only on `127.0.0.1`. Requests require the exact local Host,
Origin and a per-launch secret; inputs, call counts, runtime and memory are
bounded. Tokens remain in local process/page memory. Browser rendering uses text
nodes for provider metadata. A fresh catalog check prevents silently executing
against a changed saved contract. The preview intentionally does not claim full
JSON Schema compatibility, exhaustive MCP conformance, backend availability,
permission correctness, model tool selection, or verified business outcomes.
