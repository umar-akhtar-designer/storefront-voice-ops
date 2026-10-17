# Storefront Voice Ops

> Run your online store by talking to Alexa+, with real actions behind every answer.

Storefront Voice Ops is an open-source MCP server (Streamable HTTP, MCP spec `2025-11-25`) that
lets a small online store owner run their shop by voice through Alexa+. It connects to a real
Shopify or WooCommerce store, uses Amazon Bedrock for intelligence, and protects every write
action with a confirmation step and an audit log.

Ask things like:

- "How did my store do today?"
- "What is running low?"
- "Ship order 1042 with TCS."
- "Draft a restock message to my hoodie supplier."

> Status: **early build**. The MCP server, tool layer, adapters, and safety layer are being built
> in stages. Any capability described here is only claimed once it exists in code and is tested.

## Try it in 60 seconds

A public demo endpoint and simulator link will be published here once deployed (see
[Hackathon](#hackathon)). Until then, run it locally:

```bash
git clone <repo-url> && cd storefront-voice-ops
npm install
cp .env.example .env
npm run dev      # http://localhost:3000  MCP endpoint: /mcp
```

## Hackathon

- Track: **Alexa+**
- Mini challenges: **AWS Builder**, **Open Source**
- Proof that the track technology is really used in code:
  - MCP server entry point: `src/server.ts`
  - Tool registration: `src/mcp/` (tools/resources/prompts)
  - Bedrock integration: `src/ai/bedrock.ts`
  - Reusable adapter package: `src/adapters/` (publishable as `packages/store-adapters/` in Stage 7)

## Architecture

```
Alexa+ (or the built-in simulator)
      |  MCP over Streamable HTTP — POST /mcp  (stateful sessions)
      v
Storefront Voice Ops MCP server (Node + TypeScript)
  - tools / resources / prompts (Zod-validated)
  - safety: auth, origin check, rate limit, confirmation, audit
  - StoreAdapter interface
      |-- MockAdapter      (deterministic demo + tests)
      |-- ShopifyAdapter   (GraphQL Admin API)
      |-- WooCommerceAdapter (REST v3)
  - Amazon Bedrock (Converse API) for briefings, drafting, and the agent loop
      |
  SQLite (local) / DynamoDB (cloud) for pending actions and the audit log
```

## Tools

18 tools, 3 resources, and 3 prompts are documented in
[docs/tool-reference.md](docs/tool-reference.md).

## Safety design

- Read tools answer instantly.
- Write tools are **confirmation-gated**: the first call returns a pending action; only
  `confirm_action` executes it, and the action expires after `CONFIRM_TTL_SECONDS`.
- Destructive or large-impact actions (`cancel_order`, a stock change of 50+ units) also require a
  **spoken code**, so a misheard "yes" alone cannot fire them.
- Confirmations are keyed per MCP session, so a "yes" in one session never runs another's action.
- Every write is recorded in the audit log (who, what, and the outcome).
- All inputs are validated with Zod; model output and tool arguments are treated as untrusted.
- Store data (product names, notes) is data, never instructions.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev          # start the server (http://localhost:3000)
npm test             # unit + contract tests (Vitest)
npm run test:smoke   # MCP client smoke test against a running server
npm run eval         # AI eval set (offline; USE_BEDROCK=1 to run against the model)
npm run typecheck    # TypeScript
npm run lint         # ESLint
```

### Environment variables

See [.env.example](.env.example) for the full list. Never commit a real `.env`.

## Connecting Alexa+

Connection details are recorded in [docs/alexa-plus-notes.md](docs/alexa-plus-notes.md), including
confirmed facts from the Amazon Developer documentation and any open questions. The project also
ships a simulator web app so there is always a working link to demo.

## AWS services used

Documented in [docs/aws-usage.md](docs/aws-usage.md) as they are added.

## What was built during the hackathon

The repository was created inside the submission window. The starting point was a small scaffold
(7 tools on mock data, a Bedrock briefing helper, and a smoke test); everything else is being built
during the event. See `STATUS.md` and the git history.

## License

MIT — see [LICENSE](LICENSE). Contributions welcome, see [CONTRIBUTING.md](CONTRIBUTING.md).
