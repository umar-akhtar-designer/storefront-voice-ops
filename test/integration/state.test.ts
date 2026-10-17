import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/server.js";

const app = createApp();

describe("GET /api/state", () => {
  it("returns a store snapshot for the simulator", async () => {
    const res = await request(app).get("/api/state");
    expect(res.status).toBe(200);
    expect(res.body.provider).toBe("mock");
    expect(res.body.currency).toBe("PKR");
    expect(Array.isArray(res.body.lowStock)).toBe(true);
    expect(typeof res.body.pendingOrders.total).toBe("number");
    expect(Array.isArray(res.body.pendingOrders.items)).toBe(true);
    expect(Array.isArray(res.body.awaitingConfirmation)).toBe(true);
    expect(Array.isArray(res.body.audit)).toBe(true);
  });
});
