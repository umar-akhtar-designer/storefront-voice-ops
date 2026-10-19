import type { Db } from "./index.js";

export type PendingActionStatus = "pending" | "confirmed" | "cancelled" | "expired";

export interface PendingAction {
  id: string;
  tool: string;
  target?: string;
  input: Record<string, unknown>;
  summary: string;
  createdAt: string;
  expiresAt: string;
  status: PendingActionStatus;
  sessionId?: string;
  actor?: string;
  code?: string;
  requiresCode: boolean;
}

export interface NewPendingAction {
  id: string;
  tool: string;
  target?: string;
  input: Record<string, unknown>;
  summary: string;
  createdAt: string;
  expiresAt: string;
  sessionId: string;
  actor: string;
  code?: string;
  requiresCode?: boolean;
}

interface PendingRow {
  id: string;
  tool: string;
  target: string | null;
  input_json: string;
  summary: string;
  created_at: string;
  expires_at: string;
  status: PendingActionStatus;
  session_id: string | null;
  actor: string | null;
  code: string | null;
  requires_code: number;
}

function parseJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function mapPending(row: PendingRow): PendingAction {
  return {
    id: row.id,
    tool: row.tool,
    ...(row.target !== null ? { target: row.target } : {}),
    input: parseJson(row.input_json),
    summary: row.summary,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    status: row.status,
    ...(row.session_id !== null ? { sessionId: row.session_id } : {}),
    ...(row.actor !== null ? { actor: row.actor } : {}),
    ...(row.code !== null ? { code: row.code } : {}),
    requiresCode: row.requires_code === 1,
  };
}

export class PendingActionRepository {
  constructor(private readonly db: Db) {}

  create(action: NewPendingAction): PendingAction {
    this.db
      .prepare(
        `INSERT INTO pending_actions
           (id, tool, target, input_json, summary, created_at, expires_at, status, session_id, actor, code, requires_code)
         VALUES (@id, @tool, @target, @inputJson, @summary, @createdAt, @expiresAt, 'pending', @sessionId, @actor, @code, @requiresCode)`,
      )
      .run({
        id: action.id,
        tool: action.tool,
        target: action.target ?? null,
        inputJson: JSON.stringify(action.input),
        summary: action.summary,
        createdAt: action.createdAt,
        expiresAt: action.expiresAt,
        sessionId: action.sessionId,
        actor: action.actor,
        code: action.code ?? null,
        requiresCode: action.requiresCode ? 1 : 0,
      });
    const created = this.getById(action.id);
    if (!created) throw new Error("Failed to create pending action");
    return created;
  }

  getById(id: string): PendingAction | undefined {
    const row = this.db.prepare("SELECT * FROM pending_actions WHERE id = ?").get(id) as
      PendingRow | undefined;
    return row ? mapPending(row) : undefined;
  }

  latestPending(sessionId: string): PendingAction | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM pending_actions WHERE session_id = ? AND status = 'pending' ORDER BY created_at DESC, rowid DESC LIMIT 1",
      )
      .get(sessionId) as PendingRow | undefined;
    return row ? mapPending(row) : undefined;
  }

  listBySession(sessionId: string): PendingAction[] {
    const rows = this.db
      .prepare("SELECT * FROM pending_actions WHERE session_id = ? ORDER BY created_at DESC")
      .all(sessionId) as PendingRow[];
    return rows.map(mapPending);
  }

  /** Most recent still-pending actions across all sessions (for the simulator's "awaiting" pane). */
  recentPending(limit = 10): PendingAction[] {
    // self-sweep: anything past its expiry can no longer be confirmed, so hide it
    this.expireStale(new Date().toISOString());
    const rows = this.db
      .prepare(
        "SELECT * FROM pending_actions WHERE status = 'pending' ORDER BY created_at DESC, rowid DESC LIMIT ?",
      )
      .all(Math.min(Math.max(limit, 1), 100)) as PendingRow[];
    return rows.map(mapPending);
  }

  /** Cancel every still-pending action. Returns how many were cleared. */
  cancelAllPending(): number {
    const result = this.db
      .prepare("UPDATE pending_actions SET status = 'cancelled' WHERE status = 'pending'")
      .run();
    return result.changes;
  }

  /** Cancel any other pending action for the same tool/target (one pending per target, any session). */
  supersede(sessionId: string, tool: string, target: string | undefined, keepId: string): number {
    const result = this.db
      .prepare(
        `UPDATE pending_actions SET status = 'cancelled'
         WHERE tool = @tool AND status = 'pending' AND id != @keepId
           AND (target IS @target OR target = @target)`,
      )
      .run({ sessionId, tool, target: target ?? null, keepId });
    return result.changes;
  }

  setStatus(id: string, status: PendingActionStatus): void {
    this.db.prepare("UPDATE pending_actions SET status = ? WHERE id = ?").run(status, id);
  }

  /** Mark every pending action whose expiry has passed as expired. Returns the count. */
  expireStale(nowIso: string): number {
    const result = this.db
      .prepare(
        "UPDATE pending_actions SET status = 'expired' WHERE status = 'pending' AND expires_at <= ?",
      )
      .run(nowIso);
    return result.changes;
  }

  /** Delete every pending action. Used by the public demo reset. Returns the count removed. */
  clearAll(): number {
    return this.db.prepare("DELETE FROM pending_actions").run().changes;
  }
}

export interface NewAuditEntry {
  ts?: string;
  actor?: string;
  sessionId?: string;
  tool: string;
  input?: Record<string, unknown>;
  resultStatus: string;
  resultSummary?: string;
  requestId?: string;
}

export interface AuditEntry {
  id: number;
  ts: string;
  actor?: string;
  sessionId?: string;
  tool: string;
  input?: Record<string, unknown>;
  resultStatus: string;
  resultSummary?: string;
  requestId?: string;
}

interface AuditRow {
  id: number;
  ts: string;
  actor: string | null;
  session_id: string | null;
  tool: string;
  input_json: string | null;
  result_status: string;
  result_summary: string | null;
  request_id: string | null;
}

export class AuditRepository {
  constructor(private readonly db: Db) {}

  record(entry: NewAuditEntry): void {
    this.db
      .prepare(
        `INSERT INTO audit_log (ts, actor, session_id, tool, input_json, result_status, result_summary, request_id)
         VALUES (@ts, @actor, @sessionId, @tool, @inputJson, @resultStatus, @resultSummary, @requestId)`,
      )
      .run({
        ts: entry.ts ?? new Date().toISOString(),
        actor: entry.actor ?? null,
        sessionId: entry.sessionId ?? null,
        tool: entry.tool,
        inputJson: entry.input ? JSON.stringify(entry.input) : null,
        resultStatus: entry.resultStatus,
        resultSummary: entry.resultSummary ?? null,
        requestId: entry.requestId ?? null,
      });
  }

  recent(limit = 20): AuditEntry[] {
    const rows = this.db
      .prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?")
      .all(Math.min(Math.max(limit, 1), 200)) as AuditRow[];
    return rows.map((row) => ({
      id: row.id,
      ts: row.ts,
      ...(row.actor !== null ? { actor: row.actor } : {}),
      ...(row.session_id !== null ? { sessionId: row.session_id } : {}),
      tool: row.tool,
      ...(row.input_json !== null ? { input: parseJson(row.input_json) } : {}),
      resultStatus: row.result_status,
      ...(row.result_summary !== null ? { resultSummary: row.result_summary } : {}),
      ...(row.request_id !== null ? { requestId: row.request_id } : {}),
    }));
  }

  /** Delete every audit entry. Used by the public demo reset. Returns the count removed. */
  clearAll(): number {
    return this.db.prepare("DELETE FROM audit_log").run().changes;
  }
}
