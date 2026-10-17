import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/server.js";

/**
 * The simulator's POST /api/chat. Only messages that never reach the MCP client are exercised here
 * (greetings resolve without any tool call), because the chat client points at config.PORT rather
 * than the test server's ephemeral port.
 */
describe("GET-free /api/chat smalltalk handling", () => {
  let app: ReturnType<typeof createApp>;
  let httpServer: ReturnType<ReturnType<typeof createApp>["listen"]>;

  beforeAll(async () => {
    app = createApp();
    httpServer = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => httpServer.once("listening", () => resolve()));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  async function chat(message: string) {
    return request(app).post("/api/chat").send({ message });
  }

  it.each(["hello", "Hello!", "SALAM", "salam aleikum", "yo", "help", ""])(
    "gives a capability greeting instead of a briefing for %s",
    async (message) => {
      const res = await chat(message);
      expect(res.status).toBe(200);
      expect(res.body.reply).toMatch(/^Hello! You can ask/);
      expect(res.body.trace).toEqual([]);
      expect(res.body.engine).toBe("offline-router");
    },
  );

  it("does not swallow real orders in a greeting", async () => {
    const res = await chat("hello, ship order 1008");
    expect(res.status).toBe(200);
    expect(res.body.reply).not.toMatch(/^Hello! You can ask/);
  });
});
