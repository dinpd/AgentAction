# MCP behavior tests (preview)

Open the [MCP checker](https://mcpcheck.agentaction.dev/), enter an endpoint,
and **Check server**. Review the findings, then **Test a tool** to continue in
the same tab. If the endpoint needs sign-in, the contextual test link also works
without a successful anonymous inspection.

## Test your server

The [signed-in test page](https://observability-console.agentaction.dev/mcp-tests)
keeps the server you chose. With a connected staging server, choose a tool, fill
in synthetic inputs, review the target and call count, then **Run test**. No
local installation is needed. Owners and operators can execute tests; viewers
can open retained results. Nothing executes on navigation or plan loading.

If the server isn't connected, a workspace owner can **Connect server** on the
same page. That click approves the displayed endpoint for the workspace and
loads its catalog, without executing a tool. Connection options support initialized
2025 protocols and 2026-07-28; an inspected or imported protocol is preserved.
An optional bearer token is stored
on the server and shared with the workspace. OAuth and other connection settings
remain in the existing connection manager. A missing requested endpoint never
silently switches execution to another server.

If a plan is already open, the button carries it to the cloud page for review.
It never executes on arrival. The plan travels in a URL fragment that the page
removes after sign-in; browsers may retain sensitive inputs in history. Use
synthetic data. Cloud execution sends the reviewed plan to AgentAction; the
connected account's credentials stay on the server and are not copied into the
public checker, plan or report.

Cloud runs require an approved connected public HTTPS endpoint without query
parameters. Version one permits 20 runs per workspace per day, a 45-second overall
limit and 18,000-byte plans. Schemas are limited to 160 nodes and eight levels,
with up to 24 properties per object and scalar enum/const values. References,
patterns, formats and compositions are unsupported. Fixture inputs permit up to
eight levels, 64 items/fields per container, 2,000 total nodes and 4,000 characters
per string. Unsupported fixtures are inconclusive and dispatch no tool calls.
Use the local runner for private endpoints or contracts beyond the hosted subset.

**Recent results** retains bounded reports for 24 hours. Opening them sends
no tool calls. A durable claim binds each request ID to the reviewed plan and
connection: repeated requests return retained evidence, changed plans conflict,
and interrupted requests become inconclusive with unknown effects. Expired IDs
without a retained claim are rejected. A deliberate new click creates a new run;
review uncertain provider effects before doing so. There are no automatic retries.

## Run locally

1. Open **Examples, saved plans and local testing → More options → Run on your
   computer** and **Download local tester**. On the signed-in page, start at
   **More options**. An inspected server can prefill the download.
2. In the download folder, run this once using Node 22 or newer:

   ```bash
   node agentaction-mcp-tester.mjs
   ```

   No npm installation is needed. A local browser page opens automatically.
   Keep the terminal open; Ctrl+C stops the runner. If opening the browser fails,
   use the local URL printed in the terminal. Treat that per-launch URL as private.
3. Enter a staging endpoint and optional access token, then **Load tools**.
   Choose a tool and fill in synthetic sample inputs. Complex schemas use JSON.
4. Review the target and maximum call count, then click **Run test**. Subsequent
   runs use the same button. Each run first reloads the catalog; a changed tool
   contract or negotiated protocol requires loading tools again.

The browser cannot start a native process from a website, so the setup command
is required for local execution. Anonymous inspection remains discovery-only;
cloud execution uses the authenticated workspace flow. The local runner talks
directly to the selected endpoint and never uploads
the plan, token or results to AgentAction.

## Save once, run again

**Save test** stores the current endpoint, selected tool contract, arguments,
expectations and probes in that browser. Selecting a **Saved test** loads it for
review; **Run test** reruns it. There is no separate load step. Loading, importing
and saving never execute calls. Rename a plan under **More options → Plan files**.

Under **More options → Plan files**, **Export plan** downloads portable JSON. **Import plan** loads it for review.
The downloaded tester can include the current plan; running that file opens it
locally. There are at most 12 saved plans per browser origin. The local runner
prefers port 8789 so plans survive restarts; if occupied, it uses another port.
Use `--port 8789` to request a port or export JSON to move between origins.

On the cloud page, browser-saved plans are scoped to the selected workspace.
Cloud execution uses existing workspace credentials; local connection tokens
are separate and excluded from plans. Sample arguments,
descriptions and expected text can themselves contain sensitive data: use staging
fixtures and review files before sharing. Clearing site data removes browser plans.

## Try an example

Under **More options → Try a synthetic example**, **Run example** runs all five
checks in your browser. **See a timeout** shows how uncertainty stops further
calls. Neither example contacts a provider. On the public starting page, first
open **Examples, saved plans and local testing**.

## What the five checks establish

| Check | Behavior and limits |
| --- | --- |
| Valid call | Validates sample inputs locally, then checks for a usable successful tool result and optional expected text. Does not prove the intended business action completed. |
| Argument rejection | Opt-in extra call removes the first required field and expects JSON-RPC invalid parameters or MCP `isError: true`. A subsequent discovery request checks that the server still responds. Use only a controlled fixture. |
| Structured output | Validates `structuredContent` against the tool's declared `outputSchema`. Without that schema the check is **Not run**; unsupported or unresolved schemas are **Inconclusive**. |
| Tool error handling | Opt-in extra call uses schema-valid arguments you deliberately expect to return `isError: true`. The runner does not invent provider-specific failure fixtures. |
| Response deadline | Measures the valid call against a configurable 50–10,000 ms deadline. The sample can simulate a timeout; the real runner does not inject delay into a provider. |

The valid-call check verifies required payload fields for text, image, audio,
resource-link and embedded-resource blocks using the
[MCP content schema](https://modelcontextprotocol.io/specification/2025-11-25/schema#contentblock).
Malformed required fields fail the check; unsupported block types make it
inconclusive. Media and resource references are never fetched or rendered.

Each plan sends at most three tool calls, sequentially, with no automatic retry.
A timeout or transport failure stops further calls and leaves effects unknown.
Aborting a request does not roll back provider work. A process-wide limit also
ends unresponsive runs, reporting uncertainty rather than a confirmed dispatch
count. Optional checks stay **Not run** when not enabled. A **Passed** report can
therefore include untested checks; the summary always shows coverage out of five.

**Export this result → Download report JSON** writes a bounded report with fixed findings, call count,
timing, endpoint and tool name. Raw arguments, raw results and provider error
messages are excluded. Open it in the hosted checker under **More options → Open a local or CI report**. Imported evidence is visibly labeled as not independently
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
