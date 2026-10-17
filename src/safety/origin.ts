import type { RequestHandler } from "express";

/**
 * DNS-rebinding protection: reject browser requests whose Origin header is not allow-listed.
 * Non-browser clients (Alexa+, the MCP Inspector, server-to-server calls) send no Origin and pass.
 */
export function originGuard(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins.map((o) => o.trim()).filter(Boolean));
  const allowAll = allowed.has("*");

  return (req, res, next) => {
    const origin = req.headers.origin;
    if (!origin || allowAll || allowed.has(origin)) {
      next();
      return;
    }
    // Same-origin requests are always safe, regardless of the allow list.
    const sameOrigin = origin === `${req.protocol}://${req.get("host")}`;
    if (sameOrigin) {
      next();
      return;
    }
    res.status(403).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Origin not allowed." },
      id: null,
    });
  };
}
