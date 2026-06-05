Agreed. Retry suppression is the missing operational test.

I like keeping the receipt state machine separate from provider business logic:

- `admitted`: this exact request was accepted for possible execution;
- `completed`: the provider has a prior outcome for the same action/receipt id;
- `denied`: policy, user, or provider refused before execution;
- `expired`: the receipt is no longer fresh;
- `out_of_scope`: request digest, resource, action, or policy context no longer
  matches;
- `already_consumed`: the receipt cannot authorize another mutation.

That makes the non-normative example testable without turning MCP core into a
receipt-schema standard. The key acceptance criterion is: retry after timeout
does not mean duplicate mutation.

I will fold this into the example shape as a stable action/receipt ID plus
canonical request digest, with a note that provider idempotency keys can link to
that ID but should not be the only verifier-readable boundary.
