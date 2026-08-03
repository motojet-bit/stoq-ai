import { describe, expect, it } from "vitest";
import {
  checkTickerMatch,
  detectDocumentIdentity,
  detectMismatchSignal,
  MISMATCH_MARKER,
  normalizeName,
} from "@/lib/parser/tickerMatch";

describe("資料からの身元の読み取り", () => {
  it("取引所つきの表記を拾う", () => {
    const id = detectDocumentIdentity("Apple Inc. (NASDAQ: AAPL) Q3 2026 Results");
    expect(id.tickers).toContain("AAPL");
    expect(id.companyNames.some((n) => n.includes("Apple"))).toBe(true);
  });

  it("Ticker: 表記も拾う", () => {
    expect(detectDocumentIdentity("Ticker: TSLA").tickers).toContain("TSLA");
  });

  it("日本語の証券コードを拾う", () => {
    expect(detectDocumentIdentity("証券コード: 7203 トヨタ自動車株式会社").tickers).toContain(
      "7203",
    );
  });

  it("**裸の大文字は拾わない**（EPS や FCF を識別子と取り違えない）", () => {
    const id = detectDocumentIdentity("EPS FCF USD ROIC の推移について");
    expect(id.tickers).toEqual([]);
  });

  it("ファイル名も手がかりにする（表紙がロゴだけの資料がある）", () => {
    expect(detectDocumentIdentity("", "NASDAQ: NVDA Q2.pdf").tickers).toContain("NVDA");
  });

  it("**先頭寄りだけを見る**（本文中の競合他社を発行元と取り違えない）", () => {
    const text = "Tesla, Inc. (NASDAQ: TSLA)" + "x".repeat(4000) + "(NASDAQ: AAPL)";
    expect(detectDocumentIdentity(text).tickers).toEqual(["TSLA"]);
  });
});

describe("選択中の銘柄との突き合わせ", () => {
  const id = (text: string) => detectDocumentIdentity(text);

  it("一致すれば match", () => {
    expect(
      checkTickerMatch({ selected: "AAPL", identity: id("(NASDAQ: AAPL)") }).status,
    ).toBe("match");
  });

  it("**別会社なら mismatch**（見つかったティッカーも返す）", () => {
    const result = checkTickerMatch({ selected: "TSLA", identity: id("Apple Inc. (NASDAQ: AAPL)") });
    expect(result.status).toBe("mismatch");
    expect(result.foundTicker).toBe("AAPL");
    expect(result.foundName).toContain("Apple");
  });

  it("接尾辞つきのティッカーも本体で比べる（7203.T ↔ 7203）", () => {
    expect(
      checkTickerMatch({ selected: "7203.T", identity: id("証券コード: 7203") }).status,
    ).toBe("match");
  });

  it("ティッカーが無ければ社名で一致を見る", () => {
    const result = checkTickerMatch({
      selected: "AAPL",
      selectedName: "Apple Inc.",
      identity: id("Apple Inc. Third Quarter Results"),
    });
    expect(result.status).toBe("match");
  });

  it("**手がかりが無ければ unknown**（分からないだけで弾かない）", () => {
    expect(checkTickerMatch({ selected: "AAPL", identity: id("決算説明資料") }).status).toBe(
      "unknown",
    );
  });

  it("**社名が違うだけでは mismatch にしない**（子会社名やブランド名が先に出る資料がある）", () => {
    const result = checkTickerMatch({
      selected: "GOOG",
      selectedName: "Alphabet Inc.",
      identity: id("YouTube LLC の業績について"),
    });
    expect(result.status).toBe("unknown");
  });

  it("ティッカーが空なら判定しない", () => {
    expect(checkTickerMatch({ selected: "  ", identity: id("(NASDAQ: AAPL)") }).status).toBe(
      "unknown",
    );
  });
});

describe("社名の均し", () => {
  it("法人格の接尾辞と記号を落とす", () => {
    expect(normalizeName("Apple Inc.")).toBe("apple");
    expect(normalizeName("Tesla, Inc.")).toBe("tesla");
    expect(normalizeName("トヨタ自動車株式会社")).toBe("トヨタ自動車");
  });
});

describe("実行時の不一致の合図", () => {
  it("冒頭の合図を拾い、対象企業名を返す", () => {
    expect(detectMismatchSignal(`${MISMATCH_MARKER}: Apple Inc.`)).toBe("Apple Inc.");
  });

  it("合図が無ければ null", () => {
    expect(detectMismatchSignal("| 1 | 事業モデル | 4 | 良好 | 根拠 |")).toBeNull();
  });

  it("**本文の途中に出てくる同じ語では止めない**（注意書きの引用で誤爆しない）", () => {
    const body = "x".repeat(300) + MISMATCH_MARKER;
    expect(detectMismatchSignal(body)).toBeNull();
  });

  it("企業名が付いていなくても合図として扱う", () => {
    expect(detectMismatchSignal(MISMATCH_MARKER)).toBe("");
  });
});
