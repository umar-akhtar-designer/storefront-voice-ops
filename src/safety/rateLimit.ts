import type { Request, RequestHandler } from "express";

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Key function; defaults to the bearer token if present, else the client IP. */
  key?: (req: Request) => string;
  now?: () => number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimiter extends RequestHandler {
  /** Clear all buckets (used by tests). */
  reset(): void;
}

/**
 * In-memory fixed-window rate limiter keyed per token/IP. Suitable for a single instance; a
 * multi-instance deployment should swap this for a shared store (for example ElastiCache/Redis or
 * DynamoDB) behind the same interface.
 */
export function rateLimiter(options: RateLimitOptions): RateLimiter {
  const buckets = new Map<string, Bucket>();
  const now = options.now ?? Date.now;

  const keyFor = (req: Request): string => {
    if (options.key) return options.key(req);
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) return `token:${auth.slice(7)}`;
    return `ip:${req.ip ?? "unknown"}`;
  };

  const handler: RequestHandler = (req, res, next) => {
    const key = keyFor(req);
    const timestamp = now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= timestamp) {
      bucket = { count: 0, resetAt: timestamp + options.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    const remaining = Math.max(options.max - bucket.count, 0);
    res.setHeader("X-RateLimit-Limit", String(options.max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > options.max) {
      const retryAfter = Math.max(Math.ceil((bucket.resetAt - timestamp) / 1000), 1);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Too many requests. Please slow down." },
        id: null,
      });
      return;
    }
    next();
  };

  const limiter = handler as RateLimiter;
  limiter.reset = () => buckets.clear();
  return limiter;
}
