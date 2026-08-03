import { describe, expect, it } from "vitest";
import { costOf, toUsageCsv, totalUsage, type UsageLogEntry } from "@/lib/usage/usageLog";

const entry = (over: Partial<UsageLogEntry> = {}): UsageLogEntry => ({
  id: "u1",
  ticker: "AAPL",
  provider: "anthropic",
  model: "claude-opus-5",
  roleId: "general",
  inputTokens: 1_000_000,
  outputTokens: 0,
  status: "done",
  startedAtMs: 0,
  savedAtMs: 0,
  ...over,
});

describe("1 件のコスト", () => {
  it("モデルの単価で計算する", () => {
    expect(costOf(entry()).usd).toBeCloseTo(5, 6);
  });

  it("単価不明なら 0 とフラグ", () => {
    expect(costOf(entry({ model: "unknown-model" }))).toEqual({
      usd: 0,
      jpy: 0,
      unknownModel: true,
    });
  });
});

describe("累計", () => {
  it("トークンと金額を足す", () => {
    const totals = totalUsage([entry(), entry({ inputTokens: 0, outputTokens: 1_000_000 })]);
    expect(totals.count).toBe(2);
    expect(totals.totalTokens).toBe(2_000_000);
    expect(totals.usd).toBeCloseTo(30, 6);
  });

  it("**中断・エラーぶんも足す**（実際に払っているため）", () => {
    const totals = totalUsage([
      entry({ status: "cancelled" }),
      entry({ status: "error", inputTokens: 1_000_000 }),
    ]);
    expect(totals.totalTokens).toBe(2_000_000);
    expect(totals.usd).toBeCloseTo(10, 6);
  });

  it("**単価不明は金額に入れず、件数で伝える**（安く見せない）", () => {
    const totals = totalUsage([entry(), entry({ model: "unknown-model" })]);
    expect(totals.usd).toBeCloseTo(5, 6);
    expect(totals.unpricedCount).toBe(1);
    // トークンは数える
    expect(totals.totalTokens).toBe(2_000_000);
  });

  it("トークン 0 の実行は未計上に数えない（数えても意味が無い）", () => {
    const totals = totalUsage([
      entry({ model: "unknown-model", inputTokens: 0, outputTokens: 0 }),
    ]);
    expect(totals.unpricedCount).toBe(0);
  });

  it("空でも壊れない", () => {
    expect(totalUsage([]).totalTokens).toBe(0);
  });
});

describe("CSV 出力", () => {
  const header = ["A", "B", "C", "D", "E", "F", "G", "H", "USD", "JPY", "S"];

  it("見出しと行を出す", () => {
    const csv = toUsageCsv([entry()], header);
    expect(csv.split("\n")).toHaveLength(2);
    expect(csv).toContain("AAPL");
    expect(csv).toContain("claude-opus-5");
  });

  it("**カンマを含む値は引用符で包む**（表がずれる）", () => {
    expect(toUsageCsv([entry({ model: "a,b" })], header)).toContain('"a,b"');
  });

  it("単価不明なら金額欄は空にする（0 と書くと無料に見える）", () => {
    const row = toUsageCsv([entry({ model: "unknown-model" })], header).split("\n")[1].split(",");
    expect(row[8]).toBe("");
    expect(row[9]).toBe("");
  });

  it("ログが無くても見出しは出す", () => {
    expect(toUsageCsv([], header).split("\n")).toHaveLength(1);
  });
});
