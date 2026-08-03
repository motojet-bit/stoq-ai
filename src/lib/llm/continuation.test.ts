import { describe, expect, it } from "vitest";
import { setLocale } from "@/lib/i18n/i18n";
import {
  canContinue,
  continuationPrompt,
  joinContinuation,
  MAX_CONTINUATIONS,
  TAIL_CHARS,
} from "@/lib/llm/continuation";

setLocale("ja");

describe("継続を求める本文", () => {
  it("続きだけを求める指示を含む", () => {
    const text = continuationPrompt("| 1 | A | 4 | 良好 | 根拠 |");
    expect(text).toContain("続きのみ");
    expect(text).toContain("| 1 | A |");
  });

  it("**末尾だけを渡す**（全文を渡すと入力が積み上がり、原因を悪化させる）", () => {
    const long = "x".repeat(TAIL_CHARS * 3);
    expect(continuationPrompt(long).length).toBeLessThan(long.length);
  });
});

describe("続きの結合", () => {
  it("そのままつながる場合はつなぐ", () => {
    expect(joinContinuation("売上は前年比", "18% 増加した。")).toBe("売上は前年比18% 増加した。");
  });

  it("**重なった部分は落とす**（指示しても直前の行を繰り返すことがある）", () => {
    const soFar = "| 1 | 事業モデル | 4 | 良好 | 収益源が明瞭 |\n| 2 | モート | 3 |";
    const next = "| 2 | モート | 3 | 中立 | 規模の経済 |\n| 3 | 成長 | 4 |";
    const joined = joinContinuation(soFar, next);
    expect(joined.match(/\| 2 \| モート/g)).toHaveLength(1);
    expect(joined).toContain("| 3 | 成長 |");
  });

  it("表の行が続く場合は改行でつなぐ", () => {
    const joined = joinContinuation("| 1 | A | 4 | 良好 | 根拠 |", "| 2 | B | 3 | 中立 | 根拠 |");
    expect(joined).toContain("|\n| 2 | B |");
  });

  it("空の追記は何も変えない", () => {
    expect(joinContinuation("本文", "")).toBe("本文");
    expect(joinContinuation("本文", "   ")).toBe("本文");
  });
});

describe("継続の上限", () => {
  it("**無制限にしない**（終わらないモデルだと費用だけが増える）", () => {
    expect(canContinue(0)).toBe(true);
    expect(canContinue(MAX_CONTINUATIONS - 1)).toBe(true);
    expect(canContinue(MAX_CONTINUATIONS)).toBe(false);
  });

  it("上限は 3 回", () => {
    expect(MAX_CONTINUATIONS).toBe(3);
  });
});
