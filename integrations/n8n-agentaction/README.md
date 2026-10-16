# n8n governed-action reference

Connect native n8n workflows to AgentAction's automatic policy or separate human
approval, scope-bound single-use authorization, execution receipts, signed
provider read-back, and frozen outcome evidence. The example uses **synthetic
USD refunds only, capped at $100**. No payment account is connected.

Two inactive imports use only built-in n8n nodes:

- `workflows/automatic.json`: submit an exact business request under automatic
  policy and return its final status and evidence.
- `workflows/human-review.json`: submit a proposal, persist a 70-second Wait,
  check status until review finishes or a 30-minute polling deadline passes,
  and return status and evidence. It never approves or executes a refund itself.

The Worker shares the tested refund engine with the Workato reference. Its
credentials, Durable Objects, intent profile (`n8n_refund.v1`), signed-provider
issuer/audience, and workflow/execution correlations belong to a separate n8n
deployment. Existing Workato deployments retain their identifiers and records.

## Import and connect

1. Deploy the reference Worker from this directory with `npm ci`, `npm test`,
   `npm run build`, then `npm run deploy` in your Cloudflare account. It is
   separate from the production gateway and Workato demo.
2. Generate independent random bearer tokens of at least 32 characters for the
   workflow and reviewer. Store **only SHA-256 hashes** in the private
   `N8N_CLIENTS_JSON` Worker secret with `wrangler secret put N8N_CLIENTS_JSON`:

   ```json
   [
     {"token_sha256":"<64 lowercase hex characters>","tenant_id":"demo","subject":"n8n","agent_id":"support","role":"recipe"},
     {"token_sha256":"<different hash>","tenant_id":"demo","subject":"human-reviewer","agent_id":"support","role":"reviewer"}
   ]
   ```

   The shared engine calls the workflow role `recipe` for compatibility. Identity
   comes from the secret, never caller fields. Remove a hash to revoke access.
3. Import either JSON file through n8n's **Import from File** menu. GitHub
   releases include `agentaction-n8n-reference.zip`; unzip it first and import
   the JSON files individually. No custom/community node is required.
4. In **Refund inputs**, replace the placeholder with your trusted HTTPS Worker
   origin and enter the business request ID, payment ID, integer cents, USD,
   and `duplicate_charge` or `service_failure`. **Retain the same request ID on
   retry**; use a fresh ID for a different business request. The n8n execution
   ID is correlation only and never the idempotency key.
5. Create a private **Header Auth** credential: Name `Authorization`, Value
   `Bearer <workflow token>`. Select it on **every HTTP Request node**. Never
   paste tokens into node fields, expressions, exports, or execution data.
   HTTP redirects are disabled to keep this credential at the configured origin.
6. Select **Execute workflow**. For human review, open the returned
   `approval_url` or the Worker `/review` page in a separate browser and enter
   the **reviewer token** there. Review exact payment, amount, reason and scope
   digest; approve or deny. Keep this token outside n8n.

Imports are inactive and have a manual trigger, so they expose no webhook.
They can be adapted to an existing trigger once the boundary and business-ID
mapping have been reviewed. The demo operates on one request per execution.

n8n's [import documentation](https://docs.n8n.io/workflows/export-import/),
[Header Auth credentials](https://docs.n8n.io/integrations/builtin/credentials/httprequest/),
and [Wait node documentation](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.wait/)
cover the native mechanisms. A Wait below 65 seconds stays in memory; the
reference uses 70 seconds so paused execution data is saved to the database.

## What to verify

| Scenario | Expected outcome |
| --- | --- |
| Automatic $49 (`4900` cents) | `succeeded`, `qualified_success=true`, one mutation, no approval, signed frozen evidence |
| Same ID and scope again | Same refund, `replayed=true`, mutation count remains one |
| $101 (`10100` cents), fresh ID | `denied`, zero mutations, no qualified success |
| Same ID with changed scope or authorization mode | HTTP 409 before another mutation |
| Human review $49 | `pending`, zero mutations until separate approval; next poll returns signed verified outcome |
| Workflow credential attempts approval | HTTP 403 |
| Human denies or approval expires | `denied` or `expired`, zero mutations |
| Poll deadline reached while pending | `pending`, `polling_timed_out=true`, no qualified success; inspect the review page |
| Interrupted/uncertain execution | `reconciliation_required=true` for nonterminal recovery states; inspect before retrying |

A successful n8n execution can contain a handled **policy denial**. Check refund
`status`, `qualified_success`, and signed `evidence`; workflow completion alone
is not evidence of a successful refund. Pending/denied/expired requests do not
have finalized evidence; `Read frozen evidence` returns the available timeline
and includes the frozen snapshot only when finalization has completed.

A final status check may occur up to one 70-second interval after the polling
deadline, plus HTTP latency. The deadline does not cancel the adapter request. Approval has
its own 30-minute TTL, which starts when the server creates the proposal. Check
status before taking further action after a polling timeout. HTTP calls have a
30-second timeout; submit retries are bounded to three attempts and retain the
same business scope. For a lost acceptance response, rerun with the original ID.

## Automated native-runtime demo

The acceptance harness provisions generated synthetic credentials in a private
local directory, starts loopback-only n8n and workerd, imports both workflows,
and executes automatic success, same-ID replay, cap denial, separate-reviewer
approval, and pending timeout. It stops n8n while a 70-second Wait is persisted,
approves separately, restarts n8n, and verifies the original execution resumes
with one mutation and signed evidence. The reviewer is an automated fixture;
this verifies authorization and native runtime behavior, not human usability.

Use Node 24+ and install the tested n8n version separately from Worker packages:

```bash
npm ci
npm install --prefix /tmp/agentaction-n8n-runtime n8n@2.43.7
python3 runtime-smoke.py --n8n-bin /tmp/agentaction-n8n-runtime/node_modules/.bin/n8n
# Add --keep-running --directory /private/path/n8n-demo to inspect the local UI.
python3 build-package.py
```

The harness prints a credential-free validation report and the path to a private
login/reviewer credential file. Never share that file, the n8n database, runtime
logs, or local exports. The installed n8n runtime is a QA dependency, not bundled
or deployed with the Worker. Its upstream dependency audit includes high and
critical advisories; this harness limits it to loopback, generated credentials,
trusted synthetic inputs, disabled community packages and the six required
built-in node types. These controls limit the QA exposure and do not fix those
upstream packages. Do not expose this QA installation or use it with production
credentials. Use your maintained n8n deployment for real use.

## Evidence and reference limits

`GET /requests/:id/evidence` requires authentication and includes the intent,
authorization, signed provider attestation and public key, observation
provenance, frozen finalization when available, timeline, and n8n workflow and
execution IDs. Initial correlations are frozen with the outcome; subsequent
retry correlations appear only in the mutable request journal.

The provider signs inside a separate Durable Object in the same deployment.
This is a runtime trust boundary, not an independent financial audit or
externally anchored JWKS trust. Unknown mutations require operator
reconciliation; recovery reads the provider result and never blindly repeats a
mutation. The demo retains at most 250 requests per tenant, 20 correlations per
request and 40 timeline entries. It has no production payment integration,
reviewer SSO, automatic uncertain-mutation reconciliation, credential rotation
UI or production retention policy. Python release artifacts contain the CLI;
the Worker and workflows are supplied here and in the release archive.
