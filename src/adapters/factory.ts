import { config } from "../config.js";
import { createMockAdapter } from "./mock.js";
import type { StoreAdapter } from "./types.js";

/**
 * Build the StoreAdapter selected by STORE_PROVIDER. Shopify and WooCommerce adapters are added in
 * Stage 4; until then those providers fail loudly rather than silently returning mock data.
 */
export function createStoreAdapter(): StoreAdapter {
  switch (config.STORE_PROVIDER) {
    case "mock":
      return createMockAdapter();
    case "shopify":
      throw new Error("ShopifyAdapter is not implemented yet (Stage 4).");
    case "woocommerce":
      throw new Error("WooCommerceAdapter is not implemented yet (Stage 4).");
    default:
      return createMockAdapter();
  }
}
