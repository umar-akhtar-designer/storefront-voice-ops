import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

interface ToolResult {
  content?: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

const client = new Client({ name: "smoke", version: "1" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(process.env.MCP_URL ?? "http://localhost:3000/mcp")),
);

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const result = (await client.callTool({ name, arguments: args })) as ToolResult;
  const text = (result.content ?? []).map((c) => c.text ?? "").join("");
  console.log(`${name}${result.isError ? " (error)" : ""} → ${text}`);
  return result;
};

console.log("tools:", (await client.listTools()).tools.map((t) => t.name).join(", "));

await call("get_sales_summary", { period: "today" });
await call("list_low_stock", {});
await call("get_daily_briefing", {});

const pending = await call("list_orders", { status: "pending", limit: 1 });
const orderId = (pending.structuredContent?.orders as { id: string }[] | undefined)?.[0]?.id;
if (orderId) {
  await call("mark_order_shipped", { orderId, carrier: "TCS" });
  await call("confirm_action", {});
  await call("get_order", { orderId });
}

await client.close();
