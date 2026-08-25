# Maintainers

This file records the people and review areas responsible for AgentAction. Keep it
current as maintainership changes.

## Current Maintainers

| Area | Maintainer(s) |
| --- | --- |
| Project governance | @dinpd |
| Python core and schemas | @dinpd |
| TypeScript guard package | @dinpd |
| Provider middleware | @dinpd |
| Documentation and examples | @dinpd |
| Security response | @dinpd |

## Review Areas

- **Python core and schemas:** `agentid/`, `schema/`, `scripts/`, `tests/`,
  `pyproject.toml`
- **TypeScript guard:** `packages/guard/`
- **TypeScript client SDK:** `sdk/typescript/`
- **Provider middleware:** `packages/provider-express/`,
  `packages/provider-fastapi/`
- **Cloudflare gateway and demos:** `cloudflare/`, `demo/`,
  `solutions/devops-sre/`
- **Documentation and examples:** `README.md`, `docs/`, `examples/`,
  package README files
- **Repository automation:** `.github/`, `action.yml`

## Maintainer Duties

- Review contributions in assigned areas.
- Keep public APIs, schemas, examples, and docs coherent.
- Require tests for behavior changes.
- Protect security-sensitive paths from accidental weakening.
- Coordinate releases and security fixes.
- Enforce the [Code of Conduct](CODE_OF_CONDUCT.md).

## Updating This File

Maintainer changes should be made in a pull request. The PR should describe the
new role, scope, and rationale.
