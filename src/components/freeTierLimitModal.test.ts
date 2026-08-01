import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FREE_TICKER_LIMIT } from "@/lib/license/freeTier";

/**
 * 無料版の上限モーダルと、**提携（アフィリエイト）導線が残っていないこと**。
 *
 * DOM を描画するテスト環境を入れていないので、表記と組み方をソースで確かめる。
 * 一度消した導線がコピペで戻ってくるのを、ここで止める。
 */
const MODAL = readFileSync(
  join(process.cwd(), "src/components/FreeTierLimitModal.tsx"),
  "utf-8",
);

/** `src/` 配下のソースを全部読む（テスト自身は除く）。 */
function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }
    if (!/\.(ts|tsx|json)$/.test(name)) continue;
    if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) continue;
    found.push(path);
  }
  return found;
}

describe("提携導線を持たない", () => {
  const files = sourceFiles(join(process.cwd(), "src"));

  it("**アプリのどこにも提携・紹介の文言が無い**", () => {
    // 構想を破棄したので、表示・コメントを問わず残さない
    const forbidden = ["IBKR", "アフィリエイト", "affiliate", "紹介プログラム", "口座開設"];

    const offenders: string[] = [];
    for (const path of files) {
      const text = readFileSync(path, "utf-8");
      for (const word of forbidden) {
        if (text.includes(word)) offenders.push(`${path} に「${word}」`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("上限モーダルから「無料でライセンスを取得」の導線が消えている", () => {
    expect(MODAL).not.toContain("無料でライセンスを取得");
    expect(MODAL).not.toContain("🎁");
    // 導線を開くための受け口ごと消す（残すと呼び出し側で復活する）
    expect(MODAL).not.toContain("onOpenGuide");
  });

  it("呼び出し側にも受け渡しが残っていない", () => {
    const app = readFileSync(join(process.cwd(), "src/App.tsx"), "utf-8");
    expect(app).not.toContain("onOpenGuide");
  });

  it("読み込めるソースがある（走査が空振りしていない）", () => {
    // 走査に失敗して「違反ゼロ」になるのを防ぐ
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((p) => p.endsWith("App.tsx"))).toBe(true);
  });
});

describe("上限モーダルの中身", () => {
  it("指定どおりのタイトルを上限値から組み立てている", () => {
    expect(MODAL).toContain("🔒 無料版の分析上限（");
    expect(MODAL).toContain("FREE_TICKER_LIMIT");
    // 「3」を直書きしていない（上限を変えたら文面も追従する）
    expect(MODAL).not.toContain("上限（3銘柄）");
    expect(FREE_TICKER_LIMIT).toBe(3);
  });

  it("残る導線は「あとで」と「ライセンスキーを入力」の 2 つ", () => {
    expect(MODAL).toContain("あとで");
    expect(MODAL).toContain("ライセンスキーを入力");
    expect(MODAL).toContain("onOpenLicense");
  });

  it("**既存銘柄は使い続けられる**ことを伝えている", () => {
    // 「上限です」だけだと、既存銘柄まで止まったのかが分からず不安になる
    expect(MODAL).toContain("再分析");
    expect(MODAL).toContain("制限がかかるのは新しい銘柄だけ");
  });

  it("分析済みの銘柄を列挙している", () => {
    expect(MODAL).toContain("useUsedTickers");
    expect(MODAL).toContain("分析済みの銘柄");
  });
});
