# Architecture

Storefront Voice Ops is an MCP server that exposes a small online store's operations as tools, so
an assistant (Alexa+, or the built-in simulator) can run the shop by voice.

```
Alexa+ (or the built-in simulator)
      |  MCP over Streamable HTTP — POST /mcp
      v
Express app (src/server.ts)
  - GET  /healthz        liveness
  - GET  /readyz         readiness (DB + store)
  - POST /mcp            MCP endpoint (stateless Streamable HTTP)
  - POST /api/chat       simulator agent (Bedrock Converse tool-use loop, offline fallback)
      |
      v
MCP server (src/mcp/, registered in src/tools.ts today)
  - tools / resources / prompts (Zod-validated)
  - safety layer: auth, origin check, rate limit, confirmation, audit (src/safety/)
      |
      +--> StoreAdapter (src/adapters/)
      |      |-- MockAdapter        deterministic demo + tests
      |      |-- ShopifyAdapter     GraphQL Admin API   (Stage 4)
      |      |-- WooCommerceAdapter REST v3             (Stage 4)
      |
      +--> Amazon Bedrock (Converse API)  briefings, drafting, agent loop
      |
      +--> SQLite (better-sqlite3)  pending actions + audit log
```

## Current state (Stage 1)

- Config (`src/config.ts`) validates the whole environment with Zod at startup.
- Health endpoints and structured logging (pino) with PII redaction are in place.
- The StoreAdapter interface and MockAdapter exist and pass a shared contract test suite.
- The MCP endpoint uses the SDK's stateless Streamable HTTP pattern (see
  [adr/0001](adr/0001-stateless-streamable-http.md)).

## Planned (see `STATUS.md`)

- Stage 2: safety layer and the full tool/resources/prompts catalog, one file per tool under
  `src/mcp/`.
- Stage 3: Bedrock intelligence layer with prompts, guardrails, and an evaluation set.
- Stage 4: Shopify and WooCommerce adapters.
- Stage 5: simulator UI.
- Stage 6+: AWS deployment, docs, open-source package split.
