import Database from "better-sqlite3";
import {
  DEFAULT_REORDER_POINT,
  NotFoundError,
  ValidationError,
  type Customer,
  type FulfillOrderInput,
  type Money,
  type Order,
  type OrderFilter,
  type OrderStatus,
  type Page,
  type Product,
  type ProductFilter,
  type SalesSummary,
  type StoreAdapter,
  type TopSeller,
} from "@voice-ops/store-adapters";

/**
 * The manual provider: a store that lives entirely inside this app, for sellers who have no
 * website at all (WhatsApp/Facebook/Instagram group selling). The seller records products, stock
 * and orders through forms in the simulator; the same MCP tools — briefing, low stock, ship,
 * cancel, restock — then work on that data exactly as they do for Shopify/custom stores.
 *
 * Tables used (from src/db/schema.sql, plus the additive `cancelled_reason` extension):
 *   products, orders, order_items, customers.
 */
export interface ManualProductInput {
  sku: string;
  name: string;
  stock: number;
  price: number;
  currency?: string;
  reorderPoint?: number;
}

export interface ManualOrderItemInput {
  sku: string;
  quantity: number;
  unitPrice?: number;
}

export interface ManualOrderInput {
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  items: ManualOrderItemInput[];
  /** Optional explicit total; otherwise computed from the items. */
  total?: number;
  createdAt?: string;
}

const money = (amount: number, currency: string): Money => ({
  amount: Math.round(amount * 100) / 100,
  currency,
});

interface OrderRow {
  id: string;
  customer_id: string | null;
  status: string;
  total: number;
  currency: string;
  created_at: string;
  carrier: string | null;
  tracking_number: string | null;
  cancelled_reason?: string | null;
  [key: string]: unknown;
}

interface ItemRow {
  sku: string;
  name: string;
  qty: number;
  unit_price: number;
}

export class ManualAdapter implements StoreAdapter {
  readonly provider = "manual";
  readonly currency: string;

  private readonly db: Database.Database;

  constructor(db: Database.Database, currency = "PKR") {
    this.db = db;
    this.currency = currency.toUpperCase();
    // Orders carry the voice-recorded cancellation reason. Additive + idempotent.
    try {
      this.db.exec("ALTER TABLE orders ADD COLUMN cancelled_reason TEXT");
    } catch {
      /* column already exists */
    }
  }

  /* ------------------------------------------------------------ products */
  async getProducts(filter: ProductFilter = {}): Promise<Product[]> {
    let rows: Record<string, unknown>[];
    if (filter.sku) {
      rows = this.db
        .prepare("SELECT * FROM products WHERE UPPER(sku) = ?")
        .all(filter.sku.trim().toUpperCase()) as Record<string, unknown>[];
    } else if (filter.lowStockBelow !== undefined) {
      rows = this.db
        .prepare("SELECT * FROM products WHERE stock <= ? ORDER BY stock ASC LIMIT 250")
        .all(filter.lowStockBelow) as Record<string, unknown>[];
    } else {
      rows = this.db
        .prepare("SELECT * FROM products ORDER BY name ASC LIMIT 250")
        .all() as Record<string, unknown>[];
    }
    return rows.map(mapProductRow);
  }

  async adjustStock(sku: string, delta: number, reason: string): Promise<Product> {
    if (!reason || reason.trim().length === 0) {
      throw new ValidationError("A restock reason is required");
    }
    if (!Number.isFinite(delta) || !Number.isInteger(delta)) {
      throw new ValidationError("Stock adjustment must be a whole number");
    }
    const row = this.findProduct(sku);
    if (!row) throw new NotFoundError(`No product with SKU ${sku}`);
    const stock = Number(row.stock ?? 0);
    const target = stock + delta;
    if (target < 0) {
      throw new ValidationError(`Stock cannot go below 0 (currently ${stock})`);
    }
    this.db
      .prepare("UPDATE products SET stock = ?, updated_at = datetime('now') WHERE sku = ?")
      .run(target, String(row.sku));
    return mapProductRow(this.findProduct(String(row.sku))!);
  }

  upsertProduct(input: ManualProductInput): Product {
    const sku = String(input.sku || "").trim().toUpperCase();
    if (!sku) throw new ValidationError("A product SKU is required");
    if (String(input.name || "").trim().length === 0) {
      throw new ValidationError("A product name is required");
    }
    if (!Number.isFinite(input.price) || input.price < 0) {
      throw new ValidationError("A non-negative price is required");
    }
    if (!Number.isInteger(input.stock) || input.stock < 0) {
      throw new ValidationError("A non-negative whole stock count is required");
    }
    const currency = (input.currency || this.currency).toUpperCase();
    this.db
      .prepare(
        `INSERT INTO products (sku, name, price, currency, stock, reorder_point, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(sku) DO UPDATE SET
           name = excluded.name,
           price = excluded.price,
           currency = excluded.currency,
           stock = excluded.stock,
           reorder_point = excluded.reorder_point,
           updated_at = datetime('now')`,
      )
      .run(
        sku,
        String(input.name).trim(),
        input.price,
        currency,
        input.stock,
        Math.max(input.reorderPoint ?? DEFAULT_REORDER_POINT, 0),
      );
    return mapProductRow(this.findProduct(sku)!);
  }

  /* -------------------------------------------------------------- orders */
  async getOrders(filter: OrderFilter = {}): Promise<Page<Order>> {
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const offset = Number.parseInt(filter.cursor ?? "0", 10) || 0;
    let clauses = "";
    const params: unknown[] = [];
    if (filter.status) {
      clauses += " AND status = ?";
      params.push(filter.status);
    }
    if (filter.since) {
      clauses += " AND created_at >= ?";
      params.push(filter.since.toISOString());
    }
    const rows = this.db
      .prepare(
        `SELECT * FROM orders WHERE 1=1${clauses}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as OrderRow[];
    const items = rows.map((row) => this.mapOrderRow(row));
    return {
      items,
      total: offset + items.length,
      nextCursor: rows.length === limit ? String(offset + items.length) : undefined,
    };
  }

  async getOrder(id: string): Promise<Order> {
    return this.mapOrderRow(this.mustGetOrder(id));
  }

  async fulfillOrder(id: string, input: FulfillOrderInput): Promise<Order> {
    const row = this.mustGetOrder(id);
    if (row.status === "cancelled") {
      throw new ValidationError("Cannot fulfil a cancelled order");
    }
    this.db
      .prepare(
        "UPDATE orders SET status = 'shipped', carrier = ?, tracking_number = ? WHERE id = ?",
      )
      .run(input.carrier, input.tracking ?? "", id);
    return this.mapOrderRow(this.mustGetOrder(id)); // idempotent: already-shipped returns unchanged
  }

  async cancelOrder(id: string, reason: string): Promise<Order> {
    if (!reason || reason.trim().length === 0) {
      throw new ValidationError("A cancellation reason is required");
    }
    const row = this.mustGetOrder(id);
    if (row.status === "shipped") {
      throw new ValidationError("Cannot cancel an order that has already shipped");
    }
    this.db
      .prepare("UPDATE orders SET status = 'cancelled', cancelled_reason = ? WHERE id = ?")
      .run(reason.trim(), id);
    const order = this.mapOrderRow(this.mustGetOrder(id));
    return { ...order, cancelledReason: order.cancelledReason ?? reason.trim() };
  }

  /** Seller-entered order (customer paid via WhatsApp/DM, no website involved). */
  createOrder(input: ManualOrderInput): Order {
    if (!input.customerName || input.customerName.trim().length === 0) {
      throw new ValidationError("A customer name is required");
    }
    if (input.items.length === 0) {
      throw new ValidationError("At least one order item is required");
    }
    for (const item of input.items) {
      if (!item.sku.trim()) throw new ValidationError("Every item needs a SKU");
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        throw new ValidationError("Item quantity must be a whole number of at least 1");
      }
    }
    const items = input.items.map((item) => ({
      sku: item.sku.trim().toUpperCase(),
      qty: item.quantity,
      unitPrice: item.unitPrice ?? this.productPrice(item.sku),
    }));
    const name = input.customerName.trim();
    const customerId =
      input.customerPhone?.trim() || input.customerEmail?.trim() || name;
    const total =
      input.total ?? items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
    const createdAt = input.createdAt ?? new Date().toISOString();

    let orderId: string;
    this.db.prepare("BEGIN").run();
    try {
      do {
        orderId = `M-${Date.now().toString(36).toUpperCase().slice(-4)}-${Math.random()
          .toString(36)
          .slice(2, 6)
          .toUpperCase()}`;
      } while (this.db.prepare("SELECT 1 FROM orders WHERE id = ?").get(orderId));
      this.db
        .prepare(
          "INSERT INTO orders (id, customer_id, status, total, currency, created_at) VALUES (?, ?, 'pending', ?, ?, ?)",
        )
        .run(orderId, customerId, total, this.currency, createdAt);
      for (const item of items) {
        this.db
          .prepare(
            `INSERT INTO order_items (order_id, sku, name, qty, unit_price) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(order_id, sku) DO UPDATE SET qty = qty + excluded.qty`,
          )
          .run(orderId, item.sku, this.productName(item.sku), item.qty, item.unitPrice);
      }
      this.db
        .prepare(
          `INSERT INTO customers (id, name, order_count, lifetime_value, currency)
           VALUES (?, ?, 1, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             order_count = order_count + 1,
             lifetime_value = lifetime_value + excluded.lifetime_value`,
        )
        .run(customerId, name, total, this.currency);
      this.db.exec("COMMIT");
      return this.mapOrderRow(this.mustGetOrder(orderId));
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /* ------------------------------------------------------------- reports */
  async getSalesBetween(from: Date, to: Date): Promise<SalesSummary> {
    const orders = this.ordersInRange(from, to);
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
    const orders = this.ordersInRange(from, to);
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
        buckets.set(item.sku, entry);
      }
    }
    return [...buckets.values()].sort((a, b) => b.units - a.units).slice(0, limit);
  }

  async getCustomer(query: string): Promise<Customer | null> {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    const rows = this.db
      .prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 100")
      .all() as OrderRow[];
    const matches = rows.filter((row) => {
      const name = this.customerNameOf(row);
      return name.trim().toLowerCase() === needle;
    });
    const pool = matches.length > 0 ? matches : rows.filter((row) => {
      const name = this.customerNameOf(row).toLowerCase();
      return name.length > 0 && name.includes(needle);
    });
    if (pool.length === 0) return null;
    const orders = pool.map((row) => this.mapOrderRow(row));
    const newest = orders[0]!;
    const lifetime = orders.reduce((sum, order) => sum + order.total.amount, 0);
    return {
      id: newest.customerId,
      name: newest.customerName,
      orderCount: orders.length,
      lifetimeValue: money(lifetime, this.currency),
    };
  }

  /* ------------------------------------------------------------ internals */
  private findProduct(sku: string): Record<string, unknown> | undefined {
    return this.db
      .prepare("SELECT * FROM products WHERE sku = ?")
      .get(sku.trim().toUpperCase()) as Record<string, unknown> | undefined;
  }

  private productPrice(sku: string): number {
    const row = this.findProduct(sku);
    return row ? Number(row.price ?? 0) : 0;
  }

  private productName(sku: string): string {
    const row = this.findProduct(sku);
    return row ? String(row.name ?? "Item") : "Item";
  }

  private mustGetOrder(id: string): OrderRow {
    const row = this.db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as
      | OrderRow
      | undefined;
    if (!row) throw new NotFoundError(`Order ${id} not found`);
    return row;
  }

  private customerNameOf(row: OrderRow): string {
    const hit = this.db
      .prepare("SELECT name FROM customers WHERE id = ?")
      .get(String(row.customer_id ?? "")) as { name: string } | undefined;
    return hit?.name ?? String(row.customer_id ?? "");
  }

  private mapOrderRow(row: OrderRow): Order {
    const statuses: OrderStatus[] = ["pending", "shipped", "delivered", "cancelled"];
    const status = statuses.includes(row.status as OrderStatus)
      ? (row.status as OrderStatus)
      : "pending";
    const items = (
      this.db
        .prepare("SELECT sku, name, qty, unit_price FROM order_items WHERE order_id = ?")
        .all(row.id) as ItemRow[]
    ).map((item) => ({
      sku: item.sku,
      name: item.name,
      qty: item.qty,
      unitPrice: item.unit_price,
    }));
    return {
      id: row.id,
      customerId: String(row.customer_id ?? ""),
      customerName: this.customerNameOf(row) || String(row.customer_id ?? "(unknown)"),
      status,
      total: money(Number(row.total ?? 0), String(row.currency ?? this.currency)),
      createdAt: row.created_at,
      carrier: row.carrier ?? undefined,
      trackingNumber: row.tracking_number ?? undefined,
      cancelledReason: row.cancelled_reason ?? undefined,
      items,
    };
  }

  private ordersInRange(from: Date, to: Date): Order[] {
    const start = from.toISOString().slice(0, 10);
    const end = to.toISOString().slice(0, 10);
    const rows = this.db
      .prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 500")
      .all() as OrderRow[];
    return rows
      .map((row) => this.mapOrderRow(row))
      .filter((order) => {
        const day = order.createdAt.slice(0, 10);
        return day >= start && day <= end;
      });
  }
}

function mapProductRow(row: Record<string, unknown>): Product {
  return {
    sku: String(row.sku),
    name: String(row.name),
    stock: Number(row.stock ?? 0),
    price: money(Number(row.price ?? 0), String(row.currency ?? "PKR")),
    reorderPoint: Number(row.reorder_point ?? DEFAULT_REORDER_POINT),
  };
}
