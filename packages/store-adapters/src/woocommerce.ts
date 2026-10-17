import { NotFoundError, ValidationError } from "./errors.js";
import { requestJson, type FetchLike } from "./http.js";
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
import { DEFAULT_REORDER_POINT } from "./shopify.js";

const envString = (name: string): string => process.env[name] ?? "";

/**
 * WooCommerce adapter (REST API v3). All WooCommerce-specific shapes are mapped onto the shared
 * StoreAdapter contract in the exported `mapWoo*` helpers so mapping is unit-testable without a
 * live site.
 *
 * WooCommerce has no first-class fulfilment or reorder point. We treat a `completed` order as
 * shipped, persist tracking and cancellation reasons in order meta, and read the product-level
 * `low_stock_amount` as the reorder point (falling back to {@link DEFAULT_REORDER_POINT}).
 */

export const WOO_STATUSES: Record<OrderStatus, string[]> = {
  pending: ["pending", "processing", "on-hold"],
  shipped: ["completed"],
  delivered: ["completed"],
  cancelled: ["cancelled", "refunded", "failed"],
};

const META_TRACKING_NUMBER = "_tracking_number";
const META_TRACKING_CARRIER = "_tracking_provider";
const META_CANCEL_REASON = "_cancel_reason";

export interface WooOrderNode {
  id: number;
  number?: string;
  status: string;
  currency: string;
  total: string;
  date_created: string;
  date_created_gmt?: string;
  customer_id: number;
  billing?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  };
  line_items?: { name: string; sku?: string; quantity: number; price: string }[];
  meta_data?: { key: string; value: unknown }[];
}

export interface WooProductNode {
  id: number;
  name: string;
  sku: string;
  price: string;
  stock_quantity: number | null;
  low_stock_amount?: number | null;
  meta_data?: { key: string; value: unknown }[];
}

export interface WooCustomerNode {
  id: number;
  first_name: string;
  last_name: string;
  email?: string;
  orders_count?: number;
  total_spent?: string;
}

export interface WooCommerceAdapterOptions {
  baseUrl?: string;
  key?: string;
  secret?: string;
  currency?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  retries?: number;
}

function metaValue(
  meta: { key: string; value: unknown }[] | undefined,
  key: string,
): string | undefined {
  const entry = meta?.find((item) => item.key === key);
  if (!entry || entry.value === null || entry.value === undefined) return undefined;
  return String(entry.value);
}

export function wooOrderStatus(status: string): OrderStatus {
  if (["cancelled", "refunded", "failed", "trash"].includes(status)) return "cancelled";
  if (status === "completed") return "shipped";
  return "pending";
}

export function mapWooOrder(node: WooOrderNode): Order {
  const billing = node.billing ?? {};
  const name = [billing.first_name, billing.last_name].filter(Boolean).join(" ").trim();
  const currency = node.currency || "USD";
  return {
    id: String(node.id),
    customerId: node.customer_id ? String(node.customer_id) : `guest:${billing.email ?? node.id}`,
    customerName: name || billing.email || "Guest",
    status: wooOrderStatus(node.status),
    total: { amount: Number.parseFloat(node.total) || 0, currency },
    createdAt: new Date(node.date_created_gmt ?? node.date_created).toISOString(),
    carrier: metaValue(node.meta_data, META_TRACKING_CARRIER),
    trackingNumber: metaValue(node.meta_data, META_TRACKING_NUMBER),
    cancelledReason: metaValue(node.meta_data, META_CANCEL_REASON),
    items: (node.line_items ?? []).map((item) => ({
      sku: item.sku && item.sku.length > 0 ? item.sku : item.name,
      name: item.name,
      qty: item.quantity,
      unitPrice: Number.parseFloat(item.price) || 0,
    })),
  };
}

export function mapWooProduct(node: WooProductNode, currency: string): Product {
  return {
    sku: node.sku && node.sku.length > 0 ? node.sku : String(node.id),
    name: node.name,
    price: { amount: Number.parseFloat(node.price) || 0, currency },
    stock: node.stock_quantity ?? 0,
    reorderPoint: node.low_stock_amount ?? DEFAULT_REORDER_POINT,
  };
}

export function mapWooCustomer(node: WooCustomerNode, currency: string): Customer {
  const name = [node.first_name, node.last_name].filter(Boolean).join(" ").trim();
  return {
    id: String(node.id),
    name: name || node.email || `Customer ${node.id}`,
    email: node.email,
    orderCount: node.orders_count ?? 0,
    lifetimeValue: { amount: Number.parseFloat(node.total_spent ?? "0") || 0, currency },
  };
}

export class WooCommerceAdapter implements StoreAdapter {
  readonly provider = "woocommerce";
  readonly currency: string;

  private readonly base: string;
  private readonly authHeader: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(options: WooCommerceAdapterOptions = {}) {
    const rawBase = options.baseUrl ?? envString("WOO_BASE_URL");
    const key = options.key ?? envString("WOO_KEY");
    const secret = options.secret ?? envString("WOO_SECRET");
    if (!rawBase) throw new Error("WOO_BASE_URL is required for the WooCommerce provider");
    if (!key || !secret)
      throw new Error("WOO_KEY and WOO_SECRET are required for the WooCommerce provider");
    this.base = `${rawBase.replace(/\/+$/, "")}/wp-json/wc/v3`;
    this.authHeader = `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;
    this.currency = options.currency ?? "USD";
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.retries = options.retries ?? 2;
  }

  private url(path: string, params: Record<string, string | number | undefined> = {}): string {
    const url = new URL(`${this.base}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async request<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
    init: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    return requestJson<T>(this.fetchImpl, this.url(path, params), {
      provider: "woocommerce",
      method: init.method ?? "GET",
      headers: {
        authorization: this.authHeader,
        accept: "application/json",
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      timeoutMs: this.timeoutMs,
      retries: this.retries,
    });
  }

  async getOrders(filter: OrderFilter = {}): Promise<Page<Order>> {
    const perPage = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const page = filter.cursor ? Number.parseInt(filter.cursor, 10) : 1;
    const params: Record<string, string | number | undefined> = {
      per_page: perPage,
      page: Number.isFinite(page) && page > 0 ? page : 1,
      orderby: "date",
      order: "desc",
    };
    if (filter.status) params.status = WOO_STATUSES[filter.status].join(",");
    if (filter.since) params.after = filter.since.toISOString();

    const nodes = await this.request<WooOrderNode[]>("/orders", params);
    const items = nodes.map(mapWooOrder);
    return {
      items,
      total: items.length,
      nextCursor: nodes.length === perPage ? String((params.page as number) + 1) : undefined,
    };
  }

  async getOrder(id: string): Promise<Order> {
    const node = await this.request<WooOrderNode>(`/orders/${encodeURIComponent(id)}`);
    return mapWooOrder(node);
  }

  async fulfillOrder(id: string, input: FulfillOrderInput): Promise<Order> {
    const current = await this.request<WooOrderNode>(`/orders/${encodeURIComponent(id)}`);
    if (wooOrderStatus(current.status) === "cancelled") {
      throw new ValidationError("Cannot fulfil a cancelled order");
    }
    // Idempotent: an already-completed order is returned with its tracking intact.
    if (current.status === "completed") return mapWooOrder(current);

    const meta = (current.meta_data ?? []).filter(
      (entry) => entry.key !== META_TRACKING_NUMBER && entry.key !== META_TRACKING_CARRIER,
    );
    meta.push({ key: META_TRACKING_CARRIER, value: input.carrier });
    if (input.tracking) meta.push({ key: META_TRACKING_NUMBER, value: input.tracking });

    const updated = await this.request<WooOrderNode>(
      `/orders/${encodeURIComponent(id)}`,
      {},
      { method: "PUT", body: { status: "completed", meta_data: meta } },
    );
    return mapWooOrder(updated);
  }

  async cancelOrder(id: string, reason: string): Promise<Order> {
    if (!reason || reason.trim().length === 0) {
      throw new ValidationError("A cancellation reason is required");
    }
    const current = await this.request<WooOrderNode>(`/orders/${encodeURIComponent(id)}`);
    if (wooOrderStatus(current.status) === "cancelled") {
      return { ...mapWooOrder(current), cancelledReason: reason };
    }
    if (current.status === "completed") {
      throw new ValidationError("Cannot cancel an order that has already shipped");
    }
    const meta = (current.meta_data ?? []).filter((entry) => entry.key !== META_CANCEL_REASON);
    meta.push({ key: META_CANCEL_REASON, value: reason });

    const updated = await this.request<WooOrderNode>(
      `/orders/${encodeURIComponent(id)}`,
      {},
      { method: "PUT", body: { status: "cancelled", meta_data: meta } },
    );
    return mapWooOrder(updated);
  }

  private async fetchProductNodeBySku(sku: string): Promise<WooProductNode | null> {
    const nodes = await this.request<WooProductNode[]>("/products", { sku, per_page: 1 });
    return nodes.find((node) => node.sku === sku) ?? nodes[0] ?? null;
  }

  async getProducts(filter: ProductFilter = {}): Promise<Product[]> {
    const params: Record<string, string | number | undefined> = { per_page: 100 };
    if (filter.sku) params.sku = filter.sku;
    else if (filter.lowStockBelow === undefined) params.per_page = 100;
    else params.per_page = 100;

    const nodes = await this.request<WooProductNode[]>("/products", params);
    let products = nodes.map((node) => mapWooProduct(node, this.currency));
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
    const node = await this.fetchProductNodeBySku(sku);
    if (!node) throw new NotFoundError(`No product with SKU ${sku}`);

    const newStock = (node.stock_quantity ?? 0) + delta;
    if (newStock < 0) throw new ValidationError("Adjustment would make stock negative");

    const updated = await this.request<WooProductNode>(
      `/products/${node.id}`,
      {},
      { method: "PUT", body: { stock_quantity: newStock } },
    );
    return mapWooProduct(updated, this.currency);
  }

  private async fetchOrdersInRange(from: Date, to: Date): Promise<Order[]> {
    const orders: Order[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 3; page += 1) {
      const result = await this.getOrders({ since: from, limit: 100, cursor });
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
          revenue: { amount: 0, currency: this.currency } as Money,
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
    const nodes = await this.request<WooCustomerNode[]>("/customers", {
      search: query,
      per_page: 1,
    });
    const node = nodes[0];
    return node ? mapWooCustomer(node, this.currency) : null;
  }
}

export function createWooCommerceAdapter(
  options: WooCommerceAdapterOptions = {},
): WooCommerceAdapter {
  return new WooCommerceAdapter(options);
}
