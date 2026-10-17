/**
 * Runnable skeleton for the custom-website side of Voice Ops.
 *
 * Satisfies every endpoint and JSON shape in docs/store-connection-guide.md
 * (section C). It keeps data in memory so you can `node samples/...` it
 * immediately; swap the in-memory maps for real database queries.
 *
 * Run:  CUSTOM_API_KEY=test123 node custom-store-sample.cjs   (defaults to :8090)
 * Try:  curl -H "x-api-key: test123" localhost:8090/orders?status=pending
 *       curl -X POST -H "x-api-key: test123" -H "content-type: application/json" \
 *            -d '{"tracking":"TCS-77654321","carrier":"TCS"}' localhost:8090/orders/1002/fulfill
 *
 * Note: this is sample code for a store developer — it is not part of the
 * Voice Ops build, and no Voice Ops test imports it.
 */
"use strict";

const http = require("node:http");
const { URL } = require("node:url");

const KEY = process.env.CUSTOM_API_KEY || "test123";
const CURRENCY = "PKR";

/* ---------------------------------------------------------------- data ---
 * Replace these maps with your real database tables / queries.
 */
const orders = new Map([
  [
    "1002",
    {
      id: "1002",
      createdAt: "2026-10-15T09:30:00Z",
      status: "pending",
      total: { amount: 2750.0, currency: CURRENCY },
      customerName: "Umar Akhtar",
      customerPhone: "0300-1234567",
      customerEmail: "umar@example.com",
      trackingNumber: null,
      cancelledReason: null,
      items: [
        {
          sku: "LT-TABLE-FOLD",
          name: "Foldable Laptop Bed Table",
          quantity: 1,
          unitPrice: { amount: 2750.0, currency: CURRENCY },
        },
      ],
    },
  ],
  [
    "1003",
    {
      id: "1003",
      createdAt: "2026-10-15T12:00:00Z",
      status: "pending",
      total: { amount: 900.0, currency: CURRENCY },
      customerName: "Ayesha Khan",
      customerPhone: "0321-9876543",
      customerEmail: "ayesha@example.com",
      trackingNumber: null,
      cancelledReason: null,
      items: [
        {
          sku: "SOAP-DISP-2IN1",
          name: "2-in-1 Kitchen Sink Soap Dispenser",
          quantity: 1,
          unitPrice: { amount: 699.0, currency: CURRENCY },
        },
      ],
    },
  ],
]);

const products = new Map([
  ["LT-TABLE-FOLD", { sku: "LT-TABLE-FOLD", name: "Foldable Laptop Bed Table", stock: 3, price: { amount: 2750.0, currency: CURRENCY } }],
  ["SOAP-DISP-2IN1", { sku: "SOAP-DISP-2IN1", name: "2-in-1 Kitchen Sink Soap Dispenser", stock: 10, price: { amount: 699.0, currency: CURRENCY } }],
  ["COMB-OIL-ORG", { sku: "COMB-OIL-ORG", name: "Hair Oil Applicator Comb (Orange)", stock: 5, price: { amount: 1599.0, currency: CURRENCY } }],
]);

/* ------------------------------------------------------------- helpers --- */
const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) reject(new Error("body too large"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });

/* --------------------------------------------------------------- routes -- */
async function route(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean); // e.g. ["orders","1002","fulfill"]

  // GET /orders?status=pending&limit=20
  if (parts[0] === "orders" && parts.length === 1 && req.method === "GET") {
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 20, 100));
    const status = url.searchParams.get("status");
    const items = [...orders.values()]
      .filter((order) => !status || order.status === status)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit);
    return json(res, 200, { items });
  }

  // GET /orders/{id}
  if (parts[0] === "orders" && parts.length === 2 && req.method === "GET") {
    const order = orders.get(parts[1]);
    if (!order) return json(res, 404, { error: `Order ${parts[1]} not found` });
    return json(res, 200, order);
  }

  // POST /orders/{id}/fulfill
  if (parts[0] === "orders" && parts[2] === "fulfill" && req.method === "POST") {
    const order = orders.get(parts[1]);
    if (!order) return json(res, 404, { error: `Order ${parts[1]} not found` });
    if (order.status === "cancelled") return json(res, 409, { error: "Cannot fulfil a cancelled order" });
    const body = await readBody(req);
    order.status = "shipped";
    order.trackingNumber = String(body.tracking || `MANUAL-${Date.now()}`);
    return json(res, 200, order);
  }

  // POST /orders/{id}/cancel
  if (parts[0] === "orders" && parts[2] === "cancel" && req.method === "POST") {
    const order = orders.get(parts[1]);
    if (!order) return json(res, 404, { error: `Order ${parts[1]} not found` });
    if (order.status === "shipped") return json(res, 409, { error: "Shipped order cannot be cancelled" });
    const body = await readBody(req);
    order.status = "cancelled";
    order.cancelledReason = String(body.reason || "No reason given");
    return json(res, 200, order);
  }

  // GET /products?lowStockBelow=10
  if (parts[0] === "products" && parts.length === 1 && req.method === "GET") {
    const below = url.searchParams.get("lowStockBelow");
    const items = [...products.values()].filter(
      (p) => below === null || p.stock <= Number(below),
    );
    return json(res, 200, { items });
  }

  // POST /products/{sku}/restock
  if (parts[0] === "products" && parts[2] === "restock" && req.method === "POST") {
    const product = products.get(parts[1]);
    if (!product) return json(res, 404, { error: `No product with SKU ${parts[1]}` });
    const body = await readBody(req);
    const quantity = Number(body.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
      return json(res, 400, { error: "quantity must be a non-negative number" });
    }
    product.stock = body.mode === "add" ? product.stock + quantity : quantity;
    return json(res, 200, product);
  }

  // GET /sales/today (optional power-up for the morning briefing)
  if (parts[0] === "sales" && parts[1] === "today" && req.method === "GET") {
    const today = new Date().toISOString().slice(0, 10);
    const todays = [...orders.values()].filter((o) => String(o.createdAt).slice(0, 10) === today);
    const revenue = todays.reduce((sum, o) => sum + o.total.amount, 0);
    return json(res, 200, {
      date: today,
      revenue: { amount: revenue, currency: CURRENCY },
      orders: todays.length,
      topSellers: [],
    });
  }

  return json(res, 404, { error: "Unknown endpoint" });
}

/* --------------------------------------------------------------- server -- */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.headers["x-api-key"] !== KEY) {
    return json(res, 401, { error: "Missing or wrong x-api-key header" });
  }
  Promise.resolve(route(req, res, url)).catch((error) =>
    json(res, 500, { error: String(error.message || error) }),
  );
});

const PORT = Number(process.env.PORT) || 8090;
server.listen(PORT, () => {
  console.log(`Voice Ops sample store API on http://localhost:${PORT}`);
});
