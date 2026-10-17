import { beforeEach, describe, expect, it } from "vitest";
import { defineAdapterContract } from "../../../src/adapters/contract.js";
import { WooCommerceAdapter } from "../../../src/adapters/woocommerce.js";
import type {
  WooCustomerNode,
  WooOrderNode,
  WooProductNode,
} from "../../../src/adapters/woocommerce.js";

/**
 * An in-memory WooCommerce REST endpoint. It implements just enough of the WordPress REST API (the
 * exact routes and payloads the adapter uses) to run the shared adapter contract for real, with no
 * live site.
 */
function fakeWooFetch(state: {
  products: WooProductNode[];
  orders: WooOrderNode[];
  customers: WooCustomerNode[];
}) {
  return async function respond(
    input: string | URL | globalThis.Request,
    init?: RequestInit,
  ): Promise<Response> {
    const url = new URL(typeof input === "string" ? input : String(input));
    const path = url.pathname.replace("/wp-json/wc/v3", "");
    const method = (init?.method ?? "GET").toUpperCase();
    const body =
      typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    const reply = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json" },
      });

    const perPage = Number(url.searchParams.get("per_page") ?? 100) || 100;
    const page = Number(url.searchParams.get("page") ?? 1) || 1;

    if (path === "/orders" && method === "GET") {
      const statuses = url.searchParams.get("status")?.split(",") ?? undefined;
      const after = url.searchParams.get("after");
      let orders = state.orders;
      if (statuses) orders = orders.filter((order) => statuses.includes(order.status));
      if (after) orders = orders.filter((order) => new Date(order.date_created) >= new Date(after));
      orders = [...orders].sort(
        (a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime(),
      );
      return reply(orders.slice((page - 1) * perPage, page * perPage));
    }

    const orderMatch = /^\/orders\/(.+)$/.exec(path);
    if (orderMatch) {
      const order = state.orders.find((entry) => String(entry.id) === orderMatch[1]);
      if (!order) return reply({ message: "Order not found" }, 404);
      if (method === "PUT") {
        Object.assign(order, body);
        return reply(order);
      }
      return reply(order);
    }

    if (path === "/products" && method === "GET") {
      const sku = url.searchParams.get("sku");
      const products = sku
        ? state.products.filter((product) => product.sku === sku)
        : state.products;
      return reply(products.slice(0, perPage));
    }

    const productMatch = /^\/products\/(.+)$/.exec(path);
    if (productMatch && method === "PUT") {
      const product = state.products.find((entry) => String(entry.id) === productMatch[1]);
      if (!product) return reply({ message: "Product not found" }, 404);
      Object.assign(product, body);
      return reply(product);
    }

    if (path === "/customers" && method === "GET") {
      const search = (url.searchParams.get("search") ?? "").toLowerCase();
      const matches = state.customers.filter((customer) => {
        const name = `${customer.first_name} ${customer.last_name}`.toLowerCase();
        return (
          (name.includes(search) || customer.email?.toLowerCase().includes(search)) &&
          search.length > 0
        );
      });
      return reply(matches.slice(0, perPage));
    }

    return reply({ message: `Unexpected ${method} ${path}` }, 404);
  };
}

function wooFixture() {
  const day = (offset: number) =>
    new Date(Date.now() - offset * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z");

  const products: WooProductNode[] = [
    {
      id: 11,
      name: "Regular T-Shirt Red S",
      sku: "REG-RED-S",
      price: "1250.00",
      stock_quantity: 44,
      low_stock_amount: 10,
    },
    {
      id: 12,
      name: "Regular T-Shirt Black M",
      sku: "REG-BLK-M",
      price: "1250.00",
      stock_quantity: 6,
      low_stock_amount: 10,
    },
    {
      id: 13,
      name: "Oversized Hoodie Grey",
      sku: "OVR-GRY-L",
      price: "3200.00",
      stock_quantity: 18,
      low_stock_amount: 8,
    },
    {
      id: 14,
      name: "Cargo Pants Olive",
      sku: "CAR-OLV-32",
      price: "2600.00",
      stock_quantity: 2,
      low_stock_amount: 5,
    },
    {
      id: 15,
      name: "Baseball Cap Black",
      sku: "CAP-BLK",
      price: "780.00",
      stock_quantity: 75,
      low_stock_amount: 15,
    },
  ];

  const orders: WooOrderNode[] = [
    {
      id: 1001,
      status: "processing",
      currency: "PKR",
      total: "2500.00",
      date_created: day(1),
      customer_id: 501,
      billing: { first_name: "Ayesha", last_name: "Khan", email: "ayesha@example.com" },
      line_items: [
        { name: "Regular T-Shirt Red S", sku: "REG-RED-S", quantity: 2, price: "1250.00" },
      ],
      meta_data: [],
    },
    {
      id: 1002,
      status: "completed",
      currency: "PKR",
      total: "3200.00",
      date_created: day(3),
      customer_id: 502,
      billing: { first_name: "Bilal", last_name: "Hassan", email: "bilal@example.com" },
      line_items: [
        { name: "Oversized Hoodie Grey", sku: "OVR-GRY-L", quantity: 1, price: "3200.00" },
      ],
      meta_data: [
        { key: "_tracking_provider", value: "TCS" },
        { key: "_tracking_number", value: "TCS-000452" },
      ],
    },
    {
      id: 1003,
      status: "on-hold",
      currency: "PKR",
      total: "3380.00",
      date_created: day(11),
      customer_id: 503,
      billing: { first_name: "Hira", last_name: "Iqbal", email: "hira@example.com" },
      line_items: [
        { name: "Cargo Pants Olive", sku: "CAR-OLV-32", quantity: 1, price: "2600.00" },
        { name: "Baseball Cap Black", sku: "CAP-BLK", quantity: 1, price: "780.00" },
      ],
      meta_data: [],
    },
  ];

  const customers: WooCustomerNode[] = [
    {
      id: 501,
      first_name: "Ayesha",
      last_name: "Khan",
      email: "ayesha@example.com",
      orders_count: 3,
      total_spent: "9000.50",
    },
    {
      id: 502,
      first_name: "Bilal",
      last_name: "Hassan",
      email: "bilal@example.com",
      orders_count: 1,
      total_spent: "3200.00",
    },
    {
      id: 503,
      first_name: "Hira",
      last_name: "Iqbal",
      email: "hira@example.com",
      orders_count: 2,
      total_spent: "4100.00",
    },
  ];

  return { products, orders, customers };
}

defineAdapterContract("WooCommerceAdapter (fake REST)", () => {
  const state = wooFixture();
  const adapter = new WooCommerceAdapter({
    baseUrl: "https://store.example.com",
    key: "ck_test",
    secret: "cs_test",
    currency: "PKR",
    fetch: fakeWooFetch(state),
    retries: 0,
  });
  return adapter;
});

describe("WooCommerceAdapter specifics", () => {
  beforeEach(() => {});

  it("requires base url and credentials", () => {
    expect(
      () => new WooCommerceAdapter({ fetch: () => Promise.resolve(new Response("{}")) }),
    ).toThrow("WOO_BASE_URL is required");
    expect(
      () =>
        new WooCommerceAdapter({
          baseUrl: "https://store.example.com",
          secret: "cs_test",
          fetch: () => Promise.resolve(new Response("{}")),
        }),
    ).toThrow("WOO_KEY and WOO_SECRET are required");
  });

  it("maps a Woo order including tracking metadata", async () => {
    const adapter = new WooCommerceAdapter({
      baseUrl: "https://store.example.com",
      key: "ck_test",
      secret: "cs_test",
      currency: "PKR",
      fetch: fakeWooFetch(wooFixture()),
      retries: 0,
    });
    const order = await adapter.getOrder("1002");
    expect(order.status).toBe("shipped");
    expect(order.carrier).toBe("TCS");
    expect(order.trackingNumber).toBe("TCS-000452");
    expect(order.total).toEqual({ amount: 3200, currency: "PKR" });
    expect(order.items).toEqual([
      { sku: "OVR-GRY-L", name: "Oversized Hoodie Grey", qty: 1, unitPrice: 3200 },
    ]);
  });

  it("sends the cancel reason in order meta", async () => {
    let seenBody: unknown;
    const inner = fakeWooFetch(wooFixture());
    const spyFetch: typeof fetch = (input, init) => {
      if (String(input).includes("/orders/1003") && typeof init?.body === "string") {
        seenBody = JSON.parse(init.body) as unknown;
      }
      return inner(input, init);
    };
    const adapter = new WooCommerceAdapter({
      baseUrl: "https://store.example.com",
      key: "ck_test",
      secret: "cs_test",
      fetch: spyFetch,
      retries: 0,
    });
    await adapter.cancelOrder("1003", "customer changed mind");
    expect(seenBody).toMatchObject({
      status: "cancelled",
      meta_data: [{ key: "_cancel_reason", value: "customer changed mind" }],
    });
  });
});
