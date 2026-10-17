import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ConfirmationRequest } from "../../safety/confirm.js";
import type { ToolContext } from "../context.js";
import type { ServerDeps } from "../context.js";
import { contextFor } from "../context.js";
import { fail, ok, spokenError } from "../result.js";
import { spellId } from "../../voice.js";

function confirmationRequested(ctx: ToolContext, request: ConfirmationRequest): CallToolResult {
  const action = ctx.confirm.request(ctx.sessionId, ctx.actor, request, ctx.requestId);
  const codeSpoken = action.code ? ` The code is ${spellId(action.code)}.` : "";
  return ok(`${action.summary}${codeSpoken} Say yes to confirm, or no to cancel.`, {
    confirmationRequired: true,
    actionId: action.id,
    tool: action.tool,
    summary: action.summary,
    expiresAt: action.expiresAt,
    requiresCode: action.requiresCode,
    ...(action.code ? { code: action.code } : {}),
  });
}

export function registerWriteTools(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    "mark_order_shipped",
    {
      title: "Mark order shipped",
      description:
        "Mark a pending order as shipped with a carrier. Changes store data and always asks for confirmation first.",
      inputSchema: {
        orderId: z
          .union([z.string(), z.number()])
          .transform((value) => String(value).trim())
          .pipe(z.string().min(1)),
        carrier: z.string().min(1).default("TCS"),
        tracking: z.string().min(1).optional(),
      },
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ orderId, carrier, tracking }, extra) => {
      const ctx = contextFor(deps, extra);
      try {
        const order = await deps.adapter.getOrder(orderId);
        if (order.status === "cancelled") {
          return fail(`Order ${spellId(orderId)} is cancelled, so it can't be shipped.`);
        }
        if (order.status === "shipped" && order.carrier === carrier) {
          return ok(
            `Order ${spellId(orderId)} is already shipped with ${carrier}. Nothing to do.`,
            { order, unchanged: true },
          );
        }
        return confirmationRequested(ctx, {
          tool: "mark_order_shipped",
          target: `order:${orderId}`,
          input: {
            orderId,
            carrier,
            ...(tracking ? { tracking } : {}),
          },
          summary: `Ship order ${spellId(orderId)} for ${order.customerName} with ${carrier}?`,
          requiresCode: false,
        });
      } catch (error) {
        if ((error as { code?: string }).code === "NOT_FOUND") {
          return fail(`I couldn't find order ${spellId(orderId)}.`, { orderId });
        }
        return fail(spokenError(error));
      }
    },
  );

  server.registerTool(
    "adjust_inventory",
    {
      title: "Adjust inventory",
      description:
        "Add to or remove from a product's stock. Changes store data and always asks for confirmation first. Large adjustments require a spoken code.",
      inputSchema: {
        sku: z.string().min(1),
        delta: z.number().int(),
        reason: z.string().min(1).optional(),
      },
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: true,
        openWorldHint: true,
      },
    },
    async ({ sku, delta, reason }, extra) => {
      const ctx = contextFor(deps, extra);
      if (delta === 0) return fail("I need a stock change that isn't zero.");
      try {
        const [product] = await deps.adapter.getProducts({ sku });
        if (!product) return fail(`No product with SKU ${sku}.`, { sku });
        const recordedReason = reason ?? "voice adjustment by shop owner";
        const next = product.stock + delta;
        if (next < 0) {
          return fail(
            `That would make ${product.name} go negative from ${product.stock}. It can't drop below zero.`,
            { sku, delta, currentStock: product.stock },
          );
        }
        const verb = delta > 0 ? "Add" : "Remove";
        const magnitude = Math.abs(delta);
        return confirmationRequested(ctx, {
          tool: "adjust_inventory",
          target: `sku:${product.sku}`,
          input: { sku: product.sku, delta, reason: recordedReason },
          summary: `${verb} ${magnitude} for ${product.name}, making it ${next} units?`,
          requiresCode: Math.abs(delta) >= 50,
        });
      } catch (error) {
        return fail(spokenError(error));
      }
    },
  );

  server.registerTool(
    "cancel_order",
    {
      title: "Cancel an order",
      description:
        "Cancel a pending order. Changes store data, always asks for confirmation, and requires a spoken code.",
      inputSchema: {
        orderId: z
          .union([z.string(), z.number()])
          .transform((value) => String(value).trim())
          .pipe(z.string().min(1)),
        reason: z.string().min(1).default("cancelled by shop owner"),
      },
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
        destructiveHint: true,
        openWorldHint: true,
      },
    },
    async ({ orderId, reason }, extra) => {
      const ctx = contextFor(deps, extra);
      try {
        const order = await deps.adapter.getOrder(orderId);
        if (order.status === "cancelled") {
          return ok(`Order ${spellId(orderId)} is already cancelled.`, { order, unchanged: true });
        }
        if (order.status !== "pending") {
          return fail(
            `Order ${spellId(orderId)} is ${order.status}, so it can't be cancelled. It would need a refund instead.`,
            { orderId, status: order.status },
          );
        }
        return confirmationRequested(ctx, {
          tool: "cancel_order",
          target: `order:${orderId}`,
          input: { orderId, reason },
          summary: `Cancel order ${spellId(orderId)} for ${order.customerName}? This cannot be undone.`,
          requiresCode: true,
        });
      } catch (error) {
        if ((error as { code?: string }).code === "NOT_FOUND") {
          return fail(`I couldn't find order ${spellId(orderId)}.`, { orderId });
        }
        return fail(spokenError(error));
      }
    },
  );
}
