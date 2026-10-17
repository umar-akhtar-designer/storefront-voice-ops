import { NotFoundError, ValidationError } from "./errors.js";
import type {
  Customer,
  FulfillOrderInput,
  Order,
  OrderFilter,
  OrderItem,
  OrderStatus,
  Page,
  Product,
  ProductFilter,
  SalesSummary,
  StoreAdapter,
  TopSeller,
} from "./types.js";

export interface MockAdapterOptions {
  /** Clock used to place seed data and to answer "today" style queries. Defaults to Date.now. */
  now?: () => Date;
  seed?: number;
  products?: Product[];
  customers?: Customer[];
  orders?: Order[];
}

const DEFAULT_CURRENCY = "PKR";
const PAGE_LIMIT = 20;

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function defaultProducts(): Product[] {
  const p = (
    sku: string,
    name: string,
    price: number,
    stock: number,
    reorderPoint: number,
    supplierName: string,
    supplierContact: string,
  ): Product => ({
    sku,
    name,
    price: { amount: price, currency: DEFAULT_CURRENCY },
    stock,
    reorderPoint,
    supplierName,
    supplierContact,
  });

  return [
    p(
      "TEE-BLK-M",
      "Black Tee (M)",
      1800,
      4,
      10,
      "Faisal Textiles",
      "orders@faisaltextiles.example",
    ),
    p(
      "TEE-BLK-L",
      "Black Tee (L)",
      1800,
      26,
      10,
      "Faisal Textiles",
      "orders@faisaltextiles.example",
    ),
    p(
      "TEE-WHT-M",
      "White Tee (M)",
      1800,
      18,
      10,
      "Faisal Textiles",
      "orders@faisaltextiles.example",
    ),
    p(
      "TEE-WHT-L",
      "White Tee (L)",
      1800,
      42,
      10,
      "Faisal Textiles",
      "orders@faisaltextiles.example",
    ),
    p("HOOD-GRY-L", "Grey Hoodie (L)", 4200, 7, 8, "Madina Knits", "sales@madinaknits.example"),
    p("HOOD-BLK-M", "Black Hoodie (M)", 4400, 12, 8, "Madina Knits", "sales@madinaknits.example"),
    p("CAP-NVY", "Navy Cap", 1200, 3, 12, "Madina Knits", "sales@madinaknits.example"),
    p("CAP-BLK", "Black Cap", 1200, 30, 12, "Madina Knits", "sales@madinaknits.example"),
    p("SOCK-3PK", "Socks 3-Pack", 900, 120, 40, "Crescent Hosiery", "hello@crescensocks.example"),
    p("MUG-CER", "Ceramic Mug", 1100, 9, 15, "Karachi Ceramics", "info@karachiceramics.example"),
    p("BAG-TOT", "Canvas Tote", 1500, 22, 15, "Karachi Ceramics", "info@karachiceramics.example"),
    p(
      "SHOE-CANV-42",
      "Canvas Shoes (42)",
      3500,
      5,
      6,
      "Sialkot Footwear",
      "export@sialkotfootwear.example",
    ),
    p(
      "BELT-LTH",
      "Leather Belt",
      2200,
      16,
      10,
      "Sialkot Leathers",
      "sales@sialkotleathers.example",
    ),
    p("JKT-DEN-M", "Denim Jacket (M)", 6500, 2, 5, "Madina Knits", "sales@madinaknits.example"),
    p("SCARF-WL", "Wool Scarf", 1900, 0, 10, "Crescent Hosiery", "hello@crescensocks.example"),
  ];
}

const CUSTOMER_NAMES = [
  "Ayesha K.",
  "Bilal R.",
  "Sana M.",
  "Hamza T.",
  "Noor F.",
  "Zain A.",
  "Mariam S.",
  "Usman H.",
  "Fatima N.",
  "Ali Z.",
  "Hira Q.",
  "Danish W.",
];

function defaultCustomers(): Customer[] {
  return CUSTOMER_NAMES.map((name, i) => {
    const id = `C${String(i + 1).padStart(3, "0")}`;
    return {
      id,
      name,
      email: `${name.split(" ")[0]!.toLowerCase()}${i + 1}@example.com`,
      phone: `+92 300 ${String(1000000 + i * 1111)}`,
      orderCount: 0,
      lifetimeValue: { amount: 0, currency: DEFAULT_CURRENCY },
    } satisfies Customer;
  });
}

function buildSeed(
  now: Date,
  seed: number,
): { products: Product[]; customers: Customer[]; orders: Order[] } {
  const products = defaultProducts();
  const rng = makeRng(seed);
  const customers = defaultCustomers();
  const statuses: OrderStatus[] = [
    "pending",
    "shipped",
    "delivered",
    "delivered",
    "pending",
    "cancelled",
  ];
  const carriers = ["TCS", "Leopards", "M&P", "Trax"];

  const orders: Order[] = [];
  const orderCount = 26;
  for (let i = 0; i < orderCount; i++) {
    const customer = customers[Math.floor(rng() * customers.length)]!;
    const daysAgo = Math.floor(rng() * 34);
    const createdAt = new Date(
      now.getTime() - daysAgo * 86400000 - Math.floor(rng() * 20) * 3600000,
    );
    const status = statuses[Math.floor(rng() * statuses.length)]!;

    const itemCount = 1 + Math.floor(rng() * 3);
    const items: OrderItem[] = [];
    let total = 0;
    for (let j = 0; j < itemCount; j++) {
      const product = products[Math.floor(rng() * products.length)]!;
      if (items.some((it) => it.sku === product.sku)) continue;
      const qty = 1 + Math.floor(rng() * 3);
      items.push({
        sku: product.sku,
        name: product.name,
        qty,
        unitPrice: product.price.amount,
      });
      total += qty * product.price.amount;
    }
    if (items.length === 0) {
      const product = products[0]!;
      items.push({ sku: product.sku, name: product.name, qty: 1, unitPrice: product.price.amount });
      total = product.price.amount;
    }

    const id = String(1001 + i);
    const shippedStatus = status === "shipped" || status === "delivered";
    orders.push({
      id,
      customerId: customer.id,
      customerName: customer.name,
      status,
      total: { amount: total, currency: DEFAULT_CURRENCY },
      createdAt: createdAt.toISOString(),
      ...(shippedStatus
        ? {
            carrier: carriers[Math.floor(rng() * carriers.length)]!,
            trackingNumber: `TRK${String(900000 + i * 7)}`,
          }
        : {}),
      items,
    });
  }

  for (const order of orders) {
    if (order.status === "cancelled") continue;
    const customer = customers.find((c) => c.id === order.customerId);
    if (customer) {
      customer.orderCount += 1;
      customer.lifetimeValue = {
        amount: customer.lifetimeValue.amount + order.total.amount,
        currency: DEFAULT_CURRENCY,
      };
    }
  }

  return { products, customers, orders };
}

/**
 * Deterministic in-memory store used by tests and the public demo. Data is placed relative to a
 * configurable clock so time-based queries are reproducible.
 */
export class MockAdapter implements StoreAdapter {
  readonly provider = "mock";
  readonly currency = DEFAULT_CURRENCY;

  private readonly clock: () => Date;
  private readonly productMap: Map<string, Product>;
  private readonly customerList: Customer[];
  private readonly orderMap: Map<string, Order>;

  constructor(options: MockAdapterOptions = {}) {
    this.clock = options.now ?? (() => new Date());
    const seed = buildSeed(this.clock(), options.seed ?? 20261017);
    const products = options.products ?? seed.products;
    const customers = options.customers ?? seed.customers;
    const orders = options.orders ?? seed.orders;

    this.productMap = new Map(products.map((p) => [p.sku, { ...p }]));
    this.customerList = customers.map((c) => ({ ...c }));
    this.orderMap = new Map(orders.map((o) => [o.id, structuredClone(o)]));
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }

  async getOrders(filter: OrderFilter = {}): Promise<Page<Order>> {
    const limit = Math.min(Math.max(filter.limit ?? PAGE_LIMIT, 1), 100);
    const offset = filter.cursor ? Math.max(Number.parseInt(filter.cursor, 10) || 0, 0) : 0;

    let list = [...this.orderMap.values()];
    if (filter.status) list = list.filter((o) => o.status === filter.status);
    if (filter.since) {
      const since = filter.since.getTime();
      list = list.filter((o) => new Date(o.createdAt).getTime() >= since);
    }
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = list.length;
    const page = list.slice(offset, offset + limit);
    const nextOffset = offset + limit;
    return {
      items: this.clone(page),
      total,
      ...(nextOffset < total ? { nextCursor: String(nextOffset) } : {}),
    };
  }

  async getOrder(id: string): Promise<Order> {
    const order = this.orderMap.get(id);
    if (!order) throw new NotFoundError(`Order ${id} was not found`);
    return this.clone(order);
  }

  async fulfillOrder(id: string, input: FulfillOrderInput): Promise<Order> {
    const order = this.orderMap.get(id);
    if (!order) throw new NotFoundError(`Order ${id} was not found`);
    if (order.status === "cancelled") {
      throw new ValidationError(`Order ${id} is cancelled and cannot be shipped`);
    }
    if (
      order.status === "shipped" &&
      order.carrier === input.carrier &&
      order.trackingNumber === input.tracking
    ) {
      return this.clone(order);
    }
    order.status = "shipped";
    order.carrier = input.carrier;
    if (input.tracking) order.trackingNumber = input.tracking;
    return this.clone(order);
  }

  async cancelOrder(id: string, reason: string): Promise<Order> {
    if (!reason || reason.trim().length === 0) {
      throw new ValidationError("A reason is required to cancel an order");
    }
    const order = this.orderMap.get(id);
    if (!order) throw new NotFoundError(`Order ${id} was not found`);
    if (order.status === "cancelled") {
      return this.clone(order);
    }
    if (order.status !== "pending") {
      throw new ValidationError(`Order ${id} is already ${order.status} and cannot be cancelled`);
    }
    order.status = "cancelled";
    order.cancelledReason = reason;
    return this.clone(order);
  }

  async getProducts(filter: ProductFilter = {}): Promise<Product[]> {
    let list = [...this.productMap.values()];
    if (filter.sku) {
      const sku = filter.sku.toLowerCase();
      list = list.filter((p) => p.sku.toLowerCase() === sku);
    }
    if (filter.lowStockBelow !== undefined) {
      const threshold = filter.lowStockBelow;
      list = list.filter((p) => p.stock <= threshold);
    }
    list.sort((a, b) => a.stock - b.stock || a.sku.localeCompare(b.sku));
    return this.clone(list);
  }

  async adjustStock(sku: string, delta: number, reason: string): Promise<Product> {
    if (!reason || reason.trim().length === 0) {
      throw new ValidationError("A reason is required to adjust stock");
    }
    const key = [...this.productMap.keys()].find((k) => k.toLowerCase() === sku.toLowerCase());
    const product = key ? this.productMap.get(key) : undefined;
    if (!product) throw new NotFoundError(`Product ${sku} was not found`);
    const next = product.stock + delta;
    if (next < 0) {
      throw new ValidationError(
        `Adjustment would make ${sku} stock negative (${product.stock} + ${delta})`,
      );
    }
    product.stock = next;
    return this.clone(product);
  }

  async getSalesBetween(from: Date, to: Date): Promise<SalesSummary> {
    const start = from.getTime();
    const end = to.getTime();
    const orders = [...this.orderMap.values()].filter((o) => {
      if (o.status === "cancelled") return false;
      const t = new Date(o.createdAt).getTime();
      return t >= start && t <= end;
    });
    const revenue = orders.reduce((sum, o) => sum + o.total.amount, 0);
    const orderCount = orders.length;
    const average = orderCount === 0 ? 0 : Math.round(revenue / orderCount);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      orderCount,
      revenue: { amount: revenue, currency: DEFAULT_CURRENCY },
      averageOrderValue: { amount: average, currency: DEFAULT_CURRENCY },
    };
  }

  async getTopSellers(from: Date, to: Date, limit: number): Promise<TopSeller[]> {
    const start = from.getTime();
    const end = to.getTime();
    const tally = new Map<string, TopSeller>();
    for (const order of this.orderMap.values()) {
      if (order.status === "cancelled") continue;
      const t = new Date(order.createdAt).getTime();
      if (t < start || t > end) continue;
      for (const item of order.items) {
        const current =
          tally.get(item.sku) ??
          ({
            sku: item.sku,
            name: item.name,
            units: 0,
            revenue: { amount: 0, currency: DEFAULT_CURRENCY },
          } as TopSeller);
        current.units += item.qty;
        current.revenue = {
          amount: current.revenue.amount + item.qty * item.unitPrice,
          currency: DEFAULT_CURRENCY,
        };
        tally.set(item.sku, current);
      }
    }
    return [...tally.values()]
      .sort((a, b) => b.units - a.units || b.revenue.amount - a.revenue.amount)
      .slice(0, Math.max(limit, 1));
  }

  async getCustomer(query: string): Promise<Customer | null> {
    const q = query.trim().toLowerCase();
    if (!q) return null;

    const byId = this.customerList.find((c) => c.id.toLowerCase() === q);
    if (byId) return this.clone(byId);

    const byOrder = [...this.orderMap.values()].find((o) => o.id.toLowerCase() === q);
    if (byOrder) {
      const owner = this.customerList.find((c) => c.id === byOrder.customerId);
      if (owner) return this.clone(owner);
    }

    const byField = this.customerList.find(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email ? c.email.toLowerCase().includes(q) : false) ||
        (c.phone ? c.phone.replace(/\s/g, "").includes(q.replace(/\s/g, "")) : false),
    );
    return byField ? this.clone(byField) : null;
  }
}

/** Convenience constructor for the mock provider. */
export function createMockAdapter(options: MockAdapterOptions = {}): StoreAdapter {
  return new MockAdapter(options);
}
