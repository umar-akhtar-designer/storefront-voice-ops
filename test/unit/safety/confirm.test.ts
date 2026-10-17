import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "../../../src/db/index.js";
import { AuditRepository, PendingActionRepository } from "../../../src/db/repositories.js";
import { AuditLogger } from "../../../src/safety/audit.js";
import { ConfirmationError, ConfirmationService } from "../../../src/safety/confirm.js";

describe("ConfirmationService", () => {
  let db: Db;
  let repo: PendingActionRepository;
  let audit: AuditLogger;
  let now: Date;
  let service: ConfirmationService;

  beforeEach(() => {
    db = openDatabase(":memory:");
    repo = new PendingActionRepository(db);
    audit = new AuditLogger(new AuditRepository(db));
    now = new Date("2026-10-17T09:00:00.000Z");
    service = new ConfirmationService(repo, audit, { ttlSeconds: 60, now: () => now });
  });

  afterEach(() => {
    db.close();
  });

  const request = (overrides: Partial<Parameters<ConfirmationService["request"]>[2]> = {}) =>
    service.request("S1", "owner@example.com", {
      tool: "mark_order_shipped",
      target: "order:1042",
      input: { orderId: "1042", carrier: "TCS" },
      summary: "Ship order 1042?",
      ...overrides,
    });

  it("creates a pending action with a TTL and no code by default", () => {
    const action = request();
    expect(action.status).toBe("pending");
    expect(action.requiresCode).toBe(false);
    expect(action.code).toBeUndefined();
    expect(action.expiresAt).toBe("2026-10-17T09:01:00.000Z");
    expect(audit.recent().map((e) => e.resultStatus)).toContain("confirmation_created");
  });

  it("generates a numeric code when the action requires one", () => {
    const action = request({ requiresCode: true, tool: "cancel_order" });
    expect(action.requiresCode).toBe(true);
    expect(action.code).toMatch(/^\d{4}$/);
  });

  it("supersedes an earlier pending action for the same session and target", () => {
    const first = request();
    const second = request({ summary: "Ship order 1042 with Leopards?" });
    expect(repo.getById(first.id)?.status).toBe("cancelled");
    expect(repo.getById(second.id)?.status).toBe("pending");
    expect(audit.recent().some((e) => e.resultStatus === "cancelled")).toBe(true);
  });

  it("resolves by id within the session and falls back to the latest pending", () => {
    const action = request();
    expect(service.resolve("S1", action.id)?.id).toBe(action.id);
    expect(service.resolve("S2", action.id)).toBeUndefined();
    expect(service.resolve("S1")?.id).toBe(action.id);
    expect(service.resolve("S2")).toBeUndefined();
  });

  it("validates a healthy action without throwing", () => {
    const action = request();
    expect(() => service.validateForExecution(action)).not.toThrow();
  });

  it("expires an action once its TTL passes", () => {
    const action = request();
    now = new Date("2026-10-17T09:02:00.000Z");
    expect(() => service.validateForExecution(action)).toThrowError(ConfirmationError);
    expect(repo.getById(action.id)?.status).toBe("expired");
    expect(audit.recent().some((e) => e.resultStatus === "expired")).toBe(true);
  });

  it("rejects a wrong code and accepts the right one", () => {
    const action = request({ requiresCode: true, tool: "cancel_order" });
    const wrong = action.code === "0000" ? "1111" : "0000";
    expect(() => service.validateForExecution(action, wrong)).toThrowError(/did not match/);
    expect(() => service.validateForExecution(action, action.code)).not.toThrow();
  });

  it("treats a confirmed action as idempotent", () => {
    const action = request();
    service.markConfirmed(action);
    expect(repo.getById(action.id)?.status).toBe("confirmed");
    expect(() => service.validateForExecution(action)).not.toThrow();
    expect(audit.recent().some((e) => e.resultStatus === "confirmed")).toBe(true);
  });

  it("refuses to execute a cancelled action", () => {
    const action = request();
    service.markCancelled(action);
    const cancelled = service.resolve("S1", action.id)!;
    expect(() => service.validateForExecution(cancelled)).toThrowError(/cancelled/);
  });

  it("sweeps stale pending actions on demand", () => {
    request();
    now = new Date("2026-10-17T09:05:00.000Z");
    expect(service.expireStale()).toBe(1);
    expect(service.list("S1").every((a) => a.status === "expired")).toBe(true);
  });

  it("returns audit entries newest first", () => {
    const action = request();
    service.markConfirmed(action);
    const entries = audit.recent();
    expect(entries[0]!.resultStatus).toBe("confirmed");
    expect(entries.at(-1)!.resultStatus).toBe("confirmation_created");
  });
});
