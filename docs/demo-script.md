# Demo video script (5–7 minutes) — Storefront Voice Ops

Simple words. Short sentences. Talk to the camera like a friend.

---

## 0. Before you record (5 minutes of setup)

- Server running: terminal open at `storefront-voice-ops`, type `npm run dev`, keep it open
- Browser: `http://localhost:3000`, allow **microphone**
- **Kapraa.pk** selected in the store picker (top right shows `custom` + green dot)
- Recording: Mac → press `Cmd + Shift + 5` → "Record Selected Portion" → pick the browser window
- One page per scene — scroll slowly, click slowly. Judges hate fast hands.

---

## 1. THE PROBLEM (say this first) — ~1 min

> "Small sellers in Pakistan run their whole business from a WhatsApp group or Instagram DM —
> there is no website, no system. Their orders live in chats, and they lose track of them.
> Bigger sellers who DO have a store — Shopify or a custom-coded PHP website — still have to
> click through admin panels all day just to ship one order.
> I asked one question: what if the seller could just... TALK to their store?"

## 2. WHAT WE BUILT (the one-liner) — ~20 sec

> "This is Storefront Voice Ops — an Alexa-style voice and chat operator for your store.
> You speak. The store obeys. Every write action is confirmed out loud and written to an
> audit log — it acts like a careful human assistant, not a wild robot."

## 3. THE SOLUTION — show Kapraa LIVE (real store) — ~3 min

Do these on the LOCALHOST app, Kapraa.pk active:

| #   | Say / click                                      | What the judge sees                                                                          |
| --- | ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| 1   | Type **"How did my store do today?"**            | Real kapraa sales summary (PKR)                                                              |
| 2   | Say **"What is running low?"**                   | Real stock-out products (PRD-… SKUs)                                                         |
| 3   | Say **"What orders are pending?"**               | Real kapraa customers (Daniyal, Sadaf…)                                                      |
| 4   | Say **"Ship order <one real id> with Leopards"** | Confirmation card → "Yes" → shipped + audit entry (**use the Courier your dashboard shows**) |
| 5   | Point to **Inspector panel**                     | "Every tool call + audit is visible — proof it really happened"                              |

Also say: "This is my REAL kapraa.pk store, connected through a tiny PHP file I wrote for it —
no Shopify, no WooCommerce, just two endpoints in the API spec from the repo."

## 4. THE BEST PART (say this like it's the surprise) — ~1.5 min

> "And here is the part I am most proud of. This works with:
>
> - **Shopify** stores — dedicated adapter, name-search order lookup, inventory writes
> - **WooCommerce** stores — standard REST keys, nothing special needed
> - **Any custom-coded website** — even a PHP + MySQL site — using one JSON API file
> - **Sellers with NO website at all** — WhatsApp, Facebook, Instagram sellers — they add
>   products and record orders right here in the app, and voice manages shipping and stock
>   exactly the same way
>
> And if you have many stores? One app runs all of them — pick a store here
> (point at the picker), add a new one here (point at '+ Add store'), switch instantly.
> Practice store included so judges can try everything safely."

## 5. SAFE BY DESIGN (quick words while scrolling the Inspector) — ~30 sec

> "Voice can break a store. So: written actions always ask a Yes/No confirmation first,
> everything is logged, rate-limited, and there is even a demo reset. Small changes to a
> real store, instantly auditable."

## 6. END — ~20 sec

> "From a WhatsApp group to a Shopify giant — one voice assistant for every kind of store.
> Code is open source on GitHub. Thank you."

Hold last frame on the app for 5 seconds.

---

## Recording tips

- Record in **one take per section** (Sections map to the table above) — restart just that scene when you stumble
- Heavy **tab reload** (Cmd+Shift+R) before recording so no old toasts drip in
- Never show Bazaar Box "can't connect" — keep Kapraa + Practice only (Bazaar Box comes back in the video later / on GitHub proof)
- Keep the terminal LOG visible on the side once — judges love it
- If the mic mishears, that's actually GOOD — type instead and say "same thing works by voice"

## After recording

1. Devpost form is ready: `docs/devpost-submission.md` — copy-paste section by section
2. Submission needs: video link (YouTube unlisted, title = project name), repo link, dev log `STATUS.md`
