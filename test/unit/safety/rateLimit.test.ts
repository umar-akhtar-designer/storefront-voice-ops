import { describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import { rateLimiter } from "../../../src/safety/rateLimit.js";

interface Hit {
  next: boolean;
  status?: number;
  headers: Record<string, string>;
}

function makeClock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

function hit(limiter: ReturnType<typeof rateLimiter>, key: { ip?: string; token?: string }): Hit {
  const record: Hit = { next: false, headers: {} };
  const req = {
    headers: key.token ? { authorization: `Bearer ${key.token}` } : {},
    ip: key.ip ?? "127.0.0.1",
  } as unknown as Request;
  const res = {
    status(code: number) {
      record.status = code;
      return this;
    },
    json() {
      return this;
    },
    setHeader(name: string, value: string) {
      record.headers[name] = value;
      return this;
    },
  } as unknown as Response;
  limiter(req, res, () => {
    record.next = true;
  });
  return record;
}

describe("rateLimiter", () => {
  it("allows requests up to the limit, then returns 429 with Retry-After", () => {
    const limiter = rateLimiter({ windowMs: 60_000, max: 3, now: makeClock().now });

    expect(hit(limiter, { ip: "1.1.1.1" }).next).toBe(true);
    expect(hit(limiter, { ip: "1.1.1.1" }).next).toBe(true);
    expect(hit(limiter, { ip: "1.1.1.1" }).next).toBe(true);

    const blocked = hit(limiter, { ip: "1.1.1.1" });
    expect(blocked.next).toBe(false);
    expect(blocked.status).toBe(429);
    expect(blocked.headers["Retry-After"]).toBe("60");
    expect(blocked.headers["X-RateLimit-Remaining"]).toBe("0");
  });

  it("keys buckets per token when a bearer token is present", () => {
    const limiter = rateLimiter({ windowMs: 60_000, max: 1, now: makeClock().now });
    expect(hit(limiter, { token: "a" }).next).toBe(true);
    expect(hit(limiter, { token: "a" }).next).toBe(false);
    expect(hit(limiter, { token: "b" }).next).toBe(true);
  });

  it("resets the bucket after the window passes", () => {
    const clock = makeClock();
    const limiter = rateLimiter({ windowMs: 1000, max: 1, now: clock.now });
    expect(hit(limiter, { ip: "9.9.9.9" }).next).toBe(true);
    expect(hit(limiter, { ip: "9.9.9.9" }).next).toBe(false);
    clock.advance(1001);
    expect(hit(limiter, { ip: "9.9.9.9" }).next).toBe(true);
  });

  it("can be reset for tests", () => {
    const limiter = rateLimiter({ windowMs: 60_000, max: 1, now: makeClock().now });
    expect(hit(limiter, { ip: "5.5.5.5" }).next).toBe(true);
    expect(hit(limiter, { ip: "5.5.5.5" }).next).toBe(false);
    limiter.reset();
    expect(hit(limiter, { ip: "5.5.5.5" }).next).toBe(true);
  });
});
