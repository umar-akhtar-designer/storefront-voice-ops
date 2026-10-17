import { randomInt, randomUUID } from "node:crypto";
import type { AuditLogger } from "./audit.js";
import type { PendingAction, PendingActionRepository } from "../db/repositories.js";

export interface ConfirmationRequest {
  tool: string;
  target?: string;
  input: Record<string, unknown>;
  /** Spoken confirmation prompt, e.g. "Ship order 1042 for Sana to TCS?". */
  summary: string;
  /** Require a spoken code in addition to "yes" (for high-impact actions). */
  requiresCode?: boolean;
}

export interface ConfirmationOptions {
  ttlSeconds: number;
  now?: () => Date;
  codeLength?: number;
}

export class ConfirmationError extends Error {
  constructor(
    readonly code: "not_found" | "expired" | "already_cancelled" | "bad_code",
    message: string,
  ) {
    super(message);
    this.name = "ConfirmationError";
  }
}

function generateCode(length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) out += randomInt(0, 10);
  return out;
}

/**
 * Owns the confirmation lifecycle for every write action. Actions are never executed here; this
 * class only persists, validates, and transitions state so the caller can execute exactly once.
 */
export class ConfirmationService {
  private readonly now: () => Date;
  private readonly codeLength: number;

  constructor(
    private readonly repo: PendingActionRepository,
    private readonly audit: AuditLogger,
    private readonly options: ConfirmationOptions,
  ) {
    this.now = options.now ?? (() => new Date());
    this.codeLength = options.codeLength ?? 4;
  }

  /** Create a pending action, superseding any other pending action for the same session/tool/target. */
  request(
    sessionId: string,
    actor: string,
    request: ConfirmationRequest,
    requestId?: string,
  ): PendingAction {
    const now = this.now();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + this.options.ttlSeconds * 1000).toISOString();
    const requiresCode = request.requiresCode ?? false;
    const code = requiresCode ? generateCode(this.codeLength) : undefined;
    const id = randomUUID();

    const action = this.repo.create({
      id,
      tool: request.tool,
      ...(request.target !== undefined ? { target: request.target } : {}),
      input: request.input,
      summary: request.summary,
      createdAt,
      expiresAt,
      sessionId,
      actor,
      ...(code !== undefined ? { code } : {}),
      requiresCode,
    });

    const superseded = this.repo.supersede(sessionId, request.tool, request.target, id);
    if (superseded > 0) {
      this.audit.cancelled({
        tool: request.tool,
        actor,
        sessionId,
        requestId,
        input: request.input,
        summary: "Superseded by a newer request for the same target.",
      });
    }

    this.audit.confirmationCreated({
      tool: request.tool,
      actor,
      sessionId,
      requestId,
      input: request.input,
      summary: request.summary,
    });

    return action;
  }

  list(sessionId: string): PendingAction[] {
    return this.repo.listBySession(sessionId);
  }

  latestPending(sessionId: string): PendingAction | undefined {
    return this.repo.latestPending(sessionId);
  }

  private isExpired(action: PendingAction): boolean {
    return this.now().toISOString() >= action.expiresAt;
  }

  /** Resolve an action by id (must belong to the session) or fall back to the latest pending one. */
  resolve(sessionId: string, actionId?: string): PendingAction | undefined {
    if (actionId) {
      const found = this.repo.getById(actionId);
      if (found && found.sessionId === sessionId) return found;
      return undefined;
    }
    return this.repo.latestPending(sessionId);
  }

  /**
   * Validate a pending action for execution. Throws ConfirmationError on any failure and marks the
   * action expired when its TTL has passed. Does not change the action's status on success.
   */
  validateForExecution(action: PendingAction, code?: string): void {
    if (action.status === "confirmed") return; // idempotent: caller should skip re-execution
    if (action.status === "cancelled") {
      throw new ConfirmationError("already_cancelled", "That action was cancelled.");
    }
    if (action.status === "expired" || this.isExpired(action)) {
      if (action.status !== "expired") {
        this.repo.setStatus(action.id, "expired");
        this.audit.expired({
          tool: action.tool,
          actor: action.actor ?? "unknown",
          sessionId: action.sessionId ?? "unknown",
          input: action.input,
          summary: "Confirmation expired.",
        });
      }
      throw new ConfirmationError("expired", "That confirmation expired. Please ask again.");
    }
    if (action.requiresCode) {
      if (!code || code !== action.code) {
        throw new ConfirmationError("bad_code", "That code did not match. Please try again.");
      }
    }
  }

  markConfirmed(action: PendingAction): void {
    this.repo.setStatus(action.id, "confirmed");
    this.audit.confirmed({
      tool: action.tool,
      actor: action.actor ?? "unknown",
      sessionId: action.sessionId ?? "unknown",
      input: action.input,
      summary: action.summary,
    });
  }

  markCancelled(action: PendingAction, reason = "Cancelled by the shop owner."): void {
    this.repo.setStatus(action.id, "cancelled");
    this.audit.cancelled({
      tool: action.tool,
      actor: action.actor ?? "unknown",
      sessionId: action.sessionId ?? "unknown",
      input: action.input,
      summary: reason,
    });
  }

  /** Sweep and expire stale pending actions; returns how many were expired. */
  expireStale(): number {
    return this.repo.expireStale(this.now().toISOString());
  }
}
