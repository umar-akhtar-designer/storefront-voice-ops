# Devpost submission draft

Copy-and-paste draft for the Devpost form. Placeholders marked `<>` must be filled by the lead
(repo URL, demo URL, video URL, AWS account decisions). Word counts aim at the usual Devpost limits
(~2 000-char description, ~30-word tagline). **Submit before the deadline: 24 Oct 2026, 12:00 am
GMT+5** (internal target: 22 Oct).

## Basics

- Project name: **Storefront Voice Ops**
- Tagline: `Run a Shopify or WooCommerce store by voice, with an MCP server that asks permission
before every write.`

## What inspired us

A small online store owner in Karachi keeps Shopify, WhatsApp, and a notebook open at the same time.
Order status questions arrive at 2 a.m.; restocks happen when someone remembers. Voice assistants
can answer these questions instantly — but nobody wants an assistant that mutates a live catalogue
or cancels orders on a misheard word.

So we built the assistant we would actually trust: every safe read is instant, every write passes a
typed confirmation, and everything lands in an audit log.

## What it does

- MCP over Streamable HTTP with **18 tools**, 3 resources and 3 prompts: read orders, catalogue and
  stock; brief the owner for today and the week; draft customer replies; execute ship/cancel/restock
  behind a spoken confirmation gate.
- Connects to **Alexa+** via MCP add-on account linking (OAuth 2.1, PKCE S256), and ships a
  three-pane **web simulator** (Web Speech in/out) so anyone can demo it from a browser.
- Pluggable stores: `@voice-ops/store-adapters` (open-source npm package) with a deterministic mock
  for demos/tests, a Shopify Admin GraphQL adapter, and a WooCommerce REST v3 adapter, all held to
  one shared behavioural contract.
- Amazon Bedrock (Nova) rephrases briefings and drafts when the account has model access and degrades
  to deterministic templates otherwise; an eval set (`npm run eval`) covers voice length, required
  facts, and prompt-injection resistance in both modes.

## How we built it

- **Alexa+ / MCP**: `@modelcontextprotocol/sdk` on Streamable HTTP; stateful sessions keyed by
  `mcp-session-id`; sessions are seeded in the same SQLite database used for confirmations, pending
  actions, and the audit trail.
- **Safety layer**: origin allowlist → rate limits → token auth → confirmation codes (4-digit,
  spoken-friendly, TTL) → JSONL audit log. Ship/cancel/restock can never execute without the code;
  shipped orders refuse cancellation.
- **AWS**: Amazon Bedrock (Nova Lite via Converse, optional Guardrails) for the intelligence layer;
  ECS Fargate with EFS for the SQLite volume, ECR and CloudWatch in `deploy/` (gated workflow);
  voice-friendly formatting in `src/voice.ts` (PKR amounts, SKU codes, lists).

## Challenges we ran into

- The MCP SDK's 1.32.x made us choose between Streamable HTTP session state and horizontal scaling;
  we documented the trade-off (ADR-0005) and cap per-session memory instead.
- Bedrock's Converse API has strict input types; our JSON-Schema tool definitions needed one cast at
  the SDK boundary (recorded in the friction log, FL-008).
- WooCommerce has no native fulfilment, reorder, or tracking concepts; we mapped `completed` orders
  to "shipped" and persisted tracking/cancel reasons in order meta (ADR-0002).

## Accomplishments we're proud of

- The confirmation gate is real: state is persisted, TTL-bounded, and idempotent; the audit log
  records actor, reason, and outcome for every write.
- 136 automated tests including a shared **adapter contract** the WooCommerce adapter runs against
  an in-memory fake REST endpoint, plus 3 Playwright e2e tests of the browser simulator.
- The store layer published as a standalone package with its own README and licence.

## What we learned

Voice UX is mostly safety UX. A tool that answers "what's selling" needs no permission, but a tool
that ships an order needs processes for idempotent retries and misunderstood confirmations. MCP gives
the transport and the tools — the hard part is the seam between spoken language and shop state.

## What's next

- Alexa+ console run-through with real account linking once the deployed endpoint URL is set
  (`MCP_CANONICAL_URI`).
- Shopify dev-store run-through for the adapter contract against live fixtures.
- Reorder recommendations from real Bedrock trend prompts.

## Page 2 — "Project details" (paste ready)

### About the project (story markdown)

## Inspiration

A seller in Karachi runs kapraa.pk, a real unstitched-clothes store, and like thousands of
Pakistani sellers he lives in WhatsApp groups and Instagram DMs selling even without a proper
website. Meanwhile sellers who DO have a system — Shopify, WooCommerce or a custom PHP site —
still burn hours clicking through admin panels for every order. We asked one question: what if
the seller could just TALK, and the store does the work?

Voice assistants exist, but nobody trusts one with a LIVE catalogue. So we built the assistant
we would actually trust: every read is instant, every write asks a spoken Yes/No first, and
everything lands in an audit log.

## What it does

- **18 MCP tools** over Streamable HTTP (the Alexa+ protocol): sales briefs today/week, live
  low-stock, order lookups, status updates with tracking, restock planning, customer message
  drafts.
- **Works with every kind of store** — first-class Shopify Admin GraphQL adapter, Woocomerce
  REST adapter, a custom JSON adapter that bridges any PHP/MySQL site through a 300-line file
  (live on kapraa.pk right now), and a **manual mode for sellers with NO website** (WhatsApp and
  Instagram sellers add products and record orders in the app, and voice runs them the same way).
- **Many stores, one app**: per-store profiles with instant switching and an "add store in one
  tap" flow in the browser.
- **Safety by design**: confirmation gate with 4-digit spoken codes, one pending action per
  order, TTL expiry, rate limits, token auth, origin guard, and a complete audit log of the
  MCP tool calls that made it happen.
- A **three-pane web simulator** (Web Speech in/out) so anyone can run the whole thing from a
  browser — plus a Practice store with fake data for zero-risk demos.

## How we built it

TypeScript + Express + MCP SDK (Streamable HTTP, session state in SQLite), Zod config, and the
store layer published separately as an npm package held to a shared behavioural contract run
against a fake REST endpoint. Amazon Bedrock drafts the words when configured and degrades to
deterministic voice templates otherwise — the demo runs fully offline-proof. 5 Playwright
browser tests, 174 green unit/integration tests in CI, plus gitleaks and npm-audit gates on
every push. We connected it to a REAL kapraa.pk production database during development, which
survived contact with real-world data (null totals, mixed order states, late night traffic) —
that audience-testing pushed the adapters far beyond clean JSON fixtures.

## Challenges we ran into

- MCP session state vs scaling trade-off; an ADR documents why sessions stay stateful.
- WooCommerce has no native fulfilment or tracking — we mapped semantics carefully (ADR-0002).
- Bedrock's Converse typing needed one adapter cast (friction log FL-008).
- Live store data broke our first "clean" mappings immediately — the hard way to learn that
  real schemas lie.

## What we learned

Voice UX is mostly safety UX. A tool that answers "what's selling" needs no permission; a tool
that ships an order needs idempotency, misunderstood-word handling and confirmations that
survive reloads. MCP gives the transport and tools — the hard part is the seam between spoken
language and shop state.

## What's next

- Real Alexa+ console run with account linking to the deployed endpoint.
- Reorder recommendations from Bedrock trend prompts.
- Multi-worker mode once horizontal scale is required (ADR-0005 notes the path).

## Page 3 — "Additional info" (paste ready)

- Submitter type: Individual · Organization: N/A · Country: Pakistan · Canada: N/A
- Primary track: **Alexa+** · Repository: the GitHub URL · New project: **New**
- AWS Builder mini-challenge: **Yes** (write-up below)
- Open-source mini-challenge: **Yes** (write-up below) — repo is public with LICENSE, built inside the window

### AWS Builder write-up

Amazon Bedrock (Nova Lite via the Converse API) is the agent brain: it reads the MCP tool list,
plans tool calls for briefings and drafts customer replies; Bedrock Guardrails adds a second
filter layer behind our own injection filter. The same MCP endpoint ships as one container on
ECS Fargate with the SQLite state volume on EFS (sessions, confirmations, audit log), the image
lives in Amazon ECR (pushed by CI with a sha tag), CloudWatch collects the JSONL request/audit
logs through the awslogs driver, and deploys use short-lived GitHub-Actions OIDC credentials —
no long-lived keys. All integrations are code-visible in `deploy/`, `src/bedrock.ts`, and the
AI eval suite in `test/`.

### Open Source write-up

Contribution URL: https://github.com/umar-akhtar-designer/storefront-voice-ops
Project repo URL: https://github.com/umar-akhtar-designer/storefront-voice-ops
GitHub username: umar-akhtar-designer
A brand-new MIT-licensed repository built entirely inside the hackathon window: a complete
MCP server for commerce (18 tools), the store-adapter package (Shopify, WooCommerce, custom
PHP/MySQL, manual sellers), a browser voice simulator, 174 green tests, CI with secret
scanning, ADRs, a friction log, and a PHP kit that connects any custom website. It matters
because small Pakistani sellers — Shopify, Woo, custom-coded, or WhatsApp-only — get one
open, auditable voice assistant for all of them.

### Friction log URL

https://github.com/umar-akhtar-designer/storefront-voice-ops/blob/main/docs/friction-log.md

### Project testing link

https://github.com/umar-akhtar-designer/storefront-voice-ops#readme (run `npm install && npm run dev` — Practice store works with zero setup; the video shows the live kapraa.pk connection)

### Feature requests

1. "MCP: first-class support for sending tool results in a dedicated role (or a helper that
   wraps them as user messages)". Priority: Important. Matter-of-fact: every agent loop today
   hand-rolls the mapping and gets it subtly wrong on retries.
2. "Bedrock: one-click demo-grant (one model, one region, spend cap)". Priority: Nice-to-have.
   It would take hackathon-style projects from account-creation to first response in minutes.

### Feedback Q1

TypeScript + Express + Zod + better-sqlite3 (app core), MCP SDK for the Alexa+ protocol,
Amazon Bedrock Converse + Guardrails, WooCommerce REST v3, Shopify Admin GraphQL, Web Speech
API browser input/output, Playwright + Vitest + GitHub Actions CI (gitleaks, npm audit), and a
PHP + MySQL bridge for custom sites (live at kapraa.pk).

### Feedback Q2

Bedrock Converse: one call signature covering messages, tool definitions and results keeps the
agent loop tiny; tool-choice "auto" worked first try. MCP SDK: sessions, transports and
tool-registration just work on Streamable HTTP. WooCommerce REST v3: predictable and well
documented. AWS OIDC-from-GitHub: no long-lived keys to leak. The AWS Voice/Bedrock eval
boundary let us ship an offline fallback with zero code fork.

### Feedback Q3

Bedrock TypeScript types reject plain JSON-Schema tool inputs (one cast each time) and tool
results must be re-sent as user-role messages (FL-008); model-access onboarding is still a
multi-page flow; Guardrail availability varies by region and its ID wiring differs from the
console flow. WooCommerce lacks fulfilment/tracking semantics, so we designed our own mapping
(ADR-0002). MCP SDK doubling of session state vs horizontal scale needed an explicit design
decision (ADR-0005).

### Feedback Q4

Bedrock: enabling Nova + Guardrails took a few console pages but the Converse hello-world is
minutes. MCP SDK: best-in-class — the TypeScript quickstart ran untouched. Fargate+EFS: the
pieces are documented separately; wiring them into one public URL was the slowest part.

### Feedback Q5

Yes. Bedrock because one API covers the whole assistant loop and a kill switch keeps demo
cost bounded; Fargate/ECR/CloudWatch because a stateful MCP server is a normal container
problem; WooCommerce and the MCP SDK because they behave exactly as documented.

### AI tools used (survey)

AI coding agent (Claude-based CLI) for scaffolding, review and test generation; AI image
tool for the thumbnail. Core architecture, store integrations and all final code reviewed by a human.

### Learning survey picks

"Level of learning": the highest/detailed option offered ("A great deal — applied new tools
end to end"). "AI value for your career": Yes.

## Optional pitch (if a short "how I built it" field exists)

Single TypeScript service: Express serves the MCP Streamable HTTP endpoint, the simulator, and the
read-only demo endpoints; Zod validates config; better-sqlite3 keeps sessions, confirmations, and the
audit trail; Bedrock Converse drafts the words; the store is behind a tiny typed interface shipped in
a separate npm package.

## Product feedback → AWS form

See `docs/aws-usage.md` — the per-service feedback section (what worked, what needs work, onboarding,
would-build-again) is drafted there.

## Links section

- GitHub repo: `<fill after the repo is public>`
- Live demo / deployed endpoint: `<fill if deployed>`
- Demo video (≤3 min): `<fill after recording docs/demo-script.md>`
