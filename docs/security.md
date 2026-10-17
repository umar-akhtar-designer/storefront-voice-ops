# Security

## Threat model (short)

- The MCP endpoint is publicly reachable when deployed, so it is the main attack surface.
- Write actions can change a real store. They must never run without an explicit, expiring
  confirmation and must always be audited.
- Store data (product names, customer notes) and model output are **untrusted** and must never be
  treated as instructions.

## Implemented (Stage 1)

- All environment configuration is validated with Zod at startup (`src/config.ts`).
- Structured logs via pino with redaction of `authorization`, cookies, tokens, secrets, emails,
  phones, and tracking numbers (`src/logger.ts`).
- Request body size limit (`REQUEST_BODY_LIMIT`).
- Typed store errors so upstream failures are handled explicitly.

## Planned (Stage 2+)

- **Auth, two modes** (`AUTH_MODE`):
  - `demo`: public judge link; read tools open; write tools run only against the disposable demo
    dataset. Optional demo bearer token on `/mcp`.
  - `linked`: OAuth 2.1 with PKCE (S256). Validate the access token, check the `resource`/audience
    equals `MCP_CANONICAL_URI`, and map the token to one merchant's store credentials. Return
    `401` with a proper `WWW-Authenticate` header so Alexa+ triggers account linking.
    Decision recorded in `docs/adr/`.
- **Origin validation** on `/mcp` (DNS-rebinding protection); bind to localhost in development.
- **Rate limiting** per token and per IP.
- **Confirmation state machine**: write tools create a pending action (TTL `CONFIRM_TTL_SECONDS`);
  `confirm_action` executes it; cancel and expiry are audited; expired actions never run.
- **Audit log**: every write transition recorded with actor, tool, input, and result.
- **Prompt-injection defense**: store data is data; write tools stay confirmation-gated even if a
  model is manipulated (see `src/ai/guardrails.ts` in Stage 3).

## Secrets

Secrets live only in environment variables or AWS Secrets Manager. `.env` is gitignored and
`.env.example` documents every variable. CI runs gitleaks over the full history and `npm audit`.

## Reporting

See [SECURITY.md](../SECURITY.md).
