import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerDeps } from "./context.js";
import { contextFor } from "./context.js";
import { moneyForSpeech, spellId } from "../voice.js";

const JSON_MIME = "application/json";

function text(
  uri: URL,
  body: unknown,
): {
  contents: { uri: string; mimeType: string; text: string }[];
} {
  return {
    contents: [{ uri: uri.toString(), mimeType: JSON_MIME, text: JSON.stringify(body, null, 2) }],
  };
}

function utcDayStart(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function registerResources(server: McpServer, deps: ServerDeps): void {
  server.registerResource(
    "store-summary",
    "store://summary",
    {
      title: "Store summary",
      description: "A snapshot of the store: today's sales, order pipeline, and stock risks.",
      mimeType: JSON_MIME,
    },
    async (uri, extra) => {
      const ctx = contextFor(deps, extra);
      const now = ctx.now();
      const start = utcDayStart(now);
      const [sales, products, pending, low] = await Promise.all([
        deps.adapter.getSalesBetween(start, now),
        deps.adapter.getProducts(),
        deps.adapter.getOrders({ status: "pending", limit: 100 }),
        deps.adapter.getProducts({ lowStockBelow: 10 }),
      ]);
      ctx.confirm.expireStale();
      const awaiting = ctx.confirm.list(ctx.sessionId).filter((a) => a.status === "pending");

      return text(uri, {
        generatedAt: now.toISOString(),
        provider: deps.adapter.provider,
        currency: deps.adapter.currency,
        today: {
          orderCount: sales.orderCount,
          revenue: sales.revenue,
          revenueSpoken: moneyForSpeech(sales.revenue.amount, sales.revenue.currency),
        },
        catalog: { productCount: products.length },
        pipeline: {
          pendingOrders: pending.total,
          pendingOrderIds: pending.items.slice(0, 10).map((o) => spellId(o.id)),
        },
        lowStock: {
          count: low.length,
          items: low.slice(0, 10).map((p) => ({ sku: p.sku, name: p.name, stock: p.stock })),
        },
        awaitingConfirmation: awaiting.length,
      });
    },
  );

  server.registerResource(
    "low-stock",
    "store://low-stock",
    {
      title: "Low stock list",
      description: "Every product at or below its stock threshold, worst first.",
      mimeType: JSON_MIME,
    },
    async (uri, extra) => {
      void contextFor(deps, extra);
      const products = await deps.adapter.getProducts({ lowStockBelow: 20 });
      return text(uri, {
        generatedAt: deps.now().toISOString(),
        products: products.map((p) => ({
          sku: p.sku,
          name: p.name,
          stock: p.stock,
          reorderPoint: p.reorderPoint,
          belowReorderPoint: p.stock <= p.reorderPoint,
          supplier: p.supplierName ?? null,
        })),
      });
    },
  );

  server.registerResource(
    "pending-orders",
    "store://pending-orders",
    {
      title: "Pending orders",
      description: "Orders still waiting to be shipped, oldest first.",
      mimeType: JSON_MIME,
    },
    async (uri, extra) => {
      void contextFor(deps, extra);
      const page = await deps.adapter.getOrders({ status: "pending", limit: 100 });
      const orders = [...page.items].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      return text(uri, {
        generatedAt: deps.now().toISOString(),
        total: page.total,
        orders: orders.map((o) => ({
          id: o.id,
          customer: o.customerName,
          total: o.total,
          createdAt: o.createdAt,
          itemCount: o.items.length,
        })),
      });
    },
  );
}
