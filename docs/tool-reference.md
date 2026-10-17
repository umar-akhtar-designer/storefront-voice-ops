# Tool reference

Every tool returns a short, speakable `text` result (voice rules: at most three spoken sentences,
rounded numbers, ids spelled digit by digit) plus a `structuredContent` payload for machines. Every
tool declares annotations (`readOnlyHint`, `idempotentHint`, `destructiveHint`, `openWorldHint`).

Tools run against the **StoreAdapter** interface, never a specific store, so the same catalog works
on the mock provider, Shopify, and WooCommerce.

## Read tools (safe, never change data)

| Tool                 | Input                                         | Returns                                                   |
| -------------------- | --------------------------------------------- | --------------------------------------------------------- |
| `get_daily_briefing` | —                                             | Today's sales, orders waiting to ship, low-stock risks.   |
| `get_sales_summary`  | `period: today \| yesterday \| week \| month` | Order count, revenue, average order value.                |
| `get_top_sellers`    | `period`, `limit?`                            | Best sellers by units for the period.                     |
| `list_orders`        | `status?`, `limit?`                           | Orders, optionally filtered by status.                    |
| `get_order`          | `orderId: string \| number`                   | One order: customer, items, total, status.                |
| `list_low_stock`     | `threshold?` (10), `limit?` (5)               | Products at or below the threshold, worst first.          |
| `forecast_restock`   | `sku?`, `threshold?`, `windowDays?`, `limit?` | Restock plan with suggested quantities and days of stock. |
| `lookup_customer`    | `query` (name, email, phone, id, or order id) | Customer with order count and lifetime value.             |
| `get_weekly_report`  | `period: today \| week \| month`              | Seven-day style summary of sales, top sellers and risks.  |
| `get_audit_log`      | `limit?` (10)                                 | Recent audited actions and their outcomes.                |

## Draft tools (never send, only compose)

| Tool                     | Input                                  | Returns                                    |
| ------------------------ | -------------------------------------- | ------------------------------------------ |
| `draft_restock_message`  | `sku`, `quantity?`                     | Supplier restock message (flagged unsent). |
| `draft_customer_message` | `orderId?` / `query?`, `kind`, `note?` | Customer message (flagged unsent).         |

`kind` is one of `shipping-update`, `delay`, `thanks`. Drafts are phrased with Bedrock when enabled
and with a deterministic template otherwise.

## Write tools (confirmation-gated, audited)

Write tools never change data on the first call. They create a **pending action**, speak a one-line
confirmation prompt, and return `structuredContent.confirmationRequired = true` with an `actionId`.
The action runs only when `confirm_action` is called for the same session.

| Tool                 | Input                              | Guard                                                           |
| -------------------- | ---------------------------------- | --------------------------------------------------------------- |
| `mark_order_shipped` | `orderId`, `carrier?`, `tracking?` | Confirmation. Idempotent; refuses cancelled orders.             |
| `adjust_inventory`   | `sku`, `delta`, `reason?`          | Confirmation; rejects negative stock. Large (`                  | delta | ≥ 50`) changes also need a spoken code. |
| `cancel_order`       | `orderId`, `reason?`               | Confirmation **and** a spoken code. Refuses non-pending orders. |

Creating a new pending action for the same session + target supersedes the older one.

## Control tools

| Tool                   | Input                | Purpose                                                               |
| ---------------------- | -------------------- | --------------------------------------------------------------------- |
| `confirm_action`       | `actionId?`, `code?` | Run the pending action. Idempotent: a second confirm does not re-run. |
| `cancel_action`        | `actionId?`          | Discard the pending action so it never runs.                          |
| `list_pending_actions` | —                    | Every action in this session still awaiting a yes/no.                 |

`actionId` is optional on the control tools: omitting it targets the most recent pending action in
the session, which is what a spoken "yes" maps to.

## Resources

| URI                      | Contents                                                    |
| ------------------------ | ----------------------------------------------------------- |
| `store://summary`        | Today's sales, order pipeline, low stock, awaiting confirm. |
| `store://low-stock`      | Every product at or below its reorder point.                |
| `store://pending-orders` | Orders still waiting to ship, oldest first.                 |

## Prompts

| Prompt             | Args        | Purpose                                              |
| ------------------ | ----------- | ---------------------------------------------------- |
| `morning-briefing` | `focus`     | Run the briefing and answer as a spoken update.      |
| `weekly-review`    | `days`      | Summarise a period of trading.                       |
| `restock-run`      | `threshold` | Find restock candidates and draft supplier messages. |

## Safety guarantees

- Confirmation is required for every write, keyed per session (ADR-0005).
- High-impact actions additionally require a spoken code (ADR-0003).
- Every confirmation and execution is written to the audit log with actor and outcome.
- Read tools and draft tools never mutate store data.
