import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";

/**
 * The demo reset routes are only registered when DEMO_MODE is on, so this file sets the flag and
 * imports the server with a fresh module graph (see `vi.resetModules`).
 */
describe("public demo endpoints", () => {
  let app: Express;

  beforeAll(async () => {
    process.env.DEMO_MODE = "1";
    process.env.DB_PATH = ":memory:";
    vi.resetModules();
    const mod = await import("../../src/server.js");
    app = mod.createApp();
  });

  afterAll(() => {
    delete process.env.DEMO_MODE;
    delete process.env.DB_PATH;
  });

  it("GET /api/demo reports demo mode and provider", async () => {
    const res = await request(app).get("/api/demo");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ demoMode: true, provider: "mock", currency: "PKR" });
  });

  it("POST /api/demo/reset reseeds the store and clears state", async () => {
    const res = await request(app).post("/api/demo/reset");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.clearedPending).toBe("number");
    expect(typeof res.body.clearedAudit).toBe("number");
    expect(typeof res.body.resetAt).toBe("string");
  });
});
