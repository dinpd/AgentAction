# Agent Identity Is Not Agent Authority

AI agent security is quickly converging on a useful idea: agents need durable,
verifiable identities.

That is the right starting point. It is not the finish line.

An enterprise does need to know which agent is calling, who operates it, which
organization issued its identity, and whether the claim can be verified. DID,
Verifiable Credentials, OAuth/OIDC, workload identity, signed Agent Cards, and
agent badges all help with that problem.

But identity does not answer the runtime question that matters most before a
tool executes:

> Should this agent perform this action on this resource, for this user, job,
> customer, approval, and time window?

That is the authority problem.

## Identity Is Necessary

Identity standards make agent ecosystems more portable and auditable.

- A DID can give an agent a cryptographically verifiable identifier.
- A Verifiable Credential can let an issuer attest to claims about an agent.
- OAuth/OIDC can prove access to an enterprise or provider boundary.
- A2A Agent Cards can publish agent capabilities and authentication
  requirements.
- AGNTCY Agent Badges can wrap agent metadata in a verifiable credential.

These are important primitives. They help answer:

- Who is this agent?
- Who issued or controls its identity?
- Can the identity claim be verified?
- Has some party attested to properties of this agent?

## Authority Is Different

Production agent risk usually appears after identity has succeeded.

An agent can have a valid identity and still attempt the wrong operation. It
might call a write-capable tool outside the current case, move data between
systems that should not be connected, reuse broad standing authority, call a
provider tool without a scoped approval, or delegate work to another agent with
too much privilege.

The runtime authority question is narrower and more operational:

- Which tool is being called?
- Which action is requested?
- Which resource, account, customer, job, or case is affected?
- Is the user or tenant in scope?
- Is approval required?
- Is there a short-lived JIT grant?
- Is the authorization receipt bound to the exact tool call?
- Can the provider verify the enterprise-side authorization decision?
- What audit evidence exists if the call is allowed or denied?

This is the layer AgentPass is focused on.

## A Practical Split

A useful architecture separates the layers:

```text
OAuth/OIDC proves access to an enterprise or provider boundary.
DID proves portable cryptographic identity.
Verifiable Credentials prove signed claims about an agent.
AgentPass decides what the verified agent may do at tool-execution time.
```

That means AgentPass should not replace distributed identity standards. It should
make them more useful by giving them an authorization payload:

```text
verified agent
  -> declared authority contract
  -> runtime policy check
  -> scoped JIT grant when needed
  -> signed authorization receipt
  -> provider verification
  -> execution audit
```

## Why Tool-Execution Authority Matters

Consider a support agent resolving a customer case. The agent may need read
access to CRM records, write access to update a billing email, and financial
authority to issue a credit.

Those actions should not share one broad permission.

The read may be allowed with delegated access. The write should be bound to the
current case and customer. The credit should require approval, an amount limit,
a short-lived JIT grant, and provider-side verification before execution.

Identity proves which agent is acting. Authority proves whether this exact
agent-originated action should proceed.

## The Missing Interop Payload

MCP authorization, A2A, OAuth/OIDC, DID, and Verifiable Credentials each cover
important parts of the ecosystem. What is still underdefined is a portable,
machine-readable authority contract for agent tool execution:

```text
tool -> action
tool arguments -> protected resources
job/case/customer -> authorization context
approval/JIT -> execution precondition
receipt -> provider-verifiable proof
execution receipt -> shared audit handle
```

That is where AgentPass fits.

The goal is not another identity system or another gateway. The goal is an
authorization contract that gateways, agent runtimes, providers, and security
teams can review, enforce, and audit before high-impact tool calls execute.

## The Short Version

Agent identity tells you who is calling.

Agent authority tells you what that verified caller may do right now.

Enterprise agent deployments need both.
