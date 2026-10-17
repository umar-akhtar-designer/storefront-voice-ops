import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../../src/server.js";

const TOOL_NAMES = [
  "get_daily_briefing",
  "get_sales_summary",
  "get_top_sellers",
  "list_orders",
  "get_order",
  "list_low_stock",
  "forecast_restock",
  "lookup_customer",
  "get_weekly_report",
  "get_audit_log",
  "draft_restock_message",
  "draft_customer_message",
  "mark_order_shipped",
  "adjust_inventory",
  "cancel_order",
  "confirm_action",
  "cancel_action",
  "list_pending_actions",
];

interface CallResult {
  text: string;
  structured: Record<string, any>;
  isError: boolean;
}

let httpServer: Server;
let baseUrl: string;
let clientA: Client;
let clientB: Client;

async function connect(name: string): Promise<Client> {
  const client = new Client({ name, version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(baseUrl)));
  return client;
}

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<CallResult> {
  const result = await client.callTool({ name, arguments: args });
  const content = (result.content ?? []) as { text?: string }[];
  return {
    text: content.map((c) => c.text ?? "").join(""),
    structured: (result.structuredContent ?? {}) as Record<string, any>,
    isError: result.isError === true,
  };
}

async function firstPendingOrder(client: Client): Promise<{ id: string; customer: string }> {
  const res = await call(client, "list_orders", { status: "pending", limit: 10 });
  const order = (res.structured.orders as { id: string; customerName: string }[])[0];
  if (!order) throw new Error("expected at least one pending order in the seed data");
  return { id: order.id, customer: order.customerName };
}

beforeAll(async () => {
  const app = createApp();
  httpServer = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => httpServer.once("listening", () => resolve()));
  const address = httpServer.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/mcp`;
  clientA = await connect("client-a");
  clientB = await connect("client-b");
});

afterAll(async () => {
  await clientA?.close();
  await clientB?.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

describe("MCP tool catalog", () => {
  it("exposes every documented tool", async () => {
    const names = (await clientA.listTools()).tools.map((t) => t.name);
    for (const expected of TOOL_NAMES) {
      expect(names, `missing tool ${expected}`).toContain(expected);
    }
  });

  it("exposes resources and prompts", async () => {
    const resources = (await clientA.listResources()).resources.map((r) => r.uri ?? "");
    expect(resources.join(" ")).toContain("store://");
    const prompts = (await clientA.listPrompts()).prompts.map((p) => p.name);
    expect(prompts).toContain("morning-briefing");
    expect(prompts).toContain("weekly-review");
    expect(prompts).toContain("restock-run");
  });
});

describe("read tools", () => {
  it("returns a sales summary as speech and structured data", async () => {
    const res = await call(clientA, "get_sales_summary", { period: "today" });
    expect(res.isError).toBe(false);
    expect(res.structured.period).toBe("today");
    expect(typeof res.structured.orderCount).toBe("number");
    expect(res.text.length).toBeGreaterThan(0);
  });

  it("lists low stock with a count", async () => {
    const res = await call(clientA, "list_low_stock", { threshold: 10 });
    expect(res.isError).toBe(false);
    expect(Array.isArray(res.structured.products)).toBe(true);
  });

  it("produces a restock forecast with suggested quantities", async () => {
    const res = await call(clientA, "forecast_restock", { threshold: 10 });
    expect(res.isError).toBe(false);
    const items = res.structured.items as { suggestedQuantity: number }[];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.suggestedQuantity).toBeGreaterThanOrEqual(0);
    }
  });

  it("reads the store summary resource as JSON", async () => {
    const res = await clientA.readResource({ uri: "store://summary" });
    const first = res.contents[0] as { text?: string };
    const body = JSON.parse(first.text ?? "{}");
    expect(body).toHaveProperty("today");
    expect(body).toHaveProperty("pipeline");
    expect(body.provider).toBe("mock");
  });

  it("returns a morning-briefing prompt", async () => {
    const res = await clientA.getPrompt({ name: "morning-briefing", arguments: { focus: "all" } });
    expect(res.messages.length).toBeGreaterThan(0);
    const message = res.messages[0]!.content as { type: string; text?: string };
    expect(message.text).toContain("get_daily_briefing");
  });

  it("reports a friendly error for a missing order", async () => {
    const res = await call(clientA, "get_order", { orderId: "999999" });
    expect(res.isError).toBe(true);
    expect(res.text.toLowerCase()).toContain("couldn't find");
  });
});

describe("draft tools (never send)", () => {
  it("drafts a supplier message and marks it unsent", async () => {
    const res = await call(clientA, "draft_restock_message", { sku: "TEE-BLK-M", quantity: 40 });
    expect(res.isError).toBe(false);
    expect(res.structured.sent).toBe(false);
    expect(res.structured.source).toBe("offline");
    expect(res.text.length).toBeGreaterThan(0);
  });
});

describe("write actions ask for confirmation", () => {
  it("runs a confirmed shipment exactly once", async () => {
    const order = await firstPendingOrder(clientA);

    const asked = await call(clientA, "mark_order_shipped", { orderId: order.id, carrier: "TCS" });
    expect(asked.isError).toBe(false);
    expect(asked.structured.confirmationRequired).toBe(true);
    expect(asked.structured.requiresCode).toBe(false);
    const actionId = asked.structured.actionId as string;
    expect(actionId).toBeTruthy();

    const done = await call(clientA, "confirm_action", { actionId });
    expect(done.isError).toBe(false);
    expect(done.structured.executed).toBe(true);

    const orderAfter = await call(clientA, "get_order", { orderId: order.id });
    expect(orderAfter.structured.order.status).toBe("shipped");
    expect(orderAfter.structured.order.carrier).toBe("TCS");

    const repeat = await call(clientA, "confirm_action", { actionId });
    expect(repeat.structured.alreadyConfirmed).toBe(true);
  });

  it("does not expose a confirmation to a different session", async () => {
    const order = await firstPendingOrder(clientA);
    const asked = await call(clientA, "mark_order_shipped", { orderId: order.id });
    const actionId = asked.structured.actionId as string;

    const fromOtherSession = await call(clientB, "confirm_action", { actionId });
    expect(fromOtherSession.isError).toBe(true);

    const cleaned = await call(clientA, "cancel_action", { actionId });
    expect(cleaned.isError).toBe(false);
  });

  it("requires a spoken code to cancel an order", async () => {
    const order = await firstPendingOrder(clientA);

    const asked = await call(clientA, "cancel_order", { orderId: order.id, reason: "test" });
    expect(asked.structured.confirmationRequired).toBe(true);
    expect(asked.structured.requiresCode).toBe(true);
    const code = asked.structured.code as string;
    expect(code).toMatch(/^\d{4}$/);

    const withoutCode = await call(clientA, "confirm_action", {});
    expect(withoutCode.isError).toBe(true);

    const wrongCode = await call(clientA, "confirm_action", {
      code: code === "0000" ? "1111" : "0000",
    });
    expect(wrongCode.isError).toBe(true);

    const done = await call(clientA, "confirm_action", { code });
    expect(done.isError).toBe(false);
    expect(done.structured.executed).toBe(true);

    const orderAfter = await call(clientA, "get_order", { orderId: order.id });
    expect(orderAfter.structured.order.status).toBe("cancelled");
  });

  it("guards inventory adjustments and requires a code for large changes", async () => {
    const negative = await call(clientA, "adjust_inventory", {
      sku: "TEE-BLK-L",
      delta: -99999,
      reason: "test",
    });
    expect(negative.isError).toBe(true);

    const small = await call(clientA, "adjust_inventory", {
      sku: "TEE-BLK-L",
      delta: 5,
      reason: "received delivery",
    });
    expect(small.structured.confirmationRequired).toBe(true);
    expect(small.structured.requiresCode).toBe(false);
    await call(clientA, "cancel_action", {});

    const large = await call(clientA, "adjust_inventory", {
      sku: "TEE-BLK-L",
      delta: 60,
      reason: "bulk delivery",
    });
    expect(large.structured.requiresCode).toBe(true);
    await call(clientA, "cancel_action", { actionId: large.structured.actionId });
  });

  it("shows and clears pending actions", async () => {
    const order = await firstPendingOrder(clientA);
    const asked = await call(clientA, "mark_order_shipped", { orderId: order.id });

    const pending = await call(clientA, "list_pending_actions");
    const actions = pending.structured.actions as { actionId: string }[];
    expect(actions.map((a) => a.actionId)).toContain(asked.structured.actionId);

    await call(clientA, "cancel_action", { actionId: asked.structured.actionId });
    const after = await call(clientA, "list_pending_actions");
    expect((after.structured.actions as unknown[]).length).toBe(0);
  });

  it("records confirmed and executed actions in the audit log", async () => {
    const res = await call(clientA, "get_audit_log", { limit: 50 });
    const entries = res.structured.entries as { tool: string; resultStatus: string }[];
    const statuses = entries.map((e) => e.resultStatus);
    expect(statuses).toContain("confirmation_created");
    expect(statuses).toContain("executed");
    expect(statuses).toContain("cancelled");
  });
});
