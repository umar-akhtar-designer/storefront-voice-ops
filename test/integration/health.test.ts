import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/server.js";

const app = createApp();

describe("health endpoints", () => {
  it("GET /healthz returns ok", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.uptimeSeconds).toBe("number");
  });

  it("GET /readyz reports db and store readiness", async () => {
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
    expect(res.body.checks).toEqual({ db: true, store: true });
  });

  it("sets a request id header", async () => {
    const res = await request(app).get("/healthz");
    expect(res.headers["x-request-id"]).toBeTruthy();
  });
});

describe("MCP endpoint", () => {
  it("negotiates protocol 2025-11-25 on initialize", async () => {
    const res = await request(app)
      .post("/mcp")
      .set("Accept", "application/json, text/event-stream")
      .set("Content-Type", "application/json")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "integration-test", version: "1.0.0" },
        },
      });

    expect(res.status).toBe(200);
    const text = res.text ?? "";
    expect(text).toContain("2025-11-25");
    expect(text).toContain("storefront-voice-ops");
  });

  it("rejects GET /mcp with 405", async () => {
    const res = await request(app).get("/mcp").set("Accept", "application/json, text/event-stream");
    expect(res.status).toBe(405);
  });
});
