# @voice-ops/store-adapters

A tiny, framework-agnostic `StoreAdapter` contract plus ready-made adapters for the store platforms a
small online shop actually uses. Built for [storefront-voice-ops](../../README.md) — an MCP server
that lets an owner run their store by voice — but usable from any Node 22+ TypeScript project.

## Why

Every integration (Shopify, WooCommerce, your own stack) has a different shape. The adapter maps your
platform's vocabulary onto one small interface, so the layer above never branches on `platform`:

```ts
await store.getProducts({ lowStockBelow: 5 });
await store.getOrders({ status: "pending", limit: 10 });
await store.fulfillOrder("1024", { carrier: "TCS", tracking: "TCS-000452" });
await store.cancelOrder("1025", "customer changed their mind");
await store.adjustStock("REG-BLK-M", 20, "restock delivered");
await store.getSalesBetween(from, to);
await store.getTopSellers(from, to, 5);
await store.getCustomer("Ayesha");
```

## Provided adapters

| Adapter              | Platform              | Notes                                                                                                  |
| -------------------- | --------------------- | ------------------------------------------------------------------------------------------------------ |
| `MockAdapter`        | in-memory             | Deterministic seeded demo data + optional `reset()`; contract-tested                                   |
| `ShopifyAdapter`     | Admin **GraphQL** API | Orders, fulfilment (`fulfillmentCreateV2`), cancellation, variants, inventory adjustments, customers   |
| `WooCommerceAdapter` | **REST v3**           | Orders (Woo status union), tracking + cancel reason in order meta, `low_stock_amount` as reorder point |

All upstream failures are mapped onto typed errors — `NotFoundError`, `UnauthorizedError`,
`RateLimitedError` (with `retryAfterMs`), `UpstreamError`, `ValidationError` — so callers can react
consistently (`NOT_FOUND` / `UNAUTHORIZED` / `RATE_LIMITED` / `UPSTREAM` / `VALIDATION`).

HTTP calls share one implementation (`request` helper): timeout via `AbortController`, retries on
`429`/`5xx` with exponential backoff respecting `Retry-After`.

## Usage

```ts
import { createShopifyAdapter } from "@voice-ops/store-adapters";

const store = createShopifyAdapter({
  domain: "your-store.myshopify.com",
  token: process.env.SHOPIFY_ADMIN_TOKEN!, // Admin custom app token
});
```

Credentials are read from env vars when not passed explicitly: `SHOPIFY_STORE_DOMAIN`,
`SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_API_VERSION` (default `2026-01`), `WOO_BASE_URL`, `WOO_KEY`,
`WOO_SECRET`.

## Testing your own adapter

```ts
import { defineAdapterContract, MockAdapter } from "@voice-ops/store-adapters";

defineAdapterContract("MyAdapter", () => new MyAdapter());
```

`defineAdapterContract` runs the full behavioural suite — status mapping, pagination, idempotent
writes, input validation — against your adapter so brand-new integrations inherit the same
guarantees as the shipped ones.

## Notes on accuracy

- Shopify has no first-class "reorder point"; we default to 5 for every variant (a future revision
  can lift it from a `custom.reorder_point` metafield).
- WooCommerce has no native fulfilment/reorder concept; a `completed` order is treated as shipped and
  tracking/cancellation reasons are persisted in order `_meta_data`.
- Shopify's cancel reason is an enum; free-text reasons are passed as the staff note.

## License

MIT
