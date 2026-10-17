# Tool reference

The tool catalog is built in stages. This page lists what exists today and what is planned.

## Implemented (Stage 0 scaffold — 7 tools on mock data)

These run against the scaffold's mock data in `src/data.ts` and will be rewired onto the
StoreAdapter interface in Stage 2.

| Tool                    | Input                                      | Description                                                         |
| ----------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| `get_sales_summary`     | `period: today \| week \| month`           | Order count and revenue for a period.                               |
| `list_low_stock`        | `threshold?: number`                       | Products at or below a stock threshold.                             |
| `list_orders`           | `status?: pending \| shipped \| delivered` | List orders, optionally by status.                                  |
| `get_order`             | `orderId: number`                          | Details of one order.                                               |
| `mark_order_shipped`    | `orderId: number, carrier?: string`        | Mark a pending order shipped. **Not yet confirmation-gated.**       |
| `draft_restock_message` | `sku: string, quantity?: number`           | Draft a supplier restock message (never sent).                      |
| `get_daily_briefing`    | —                                          | Spoken morning briefing (Bedrock-phrased with a template fallback). |

## Planned (Stage 2 — full catalog on the StoreAdapter)

Read: `get_daily_briefing`, `get_sales_summary`, `get_top_sellers`, `list_orders`, `get_order`,
`list_low_stock`, `forecast_restock`, `lookup_customer`, `get_weekly_report`, `get_audit_log`.

Draft (never send): `draft_restock_message`, `draft_customer_message`.

Write (confirmation-gated, audit-logged): `mark_order_shipped`, `adjust_inventory`,
`cancel_order` (destructive; needs a stronger second confirmation).

Control: `confirm_action`, `cancel_action`, `list_pending_actions`.

Resources: `store://summary`, `store://low-stock`, `store://pending-orders`.

Prompts: `morning-briefing`, `weekly-review`, `restock-run`.

Every production tool will have: an LLM-oriented description, a tight Zod input schema, a short
speakable `text` result, `structuredContent` with an output schema, correct `isError` messages, and
annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`).
