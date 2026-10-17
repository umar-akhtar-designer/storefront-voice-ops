export {
  defineAdapterContract,
  type AdapterContractOptions,
  type AdapterFactory,
} from "./contract.js";
export * from "./errors.js";
export {
  CustomAdapter,
  createCustomAdapter,
  mapCustomOrder,
  mapCustomProduct,
  mapStatus as mapCustomStatus,
  type CustomAdapterOptions,
  type CustomOrderNode,
  type CustomProductNode,
} from "./custom.js";
export {
  ShopifyAdapter,
  DEFAULT_REORDER_POINT,
  createShopifyAdapter,
  gidToId,
  toGid,
  mapShopifyOrder,
  mapShopifyProduct,
  mapShopifyCustomer,
  shopifyOrderStatus,
  type ShopifyAdapterOptions,
  type ShopifyCustomerNode,
  type ShopifyOrderNode,
  type ShopifyVariantNode,
} from "./shopify.js";
export { MockAdapter, createMockAdapter, type MockAdapterOptions } from "./mock.js";
export * from "./types.js";
export {
  WooCommerceAdapter,
  WOO_STATUSES,
  createWooCommerceAdapter,
  mapWooOrder,
  mapWooProduct,
  mapWooCustomer,
  wooOrderStatus,
  type WooCommerceAdapterOptions,
  type WooCustomerNode,
  type WooOrderNode,
  type WooProductNode,
} from "./woocommerce.js";
