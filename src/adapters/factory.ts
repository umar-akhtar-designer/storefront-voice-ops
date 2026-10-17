import { config } from "../config.js";
import {
  createMockAdapter,
  createShopifyAdapter,
  createWooCommerceAdapter,
  type StoreAdapter,
} from "@voice-ops/store-adapters";

/**
 * Build the StoreAdapter selected by STORE_PROVIDER. Unknown or unconfigured providers fail loudly
 * rather than silently returning mock data. The adapters themselves live in the reusable
 * `@voice-ops/store-adapters` workspace package (see `packages/store-adapters/`).
 */
export function createStoreAdapter(): StoreAdapter {
  switch (config.STORE_PROVIDER) {
    case "shopify":
      return createShopifyAdapter({
        domain: config.SHOPIFY_STORE_DOMAIN,
        token: config.SHOPIFY_ADMIN_TOKEN,
        apiVersion: config.SHOPIFY_API_VERSION,
      });
    case "woocommerce":
      return createWooCommerceAdapter({
        baseUrl: config.WOO_BASE_URL,
        key: config.WOO_KEY,
        secret: config.WOO_SECRET,
      });
    case "mock":
    default:
      return createMockAdapter();
  }
}
