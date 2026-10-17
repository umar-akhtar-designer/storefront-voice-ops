import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { orders, products } from "./data.js";
import { spokenBriefing } from "./bedrock.js";

const pkr = (n: number) => `${n.toLocaleString("en-US")} rupees`;
const text = (t: string, structured?: Record<string, unknown>) => ({
  content: [{ type: "text" as const, text: t }],
  ...(structured ? { structuredContent: structured } : {}),
});
const inLastDays = (date: string, d: number) =>
  Date.now() - new Date(date).getTime() <= d * 864e5 + 864e5;

export function buildServer() {
  const s = new McpServer({ name: "storefront-voice-ops", version: "1.0.0" });

  s.registerTool(
    "get_sales_summary",
    {
      description: "Revenue and order count for a period: today, week, or month.",
      inputSchema: { period: z.enum(["today", "week", "month"]).default("today") },
    },
    async ({ period }) => {
      const days = period === "today" ? 0 : period === "week" ? 7 : 30;
      const o = orders.filter((x) => inLastDays(x.date, days));
      const revenue = o.reduce((a, x) => a + x.total, 0);
      return text(`${period}: ${o.length} orders, ${pkr(revenue)} in revenue.`, {
        period,
        orders: o.length,
        revenue,
      });
    },
  );

  s.registerTool(
    "list_low_stock",
    {
      description: "Products at or below a stock threshold (default 10).",
      inputSchema: { threshold: z.number().int().min(0).default(10) },
    },
    async ({ threshold }) => {
      const low = products.filter((p) => p.stock <= threshold);
      if (!low.length) return text("Nothing is low on stock.");
      return text(low.map((p) => `${p.name} (${p.sku}): ${p.stock} left`).join("; "), { low });
    },
  );

  s.registerTool(
    "list_orders",
    {
      description: "List orders, optionally filtered by status (pending, shipped, delivered).",
      inputSchema: { status: z.enum(["pending", "shipped", "delivered"]).optional() },
    },
    async ({ status }) => {
      const o = orders.filter((x) => !status || x.status === status);
      return text(
        o.length
          ? o.map((x) => `#${x.id} ${x.customer}, ${pkr(x.total)}, ${x.status}`).join("; ")
          : "No matching orders.",
        { orders: o },
      );
    },
  );

  s.registerTool(
    "get_order",
    {
      description: "Details of one order by its number.",
      inputSchema: { orderId: z.number().int() },
    },
    async ({ orderId }) => {
      const o = orders.find((x) => x.id === orderId);
      if (!o) return { ...text(`I couldn't find order ${orderId}.`), isError: true };
      const items = o.items
        .map((i) => `${i.qty} x ${products.find((p) => p.sku === i.sku)?.name ?? i.sku}`)
        .join(", ");
      return text(
        `Order ${o.id} for ${o.customer}: ${items}, total ${pkr(o.total)}, status ${o.status}${o.carrier ? ` via ${o.carrier}` : ""}.`,
        { order: o },
      );
    },
  );

  s.registerTool(
    "mark_order_shipped",
    {
      description: "Mark a pending order as shipped with a carrier. Changes store data.",
      inputSchema: { orderId: z.number().int(), carrier: z.string().default("TCS") },
    },
    async ({ orderId, carrier }) => {
      const o = orders.find((x) => x.id === orderId);
      if (!o) return { ...text(`Order ${orderId} doesn't exist.`), isError: true };
      if (o.status !== "pending")
        return { ...text(`Order ${orderId} is already ${o.status}.`), isError: true };
      o.status = "shipped";
      o.carrier = carrier;
      return text(`Done. Order ${orderId} for ${o.customer} is marked shipped with ${carrier}.`, {
        order: o,
      });
    },
  );

  s.registerTool(
    "draft_restock_message",
    {
      description: "Draft a restock message to the supplier of a product (does not send it).",
      inputSchema: { sku: z.string(), quantity: z.number().int().min(1).default(50) },
    },
    async ({ sku, quantity }) => {
      const p = products.find((x) => x.sku.toLowerCase() === sku.toLowerCase());
      if (!p) return { ...text(`No product with SKU ${sku}.`), isError: true };
      const msg = `Hi ${p.supplier}, we need ${quantity} units of ${p.name} (${p.sku}). Current stock is ${p.stock}. Please confirm price and delivery date. Thanks!`;
      return text(msg, { supplier: p.supplier, message: msg });
    },
  );

  s.registerTool(
    "get_daily_briefing",
    {
      description:
        "A spoken morning briefing: sales, pending orders to ship, and low-stock risks. Uses Amazon Bedrock to phrase it.",
      inputSchema: {},
    },
    async () => {
      const today = orders.filter((x) => inLastDays(x.date, 0));
      const pending = orders.filter((x) => x.status === "pending");
      const low = products.filter((p) => p.stock <= 10);
      const facts = `Today: ${today.length} orders, ${pkr(today.reduce((a, x) => a + x.total, 0))}. ${pending.length} orders waiting to ship (${pending.map((x) => "#" + x.id).join(", ")}). Low stock: ${low.map((p) => `${p.name} has ${p.stock}`).join("; ") || "none"}.`;
      return text(await spokenBriefing(facts), { pending: pending.length, low: low.length });
    },
  );

  return s;
}
