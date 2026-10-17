import { describe, expect, it } from "vitest";
import { OfflineAiService } from "../../../src/ai/offline.js";
import { BedrockAiService } from "../../../src/ai/bedrock.js";

const ai = new OfflineAiService();

describe("OfflineAiService", () => {
  it("is disabled and reports the offline source", async () => {
    expect(ai.enabled).toBe(false);
    const result = await ai.phraseBriefing("Today: 3 orders and 9000 rupees in revenue.");
    expect(result.source).toBe("offline");
    expect(result.text).toContain("orders");
  });

  it("keeps a briefing to at most three sentences", async () => {
    const facts = "One. Two. Three. Four. Five.";
    const result = await ai.phraseBriefing(facts);
    const sentences = result.text.match(/[^.!?]+[.!?]+/g) ?? [];
    expect(sentences.length).toBeLessThanOrEqual(3);
  });

  it("explains a restock with the product name and suggested quantity", async () => {
    const result = await ai.explainRestock({
      sku: "CAP-NVY",
      name: "Navy Cap",
      stock: 3,
      reorderPoint: 12,
      unitsSold: 14,
      days: 7,
      suggestedQuantity: 30,
    });
    expect(result.text).toContain("Navy Cap");
    expect(result.text).toContain("30");
  });

  it("drafts a supplier message without sending it", async () => {
    const result = await ai.draftSupplierMessage({
      supplierName: "Madina Knits",
      productName: "Navy Cap",
      sku: "CAP-NVY",
      quantity: 40,
      currentStock: 3,
    });
    expect(result.text).toContain("Madina Knits");
    expect(result.text).toContain("40");
    expect(result.text).not.toContain("<data>");
  });

  it("drafts each customer message kind", async () => {
    for (const kind of ["shipping-update", "delay", "thanks"] as const) {
      const result = await ai.draftCustomerMessage({ customerName: "Bilal R.", kind });
      expect(result.text).toContain("Bilal R.");
    }
  });
});

describe("BedrockAiService", () => {
  it("falls back to the offline templates when Bedrock is not enabled", async () => {
    const service = new BedrockAiService();
    expect(service.enabled).toBe(false);
    const result = await service.phraseBriefing("Today: 2 orders.");
    expect(result.source).toBe("offline");
    expect(result.text).toContain("orders");
  });
});
