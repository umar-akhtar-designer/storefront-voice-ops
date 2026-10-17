import type { AuditEntry, AuditRepository, NewAuditEntry } from "../db/repositories.js";

/**
 * Thin, intention-revealing wrapper over the audit repository. Every confirmation transition and
 * every write execution goes through here so nothing changes silently.
 */
export class AuditLogger {
  constructor(private readonly repo: AuditRepository) {}

  private record(entry: NewAuditEntry): void {
    this.repo.record(entry);
  }

  confirmationCreated(params: {
    tool: string;
    actor: string;
    sessionId: string;
    requestId?: string;
    input: Record<string, unknown>;
    summary: string;
  }): void {
    this.record({
      tool: params.tool,
      actor: params.actor,
      sessionId: params.sessionId,
      requestId: params.requestId,
      input: params.input,
      resultStatus: "confirmation_created",
      resultSummary: params.summary,
    });
  }

  confirmed(params: {
    tool: string;
    actor: string;
    sessionId: string;
    requestId?: string;
    input: Record<string, unknown>;
    summary: string;
  }): void {
    this.record({
      tool: params.tool,
      actor: params.actor,
      sessionId: params.sessionId,
      requestId: params.requestId,
      input: params.input,
      resultStatus: "confirmed",
      resultSummary: params.summary,
    });
  }

  executed(params: {
    tool: string;
    actor: string;
    sessionId: string;
    requestId?: string;
    input: Record<string, unknown>;
    summary: string;
  }): void {
    this.record({
      tool: params.tool,
      actor: params.actor,
      sessionId: params.sessionId,
      requestId: params.requestId,
      input: params.input,
      resultStatus: "executed",
      resultSummary: params.summary,
    });
  }

  failed(params: {
    tool: string;
    actor: string;
    sessionId: string;
    requestId?: string;
    input: Record<string, unknown>;
    summary: string;
  }): void {
    this.record({
      tool: params.tool,
      actor: params.actor,
      sessionId: params.sessionId,
      requestId: params.requestId,
      input: params.input,
      resultStatus: "failed",
      resultSummary: params.summary,
    });
  }

  cancelled(params: {
    tool: string;
    actor: string;
    sessionId: string;
    requestId?: string;
    input?: Record<string, unknown>;
    summary: string;
  }): void {
    this.record({
      tool: params.tool,
      actor: params.actor,
      sessionId: params.sessionId,
      requestId: params.requestId,
      input: params.input ?? {},
      resultStatus: "cancelled",
      resultSummary: params.summary,
    });
  }

  expired(params: {
    tool: string;
    actor: string;
    sessionId: string;
    input?: Record<string, unknown>;
    summary: string;
  }): void {
    this.record({
      tool: params.tool,
      actor: params.actor,
      sessionId: params.sessionId,
      input: params.input ?? {},
      resultStatus: "expired",
      resultSummary: params.summary,
    });
  }

  recent(limit?: number): AuditEntry[] {
    return this.repo.recent(limit);
  }
}
