import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerDeps } from "../context.js";
import { contextFor } from "../context.js";
import { fail, ok, spokenError } from "../result.js";
import { listForSpeech, limitSentences, moneyForSpeech, numberToWords } from "../../voice.js";

const periodNoSchema = z.enum(["today", "week", "month"]);

export function registerInsightTools(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    "forecast_restock",
    {
      title: "Forecast restock",
      description:
        "Which products to restock and roughly how many units, based on reorder point and recent sales. Read-only.",
      inputSchema: {
        sku: z.string().min(1).optional(),
        threshold: z.number().int().min(0).default(10),
        windowDays: z.number().int().min(1).max(90).default(7),
        limit: z.number().int().min(1).max(10).default(5),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ sku, threshold, windowDays, limit }, extra) => {
      const ctx = contextFor(deps, extra);
      try {
        const now = ctx.now();
        const from = new Date(now.getTime() - windowDays * 86400000);
        const products = sku
          ? await deps.adapter.getProducts({ sku })
          : await deps.adapter.getProducts({ lowStockBelow: threshold });

        if (products.length === 0) {
          return ok(
            sku
              ? `Nothing to restock for ${sku}.`
              : `Nothing is below ${threshold} units, so no restocking needed.`,
            { items: [] },
          );
        }

        const top = await deps.adapter.getTopSellers(from, now, 100);
        const demandBySku = new Map(top.map((t) => [t.sku, t.units]));

        const items = products
          .map((p) => {
            const units = demandBySku.get(p.sku) ?? 0;
            const dailyRate = units / windowDays;
            const daysLeft = dailyRate > 0 ? Math.floor(p.stock / dailyRate) : null;
            const suggested = Math.max(
              p.reorderPoint * 2 - p.stock,
              Math.ceil(dailyRate * 14) - p.stock,
              0,
            );
            return {
              sku: p.sku,
              name: p.name,
              stock: p.stock,
              reorderPoint: p.reorderPoint,
              unitsSold: units,
              daysLeft,
              suggestedQuantity: Math.ceil(Math.min(suggested, 1000) / 10) * 10,
            };
          })
          .sort(
            (a, b) =>
              (a.daysLeft ?? Number.MAX_SAFE_INTEGER) - (b.daysLeft ?? Number.MAX_SAFE_INTEGER),
          )
          .slice(0, limit);

        const spoken = items
          .slice(0, 3)
          .map((i) =>
            i.daysLeft === null
              ? `${i.name}, ${i.stock} left, no recent sales. Order ${i.suggestedQuantity}`
              : `${i.name}, ${i.stock} left, about ${i.daysLeft === 0 ? "zero" : numberToWords(i.daysLeft)} days of stock. Order ${i.suggestedQuantity}`,
          )
          .join("; ");
        const rest = items.length > 3 ? `, and ${items.length - 3} more.` : ".";
        return ok(`Restock plan: ${spoken}${rest}`, { items, windowDays });
      } catch (error) {
        return fail(spokenError(error));
      }
    },
  );

  server.registerTool(
    "get_daily_briefing",
    {
      title: "Get daily briefing",
      description:
        "A spoken morning briefing: today's sales, orders waiting to ship, and low-stock risks. Rephrased with Bedrock when enabled.",
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (_args, extra) => {
      const ctx = contextFor(deps, extra);
      try {
        const now = ctx.now();
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        const [sales, pending, low, top] = await Promise.all([
          deps.adapter.getSalesBetween(start, now),
          deps.adapter.getOrders({ status: "pending", limit: 50 }),
          deps.adapter.getProducts({ lowStockBelow: 10 }),
          deps.adapter.getTopSellers(new Date(now.getTime() - 7 * 86400000), now, 1),
        ]);

        const pendingIds = pending.items.map((o) => o.id);
        const lowNames = low.slice(0, 3).map((p) => `${p.name} has ${p.stock}`);
        const pendingText =
          pendingIds.length > 0
            ? `${pending.total} orders are waiting to ship: ${listForSpeech(pendingIds)}.`
            : `${pending.total} orders are waiting to ship.`;
        const lowText =
          low.length > 0
            ? `Low stock: ${lowNames.join("; ")}${low.length > 3 ? `, and ${low.length - 3} more.` : "."}`
            : "Low stock: none.";
        const facts =
          `Today: ${sales.orderCount} orders and ${moneyForSpeech(sales.revenue.amount, sales.revenue.currency)} in revenue. ` +
          `${pendingText} ${lowText} ` +
          (top[0] ? `Best seller this week: ${top[0].name} with ${top[0].units} units.` : "");

        const briefing = ctx.ai
          ? await ctx.ai.phraseBriefing(facts)
          : { text: limitSentences(facts), source: "offline" as const };

        return ok(briefing.text, {
          revenue: sales.revenue,
          orderCount: sales.orderCount,
          pendingOrders: pending.total,
          lowStock: low.length,
          source: briefing.source,
        });
      } catch (error) {
        return fail(spokenError(error));
      }
    },
  );

  server.registerTool(
    "get_weekly_report",
    {
      title: "Get weekly report",
      description: "A seven day summary: revenue, top sellers, low stock and orders still to ship.",
      inputSchema: { period: periodNoSchema.default("week") },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ period }, extra) => {
      const ctx = contextFor(deps, extra);
      try {
        const now = ctx.now();
        const days = period === "today" ? 1 : period === "month" ? 30 : 7;
        const from = new Date(now.getTime() - days * 86400000);
        const [sales, top, low, pending] = await Promise.all([
          deps.adapter.getSalesBetween(from, now),
          deps.adapter.getTopSellers(from, now, 3),
          deps.adapter.getProducts({ lowStockBelow: 10 }),
          deps.adapter.getOrders({ status: "pending", limit: 50 }),
        ]);

        const topNames = top.map((t) => `${t.name} ${t.units} units`).join("; ");
        const facts =
          `Over ${numberToWords(days)} days: ${sales.orderCount} orders and ${moneyForSpeech(sales.revenue.amount, sales.revenue.currency)} in revenue. ` +
          (topNames ? `Top sellers: ${topNames}. ` : "") +
          `${low.length} products are low on stock and ${pending.total} orders still need shipping.`;

        const report = ctx.ai
          ? await ctx.ai.phraseBriefing(facts)
          : { text: limitSentences(facts), source: "offline" as const };

        return ok(report.text, {
          period,
          from: sales.from,
          to: sales.to,
          orderCount: sales.orderCount,
          revenue: sales.revenue,
          topSellers: top,
          lowStock: low.length,
          pendingOrders: pending.total,
          source: report.source,
        });
      } catch (error) {
        return fail(spokenError(error));
      }
    },
  );

  server.registerTool(
    "get_audit_log",
    {
      title: "Get audit log",
      description:
        "The most recent audited actions: what was requested, confirmed and executed, and by whom.",
      inputSchema: { limit: z.number().int().min(1).max(50).default(10) },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ limit }, extra) => {
      const ctx = contextFor(deps, extra);
      try {
        const entries = ctx.audit.recent(limit);
        if (entries.length === 0) return ok("No audited actions yet.", { entries: [] });
        const spoken = entries
          .slice(0, 3)
          .map((e) => `${e.tool} ${e.resultStatus}${e.actor ? ` by ${e.actor}` : ""}`)
          .join("; ");
        const rest = entries.length > 3 ? `, and ${entries.length - 3} more.` : ".";
        return ok(`${entries.length} recent actions: ${spoken}${rest}`, { entries });
      } catch (error) {
        return fail(spokenError(error));
      }
    },
  );
}
