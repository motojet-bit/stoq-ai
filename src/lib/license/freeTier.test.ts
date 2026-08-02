import { beforeAll, describe, expect, it } from "vitest";
import {
  evaluateAccess,
  FREE_TICKER_LIMIT,
  normalizeTicker,
  registerTicker,
  remainingLabel,
  TRIAL_DAYS,
  trialLabel,
  uniqueTickers,
} from "@/lib/license/freeTier";
import { keptOnLock, lockBody, lockHint, lockTitle } from "@/lib/license/lockMessages";
import { setLocale } from "@/lib/i18n/i18n";

// 文面は日本語で検証する（既定は英語なので明示的に切り替える）
beforeAll(() => setLocale("ja"));

const free = (usedTickers: string[], ticker: string, trialExpired = false) =>
  evaluateAccess({ activated: false, usedTickers, ticker, trialExpired });

const licensed = (usedTickers: string[], ticker: string, trialExpired = false) =>
  evaluateAccess({ activated: true, usedTickers, ticker, trialExpired });

const many = (count: number) =>
  Array.from({ length: count }, (_, i) => `T${i + 1}`);

describe("制限の定義", () => {
  it("**無料体験は 10 銘柄・21 日**", () => {
    expect(FREE_TICKER_LIMIT).toBe(10);
    expect(TRIAL_DAYS).toBe(21);
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

describe("銘柄数の制限", () => {
  it("10 銘柄目までは通る", () => {
    expect(free([], "AAPL").allowed).toBe(true);
    expect(free(many(9), "NEW").allowed).toBe(true);
  });

  it("**11 銘柄目で止まる**", () => {
    const result = free(many(10), "GOOGL");
    expect(result.allowed).toBe(false);
    expect(result.limitReached).toBe(true);
    expect(result.reason).toBe("tickerLimit");
    expect(result.remaining).toBe(0);
  });

  it("**すでに分析した銘柄は上限に達していても通る**", () => {
    const used = many(10);
    const result = free(used, used[0]);
    expect(result.allowed).toBe(true);
    expect(result.isNew).toBe(false);
    expect(result.reason).toBe("none");
  });

  it("大文字小文字が違っても同じ銘柄として扱う", () => {
    expect(free(["AAPL", ...many(9)], "aapl").allowed).toBe(true);
  });

  it("残り枠を返す", () => {
    expect(free([], "AAPL").remaining).toBe(10);
    expect(free(many(4), "NEW").remaining).toBe(6);
    expect(free(many(10), "NEW").remaining).toBe(0);
  });

  it("保存値が重複していても正しく数える", () => {
    expect(free(["AAPL", "AAPL", "NVDA"], "MSFT").remaining).toBe(8);
  });
});

describe("体験期間の制限", () => {
  it("期間内なら通る", () => {
    expect(free([], "AAPL", false).allowed).toBe(true);
  });

  it("**期限が切れると新規銘柄は止まる**", () => {
    const result = free([], "AAPL", true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("trialExpired");
    expect(result.limitReached).toBe(true);
  });

  it("**期限が切れても既存銘柄の再分析は通る**", () => {
    const result = free(["AAPL"], "AAPL", true);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("none");
  });

  it("枠が余っていても期限切れが優先される", () => {
    // 「あと 10 銘柄使えます」と誤解させない
    const result = free([], "AAPL", true);
    expect(result.remaining).toBe(10);
    expect(result.reason).toBe("trialExpired");
  });

  it("枠も期限も尽きていれば期限切れとして伝える", () => {
    expect(free(many(10), "NEW", true).reason).toBe("trialExpired");
  });
});

describe("ライセンスによる解錠", () => {
  it("**期限切れでも即座に通る**", () => {
    const result = licensed(many(30), "GOOGL", true);
    expect(result.allowed).toBe(true);
    expect(result.limitReached).toBe(false);
    expect(result.reason).toBe("none");
  });

  it("残り枠は無制限（null）になる", () => {
    expect(licensed(many(10), "GOOGL", true).remaining).toBeNull();
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
    const full = many(10);
    expect(registerTicker(full, "GOOGL")).toEqual(full);
  });

  it("10 銘柄目までは積める", () => {
    expect(registerTicker(many(9), "TENTH")).toHaveLength(10);
  });

  it("空のティッカーは無視する", () => {
    expect(registerTicker(["AAPL"], "  ")).toEqual(["AAPL"]);
  });
});

describe("案内文", () => {
  it("残り枠を伝える", () => {
    expect(remainingLabel(free([], "AAPL"))).toContain("あと 10 銘柄");
    expect(remainingLabel(free(many(9), "NEW"))).toContain("あと 1 銘柄");
  });

  it("使い切ったことを伝える", () => {
    expect(remainingLabel(free(many(10), "NEW"))).toBe("無料版の分析枠を使い切りました");
  });

  it("期限切れは枠ではなく期間の話として伝える", () => {
    expect(remainingLabel(free([], "NEW", true))).toBe("無料体験期間が終了しました");
  });

  it("ライセンスが有効なら何も出さない", () => {
    expect(remainingLabel(licensed([], "AAPL"))).toBe("");
  });

  it("体験期間の残りを伝える", () => {
    expect(trialLabel(5, false)).toBe("無料体験はあと 5 日です");
    expect(trialLabel(0, false)).toBe("");
    expect(trialLabel(5, true)).toBe("");
  });
});

describe("ロック時の文面", () => {
  it("**期限切れは指定どおりの文面になる**", () => {
    expect(lockTitle("trialExpired")).toBe("⏳ 3週間の無料体験期間が終了しました");
    expect(lockBody("trialExpired")).toContain("3週間の無料体験期間が終了しました");
    expect(lockBody("trialExpired")).toContain("ライセンスキーを入力してください");
  });

  it("銘柄上限は枠の話として書く", () => {
    expect(lockTitle("tickerLimit")).toContain("10銘柄");
    expect(lockBody("tickerLimit")).toContain("11 銘柄目");
  });

  it("ボタンのホバー文も理由ごとに分かれる", () => {
    expect(lockHint("trialExpired")).toContain("3週間");
    expect(lockHint("tickerLimit")).toContain("10銘柄");
  });

  it("**止まらないもの**を明示する（もう何も見られないと誤解させない）", () => {
    expect(keptOnLock().length).toBeGreaterThanOrEqual(3);
    expect(keptOnLock().join("")).toContain("閲覧");
    expect(keptOnLock().join("")).toContain("再分析");
  });
});

describe("使用の流れ（通し）", () => {
  it("10 銘柄使い、11 銘柄目で止まり、認証すると通る", () => {
    let used: string[] = [];

    for (const ticker of many(10)) {
      expect(evaluateAccess({ activated: false, usedTickers: used, ticker }).allowed).toBe(
        true,
      );
      used = registerTicker(used, ticker);
    }
    expect(used).toHaveLength(10);

    expect(
      evaluateAccess({ activated: false, usedTickers: used, ticker: "EXTRA" }).allowed,
    ).toBe(false);

    // 既存の銘柄は通り続ける
    for (const ticker of used) {
      expect(evaluateAccess({ activated: false, usedTickers: used, ticker }).allowed).toBe(
        true,
      );
    }

    // ライセンスで即座に解錠、使用済みの記録も残ったまま
    const unlocked = evaluateAccess({
      activated: true,
      usedTickers: used,
      ticker: "EXTRA",
      trialExpired: true,
    });
    expect(unlocked.allowed).toBe(true);
    expect(used).toHaveLength(10);
  });

  it("期限切れ後にライセンスを入れると、その場で新規銘柄が通る", () => {
    const used = ["AAPL"];
    expect(free(used, "NEW", true).allowed).toBe(false);
    expect(licensed(used, "NEW", true).allowed).toBe(true);
  });
});
