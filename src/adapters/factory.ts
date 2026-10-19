import { config } from "../config.js";
import {
  createCustomAdapter,
  createMockAdapter,
  createShopifyAdapter,
  createWooCommerceAdapter,
  type StoreAdapter,
} from "@voice-ops/store-adapters";

/**
 * Connection settings for one store profile. Persisted as JSON inside `store_profiles`.
 * Each provider validates its own required fields when the adapter is built, so an incomplete
 * profile fails loudly instead of quietly serving someone else's data.
 */
export interface ProfileSettings {
  /** Shopify */
  domain?: string;
  token?: string;
  apiVersion?: string;
  /** WooCommerce */
  baseUrl?: string;
  key?: string;
  secret?: string;
  /** Custom JSON API (docs/custom-store-php-kit) */
  apiKey?: string;
  /** Common */
  currency?: string;
}

export type ProfileProvider = "mock" | "shopify" | "woocommerce" | "custom";

/**
 * Build a StoreAdapter from a profile (name → provider + settings). This is the single place that
 * knows how settings map to adapters, so the HTTP app, profiles and tests share one code path.
 */
export function buildStoreAdapter(
  provider: ProfileProvider,
  settings: ProfileSettings,
): StoreAdapter {
  switch (provider) {
    case "shopify":
      return createShopifyAdapter({
        domain: settings.domain ?? "",
        token: settings.token ?? "",
        apiVersion: settings.apiVersion || config.SHOPIFY_API_VERSION,
        currency: settings.currency || undefined,
      });
    case "woocommerce":
      return createWooCommerceAdapter({
        baseUrl: settings.baseUrl ?? "",
        key: settings.key ?? "",
        secret: settings.secret ?? "",
      });
    case "custom":
      return createCustomAdapter({
        baseUrl: settings.baseUrl ?? "",
        apiKey: settings.apiKey ?? "",
        currency: settings.currency || undefined,
      });
    case "mock":
    default:
      return createMockAdapter();
  }
}

/**
 * Build the StoreAdapter selected by STORE_PROVIDER. Kept for boot-time compatibility with tests
 * and tooling that never touch the profiles table.
 */
export function createStoreAdapter(): StoreAdapter {
  const settings: ProfileSettings = {
    domain: config.SHOPIFY_STORE_DOMAIN,
    token: config.SHOPIFY_ADMIN_TOKEN,
    apiVersion: config.SHOPIFY_API_VERSION,
    currency: config.SHOPIFY_CURRENCY || undefined,
    baseUrl: config.WOO_BASE_URL || undefined,
    key: config.WOO_KEY || undefined,
    secret: config.WOO_SECRET || undefined,
    apiKey: config.CUSTOM_API_KEY || undefined,
  };
  if (config.STORE_PROVIDER === "custom") settings.baseUrl = config.CUSTOM_BASE_URL;
  if (config.STORE_PROVIDER === "woocommerce" && !settings.baseUrl) {
    settings.baseUrl = config.WOO_BASE_URL;
  }
  return buildStoreAdapter(config.STORE_PROVIDER as ProfileProvider, settings);
}
