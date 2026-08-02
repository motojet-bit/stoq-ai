import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArchiveEntry } from "@/types";
import {
  archivesFor,
  deltaLabel,
  groupByTicker,
  periodLabelOf,
} from "@/lib/portfolio/archive";
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
  getSidebarMode,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  normalizeMode,
  orderedModes,
  readSidebarWidth,
  setSidebarMode,
  SIDEBAR_MODES,
  storeSidebarWidth,
  subscribeSidebarMode,
} from "@/lib/ui/sidebarMode";
import { setLocale } from "@/lib/i18n/i18n";

/*
 * 文面は日本語で検証する（既定は英語なので明示的に切り替える）。
 * **トップレベルで呼ぶ。** モジュール直下で組み立てられる定数が
 * あるため、`beforeAll` では間に合わない。
 */
setLocale("ja");

function entry(over: Partial<ArchiveEntry> & { ticker: string }): ArchiveEntry {
  return {
    id: `${over.ticker}-${over.savedAtMs ?? 0}`,
    provider: "anthropic",
    model: "claude-opus-5",
    averageScore: null,
    periodLabel: null,
    record: "{}",
    parentId: null,
    branchNo: null,
    savedAtMs: 0,
    ...over,
  };
}

// ---------------------------------------------------------------- サイドバー

describe("サイドバーのモード切替", () => {
  beforeEach(() => {
    localStorage.clear();
    setSidebarMode("chat");
  });

  it("2 つのモードが定義されている", () => {
    expect(SIDEBAR_MODES.map((m) => m.id)).toEqual(["chat", "portfolio"]);
    // 表示名は辞書から引く（キーだけを持つ）
    expect(SIDEBAR_MODES[0].labelKey).toBe("sidebar.modeChat");
    expect(SIDEBAR_MODES[1].labelKey).toBe("sidebar.modePortfolio");
  });

  it("既定は対話履歴", () => {
    expect(getSidebarMode()).toBe("chat");
  });

  it("切り替えられ、localStorage に残る", () => {
    setSidebarMode("portfolio");
    expect(getSidebarMode()).toBe("portfolio");
    expect(localStorage.getItem("stockanalyzer.sidebarMode")).toBe("portfolio");
  });

  it("壊れた保存値は既定へ丸める", () => {
    expect(normalizeMode("bogus")).toBe("chat");
    expect(normalizeMode(null)).toBe("chat");
    expect(normalizeMode(42)).toBe("chat");
    expect(normalizeMode("portfolio")).toBe("portfolio");
  });

  it("**同じモードを選び直しても通知しない**（無駄な再描画を出さない）", () => {
    const notify = vi.fn();
    const unsubscribe = subscribeSidebarMode(notify);

    setSidebarMode("portfolio");
    expect(notify).toHaveBeenCalledTimes(1);

    setSidebarMode("portfolio");
    expect(notify).toHaveBeenCalledTimes(1);

    setSidebarMode("chat");
    expect(notify).toHaveBeenCalledTimes(2);

    unsubscribe();
    setSidebarMode("portfolio");
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("**選択中のタブが先頭（左）に来る**", () => {
    expect(orderedModes("chat").map((m) => m.id)).toEqual(["chat", "portfolio"]);
    expect(orderedModes("portfolio").map((m) => m.id)).toEqual(["portfolio", "chat"]);
  });

  it("並べ替えてもタブが増減しない", () => {
    for (const mode of ["chat", "portfolio"] as const) {
      expect(orderedModes(mode)).toHaveLength(SIDEBAR_MODES.length);
      expect(orderedModes(mode).map((m) => m.labelKey).sort()).toEqual(
        SIDEBAR_MODES.map((m) => m.labelKey).sort(),
      );
    }
  });
});

describe("サイドバーの幅", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("既定幅は「💼 マイポートフォリオ」が省略されない広さ", () => {
    expect(DEFAULT_SIDEBAR_WIDTH).toBeGreaterThanOrEqual(280);
    expect(readSidebarWidth()).toBe(DEFAULT_SIDEBAR_WIDTH);
  });

  it("上下限に丸める", () => {
    expect(clampSidebarWidth(50)).toBe(MIN_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(9999)).toBe(MAX_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(300)).toBe(300);
  });

  it("NaN は既定へ戻す", () => {
    expect(clampSidebarWidth(Number.NaN)).toBe(DEFAULT_SIDEBAR_WIDTH);
  });

  it("保存して読み直せる", () => {
    storeSidebarWidth(320);
    expect(readSidebarWidth()).toBe(320);
  });

  it("壊れた保存値でも既定へ落ちる", () => {
    localStorage.setItem("stockanalyzer.sidebarWidth", "not-a-number");
    expect(readSidebarWidth()).toBe(DEFAULT_SIDEBAR_WIDTH);
  });
});

// ---------------------------------------------------------------- アーカイブ

describe("periodLabelOf", () => {
  it("保存された四半期ラベルがあればそれを使う", () => {
    expect(periodLabelOf(entry({ ticker: "AAPL", periodLabel: "FY2026 Q3" }))).toBe(
      "FY2026 Q3",
    );
  });

  it("無ければ保存日時から組み立てる", () => {
    // 2026-08-02 → Q3
    const ms = new Date(2026, 7, 2).getTime();
    expect(periodLabelOf(entry({ ticker: "AAPL", savedAtMs: ms }))).toBe("FY2026 Q3");
  });

  it("空文字のラベルは無いものとして扱う", () => {
    const ms = new Date(2026, 0, 15).getTime();
    expect(periodLabelOf(entry({ ticker: "AAPL", periodLabel: "  ", savedAtMs: ms }))).toBe(
      "FY2026 Q1",
    );
  });
});

describe("groupByTicker", () => {
  it("銘柄ごとにまとめ、新しい順に並べる", () => {
    const grouped = groupByTicker([
      entry({ ticker: "AAPL", savedAtMs: 100 }),
      entry({ ticker: "AAPL", savedAtMs: 300 }),
      entry({ ticker: "AAPL", savedAtMs: 200 }),
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].entries.map((e) => e.savedAtMs)).toEqual([300, 200, 100]);
    expect(grouped[0].latestAtMs).toBe(300);
  });

  it("**直近の実行が新しい銘柄を上に出す**", () => {
    const grouped = groupByTicker([
      entry({ ticker: "AAPL", savedAtMs: 100 }),
      entry({ ticker: "NVDA", savedAtMs: 500 }),
      entry({ ticker: "MSFT", savedAtMs: 300 }),
    ]);
    expect(grouped.map((g) => g.ticker)).toEqual(["NVDA", "MSFT", "AAPL"]);
  });

  it("大文字小文字違いは同じ銘柄としてまとめる", () => {
    const grouped = groupByTicker([
      entry({ ticker: "aapl", savedAtMs: 100 }),
      entry({ ticker: "AAPL", savedAtMs: 200 }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].ticker).toBe("AAPL");
  });

  it("直近と 1 つ前のスコア差を出す", () => {
    const grouped = groupByTicker([
      entry({ ticker: "AAPL", savedAtMs: 100, averageScore: 3.4 }),
      entry({ ticker: "AAPL", savedAtMs: 200, averageScore: 4.1 }),
    ]);
    expect(grouped[0].latestScore).toBe(4.1);
    expect(grouped[0].scoreDelta).toBe(0.7);
  });

  it("比較対象が無い / スコアが無い場合は差を出さない", () => {
    const single = groupByTicker([
      entry({ ticker: "AAPL", savedAtMs: 100, averageScore: 4 }),
    ]);
    expect(single[0].scoreDelta).toBeNull();

    const noScore = groupByTicker([
      entry({ ticker: "AAPL", savedAtMs: 100, averageScore: null }),
      entry({ ticker: "AAPL", savedAtMs: 200, averageScore: 4 }),
    ]);
    expect(noScore[0].scoreDelta).toBeNull();
  });

  it("空のティッカーは無視する", () => {
    expect(groupByTicker([entry({ ticker: "   ", savedAtMs: 1 })])).toEqual([]);
  });

  it("履歴が空でも落ちない", () => {
    expect(groupByTicker([])).toEqual([]);
  });
});

describe("archivesFor（リストの中身）", () => {
  const archives = groupByTicker([
    entry({ ticker: "AAPL", savedAtMs: 100, averageScore: 4 }),
    entry({ ticker: "NVDA", savedAtMs: 500, averageScore: 3 }),
  ]);

  it("**リストの並び順を保つ**（分析済みかで順番が変わらない）", () => {
    const rows = archivesFor(archives, ["NVDA", "MSFT", "AAPL"]);
    expect(rows.map((r) => r.ticker)).toEqual(["NVDA", "MSFT", "AAPL"]);
  });

  it("未分析の銘柄も空の枠として返す（リストから消えない）", () => {
    const rows = archivesFor(archives, ["MSFT"]);
    expect(rows[0].entries).toEqual([]);
    expect(rows[0].latestScore).toBeNull();
    expect(rows[0].latestAtMs).toBe(0);
  });

  it("大文字小文字が違っても引ける", () => {
    expect(archivesFor(archives, ["aapl"])[0].entries).toHaveLength(1);
  });

  it("空のリストなら空を返す", () => {
    expect(archivesFor(archives, [])).toEqual([]);
  });
});

describe("deltaLabel", () => {
  it("上昇は ▲、下落は ▼ で表す", () => {
    expect(deltaLabel(0.7)).toBe("▲ +0.7");
    expect(deltaLabel(-1.2)).toBe("▼ -1.2");
  });

  it("変化なし・不明のときは何も出さない", () => {
    expect(deltaLabel(0)).toBe("");
    expect(deltaLabel(null)).toBe("");
  });
});
