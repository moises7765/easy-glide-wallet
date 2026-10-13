import { describe, expect, it } from "vitest";
import { savingsForMonth, savingsHistory, savingsMonthKey } from "./savings";

describe("savings rate", () => {
  it("uses recorded monthly totals and ignores transfers and other months", () => {
    const result = savingsForMonth([
      { type: "income", amount: 1000, date: "2026-10-01" },
      { type: "expense", amount: 600, date: "2026-10-05" },
      { type: "transfer", amount: 900, date: "2026-10-05" },
      { type: "expense", amount: 800, date: "2026-09-05" },
    ], "2026-10");
    expect(result).toMatchObject({ income: 1000, expenses: 600, saved: 400, rate: 40 });
  });
  it("preserves negative rates and rates above 100 are not artificially clamped", () => {
    expect(savingsForMonth([{ type: "income", amount: 100, date: "2026-10-01" }, { type: "expense", amount: 150, date: "2026-10-01" }], "2026-10").rate).toBe(-50);
  });
  it("distinguishes missing records from zero income", () => {
    expect(savingsForMonth([], "2026-10")).toMatchObject({ hasData: false, rate: null });
    expect(savingsForMonth([{ type: "expense", amount: 40, date: "2026-10-01" }], "2026-10")).toMatchObject({ hasData: true, rate: null, saved: -40 });
  });
  it("includes the current month and eleven previous months without invented rates", () => {
    const rows = savingsHistory([], "2026-01");
    expect(rows).toHaveLength(12);
    expect(rows[0]?.key).toBe("2025-02");
    expect(rows[11]?.key).toBe("2026-01");
    expect(rows.every((row) => row.rate === null && !row.hasData)).toBe(true);
  });
  it("uses the calendar month in Brasilia at a UTC month boundary", () => {
    expect(savingsMonthKey(new Date("2026-11-01T01:00:00Z"))).toBe("2026-10");
  });
});