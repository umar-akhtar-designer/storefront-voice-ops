import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** A successful tool result with a spoken `text` and optional structured payload. */
export function ok(text: string, structured?: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text }],
    ...(structured ? { structuredContent: structured } : {}),
  };
}

/** A failed tool result. Spoken text stays friendly; the error flag tells the client it failed. */
export function fail(text: string, structured?: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text }],
    isError: true,
    ...(structured ? { structuredContent: structured } : {}),
  };
}

/**
 * Map an adapter error onto a friendly spoken message. Real provider details are logged, not spoken.
 */
export function spokenError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  switch (code) {
    case "NOT_FOUND":
      return "I couldn't find that. Please check the details and try again.";
    case "RATE_LIMITED":
      return "The store is rate limiting me right now. Please try again in a moment.";
    case "UNAUTHORIZED":
      return "The store rejected my credentials, so I can't read that right now.";
    case "UPSTREAM":
      return "The store is not responding. Please try again shortly.";
    case "VALIDATION":
      return (error as Error).message;
    default:
      return "Something went wrong handling that request.";
  }
}
