import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerDeps } from "../context.js";
import { contextFor } from "../context.js";
import { fail, ok, spokenError } from "../result.js";

const kindSchema = z.enum(["shipping-update", "delay", "thanks"]);

const kindLabel: Record<z.infer<typeof kindSchema>, string> = {
  "shipping-update": "shipping update",
  delay: "delay",
  thanks: "thank you",
};

export function registerDraftTools(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    "draft_restock_message",
    {
      title: "Draft a restock message",
      description:
        "Draft a restock message to a product's supplier. It is only drafted, never sent.",
      inputSchema: {
        sku: z.string().min(1),
        quantity: z.number().int().min(1).max(10000).default(50),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
    },
    async ({ sku, quantity }, extra) => {
      const ctx = contextFor(deps, extra);
      try {
        const [product] = await deps.adapter.getProducts({ sku });
        if (!product) return fail(`No product with SKU ${sku}.`, { sku });

        const draft = ctx.ai
          ? await ctx.ai.draftSupplierMessage({
              ...(product.supplierName ? { supplierName: product.supplierName } : {}),
              productName: product.name,
              sku: product.sku,
              quantity,
              currentStock: product.stock,
            })
          : {
              text: `Hi ${product.supplierName ?? "there"}, we need ${quantity} units of ${product.name} (${product.sku}). We have ${product.stock} left. Please confirm price and delivery date. Thanks!`,
              source: "offline" as const,
            };

        return ok(draft.text, {
          supplier: product.supplierName ?? null,
          supplierContact: product.supplierContact ?? null,
          message: draft.text,
          sent: false,
          source: draft.source,
        });
      } catch (error) {
        return fail(spokenError(error));
      }
    },
  );

  server.registerTool(
    "draft_customer_message",
    {
      title: "Draft a customer message",
      description:
        "Draft a message to a customer (shipping update, delay, or thank you). It is only drafted, never sent.",
      inputSchema: {
        orderId: z
          .union([z.string(), z.number()])
          .transform((value) => String(value).trim())
          .pipe(z.string().min(1))
          .optional(),
        query: z.string().min(1).optional(),
        kind: kindSchema,
        note: z.string().max(500).optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
    },
    async ({ orderId, query, kind, note }, extra) => {
      const ctx = contextFor(deps, extra);
      if (!orderId && !query) {
        return fail("Tell me an order number or a customer name first.", { kind });
      }
      try {
        let customerName = "";
        let resolvedOrderId: string | undefined;
        if (orderId) {
          const order = await deps.adapter.getOrder(orderId);
          customerName = order.customerName;
          resolvedOrderId = order.id;
        } else if (query) {
          const customer = await deps.adapter.getCustomer(query);
          if (!customer) return fail(`I couldn't find a customer matching ${query}.`, { query });
          customerName = customer.name;
        }

        const draft = ctx.ai
          ? await ctx.ai.draftCustomerMessage({
              customerName,
              ...(resolvedOrderId ? { orderId: resolvedOrderId } : {}),
              kind,
              ...(note ? { note } : {}),
            })
          : {
              text: offlineCustomerMessage(customerName, resolvedOrderId, kind, note),
              source: "offline" as const,
            };

        return ok(draft.text, {
          customerName,
          ...(resolvedOrderId ? { orderId: resolvedOrderId } : {}),
          kind,
          kindLabel: kindLabel[kind],
          message: draft.text,
          sent: false,
          source: draft.source,
        });
      } catch (error) {
        if ((error as { code?: string }).code === "NOT_FOUND") {
          return fail(`I couldn't find order ${orderId}.`, { orderId });
        }
        return fail(spokenError(error));
      }
    },
  );
}

function offlineCustomerMessage(
  customerName: string,
  orderId: string | undefined,
  kind: z.infer<typeof kindSchema>,
  note?: string,
): string {
  const order = orderId ? ` order ${orderId}` : "";
  let text: string;
  switch (kind) {
    case "shipping-update":
      text = `Hi ${customerName}, your${order} is on its way. We'll update you as soon as it arrives.`;
      break;
    case "delay":
      text = `Hi ${customerName}, we're sorry your${order} is taking longer than expected. We'll share a new date very soon.`;
      break;
    case "thanks":
      text = `Hi ${customerName}, thank you for shopping with us. We hope you love it!`;
      break;
    default:
      text = `Hi ${customerName}, thanks for your order.`;
  }
  return note ? `${text} ${note}` : text;
}
