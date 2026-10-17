# Architecture

Storefront Voice Ops is an MCP server that exposes a small online store's operations as tools, so
an assistant (Alexa+, or the built-in simulator) can run the shop by voice.

```
Alexa+ (or the built-in simulator)
      |  MCP over Streamable HTTP — POST /mcp  (stateful sessions)
      v
Express app (src/server.ts)
  - GET  /healthz        liveness
  - GET  /readyz         readiness (DB + store)
  - POST /mcp            MCP endpoint (stateful Streamable HTTP, one server per session)
  - GET/DELETE /mcp      server-to-client stream / session termination
  - POST /api/chat       simulator agent (Bedrock Converse tool-use loop, offline fallback)
      |
      |  safety middleware: origin check -> rate limit -> auth  (src/safety/)
      v
MCP server (src/mcp/buildServer.ts, one instance per session)
  - tools   (src/mcp/tools/*)     read / draft / write / control
  - resources (src/mcp/resources.ts)
  - prompts (src/mcp/prompts.ts)
  - context  (src/mcp/context.ts)   adapter + confirm + audit + ai, per-session actor/sessionId
      |
      +--> StoreAdapter (packages/store-adapters/, published as @voice-ops/store-adapters)
      |      |-- MockAdapter        deterministic demo + tests
      |      |-- ShopifyAdapter     GraphQL Admin API
      |      |-- WooCommerceAdapter REST v3
      |
      +--> AiService (src/ai/)      briefings, drafting, explanations
      |      +--> Amazon Bedrock (Converse API)   when USE_BEDROCK=1
      |      +--> offline templates               always available
      |
      +--> SQLite (better-sqlite3)  pending_actions + audit_log
```

## Data flow for a write

1. The model calls a write tool (for example `mark_order_shipped`).
2. The tool validates a preflight condition, writes a **pending action** to SQLite, and returns a
   spoken confirmation prompt with `confirmationRequired: true`.
3. The owner says "yes". The assistant calls `confirm_action` **on the same session**.
4. The safety layer validates the action (session match, not expired, code if required), then the
   write executor performs the change through the `StoreAdapter`.
5. The action is marked `confirmed` and both the confirmation and the execution are written to the
   audit log. A second confirm is idempotent and does not re-run.

## Current state (Stage 6)

- Config (`src/config.ts`) validates the whole environment with Zod at startup.
- Health endpoints and structured logging (pino) with PII redaction are in place.
- The StoreAdapter interface and MockAdapter exist and pass a shared contract test suite.
- **Safety layer**: origin guard, in-memory rate limiter, auth (`demo`/`linked`), confirmation state
  machine, and an audit logger (`src/safety/`).
- **Full catalog**: 18 tools, 3 resources, and 3 prompts, all on the StoreAdapter
  (`src/mcp/`, see `docs/tool-reference.md`).
- **Stateful sessions** so confirmation survives across calls (ADR-0005).
- `src/voice.ts` formats money, ids, and lists for speech.
- **AI layer** (`src/ai/`): `AiService` with a Bedrock implementation (`bedrock.ts`) and an offline
  template implementation (`offline.ts`); `createAiService()` picks between them. Guardrails
  (`guardrails.ts`) sanitize and wrap untrusted store data; an eval set lives in `eval/`
  (`npm run eval`).
- **Deployment** (`deploy/`): Docker, ECS Fargate task definition, and a gated GitHub Actions
  deploy workflow; `DEMO_MODE` exposes a reset endpoint for the public (mock) demo.
- **Simulator UI** (`public/`): a three-pane web app (conversation, store state, inspector) with Web
  Speech input/output. It calls `POST /api/chat` and `GET /api/state`; Playwright covers it in
  `test/e2e/`.

## Planned (see `STATUS.md`)

- Stage 7: open-source package split and docs polish.
