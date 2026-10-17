import { describe, expect, it } from "vitest";
import {
  NotFoundError,
  RateLimitedError,
  UnauthorizedError,
  UpstreamError,
  ValidationError,
} from "../../../src/adapters/errors.js";

describe("typed store errors", () => {
  it("exposes stable codes and names", () => {
    expect(new NotFoundError().code).toBe("NOT_FOUND");
    expect(new NotFoundError().name).toBe("NotFoundError");
    expect(new RateLimitedError("slow down", 500).retryAfterMs).toBe(500);
    expect(new UnauthorizedError().code).toBe("UNAUTHORIZED");
    expect(new UpstreamError().code).toBe("UPSTREAM");
    expect(new ValidationError().code).toBe("VALIDATION");
  });

  it("all extend Error so they can be caught generically", () => {
    expect(new NotFoundError()).toBeInstanceOf(Error);
    expect(new UpstreamError("boom", { cause: new Error("root") }).cause).toBeInstanceOf(Error);
  });
});
