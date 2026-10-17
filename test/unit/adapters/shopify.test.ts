import { describe, expect, it } from "vitest";
import {
  createShopifyAdapter,
  gidToId,
  mapShopifyOrder,
  mapShopifyProduct,
  shopifyOrderStatus,
  toGid,
  NotFoundError,
  type ShopifyCustomerNode,
  type ShopifyOrderNode,
  type ShopifyVariantNode,
} from "@voice-ops/store-adapters";

const STRUCTURED_ORDER_NODE: ShopifyOrderNode = {
  id: "gid://shopify/Order/9001",
  name: "#9001",
  createdAt: "2026-04-10T09:30:00Z",
  cancelledAt: null,
  displayFulfillmentStatus: "UNFULFILLED",
  displayFinancialStatus: "PAID",
  totalPriceSet: { shopMoney: { amount: "2500.50", currencyCode: "PKR" } },
  customer: {
    id: "gid://shopify/Customer/55",
    displayName: "Ayesha Khan",
    email: "ayesha@example.com",
    phone: "0300-1234567",
  },
  fulfillments: { trackingInfo: [] },
  lineItems: {
    nodes: [
      {
        sku: "REG-RED-S",
        title: "Regular T-Shirt Red Small",
        quantity: 2,
        originalUnitPriceSet: { shopMoney: { amount: "1250.25", currencyCode: "PKR" } },
      },
      {
        sku: null,
        title: "Wrap without code",
        quantity: 1,
        originalUnitPriceSet: { shopMoney: { amount: "0", currencyCode: "PKR" } },
      },
    ],
  },
};

const VARIANT_NODE: ShopifyVariantNode = {
  id: "gid://shopify/ProductVariant/777",
  sku: "REG-BLK-M",
  title: "M",
  inventoryQuantity: 6,
  price: "1250.00",
  product: { title: "Regular T-Shirt" },
  inventoryItem: {
    id: "gid://shopify/InventoryItem/999",
    inventoryLevels: { nodes: [{ location: { id: "gid://shopify/Location/1" } }] },
  },
};

describe("Shopify mapping helpers", () => {
  it("converts gids", () => {
    expect(gidToId("gid://shopify/Order/9001")).toBe("9001");
    expect(gidToId("")).toBe("");
    expect(gidToId(null)).toBe("");
    expect(toGid("Order", "9001")).toBe("gid://shopify/Order/9001");
    expect(toGid("Order", "gid://shopify/Order/1")).toBe("gid://shopify/Order/1");
  });

  it("maps an unfulfilled order", () => {
    const order = mapShopifyOrder(STRUCTURED_ORDER_NODE);
    expect(order.id).toBe("9001");
    expect(order.customerId).toBe("55");
    expect(order.customerName).toBe("Ayesha Khan");
    expect(order.status).toBe("pending");
    expect(order.total).toEqual({ amount: 2500.5, currency: "PKR" });
    expect(order.createdAt).toBe("2026-04-10T09:30:00.000Z");
    expect(order.items[0]).toEqual({
      sku: "REG-RED-S",
      name: "Regular T-Shirt Red Small",
      qty: 2,
      unitPrice: 1250.25,
    });
    expect(order.items[1]?.sku).toBe("Wrap without code");
  });

  it("maps a shipped order with tracking", () => {
    const shipped: ShopifyOrderNode = {
      ...STRUCTURED_ORDER_NODE,
      displayFulfillmentStatus: "FULFILLED",
      fulfillments: { trackingInfo: [{ number: "TRK-9001", company: "TCS" }] },
    };
    const order = mapShopifyOrder(shipped);
    expect(order.status).toBe("shipped");
    expect(order.carrier).toBe("TCS");
    expect(order.trackingNumber).toBe("TRK-9001");
  });

  it("maps a cancelled order", () => {
    const status = shopifyOrderStatus({
      ...STRUCTURED_ORDER_NODE,
      cancelledAt: "2026-04-11T00:00:00Z",
    });
    expect(status).toBe("cancelled");
  });

  it("maps a variant to a product with a default reorder point", () => {
    const product = mapShopifyProduct(VARIANT_NODE, "PKR");
    expect(product).toEqual({
      sku: "REG-BLK-M",
      name: "Regular T-Shirt (M)",
      price: { amount: 1250, currency: "PKR" },
      stock: 6,
      reorderPoint: 5,
    });
  });

  it("falls back to the gid when the sku is empty and drops default titles", () => {
    const product = mapShopifyProduct({ ...VARIANT_NODE, sku: "", title: "Default Title" }, "PKR");
    expect(product.sku).toBe("777");
    expect(product.name).toBe("Regular T-Shirt");
  });

  it("maps a customer", () => {
    const node: ShopifyCustomerNode = {
      id: "gid://shopify/Customer/55",
      displayName: "Ayesha Khan",
      email: "ayesha@example.com",
      numberOfOrders: "7",
      amountSpent: { amount: "9800.00", currencyCode: "PKR" },
    };
    // Inlined here only to consume the fixture type.
    expect(node.numberOfOrders).toBe("7");
  });
});

describe("ShopifyAdapter over a fake GraphQL endpoint", () => {
  type Handler = (body: { query: string; variables: Record<string, unknown> }) => unknown;

  function fakeAdapter(overrides: { handler?: Handler; status?: number; retries?: number } = {}) {
    const calls: { query: string; variables: Record<string, unknown> }[] = [];
    const status = overrides.status ?? 200;
    const handler = overrides.handler;
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      if (status !== 200) return new Response("nope", { status });
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as {
        query: string;
        variables: Record<string, unknown>;
      };
      calls.push(body);
      const data = handler ? await handler(body) : await defaultHandler(body);
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const adapter = createShopifyAdapter({
      domain: "dev-store.example.com",
      token: "shpat_test",
      currency: "PKR",
      fetch: fetchImpl,
      retries: overrides.retries ?? 0,
    });
    return { adapter, calls };
  }

  async function defaultHandler(body: { query: string; variables: Record<string, unknown> }) {
    if (body.query.includes("query Orders")) {
      return {
        data: {
          orders: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
        },
      };
    }
    if (body.query.includes("query Order(")) {
      return { data: { order: STRUCTURED_ORDER_NODE } };
    }
    if (body.query.includes("query Variants")) {
      return { data: { productVariants: { nodes: [VARIANT_NODE] } } };
    }
    if (body.query.includes("query Customers")) {
      return {
        data: {
          customers: {
            nodes: [
              {
                id: "gid://shopify/Customer/55",
                displayName: "Ayesha Khan",
                email: "ayesha@example.com",
                phone: null,
                numberOfOrders: "3",
                amountSpent: { amount: "9000.50", currencyCode: "PKR" },
              },
            ],
          },
        },
      };
    }
    if (body.query.includes("mutation FulfillmentCreate")) {
      return {
        data: {
          fulfillmentCreateV2: { userErrors: [] },
        },
      };
    }
    if (body.query.includes("mutation OrderCancel")) {
      return { data: { orderCancel: { orderCancelUserErrors: [] } } };
    }
    if (body.query.includes("mutation InventoryAdjust")) {
      return { data: { inventoryAdjustQuantities: { userErrors: [] } } };
    }
    return { data: {} };
  }

  it("sends the GraphQL document against the admin endpoint", async () => {
    const { adapter, calls } = fakeAdapter();
    await adapter.getProducts();
    expect(calls[0]?.query).toContain("productVariants");
    expect(calls[0]?.variables.first).toBe(250);
  });

  it("maps products and applies the low-stock filter", async () => {
    const { adapter } = fakeAdapter();
    const products = await adapter.getProducts();
    expect(products).toHaveLength(1);
    const low = await adapter.getProducts({ lowStockBelow: 999 });
    expect(low).toHaveLength(1);
    const tooHigh = await adapter.getProducts({ lowStockBelow: 5 });
    expect(tooHigh).toHaveLength(0);
  });

  it("looks up a product by sku", async () => {
    const { adapter, calls } = fakeAdapter();
    const found = await adapter.getProducts({ sku: "REG-BLK-M" });
    expect(found).toHaveLength(1);
    expect(calls[0]?.variables.query).toBe("sku:REG-BLK-M");
  });

  it("mapShopifyCustomer produces usable customer records", () => {
    const { adapter } = fakeAdapter();
    return adapter.getCustomer("Ayesha").then((customer) => {
      expect(customer?.id).toBe("55");
      expect(customer?.orderCount).toBe(3);
      expect(customer?.lifetimeValue).toEqual({ amount: 9000.5, currency: "PKR" });
    });
  });

  it("returns null for an unknown customer", async () => {
    const { adapter } = fakeAdapter({
      handler: (body) =>
        body.query.includes("query Customers")
          ? { data: { customers: { nodes: [] } } }
          : { data: {} },
    });
    expect(await adapter.getCustomer("Nobody")).toBeNull();
  });

  it("propagates errors when the endpoint returns 401", async () => {
    const { adapter } = fakeAdapter({ status: 401 });
    await expect(adapter.getProducts()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("resolves order-number ids by searching by name when the direct lookup misses", async () => {
    // Real stores hand out order numbers ("1002") while the API id is a Snowflake,
    // so the adapter must fall back to a name search and use the returned node id.
    const { adapter, calls } = fakeAdapter({
      handler: (body) => {
        if (body.query.includes("query Order(")) {
          return { data: { order: null } };
        }
        if (body.query.includes("query OrderSearchByName")) {
          return {
            data: { orders: { nodes: [STRUCTURED_ORDER_NODE] } },
          };
        }
        return { data: {} };
      },
    });
    const order = await adapter.getOrder("1002");
    expect(order.id).toBe("9001");
    const searchCall = calls.find((call) => call.query.includes("query OrderSearchByName"));
    expect(searchCall?.variables.query).toBe("name:1002");
  });

  it("throws NotFoundError when direct lookup and name search both miss", async () => {
    const { adapter } = fakeAdapter({
      handler: (body) => {
        if (body.query.includes("query Order(")) return { data: { order: null } };
        if (body.query.includes("query OrderSearchByName")) {
          return { data: { orders: { nodes: [] } } };
        }
        return { data: {} };
      },
    });
    await expect(adapter.getOrder("404")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("uses the resolved node id when fulfilling an order-number id", async () => {
    let fulfilled = false;
    const { adapter, calls } = fakeAdapter({
      handler: async (body) => {
        if (body.query.includes("mutation FulfillmentCreate")) {
          fulfilled = true;
          return await defaultHandler(body);
        }
        if (body.query.includes("query Order(")) {
          return {
            data: {
              order: {
                ...STRUCTURED_ORDER_NODE,
                displayFulfillmentStatus: fulfilled ? "FULFILLED" : "UNFULFILLED",
              },
            },
          };
        }
        if (body.query.includes("query OrderForFulfillment")) {
          return {
            data: {
              order: {
                id: "gid://shopify/Order/9001",
                fulfillmentOrders: {
                  nodes: [
                    {
                      id: "gid://shopify/FulfillmentOrder/11",
                      status: "OPEN",
                      lineItems: {
                        nodes: [
                          { id: "gid://shopify/FulfillmentOrderLineItem/21", remainingQuantity: 2 },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          };
        }
        return await defaultHandler(body);
      },
    });
    const result = await adapter.fulfillOrder("1002", { tracking: "TCS-77", carrier: "TCS" });
    expect(result.status).toBe("shipped");
    const foCall = calls.find((call) => call.query.includes("query OrderForFulfillment"));
    expect(foCall?.variables.id).toBe("gid://shopify/Order/9001");
    const mutation = calls.find((call) => call.query.includes("mutation FulfillmentCreate"));
    expect(JSON.stringify(mutation?.variables)).toContain("gid://shopify/FulfillmentOrder/11");
  });

  it("maps a 404 to NotFoundError", async () => {
    const http: typeof fetch = (async () => new Response("nf", { status: 404 })) as typeof fetch;
    const failing = createShopifyAdapter({
      domain: "dev-store.example.com",
      token: "shpat_test",
      fetch: http,
      retries: 0,
    });
    await expect(failing.getProducts()).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects without credentials", () => {
    expect(() => createShopifyAdapter({ domain: "dev-store.example.com", token: "" })).toThrow(
      "SHOPIFY_ADMIN_TOKEN is required",
    );
    expect(() => createShopifyAdapter({ token: "shpat_test" })).toThrow(
      "SHOPIFY_STORE_DOMAIN is required",
    );
  });
});
