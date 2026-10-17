# Demo video script (~3 minutes, speaker-ready)

How to record: open the simulator at `http://localhost:3000` (`npm run dev`, `DEMO_MODE=1` in
`.env`), fullscreen the browser, record 1080p with microphone on. Speak the "SAY" lines; do the
"DO" actions. The dialog below is written to be spoken exactly as-is — keep the pace natural.

## Beat 0 — Hook (0:00–0:15)

- DO: fullscreen simulator; three panes visible.
- SAY: "Meet Bilal — he sells clothes online from Karachi. Every evening his phone has forty
  messages: 'where is my order?', 'did my parcel ship?'. Storefront Voice Ops is a voice assistant
  for exactly this owner. In this demo it's the built-in Alexa+ flow — same MCP server, same tools."

## Beat 1 — A quick hello (0:15–0:30)

- DO: type `hello` → Send. (It replies with the help menu.)
- SAY: "Simple hello first. The assistant tells the owner exactly what it can do — no guessing."
- DO: click the **Low stock** example chip.

## Beat 2 — Low stock (0:30–0:55)

- DO: point the mouse at the reply; then point at the Store pane "Low stock" list.
- SAY: "'What is running low?' — one tool call, and the Store pane updates live. Wool Scarf is
  zero, Denim Jacket is two. And see this — the answer is spoken out loud, so he can cook and ask
  at the same time." (let speechSynthesis read a couple of lines)

## Beat 3 — Tap a card, ship an order (0:55–1:40)

- DO: click the **Ship** chip on any order card (e.g. #1008).
- SAY: "Now the dangerous part. 'Ship order 1008.' — notice the assistant does NOT act. It asks.
  This is the safety line: every write needs a yes, and the pending action is stored in a database
  with a time limit — it expires if he walks away."
- DO: click the **Yes** chip on the "Awaiting confirmation" card.
- SAY: "Confirm — order ships. Watch the audit log at the right: who did what, when. This is the
  same gate a real Shopify store would have."

## Beat 4 — It refuses (1:40–2:00)

- DO: click the order we just shipped (it is still on the list or type `Ship order …` for it), then
  type `Cancel order …` → Send. If it's already shipped it refuses.
- SAY: "And if he changes his mind after shipping? It refuses politely — a shipped order cannot be
  cancelled by voice. That's the difference between a demo and something you trust with your shop."

## Beat 5 — Order details (2:00–2:25)

- DO: click **Details** on another order card (e.g. #1023).
- SAY: "Customers also ask questions: 'where is my order?' — one tap and he has the items, the
  price, the customer, the status. He can answer from memory, no app-switching."
- DO: quickly show the supplier draft: click a **Restock** chip on a low-stock card.
- SAY: "Even restocking — it drafts the supplier message ready for WhatsApp."

## Beat 6 — The real AI + AWS (2:25–2:50)

- DO: terminal: `USE_BEDROCK=1 npm run dev` (if model access exists) and ask today's briefing; or
  show `npm run eval` passing 8/8 offline.
- SAY: "Under the hood it talks to this MCP server over the real protocol. The brain is Amazon
  Bedrock — today's briefing and drafted replies are rephrased by Nova. If Bedrock is off, it
  degrades to fast deterministic answers — same data, zero downtime."

## Beat 7 — Close (2:50–3:10)

- DO: show README in the browser; stop on the repo link screen.
- SAY: "The store layer is open source — Shopify and WooCommerce adapters behind one contract.
  Built with Amazon Bedrock, MCP, and a lot of respect for the owner's trust. This is Storefront
  Voice Ops for the Amazon Developers Hackathon — Alexa+ track."

## Recording checklist

- [ ] `npm run dev` running with `DEMO_MODE=1`; simulator fullscreen, close extra tabs
- [ ] Mic toggle ON ("Speak replies aloud") for Beat 2 (speechSynthesis reads a reply)
- [ ] Reset demo before recording (↺ Reset demo) so order 1008 is unshipped
- [ ] Terminal for Beat 6 with `USE_BEDROCK=1` in a second tab (or `npm run eval` if no AWS)
- [ ] One take ≤ 3:15; re-record if any long pause; upload to Devpost before 24 Oct 2026
