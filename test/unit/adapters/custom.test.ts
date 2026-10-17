import { describe, expect, it } from "vitest";
import {
  CustomAdapter,
  defineAdapterContract,
  mapCustomOrder,
  type CustomOrderNode,
  type CustomProductNode,
} from "@voice-ops/store-adapters";

/**
 * An in-memory custom-store API implementing exactly the routes/payload shapes of the PHP drop-in
 * (`docs/custom-store-php-kit/voice-ops-api.php`) so the shared adapter contract runs for real with
 * no live site.
 */
interface FakeState {
  apiRequests: { method: string; path: string; auth: string }[];
  orders: CustomOrderNode[];
  products: CustomProductNode[];
}

const money = (amount: number) => ({ amount, currency: "PKR" });

function fakeCustomFetch(state: FakeState) {
  return async function respond(
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> {
    const url = new URL(typeof input === "string" ? input : String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const auth = String(
      (init?.headers as Record<string, string>)?.["x-api-key"] ?? "",
    );
    const body =
      typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    // Whatever folder prefix the hosting adds, route on what follows the script file itself.
    const path = (url.pathname.split("voice-ops-api.php").pop() ?? "").replace(/^\//, "");
    state.apiRequests.push({ method, path, auth });

    const reply = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

    if (auth !== "key_kapraa_1") return reply({ error: "Missing or wrong x-api-key header" }, 401);

    if (path === "tables") return reply({ orders: ["order_number"] });

    if (path === "orders" && method === "GET") {
      const status = url.searchParams.get("status");
      const limit = Number(url.searchParams.get("limit")) || 20;
      let orders = state.orders;
      if (status) orders = orders.filter((order) => order.status === status);
      const sorted = [...orders].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return reply({ items: sorted.slice(0, limit) });
    }

    const fulfil = /^orders\/([^/]+)\/fulfill$/.exec(path);
    if (fulfil && method === "POST") {
      const order = state.orders.find((entry) => entry.id === decodeURIComponent(fulfil[1]!));
      if (!order) return reply({ error: "not found" }, 404);
      order.status = "shipped";
      order.trackingNumber = String(body.tracking ?? "");
      return reply(order);
    }

    const cancel = /^orders\/([^/]+)\/cancel$/.exec(path);
    if (cancel && method === "POST") {
      const order = state.orders.find((entry) => entry.id === decodeURIComponent(cancel[1]!));
      if (!order) return reply({ error: "not found" }, 404);
      order.status = "cancelled";
      order.cancelledReason = String(body.reason ?? "");
      return reply(order);
    }

    const orderGet = /^orders\/([^/]+)$/.exec(path);
    if (orderGet && method === "GET") {
      const order = state.orders.find((entry) => entry.id === decodeURIComponent(orderGet[1]!));
      return order ? reply(order) : reply({ error: "Order not found" }, 404);
    }

    if (path === "products" && method === "GET") {
      const below = url.searchParams.get("lowStockBelow");
      const items = state.products.filter((p) => (below === null ? true : p.stock <= Number(below)));
      return reply({ items });
    }

    const restock = /^products\/([^/]+)\/restock$/.exec(path);
    if (restock && method === "POST") {
      const product = state.products.find((p) => p.sku === decodeURIComponent(restock[1]!));
      if (!product) return reply({ error: `No product with SKU ${restock[1]!}` }, 404);
      const quantity = Number(body.quantity);
      if (!Number.isFinite(quantity) || quantity < 0) {
        return reply({ error: "quantity must be a non-negative number" }, 400);
      }
      product.stock = body.mode === "add" ? product.stock + quantity : quantity;
      return reply(product);
    }

    return reply({ error: "Unknown endpoint" }, 404);
  };
}

function fixture(): FakeState {
  return {
    apiRequests: [],
    products: [
      { sku: "PRD-HN74N3M4", name: "Bin Saeed Unstitched 3PC Khaddar Winter Collections", stock: 3, price: money(2650) },
      { sku: "PRD-A3LTKFSF", name: "3 Piece - Gold Unstitched Red Embroidered Lawn Suit", stock: 0, price: money(5000) },
      { sku: "PRD-359A24RT", name: "SAYA Volume 527 Summer Collection Unstitched 3PC Suit", stock: 12, price: money(2650) },
    ],
    orders: [
      {
        id: "ORD-2026-6AD0F3FCE9FBD",
        createdAt: "2026-10-15 15:40:44",
        status: "pending",
        total: money(3100),
        customerName: "Rizwana Ahmad",
        customerPhone: "03064878102",
        customerEmail: "rizwana@example.com",
        trackingNumber: null,
        cancelledReason: null,
        items: [{ sku: "1166", name: "Bin Saeed Unstitched 3PC Khaddar Winter Collections", quantity: 1, unitPrice: money(2650) }],
      },
      {
        id: "ORD-2026-6AB8C46323267",
        createdAt: "2026-09-27 07:23:15",
        status: "pending",
        total: money(5600),
        customerName: "(guest checkout)",
        customerPhone: "",
        customerEmail: "",
        trackingNumber: null,
        cancelledReason: null,
        items: [
          { sku: "1209", name: "Nishat linen 3-Piece Unstitched Collection winter", quantity: 1, unitPrice: money(2850) },
          { sku: "1213", name: "Nishat linen 3-Piece Unstitched Collection winter", quantity: 1, unitPrice: money(2850) },
        ],
      },
      {
        id: "ORD-2026-6AABCE5653B17",
        createdAt: "2026-09-17 11:26:14",
        status: "cancelled",
        total: money(900),
        customerName: "Ayesha Khan",
        customerPhone: "0321-1112223",
        customerEmail: "ayesha@example.com",
        trackingNumber: null,
        cancelledReason: "Customer changed mind",
        items: [],
      },
    ],
  };
}

describeAdapterContract();

function describeAdapterContract(): void {
  defineAdapterContract("CustomAdapter (fake JSON API)", () => {
    const state = fixture();
    const adapter = new CustomAdapter({
      baseUrl: "https://kapraa.pk/voice-api/voice-ops-api.php",
      apiKey: "key_kapraa_1",
      currency: "PKR",
      fetch: fakeCustomFetch(state),
      retries: 0,
    });
    return adapter;
  });
}

describe("CustomAdapter specifics", () => {
  it("requires base url and key", () => {
    expect(() => new CustomAdapter({ baseUrl: "", apiKey: "k" })).toThrow("CUSTOM_STORE_URL is required");
    expect(() => new CustomAdapter({ baseUrl: "https://x.example", apiKey: "" })).toThrow(
      "CUSTOM_API_KEY is required",
    );
  });

  it("sends the x-api-key header on every request", async () => {
    const state = fixture();
    const adapter = new CustomAdapter({
      baseUrl: "https://kapraa.example/voice-ops-api.php",
      apiKey: "key_kapraa_1",
      fetch: fakeCustomFetch(state),
      retries: 0,
    });
    await adapter.getProducts();
    expect(state.apiRequests[0]?.auth).toBe("key_kapraa_1");
    expect(state.apiRequests[0]?.path).toBe("products");
  });

  it("rejects wrong credentials as UNAUTHORIZED", async () => {
    const state = fixture();
    state.apiRequests = [];
    const adapter = new CustomAdapter({
      baseUrl: "https://kapraa.example/voice-ops-api.php",
      apiKey: "WRONG-KEY",
      fetch: fakeCustomFetch(state),
      retries: 0,
    });
    await expect(adapter.getProducts()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("maps order shapes exactly like the kapraa responses", () => {
    const order = mapCustomOrder(fixture().orders[0]!);
    expect(order.id).toBe("ORD-2026-6AD0F3FCE9FBD");
    expect(order.status).toBe("pending");
    expect(order.total).toEqual({ amount: 3100, currency: "PKR" });
    expect(order.customerId).toBe("rizwana@example.com");
    expect(order.items[0]).toEqual({
      sku: "1166",
      name: "Bin Saeed Unstitched 3PC Khaddar Winter Collections",
      qty: 1,
      unitPrice: 2650,
    });
  });

  it("falls back on missing contact info and unknown statuses", () => {
    const order = mapCustomOrder(fixture().orders[1]!);
    expect(order.customerId).toBe("(guest checkout)");
    expect(order.customerName).toBe("(guest checkout)");
    // A dispatch-style status the store invented still shows up as "pending" work.
    expect(mapCustomOrder({ ...fixture().orders[1]!, status: "dispatched" }).status).toBe("pending");
  });

  it("adjusts stock via add for increases", async () => {
    const state = fixture();
    const adapter = new CustomAdapter({
      baseUrl: "https://kapraa.example/voice-ops-api.php",
      apiKey: "key_kapraa_1",
      fetch: fakeCustomFetch(state),
      retries: 0,
    });
    const product = await adapter.getProducts({ sku: "PRD-HN74N3M4" });
    const updated = await adapter.adjustStock("PRD-HN74N3M4", 10, "contract test");
    expect(updated.stock).toBe(product[0]!.stock + 10);
    const restockCall = state.apiRequests.reverse().find((call) => call.path.includes("restock"));
    expect(restockCall?.method).toBe("POST");
  });

  it("uses mode set for negative deltas and refuses going below zero", async () => {
    const state = fixture();
    const adapter = new CustomAdapter({
      baseUrl: "https://kapraa.example/voice-ops-api.php",
      apiKey: "key_kapraa_1",
      fetch: fakeCustomFetch(state),
      retries: 0,
    });
    // PRD-A3LTKFSF has stock 0 — subtracting anything must fail.
    await expect(adapter.adjustStock("PRD-A3LTKFSF", -1, "sold")).rejects.toMatchObject({
      code: "VALIDATION",
    });
    // PRD-359A24RT has stock 12 — removing 2 is expressed as an absolute set of 10.
    const after = await adapter.adjustStock("PRD-359A24RT", -2, "sold");
    expect(after.stock).toBe(10);
  });

  it("summarises sales from order pages without Date parsing", async () => {
    const state = fixture();
    const adapter = new CustomAdapter({
      baseUrl: "https://kapraa.example/voice-ops-api.php",
      apiKey: "key_kapraa_1",
      fetch: fakeCustomFetch(state),
      retries: 0,
    });
    const from = new Date("2026-09-01T00:00:00Z");
    const to = new Date("2026-10-31T00:00:00Z");
    const summary = await adapter.getSalesBetween(from, to);
    // fixture has 3 orders that all fall into the range
    expect(summary.orderCount).toBe(3);
    expect(summary.revenue.currency).toBe("PKR");
    const top = await adapter.getTopSellers(from, to, 2);
    expect(top.length).toBeLessThanOrEqual(2);
    // Bin Saeed: 1 unit; Nishat rows use sku 1209/1213 separately — top should exist
    expect(top[0]?.units).toBeGreaterThanOrEqual(1);
  });

  it("derives customers from recent orders and returns null for strangers", async () => {
    const state = fixture();
    const adapter = new CustomAdapter({
      baseUrl: "https://kapraa.example/voice-ops-api.php",
      apiKey: "key_kapraa_1",
      fetch: fakeCustomFetch(state),
      retries: 0,
    });
    const customer = await adapter.getCustomer("Rizwana Ahmad");
    expect(customer?.name).toBe("Rizwana Ahmad");
    expect(customer?.email).toBeUndefined();
    expect(await adapter.getCustomer("Nobody")).toBeNull();
  });
});
