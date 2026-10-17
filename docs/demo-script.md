# Demo script (~3 minutes)

Recording checklist for the lead. Everything except Act 5 needs no AWS access; the fallback line
keeps the video valid either way. Record at 1080p, use the simulator at `http://localhost:3000`
(`npm run dev`, `DEMO_MODE=1` in `.env`), and show the microphone button being used at least once —
voice is the product.

## Act 0 — Hook (0:00–0:15)

- On screen: simulator with the three panes visible (conversation, live store, inspector).
- Say: "A small store in Karachi runs ~400 SKUs. Shopify orders pile up faster than the owner can
  answer email. This server lets them run the whole shop by voice — through Alexa+ or right here in
  this browser — with every write gated and audited."

## Act 1 — Question the store (0:15–0:45)

- Type or hold-mic: **"What's running low in stock?"**
- Point at the inspector pane: `list_low_stock` fired, low-stock list appears in the Store pane.
- Say: "One tool call. And it can take dependencies — restock suggestions are built in using AWS
  weekly trends." _(skip the trends line if that tool is not on)_

## Act 2 — Briefing (0:45–1:15)

- Ask: **"Give me today's briefing."**
- Narrate while it speaks: pending orders count, low stock, yesterday's sales — number-formatted for
  speech, not markdown.
- Say: "The briefing is assembled from three tools, then rephrased by Amazon Bedrock Nova. If
  Bedrock is down, an offline template still answers — that's the degradation path tested in CI."

## Act 3 — The dangerous part (1:15–2:15)

_This is the section judges care about: writes._

- Ask: **"Ship order 1004."**
- Point: the server replies with what it will do and an order of magnitude if needed, and asks for a
  spoken confirmation code. Show the Store pane: nothing changed yet.
- Say: "A confirmation can never skip the audit trail; the pending action is already persisted to
  SQLite with a TTL."
- Say: **"Confirm <spoken code from the reply>."**
- Point: Store pane order flips to shipped, new audit entry appears.
- Follow up: "That's the same confirmation gate that would protect Shopify or WooCommerce in
  production — the tools never talk to a platform directly."

## Act 4 — Guardrails (2:15–2:35)

- Ask: **"Cancel order 1004."** — the order we just shipped. It refuses politely (an order that
  shipped cannot be cancelled).
- Optional fast cut: paste an injection-style prompt into the briefing view, show the untrusted-data
  rule and the injection filter holding.

## Act 5 — Real Bedrock (2:35–2:50)

- Terminal: `USE_BEDROCK=1 npm run dev` (mention it needs model access on the AWS account).
- Ask the same briefing question again; same shape, different wording, served by a live Bedrock
  Converse call.
- Fallback if no model access: show `npm run eval` (8 AI cases) passing offline and explain the same
  eval set runs against the real model when enabled.

## Act 6 — Close (2:50–3:10)

- Say: "The store adapter layer is open source — `@voice-ops/store-adapters` on npm — with mock,
  Shopify, and WooCommerce adapters behind one contract, and a `defineAdapterContract` suite so any
  new platform inherits the same guarantees."
- Final screen: repo README with links; "Built during the Amazon Developers Hackathon — Alexa+ track,
  AWS Builder and Open Source challenges."
