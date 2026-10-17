# How a store connects to the Voice Ops system

One system, up to three kinds of store. The browser app and the voice commands never change — only the connection details change, and switching stores is a 4-line settings change (`.env` file), then restart the server.

```
Your voice / browser  ──▶  Voice Ops server (this project)
                               ├── Shopify store      → Shopify Admin API
                               ├── WooCommerce store  → WooCommerce REST API
                               └── Custom website     → small JSON API (spec below)
```

## A. Shopify — DONE (working today)

1. Shopify admin → **Settings → Apps and sales channels → Develop apps → Create app**
2. Inside the app → **API access / Admin API scopes**, tick: `read_orders`, `read_products`, `read_customers`, `read_inventory`
   - Add `write_orders` + `write_inventory` ONLY if you want the system to actually ship orders / change stock from the voice app. Read-only is the safe demo option.
3. Create & install the app version, then copy the **Admin API access token** (`shpat_...`)
4. Give the operator this info, it goes into the server config:

```
STORE_PROVIDER=shopify
SHOPIFY_STORE_DOMAIN=yourstore.myshopify.com
SHOPIFY_ADMIN_TOKEN=shpat_your_token
SHOPIFY_CURRENCY=PKR
```

Notes: a client-credentials token lasts 24 hours — when it expires the operator simply mints a new one (one line, the app itself saved a working one). To avoid that entirely, create a **custom app inside the store admin** (Settings → Apps and sales channels → Develop apps) instead of the Partner dashboard: its install token is permanent.

## B. WooCommerce (WordPress site)

1. WordPress dashboard → **WooCommerce → Settings → Advanced → REST API → Add key**
2. Description: `voice-ops`, choose an **admin user**, permissions: **Read/Write**
3. Generate → copy the two keys (`ck_...` consumer key, `cs_...` consumer secret)
4. Give the operator:

```
STORE_PROVIDER=woocommerce
WOO_STORE_URL=https://your-domain.com
WOO_CONSUMER_KEY=ck_xxxxxxxxxxxxxxxx
WOO_CONSUMER_SECRET=cs_xxxxxxxxxxxxxxxx
WOO_CURRENCY=PKR
```

That's all. The system immediately shows that store's real orders and stock.

## C. Custom website (a site with its OWN code, not Shopify/WooCommerce)

For a website with custom code, the store side must expose **one small JSON API**. Nothing about the website's public pages changes — it is a private side-door for the operator's app only, behind a secret key.

### What the developer builds (6 endpoints + 1 optional)

All endpoints:
- Answer with **JSON** (`Content-Type: application/json`)
- Check a secret header sent with every request: `x-api-key: <VALUE_YOU_INVENT>`. Wrong/missing key → HTTP `401`.
- Unknown id → HTTP `404` with `{"error": "..."}`. Too many requests may use `429`. Broken server → `500`.

Use any URL prefix you like, e.g. `/api/voice-ops/...` — that path is fine; the operator just needs the base URL.

| # | Endpoint | Method | What it must return |
|---|----------|--------|---------------------|
| 1 | `/orders?status=pending&limit=20` | GET | Newest orders first. `status` may be `pending`, `shipped`, `delivered`, `cancelled` — or omitted for all |
| 2 | `/orders/{id}` | GET | One order by ORDER NUMBER, e.g. `/orders/1002` |
| 3 | `/products?lowStockBelow=10` | GET (or filter client-side) | Products with their stock; if `lowStockBelow` given, only stock ≤ that number |
| 4 | `/orders/{id}/fulfill` | POST | Mark the order shipped, store tracking number (body example below) |
| 5 | `/orders/{id}/cancel` | POST | Cancel the order, store the reason (body example below) |
| 6 | `/products/{sku}/restock` | POST | Increase stock for a product SKU (body example below) |
| 7 | *(optional)* `/sales/today` | GET | Today's revenue, order count, and best-selling product — powers a nicer briefing |

### Responses the app understands

Order object (endpoints 1 & 2) — only the fields below are required; extra fields are ignored:

```json
{
  "id": "1002",
  "createdAt": "2026-10-15T09:30:00Z",
  "status": "pending",
  "total": { "amount": 2750.0, "currency": "PKR" },
  "customerName": "Umar Akhtar",
  "customerPhone": "0300-1234567",
  "customerEmail": "umar@example.com",
  "trackingNumber": null,
  "cancelledReason": null,
  "items": [
    { "sku": "LT-TABLE-FOLD", "name": "Foldable Laptop Bed Table", "quantity": 1, "unitPrice": { "amount": 2750.0, "currency": "PKR" } }
  ]
}
```

- `status` uses exactly: `pending`, `shipped`, `delivered`, `cancelled`
- `trackingNumber` non-null only once shipped. `cancelledReason` non-null only once cancelled (use "shipped" / "cancelled" wording inside `cancelledReason` and `trackingNumber` is ignored for cancelled).

Product object (endpoint 3):

```json
{
  "sku": "LT-TABLE-FOLD",
  "name": "Foldable Laptop Bed Table",
  "stock": 3,
  "price": { "amount": 2750.0, "currency": "PKR" }
}
```

Request bodies the app will send:

```json
// 4 → POST /orders/1002/fulfill
{ "tracking": "TCS-77654321", "carrier": "TCS" }

// 5 → POST /orders/1002/cancel
{ "reason": "Customer changed mind" }

// 6 → POST /products/LT-TABLE-FOLD/restock
{ "quantity": 20, "mode": "set" }
```

- `mode: "set"` → stock becomes exactly 20 (preferred). `mode: "add"` → adds 20 to current stock.

List (endpoints 1 & 3):

```json
{ "items": [ ...order or product objects... ] }
```

Optional sales summary (endpoint 7):

```json
{
  "date": "2026-10-17",
  "revenue": { "amount": 5400.0, "currency": "PKR" },
  "orders": 2,
  "topSellers": [ { "sku": "LT-TABLE-FOLD", "name": "Foldable Laptop Bed Table", "units": 3 } ]
}
```

### What to hand to the operator

Fill in once per custom store (the operator adds a `custom` provider with these — as soon as the endpoints are live, the developer adds it to the project and the same tests protect it like Shopify and WooCommerce):

```
CUSTOM_STORE_URL=https://your-domain.com/api/voice-ops
CUSTOM_API_KEY=<secret you invent>
CUSTOM_CURRENCY=PKR
```

### If the developer wants a working sample

A runnable Node.js skeleton that satisfies this exact spec is in `docs/custom-store-sample.cjs` — start there and swap the in-memory data for real database queries. If the site is PHP, Laravel, Python or anything else, the same JSON shapes apply.

## Security rules that apply to every option

- Secrets live ONLY in the server config file (`.env`) on the operator's machine — never in chat, screenshots, or repositories
- The voice app never asks the store for money/payment details — it uses read endpoints by default
- Write actions (ship, cancel, restock) always wait for a spoken **yes** before touching the store
- Suggested for the custom site: serve the `/api/voice-ops` endpoints over **HTTPS** and restrict by IP if hosting allows

— Voice Ops reference: connection strings are read from `.env` by `src/config.ts`; adapters live in `packages/store-adapters`; Shopify is active end-to-end today, WooCommerce keys and the custom endpoint remain human tasks in `HUMAN_TASKS.md`.
