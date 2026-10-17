import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { StoreAdapter } from "@voice-ops/store-adapters";
import type { ServerDeps } from "../context.js";
import { contextFor } from "../context.js";
import { fail, ok, spokenError } from "../result.js";
import { moneyForSpeech, spellId } from "../../voice.js";

export type Period = "today" | "yesterday" | "week" | "month";

const orderIdSchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .pipe(z.string().min(1));

const periodSchema = z.enum(["today", "yesterday", "week", "month"]).default("today");

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function periodRange(period: Period, now: Date): { from: Date; to: Date; label: string } {
  switch (period) {
    case "today": {
      const from = startOfDay(now);
      return { from, to: now, label: "Today" };
    }
    case "yesterday": {
      const from = new Date(startOfDay(now).getTime() - 86400000);
      const to = new Date(startOfDay(now).getTime() - 1);
      return { from, to, label: "Yesterday" };
    }
    case "week":
      return { from: new Date(now.getTime() - 7 * 86400000), to: now, label: "The last 7 days" };
    case "month":
      return { from: new Date(now.getTime() - 30 * 86400000), to: now, label: "The last 30 days" };
    default:
      return { from: startOfDay(now), to: now, label: "Today" };
  }
}

const adapter = (deps: ServerDeps): StoreAdapter => deps.adapter;

export function registerReadTools(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    "get_sales_summary",
    {
      title: "Get sales summary",
      description:
        "Revenue, order count and average order value for a period: today, yesterday, week, or month.",
      inputSchema: { period: periodSchema },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ period }, extra) => {
      const ctx = contextFor(deps, extra);
      try {
        const { from, to, label } = periodRange(period, ctx.now());
        const s = await adapter(deps).getSalesBetween(from, to);
        const text =
          s.orderCount === 0
            ? `${label}: no orders yet, so zero revenue so far.`
            : `${label}: ${s.orderCount} orders and ${moneyForSpeech(s.revenue.amount, s.revenue.currency)} in revenue. Average order ${moneyForSpeech(s.averageOrderValue.amount, s.averageOrderValue.currency, { about: false })}.`;
        return ok(text, {
          period,
          from: s.from,
          to: s.to,
          orderCount: s.orderCount,
          revenue: s.revenue,
          averageOrderValue: s.averageOrderValue,
        });
      } catch (error) {
        return fail(spokenError(error));
      }
    },
  );

  server.registerTool(
    "get_top_sellers",
    {
      title: "Get top sellers",
      description: "Best selling products for a period, ranked by units sold.",
      inputSchema: { period: periodSchema, limit: z.number().int().min(1).max(10).default(5) },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ period, limit }, extra) => {
      const ctx = contextFor(deps, extra);
      try {
        const { from, to, label } = periodRange(period, ctx.now());
        const top = await adapter(deps).getTopSellers(from, to, limit);
        if (top.length === 0)
          return ok(`${label}: no sales yet, so no top sellers.`, { period, top: [] });
        const spoken = top
          .slice(0, 3)
          .map((t) => `${t.name}, ${t.units} units`)
          .join("; ");
        const more = top.length > 3 ? `, and ${top.length - 3} more.` : ".";
        return ok(`${label}, top sellers: ${spoken}${more}`, { period, top });
      } catch (error) {
        return fail(spokenError(error));
      }
    },
  );

  server.registerTool(
    "list_orders",
    {
      title: "List orders",
      description:
        "List orders, optionally filtered by status: pending, shipped, delivered, cancelled.",
      inputSchema: {
        status: z.enum(["pending", "shipped", "delivered", "cancelled"]).optional(),
        limit: z.number().int().min(1).max(50).default(10),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ status, limit }, extra) => {
      void contextFor(deps, extra);
      try {
        const page = await adapter(deps).getOrders({
          ...(status ? { status } : {}),
          limit,
        });
        if (page.items.length === 0) {
          return ok(status ? `No ${status} orders.` : "No orders yet.", {
            total: page.total,
            orders: [],
          });
        }
        const spoken = page.items
          .slice(0, 3)
          .map(
            (o) =>
              `order ${spellId(o.id)} for ${o.customerName}, ${moneyForSpeech(o.total.amount, o.total.currency)}, ${o.status}`,
          )
          .join("; ");
        const rest = page.items.length > 3 ? ` and ${page.items.length - 3} more` : "";
        return ok(
          `I found ${page.total} orders${status ? ` that are ${status}` : ""}: ${spoken}${rest}.`,
          {
            total: page.total,
            nextCursor: page.nextCursor ?? null,
            orders: page.items,
          },
        );
      } catch (error) {
        return fail(spokenError(error));
      }
    },
  );

  server.registerTool(
    "get_order",
    {
      title: "Get one order",
      description: "Details of one order: customer, items, total and status.",
      inputSchema: { orderId: orderIdSchema },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ orderId }, extra) => {
      void contextFor(deps, extra);
      try {
        const order = await adapter(deps).getOrder(orderId);
        const items = order.items.map((i) => `${i.qty} x ${i.name}`).join(", ");
        const text =
          `Order ${spellId(order.id)} for ${order.customerName}: ${items}. ` +
          `Total ${moneyForSpeech(order.total.amount, order.total.currency, { about: false })}, ${order.status}` +
          `${order.carrier ? ` with ${order.carrier}` : ""}.`;
        return ok(text, { order });
      } catch (error) {
        if ((error as { code?: string }).code === "NOT_FOUND") {
          return fail(`I couldn't find order ${spellId(orderId)}.`, { orderId });
        }
        return fail(spokenError(error));
      }
    },
  );

  server.registerTool(
    "list_low_stock",
    {
      title: "List low stock",
      description:
        "Products at or below a stock threshold (default 10), cheapest to restock first.",
      inputSchema: {
        threshold: z.number().int().min(0).default(10),
        limit: z.number().int().min(1).max(20).default(5),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ threshold, limit }, extra) => {
      void contextFor(deps, extra);
      try {
        const low = await adapter(deps).getProducts({ lowStockBelow: threshold });
        if (low.length === 0) {
          return ok(`Nothing is low on stock. Everything is above ${threshold} units.`, {
            threshold,
            products: [],
          });
        }
        const shown = low.slice(0, limit);
        const spoken = shown.map((p) => `${p.name}, ${p.stock} left`).join("; ");
        const rest =
          low.length > limit ? `, and ${low.length - limit} more needing attention.` : ".";
        return ok(
          `${low.length} products are running low${limit < low.length ? `; worst ${limit} are` : ":"} ${spoken}${rest}`,
          {
            threshold,
            count: low.length,
            products: low,
          },
        );
      } catch (error) {
        return fail(spokenError(error));
      }
    },
  );

  server.registerTool(
    "lookup_customer",
    {
      title: "Look up a customer",
      description: "Find a customer by name, email, phone, customer id, or order id.",
      inputSchema: { query: z.string().min(1) },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ query }, extra) => {
      void contextFor(deps, extra);
      try {
        const customer = await adapter(deps).getCustomer(query);
        if (!customer) return fail(`I couldn't find a customer matching ${query}.`, { query });
        const text =
          `${customer.name} has placed ${customer.orderCount} orders and spent ` +
          `${moneyForSpeech(customer.lifetimeValue.amount, customer.lifetimeValue.currency)} so far.`;
        return ok(text, { customer });
      } catch (error) {
        return fail(spokenError(error));
      }
    },
  );
}
