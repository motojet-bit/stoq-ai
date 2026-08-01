import { describe, expect, it } from "vitest";
import {
  evaluateAccess,
  FREE_TICKER_LIMIT,
  normalizeTicker,
  registerTicker,
  remainingLabel,
  uniqueTickers,
} from "@/lib/license/freeTier";

const free = (usedTickers: string[], ticker: string) =>
  evaluateAccess({ activated: false, usedTickers, ticker });

const licensed = (usedTickers: string[], ticker: string) =>
  evaluateAccess({ activated: true, usedTickers, ticker });

describe("上限の定義", () => {
  it("無料版は 3 銘柄まで", () => {
    expect(FREE_TICKER_LIMIT).toBe(3);
  });
});

describe("normalizeTicker / uniqueTickers", () => {
  it("大文字に揃え、前後の空白を落とす", () => {
    expect(normalizeTicker("  aapl ")).toBe("AAPL");
  });

  it("重複と空を落として順序を保つ", () => {
    expect(uniqueTickers(["AAPL", "aapl", " ", "NVDA", "AAPL"])).toEqual([
      "AAPL",
      "NVDA",
    ]);
  });
});

describe("無料版（未認証）の判定", () => {
  it("1 銘柄目から 3 銘柄目までは通る", () => {
    expect(free([], "AAPL").allowed).toBe(true);
    expect(free(["AAPL"], "NVDA").allowed).toBe(true);
    expect(free(["AAPL", "NVDA"], "MSFT").allowed).toBe(true);
  });

  it("**4 銘柄目で止まる**", () => {
    const result = free(["AAPL", "NVDA", "MSFT"], "GOOGL");
    expect(result.allowed).toBe(false);
    expect(result.limitReached).toBe(true);
    expect(result.isNew).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("**すでに分析した銘柄は上限に達していても通る**（再分析は無制限）", () => {
    const result = free(["AAPL", "NVDA", "MSFT"], "AAPL");
    expect(result.allowed).toBe(true);
    expect(result.limitReached).toBe(false);
    expect(result.isNew).toBe(false);
  });

  it("大文字小文字が違っても同じ銘柄として扱う", () => {
    expect(free(["AAPL", "NVDA", "MSFT"], "aapl").allowed).toBe(true);
    expect(free(["aapl", "nvda", "msft"], "AAPL").allowed).toBe(true);
  });

  it("残り枠を返す", () => {
    expect(free([], "AAPL").remaining).toBe(3);
    expect(free(["AAPL"], "NVDA").remaining).toBe(2);
    expect(free(["AAPL", "NVDA"], "MSFT").remaining).toBe(1);
    expect(free(["AAPL", "NVDA", "MSFT"], "GOOGL").remaining).toBe(0);
  });

  it("保存値が重複していても正しく数える", () => {
    // 同じ銘柄が二重に入っていても 1 枠として数える
    const result = free(["AAPL", "AAPL", "NVDA"], "MSFT");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("空のティッカーは新規扱いにしない", () => {
    expect(free(["AAPL", "NVDA", "MSFT"], "   ").isNew).toBe(false);
  });
});

describe("ライセンス有効化による解除", () => {
  it("**上限に達していても即座に通る**", () => {
    const result = licensed(["AAPL", "NVDA", "MSFT"], "GOOGL");
    expect(result.allowed).toBe(true);
    expect(result.limitReached).toBe(false);
  });

  it("残り枠は無制限（null）になる", () => {
    expect(licensed(["AAPL", "NVDA", "MSFT"], "GOOGL").remaining).toBeNull();
  });

  it("何銘柄使っていても通る", () => {
    const many = ["A", "B", "C", "D", "E", "F", "G"];
    expect(licensed(many, "H").allowed).toBe(true);
  });
});

describe("registerTicker", () => {
  it("新しい銘柄を末尾に足す", () => {
    expect(registerTicker(["AAPL"], "nvda")).toEqual(["AAPL", "NVDA"]);
  });

  it("すでにある銘柄は増やさない", () => {
    expect(registerTicker(["AAPL", "NVDA"], "aapl")).toEqual(["AAPL", "NVDA"]);
  });

  it("**上限を超えて積まない**（解除後に身に覚えのない銘柄が並ばない）", () => {
    const full = ["AAPL", "NVDA", "MSFT"];
    expect(registerTicker(full, "GOOGL")).toEqual(full);
    expect(registerTicker(registerTicker(full, "GOOGL"), "AMZN")).toEqual(full);
  });

  it("空のティッカーは無視する", () => {
    expect(registerTicker(["AAPL"], "  ")).toEqual(["AAPL"]);
  });

  it("保存値の重複はここで整理される", () => {
    expect(registerTicker(["AAPL", "aapl"], "NVDA")).toEqual(["AAPL", "NVDA"]);
  });
});

describe("remainingLabel", () => {
  it("残り枠を伝える", () => {
    expect(remainingLabel(free([], "AAPL"))).toContain("あと 3 銘柄");
    expect(remainingLabel(free(["AAPL", "NVDA"], "MSFT"))).toContain("あと 1 銘柄");
  });

  it("使い切ったことを伝える", () => {
    expect(remainingLabel(free(["A", "B", "C"], "D"))).toBe(
      "無料版の分析枠を使い切りました",
    );
  });

  it("ライセンスが有効なら何も出さない", () => {
    expect(remainingLabel(licensed([], "AAPL"))).toBe("");
  });
});

describe("使用の流れ（通し）", () => {
  it("3 銘柄使って 4 銘柄目で止まり、認証すると通る", () => {
    let used: string[] = [];

    for (const ticker of ["AAPL", "NVDA", "MSFT"]) {
      const check = evaluateAccess({ activated: false, usedTickers: used, ticker });
      expect(check.allowed, `${ticker} は通るはず`).toBe(true);
      used = registerTicker(used, ticker);
    }
    expect(used).toEqual(["AAPL", "NVDA", "MSFT"]);

    // 4 銘柄目は止まる
    const blocked = evaluateAccess({
      activated: false,
      usedTickers: used,
      ticker: "GOOGL",
    });
    expect(blocked.allowed).toBe(false);

    // 既存の 3 銘柄は通り続ける
    for (const ticker of used) {
      expect(
        evaluateAccess({ activated: false, usedTickers: used, ticker }).allowed,
      ).toBe(true);
    }

    // ライセンスを入れると即座に通る
    expect(
      evaluateAccess({ activated: true, usedTickers: used, ticker: "GOOGL" }).allowed,
    ).toBe(true);
  });
});
