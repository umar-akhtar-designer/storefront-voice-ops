import { describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "./errors.js";
import type { StoreAdapter } from "./types.js";

export interface AdapterContractOptions {
  /** Optional fixed clock for adapters that support one (returns the same Date every call). */
  now?: () => Date;
  /** Optional seed for adapters that support deterministic data. */
  seed?: number;
}

export type AdapterFactory = (
  options: AdapterContractOptions,
) => StoreAdapter | Promise<StoreAdapter>;

/**
 * The shared contract every StoreAdapter must satisfy. The adapter under test is expected to point
 * at a seeded store (the MockAdapter is seeded by construction; the Shopify dev store and the
 * WooCommerce test site are seeded per the team brief).
 */
export function defineAdapterContract(name: string, factory: AdapterFactory): void {
  describe(`StoreAdapter contract: ${name}`, () => {
    const make = () => factory({});

    it("identifies its provider and currency", async () => {
      const adapter = await make();
      expect(typeof adapter.provider).toBe("string");
      expect(adapter.provider.length).toBeGreaterThan(0);
      expect(adapter.currency).toMatch(/^[A-Z]{3}$/);
    });

    it("returns products with required fields", async () => {
      const adapter = await make();
      const products = await adapter.getProducts();
      expect(Array.isArray(products)).toBe(true);
      expect(products.length).toBeGreaterThan(0);
      const product = products[0]!;
      expect(product.sku).toBeTruthy();
      expect(typeof product.name).toBe("string");
      expect(typeof product.stock).toBe("number");
      expect(typeof product.reorderPoint).toBe("number");
      expect(typeof product.price.amount).toBe("number");
    });

    it("filters products by sku and by low stock", async () => {
      const adapter = await make();
      const all = await adapter.getProducts();
      const sample = all[0]!;

      const bySku = await adapter.getProducts({ sku: sample.sku });
      expect(bySku.some((p) => p.sku === sample.sku)).toBe(true);

      const maxStock = Math.max(...all.map((p) => p.stock));
      const low = await adapter.getProducts({ lowStockBelow: maxStock });
      expect(low.every((p) => p.stock <= maxStock)).toBe(true);
      expect(low.length).toBeGreaterThan(0);
    });

    it("gets a known order and rejects an unknown one", async () => {
      const adapter = await make();
      const page = await adapter.getOrders({ limit: 1 });
      const order = page.items[0]!;
      const fetched = await adapter.getOrder(order.id);
      expect(fetched.id).toBe(order.id);
      expect(Array.isArray(fetched.items)).toBe(true);
      await expect(adapter.getOrder("__missing-order__")).rejects.toBeInstanceOf(NotFoundError);
    });

    it("lists orders and filters by status", async () => {
      const adapter = await make();
      const page = await adapter.getOrders({ limit: 5 });
      expect(page.items.length).toBeGreaterThan(0);
      expect(page.items.length).toBeLessThanOrEqual(5);
      expect(typeof page.total).toBe("number");

      const pending = await adapter.getOrders({ status: "pending", limit: 100 });
      expect(pending.items.every((o) => o.status === "pending")).toBe(true);
    });

    it("paginates order results with a cursor", async () => {
      const adapter = await make();
      const first = await adapter.getOrders({ limit: 2 });
      if (!first.nextCursor) return;
      const second = await adapter.getOrders({ limit: 2, cursor: first.nextCursor });
      const firstIds = new Set(first.items.map((o) => o.id));
      expect(second.items.every((o) => !firstIds.has(o.id))).toBe(true);
    });

    it("fulfills a pending order and is idempotent", async () => {
      const adapter = await make();
      const pending = await adapter.getOrders({ status: "pending", limit: 1 });
      const target = pending.items[0];
      if (!target) return;

      const shipped = await adapter.fulfillOrder(target.id, { carrier: "TCS", tracking: "TRK123" });
      expect(shipped.status).toBe("shipped");
      expect(shipped.carrier).toBe("TCS");

      const again = await adapter.fulfillOrder(target.id, { carrier: "TCS", tracking: "TRK123" });
      expect(again.status).toBe("shipped");
      expect(again.id).toBe(target.id);
    });

    it("rejects fulfilling an unknown order", async () => {
      const adapter = await make();
      await expect(
        adapter.fulfillOrder("__missing-order__", { carrier: "TCS" }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("adjusts stock and validates the adjustment", async () => {
      const adapter = await make();
      const products = await adapter.getProducts();
      const product = products.reduce((min, p) => (p.stock < min.stock ? p : min), products[0]!);

      const increased = await adapter.adjustStock(product.sku, 5, "contract test");
      expect(increased.stock).toBe(product.stock + 5);

      await expect(
        adapter.adjustStock(product.sku, -(product.stock + 1000), "too much"),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(adapter.adjustStock(product.sku, 1, "")).rejects.toBeInstanceOf(ValidationError);
      await expect(adapter.adjustStock("__missing-sku__", 1, "test")).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it("summarises sales for a date range", async () => {
      const adapter = await make();
      const to = new Date();
      const from = new Date(to.getTime() - 90 * 86400000);
      const summary = await adapter.getSalesBetween(from, to);
      expect(summary.orderCount).toBeGreaterThanOrEqual(0);
      expect(summary.revenue.amount).toBeGreaterThanOrEqual(0);
      expect(summary.averageOrderValue.amount).toBeGreaterThanOrEqual(0);
    });

    it("ranks top sellers and respects the limit", async () => {
      const adapter = await make();
      const to = new Date();
      const from = new Date(to.getTime() - 90 * 86400000);
      const top = await adapter.getTopSellers(from, to, 3);
      expect(top.length).toBeLessThanOrEqual(3);
      for (let i = 1; i < top.length; i++) {
        expect(top[i - 1]!.units).toBeGreaterThanOrEqual(top[i]!.units);
      }
    });

    it("looks up a customer and returns null for unknown input", async () => {
      const adapter = await make();
      const page = await adapter.getOrders({ limit: 1 });
      const order = page.items[0]!;
      const found = await adapter.getCustomer(order.customerName);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(order.customerId);

      const missing = await adapter.getCustomer("__nobody__");
      expect(missing).toBeNull();
    });
  });
}
