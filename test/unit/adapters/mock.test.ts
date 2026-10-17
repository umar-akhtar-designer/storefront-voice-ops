import { describe, expect, it } from "vitest";
import { MockAdapter } from "../../../src/adapters/mock.js";
import { defineAdapterContract } from "../../../src/adapters/contract.js";

// Every adapter must satisfy the shared contract.
defineAdapterContract("MockAdapter", (options) => new MockAdapter(options));

const FIXED_NOW = new Date("2026-10-17T09:00:00.000Z");
const fixedClock = () => FIXED_NOW;

describe("MockAdapter specifics", () => {
  it("is deterministic for a fixed clock and seed", async () => {
    const a = new MockAdapter({ now: fixedClock, seed: 42 });
    const b = new MockAdapter({ now: fixedClock, seed: 42 });
    const [pageA, pageB] = await Promise.all([
      a.getOrders({ limit: 100 }),
      b.getOrders({ limit: 100 }),
    ]);
    expect(pageA.items.map((o) => o.id)).toEqual(pageB.items.map((o) => o.id));
    expect(pageA.items.map((o) => o.createdAt)).toEqual(pageB.items.map((o) => o.createdAt));
  });

  it("orders are returned newest first", async () => {
    const adapter = new MockAdapter({ now: fixedClock });
    const page = await adapter.getOrders({ limit: 50 });
    const times = page.items.map((o) => new Date(o.createdAt).getTime());
    const sorted = [...times].sort((x, y) => y - x);
    expect(times).toEqual(sorted);
  });

  it("sorts low-stock products by stock ascending", async () => {
    const adapter = new MockAdapter({ now: fixedClock });
    const low = await adapter.getProducts({ lowStockBelow: 10 });
    const stocks = low.map((p) => p.stock);
    expect(stocks).toEqual([...stocks].sort((a, b) => a - b));
  });

  it("finds a customer by their order id", async () => {
    const adapter = new MockAdapter({ now: fixedClock });
    const page = await adapter.getOrders({ limit: 1 });
    const order = page.items[0]!;
    const customer = await adapter.getCustomer(order.id);
    expect(customer?.id).toBe(order.customerId);
  });

  it("rejects a negative stock adjustment with a clear message", async () => {
    const adapter = new MockAdapter({ now: fixedClock });
    const product = (await adapter.getProducts())[0]!;
    await expect(adapter.adjustStock(product.sku, -(product.stock + 1), "test")).rejects.toThrow(
      /negative/i,
    );
  });
});
