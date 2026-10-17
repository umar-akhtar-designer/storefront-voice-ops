import { afterEach, describe, expect, it } from "vitest";
import { applySchema, openDatabase } from "../../src/db/index.js";
import type { Db } from "../../src/db/index.js";

let db: Db | undefined;

afterEach(() => {
  db?.close();
  db = undefined;
});

describe("database schema", () => {
  it("creates all expected tables", () => {
    db = openDatabase(":memory:");
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
      name: string;
    }[];
    const names = rows.map((r) => r.name);
    for (const table of [
      "products",
      "orders",
      "order_items",
      "customers",
      "pending_actions",
      "audit_log",
    ]) {
      expect(names).toContain(table);
    }
  });

  it("is idempotent when the schema is applied twice", () => {
    db = openDatabase(":memory:");
    expect(() => applySchema(db!)).not.toThrow();
  });

  it("accepts a pending action and an audit entry", () => {
    db = openDatabase(":memory:");
    db.prepare(
      `INSERT INTO pending_actions (id, tool, input_json, summary, created_at, expires_at, status)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now', '+120 seconds'), 'pending')`,
    ).run("abc", "mark_order_shipped", '{"orderId":"1042"}', "Ship order 1042");

    db.prepare(
      `INSERT INTO audit_log (actor, tool, input_json, result_status, result_summary)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("demo", "mark_order_shipped", '{"orderId":"1042"}', "created", "Awaiting confirmation");

    const pending = db.prepare("SELECT COUNT(*) AS n FROM pending_actions").get() as { n: number };
    const audit = db.prepare("SELECT COUNT(*) AS n FROM audit_log").get() as { n: number };
    expect(pending.n).toBe(1);
    expect(audit.n).toBe(1);
  });
});
