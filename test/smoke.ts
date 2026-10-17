import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const c = new Client({ name: "smoke", version: "1" });
await c.connect(
  new StreamableHTTPClientTransport(new URL(process.env.MCP_URL ?? "http://localhost:3000/mcp")),
);
console.log("tools:", (await c.listTools()).tools.map((t) => t.name).join(", "));
for (const [name, arguments_] of [
  ["get_sales_summary", { period: "today" }],
  ["list_low_stock", {}],
  ["mark_order_shipped", { orderId: 1042 }],
  ["get_daily_briefing", {}],
] as const)
  console.log(
    name,
    "→",
    ((await c.callTool({ name, arguments: arguments_ as any })) as any).content[0].text,
  );
await c.close();
