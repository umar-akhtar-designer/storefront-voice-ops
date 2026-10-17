import { describe, expect, it } from "vitest";
import type { Request, RequestHandler, Response } from "express";
import { originGuard } from "../../../src/safety/origin.js";

interface Recorded {
  status?: number;
  body?: unknown;
  next: boolean;
}

function run(guard: RequestHandler, origin?: string, host = "localhost:3000"): Recorded {
  const record: Recorded = { next: false };
  const req = {
    headers: origin === undefined ? {} : { origin },
    protocol: "http",
    get: (name: string) => (name === "host" ? host : undefined),
  } as unknown as Request;
  const res = {
    status(code: number) {
      record.status = code;
      return this;
    },
    json(body: unknown) {
      record.body = body;
      return this;
    },
  } as unknown as Response;
  guard(req, res, () => {
    record.next = true;
  });
  return record;
}

describe("originGuard", () => {
  it("allows requests with no Origin header (non-browser clients)", () => {
    expect(run(originGuard([])).next).toBe(true);
  });

  it("allows an allow-listed origin", () => {
    const guard = originGuard(["https://demo.example"]);
    expect(run(guard, "https://demo.example").next).toBe(true);
  });

  it("rejects an unknown origin with 403", () => {
    const guard = originGuard(["https://demo.example"]);
    const record = run(guard, "https://evil.example");
    expect(record.next).toBe(false);
    expect(record.status).toBe(403);
    expect(record.body).toMatchObject({ error: { code: -32000 } });
  });

  it("always allows the same origin, even with an empty allow list", () => {
    expect(run(originGuard([]), "http://localhost:3000").next).toBe(true);
  });

  it("allows everything when the list contains *", () => {
    const guard = originGuard(["*"]);
    expect(run(guard, "https://anywhere.example").next).toBe(true);
  });
});
