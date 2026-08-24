# AgentPass Interoperability Positioning

Interoperability and conformance are the open ecosystem strategy for AgentAction,
the trust-infrastructure product built through AgentPass-compatible artifacts.
The canonical platform scope is defined in [Project Positioning](positioning.md).

This document focuses on the Action Authorization control surface and its
provider trust boundary. It does not reduce the broader project to that one
surface.

Its focus is the provider trust boundary:

> Can a provider independently verify that this exact action, with these
> arguments, was authorized for this principal, agent, runtime, delegation,
> policy, approval, audience, and time window—and handle it without unsafe
> replay?

## What AgentPass Composes

AgentPass reuses existing work rather than defining a general agent identity:

- OpenID Connect and OAuth establish principals, clients, delegation,
  resources, and audiences.
- SPIFFE and WIMSE address executing workload identity and workload-to-workload
  security.
- AuthZEN separates policy enforcement from policy decision and is developing
  approval and MCP authorization mappings.
- MCP authorization secures access to MCP servers.
- JOSE/JWKS, COSE, and HTTP Message Signatures provide established signing and
  request-integrity building blocks.
- Shared Signals can communicate lifecycle, risk, and revocation changes.
- Provenance and receipt formats can describe what happened after dispatch.

AgentPass experiments at the seam between those layers: canonical action
binding, signed authorization evidence, independent provider verification,
single-use or retry-safe consumption, and linked execution closure.

## Contribution Boundary

AgentPass should contribute, in this order:

1. field mappings and explicit assumptions;
2. positive and negative interoperability vectors;
3. reference verifiers and provider middleware;
4. conformance tests and implementation reports;
5. narrowly scoped profiles where existing standards leave choices open; and
6. proposed new vocabulary only when multiple implementations demonstrate a
   gap that cannot be addressed by profiling existing standards.

AgentPass should not present itself as an agent identity provider, universal
agent registry, new DID method, OAuth replacement, or complete authorization
standard.

## Evidence of Progress

Documentation alone is not the success criterion. The useful milestones are:

- independent implementations canonicalize the same action identically;
- providers accept the same valid evidence and reject the same invalid cases;
- replay, retry, revocation, and partial execution have explicit outcomes;
- execution closure remains linked to the authorized action; and
- implementation feedback is contributed to the relevant standards groups.

The strongest milestone is two independent providers passing the same public
suite without AgentPass-specific coordination at runtime.

## Current Public Artifacts

- [Agentic Identity Standards Crosswalk](agentic-identity-standards-crosswalk.md)
- [MCP Authorization Interoperability Vector v1](../fixtures/mcp-authorization-interoperability-v1/)
- [MCP Authorization Conformance Suite v2](../fixtures/mcp-authorization-conformance-v2/)
- [Provider receipt profiles](receipt-profiles.md)

These artifacts are experimental unless explicitly identified as an adopted
external standard. Passing an AgentPass suite is not certification by IETF,
OpenID, W3C, SPIFFE, NIST, ISO, or the MCP project.
