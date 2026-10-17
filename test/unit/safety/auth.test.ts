import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { createAuthMiddleware, safeEqual } from "../../../src/safety/auth.js";

const CANONICAL = "https://demo.example/mcp";

interface Outcome {
  status?: number;
  headers: Record<string, string>;
  next: boolean;
  actor?: string;
}

async function callAuth(
  middleware: ReturnType<typeof createAuthMiddleware>,
  authorization?: string,
): Promise<Outcome> {
  const outcome: Outcome = { headers: {}, next: false };
  const locals: Record<string, unknown> = {};
  const req = {
    headers: authorization ? { authorization } : {},
  } as unknown as Request;
  const res = {
    locals,
    status(code: number) {
      outcome.status = code;
      return this;
    },
    json() {
      return this;
    },
    setHeader(name: string, value: string) {
      outcome.headers[name] = value;
      return this;
    },
  } as unknown as Response;
  await middleware(req, res, () => {
    outcome.next = true;
  });
  outcome.actor = locals.actor as string | undefined;
  return outcome;
}

describe("safeEqual", () => {
  it("compares equal strings and rejects different ones", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("createAuthMiddleware", () => {
  it("demo mode with no token lets requests through as the demo actor", async () => {
    const auth = createAuthMiddleware({ mode: "demo", demoToken: "", canonicalUri: CANONICAL });
    const outcome = await callAuth(auth);
    expect(outcome.next).toBe(true);
    expect(outcome.actor).toBe("demo");
  });

  it("demo mode with a token rejects a missing or wrong token", async () => {
    const auth = createAuthMiddleware({
      mode: "demo",
      demoToken: "s3cret",
      canonicalUri: CANONICAL,
    });
    expect((await callAuth(auth)).status).toBe(401);
    expect((await callAuth(auth, "Bearer nope")).status).toBe(401);
    const good = await callAuth(auth, "Bearer s3cret");
    expect(good.next).toBe(true);
    expect(good.actor).toBe("demo");
  });

  it("linked mode returns a 401 challenge with the canonical resource", async () => {
    const auth = createAuthMiddleware({ mode: "linked", canonicalUri: CANONICAL });
    const outcome = await callAuth(auth);
    expect(outcome.status).toBe(401);
    expect(outcome.headers["WWW-Authenticate"]).toContain(`resource="${CANONICAL}"`);
  });

  it("linked mode accepts a token validated by the validator", async () => {
    const validateToken = vi.fn().mockResolvedValue({ subject: "owner@example.com" });
    const auth = createAuthMiddleware({ mode: "linked", canonicalUri: CANONICAL, validateToken });
    const outcome = await callAuth(auth, "Bearer token-123");
    expect(outcome.next).toBe(true);
    expect(outcome.actor).toBe("owner@example.com");
    expect(validateToken).toHaveBeenCalledWith("token-123");
  });

  it("linked mode rejects a token the validator does not accept", async () => {
    const auth = createAuthMiddleware({
      mode: "linked",
      canonicalUri: CANONICAL,
      validateToken: () => null,
    });
    const outcome = await callAuth(auth, "Bearer bad-token");
    expect(outcome.status).toBe(401);
    expect(outcome.headers["WWW-Authenticate"]).toContain("invalid_token");
  });
});
