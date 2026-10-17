import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { buildServer } from "./tools.js";
import { bedrock, bedrockEnabled, MODEL_ID } from "./bedrock.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { getDb, isDbReady } from "./db/index.js";
import { createStoreAdapter } from "./adapters/factory.js";
import type { StoreAdapter } from "./adapters/types.js";

const publicDir = path.resolve(process.cwd(), "public");

let adapter: StoreAdapter | undefined;
function getAdapter(): StoreAdapter {
  adapter ??= createStoreAdapter();
  return adapter;
}

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
      await getAdapter().getProducts();
      checks.store = true;
    } catch (error) {
      logger.warn({ err: error }, "readiness: store check failed");
    }
    const ready = checks.db && checks.store;
    res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not-ready", checks });
  });

  // ---- MCP endpoint (Streamable HTTP, stateless) — what Alexa+ connects to ----
  app.post("/mcp", async (req, res) => {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  const notAllowed = (_req: express.Request, res: express.Response) =>
    res
      .status(405)
      .json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
  app.get("/mcp", notAllowed);
  app.delete("/mcp", notAllowed);

  // ---- Simulator agent: talks to the MCP server over the real protocol ----
  async function mcpClient(): Promise<Client> {
    const client = new Client({ name: "alexa-plus-simulator", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${config.PORT}/mcp`)),
    );
    return client;
  }

  function keywordPlan(q: string): { name: string; args: Record<string, unknown> } {
    const s = q.toLowerCase();
    const id = s.match(/\b(10\d\d)\b/)?.[1];
    if (/ship|dispatch/.test(s) && id)
      return { name: "mark_order_shipped", args: { orderId: Number(id) } };
    if (/restock|reorder|supplier/.test(s))
      return {
        name: "draft_restock_message",
        args: { sku: /cap/.test(s) ? "CAP-NVY" : /hood/.test(s) ? "HOOD-GRY-L" : "TEE-BLK-M" },
      };
    if (id) return { name: "get_order", args: { orderId: Number(id) } };
    if (/stock|inventory|running low/.test(s)) return { name: "list_low_stock", args: {} };
    if (/pending|waiting|unshipped/.test(s))
      return { name: "list_orders", args: { status: "pending" } };
    if (/week/.test(s)) return { name: "get_sales_summary", args: { period: "week" } };
    if (/sale|revenue|how.*do/.test(s) && !/brief|morning/.test(s))
      return { name: "get_sales_summary", args: { period: "today" } };
    return { name: "get_daily_briefing", args: {} };
  }

  app.post("/api/chat", async (req, res) => {
    const message: string = String(req.body?.message ?? "");
    const trace: { tool: string; args: unknown; result: string }[] = [];
    const client = await mcpClient();
    try {
      if (bedrockEnabled()) {
        const { tools } = await client.listTools();
        const toolConfig = {
          tools: tools.map((t) => ({
            toolSpec: {
              name: t.name,
              description: t.description,
              inputSchema: { json: t.inputSchema as any },
            },
          })),
        };
        const messages: any[] = [{ role: "user", content: [{ text: message }] }];
        for (let i = 0; i < 4; i++) {
          const out = await bedrock.send(
            new ConverseCommand({
              modelId: MODEL_ID,
              messages,
              toolConfig,
              system: [
                {
                  text: "You are Alexa+ helping a small store owner by voice. Use the tools. Reply in 1-3 short spoken sentences, no markdown.",
                },
              ],
            }),
          );
          const msg = out.output!.message!;
          messages.push(msg);
          const uses = (msg.content ?? []).filter((b: any) => b.toolUse);
          if (!uses.length) {
            return res.json({
              reply: msg.content?.map((b: any) => b.text ?? "").join("") ?? "",
              trace,
              engine: "bedrock",
            });
          }
          const results = [];
          for (const u of uses as any[]) {
            const r: any = await client.callTool({
              name: u.toolUse.name,
              arguments: u.toolUse.input,
            });
            const t = (r.content?.[0]?.text as string) ?? "";
            trace.push({ tool: u.toolUse.name, args: u.toolUse.input, result: t });
            results.push({
              toolResult: {
                toolUseId: u.toolUse.toolUseId,
                content: [{ text: t }],
                status: r.isError ? "error" : "success",
              },
            });
          }
          messages.push({ role: "user", content: results });
        }
      }
      const plan = keywordPlan(message);
      const r: any = await client.callTool({ name: plan.name, arguments: plan.args });
      const t = (r.content?.[0]?.text as string) ?? "";
      trace.push({ tool: plan.name, args: plan.args, result: t });
      res.json({ reply: t, trace, engine: "offline-router" });
    } catch (error) {
      logger.error({ err: error }, "chat failed");
      res
        .status(500)
        .json({ reply: "Sorry, something went wrong.", error: (error as Error).message, trace });
    } finally {
      await client.close();
    }
  });

  return app;
}

const isMain =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  // Ensure the database is initialised before we start serving.
  getDb();
  const app = createApp();
  const server = app.listen(config.PORT, config.host, () => {
    logger.info(
      {
        url: `http://${config.host}:${config.PORT}`,
        mcp: "/mcp",
        provider: config.STORE_PROVIDER,
        bedrock: config.isBedrockEnabled ? "on" : "off",
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
