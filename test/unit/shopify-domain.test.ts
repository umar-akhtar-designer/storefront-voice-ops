import { describe, expect, it, vi } from "vitest";
import { resolveShopifyDomain } from "../../src/adapters/profiles.js";

function fakeFetch(html: string, ok = true) {
  return (async () =>
    new Response(ok ? html : "nope", { status: ok ? 200 : 404 })) as unknown as typeof fetch;
}

const HOMEPAGE = `<script>window.Shopify = {}; Shopify.shop = "acme-store.myshopify.com";</script>`;

describe("resolveShopifyDomain", () => {
  it("accepts a bare admin domain", async () => {
    await expect(resolveShopifyDomain("acme.myshopify.com")).resolves.toBe("acme.myshopify.com");
  });

  it("strips the scheme, /admin paths and trailing slashes", async () => {
    await expect(resolveShopifyDomain("https://Acme.myshopify.com/admin/")).resolves.toBe(
      "acme.myshopify.com",
    );
  });

  it("discovers the admin domain from a pasted public storefront URL", async () => {
    const fetchImpl = fakeFetch(HOMEPAGE);
    const spy = vi.fn(fetchImpl);
    await expect(resolveShopifyDomain("https://www.bazaarbox.pk", spy)).resolves.toBe(
      "acme-store.myshopify.com",
    );
  });

  it("throws a friendly error when nothing is pasted", async () => {
    await expect(resolveShopifyDomain("   ")).rejects.toThrow(/Shopify domain is required/);
  });

  it("throws a helpful error when the site is not Shopify-hosted", async () => {
    await expect(resolveShopifyDomain("example.org", fakeFetch("<html>plain site</html>"))).rejects.toThrow(
      /not a Shopify admin domain/,
    );
  });
});
