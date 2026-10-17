import { limitSentences, numberToWords } from "../voice.js";
import type {
  AiService,
  AiTextResult,
  CustomerDraftInput,
  ExplainRestockInput,
  SupplierDraftInput,
} from "./types.js";

/**
 * Deterministic, offline implementation of the AI layer. It is always available (no AWS account
 * needed) and is what the public demo and the test suite use. Output follows the voice rules.
 */
export class OfflineAiService implements AiService {
  readonly enabled = false;

  async phraseBriefing(facts: string): Promise<AiTextResult> {
    return { text: limitSentences(facts, 3), source: "offline" };
  }

  async explainRestock(input: ExplainRestockInput): Promise<AiTextResult> {
    const days =
      input.unitsSold > 0
        ? `about ${numberToWords(Math.max(0, Math.floor((input.stock / input.unitsSold) * input.days)))} days of stock`
        : "little recent demand";
    return {
      text: limitSentences(
        `${input.name} has ${input.stock} left, below its reorder point of ${input.reorderPoint}, with ${days}. Order about ${input.suggestedQuantity} units to cover the next two weeks.`,
      ),
      source: "offline",
    };
  }

  async draftSupplierMessage(input: SupplierDraftInput): Promise<AiTextResult> {
    const who = input.supplierName ?? "there";
    return {
      text:
        `Hi ${who}, we'd like to order ${input.quantity} units of ${input.productName} (${input.sku}). ` +
        `We currently have ${input.currentStock} in stock. Please confirm price and the earliest delivery date. Thank you!`,
      source: "offline",
    };
  }

  async draftCustomerMessage(input: CustomerDraftInput): Promise<AiTextResult> {
    const order = input.orderId ? ` order ${input.orderId}` : "";
    let text: string;
    switch (input.kind) {
      case "shipping-update":
        text = `Hi ${input.customerName}, your${order} is on its way. We'll update you the moment it arrives.`;
        break;
      case "delay":
        text = `Hi ${input.customerName}, we're sorry your${order} is taking longer than expected. We'll share a new date very soon.`;
        break;
      case "thanks":
        text = `Hi ${input.customerName}, thank you for shopping with us. We hope you love it!`;
        break;
      default:
        text = `Hi ${input.customerName}, thanks for your order.`;
    }
    return { text: input.note ? `${text} ${input.note}` : text, source: "offline" };
  }
}

export const offlineAi = new OfflineAiService();
