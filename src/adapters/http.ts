import {
  NotFoundError,
  RateLimitedError,
  StoreError,
  UnauthorizedError,
  UpstreamError,
} from "./errors.js";

export type FetchLike = typeof fetch;

export interface RequestOptions {
  provider: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  /** Number of retries after the first attempt (429 and 5xx are retried). Default 2. */
  retries?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 2;
const BASE_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 4_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Map a non-OK HTTP response onto the shared StoreError hierarchy. */
export async function mapHttpError(response: Response, provider: string): Promise<StoreError> {
  let detail = "";
  try {
    detail = (await response.text()).slice(0, 200);
  } catch {
    /* body already consumed or unreadable */
  }
  const message = `${provider} returned ${response.status}${detail ? `: ${detail}` : ""}`;
  switch (response.status) {
    case 401:
    case 403:
      return new UnauthorizedError(message);
    case 404:
      return new NotFoundError(message);
    case 429: {
      const retryAfter = Number(response.headers.get("retry-after"));
      const retryAfterMs =
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined;
      return new RateLimitedError(message, retryAfterMs);
    }
    default:
      return response.status >= 500 ? new UpstreamError(message) : new UpstreamError(message);
  }
}

function backoffMs(attempt: number, error: unknown): number {
  const extra = error instanceof RateLimitedError ? (error.retryAfterMs ?? 0) : 0;
  return Math.min(BASE_BACKOFF_MS * 2 ** attempt + extra, MAX_BACKOFF_MS);
}

/**
 * Fetch JSON with a timeout, retry (429/5xx, respecting Retry-After) and consistent error mapping.
 * Every adapter goes through here so upstream behaviour is uniform.
 */
export async function requestJson<T>(
  fetchImpl: FetchLike,
  url: string,
  options: RequestOptions,
): Promise<T> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        method: options.method ?? "GET",
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.status === 429 || response.status >= 500) {
        const error = await mapHttpError(response, options.provider);
        if (attempt < retries) {
          await sleep(backoffMs(attempt, error));
          lastError = error;
          continue;
        }
        throw error;
      }
      if (!response.ok) throw await mapHttpError(response, options.provider);
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timer);
      // A typed StoreError from a 4xx is final; anything network/timeout is retryable.
      if (error instanceof StoreError && !(error instanceof RateLimitedError)) throw error;
      lastError = error;
      if (attempt < retries) {
        await sleep(backoffMs(attempt, error));
        continue;
      }
      if (error instanceof StoreError) throw error;
      throw new UpstreamError(`${options.provider} request failed: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }
  throw lastError;
}

/** Minimal GraphQL result shape used by the Shopify adapter. */
export interface GraphQlResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

/** Assert a GraphQL response has no errors, and return its data. */
export function assertGraphQl<T>(response: GraphQlResponse<T>, provider: string): T {
  if (response.errors && response.errors.length > 0) {
    const message = response.errors.map((e) => e.message).join("; ");
    throw new UpstreamError(`${provider} GraphQL error: ${message}`);
  }
  if (!response.data) throw new UpstreamError(`${provider} returned no data`);
  return response.data;
}
