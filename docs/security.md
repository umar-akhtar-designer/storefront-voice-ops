# Security

## Threat model (short)

- The MCP endpoint is publicly reachable when deployed, so it is the main attack surface.
- Write actions can change a real store. They must never run without an explicit, expiring
  confirmation and must always be audited.
- Store data (product names, customer notes) and model output are **untrusted** and must never be
  treated as instructions.

## Implemented (Stage 2)

- All environment configuration is validated with Zod at startup (`src/config.ts`).
- Structured logs via pino with redaction of `authorization`, cookies, tokens, secrets, emails,
  phones, and tracking numbers (`src/logger.ts`).
- Request body size limit (`REQUEST_BODY_LIMIT`).
- Typed store errors so upstream failures are handled explicitly.
- **Auth, two modes** (`AUTH_MODE`, `src/safety/auth.ts`):
  - `demo`: read tools open; an optional demo bearer token (`MCP_AUTH_TOKEN`) can gate `/mcp`.
  - `linked`: a bearer access token is required; missing/invalid tokens get `401` with
    `WWW-Authenticate: Bearer resource="<MCP_CANONICAL_URI>"` so Alexa+ triggers account linking.
    The token validator is pluggable; a full OAuth 2.1 (PKCE S256) authorization server is
    scheduled for the deployment stage.
- **Origin validation** on `/mcp` and `/api/chat` (DNS-rebinding protection); same-origin is always
  allowed; a `*` entry disables the check for the public demo.
- **Rate limiting** per token and per IP (`src/safety/rateLimit.ts`), with `X-RateLimit-*` headers
  and `Retry-After` on `429`.
- **Confirmation state machine** (`src/safety/confirm.ts`): one pending action per session/target,
  TTL `CONFIRM_TTL_SECONDS`, per-session isolation, spoken codes for destructive/large actions,
  idempotent confirmation (ADR-0003).
- **Audit log**: every write transition recorded with actor, session, tool, input, and result
  (`src/safety/audit.ts`, `audit_log` table).
- **Fail-closed sessions**: non-initialize requests without a session id return `400`; unknown
  session ids return `404`; unsupported methods return `405`.

## Planned (Stage 3+)

- **Prompt-injection defense**: store data is data; write tools stay confirmation-gated even if a
  model is manipulated (see `src/ai/guardrails.ts` in Stage 3).
- **Bedrock Guardrails** wiring for the briefing/draft prompts.
- Real OAuth 2.1 authorization server and per-merchant credential mapping for `linked` mode.

## Secrets

Secrets live only in environment variables or AWS Secrets Manager. `.env` is gitignored and
`.env.example` documents every variable. CI runs gitleaks over the full history and `npm audit`.

## Reporting

See [SECURITY.md](../SECURITY.md).
