import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerDeps } from "./context.js";

const VOICE_RULES =
  "Answer in at most three short spoken sentences. Use numbers rounded for speech. " +
  "Spell ids digit by digit. No markdown, no lists, no emojis. If you changed anything, say so plainly.";

export function registerPrompts(server: McpServer, _deps: ServerDeps): void {
  server.registerPrompt(
    "morning-briefing",
    {
      title: "Morning briefing",
      description: "Run the daily briefing and answer as a spoken update for the shop owner.",
      argsSchema: {
        focus: z.enum(["sales", "stock", "orders", "all"]).default("all"),
      },
    },
    ({ focus }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Give me my morning briefing (focus: ${focus}). ` +
              `Call get_daily_briefing, and get_sales_summary for today. ` +
              `Then answer with today's revenue, how many orders are waiting to ship, ` +
              `and anything running out of stock. ${VOICE_RULES}`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "weekly-review",
    {
      title: "Weekly review",
      description: "Summarise the last seven days of trading as a spoken report.",
      argsSchema: {
        days: z.number().int().min(1).max(90).default(7),
      },
    },
    ({ days }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Give me a review of the last ${days} days. ` +
              `Call get_weekly_report and get_top_sellers. ` +
              `Cover revenue, order count, the best selling product, and anything needing attention. ${VOICE_RULES}`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "restock-run",
    {
      title: "Restock run",
      description: "Find what to restock and draft supplier messages, ready for confirmation.",
      argsSchema: {
        threshold: z.number().int().min(0).max(500).default(10),
      },
    },
    ({ threshold }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Help me restock. Call forecast_restock (threshold ${threshold}) and list_low_stock. ` +
              `Tell me what to order and roughly how many units. ` +
              `If I ask you to draft a supplier message, use draft_restock_message and remember ` +
              `it is only drafted, never sent, and any stock change needs confirmation first. ${VOICE_RULES}`,
          },
        },
      ],
    }),
  );
}
