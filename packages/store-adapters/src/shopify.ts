import { NotFoundError, UpstreamError, ValidationError } from "./errors.js";
import { assertGraphQl, requestJson, type FetchLike, type GraphQlResponse } from "./http.js";
import type {
  Customer,
  FulfillOrderInput,
  Money,
  Order,
  OrderFilter,
  OrderStatus,
  Page,
  Product,
  ProductFilter,
  SalesSummary,
  StoreAdapter,
  TopSeller,
} from "./types.js";

const envString = (name: string): string => process.env[name] ?? "";

/**
 * Shopify adapter (Admin GraphQL API). All Shopify-specific shapes are mapped onto the shared
 * StoreAdapter contract in the exported `mapShopify*` helpers so mapping is unit-testable without a
 * live store.
 *
 * Reorder points are not a first-class Shopify concept: we fall back to
 * {@link DEFAULT_REORDER_POINT} (a future revision can lift them from a `custom.reorder_point`
 * metafield).
 */

export const DEFAULT_REORDER_POINT = 5;

const ORDER_FIELDS = `
  id
  name
  createdAt
  cancelledAt
  displayFulfillmentStatus
  displayFinancialStatus
  totalPriceSet { shopMoney { amount currencyCode } }
  updatedAt
  tags
  note
  customer { id displayName email phone }
  fulfillments(first: 1) { trackingInfo { number company } }
  lineItems(first: 100) {
    nodes {
      sku
      title
      quantity
      originalUnitPriceSet { shopMoney { amount currencyCode } }
    }
  }
`;

const ORDERS_QUERY = `
  query Orders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true, query: $query) {
      pageInfo { hasNextPage endCursor }
      nodes { ${ORDER_FIELDS} }
    }
  }
`;

const ORDER_QUERY = `
  query Order($id: ID!) {
    order(id: $id) { ${ORDER_FIELDS} }
  }
`;

const ORDER_SEARCH_BY_NAME_QUERY = `
  query OrderSearchByName($first: Int!, $query: String!) {
    orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
      nodes { ${ORDER_FIELDS} }
    }
  }
`;

const ORDER_FOR_FULFILLMENT_QUERY = `
  query OrderForFulfillment($id: ID!) {
    order(id: $id) {
      id
      name
      cancelledAt
      displayFulfillmentStatus
      fulfillmentOrders(first: 10) {
        nodes {
          id
          status
          lineItems(first: 100) { nodes { id remainingQuantity } }
        }
      }
    }
  }
`;

const FULFILLMENT_CREATE_MUTATION = `
  mutation FulfillmentCreate($fulfillment: FulfillmentV2Input!) {
    fulfillmentCreateV2(fulfillment: $fulfillment) {
      fulfillment { id status trackingInfo { number company } }
      userErrors { field message }
    }
  }
`;

const ORDER_CANCEL_MUTATION = `
  mutation OrderCancel($orderId: ID!, $reason: OrderCancelReason!, $refund: Boolean!, $restock: Boolean!, $notifyCustomer: Boolean!, $staffNote: String) {
    orderCancel(orderId: $orderId, reason: $reason, refund: $refund, restock: $restock, notifyCustomer: $notifyCustomer, staffNote: $staffNote) {
      job { id }
      orderCancelUserErrors { field message }
    }
  }
`;

const VARIANTS_QUERY = `
  query Variants($first: Int!, $query: String) {
    productVariants(first: $first, query: $query) {
      nodes {
        id
        sku
        title
        inventoryQuantity
        price
        product { title }
        inventoryItem {
          id
          inventoryLevels(first: 1) { nodes { location { id } } }
        }
      }
    }
  }
`;

const INVENTORY_ADJUST_MUTATION = `
  mutation InventoryAdjust($input: InventoryAdjustQuantitiesInput!) {
    inventoryAdjustQuantities(input: $input) {
      userErrors { field message }
    }
  }
`;

const CUSTOMERS_QUERY = `
  query Customers($first: Int!, $query: String) {
    customers(first: $first, query: $query) {
      nodes {
        id
        displayName
        email
        phone
        numberOfOrders
        amountSpent { amount currencyCode }
      }
    }
  }
`;

export interface ShopifyOrderNode {
  id: string;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  displayFulfillmentStatus: string;
  displayFinancialStatus: string;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  customer: {
    id: string;
    displayName: string;
    email?: string | null;
    phone?: string | null;
  } | null;
  /** Real stores return [] for unfulfilled orders; trackingInfo is absent without tracking. */
  fulfillments?: { trackingInfo?: { number: string | null; company: string | null }[] } | null;
  lineItems: {
    nodes: {
      sku: string | null;
      title: string;
      quantity: number;
      originalUnitPriceSet: { shopMoney: { amount: string; currencyCode: string } };
    }[];
  };
}

export interface ShopifyVariantNode {
  id: string;
  sku: string | null;
  title: string | null;
  inventoryQuantity: number | null;
  price: string;
  product: { title: string };
  inventoryItem: {
    id: string;
    inventoryLevels: { nodes: { location: { id: string } }[] };
  } | null;
}

export interface ShopifyCustomerNode {
  id: string;
  displayName: string;
  email?: string | null;
  phone?: string | null;
  numberOfOrders: string | null;
  amountSpent: { amount: string; currencyCode: string } | null;
}

export interface ShopifyAdapterOptions {
  domain?: string;
  token?: string;
  apiVersion?: string;
  currency?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  retries?: number;
}

/** "gid://shopify/Order/123" -> "123" (returns the input unchanged if it is not a gid). */
export function gidToId(gid: string | null | undefined): string {
  if (!gid) return "";
  const parts = gid.split("/");
  return parts[parts.length - 1] ?? gid;
}

/** "123" -> "gid://shopify/Order/123" (leaves an existing gid untouched). */
export function toGid(type: string, id: string): string {
  return id.startsWith("gid://") ? id : `gid://shopify/${type}/${id}`;
}

function money(amount: number | string, currency: string): Money {
  const value = typeof amount === "number" ? amount : Number.parseFloat(amount);
  return { amount: Number.isFinite(value) ? value : 0, currency };
}

export function shopifyOrderStatus(
  node: Pick<ShopifyOrderNode, "cancelledAt" | "displayFulfillmentStatus">,
): OrderStatus {
  if (node.cancelledAt) return "cancelled";
  if (node.displayFulfillmentStatus === "FULFILLED") return "shipped";
  return "pending";
}

export function mapShopifyOrder(node: ShopifyOrderNode): Order {
  const currency = node.totalPriceSet.shopMoney.currencyCode;
  // Real stores return an empty fulfillments array (and null trackingInfo) for unfulfilled orders.
  const tracking = node.fulfillments?.trackingInfo?.[0];
  return {
    id: gidToId(node.id),
    customerId: gidToId(node.customer?.id ?? ""),
    customerName: node.customer?.displayName ?? "Guest",
    status: shopifyOrderStatus(node),
    total: money(node.totalPriceSet.shopMoney.amount, currency),
    createdAt: new Date(node.createdAt).toISOString(),
    carrier: tracking?.company ?? undefined,
    trackingNumber: tracking?.number ?? undefined,
    items: node.lineItems.nodes.map((item) => ({
      sku: item.sku ?? item.title,
      name: item.title,
      qty: item.quantity,
      unitPrice: money(item.originalUnitPriceSet.shopMoney.amount, currency).amount,
    })),
  };
}

export function mapShopifyProduct(node: ShopifyVariantNode, currency: string): Product {
  const variantTitle = node.title && node.title !== "Default Title" ? node.title : "";
  const name = variantTitle ? `${node.product.title} (${variantTitle})` : node.product.title;
  return {
    sku: node.sku && node.sku.length > 0 ? node.sku : gidToId(node.id),
    name,
    price: money(node.price, currency),
    stock: node.inventoryQuantity ?? 0,
    reorderPoint: DEFAULT_REORDER_POINT,
  };
}

export function mapShopifyCustomer(node: ShopifyCustomerNode, currency: string): Customer {
  const spent = node.amountSpent;
  return {
    id: gidToId(node.id),
    name: node.displayName,
    email: node.email ?? undefined,
    phone: node.phone ?? undefined,
    orderCount: node.numberOfOrders ? Number.parseInt(node.numberOfOrders, 10) : 0,
    lifetimeValue: money(spent?.amount ?? 0, spent?.currencyCode ?? currency),
  };
}

/** Server-side Shopify query fragment for a status filter. */
function statusQuery(status?: OrderStatus): string | undefined {
  switch (status) {
    case "pending":
      return "fulfillment_status:unfulfilled status:open";
    case "shipped":
      return "fulfillment_status:fulfilled";
    case "delivered":
      return "fulfillment_status:fulfilled";
    case "cancelled":
      return "status:cancelled";
    default:
      return undefined;
  }
}

export class ShopifyAdapter implements StoreAdapter {
  readonly provider = "shopify";
  readonly currency: string;

  private readonly domain: string;
  private readonly token: string;
  private readonly apiVersion: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(options: ShopifyAdapterOptions = {}) {
    this.domain = options.domain ?? envString("SHOPIFY_STORE_DOMAIN");
    this.token = options.token ?? envString("SHOPIFY_ADMIN_TOKEN");
    this.apiVersion = options.apiVersion ?? (envString("SHOPIFY_API_VERSION") || "2026-01");
    this.currency = (options.currency ?? envString("SHOPIFY_CURRENCY")) || "USD";
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.retries = options.retries ?? 2;
    if (!this.domain) throw new Error("SHOPIFY_STORE_DOMAIN is required for the Shopify provider");
    if (!this.token) throw new Error("SHOPIFY_ADMIN_TOKEN is required for the Shopify provider");
  }

  private async graphql<T>(document: string, variables: Record<string, unknown>): Promise<T> {
    const url = `https://${this.domain}/admin/api/${this.apiVersion}/graphql.json`;
    const response = await requestJson<GraphQlResponse<T>>(this.fetchImpl, url, {
      provider: "shopify",
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-shopify-access-token": this.token,
      },
      body: JSON.stringify({ query: document, variables }),
      timeoutMs: this.timeoutMs,
      retries: this.retries,
    });
    return assertGraphQl(response, "shopify");
  }

  private async fetchOrderNode(id: string): Promise<ShopifyOrderNode> {
    const data = await this.graphql<{ order: ShopifyOrderNode | null }>(ORDER_QUERY, {
      id: toGid("Order", id),
    });
    if (data.order) return data.order;
    // Real stores name orders "#1002" while the API id is a largeSnowflake such as
    // "18925912522825". Search by name and return the node carrying the real id.
    if (/^\d+$/.test(id)) {
      const search = await this.graphql<{ orders: { nodes: ShopifyOrderNode[] } }>(
        ORDER_SEARCH_BY_NAME_QUERY,
        { first: 1, query: `name:${id}` },
      );
      const node = search.orders.nodes[0];
      if (node) return node;
    }
    throw new NotFoundError(`Order ${id} not found`);
  }

  async getOrders(filter: OrderFilter = {}): Promise<Page<Order>> {
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 250);
    const conditions: string[] = [];
    const status = statusQuery(filter.status);
    if (status) conditions.push(status);
    if (filter.since) conditions.push(`created_at:>='${filter.since.toISOString().slice(0, 10)}'`);
    const query = conditions.length > 0 ? conditions.join(" ") : undefined;

    const data = await this.graphql<{
      orders: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: ShopifyOrderNode[] };
    }>(ORDERS_QUERY, { first: limit, after: filter.cursor ?? null, query: query ?? null });

    const items = data.orders.nodes.map(mapShopifyOrder);
    return {
      items,
      total: items.length,
      nextCursor: data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : undefined,
    };
  }

  async getOrder(id: string): Promise<Order> {
    return mapShopifyOrder(await this.fetchOrderNode(id));
  }

  async fulfillOrder(id: string, input: FulfillOrderInput): Promise<Order> {
    const node = await this.fetchOrderNode(id);
    if (node.cancelledAt) throw new ValidationError("Cannot fulfil a cancelled order");
    // Idempotent: an already-fulfilled order is returned unchanged.
    if (node.displayFulfillmentStatus === "FULFILLED") return mapShopifyOrder(node);

    const data = await this.graphql<{
      order: {
        id: string;
        fulfillmentOrders: {
          nodes: {
            id: string;
            status: string;
            lineItems: { nodes: { id: string; remainingQuantity: number }[] };
          }[];
        };
      } | null;
    }>(ORDER_FOR_FULFILLMENT_QUERY, { id: node.id });

    const order = data.order;
    if (!order) throw new NotFoundError(`Order ${id} not found`);

    const groups = order.fulfillmentOrders.nodes
      .filter((fo) => fo.status !== "CLOSED" && fo.status !== "CANCELLED")
      .map((fo) => ({
        fulfillmentOrderId: fo.id,
        fulfillmentOrderLineItems: fo.lineItems.nodes
          .filter((li) => li.remainingQuantity > 0)
          .map((li) => ({ id: li.id, quantity: li.remainingQuantity })),
      }))
      .filter((group) => group.fulfillmentOrderLineItems.length > 0);

    if (groups.length === 0) return this.getOrder(id);

    const result = await this.graphql<{
      fulfillmentCreateV2: { userErrors: { field: string[]; message: string }[] };
    }>(FULFILLMENT_CREATE_MUTATION, {
      fulfillment: {
        lineItemsByFulfillmentOrder: groups,
        trackingInfo: { number: input.tracking ?? null, company: input.carrier },
        notifyCustomer: false,
      },
    });
    const errors = result.fulfillmentCreateV2.userErrors;
    if (errors.length > 0) {
      throw new UpstreamError(
        `Shopify fulfilment failed: ${errors.map((e) => e.message).join("; ")}`,
      );
    }
    return this.getOrder(id);
  }

  async cancelOrder(id: string, reason: string): Promise<Order> {
    if (!reason || reason.trim().length === 0) {
      throw new ValidationError("A cancellation reason is required");
    }
    const node = await this.fetchOrderNode(id);
    if (node.cancelledAt) {
      return { ...mapShopifyOrder(node), cancelledReason: reason };
    }
    if (node.displayFulfillmentStatus === "FULFILLED") {
      throw new ValidationError("Cannot cancel an order that has already shipped");
    }

    const result = await this.graphql<{
      orderCancel: { orderCancelUserErrors: { field: string[]; message: string }[] };
    }>(ORDER_CANCEL_MUTATION, {
      orderId: node.id,
      reason: "OTHER",
      refund: false,
      restock: true,
      notifyCustomer: false,
      staffNote: reason,
    });
    const errors = result.orderCancel.orderCancelUserErrors;
    if (errors.length > 0) {
      throw new UpstreamError(
        `Shopify cancellation failed: ${errors.map((e) => e.message).join("; ")}`,
      );
    }
    return { ...(await this.getOrder(id)), cancelledReason: reason };
  }

  async getProducts(filter: ProductFilter = {}): Promise<Product[]> {
    const query = filter.sku ? `sku:${filter.sku}` : undefined;
    const data = await this.graphql<{ productVariants: { nodes: ShopifyVariantNode[] } }>(
      VARIANTS_QUERY,
      { first: 250, query: query ?? null },
    );
    let products = data.productVariants.nodes.map((node) => mapShopifyProduct(node, this.currency));
    if (filter.sku) products = products.filter((product) => product.sku === filter.sku);
    if (filter.lowStockBelow !== undefined) {
      products = products.filter((product) => product.stock <= filter.lowStockBelow!);
    }
    return products;
  }

  async adjustStock(sku: string, delta: number, reason: string): Promise<Product> {
    if (!Number.isFinite(delta) || delta === 0) {
      throw new ValidationError("Stock adjustment must be a non-zero number");
    }
    if (!reason || reason.trim().length === 0) {
      throw new ValidationError("A stock adjustment reason is required");
    }
    const data = await this.graphql<{ productVariants: { nodes: ShopifyVariantNode[] } }>(
      VARIANTS_QUERY,
      { first: 1, query: `sku:${sku}` },
    );
    const node = data.productVariants.nodes.find((variant) => variant.sku === sku);
    if (!node) throw new NotFoundError(`No product with SKU ${sku}`);

    const item = node.inventoryItem;
    const locationId = item?.inventoryLevels.nodes[0]?.location.id;
    if (!item || !locationId) throw new UpstreamError(`Product ${sku} has no inventory location`);

    const newStock = (node.inventoryQuantity ?? 0) + delta;
    if (newStock < 0) throw new ValidationError("Adjustment would make stock negative");

    const result = await this.graphql<{
      inventoryAdjustQuantities: { userErrors: { field: string[]; message: string }[] };
    }>(INVENTORY_ADJUST_MUTATION, {
      input: {
        name: "available",
        reason: "correction",
        changes: [{ delta, inventoryItemId: item.id, locationId }],
      },
    });
    const errors = result.inventoryAdjustQuantities.userErrors;
    if (errors.length > 0) {
      throw new UpstreamError(
        `Shopify stock adjustment failed: ${errors.map((e) => e.message).join("; ")}`,
      );
    }
    return mapShopifyProduct({ ...node, inventoryQuantity: newStock }, this.currency);
  }

  private async fetchOrdersInRange(from: Date, to: Date): Promise<Order[]> {
    const orders: Order[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 3; page += 1) {
      const result: Page<Order> = await this.getOrders({ since: from, limit: 250, cursor });
      orders.push(...result.items.filter((order) => new Date(order.createdAt) <= to));
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
    return orders;
  }

  async getSalesBetween(from: Date, to: Date): Promise<SalesSummary> {
    const orders = await this.fetchOrdersInRange(from, to);
    const revenue = orders.reduce((sum, order) => sum + order.total.amount, 0);
    const orderCount = orders.length;
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      orderCount,
      revenue: { amount: revenue, currency: this.currency },
      averageOrderValue: {
        amount: orderCount === 0 ? 0 : revenue / orderCount,
        currency: this.currency,
      },
    };
  }

  async getTopSellers(from: Date, to: Date, limit: number): Promise<TopSeller[]> {
    const orders = await this.fetchOrdersInRange(from, to);
    const bySku = new Map<string, TopSeller>();
    for (const order of orders) {
      for (const item of order.items) {
        const current = bySku.get(item.sku) ?? {
          sku: item.sku,
          name: item.name,
          units: 0,
          revenue: { amount: 0, currency: this.currency },
        };
        current.units += item.qty;
        current.revenue = {
          amount: current.revenue.amount + item.qty * item.unitPrice,
          currency: this.currency,
        };
        bySku.set(item.sku, current);
      }
    }
    return [...bySku.values()].sort((a, b) => b.units - a.units).slice(0, Math.max(limit, 0));
  }

  async getCustomer(query: string): Promise<Customer | null> {
    if (!query || query.trim().length === 0) return null;
    const data = await this.graphql<{ customers: { nodes: ShopifyCustomerNode[] } }>(
      CUSTOMERS_QUERY,
      {
        first: 5,
        query,
      },
    );
    const node = data.customers.nodes[0];
    return node ? mapShopifyCustomer(node, this.currency) : null;
  }
}

export function createShopifyAdapter(options: ShopifyAdapterOptions = {}): ShopifyAdapter {
  return new ShopifyAdapter(options);
}
