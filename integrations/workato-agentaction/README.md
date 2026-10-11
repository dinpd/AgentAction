# Workato governed refund reference

This reference connects Workato recipe execution to AgentAction's existing
approval, single-use JIT authorization, intent contracts, execution receipts,
and frozen outcome evaluation. All payments and refunds are synthetic.

The deployed example is at https://agentaction-workato-demo.drisw.workers.dev.
The private Workato project is **AgentAction Governed Refund Demo**; recipe
**Governed Support Refund — AgentAction** is recipe `386130` in the trial
workspace. Credentials are provisioned separately and never included in exports.

## Flow

1. A recipe function receives a stable business request ID, payment ID, integer
   amount in USD cents, currency, and reason (`duplicate_charge` or
   `service_failure`). Request governed refund creates an immutable proposal.
2. AgentAction binds an intent contract and checks policy before creating an
   exact-scope human approval request. Requests over USD 100 are denied without
   touching the provider.
3. Workato's Wait for refund outcome action uses a durable continuation at
   60-second intervals. It reads state for at most 30 minutes; it never grants
   approval. The review URL is in the request action's output.
4. A separate reviewer opens that URL and reviews the payment, amount, reason,
   and scope digest. Approve exact scope and execute consumes one JIT grant and
   invokes the internal mock provider.
5. A signed provider read-back is verified independently of the authorization
   decision. AgentAction finalizes the intent with a frozen evidence snapshot.
   The recipe returns status, verdict, qualified success, and evidence links.

Workato's `reinvoke_after` mechanism is described in the official
[multistep action guide](https://docs.workato.com/en/developing-connectors/sdk/guides/building-actions/multistep-actions.html).
The connector must be released before testing in a recipe; the SDK Test code
panel cannot test a suspended multistep action.

## Deploy and connect

From this directory, run `npm ci`, `npm test`, and `npm run build`. Deploy using
`npm run deploy` under your own Cloudflare account. Three SQLite Durable Object
bindings hold adapter state, mock-provider state, and the existing AgentAction
authorization journal. This is a separate deployment from the production gateway.

Provision two independently generated random bearer tokens (at least 32
characters), one for `recipe` and one for `reviewer`. Store only their SHA-256
hashes in the `WORKATO_CLIENTS_JSON` Worker secret:

```json
[
  {
    "token_sha256": "<64 lowercase hex characters>",
    "tenant_id": "demo",
    "subject": "workato",
    "agent_id": "support-agent",
    "role": "recipe"
  },
  {
    "token_sha256": "<different hash>",
    "tenant_id": "demo",
    "subject": "human-reviewer",
    "agent_id": "support-agent",
    "role": "reviewer"
  }
]
```

Use `wrangler secret put WORKATO_CLIENTS_JSON` with private input. Do not commit
the input file or raw tokens. Tenant, subject, and agent identities come from
this secret; callers cannot supply or override them. Keep both tokens outside
logs and job data. Store only the recipe token in a private Workato connection.
The reviewer token belongs in the review page's password field, held in memory
only. Access ends when its hash is removed from the Worker secret.

Build the native RLCM import package from the reviewed source assets:

```bash
python3 build-package.py --output /tmp/agentaction-workato-reference.zip
```

In Workato, open **Tools → Recipe lifecycle management → Import**, choose the
zip, and select a fresh project. The package contains the recipe, connector,
and a connection placeholder. Save and release the imported private connector,
then configure its connection with the HTTPS adapter origin and recipe token;
the package deliberately has no URL or token. The recipe remains stopped on
import. Inspect the recipe's connector, connection, and field mappings before
starting it. Its custom-provider alias is portable rather than an original
account ID. The imported assets use distinct Reference names so they can coexist
with the live showcase in the same workspace. No finance-app connection is needed. For manual setup, `connector.rb`
is also available separately. GitHub releases include the generated import zip.

## Demo checks

Use a fresh business ID for each scenario. A retry must retain its original ID.

| Scenario                 | Input/action                                                           | Expected                                                                               |
| ------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Approved                 | USD 49 (`4900` cents), `pi_demo_001`, duplicate charge                 | Pending with zero mutations; separate review produces one refund and qualified success |
| Policy denied            | `10100` cents                                                          | Denied, zero mutations, no approval                                                    |
| Human denied             | Submit USD 49 and select Deny in reviewer page                         | Denied, zero mutations                                                                 |
| Changed retry            | Reuse an ID with another amount or payment                             | HTTP 409 before mutation                                                               |
| Exact replay             | Resubmit or Resume or replay approved refund with original ID          | Same refund ID, `replayed=true`, mutation count remains one                            |
| Acceptance response lost | Enable the connector's optional fault checkbox, then retry the same ID | First response HTTP 504; retry recovers the durable pending proposal                   |
| Approval expires         | Wait beyond the 30-minute approval TTL                                 | Expired, zero mutations                                                                |

The acceptance-response fault happens before human approval. Separate automated
restart tests cover failure **after provider success**, recovery of the original
refund, and crashes around observation storage and finalization. Do not confuse
these two failure points.

Run the live synthetic smoke test with private token files:

```bash
python3 smoke.py --url https://YOUR-WORKER.workers.dev \
  --recipe-token-file /private/path/recipe.token \
  --reviewer-token-file /private/path/reviewer.token
```

This program approves a synthetic request as an automated reviewer fixture;
it validates the authorization boundary, not the human review experience.

The reference was also imported into a fresh project in the trial workspace,
creating a new private connector and an unconfigured connection placeholder.
After configuring the connection separately, the imported recipe completed its
pending → reviewer approval → one refund → qualified-success flow. This validates
dependency remapping without reusing the original demo assets. A second account
was not available for a separate cross-account test.

## Recovery, evidence, and limits

Execution journals uncertainty before consuming authority or mutating the
provider. On recovery it reads the provider's durable result. If no result can
be confirmed, the request becomes `unknown` and requires operator
reconciliation; the adapter never blindly retries the mutation. The mock also
binds its durable idempotency key to the exact immutable scope.

Authenticated `GET /requests/:id/evidence` returns the intent, authorization,
signed-observation provenance, final receipt, and correlated Workato recipe/job
IDs. It retains the original JWS and public key so its signature can be checked
after the run. The reviewer page displays this timeline. The provider signing
key is held privately in its Durable Object, and its public key arrives over an internal
binding. This demonstrates a runtime trust boundary within one deployment;
it is not an independent financial audit or externally anchored JWKS trust.

This bounded demo supports 250 business requests per tenant, 20 job correlations
per request, 40 timeline entries, USD only, and a USD 100 execution cap. It has
no production payment integration, SSO reviewer directory, automatic uncertain
mutation reconciliation, retention policy, or credential rotation UI. Those are
separate production integration requirements. The Python wheel contains the
existing CLI; use this repository directory for the Worker and connector.
