Thanks, this framing makes sense to me.

I agree the Agent Card should separate:

1. where to discover the authority contract, and
2. what minimum receipt interface the server expects at task time.

The detailed policy should stay in the linked authority contract, but a small
public hint like `receipt_transport`, `receipt_binds`, and
`receipt_verification` gives clients/gateways enough information to interoperate
without baking AgentPass-specific behavior into A2A.

I like the proposed shape:

```json
{
  "receipt_transport": "message.metadata.agentid_receipt",
  "receipt_binds": [
    "agent_id",
    "principal_id",
    "task_id",
    "action",
    "resource",
    "authority_decision_id"
  ],
  "receipt_verification": "signed_or_introspected"
}
```

One nuance I would suggest is treating `receipt_binds` as a minimum public
binding set. The linked authority contract can still define stricter
provider/tool-specific bindings, such as approval ID, JIT grant ID,
customer/case/resource fields, amount, or tenant-specific constraints.

This lines up with the AgentPass implementation direction: identity/capability
discovery stays in the card, authority policy stays in the linked contract, and
each high-risk task carries a short-lived signed receipt bound to the concrete
action/resource.
