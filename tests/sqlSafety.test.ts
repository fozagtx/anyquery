import { describe, expect, it } from "vitest";
import { validateReadOnlySql } from "../server/lib/sqlSafety";

describe("validateReadOnlySql", () => {
  it("allows read-only select and CTE queries", () => {
    expect(validateReadOnlySql("SELECT * FROM information_schema.tables LIMIT 10").safe).toBe(true);
    expect(
      validateReadOnlySql("WITH tables AS (SELECT table_name FROM information_schema.tables) SELECT COUNT(*) FROM tables").safe
    ).toBe(true);
    expect(validateReadOnlySql("SHOW TABLES").safe).toBe(true);
  });

  it("rejects write, DDL, and multi-statement SQL", () => {
    const unsafe = [
      "DELETE FROM information_schema.tables",
      "DROP TABLE information_schema.tables",
      "UPDATE information_schema.tables SET table_name = 'x'",
      "SELECT * FROM information_schema.tables; SELECT * FROM information_schema.columns",
      "SET search_path TO public"
    ];

    for (const sql of unsafe) {
      expect(validateReadOnlySql(sql).safe, sql).toBe(false);
    }
  });
});
