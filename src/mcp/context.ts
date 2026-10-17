import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import type { StoreAdapter } from "../adapters/types.js";
import type { AiService } from "../ai/types.js";
import type { AuditLogger } from "../safety/audit.js";
import type { ConfirmationService } from "../safety/confirm.js";

export type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/**
 * Dependencies shared by every handler. Process-wide services (adapter, confirmation, audit, AI)
 * are shared across MCP sessions; `sessionId`/`sessionActor` are filled in per session when a
 * stateful transport is used, which is what keeps a confirmation available across calls.
 */
export interface ServerDeps {
  adapter: StoreAdapter;
  confirm: ConfirmationService;
  audit: AuditLogger;
  ai?: AiService;
  now: () => Date;
  canonicalUri: string;
  sessionId?: string;
  sessionActor?: string;
}

/** Per-call context handed to each handler. */
export interface ToolContext extends ServerDeps {
  sessionId: string;
  actor: string;
  requestId: string;
}

const ANONYMOUS_SESSION = "anonymous";

export function contextFor(deps: ServerDeps, extra: ToolExtra): ToolContext {
  const authInfo = extra.authInfo as { clientId?: string; subject?: string } | undefined;
  return {
    ...deps,
    sessionId: extra.sessionId ?? deps.sessionId ?? ANONYMOUS_SESSION,
    actor: authInfo?.subject ?? authInfo?.clientId ?? deps.sessionActor ?? "unknown",
    requestId: String(extra.requestId ?? ""),
  };
}
