import { beforeAll, describe, expect, it } from "vitest";
import type { Portfolio } from "@/types";
import {
  buildSavePlan,
  buildTargets,
  hasChanges,
  saveSummary,
  toggleTarget,
} from "@/lib/portfolio/saveTarget";
import { setLocale } from "@/lib/i18n/i18n";

// 文面は日本語で検証する（既定は英語なので明示的に切り替える）
beforeAll(() => setLocale("ja"));

function portfolio(id: string, name: string, tickers: string[]): Portfolio {
  return { id, name, tickers, createdAtMs: 0, updatedAtMs: 0 };
}

const lists = [
  portfolio("p1", "メインポートフォリオ", ["AAPL", "NVDA"]),
  portfolio("p2", "監視中", []),
  portfolio("p3", "AI関連", ["nvda"]),
];

describe("buildTargets（保存先の候補）", () => {
  it("すでに入っているリストは最初からチェック済みにする", () => {
    const rows = buildTargets(lists, "AAPL", null);
    expect(rows.map((r) => [r.id, r.alreadyIn, r.checked])).toEqual([
      ["p1", true, true],
      ["p2", false, false],
      ["p3", false, false],
    ]);
  });

  it("大文字小文字が違っても「入っている」と判定する", () => {
    const rows = buildTargets(lists, "nvda", null);
    expect(rows.find((r) => r.id === "p3")!.alreadyIn).toBe(true);
    expect(rows.find((r) => r.id === "p1")!.alreadyIn).toBe(true);
  });

  it("ユーザーが操作したあとは、その選択を優先する", () => {
    const rows = buildTargets(lists, "AAPL", ["p2"]);
    expect(rows.find((r) => r.id === "p1")!.checked).toBe(false);
    expect(rows.find((r) => r.id === "p2")!.checked).toBe(true);
  });

  it("リストが無ければ空を返す", () => {
    expect(buildTargets([], "AAPL", null)).toEqual([]);
  });
});

describe("toggleTarget", () => {
  it("チェックを付け外しできる", () => {
    expect(toggleTarget([], "p1")).toEqual(["p1"]);
    expect(toggleTarget(["p1", "p2"], "p1")).toEqual(["p2"]);
  });
});

describe("buildSavePlan（実際に必要な操作だけ取り出す）", () => {
  it("新しくチェックしたリストだけ追加する", () => {
    const rows = buildTargets(lists, "AAPL", ["p1", "p2"]);
    expect(buildSavePlan(rows)).toEqual({ add: ["p2"], remove: [] });
  });

  it("チェックを外したリストからは取り除く", () => {
    const rows = buildTargets(lists, "AAPL", []);
    expect(buildSavePlan(rows)).toEqual({ add: [], remove: ["p1"] });
  });

  it("**変わっていないリストには触らない**（追加日時が動いて並びが崩れないように）", () => {
    const rows = buildTargets(lists, "AAPL", ["p1"]);
    expect(buildSavePlan(rows)).toEqual({ add: [], remove: [] });
  });

  it("追加と削除が同時でも両方拾う", () => {
    const rows = buildTargets(lists, "AAPL", ["p3"]);
    expect(buildSavePlan(rows)).toEqual({ add: ["p3"], remove: ["p1"] });
  });
});

describe("hasChanges", () => {
  it("何も変わらないなら保存させない", () => {
    expect(hasChanges({ add: [], remove: [] })).toBe(false);
    expect(hasChanges({ add: ["p1"], remove: [] })).toBe(true);
    expect(hasChanges({ add: [], remove: ["p1"] })).toBe(true);
  });
});

describe("saveSummary", () => {
  it("追加・削除の件数を伝える", () => {
    expect(saveSummary("aapl", { add: ["p1", "p2"], remove: [] })).toBe(
      "AAPL を2 件のリストに追加しました",
    );
    expect(saveSummary("AAPL", { add: [], remove: ["p1"] })).toBe(
      "AAPL を1 件から削除しました",
    );
    expect(saveSummary("AAPL", { add: ["p1"], remove: ["p2"] })).toContain("・");
  });

  it("変更が無いときはその旨を返す", () => {
    expect(saveSummary("AAPL", { add: [], remove: [] })).toBe("変更はありません");
  });
});
