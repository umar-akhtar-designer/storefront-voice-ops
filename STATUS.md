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

### Stage 3 — Bedrock intelligence layer

- `AiService` implemented in `src/ai/`: `bedrock.ts` (Converse API, per-method system prompts,
  optional Bedrock Guardrails) and `offline.ts` (deterministic templates). `createAiService()` picks
  based on `USE_BEDROCK`; every Bedrock call degrades to the offline template on any error.
- The service is wired into the MCP context (`ServerDeps.ai`), so briefing/weekly-report tools and
  both draft tools rephrase with Bedrock when enabled.
- **Guardrails** (`src/ai/guardrails.ts`): sanitize/wrap untrusted store data, injection heuristic,
  shared system rule — defense in depth on top of the confirmation gate.
- **Eval set** in `eval/` (`cases.ts`, `run.ts`, `ai-eval.ts`) with `npm run eval`; 8 cases assert
  voice length, no markdown, required facts, and injection resistance. Runs against Bedrock when
  `USE_BEDROCK=1`.
- Docs: `architecture.md`, `security.md`, `README.md` updated.
- **Verified**: typecheck, lint, format, **104 tests** (14 files), `npm run eval` 8/8, build.

### Stage 5 — simulator UI + end-to-end tests

- Three-pane simulator in `public/` (`index.html`, `styles.css`, `app.js`): conversation, live store
  state, and an inspector showing each tool call plus the audit log.
- Web Speech input (microphone) and spoken replies, with a type-in fallback everywhere.
- Served by Express at `/`; talks to `POST /api/chat` and the new read-only `GET /api/state`
  snapshot; shows the demo reset button when `DEMO_MODE` is on.
- **Playwright** e2e (`test/e2e/simulator.spec.ts`, `playwright.config.ts`): page load, low-stock
  question (asserts reply + tool trace), and the full ship → confirm → audit flow. Playwright starts
  the dev server itself.
- CI: new `e2e` job (installs Chromium, runs `npm run test:e2e`, uploads the report).
- **Verified**: typecheck, lint, format, **105 tests** (15 files), `npm run test:e2e` 3/3, build.

### Stage 4 — Shopify and WooCommerce adapters

- `src/adapters/http.ts`: shared HTTP layer (timeout, retry on 429/5xx respecting `Retry-After`,
  upstream JSON responses mapped onto typed `StoreError`s: `NOT_FOUND` / `UNAUTHORIZED` /
  `RATE_LIMITED` / `UPSTREAM`).
- `src/adapters/shopify.ts`: Admin **GraphQL** adapter — orders (incl. cancelled/fulfilled status
  mapping and tracking), order fulfilment (`fulfillmentCreateV2` with trackingInfo), cancellation
  (`orderCancel` with staff note), variant catalogue, inventory adjustments (location resolved from
  the inventory level), customers. `mapShopify*` mapping helpers are exported and unit-tested.
- `src/adapters/woocommerce.ts`: **REST v3** adapter — orders with the Woo status union (`pending`
  - `processing` + `on-hold` → pending; `completed` → shipped; `cancelled/refunded/failed` →
    cancelled), tracking and cancellation reasons persisted in order `_meta_data`, product-level
    `low_stock_amount` used as the reorder point.
- `createStoreAdapter()` now serves `shopify` and `woocommerce` modes; `STORE_PROVIDER` in
  `.env.example` documents the switch.
- Tests: WooCommerce runs the full **shared adapter contract** against an in-memory fake of the
  WordPress REST endpoints; Shopify mapping helpers + GraphQL interactions (filters, write paths,
  error mapping, credential guards) are unit-tested with a fake fetch. **136 tests** (17 files).
- Docs: README (connecting a real store), architecture.

### Stage 7 — open-source adapter package

- Adapter code moved to a real npm workspace: `packages/store-adapters` → **`@voice-ops/store-adapters`**
  (`StoreAdapter` types, typed errors, shared HTTP layer, `MockAdapter`, `ShopifyAdapter`,
  `WooCommerceAdapter`, `defineAdapterContract` barrel export, own tsconfig/package.json/README). The
  app now consumes it as a dependency (`src/adapters/factory.ts` keeps provider selection).
- Adapters no longer import app config; they take explicit options and fall back to the documented
  env vars when standalone (`SHOPIFY_*`, `WOO_*`), so the package is publishable on its own.
- Build wiring: the package compiles itself (tsconfig with declarations); root `typecheck` builds it
  first, `npm install` runs a `prepare`-style build, and the Dockerfile copies `packages/` into the
  CI build stage. Lint/format/coverage include the package; emitted `dist` is ignored.
- All 136 tests, the e2e suite, and the production `npm start` (compiled dist) verified against the
  package's built output.
- Docs: ADR-0002 updated (split done), README hackathon/architecture sections, architecture diagram.

## In progress

- Stages 6, 5 and 4 are code-complete. Next: Stage 8 (submission).

## Blocked / waiting on a human

- Public GitHub repo creation and first push (Lead).
- AWS account, billing alarm, Bedrock model access (AWS owner).
- Shopify development store + custom-app token (Backend) — needed to run the adapter contract
  against a live store (`defineAdapterContract("ShopifyAdapter", ...)` is ready to wire).
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
- Adapter code lives in `packages/store-adapters/` and is published as `@voice-ops/store-adapters`
  (open-source phase, Stage 7).
