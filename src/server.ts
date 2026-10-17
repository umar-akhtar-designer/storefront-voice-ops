import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { buildServer, SERVER_NAME, SERVER_VERSION } from "./mcp/buildServer.js";
import type { ServerDeps } from "./mcp/context.js";
import { bedrock, bedrockEnabled, MODEL_ID } from "./bedrock.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { getDb, isDbReady } from "./db/index.js";
import { AuditRepository, PendingActionRepository } from "./db/repositories.js";
import { AuditLogger } from "./safety/audit.js";
import { ConfirmationService } from "./safety/confirm.js";
import { createAuthMiddleware } from "./safety/auth.js";
import { originGuard } from "./safety/origin.js";
import { rateLimiter } from "./safety/rateLimit.js";
import { createStoreAdapter } from "./adapters/factory.js";
import type { StoreAdapter } from "@voice-ops/store-adapters";
import { createAiService } from "./ai/index.js";
import type { AiService } from "./ai/types.js";

const publicDir = path.resolve(process.cwd(), "public");

export interface Services {
  adapter: StoreAdapter;
  confirm: ConfirmationService;
  audit: AuditLogger;
  ai: AiService;
}

let services: Services | undefined;

/**
 * Process-wide services shared by the HTTP app, the MCP sessions and the simulator's own MCP
 * client, so a confirmation raised in one place is visible everywhere.
 */
export function getServices(): Services {
  if (!services) {
    const db = getDb();
    const audit = new AuditLogger(new AuditRepository(db));
    const confirm = new ConfirmationService(new PendingActionRepository(db), audit, {
      ttlSeconds: config.CONFIRM_TTL_SECONDS,
    });
    services = { adapter: createStoreAdapter(), confirm, audit, ai: createAiService() };
  }
  return services;
}

function baseDeps(current: Services): ServerDeps {
  return {
    adapter: current.adapter,
    confirm: current.confirm,
    audit: current.audit,
    ai: current.ai,
    now: () => new Date(),
    canonicalUri: config.MCP_CANONICAL_URI,
  };
}

function defaultOrigins(): string[] {
  const defaults = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);
  try {
    defaults.add(new URL(config.MCP_CANONICAL_URI).origin);
  } catch {
    // A malformed MCP_CANONICAL_URI simply does not contribute an origin.
  }
  return [...defaults];
}

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

const isMain =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

export function createApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: config.REQUEST_BODY_LIMIT }));

  // Request id + structured access logging.
  app.use((req, res, next) => {
    const requestId = (req.headers["x-request-id"] as string) ?? randomUUID();
    res.setHeader("x-request-id", requestId);
    const started = Date.now();
    res.on("finish", () => {
      logger.info(
        {
          requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Date.now() - started,
        },
        "request",
      );
    });
    next();
  });

  app.use(express.static(publicDir));

  // ---- Health checks ----
  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", uptimeSeconds: Math.round(process.uptime()) });
  });

  app.get("/readyz", async (_req, res) => {
    const checks: Record<string, boolean> = { db: false, store: false };
    try {
      checks.db = isDbReady();
    } catch (error) {
      logger.warn({ err: error }, "readiness: db check failed");
    }
    try {
      await getServices().adapter.getProducts();
      checks.store = true;
    } catch (error) {
      logger.warn({ err: error }, "readiness: store check failed");
    }
    const ready = checks.db && checks.store;
    res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not-ready", checks });
  });

  // ---- Safety middleware ----
  const allowedOrigins =
    config.allowedOrigins.length > 0 ? config.allowedOrigins : defaultOrigins();
  if (config.isProduction && config.allowedOrigins.length === 0) {
    logger.warn(
      { allowedOrigins },
      "ALLOWED_ORIGINS is unset in production; falling back to localhost origins",
    );
  }
  const guardOrigin = originGuard(allowedOrigins);
  const limiter = rateLimiter({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max: config.RATE_LIMIT_MAX,
  });
  const auth = createAuthMiddleware({
    mode: config.AUTH_MODE,
    demoToken: config.MCP_AUTH_TOKEN,
    canonicalUri: config.MCP_CANONICAL_URI,
  });

  const sessions = new Map<string, Session>();

  const notAllowed = (_req: express.Request, res: express.Response) =>
    res
      .status(405)
      .json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });

  function sessionFrom(req: express.Request, res: express.Response): Session | undefined {
    const header = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(header) ? header[0] : header;
    if (!sessionId) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: no MCP session id provided." },
        id: null,
      });
      return undefined;
    }
    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Session not found. Please initialize again." },
        id: null,
      });
      return undefined;
    }
    return session;
  }

  app.use("/mcp", guardOrigin, limiter, auth);

  // Stateful Streamable HTTP: one transport + server per session, so confirmation state that is
  // keyed by session id survives across requests (ADR-0005).
  app.post("/mcp", async (req, res) => {
    try {
      const header = req.headers["mcp-session-id"];
      const existingId = Array.isArray(header) ? header[0] : header;

      if (existingId) {
        const session = sessionFrom(req, res);
        if (!session) return;
        await session.transport.handleRequest(req, res, req.body);
        return;
      }

      if (!isInitializeRequest(req.body)) {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: initialize required." },
          id: null,
        });
        return;
      }

      const actor = String(res.locals.actor ?? "unknown");
      const sessionDeps: ServerDeps = { ...baseDeps(getServices()), sessionActor: actor };
      const server = buildServer(sessionDeps);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          sessionDeps.sessionId = sessionId;
          sessions.set(sessionId, { transport, server });
        },
      });
      transport.onclose = () => {
        const id = transport.sessionId;
        if (!id) return;
        const session = sessions.get(id);
        sessions.delete(id);
        void session?.server.close().catch(() => undefined);
      };
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error({ err: error }, "mcp POST failed");
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error." },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", async (req, res) => {
    const session = sessionFrom(req, res);
    if (!session) return;
    try {
      await session.transport.handleRequest(req, res);
    } catch (error) {
      logger.error({ err: error }, "mcp GET failed");
      if (!res.headersSent) res.status(500).end();
    }
  });

  app.delete("/mcp", async (req, res) => {
    const session = sessionFrom(req, res);
    if (!session) return;
    try {
      await session.transport.handleRequest(req, res);
    } catch (error) {
      logger.error({ err: error }, "mcp DELETE failed");
      if (!res.headersSent) res.status(500).end();
    }
  });

  app.all("/mcp", notAllowed);

  // ---- Simulator agent: talks to this server over the real protocol ----
  const mcpUrl = `http://127.0.0.1:${config.PORT}/mcp`;
  let chatClient: Client | undefined;
  let queue: Promise<unknown> = Promise.resolve();

  async function connectChatClient(): Promise<Client> {
    const client = new Client({ name: "alexa-plus-simulator", version: "1.0.0" });
    const headers = config.MCP_AUTH_TOKEN
      ? { Authorization: `Bearer ${config.MCP_AUTH_TOKEN}` }
      : undefined;
    await client.connect(
      new StreamableHTTPClientTransport(new URL(mcpUrl), {
        ...(headers ? { requestInit: { headers } } : {}),
      }),
    );
    return client;
  }

  async function getChatClient(): Promise<Client> {
    if (chatClient) return chatClient;
    chatClient = await connectChatClient();
    return chatClient;
  }

  async function resetChatClient(): Promise<void> {
    const client = chatClient;
    chatClient = undefined;
    if (!client) return;
    try {
      await client.close();
    } catch (error) {
      logger.debug({ err: error }, "chat client close failed");
    }
  }

  const GREETING_RE =
    /^(hi+|hello|hey|salam( aleikum| alikum)?|aoa|good (morning|afternoon|evening)|yo|help|what can (i|you) do)[.! ]*$/;

  function keywordPlan(q: string): { name: string; args: Record<string, unknown> } {
    const s = q.trim().toLowerCase();
    const id = s.match(/\b(1\d{3})\b/)?.[1];
    const digits = [...s.matchAll(/\b(\d{4,8})\b/g)];
    const code = digits.at(-1)?.[1];
    const affirm = /^(yes|yep|yeah|yup|confirm|do it|proceed|go ahead|ok|okay|sure|right)\b/.test(
      s,
    );
    const deny = /^(no|nope|cancel|stop|don'?t|never mind|nevermind|abort)\b/.test(s);

    if (affirm) return { name: "confirm_action", args: code ? { code } : {} };
    if (deny) return { name: "cancel_action", args: {} };
    if (/(waiting|pending).*(confirm|approval)|what.*awaiting/.test(s))
      return { name: "list_pending_actions", args: {} };
    if (/audit|what (did|have) (you|i) (do|change|ship|cancel)/.test(s))
      return { name: "get_audit_log", args: {} };
    if (/forecast|what should i (order|restock)|restock plan|how long (until|till)/.test(s))
      return { name: "forecast_restock", args: {} };
    if (/(weekly report|this week|last 7|seven days|week in review)/.test(s))
      return { name: "get_weekly_report", args: {} };
    if (/top (seller|selling)|best (seller|selling)/.test(s))
      return { name: "get_top_sellers", args: { period: "week" } };
    if (/cancel.*order/.test(s) && id)
      return { name: "cancel_order", args: { orderId: Number(id) } };
    if (/(ship|dispatch|send out).*(order|parcel|package)/.test(s) && id)
      return { name: "mark_order_shipped", args: { orderId: Number(id) } };
    if (/restock|reorder|supplier/.test(s)) {
      // The simulator's restock chips send the SKU explicitly; casual speech falls back to the
      // most-recently-low product.
      const sku = s.match(/\b[a-z]{2,5}-[a-z0-9-]{1,9}\b/i)?.[1]?.toUpperCase();
      return {
        name: "draft_restock_message",
        args: {
          sku: sku ?? (/cap/.test(s) ? "CAP-NVY" : /hood/.test(s) ? "HOOD-GRY-L" : "TEE-BLK-M"),
        },
      };
    }
    if (/\border\b.*\d|order #?\d|\b(1\d{3})\b/.test(s) && id)
      return { name: "get_order", args: { orderId: Number(id) } };
    if (/(running )?low|out of stock|stock check|inventory/.test(s))
      return { name: "list_low_stock", args: {} };
    if (/(waiting|pending|unshipped|not shipped|to ship)/.test(s))
      return { name: "list_orders", args: { status: "pending" } };
    if (/yesterday/.test(s)) return { name: "get_sales_summary", args: { period: "yesterday" } };
    if (/this month|last 30|month to date|monthly/.test(s))
      return { name: "get_sales_summary", args: { period: "month" } };
    if (/week/.test(s)) return { name: "get_sales_summary", args: { period: "week" } };
    if (/(sale|revenue|how.*doing|how.*today|today)/.test(s) && !/brief|morning/.test(s))
      return { name: "get_sales_summary", args: { period: "today" } };
    const customerName = s.replace(
      /^(who is|who's|find|lookup|look up|show me|tell me about|get)\s+/,
      "",
    );
    if (/(customer|who is|who's|lookup|look up)/.test(s) && customerName.trim().length > 0) {
      return { name: "lookup_customer", args: { query: customerName.trim() } };
    }
    return { name: "get_daily_briefing", args: {} };
  }

  interface ChatResult {
    reply: string;
    trace: { tool: string; args: unknown; result: string }[];
    engine: string;
  }

  async function runChat(message: string): Promise<ChatResult> {
    const trace: ChatResult["trace"] = [];
    let client = await getChatClient();

    const callTool = async (
      name: string,
      args: Record<string, unknown>,
    ): Promise<{ text: string; isError: boolean }> => {
      const result = (await client.callTool({ name, arguments: args })) as {
        content?: { type: string; text?: string }[];
        isError?: boolean;
      };
      const text = result.content?.map((c) => c.text ?? "").join("") ?? "";
      trace.push({ tool: name, args, result: text });
      return { text, isError: result.isError === true };
    };

    try {
      if (bedrockEnabled()) {
        const { tools } = await client.listTools();
        const toolConfig: any = {
          tools: tools.map((t) => ({
            toolSpec: {
              name: t.name,
              description: t.description,
              inputSchema: { json: t.inputSchema as any },
            },
          })),
        };
        const messages: any[] = [{ role: "user", content: [{ text: message }] }];

        for (let i = 0; i < 4; i += 1) {
          const out = await bedrock.send(
            new ConverseCommand({
              modelId: MODEL_ID,
              messages,
              toolConfig,
              system: [
                {
                  text:
                    `You are ${SERVER_NAME} ${SERVER_VERSION}, Alexa+ helping a small store owner by voice. ` +
                    `Use the tools to answer. Reply in 1-3 short spoken sentences, no markdown. ` +
                    `Tools that change data ask for confirmation first: after they ask, the next ` +
                    `user message is usually yes or no, so call confirm_action or cancel_action.`,
                },
              ],
            }),
          );
          const msg = out.output?.message;
          if (!msg) break;
          messages.push(msg);

          const uses = (msg.content ?? []).filter((b: any) => b.toolUse);
          if (uses.length === 0) {
            return {
              reply: (msg.content ?? []).map((b: any) => b.text ?? "").join(""),
              trace,
              engine: "bedrock",
            };
          }

          const results: any[] = [];
          for (const block of uses as any[]) {
            const toolUse = block.toolUse as {
              toolUseId: string;
              name: string;
              input: unknown;
            };
            const result = await callTool(
              toolUse.name,
              (toolUse.input ?? {}) as Record<string, unknown>,
            );
            results.push({
              toolResult: {
                toolUseId: toolUse.toolUseId,
                content: [{ text: result.text }],
                status: result.isError ? "error" : "success",
              },
            });
          }
          messages.push({ role: "user", content: results });
        }
      }

      const trimmed = message.trim().toLowerCase();
      if (trimmed.length === 0 || GREETING_RE.test(trimmed)) {
        return {
          reply:
            "Hello! You can ask about today's sales, what is running low in stock, or orders " +
            "waiting to ship. You can also say things like ship order 1008 or cancel order 1004 — " +
            "writes always ask for a spoken confirmation first.",
          trace,
          engine: "offline-router",
        };
      }

      const plan = keywordPlan(message);
      const result = await callTool(plan.name, plan.args);
      if (result.isError && plan.name === "confirm_action") {
        return { reply: result.text, trace, engine: "offline-router" };
      }
      return { reply: result.text, trace, engine: "offline-router" };
    } catch (error) {
      logger.warn({ err: error }, "chat client failed; reconnecting once");
      await resetChatClient();
      client = await getChatClient();
      const plan = keywordPlan(message);
      const result = await callTool(plan.name, plan.args);
      return { reply: result.text, trace, engine: "offline-router" };
    }
  }

  app.use("/api/chat", guardOrigin, limiter);

  app.post("/api/chat", (req, res) => {
    const message = String(req.body?.message ?? "").slice(0, 2000);
    const task = queue.then(
      () => runChat(message),
      () => runChat(message),
    );
    queue = task.catch(() => undefined);
    task
      .then((result) => res.json(result))
      .catch((error: unknown) => {
        logger.error({ err: error }, "chat failed");
        res.status(500).json({
          reply: "Sorry, something went wrong.",
          error: (error as Error).message,
          trace: [],
        });
      });
  });

  // ---- Simulator state: read-only snapshot for the UI's store + inspector panes ----
  app.get("/api/state", guardOrigin, limiter, async (_req, res) => {
    try {
      const current = getServices();
      const db = getDb();
      const [low, pending] = await Promise.all([
        current.adapter.getProducts({ lowStockBelow: 10 }),
        current.adapter.getOrders({ status: "pending", limit: 10 }),
      ]);
      res.json({
        provider: current.adapter.provider,
        currency: current.adapter.currency,
        lowStock: low.map((p) => ({
          sku: p.sku,
          name: p.name,
          stock: p.stock,
          reorderPoint: p.reorderPoint,
        })),
        pendingOrders: {
          total: pending.total,
          items: pending.items.map((o) => ({
            id: o.id,
            customer: o.customerName,
            total: o.total.amount,
          })),
        },
        awaitingConfirmation: new PendingActionRepository(db).recentPending(10).map((a) => ({
          id: a.id,
          tool: a.tool,
          summary: a.summary,
          expiresAt: a.expiresAt,
          requiresCode: a.requiresCode,
        })),
        audit: new AuditRepository(db).recent(8).map((e) => ({
          tool: e.tool,
          status: e.resultStatus,
          actor: e.actor,
          summary: e.resultSummary,
          ts: e.ts,
        })),
      });
    } catch (error) {
      logger.error({ err: error }, "state failed");
      res.status(500).json({ error: "State unavailable." });
    }
  });

  // ---- Public demo controls (only when DEMO_MODE is enabled) ----
  if (config.DEMO_MODE) {
    const resetDemo = async (): Promise<{
      clearedPending: number;
      clearedAudit: number;
      resetAt: string;
    }> => {
      const current = getServices();
      current.adapter.reset?.();
      const db = getDb();
      const clearedPending = new PendingActionRepository(db).clearAll();
      const clearedAudit = new AuditRepository(db).clearAll();
      await resetChatClient();
      const resetAt = new Date().toISOString();
      logger.info({ clearedPending, clearedAudit }, "demo store reset");
      return { clearedPending, clearedAudit, resetAt };
    };

    app.use("/api/demo", guardOrigin, limiter);

    app.get("/api/demo", (_req, res) => {
      const current = getServices();
      res.json({
        demoMode: true,
        provider: current.adapter.provider,
        currency: current.adapter.currency,
      });
    });

    app.post("/api/demo/reset", (_req, res) => {
      const task = queue.then(
        () => resetDemo(),
        () => resetDemo(),
      );
      queue = task.catch(() => undefined);
      task
        .then((result) => res.json({ ok: true, ...result }))
        .catch((error: unknown) => {
          logger.error({ err: error }, "demo reset failed");
          res.status(500).json({ ok: false, error: "Reset failed." });
        });
    });
  }

  return app;
}

if (isMain) {
  getDb();
  const app = createApp();
  const server = app.listen(config.PORT, config.host, () => {
    logger.info(
      {
        url: `http://${config.host}:${config.PORT}`,
        mcp: "/mcp",
        provider: config.STORE_PROVIDER,
        bedrock: config.isBedrockEnabled ? "on" : "off",
        authMode: config.AUTH_MODE,
      },
      "Storefront Voice Ops listening",
    );
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutting down");
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
