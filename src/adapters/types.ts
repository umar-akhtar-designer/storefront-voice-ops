/**
 * The StoreAdapter contract. Every store platform (mock, Shopify, WooCommerce) implements this
 * interface so that tools never know which platform they are talking to.
 */

export type OrderStatus = "pending" | "shipped" | "delivered" | "cancelled";

export interface Money {
  amount: number;
  currency: string;
}

export interface OrderItem {
  sku: string;
  name: string;
  qty: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  status: OrderStatus;
  total: Money;
  /** ISO-8601 timestamp. */
  createdAt: string;
  carrier?: string;
  trackingNumber?: string;
  items: OrderItem[];
}

export interface Product {
  sku: string;
  name: string;
  price: Money;
  stock: number;
  reorderPoint: number;
  supplierName?: string;
  supplierContact?: string;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  orderCount: number;
  lifetimeValue: Money;
}

export interface Page<T> {
  items: T[];
  total: number;
  nextCursor?: string;
}

export interface OrderFilter {
  status?: OrderStatus;
  since?: Date;
  limit?: number;
  cursor?: string;
}

export interface ProductFilter {
  lowStockBelow?: number;
  sku?: string;
}

export interface FulfillOrderInput {
  carrier: string;
  tracking?: string;
}

export interface SalesSummary {
  /** ISO-8601 timestamps. */
  from: string;
  to: string;
  orderCount: number;
  revenue: Money;
  averageOrderValue: Money;
}

export interface TopSeller {
  sku: string;
  name: string;
  units: number;
  revenue: Money;
}

export interface StoreAdapter {
  /** Short provider identifier, e.g. "mock", "shopify", "woocommerce". */
  readonly provider: string;
  /** ISO-4217 currency code used for money values where the provider does not supply one. */
  readonly currency: string;

  getOrders(filter?: OrderFilter): Promise<Page<Order>>;
  getOrder(id: string): Promise<Order>;
  fulfillOrder(id: string, input: FulfillOrderInput): Promise<Order>;
  getProducts(filter?: ProductFilter): Promise<Product[]>;
  adjustStock(sku: string, delta: number, reason: string): Promise<Product>;
  getSalesBetween(from: Date, to: Date): Promise<SalesSummary>;
  getTopSellers(from: Date, to: Date, limit: number): Promise<TopSeller[]>;
  getCustomer(query: string): Promise<Customer | null>;
}
