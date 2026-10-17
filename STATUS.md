# STATUS

Living project status for **Storefront Voice Ops**. Updated at the end of every work session.

- Hackathon: Build, Ship, Shape: Amazon Developer Hackathon (Devpost)
- Track: Alexa+
- Mini challenges: AWS Builder, Open Source
- Official deadline: 24 Oct 2026, 12:00 am GMT+5 (midnight at the end of Fri 23 Oct)
- Internal submission target: Thu 22 Oct

## Done

- Repo skeleton: MIT LICENSE, `.gitignore`, `.env.example`, README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT.
- Tooling: TypeScript (strict, ESM), ESLint flat config, Prettier, Vitest, tsx.
- CI: `.github/workflows/ci.yml` (typecheck, lint, format check, test, build, gitleaks, npm audit).
- Container: multi-stage `Dockerfile` (non-root, healthcheck) and `docker-compose.yml`.
- Config: `src/config.ts` (Zod-validated environment).
- Logger: `src/logger.ts` (pino, PII redaction).
- Health endpoints: `/healthz` (liveness) and `/readyz` (store + DB reachability).
- Persistence: `src/db/schema.sql` + `src/db/index.ts` (better-sqlite3).
- Adapters: `src/adapters/` StoreAdapter interface, typed errors, MockAdapter with a configurable clock, and a shared contract test suite.
- MCP Inspector installed (`@modelcontextprotocol/inspector@2.11.0`) with an `npm run inspect` script.
- Docs: `docs/alexa-plus-notes.md`, `docs/architecture.md`, `docs/security.md`, `docs/tool-reference.md`, `docs/aws-usage.md`, `docs/friction-log.md`, and ADRs 0001/0002/0004.
- Verified: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` (27 tests), `npm run build`, and `npm audit` (0 vulnerabilities) all pass; `npm run dev` + `npm run test:smoke` work end to end.

## In progress

- Stage 2 next: safety layer (auth, origin, rate limit, audit, confirmation) and the full tool catalog.

## Blocked / waiting on a human

- Public GitHub repo creation and first push (Lead).
- AWS account, billing alarm, Bedrock model access (AWS owner).
- Shopify development store + custom-app token (Backend).
- Alexa developer account login for `alexa-ai` (Lead).
- Devpost draft form field inventory (Lead).

## Questions for the lead

- Do hackathon participants get real Alexa+ access to test an MCP add-on? (Ask in Discord; record in `docs/alexa-plus-notes.md`.)
- Does the Resources page add requirement details for the Alexa+ track?

## Decisions log

See `docs/adr/`. Notable decisions so far:

- TypeScript pinned to 6.0.3 (latest stable supported by typescript-eslint 8.71.2). See `docs/adr/0004-typescript-version.md`.
- MCP server uses the SDK stateless Streamable HTTP pattern for now; revisit session mode once a real Alexa+ add-on can be tested.
- Adapter code currently lives in `src/adapters/`; the standalone publishable `packages/store-adapters` split is scheduled for the open-source phase (Stage 7).
