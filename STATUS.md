# STATUS

Living project status for **Storefront Voice Ops**. Updated at the end of every work session.

- Hackathon: Build, Ship, Shape: Amazon Developer Hackathon (Devpost)
- Track: Alexa+
- Mini challenges: AWS Builder, Open Source
- Official deadline: 24 Oct 2026, 12:00 am GMT+5 (midnight at the end of Fri 23 Oct)
- Internal submission target: Thu 22 Oct

## Done

### Stage 1 — foundation

- Repo skeleton: MIT LICENSE, `.gitignore`, `.env.example`, README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT.
- Tooling: TypeScript (strict, ESM), ESLint flat config, Prettier, Vitest, tsx.
- CI: `.github/workflows/ci.yml` (typecheck, lint, format check, test, build, gitleaks, npm audit).
- Container: multi-stage `Dockerfile` (non-root, healthcheck) and `docker-compose.yml`.
- Config (`src/config.ts`, Zod), logger (`src/logger.ts`, pino + PII redaction), health endpoints
  `/healthz` and `/readyz`.
- Persistence: `src/db/schema.sql` + `src/db/index.ts` (better-sqlite3).
- Adapters: `StoreAdapter` interface, typed errors, `MockAdapter`, shared contract test suite.
- Docs: `docs/alexa-plus-notes.md`, `architecture.md`, `security.md`, `tool-reference.md`,
  `aws-usage.md`, `friction-log.md`, ADRs 0001/0002/0004.

### Stage 2 — safety layer + full tool catalog

- **Safety** (`src/safety/`): origin/DNS-rebinding guard, in-memory rate limiter (per token/IP),
  auth (`demo`/`linked`, `WWW-Authenticate` challenge, `safeEqual`), confirmation state machine with
  TTL + spoken codes + per-session isolation, and an audit logger.
- **Persistence**: `PendingActionRepository` and `AuditRepository` (`src/db/repositories.ts`);
  `pending_actions` gained a `code` column.
- **Full catalog** (`src/mcp/`): 18 tools (10 read, 2 draft, 3 write, 3 control), 3 resources
  (`store://summary`, `store://low-stock`, `store://pending-orders`), 3 prompts
  (`morning-briefing`, `weekly-review`, `restock-run`).
- **Stateful sessions** for confirmation continuity (ADR-0005); `/mcp` now issues `mcp-session-id`,
  returns `400` without it and `404` for unknown sessions.
- `src/voice.ts`: speech formatting (money, ids, lists, sentence limit).
- `src/mcp/writeExecutors.ts`: single execution path for confirmed writes.
- Adapter contract extended with `cancelOrder`; `MockAdapter` implements it.
- Deleted the scaffold's `src/tools.ts` / `src/data.ts` (superseded); build now cleans `dist` first.
- Docs updated: `tool-reference.md`, `architecture.md`, `security.md`, ADR-0003, ADR-0005.
- **Verified**: `typecheck`, `lint` (0 errors), `format:check`, `test` (83 tests across 10 files),
  `build`, and a full `npm run dev` + `npm run test:smoke` flow (briefing → list pending → ship →
  confirm → inspect) all pass.

### Stage 6 — deployment prep (mock provider)

- `DEMO_MODE` flag; `GET /api/demo` and `POST /api/demo/reset` (guarded by origin + rate limit)
  reseed the mock store and clear pending actions + audit log.
- Adapter contract gained an optional `reset()` for disposable demo providers; `MockAdapter.reset()`
  rebuilds from seed.
- Docker hardening: `init`, `read_only`, `no-new-privileges`, `cap_drop: ALL`, `tmpfs: /tmp` in
  `docker-compose.yml`; added `.dockerignore`.
- Deploy files: `.github/workflows/deploy.yml` (OIDC → ECR → ECS, gated on `AWS_DEPLOY=true`),
  `deploy/aws/ecs-task-definition.json` (Fargate + EFS + CloudWatch), `deploy/README.md`.
- `docs/aws-usage.md` updated; `HUMAN_TASKS.md` lists the external blockers.
- **Verified**: typecheck, lint, format, **86 tests** (11 files), build. Container build not verified
  (no Docker daemon in the agent environment — see `HUMAN_TASKS.md`).

## In progress

- Stage 6 is code-complete; the real deploy is blocked on an AWS account and a domain. Next:
  Stage 3 (Bedrock), Stage 5 (simulator UI + Playwright), Stage 4 (adapters), Stage 7
  (docs/open-source), Stage 8 (submission).

## Blocked / waiting on a human

- Public GitHub repo creation and first push (Lead).
- AWS account, billing alarm, Bedrock model access (AWS owner).
- Shopify development store + custom-app token (Backend).
- WooCommerce test-site keys (Backend).
- Alexa developer account login for `alexa-ai` (Lead).
- Devpost draft form field inventory; video recording and final submit (Lead).

## Questions for the lead

- Do hackathon participants get real Alexa+ access to test an MCP add-on? (Ask in Discord; record in
  `docs/alexa-plus-notes.md`.)
- Does the Resources page add requirement details for the Alexa+ track?

## Decisions log

See `docs/adr/`. Notable decisions so far:

- TypeScript pinned to 6.0.3 (latest stable supported by typescript-eslint 8.71.2) — ADR-0004.
- Confirmation gate with tiered spoken codes for destructive/large actions — ADR-0003.
- Stateful MCP sessions keyed by `mcp-session-id`, confirmation persisted in SQLite — ADR-0005
  (supersedes the stateless note in ADR-0001).
- Adapter code lives in `src/adapters/`; the publishable `packages/store-adapters` split is scheduled
  for the open-source phase (Stage 7).
