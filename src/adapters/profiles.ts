import {
  type StoreAdapter,
} from "@voice-ops/store-adapters";
import type { Db } from "../db/index.js";
import { logger } from "../logger.js";
import { buildStoreAdapter, type ProfileProvider, type ProfileSettings } from "./factory.js";
import { ManualAdapter } from "./manual.js";

/**
 * Multi-store profiles: one deployment serves several businesses (Shopify, WooCommerce, a custom
 * JSON-API store, a no-website manual store, or the practice mock). The active profile can be
 * switched at runtime without a restart — the adapter slot is rebuilt from the profile row.
 *
 * On first boot the table is seeded from the current environment so the operator's `.env`
 * deployment keeps working unchanged.
 */

export interface StoreProfile {
  id: number;
  name: string;
  provider: ProfileProvider | "manual";
  settings: ProfileSettings;
  active: boolean;
}

interface ProfileRow {
  id: number;
  name: string;
  provider: string;
  settings: string;
  active: number;
}

const VALID_PROVIDERS = ["mock", "manual", "shopify", "woocommerce", "custom"];

export class ProfileManager {
  private readonly db: Db;
  private readonly cache = new Map<string, StoreAdapter>();
  private activeId: number | null = null;

  constructor(db: Db) {
    this.db = db;
  }

  /** Create table + seed from environment on first boot. Idempotent. */
  ensureSeeded(): void {
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS store_profiles (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         name TEXT NOT NULL,
         provider TEXT NOT NULL CHECK (provider IN ('mock','manual','shopify','woocommerce','custom')),
         settings TEXT NOT NULL DEFAULT '{}',
         active INTEGER NOT NULL DEFAULT 0,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
    );
    const count = (
      this.db.prepare("SELECT COUNT(*) AS n FROM store_profiles").get() as { n: number }
    ).n;
    if (count > 0) return;

    const insert = this.db.prepare(
      "INSERT INTO store_profiles (name, provider, settings, active) VALUES (?, ?, ?, ?)",
    );
    const seed = (name: string, provider: string, settings: unknown, active: number) =>
      insert.run(name, provider, JSON.stringify(settings), active);

    // Practice store is always available — it can never fail to build.
    seed("Practice store (pretend data)", "mock", {}, process.env.NODE_ENV !== "test" ? 0 : 1);

    // Tests only ever see the deterministic mock store.
    if (process.env.NODE_ENV === "test") {
      this.db.exec("UPDATE store_profiles SET active = 1 WHERE provider = 'mock'");
      logger.info("profiles: test mode — only the practice store is seeded");
      return;
    }

    let activeSeeded = false;
    if (process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ADMIN_TOKEN) {
      seed("Bazaar Box (Shopify)", "shopify", {
        domain: process.env.SHOPIFY_STORE_DOMAIN,
        token: process.env.SHOPIFY_ADMIN_TOKEN,
        currency: process.env.SHOPIFY_CURRENCY || undefined,
      }, 1);
      activeSeeded = true;
      logger.info("profiles: seeded Bazaar Box (Shopify) from environment");
    }
    if (process.env.CUSTOM_BASE_URL && process.env.CUSTOM_API_KEY) {
      seed("Kapraa.pk (custom website)", "custom", {
        baseUrl: process.env.CUSTOM_BASE_URL,
        apiKey: process.env.CUSTOM_API_KEY,
        currency: process.env.CUSTOM_CURRENCY || undefined,
      }, activeSeeded ? 0 : 1);
      activeSeeded = activeSeeded || true;
      logger.info("profiles: seeded Kapraa.pk (custom) from environment");
    }
    const fallbackActive = activeSeeded
      ? "UPDATE store_profiles SET active = 0 WHERE provider = 'mock'"
      : undefined;
    if (fallbackActive) this.db.exec(fallbackActive);
    logger.info({ profiles: count > 0 ? count : "seeded" }, "profile store ready");
  }

  list(): StoreProfile[] {
    const rows = this.db
      .prepare("SELECT id, name, provider, settings, active FROM store_profiles ORDER BY id ASC")
      .all() as ProfileRow[];
    return rows.map(toProfile);
  }

  get active(): StoreProfile | undefined {
    const row = this.db
      .prepare("SELECT id, name, provider, settings, active FROM store_profiles WHERE active = 1")
      .get() as ProfileRow | undefined;
    return row ? toProfile(row) : undefined;
  }

  get(id: number): StoreProfile | undefined {
    const row = this.db
      .prepare("SELECT id, name, provider, settings, active FROM store_profiles WHERE id = ?")
      .get(id) as ProfileRow | undefined;
    return row ? toProfile(row) : undefined;
  }

  /** Build (and cache) the adapter for a profile. The `manual` provider lives app-side. */
  adapterFor(profile: StoreProfile): StoreAdapter {
    const key = String(profile.id);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const adapter =
      profile.provider === "manual"
        ? new ManualAdapter(this.db, profile.settings.currency || "PKR")
        : buildStoreAdapter(profile.provider as ProfileProvider, profile.settings);
    this.cache.set(key, adapter);
    return adapter;
  }

  currentAdapter(): StoreAdapter {
    const profile = this.active ?? this.ensureSomeActive();
    return this.adapterFor(profile);
  }

  private ensureSomeActive(): StoreProfile {
    this.db.exec("UPDATE store_profiles SET active = 0");
    const first = this.db
      .prepare("SELECT id FROM store_profiles ORDER BY id ASC LIMIT 1")
      .get() as { id: number } | undefined;
    if (!first) throw new Error("No store profiles configured");
    this.db.prepare("UPDATE store_profiles SET active = 1 WHERE id = ?").run(first.id);
    this.activeId = first.id;
    const profile = this.get(first.id);
    if (!profile) throw new Error("Profile vanished during activation");
    return profile;
  }

  /** Switch the active profile. Returns the freshly bound adapter. */
  activate(id: number): { profile: StoreProfile; adapter: StoreAdapter } {
    const profile = this.get(id);
    if (!profile) throw new Error(`Profile ${id} not found`);
    this.db.exec("UPDATE store_profiles SET active = 0");
    this.db.prepare("UPDATE store_profiles SET active = 1 WHERE id = ?").run(id);
    this.activeId = id;
    this.cache.delete(String(id)); // rebuild from possible edited settings
    const adapter = this.adapterFor(profile);
    logger.info({ profileId: id, name: profile.name, provider: profile.provider }, "profile activated");
    return { profile, adapter };
  }

  create(input: { name: string; provider: string; settings: ProfileSettings }): StoreProfile {
    const name = input.name.trim();
    if (!name) throw new Error("A store name is required");
    const provider = input.provider.trim().toLowerCase();
    if (!VALID_PROVIDERS.includes(provider)) {
      throw new Error(`Unknown store type "${provider}"`);
    }
    switch (provider) {
      case "shopify":
        if (!input.settings.domain?.trim()) throw new Error("Shopify domain (xxx.myshopify.com) is required");
        if (!input.settings.token?.trim()) throw new Error("Shopify admin token is required");
        break;
      case "woocommerce":
        if (!input.settings.baseUrl?.trim()) throw new Error("WooCommerce site URL is required");
        if (!input.settings.key?.startsWith("ck_")) throw new Error("WooCommerce consumer key (ck_...) is required");
        if (!input.settings.secret?.startsWith("cs_")) throw new Error("WooCommerce consumer secret (cs_...) is required");
        break;
      case "custom":
        if (!input.settings.baseUrl?.trim()) throw new Error("The store's API URL is required");
        if (!input.settings.apiKey?.trim()) throw new Error("The store's API key is required");
        break;
      default:
        break; // manual + mock need nothing
    }
    // Probe: build the adapter now so connectable profiles fail fast at creation.
    this.adapterFor({
      id: -1,
      name,
      provider: provider as ProfileProvider | "manual",
      settings: input.settings,
      active: false,
    });
    const result = this.db
      .prepare(
        "INSERT INTO store_profiles (name, provider, settings, active) VALUES (?, ?, ?, 0)",
      )
      .run(name, provider, JSON.stringify(input.settings ?? {}));
    const created = this.get(Number(result.lastInsertRowid));
    if (!created) throw new Error("Profile vanished right after creation");
    return created;
  }
}

function toProfile(row: ProfileRow): StoreProfile {
  let settings: ProfileSettings = {};
  try {
    settings = JSON.parse(row.settings) as ProfileSettings;
  } catch {
    // corrupt rows rebuild-safe fall back to empty settings
  }
  return {
    id: row.id,
    name: row.name,
    provider: row.provider as ProfileProvider | "manual",
    settings,
    active: row.active === 1,
  };
}
