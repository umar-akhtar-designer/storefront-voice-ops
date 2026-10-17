import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ConfirmationError } from "../../safety/confirm.js";
import type { ServerDeps } from "../context.js";
import { contextFor } from "../context.js";
import { fail, ok, spokenError } from "../result.js";
import { executeWriteAction } from "../writeExecutors.js";

const actionIdSchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .pipe(z.string().min(1))
  .optional();

const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{4,8}$/)
  .optional();

function isConfirmationError(error: unknown): error is ConfirmationError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: string }).name === "ConfirmationError"
  );
}

export function registerControlTools(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    "confirm_action",
    {
      title: "Confirm a pending action",
      description:
        "Confirm the pending write action so it runs. Runs at most once; repeats are idempotent. Pass the code for actions that asked for one.",
      inputSchema: { actionId: actionIdSchema, code: codeSchema },
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
        destructiveHint: true,
        openWorldHint: true,
      },
    },
    async ({ actionId, code }, extra) => {
      const ctx = contextFor(deps, extra);
      const action = ctx.confirm.resolve(ctx.sessionId, actionId);
      if (!action) {
        return fail("There's nothing waiting for confirmation. Ask me to do it again.", {
          confirmationPending: false,
        });
      }
      if (action.status === "confirmed") {
        return ok(`Already done: ${action.summary}`, {
          alreadyConfirmed: true,
          actionId: action.id,
          tool: action.tool,
        });
      }
      if (action.status === "cancelled") {
        return fail("That action was cancelled. Ask me to do it again.", { actionId: action.id });
      }
      if (action.status === "expired") {
        return fail("That confirmation expired. Please ask me again.", { actionId: action.id });
      }

      try {
        ctx.confirm.validateForExecution(action, code);
      } catch (error) {
        if (isConfirmationError(error)) {
          return fail(error.message, {
            actionId: action.id,
            code: (error as ConfirmationError).code,
          });
        }
        return fail(spokenError(error), { actionId: action.id });
      }

      const outcome = await executeWriteAction(action.tool, action.input, ctx);
      if (outcome.status === "error") {
        ctx.audit.failed({
          tool: action.tool,
          actor: ctx.actor,
          sessionId: ctx.sessionId,
          requestId: ctx.requestId,
          input: action.input,
          summary: outcome.text,
        });
        return fail(outcome.text, { actionId: action.id, tool: action.tool, executed: false });
      }

      ctx.confirm.markConfirmed(action);
      ctx.audit.executed({
        tool: action.tool,
        actor: ctx.actor,
        sessionId: ctx.sessionId,
        requestId: ctx.requestId,
        input: action.input,
        summary: outcome.text,
      });
      return ok(outcome.text, {
        actionId: action.id,
        tool: action.tool,
        executed: true,
        ...outcome.structured,
      });
    },
  );

  server.registerTool(
    "cancel_action",
    {
      title: "Cancel a pending action",
      description:
        "Discard a pending write action so it never runs. Cancelling twice is idempotent.",
      inputSchema: { actionId: actionIdSchema },
      annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: false },
    },
    async ({ actionId }, extra) => {
      const ctx = contextFor(deps, extra);
      const action = ctx.confirm.resolve(ctx.sessionId, actionId);
      if (!action) {
        return fail("There's nothing waiting to cancel.", { confirmationPending: false });
      }
      if (action.status === "confirmed") {
        return fail(`That already ran, so I can't cancel it: ${action.summary}`, {
          actionId: action.id,
        });
      }
      if (action.status === "cancelled") {
        return ok("That's already cancelled.", { alreadyCancelled: true, actionId: action.id });
      }
      if (action.status === "expired") {
        return ok("That confirmation had already expired.", {
          alreadyExpired: true,
          actionId: action.id,
        });
      }
      ctx.confirm.markCancelled(action);
      return ok(`Cancelled. ${action.summary}`, { actionId: action.id, status: "cancelled" });
    },
  );

  server.registerTool(
    "list_pending_actions",
    {
      title: "List pending confirmations",
      description: "Every write action in this session that is still waiting for a yes or no.",
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (_args, extra) => {
      const ctx = contextFor(deps, extra);
      try {
        ctx.confirm.expireStale();
        const pending = ctx.confirm
          .list(ctx.sessionId)
          .filter((a) => a.status === "pending" && a.expiresAt > ctx.now().toISOString());

        if (pending.length === 0) {
          return ok("Nothing is waiting for confirmation.", { actions: [] });
        }
        const shown = pending.slice(0, 3);
        const spoken = shown.map((a) => a.summary).join("; ");
        const rest = pending.length > 3 ? `, and ${pending.length - 3} more.` : ".";
        return ok(`Waiting for your confirmation: ${spoken}${rest}`, {
          actions: pending.map((a) => ({
            actionId: a.id,
            tool: a.tool,
            summary: a.summary,
            expiresAt: a.expiresAt,
            requiresCode: a.requiresCode,
            ...(a.code ? { code: a.code } : {}),
          })),
        });
      } catch (error) {
        return fail(spokenError(error));
      }
    },
  );
}
