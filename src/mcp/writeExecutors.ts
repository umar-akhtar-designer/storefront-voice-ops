import type { ToolContext } from "./context.js";
import { spokenError } from "./result.js";
import { spellId } from "../voice.js";

export const WRITE_TOOLS = ["mark_order_shipped", "adjust_inventory", "cancel_order"] as const;
export type WriteToolName = (typeof WRITE_TOOLS)[number];

export type WriteOutcome =
  | { status: "success"; text: string; structured: Record<string, unknown> }
  | { status: "error"; text: string };

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number.NaN;
}

async function ship(input: Record<string, unknown>, ctx: ToolContext): Promise<WriteOutcome> {
  const orderId = str(input.orderId);
  const carrier = str(input.carrier, "TCS");
  const tracking = str(input.tracking) || undefined;

  const before = await ctx.adapter.getOrder(orderId);
  if (before.status === "cancelled") {
    return {
      status: "error",
      text: `Order ${spellId(orderId)} is cancelled, so it can't be shipped.`,
    };
  }

  const order = await ctx.adapter.fulfillOrder(orderId, {
    carrier,
    ...(tracking ? { tracking } : {}),
  });

  if (before.status === "shipped" && before.carrier === carrier) {
    return {
      status: "success",
      text: `Order ${spellId(orderId)} was already shipped with ${carrier}. No change made.`,
      structured: { order, unchanged: true },
    };
  }
  return {
    status: "success",
    text: `Done. Order ${spellId(orderId)} for ${order.customerName} is on its way with ${carrier}.`,
    structured: { order },
  };
}

async function adjust(input: Record<string, unknown>, ctx: ToolContext): Promise<WriteOutcome> {
  const sku = str(input.sku);
  const delta = asNumber(input.delta);
  const reason = str(input.reason);

  if (!Number.isFinite(delta) || delta === 0) {
    return { status: "error", text: "I need a stock change that isn't zero." };
  }
  if (!reason.trim()) {
    return { status: "error", text: "I need a reason recorded for that stock change." };
  }

  const product = await ctx.adapter.adjustStock(sku, delta, reason);
  const verb = delta > 0 ? "added" : "removed";
  const magnitude = Math.abs(delta);
  return {
    status: "success",
    text: `${verb === "added" ? "Added" : "Removed"} ${magnitude} for ${product.name}. Stock is ${product.stock} now.`,
    structured: { product, delta, reason },
  };
}

async function cancel(input: Record<string, unknown>, ctx: ToolContext): Promise<WriteOutcome> {
  const orderId = str(input.orderId);
  const reason = str(input.reason);
  const order = await ctx.adapter.cancelOrder(orderId, reason);
  return {
    status: "success",
    text: `Order ${spellId(orderId)} for ${order.customerName} is cancelled.`,
    structured: { order, reason },
  };
}

/**
 * Runs a confirmed write action exactly once. Called only by `confirm_action` after the safety
 * layer has validated the pending action.
 */
export async function executeWriteAction(
  tool: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<WriteOutcome> {
  try {
    switch (tool as WriteToolName) {
      case "mark_order_shipped":
        return await ship(input, ctx);
      case "adjust_inventory":
        return await adjust(input, ctx);
      case "cancel_order":
        return await cancel(input, ctx);
      default:
        return { status: "error", text: `I don't know how to run ${tool}.` };
    }
  } catch (error) {
    return { status: "error", text: spokenError(error) };
  }
}
