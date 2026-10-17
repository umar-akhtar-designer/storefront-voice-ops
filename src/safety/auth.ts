import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

export type AuthMode = "demo" | "linked";

export interface TokenSubject {
  subject: string;
}

/** Validates an OAuth access token and returns its subject, or null when invalid. */
export type TokenValidator = (token: string) => TokenSubject | null | Promise<TokenSubject | null>;

export interface AuthOptions {
  mode: AuthMode;
  /** Bearer token required in demo mode. Empty string means the demo endpoint is open. */
  demoToken?: string;
  /** Canonical MCP URI, sent as the OAuth `resource` value in WWW-Authenticate. */
  canonicalUri: string;
  /** Required in linked mode. */
  validateToken?: TokenValidator;
}

/** Constant-time string comparison that is safe when lengths differ. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compare against itself to keep timing stable, then fail.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function challengeHeader(canonicalUri: string, message: string): string {
  // Alexa+ expects a `resource` value equal to the MCP server canonical URI.
  return `Bearer realm="storefront-voice-ops", resource="${canonicalUri}", error="invalid_token", error_description="${message}"`;
}

/**
 * Authentication middleware for /mcp.
 * - demo mode: an optional shared bearer token; read tools are otherwise open.
 * - linked mode: an OAuth 2.1 access token validated against MCP_CANONICAL_URI (the resource).
 */
export function createAuthMiddleware(options: AuthOptions): RequestHandler {
  return async (req, res, next) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

    if (options.mode === "demo") {
      if (!options.demoToken) {
        res.locals.actor = "demo";
        next();
        return;
      }
      if (!token || !safeEqual(token, options.demoToken)) {
        res.setHeader(
          "WWW-Authenticate",
          challengeHeader(options.canonicalUri, "demo token required"),
        );
        res.status(401).json({
          jsonrpc: "2.0",
          error: { code: -32001, message: "Unauthorized." },
          id: null,
        });
        return;
      }
      res.locals.actor = "demo";
      next();
      return;
    }

    // linked mode
    if (!token) {
      res.setHeader(
        "WWW-Authenticate",
        challengeHeader(options.canonicalUri, "authentication required"),
      );
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Authentication required." },
        id: null,
      });
      return;
    }

    const validator = options.validateToken;
    const subject = validator ? await validator(token) : null;
    if (!subject) {
      res.setHeader(
        "WWW-Authenticate",
        challengeHeader(options.canonicalUri, "invalid access token"),
      );
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Invalid access token." },
        id: null,
      });
      return;
    }
    res.locals.actor = subject.subject;
    next();
  };
}
