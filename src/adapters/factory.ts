import { config } from "../config.js";
import { createMockAdapter } from "./mock.js";
import { createShopifyAdapter } from "./shopify.js";
import type { StoreAdapter } from "./types.js";
import { createWooCommerceAdapter } from "./woocommerce.js";

/**
 * Build the StoreAdapter selected by STORE_PROVIDER. Unknown or unconfigured providers fail loudly
 * rather than silently returning mock data.
 */
export function createStoreAdapter(): StoreAdapter {
  switch (config.STORE_PROVIDER) {
    case "shopify":
      return createShopifyAdapter();
    case "woocommerce":
      return createWooCommerceAdapter();
    case "mock":
    default:
      return createMockAdapter();
  }
}
