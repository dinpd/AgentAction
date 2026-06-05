Thanks, this is a useful production detail.

I agree that a receipt hint should identify the receipt profile strongly enough
for a verifier to know the outcome vocabulary and semantics, not just discover a
loose schema. In regulated flows, an open-ended `status` or free-text `reason`
is weak evidence.

I would keep this generic in the A2A Agent Card extension, though. Rather than
binding the example to one receipt format, the card could expose an optional
receipt profile/format identifier:

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
  "receipt_verification": "signed_or_introspected",
  "receipt_profile_uri": "urn:example:authority-receipt:v1"
}
```

That profile URI can point to a format with closed outcome semantics. For
payment/compliance flows, something like the x402 compliance receipt profile may
be appropriate. For broader delegated authority flows, another profile might
define outcomes such as `ALLOW`, `REFER`, and `DENY`, where `REFER` means
escalation to a human, approval workflow, or higher-authority policy system
rather than final denial.

So I think the Agent Card should advertise the receipt transport, binding
requirements, verification mode, and optional profile identifier. The linked
authority contract or receipt profile should define the exhaustive outcome
enumeration and domain-specific evidence rules.
