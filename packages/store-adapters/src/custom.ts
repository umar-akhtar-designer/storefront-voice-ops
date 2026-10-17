/**
 * Custom-website adapter for seller-built stores (PHP/MySQL on shared hosting,
 * Django, Express, …) that expose the small JSON API documented in
 * `docs/store-connection-guide.md` (section C) and shipped as the ready-made
 * PHP drop-in in `docs/custom-store-php-kit/`.
 *
 * Endpoints (all JSON, protected by the `x-api-key` header):
 *   GET  /orders?status=<pending|shipped|delivered|cancelled>&limit=N
 *   GET  /orders/{id}            (id = the store's own human order number)
 *   POST /orders/{id}/fulfill    {"tracking","carrier"}
 *   POST /orders/{id}/cancel     {"reason"}
 *   GET  /products?lowStockBelow=N
 *   POST /products/{sku}/restock {"quantity","mode":"set|add"}
 *   GET  /sales/today            (optional, informational)
 */
import { NotFoundError, ValidationError } from "./errors.js";
import { requestJson, type FetchLike } from "./http.js";
import { DEFAULT_REORDER_POINT } from "./shopify.js";
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

/* Wire JSON returned by the drop-in API. */
export interface CustomOrderNode {
  id: string;
  createdAt: string;
  status: string;
  total: Money;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  trackingNumber?: string | null;
  cancelledReason?: string | null;
  items: { sku: string; name: string; quantity: number; unitPrice: Money }[];
}

export interface CustomProductNode {
  sku: string;
  name: string;
  stock: number;
  price: Money;
}

export interface CustomAdapterOptions {
  /** e.g. "https://kapraa.pk/voice-api/voice-ops-api.php" */
  baseUrl: string;
  apiKey: string;
  /** ISO-4217 label used when the store front never says what currency it sells in. */
  currency?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  retries?: number;
}

const THE_ORDER_DAYS = 100; // orders scanned (newest first) for sales/top-seller/customer look-ups

function money(amount: number, currency: string): Money {
  return { amount: Math.round(amount * 100) / 100, currency };
}

/** The site's own order numbers/statuses may not exist; the API returns "pending" etc. */
export function mapStatus(status: string): OrderStatus {
  const value = status.toLowerCase();
  if (value === "shipped" || value === "delivered" || value === "cancelled") return value;
  return "pending";
}

export function mapCustomOrder(node: CustomOrderNode, carrier?: string): Order {
  // Payments can be pending (total null) and items may lack prices; never crash on real data.
  const items = (node.items ?? []).map((item) => ({
    sku: String(item.sku ?? ""),
    name: String(item.name ?? ""),
    qty: Number(item.quantity ?? 1),
    unitPrice: Number(item.unitPrice?.amount ?? 0),
  }));
  const itemSum = items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  const totalAmount = Number(node.total?.amount ?? itemSum ?? 0);
  return {
    id: node.id,
    customerId:
      (node.customerEmail ?? "").trim() || (node.customerPhone ?? "").trim() || node.customerName,
    customerName: node.customerName || "(no name)",
    status: mapStatus(node.status),
    total: money(Number.isFinite(totalAmount) ? totalAmount : 0, node.total?.currency || "PKR"),
    createdAt: node.createdAt,
    trackingNumber: node.trackingNumber ?? undefined,
    cancelledReason: node.cancelledReason ?? undefined,
    ...(carrier ? { carrier } : {}),
    items,
  };
}

export function mapCustomProduct(node: CustomProductNode): Product {
  return {
    sku: String(node.sku ?? ""),
    name: String(node.name ?? "(unnamed product)"),
    stock: Math.round(Number(node.stock ?? 0)),
    price: money(Number(node.price?.amount ?? 0), node.price?.currency || "PKR"),
    reorderPoint: DEFAULT_REORDER_POINT,
  };
}

/* createdAt strings arrive as SQL datetimes ("2026-10-15 15:40:44") or ISO stamps; only the
 * leading date is compared so no locale-dependent Date parsing is involved. */
function dayOf(raw: Date | string): string {
  return raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).slice(0, 10);
}

export class CustomAdapter implements StoreAdapter {
  readonly provider = "custom";
  readonly currency: string;

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(options: CustomAdapterOptions) {
    const baseUrl = options.baseUrl?.trim();
    if (!baseUrl) throw new Error("CUSTOM_STORE_URL is required");
    if (!options.apiKey?.trim()) throw new Error("CUSTOM_API_KEY is required");
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey.trim();
    this.currency = (options.currency ?? "PKR").toUpperCase();
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.retries = options.retries ?? 2;
  }

  private url(path: string): string {
    return `${this.baseUrl}/${path.replace(/^\/+/, "")}`;
  }

  private request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    return requestJson<T>(this.fetchImpl, this.url(path), {
      provider: this.provider,
      method: init.method ?? "GET",
      headers: {
        "x-api-key": this.apiKey,
        accept: "application/json",
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      timeoutMs: this.timeoutMs,
      retries: this.retries,
    });
  }

  async getOrders(filter: OrderFilter = {}): Promise<Page<Order>> {
    const params = new URLSearchParams();
    if (filter.status) params.set("status", filter.status);
    params.set("limit", String(Math.min(Math.max(filter.limit ?? 20, 1), 100)));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    const data = await this.request<{ items: CustomOrderNode[] }>(`orders${suffix}`);
    const items = data.items.map((node) => mapCustomOrder(node));
    return { items, total: items.length };
  }

  async getOrder(id: string): Promise<Order> {
    return mapCustomOrder(await this.request<CustomOrderNode>(`orders/${encodeURIComponent(id)}`));
  }

  async fulfillOrder(id: string, input: FulfillOrderInput): Promise<Order> {
    return mapCustomOrder(
      await this.request<CustomOrderNode>(`orders/${encodeURIComponent(id)}/fulfill`, {
        method: "POST",
        body: { tracking: input.tracking ?? "", carrier: input.carrier },
      }),
      input.carrier,
    );
  }

  async cancelOrder(id: string, reason: string): Promise<Order> {
    if (!reason || reason.trim().length === 0) {
      throw new ValidationError("A cancellation reason is required");
    }
    const node = await this.request<CustomOrderNode>(`orders/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      body: { reason: reason.trim() },
    });
    const order = mapCustomOrder(node);
    // Idempotent: re-cancelling returns the order unchanged.
    return { ...order, cancelledReason: order.cancelledReason ?? reason.trim() };
  }

  async getProducts(filter: ProductFilter = {}): Promise<Product[]> {
    const params = new URLSearchParams();
    if (filter.lowStockBelow !== undefined) {
      params.set("lowStockBelow", String(filter.lowStockBelow));
    }
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    const data = await this.request<{ items: CustomProductNode[] }>(`products${suffix}`);
    const products = data.items.map(mapCustomProduct);
    if (filter.sku) {
      return products.filter((product) => product.sku.toLowerCase() === filter.sku!.toLowerCase());
    }
    return products;
  }

  async adjustStock(sku: string, delta: number, reason: string): Promise<Product> {
    if (!reason || reason.trim().length === 0) {
      throw new ValidationError("A restock reason is required");
    }
    if (!Number.isFinite(delta)) throw new ValidationError("Stock adjustment must be a number");
    const [current] = await this.getProducts({ sku });
    if (!current) throw new NotFoundError(`No product with SKU ${sku}`);

    if (delta === 0) return current;
    const target = current.stock + delta;
    if (target < 0) {
      throw new ValidationError(`Stock cannot go below 0 (currently ${current.stock})`);
    }
    if (delta > 0) {
      // Absolute additions use mode "add" so simultaneous edits never clobber each other.
      const node = await this.request<CustomProductNode>(
        `products/${encodeURIComponent(sku)}/restock`,
        { method: "POST", body: { quantity: delta, mode: "add" } },
      );
      return mapCustomProduct({ ...node, sku: current.sku });
    }
    // Negative deltas are expressed as an absolute set to the new total.
    const node = await this.request<CustomProductNode>(
      `products/${encodeURIComponent(sku)}/restock`,
      { method: "POST", body: { quantity: target, mode: "set" } },
    );
    return mapCustomProduct({ ...node, sku: current.sku });
  }

  async getSalesBetween(from: Date, to: Date): Promise<SalesSummary> {
    const orders = await this.ordersInRange(from, to);
    const revenue = orders.reduce((sum, order) => sum + order.total.amount, 0);
    const orderCount = orders.length;
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      orderCount,
      revenue: money(revenue, this.currency),
      averageOrderValue: money(orderCount === 0 ? 0 : revenue / orderCount, this.currency),
    };
  }

  async getTopSellers(from: Date, to: Date, limit: number): Promise<TopSeller[]> {
    const orders = await this.ordersInRange(from, to);
    const buckets = new Map<string, TopSeller>();
    for (const order of orders) {
      for (const item of order.items) {
        const entry = buckets.get(item.sku) ?? {
          sku: item.sku,
          name: item.name,
          units: 0,
          revenue: money(0, this.currency),
        };
        entry.units += item.qty;
        entry.revenue = money(entry.revenue.amount + item.qty * item.unitPrice, this.currency);
        entry.name = item.name || entry.name;
        buckets.set(item.sku, entry);
      }
    }
    return [...buckets.values()].sort((a, b) => b.units - a.units).slice(0, limit);
  }

  /**
   * Customers are derived from the store's own orders, most recent first. The identifier uses
   * whatever contact info the newest matching order has (email → phone → name); no external
   * customer profile exists on a bare custom store.
   */
  async getCustomer(query: string): Promise<Customer | null> {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    const page = await this.getOrders({ limit: THE_ORDER_DAYS });
    const matching = page.items.filter(
      (order) => order.customerName.trim().toLowerCase() === needle,
    );
    if (matching.length === 0) {
      const partial = page.items.filter(
        (order) =>
          order.customerName.length > 0 && order.customerName.toLowerCase().includes(needle),
      );
      if (partial.length === 0) return null;
      return this.customerFromOrders(partial, needle);
    }
    return this.customerFromOrders(matching, needle);
  }

  private customerFromOrders(orders: Order[], id: string): Customer | null {
    const newest = orders[0]!;
    const name = newest.customerName.trim() || id;
    const lifetime = orders.reduce((sum, order) => sum + order.total.amount, 0);
    return {
      id: newest.customerId.trim() || name,
      name,
      orderCount: orders.length,
      lifetimeValue: money(lifetime, this.currency),
    };
  }

  private async ordersInRange(from: Date, to: Date): Promise<Order[]> {
    const page = await this.getOrders({ limit: THE_ORDER_DAYS });
    const start = dayOf(from);
    const end = dayOf(to);
    return page.items.filter((order) => {
      const day = dayOf(order.createdAt);
      return day >= start && day <= end;
    });
  }
}

export function createCustomAdapter(options: CustomAdapterOptions): CustomAdapter {
  return new CustomAdapter(options);
}
