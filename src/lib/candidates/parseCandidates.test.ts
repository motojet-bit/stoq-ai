import { beforeAll, describe, expect, it } from "vitest";
import { parseCandidates } from "@/lib/candidates/parseCandidates";
import { setLocale } from "@/lib/i18n/i18n";

// 文面は日本語で検証する（既定は英語なので明示的に切り替える）
beforeAll(() => setLocale("ja"));

describe("parseCandidates（正常系）", () => {
  it("複数行をティッカー・社名・ジャンルに分解する", () => {
    const { items, errors } = parseCandidates("AAPL|Apple|Phone\nNVDA|NVIDIA|AI Chip");

    expect(errors).toEqual([]);
    expect(items).toEqual([
      { ticker: "AAPL", name: "Apple", genre: "Phone" },
      { ticker: "NVDA", name: "NVIDIA", genre: "AI Chip" },
    ]);
  });

  it("前後の空白（全角スペース含む）を落とす", () => {
    const { items } = parseCandidates("  aapl 　|  Apple Inc. 　| 　Phone  ");
    expect(items).toEqual([{ ticker: "AAPL", name: "Apple Inc.", genre: "Phone" }]);
  });

  it("社名の途中の空白は残す", () => {
    const { items } = parseCandidates("BRK.B|Berkshire Hathaway|Conglomerate");
    expect(items[0].name).toBe("Berkshire Hathaway");
    expect(items[0].ticker).toBe("BRK.B");
  });

  it("全角パイプでも区切れる", () => {
    const { items, errors } = parseCandidates("7203.T｜トヨタ自動車｜自動車");
    expect(errors).toEqual([]);
    expect(items).toEqual([
      { ticker: "7203.T", name: "トヨタ自動車", genre: "自動車" },
    ]);
  });

  it("ジャンルや社名が無くても取り込める", () => {
    const { items, errors } = parseCandidates("MSFT|Microsoft\nGOOGL");
    expect(errors).toEqual([]);
    expect(items).toEqual([
      { ticker: "MSFT", name: "Microsoft", genre: "" },
      { ticker: "GOOGL", name: "", genre: "" },
    ]);
  });

  it("空行と # のメモ行は無視する", () => {
    const { items, errors } = parseCandidates(
      "# 半導体まわり\n\nNVDA|NVIDIA|AI Chip\n   \nAMD|AMD|CPU\n",
    );
    expect(errors).toEqual([]);
    expect(items.map((i) => i.ticker)).toEqual(["NVDA", "AMD"]);
  });

  it("CRLF の貼り付けでも壊れない", () => {
    const { items } = parseCandidates("AAPL|Apple|Phone\r\nNVDA|NVIDIA|AI Chip\r\n");
    expect(items.map((i) => i.ticker)).toEqual(["AAPL", "NVDA"]);
  });

  it("空文字なら何も返さない", () => {
    expect(parseCandidates("")).toEqual({ items: [], errors: [], duplicates: [] });
    expect(parseCandidates("   \n\n  ").items).toEqual([]);
  });
});

describe("parseCandidates（ティッカーだけの羅列）", () => {
  it("改行区切りのティッカーだけでも社名省略で取り込める", () => {
    const { items, errors } = parseCandidates("AAPL\nNVDA\nMSFT");

    expect(errors).toEqual([]);
    expect(items).toEqual([
      { ticker: "AAPL", name: "", genre: "" },
      { ticker: "NVDA", name: "", genre: "" },
      { ticker: "MSFT", name: "", genre: "" },
    ]);
  });

  it("カンマ・読点・タブ区切りの羅列も 1 行で取り込める", () => {
    expect(parseCandidates("AAPL, NVDA,MSFT").items.map((i) => i.ticker)).toEqual([
      "AAPL",
      "NVDA",
      "MSFT",
    ]);
    expect(parseCandidates("AAPL\tNVDA").items.map((i) => i.ticker)).toEqual([
      "AAPL",
      "NVDA",
    ]);
    expect(parseCandidates("AAPL、NVDA").items.map((i) => i.ticker)).toEqual([
      "AAPL",
      "NVDA",
    ]);
  });

  it("羅列とパイプ区切りが混ざっていても両方取り込む", () => {
    const { items, errors } = parseCandidates("AAPL\nNVDA|NVIDIA|AI Chip\nMSFT");

    expect(errors).toEqual([]);
    expect(items).toEqual([
      { ticker: "AAPL", name: "", genre: "" },
      { ticker: "NVDA", name: "NVIDIA", genre: "AI Chip" },
      { ticker: "MSFT", name: "", genre: "" },
    ]);
  });

  it("羅列でも重複はまとめる", () => {
    const { items, duplicates } = parseCandidates("AAPL\nNVDA\naapl");
    expect(items.map((i) => i.ticker)).toEqual(["AAPL", "NVDA"]);
    expect(duplicates).toEqual(["AAPL"]);
  });

  it("パイプ無しでも不正なティッカーはエラーになる", () => {
    const { items, errors } = parseCandidates("アップル\nNVDA");
    expect(items.map((i) => i.ticker)).toEqual(["NVDA"]);
    expect(errors).toHaveLength(1);
  });
});

describe("parseCandidates（エラー検知）", () => {
  it("ティッカーが空の行を弾く", () => {
    const { items, errors } = parseCandidates("|Apple|Phone\nNVDA|NVIDIA|AI Chip");

    expect(items.map((i) => i.ticker)).toEqual(["NVDA"]);
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(1);
    expect(errors[0].reason).toContain("ティッカーが空");
  });

  it("項目が 4 つ以上ある行を弾く", () => {
    const { items, errors } = parseCandidates("AAPL|Apple|Phone|余計|さらに余計");
    expect(items).toEqual([]);
    expect(errors[0].reason).toContain("項目が多すぎます");
  });

  it("ティッカーに使えない文字を弾く", () => {
    const { items, errors } = parseCandidates("アップル|Apple|Phone\nNVDA|NVIDIA|AI");
    expect(items.map((i) => i.ticker)).toEqual(["NVDA"]);
    expect(errors[0].reason).toContain("ティッカーとして扱えません");
  });

  it("長すぎるティッカーを弾く", () => {
    const { errors } = parseCandidates("ABCDEFGHIJKLMNOPQ|長すぎ|X");
    expect(errors).toHaveLength(1);
  });

  it("エラー行の行番号と原文を保持する（どこを直せばよいか分かる）", () => {
    const { errors } = parseCandidates("AAPL|Apple|Phone\n\n|社名だけ|X");
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(3);
    expect(errors[0].text).toBe("|社名だけ|X");
  });

  it("エラーがあっても正常な行は取り込む", () => {
    const { items, errors } = parseCandidates("AAPL|Apple|Phone\n???\nNVDA|NVIDIA|AI");
    expect(items).toHaveLength(2);
    expect(errors).toHaveLength(1);
  });
});

describe("parseCandidates（重複）", () => {
  it("同じティッカーは 1 件にまとめ、後の行を採用する", () => {
    const { items, duplicates } = parseCandidates("AAPL|Apple|Phone\nAAPL|Apple Inc.|Consumer");

    expect(items).toEqual([{ ticker: "AAPL", name: "Apple Inc.", genre: "Consumer" }]);
    expect(duplicates).toEqual(["AAPL"]);
  });

  it("大文字小文字違いも同じ銘柄として扱う", () => {
    const { items, duplicates } = parseCandidates("aapl|Apple|Phone\nAAPL|Apple Inc.|Consumer");
    expect(items).toHaveLength(1);
    expect(duplicates).toEqual(["AAPL"]);
  });

  it("重複が無ければ duplicates は空", () => {
    const { duplicates } = parseCandidates("AAPL|Apple|Phone\nNVDA|NVIDIA|AI");
    expect(duplicates).toEqual([]);
  });

  it("並び順は最初に現れた位置を保つ", () => {
    const { items } = parseCandidates("AAPL|Apple|Phone\nNVDA|NVIDIA|AI\nAAPL|Apple Inc.|X");
    expect(items.map((i) => i.ticker)).toEqual(["AAPL", "NVDA"]);
  });
});
