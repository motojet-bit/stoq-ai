import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES } from "@/lib/i18n/locales";

/**
 * 辞書化が済んだファイルに、日本語が**戻ってこない**ようにする。
 *
 * 一度 `t()` へ置き換えても、あとから機能を足すときに日本語を直書きすると
 * 静かに戻ってしまう。ここに並べたファイルは「辞書化済み」の宣言であり、
 * 日本語リテラルが 1 つでもあれば落ちる。
 *
 * **新しく辞書化したファイルは、このリストへ足すこと。**
 */
const LOCALIZED = [
  "src/components/SettingsModal.tsx",
  "src/components/CloudSyncSettings.tsx",
  "src/components/WelcomeTour.tsx",
];

const CJK = /[぀-ヿ一-鿿]/;

/** コメントを空白に潰す。文字列の中の `//` は残す。 */
function stripComments(text: string): string {
  let out = "";
  let i = 0;
  let state: "code" | "line" | "block" | "str" = "code";
  let quote = "";

  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1] ?? "";

    if (state === "code") {
      if (c === "/" && next === "/") {
        state = "line";
        i += 2;
        continue;
      }
      if (c === "/" && next === "*") {
        state = "block";
        i += 2;
        continue;
      }
      if (c === "'" || c === '"' || c === "`") {
        state = "str";
        quote = c;
      }
      out += c;
      i += 1;
      continue;
    }

    if (state === "line") {
      if (c === "\n") {
        state = "code";
        out += c;
      }
      i += 1;
      continue;
    }

    if (state === "block") {
      if (c === "*" && next === "/") {
        state = "code";
        i += 2;
        continue;
      }
      if (c === "\n") out += c;
      i += 1;
      continue;
    }

    // 文字列の中
    if (c === "\\") {
      out += text.slice(i, i + 2);
      i += 2;
      continue;
    }
    out += c;
    if (c === quote) state = "code";
    i += 1;
  }

  return out;
}

/** 日本語を含む文字列リテラルと JSX テキストを拾う。 */
function japaneseLiterals(source: string): string[] {
  const code = stripComments(source);
  const found: string[] = [];

  const literal = /(['"])((?:\\.|(?!\1)[^\\])*)\1|`((?:\\.|[^\\`])*)`/gs;
  for (const m of code.matchAll(literal)) {
    const value = m[2] ?? m[3] ?? "";
    if (CJK.test(value)) found.push(value.trim());
  }

  for (const m of code.matchAll(/>([^<>{}]*)</g)) {
    if (CJK.test(m[1])) found.push(m[1].trim());
  }

  return found;
}

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf-8");

describe("既定言語", () => {
  it("**英語が原文（Source of Truth）**", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    // 原文の言語が登録簿にあること
    expect(LOCALES.map((l) => l.code)).toContain(DEFAULT_LOCALE);
  });
});

describe("辞書化が済んだファイル", () => {
  it.each(LOCALIZED)("%s に日本語の直書きが残っていない", (path) => {
    expect(japaneseLiterals(read(path))).toEqual([]);
  });

  it("走査が空振りしていない（検出器が壊れたら気づける）", () => {
    // わざと日本語を含むソースを食わせて、拾えることを確かめる
    const sample = `const a = "日本語"; // コメントは無視\n<div>本文</div>`;
    expect(japaneseLiterals(sample)).toEqual(["日本語", "本文"]);
  });

  it("コメントの日本語は数えない（識別子は英語・コメントは日本語の方針）", () => {
    expect(japaneseLiterals(`// 説明\n/* 補足 */\nconst a = 1;`)).toEqual([]);
  });
});
