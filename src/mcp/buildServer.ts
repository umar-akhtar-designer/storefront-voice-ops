import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerDeps } from "./context.js";
import { registerControlTools } from "./tools/control.js";
import { registerDraftTools } from "./tools/drafts.js";
import { registerInsightTools } from "./tools/insights.js";
import { registerReadTools } from "./tools/reads.js";
import { registerWriteTools } from "./tools/writes.js";
import { registerPrompts } from "./prompts.js";
import { registerResources } from "./resources.js";

export const SERVER_NAME = "storefront-voice-ops";
export const SERVER_VERSION = "1.0.0";

/**
 * Build an MCP server exposing the full tool, resource, and prompt surface. One instance is
 * created per stateful transport session so request handlers can rely on a stable session id.
 */
export function buildServer(deps: ServerDeps): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  registerReadTools(server, deps);
  registerInsightTools(server, deps);
  registerDraftTools(server, deps);
  registerWriteTools(server, deps);
  registerControlTools(server, deps);
  registerResources(server, deps);
  registerPrompts(server, deps);

  return server;
}
