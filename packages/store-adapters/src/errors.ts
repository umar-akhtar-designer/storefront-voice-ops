/**
 * Typed errors that every StoreAdapter maps provider failures onto, so tools and the safety layer
 * can react consistently regardless of the underlying store.
 */

export type StoreErrorCode =
  "NOT_FOUND" | "RATE_LIMITED" | "UNAUTHORIZED" | "UPSTREAM" | "VALIDATION";

export class StoreError extends Error {
  readonly code: StoreErrorCode;

  constructor(code: StoreErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class NotFoundError extends StoreError {
  constructor(message = "Resource not found") {
    super("NOT_FOUND", message);
  }
}

export class RateLimitedError extends StoreError {
  readonly retryAfterMs?: number;

  constructor(message = "Rate limited by the store provider", retryAfterMs?: number) {
    super("RATE_LIMITED", message);
    this.retryAfterMs = retryAfterMs;
  }
}

export class UnauthorizedError extends StoreError {
  constructor(message = "Store provider rejected the credentials") {
    super("UNAUTHORIZED", message);
  }
}

export class UpstreamError extends StoreError {
  constructor(message = "The store provider is unavailable", options?: { cause?: unknown }) {
    super("UPSTREAM", message, options);
  }
}

export class ValidationError extends StoreError {
  constructor(message = "Invalid input") {
    super("VALIDATION", message);
  }
}
